#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  classifyDatabaseName,
  parseDatabaseURL,
  replaceDatabaseName,
} from "./database-target.mjs";

export const DATABASE_INVENTORY_SCHEMA = "plush-database-inventory/v1";
export const DATABASE_INVENTORY_URL_ENV = "LOCAL_DATABASE_ADMIN_URL";

const INVENTORY_SQL = String.raw`
SELECT COALESCE(json_agg(row_to_json(inventory) ORDER BY inventory.name), '[]'::json)
FROM (
  SELECT
    database.datname AS name,
    pg_get_userbyid(database.datdba) AS owner,
    pg_database_size(database.datname)::text AS size_bytes,
    COALESCE(activity.connections, 0)::text AS connections,
    database.datallowconn AS allow_connections
  FROM pg_database AS database
  LEFT JOIN (
    SELECT datname, count(*) AS connections
    FROM pg_stat_activity
    GROUP BY datname
  ) AS activity ON activity.datname = database.datname
  WHERE database.datname LIKE 'plush\_erp%' ESCAPE '\'
) AS inventory;
`;

function sanitizeCommandFailure(result, label) {
  const text = String(result.stderr || result.stdout || result.error?.message || "")
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(/password=[^\s&]+/giu, "password=<redacted>")
    .trim()
    .split("\n")[0];
  throw new Error(`${label}${text ? `: ${text}` : ""}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    sanitizeCommandFailure(result, options.failure || `${command} failed`);
  }
  return String(result.stdout || "").trim();
}

function optionalRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || !new Set([0, 1]).has(result.status)) return [];
  return String(result.stdout || "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function normalizeAtlasMigrationStatus(status) {
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    throw new Error("Atlas migration status is invalid");
  }
  const applied = Array.isArray(status.Applied) ? status.Applied.length : 0;
  const available = Array.isArray(status.Available) ? status.Available.length : 0;
  const pending = Array.isArray(status.Pending) ? status.Pending.length : 0;
  const outOfOrder = Array.isArray(status.OutOfOrder)
    ? status.OutOfOrder.length
    : 0;
  return Object.freeze({
    applied,
    available,
    currentVersion: String(status.Current || ""),
    outOfOrder,
    pending,
    status: String(status.Status || ""),
  });
}

export function recommendDatabaseAction({
  classification,
  connections,
  migration,
  references,
}) {
  const blockers = [];
  if (connections > 0) blockers.push("active_connections");
  if (references.length > 0) blockers.push("repository_references");
  if (!migration || migration.availability !== "available") {
    blockers.push("migration_identity_unavailable");
  } else {
    if (migration.pending > 0) blockers.push("pending_migrations");
    if (migration.outOfOrder > 0) blockers.push("out_of_order_migrations");
  }

  let recommendation = "manual_classification_required";
  if (classification.profile === "development") {
    recommendation = "keep_long_term_development";
  } else if (classification.profile === "legacy-development") {
    recommendation = "review_long_term_cutover";
  } else if (classification.disposable && blockers.length === 0) {
    recommendation = "review_disposable_cleanup";
  } else if (blockers.includes("active_connections")) {
    recommendation = "blocked_active_connections";
  } else if (blockers.includes("repository_references")) {
    recommendation = "review_repository_references";
  } else if (
    blockers.includes("pending_migrations") ||
    blockers.includes("out_of_order_migrations")
  ) {
    recommendation = "review_migration_state";
  }

  return Object.freeze({
    blockers,
    deletionAuthorized: false,
    deletionEligible: false,
    recommendation,
  });
}

export function buildDatabaseInventoryReport({
  databaseRows,
  generatedAt = new Date(),
  migrationByName = {},
  referencesByName = {},
  server,
}) {
  if (!Array.isArray(databaseRows)) {
    throw new Error("database inventory rows must be an array");
  }
  const databases = databaseRows.map((row) => {
    const name = String(row.name || "");
    if (!/^plush_erp[a-z0-9_]*$/u.test(name)) {
      throw new Error("database inventory contains an invalid project name");
    }
    const sizeBytes = Number(row.size_bytes ?? row.sizeBytes);
    const connections = Number(row.connections);
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0 ||
      !Number.isSafeInteger(connections) ||
      connections < 0
    ) {
      throw new Error(`database inventory metrics are invalid for ${name}`);
    }
    const classification = classifyDatabaseName(name);
    const references = [...new Set(referencesByName[name] || [])]
      .filter(
        (reference) =>
          typeof reference === "string" &&
          !path.isAbsolute(reference) &&
          !reference.split("/").includes(".."),
      )
      .sort();
    const migration = migrationByName[name] || {
      availability: "unavailable",
    };
    const action = recommendDatabaseAction({
      classification,
      connections,
      migration,
      references,
    });
    return Object.freeze({
      allowConnections: row.allow_connections !== false,
      connections,
      deletion: Object.freeze({
        authorized: action.deletionAuthorized,
        eligible: action.deletionEligible,
      }),
      evidenceReferences: references,
      lifecycle: Object.freeze({
        disposable: classification.disposable,
        profile: classification.profile,
        runIdentity: classification.runID
          ? `${classification.profile}:${classification.runID}`
          : "",
      }),
      migration,
      name,
      owner: String(row.owner || ""),
      recommendation: action.recommendation,
      blockers: action.blockers,
      sizeBytes,
    });
  });
  const incomplete = databases.some(
    (database) => database.migration.availability !== "available",
  );
  return Object.freeze({
    schemaVersion: DATABASE_INVENTORY_SCHEMA,
    mode: "report-only",
    status: incomplete ? "incomplete" : "complete",
    generatedAt: new Date(generatedAt).toISOString(),
    server,
    summary: Object.freeze({
      databaseCount: databases.length,
      disposableCount: databases.filter(
        (database) => database.lifecycle.disposable,
      ).length,
      activeConnectionCount: databases.reduce(
        (total, database) => total + database.connections,
        0,
      ),
      cleanupReviewCount: databases.filter(
        (database) =>
          database.recommendation === "review_disposable_cleanup",
      ).length,
    }),
    databases,
    notProven: Object.freeze([
      "database deletion authorization",
      "backup restore usability",
      "customer UAT",
    ]),
  });
}

function readDatabaseRows(databaseURL) {
  const output = run(
    "psql",
    [
      databaseURL,
      "-X",
      "--no-psqlrc",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      INVENTORY_SQL,
    ],
    { failure: "database inventory query failed" },
  );
  const parsed = JSON.parse(output || "[]");
  if (!Array.isArray(parsed)) throw new Error("database inventory query is invalid");
  return parsed;
}

function readMigration(databaseURL, serverRoot) {
  try {
    const output = run(
      "atlas",
      [
        "migrate",
        "status",
        "--dir",
        "file://internal/data/model/migrate",
        "--url",
        databaseURL,
        "--format",
        "{{ json . }}",
      ],
      {
        cwd: serverRoot,
        failure: "Atlas migration status failed",
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return {
      availability: "available",
      ...normalizeAtlasMigrationStatus(JSON.parse(output)),
    };
  } catch {
    return { availability: "unavailable" };
  }
}

function findEvidenceReferences(repoRoot, databaseName) {
  return optionalRun(
    "git",
    [
      "-c",
      "core.quotePath=false",
      "grep",
      "-l",
      "-F",
      databaseName,
      "--",
      ".",
      ":(exclude)docs/archive/**",
      ":(exclude)tmp/**",
      ":(exclude)output/**",
    ],
    { cwd: repoRoot },
  ).slice(0, 50);
}

function writeReport(outPath, report) {
  const absolutePath = path.resolve(outPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, absolutePath);
  chmodSync(absolutePath, 0o600);
  return absolutePath;
}

export function runDatabaseInventory({
  databaseURL,
  generatedAt,
  repoRoot = path.resolve(import.meta.dirname, "../.."),
  runtime = {},
}) {
  const target = parseDatabaseURL(databaseURL, {
    allowRegisteredDevelopment: true,
  });
  const readRows = runtime.readDatabaseRows || readDatabaseRows;
  const readAtlas = runtime.readMigration || readMigration;
  const findReferences = runtime.findEvidenceReferences || findEvidenceReferences;
  const databaseRows = readRows(databaseURL);
  const migrationByName = {};
  const referencesByName = {};
  const serverRoot = path.join(repoRoot, "server");
  for (const row of databaseRows) {
    const name = String(row.name || "");
    const perDatabaseURL = replaceDatabaseName(databaseURL, name, {
      allowRegisteredDevelopment: true,
    });
    migrationByName[name] = readAtlas(perDatabaseURL, serverRoot);
    referencesByName[name] = findReferences(repoRoot, name);
  }
  return buildDatabaseInventoryReport({
    databaseRows,
    generatedAt,
    migrationByName,
    referencesByName,
    server: Object.freeze({
      safeTarget: `host=${target.host.includes(":") ? `[${target.host}]` : target.host} port=${target.port}`,
      targetFingerprint: target.targetFingerprint,
    }),
  });
}

function parseArgs(argv) {
  const options = {
    out: "output/dev-workbench/database/inventory-latest.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--out") {
      if (!value || value.startsWith("--")) throw new Error("--out requires a value");
      options.out = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const databaseURL = String(process.env[DATABASE_INVENTORY_URL_ENV] || "");
    if (!databaseURL) {
      throw new Error(`${DATABASE_INVENTORY_URL_ENV} is required`);
    }
    const report = runDatabaseInventory({ databaseURL });
    const outPath = writeReport(options.out, report);
    process.stdout.write(
      `[database-inventory] status=${report.status} databases=${report.summary.databaseCount} report=${path.relative(process.cwd(), outPath)}\n`,
    );
    if (report.status !== "complete") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`[database-inventory] ${error.message}\n`);
    process.exitCode = 1;
  }
}
