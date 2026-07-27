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
  buildDisposableDatabaseTarget,
  createDatabaseRunID,
  parseLoopbackDatabaseURL,
  replaceDatabaseName,
} from "./database-target.mjs";
import { normalizeAtlasMigrationStatus } from "./database-inventory.mjs";

export const DISPOSABLE_DATABASE_RUN_SCHEMA =
  "plush-disposable-database-run/v1";
export const DISPOSABLE_DATABASE_BASE_URL_ENV =
  "DISPOSABLE_DATABASE_BASE_URL";
export const DISPOSABLE_DATABASE_WORKFLOWS = Object.freeze({
  "critical-postgres": Object.freeze({
    allowedProfiles: Object.freeze(["ci"]),
    verify: "critical-postgres",
  }),
  "migration-smoke": Object.freeze({
    allowedProfiles: Object.freeze([
      "acceptance",
      "browser-actions",
      "capacity",
      "ci",
      "release-rehearsal",
      "restore",
    ]),
    verify: "migration-status",
  }),
});

function redact(value) {
  return String(value || "")
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(/password=[^\s&]+/giu, "password=<redacted>");
}

function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
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
      `${options.failure || `${command} failed`}${detail ? `: ${detail}` : ""}`,
    );
  }
  return String(result.stdout || "");
}

