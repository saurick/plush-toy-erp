#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
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
  createDatabaseRunID,
  databaseNameForRun,
  parseLoopbackDatabaseURL,
  replaceDatabaseName,
} from "./database-target.mjs";
import { normalizeAtlasMigrationStatus } from "./database-inventory.mjs";

export const DATABASE_ARCHIVE_SCHEMA = "plush-database-archive/v1";
export const DATABASE_ARCHIVE_URL_ENV = "DATABASE_ARCHIVE_SOURCE_URL";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 512 * 1024 * 1024,
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
  return result.stdout;
}

function psqlScalar(databaseURL, sql, variables = {}) {
  const args = [
    databaseURL,
    "-X",
    "--no-psqlrc",
    "-Atq",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  for (const [name, value] of Object.entries(variables)) {
    args.push("-v", `${name}=${value}`);
  }
  args.push("-c", sql);
  return String(
    command("psql", args, { failure: "database archive query failed" }),
  ).trim();
}

function readTableCounts(databaseURL) {
  const rows = JSON.parse(
    psqlScalar(
      databaseURL,
      `SELECT COALESCE(
        json_agg(
          json_build_object('schema', schemaname, 'table', tablename)
          ORDER BY schemaname, tablename
        ),
        '[]'::json
      )
      FROM pg_tables
      WHERE schemaname = 'public';`,
    ) || "[]",
  );
  if (!Array.isArray(rows)) throw new Error("database table inventory is invalid");
  return rows.map((row) => {
    const schema = String(row.schema || "");
    const table = String(row.table || "");
    if (
      !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u.test(schema) ||
      !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u.test(table)
    ) {
      throw new Error("database archive found an unsafe table identifier");
    }
    const count = Number(
      psqlScalar(databaseURL, `SELECT count(*) FROM "${schema}"."${table}";`),
    );
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`database archive count is invalid for ${schema}.${table}`);
    }
    return Object.freeze({ schema, table, count });
  });
}

export function readSchemaInventory(databaseURL) {
  const structure = psqlScalar(
    databaseURL,
    `WITH objects AS (
       SELECT
         'relation'::text AS kind,
         concat_ws('|', namespace.nspname, class.relname, class.relkind::text) AS identity
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
         AND class.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
       UNION ALL
       SELECT
         'column',
         concat_ws(
           '|',
           columns.table_schema,
           columns.table_name,
           columns.column_name,
           columns.udt_schema,
           columns.udt_name,
           columns.is_nullable
         )
       FROM information_schema.columns AS columns
       WHERE columns.table_schema = 'public'
       UNION ALL
       SELECT
         'constraint',
         concat_ws(
           '|',
           namespace.nspname,
           class.relname,
           constraint_record.conname,
           constraint_record.contype::text
         )
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS class ON class.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
       UNION ALL
       SELECT
         'index',
         concat_ws(
           '|',
           namespace.nspname,
           class.relname,
           index_class.relname,
           index_record.indisunique::text,
           index_record.indisprimary::text
         )
       FROM pg_index AS index_record
       JOIN pg_class AS class ON class.oid = index_record.indrelid
       JOIN pg_class AS index_class ON index_class.oid = index_record.indexrelid
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
       UNION ALL
       SELECT
         'function',
         concat_ws(
           '|',
           namespace.nspname,
           procedure.proname,
           pg_get_function_identity_arguments(procedure.oid)
         )
       FROM pg_proc AS procedure
       JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
       UNION ALL
       SELECT
         'trigger',
         concat_ws('|', namespace.nspname, class.relname, trigger_record.tgname)
       FROM pg_trigger AS trigger_record
       JOIN pg_class AS class ON class.oid = trigger_record.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
         AND NOT trigger_record.tgisinternal
     )
     SELECT COALESCE(
       json_agg(
         json_build_object('kind', kind, 'identity', identity)
         ORDER BY kind, identity
       ),
       '[]'::json
     )
     FROM objects;`,
  );
  const parsed = JSON.parse(structure || "[]");
  if (!Array.isArray(parsed)) {
    throw new Error("database archive schema inventory is invalid");
  }
  return parsed;
}

function readSchemaFingerprint(databaseURL) {
  return sha256(JSON.stringify(readSchemaInventory(databaseURL)));
}

