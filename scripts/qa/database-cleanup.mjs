#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  classifyDatabaseName,
  parseDatabaseURL,
} from "./database-target.mjs";
import { DATABASE_ARCHIVE_SCHEMA } from "./database-archive.mjs";
import { sha256File } from "../lib/file-digest.mjs";

export const DATABASE_CLEANUP_SCHEMA = "plush-database-cleanup/v1";
export const DATABASE_CLEANUP_ADMIN_URL_ENV = "DATABASE_CLEANUP_ADMIN_URL";

function redact(value) {
  return String(value || "")
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(/password=[^\s&]+/giu, "password=<redacted>");
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const detail = redact(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new Error(
      `${options.failure || `${commandName} failed`}${detail ? `: ${detail}` : ""}`,
    );
  }
  return String(result.stdout || "").trim();
}

function psqlScalar(databaseURL, sql) {
  return command(
    "psql",
    [
      databaseURL,
      "-X",
      "--no-psqlrc",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { failure: "database cleanup readback failed" },
  );
}

function defaultRuntime() {
  return {
    databaseState(adminURL, databaseName) {
      const output = psqlScalar(
        adminURL,
        `SELECT COALESCE(
          (
            SELECT json_build_object(
              'exists', true,
              'owner', pg_get_userbyid(database.datdba),
              'connections', (
                SELECT count(*)
                FROM pg_stat_activity
                WHERE datname = database.datname
              )
            )
            FROM pg_database AS database
            WHERE database.datname = '${databaseName}'
          ),
          json_build_object('exists', false, 'owner', '', 'connections', 0)
        );`,
      );
      return JSON.parse(output);
    },
    dropDatabase(adminURL, databaseName) {
      command(
        "psql",
        [
          adminURL,
          "-X",
          "--no-psqlrc",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `DROP DATABASE "${databaseName}"`,
        ],
        { failure: "database cleanup drop failed" },
      );
    },
  };
}

function safeReadJSON(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

export function databaseCleanupConfirmation({
  backupHash,
  databaseName,
  sourceFingerprint,
}) {
  const classification = classifyDatabaseName(databaseName);
  if (
    !/^plush_erp[a-z0-9_]*$/u.test(databaseName) ||
    classification.disposable !== true ||
    !/^[0-9a-f]{64}$/u.test(backupHash) ||
    !/^[0-9a-f]{64}$/u.test(sourceFingerprint)
  ) {
    throw new Error("database cleanup confirmation identity is invalid");
  }
  return `DROP_ARCHIVED_DATABASE:${databaseName}:${backupHash}:${sourceFingerprint}`;
}

function assertSameServer(adminTarget, sourceSafeTarget) {
  const match = String(sourceSafeTarget || "").match(
    /^host=(\[[^\]]+\]|[^ ]+) port=(\d+) database=[a-z][a-z0-9_]*$/u,
  );
  if (!match) throw new Error("database archive source safe target is invalid");
  const sourceHost = match[1].replace(/^\[|\]$/gu, "");
  const sourcePort = Number(match[2]);
  if (sourceHost !== adminTarget.host || sourcePort !== adminTarget.port) {
    throw new Error("database cleanup admin target does not match archive source");
  }
}

export function runDatabaseCleanup({
  allowRegisteredDevelopment = false,
  adminURL,
  confirmation,
  databaseName,
  generatedAt = new Date(),
  inventory,
  manifest,
  manifestDir,
  runtime,
}) {
  const adminTarget = parseDatabaseURL(adminURL, {
    allowRegisteredDevelopment,
  });
  if (adminTarget.databaseName !== "postgres") {
    throw new Error("database cleanup admin URL must target postgres");
  }
  const classification = classifyDatabaseName(databaseName);
  if (
    !/^plush_erp[a-z0-9_]*$/u.test(databaseName) ||
    classification.disposable !== true
  ) {
    throw new Error("database cleanup refuses a long-lived or non-project database");
  }
  if (
    manifest.schemaVersion !== DATABASE_ARCHIVE_SCHEMA ||
    manifest.status !== "passed" ||
    manifest.source?.databaseName !== databaseName ||
    manifest.restore?.removedAfterVerification !== true ||
    manifest.restore?.residualDatabase ||
    manifest.deletionAuthorizedByReceipt !== false
  ) {
    throw new Error("database cleanup archive manifest is incomplete");
  }
  assertSameServer(adminTarget, manifest.source.safeTarget);
  const backupHash = String(manifest.backup?.sha256 || "");
  const sourceFingerprint = String(manifest.source?.targetFingerprint || "");
  const expectedConfirmation = databaseCleanupConfirmation({
    backupHash,
    databaseName,
    sourceFingerprint,
  });
  if (confirmation !== expectedConfirmation) {
    throw new Error("database cleanup confirmation does not match exact archive identity");
  }
  const backupFile = path.resolve(manifestDir, String(manifest.backup?.file || ""));
  const manifestRoot = `${path.resolve(manifestDir)}${path.sep}`;
  if (!backupFile.startsWith(manifestRoot)) {
    throw new Error("database cleanup backup path escapes the manifest directory");
  }
  if (
    statSync(backupFile).size !== Number(manifest.backup?.sizeBytes) ||
    sha256File(backupFile) !== backupHash
  ) {
    throw new Error("database cleanup backup hash or size does not match manifest");
  }

  if (
    inventory.mode !== "report-only" ||
    inventory.status !== "complete" ||
    !Array.isArray(inventory.databases)
  ) {
    throw new Error("database cleanup inventory is not a complete report-only inventory");
  }
  const inventoryRow = inventory.databases.find(
    (database) => database.name === databaseName,
  );
  if (!inventoryRow) throw new Error("database cleanup target is missing from inventory");
  if (
    inventoryRow.connections !== 0 ||
    !inventoryRow.owner ||
    (inventoryRow.evidenceReferences || []).length !== 0
  ) {
    throw new Error("database cleanup inventory still has connections, missing owner, or repository references");
  }

  const executor = runtime || defaultRuntime();
  const before = executor.databaseState(adminURL, databaseName);
  if (
    before.exists !== true ||
    before.owner !== inventoryRow.owner ||
    Number(before.connections) !== 0
  ) {
    throw new Error("database cleanup live readback does not match the zero-connection inventory");
  }
  executor.dropDatabase(adminURL, databaseName);
  const after = executor.databaseState(adminURL, databaseName);
  if (after.exists !== false) {
    throw new Error(`database cleanup left residual database ${databaseName}`);
  }

  return Object.freeze({
    schemaVersion: DATABASE_CLEANUP_SCHEMA,
    status: "passed",
    generatedAt: new Date(generatedAt).toISOString(),
    databaseName,
    owner: before.owner,
    sourceFingerprint,
    backupHash,
    restoreVerified: true,
    dropped: true,
    residualDatabase: "",
    recoverableFrom: path.relative(process.cwd(), backupFile),
    containsSecrets: false,
    notProven: Object.freeze([
      "migration upgrade compatibility",
      "customer UAT",
    ]),
  });
}

function writeReport(outPath, report) {
  const absolutePath = path.resolve(outPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, absolutePath);
  chmodSync(absolutePath, 0o600);
  return absolutePath;
}

function parseArgs(argv) {
  const options = {
    confirmation: "",
    databaseName: "",
    inventory: "",
    manifest: "",
    out: "",
    printConfirmation: false,
    allowRegisteredDevelopment: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--print-confirmation") {
      options.printConfirmation = true;
      continue;
    }
    if (arg === "--allow-registered-development") {
      options.allowRegisteredDevelopment = true;
      continue;
    }
    const value = argv[index + 1];
    const key = {
      "--confirm": "confirmation",
      "--database-name": "databaseName",
      "--inventory": "inventory",
      "--manifest": "manifest",
      "--out": "out",
    }[arg];
    if (!key) throw new Error(`unknown argument: ${arg}`);
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = value;
    index += 1;
  }
  for (const key of ["databaseName", "inventory", "manifest"]) {
    if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`)} is required`);
  }
  if (!options.printConfirmation && (!options.confirmation || !options.out)) {
    throw new Error("--confirm and --out are required for cleanup");
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifestPath = path.resolve(options.manifest);
    const manifest = safeReadJSON(manifestPath, "database archive manifest");
    if (options.printConfirmation) {
      process.stdout.write(
        `${databaseCleanupConfirmation({
          backupHash: String(manifest.backup?.sha256 || ""),
          databaseName: options.databaseName,
          sourceFingerprint: String(manifest.source?.targetFingerprint || ""),
        })}\n`,
      );
    } else {
      const adminURL = String(process.env[DATABASE_CLEANUP_ADMIN_URL_ENV] || "");
      if (!adminURL) throw new Error(`${DATABASE_CLEANUP_ADMIN_URL_ENV} is required`);
      const inventory = safeReadJSON(
        path.resolve(options.inventory),
        "database inventory",
      );
      const report = runDatabaseCleanup({
        allowRegisteredDevelopment: options.allowRegisteredDevelopment,
        adminURL,
        confirmation: options.confirmation,
        databaseName: options.databaseName,
        inventory,
        manifest,
        manifestDir: path.dirname(manifestPath),
      });
      const outPath = writeReport(options.out, report);
      process.stdout.write(
        `[database-cleanup] status=passed database=${report.databaseName} residual=none report=${path.relative(process.cwd(), outPath)}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`[database-cleanup] ${redact(error.message)}\n`);
    process.exitCode = 1;
  }
}