function defaultRuntime(repoRoot) {
  const serverRoot = path.join(repoRoot, "server");
  const queryExists = (adminURL, databaseName) => {
    const output = commandResult(
      "psql",
      [
        adminURL,
        "-X",
        "--no-psqlrc",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `SELECT count(*) FROM pg_database WHERE datname = '${databaseName}'`,
      ],
      { failure: "database existence check failed" },
    );
    return output.trim() === "1";
  };
  return {
    databaseExists: queryExists,
    createDatabase(adminURL, databaseName) {
      commandResult(
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
        { failure: "disposable database creation failed" },
      );
    },
    dropDatabase(adminURL, databaseName) {
      commandResult(
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
        { failure: "disposable database cleanup failed" },
      );
    },
    migrationStatus(databaseURL) {
      const output = commandResult(
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
      return normalizeAtlasMigrationStatus(JSON.parse(output));
    },
    migrate(databaseURL) {
      commandResult(
        "atlas",
        [
          "migrate",
          "apply",
          "--dir",
          "file://internal/data/model/migrate",
          "--url",
          databaseURL,
        ],
        {
          cwd: serverRoot,
          failure: "Atlas migration apply failed",
          maxBuffer: 32 * 1024 * 1024,
        },
      );
    },
    verifyCriticalPostgres(databaseURL) {
      const output = commandResult(
        "bash",
        [path.join(repoRoot, "scripts/purchase-receipt-pg.sh"), "test-critical"],
        {
          cwd: serverRoot,
          env: { ...process.env, PURCHASE_RECEIPT_PG_DB_URL: databaseURL },
          failure: "critical PostgreSQL verification failed",
        },
      );
      return {
        outputLines: output.split("\n").filter(Boolean).length,
        status: "passed",
      };
    },
  };
}

function safeError(error) {
  return redact(error?.message || error || "unknown failure").slice(0, 1000);
}

export function validateDisposableWorkflow(profile, workflow) {
  const contract = DISPOSABLE_DATABASE_WORKFLOWS[workflow];
  if (!contract) throw new Error(`unknown disposable database workflow: ${workflow}`);
  if (!contract.allowedProfiles.includes(profile)) {
    throw new Error(`${workflow} does not allow the ${profile} database profile`);
  }
  return contract;
}

export function runDisposableDatabaseLifecycle({
  baseDatabaseURL,
  generatedAt = new Date(),
  profile,
  repoRoot = path.resolve(import.meta.dirname, "../.."),
  runID = createDatabaseRunID(generatedAt),
  runtime,
  workflow = "migration-smoke",
}) {
  const workflowContract = validateDisposableWorkflow(profile, workflow);
  const target = buildDisposableDatabaseTarget({
    baseDatabaseURL,
    profile,
    runID,
  });
  const adminURL = replaceDatabaseName(baseDatabaseURL, "postgres");
  const executor = runtime || defaultRuntime(repoRoot);
  const stages = [];
  let created = false;
  let failure = "";

  const record = (stage, status, details = {}) => {
    stages.push(Object.freeze({ stage, status, ...details }));
  };
  try {
    if (executor.databaseExists(adminURL, target.databaseName)) {
      throw new Error("generated disposable database already exists");
    }
    executor.createDatabase(adminURL, target.databaseName);
    created = true;
    record("create", "passed");

    const before = executor.migrationStatus(target.databaseURL);
    record("migration-status-before", "passed", {
      applied: before.applied,
      pending: before.pending,
    });
    executor.migrate(target.databaseURL);
    record("migration-apply", "passed");
    const after = executor.migrationStatus(target.databaseURL);
    if (after.pending !== 0 || after.outOfOrder !== 0 || !after.currentVersion) {
      throw new Error("disposable database migration readback is incomplete");
    }
    record("migration-readback", "passed", {
      applied: after.applied,
      currentVersion: after.currentVersion,
      outOfOrder: after.outOfOrder,
      pending: after.pending,
    });

    if (workflowContract.verify === "critical-postgres") {
      const verification = executor.verifyCriticalPostgres(target.databaseURL);
      if (verification?.status !== "passed") {
        throw new Error("critical PostgreSQL verification did not pass");
      }
      record("verify-critical-postgres", "passed", {
        outputLines: Number(verification.outputLines || 0),
      });
    } else {
      record("verify-migration-status", "passed", {
        currentVersion: after.currentVersion,
      });
    }
  } catch (error) {
    failure = safeError(error);
    record("workflow", "failed", { error: failure });
  } finally {
    if (created) {
      try {
        executor.dropDatabase(adminURL, target.databaseName);
        record("cleanup-drop", "passed");
      } catch (error) {
        const cleanupError = safeError(error);
        failure = failure
          ? `${failure}; cleanup: ${cleanupError}`
          : `cleanup: ${cleanupError}`;
        record("cleanup-drop", "failed", { error: cleanupError });
      }
    }
    try {
      if (executor.databaseExists(adminURL, target.databaseName)) {
        const residueError = `residual database: ${target.databaseName}`;
        failure = failure ? `${failure}; ${residueError}` : residueError;
        record("cleanup-readback", "failed", {
          residualDatabase: target.databaseName,
        });
      } else {
        record("cleanup-readback", "passed");
      }
    } catch (error) {
      const readbackError = safeError(error);
      failure = failure
        ? `${failure}; cleanup readback: ${readbackError}`
        : `cleanup readback: ${readbackError}`;
      record("cleanup-readback", "failed", { error: readbackError });
    }
  }

  const passed =
    !failure &&
    stages.length > 0 &&
    stages.every((stage) => stage.status === "passed");
  return Object.freeze({
    schemaVersion: DISPOSABLE_DATABASE_RUN_SCHEMA,
    status: passed ? "passed" : "failed",
    generatedAt: new Date(generatedAt).toISOString(),
    workflow,
    profile,
    databaseRunIdentity: target.identity.databaseRunIdentity,
    databaseName: target.databaseName,
    targetFingerprint: target.identity.targetFingerprint,
    stages,
    failure,
    cleanup: Object.freeze({
      attempted: created,
      residualDatabase: stages.some(
        (stage) => stage.stage === "cleanup-readback" && stage.status === "failed",
      )
        ? target.databaseName
        : "",
    }),
    notProven: Object.freeze([
      "shared development database safety",
      "target environment release",
      "customer UAT",
    ]),
  });
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

function parseArgs(argv) {
  const options = {
    out: "",
    profile: "",
    runID: "",
    workflow: "migration-smoke",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (["--out", "--profile", "--run-id", "--workflow"].includes(arg)) {
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[
        {
          "--out": "out",
          "--profile": "profile",
          "--run-id": "runID",
          "--workflow": "workflow",
        }[arg]
      ] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.profile) throw new Error("--profile is required");
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const baseDatabaseURL = String(
      process.env[DISPOSABLE_DATABASE_BASE_URL_ENV] || "",
    );
    if (!baseDatabaseURL) {
      throw new Error(`${DISPOSABLE_DATABASE_BASE_URL_ENV} is required`);
    }
    parseLoopbackDatabaseURL(baseDatabaseURL);
    const report = runDisposableDatabaseLifecycle({
      baseDatabaseURL,
      profile: options.profile,
      runID: options.runID || undefined,
      workflow: options.workflow,
    });
    const defaultOut = path.join(
      "output",
      "dev-workbench",
      "database",
      `${report.profile}-${report.databaseRunIdentity.split(":")[1]}.json`,
    );
    const outPath = writeReport(options.out || defaultOut, report);
    process.stdout.write(
      `[disposable-database] status=${report.status} run=${report.databaseRunIdentity} cleanup=${report.cleanup.residualDatabase ? "failed" : "complete"} report=${path.relative(process.cwd(), outPath)}\n`,
    );
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[disposable-database] ${safeError(error)}\n`);
    process.exitCode = 1;
  }
}