function readMigration(databaseURL, serverRoot) {
  const output = command(
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
      failure: "database archive Atlas status failed",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  return normalizeAtlasMigrationStatus(JSON.parse(String(output)));
}

function defaultRuntime(repoRoot) {
  const serverRoot = path.join(repoRoot, "server");
  const postgresBinary = (name) => {
    for (const candidate of [
      `/opt/homebrew/opt/postgresql@18/bin/${name}`,
      `/opt/homebrew/opt/postgresql@17/bin/${name}`,
      `/opt/homebrew/opt/postgresql@16/bin/${name}`,
      name,
    ]) {
      if (!candidate.startsWith("/") || existsSync(candidate)) return candidate;
    }
    return name;
  };
  const pgDump = postgresBinary("pg_dump");
  const pgRestore = postgresBinary("pg_restore");
  return {
    activeConnections(databaseURL) {
      return Number(
        psqlScalar(
          databaseURL,
          `SELECT count(*)
           FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid();`,
        ),
      );
    },
    atlasStatus(databaseURL) {
      return readMigration(databaseURL, serverRoot);
    },
    createDatabase(adminURL, databaseName) {
      command(
        "psql",
        [
          adminURL,
          "-X",
          "--no-psqlrc",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `CREATE DATABASE "${databaseName}"`,
        ],
        { failure: "database archive restore target creation failed" },
      );
    },
    databaseExists(adminURL, databaseName) {
      return (
        psqlScalar(
          adminURL,
          `SELECT count(*) FROM pg_database WHERE datname = '${databaseName}';`,
        ) === "1"
      );
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
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        ],
        { failure: "database archive restore target cleanup failed" },
      );
    },
    dump(databaseURL, backupPath) {
      command(
        pgDump,
        [
          "--format=custom",
          "--no-owner",
          "--no-acl",
          "--file",
          backupPath,
          databaseURL,
        ],
        { encoding: null, failure: "database archive pg_dump failed" },
      );
    },
    restore(databaseURL, backupPath) {
      command(
        pgRestore,
        [
          "--exit-on-error",
          "--no-owner",
          "--no-acl",
          "--dbname",
          databaseURL,
          backupPath,
        ],
        { encoding: null, failure: "database archive pg_restore failed" },
      );
    },
    schemaHash: readSchemaFingerprint,
    tableCounts: readTableCounts,
  };
}

function assertArchivableSource(databaseURL, declaredDatabaseName) {
  const target = parseLoopbackDatabaseURL(databaseURL);
  if (target.databaseName !== declaredDatabaseName) {
    throw new Error("database archive source does not match --database-name");
  }
  const classification = classifyDatabaseName(declaredDatabaseName);
  if (
    !/^plush_erp[a-z0-9_]*$/u.test(declaredDatabaseName) ||
    ["development", "legacy-development"].includes(classification.profile)
  ) {
    throw new Error("database archive only accepts an exact non-long-lived project database");
  }
  return { target, classification };
}

export function runDatabaseArchiveLifecycle({
  databaseName,
  databaseURL,
  generatedAt = new Date(),
  outDir,
  repoRoot = path.resolve(import.meta.dirname, "../.."),
  runID = createDatabaseRunID(generatedAt),
  runtime,
}) {
  const { target, classification } = assertArchivableSource(
    databaseURL,
    databaseName,
  );
  const restoreDatabaseName = databaseNameForRun("restore", runID);
  const restoreDatabaseURL = replaceDatabaseName(
    databaseURL,
    restoreDatabaseName,
  );
  const adminURL = replaceDatabaseName(databaseURL, "postgres");
  const absoluteOut = path.resolve(outDir);
  const backupPath = path.join(absoluteOut, "database.dump");
  const executor = runtime || defaultRuntime(repoRoot);
  const stages = [];
  let restoreCreated = false;

  const stage = (name, details = {}) => {
    stages.push(Object.freeze({ name, status: "passed", ...details }));
  };

  mkdirSync(absoluteOut, { recursive: true, mode: 0o700 });
  chmodSync(absoluteOut, 0o700);

  const activeConnections = executor.activeConnections(databaseURL);
  if (!Number.isSafeInteger(activeConnections) || activeConnections !== 0) {
    throw new Error(
      `database archive requires zero active connections; found ${activeConnections}`,
    );
  }
  stage("source-connection-readback", { activeConnections });

  const sourceMigration = executor.atlasStatus(databaseURL);
  const sourceSchemaHash = executor.schemaHash(databaseURL);
  const sourceCounts = executor.tableCounts(databaseURL);
  const sourceCountsHash = sha256(JSON.stringify(sourceCounts));
  stage("source-fingerprint", {
    currentVersion: sourceMigration.currentVersion,
    pending: sourceMigration.pending,
    tableCount: sourceCounts.length,
  });

  executor.dump(databaseURL, backupPath);
  chmodSync(backupPath, 0o600);
  const backup = readFileSync(backupPath);
  const backupSize = statSync(backupPath).size;
  const backupHash = sha256(backup);
  if (backupSize <= 0) throw new Error("database archive dump is empty");
  stage("backup", { backupHash, backupSize });

  try {
    if (executor.databaseExists(adminURL, restoreDatabaseName)) {
      throw new Error("database archive generated restore target already exists");
    }
    executor.createDatabase(adminURL, restoreDatabaseName);
    restoreCreated = true;
    stage("restore-create");
    executor.restore(restoreDatabaseURL, backupPath);
    stage("restore");

    const restoreMigration = executor.atlasStatus(restoreDatabaseURL);
    const restoreSchemaHash = executor.schemaHash(restoreDatabaseURL);
    const restoreCounts = executor.tableCounts(restoreDatabaseURL);
    const restoreCountsHash = sha256(JSON.stringify(restoreCounts));
    const schemaMatches = restoreSchemaHash === sourceSchemaHash;
    const tableCountsMatch = restoreCountsHash === sourceCountsHash;
    const migrationMatches =
      JSON.stringify(restoreMigration) === JSON.stringify(sourceMigration);
    if (!schemaMatches || !tableCountsMatch || !migrationMatches) {
      throw new Error(
        `database archive restore fingerprint does not match source (schema=${schemaMatches} tableCounts=${tableCountsMatch} migration=${migrationMatches})`,
      );
    }
    stage("restore-readback", {
      currentVersion: restoreMigration.currentVersion,
      pending: restoreMigration.pending,
      schemaHash: restoreSchemaHash,
      tableCountsHash: restoreCountsHash,
    });
  } finally {
    if (restoreCreated) {
      executor.dropDatabase(adminURL, restoreDatabaseName);
      stage("restore-cleanup");
    }
    if (executor.databaseExists(adminURL, restoreDatabaseName)) {
      throw new Error(`database archive left residual restore database ${restoreDatabaseName}`);
    }
    stage("restore-cleanup-readback");
  }

  return Object.freeze({
    schemaVersion: DATABASE_ARCHIVE_SCHEMA,
    status: "passed",
    generatedAt: new Date(generatedAt).toISOString(),
    source: Object.freeze({
      databaseName,
      lifecycleProfile: classification.profile,
      runIdentity: classification.runID,
      safeTarget: target.safeTarget,
      targetFingerprint: target.targetFingerprint,
      activeConnections,
      migration: sourceMigration,
      schemaHash: sourceSchemaHash,
      tableCounts: sourceCounts,
      tableCountsHash: sourceCountsHash,
    }),
    backup: Object.freeze({
      file: "database.dump",
      sha256: backupHash,
      sizeBytes: backupSize,
    }),
    restore: Object.freeze({
      databaseName: restoreDatabaseName,
      removedAfterVerification: true,
      residualDatabase: "",
    }),
    stages,
    containsSecrets: false,
    containsRawCustomerRows: false,
    deletionAuthorizedByReceipt: false,
    notProven: Object.freeze([
      "migration upgrade compatibility",
      "source database deletion",
      "customer UAT",
    ]),
  });
}

function writeManifest(outDir, report) {
  const absoluteOut = path.resolve(outDir);
  const manifestPath = path.join(absoluteOut, "manifest.json");
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, manifestPath);
  chmodSync(manifestPath, 0o600);
  return manifestPath;
}

function parseArgs(argv) {
  const options = { databaseName: "", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--database-name" || arg === "--out") {
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[arg === "--database-name" ? "databaseName" : "out"] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.databaseName) throw new Error("--database-name is required");
  if (!options.out) throw new Error("--out is required");
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const databaseURL = String(process.env[DATABASE_ARCHIVE_URL_ENV] || "");
    if (!databaseURL) throw new Error(`${DATABASE_ARCHIVE_URL_ENV} is required`);
    const report = runDatabaseArchiveLifecycle({
      databaseName: options.databaseName,
      databaseURL,
      outDir: options.out,
    });
    const manifestPath = writeManifest(options.out, report);
    process.stdout.write(
      `[database-archive] status=passed database=${report.source.databaseName} backup=${report.backup.sha256} manifest=${path.relative(process.cwd(), manifestPath)}\n`,
    );
  } catch (error) {
    process.stderr.write(`[database-archive] ${redact(error.message)}\n`);
    process.exitCode = 1;
  }
}
