import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DISPOSABLE_DATABASE_RUN_SCHEMA,
  installDisposableDatabaseCancellationHandlers,
  runDisposableDatabaseLifecycle,
  summarizeCriticalPostgresFailure,
  validateDisposableWorkflow,
} from "./disposable-database-runner.mjs";

const BASE_URL =
  "postgres://tester:local-secret@127.0.0.1:55432/postgres?sslmode=disable";

function runtime({ failAt = "" } = {}) {
  const events = [];
  let exists = false;
  return {
    events,
    databaseExists(_adminURL, databaseName) {
      events.push(`exists:${databaseName}`);
      return exists;
    },
    createDatabase(_adminURL, databaseName) {
      events.push(`create:${databaseName}`);
      if (failAt === "create") throw new Error("create failed");
      exists = true;
    },
    migrationStatus() {
      events.push("status");
      if (failAt === "status") throw new Error("status failed");
      return {
        applied: events.filter((event) => event === "migrate").length ? 102 : 0,
        available: 102,
        currentVersion: events.includes("migrate") ? "20260726174057" : "",
        outOfOrder: 0,
        pending: events.includes("migrate") ? 0 : 102,
      };
    },
    migrate() {
      events.push("migrate");
      if (failAt === "migrate") throw new Error("migrate failed");
    },
    verifyCriticalPostgres() {
      events.push("critical");
      if (failAt === "verify") throw new Error("verify failed");
      return { outputLines: 10, status: "passed" };
    },
    dropDatabase(_adminURL, databaseName) {
      events.push(`drop:${databaseName}`);
      if (failAt === "drop") throw new Error("drop failed");
      exists = false;
    },
  };
}

test("disposable database lifecycle creates, migrates, verifies and removes one exact run", () => {
  const executor = runtime();
  const report = runDisposableDatabaseLifecycle({
    baseDatabaseURL: BASE_URL,
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    profile: "ci",
    runID: "20260728-a1b2",
    runtime: executor,
    workflow: "critical-postgres",
  });
  assert.equal(report.schemaVersion, DISPOSABLE_DATABASE_RUN_SCHEMA);
  assert.equal(report.status, "passed");
  assert.equal(report.databaseName, "plush_erp_ci_20260728_a1b2");
  assert.equal(report.cleanup.residualDatabase, "");
  assert.deepEqual(
    report.stages.map(({ stage, status }) => [stage, status]),
    [
      ["create", "passed"],
      ["migration-status-before", "passed"],
      ["migration-apply", "passed"],
      ["migration-readback", "passed"],
      ["verify-critical-postgres", "passed"],
      ["cleanup-drop", "passed"],
      ["cleanup-readback", "passed"],
    ],
  );
  assert.doesNotMatch(JSON.stringify(report), /local-secret|postgres:\/\//u);
});

test("disposable database lifecycle cleans after verification failure", () => {
  const executor = runtime({ failAt: "verify" });
  const report = runDisposableDatabaseLifecycle({
    baseDatabaseURL: BASE_URL,
    profile: "ci",
    runID: "20260728-a1b2",
    runtime: executor,
    workflow: "critical-postgres",
  });
  assert.equal(report.status, "failed");
  assert.equal(report.cleanup.residualDatabase, "");
  assert(executor.events.some((event) => event.startsWith("drop:")));
});

test("disposable database lifecycle reports the exact residual database", () => {
  const report = runDisposableDatabaseLifecycle({
    baseDatabaseURL: BASE_URL,
    profile: "restore",
    runID: "20260728-a1b2",
    runtime: runtime({ failAt: "drop" }),
    workflow: "migration-smoke",
  });
  assert.equal(report.status, "failed");
  assert.equal(
    report.cleanup.residualDatabase,
    "plush_erp_restore_20260728_a1b2",
  );
  assert.match(report.failure, /cleanup/u);
});

test("disposable workflow registry rejects arbitrary commands and profile drift", () => {
  assert.throws(() => validateDisposableWorkflow("ci", "shell"));
  assert.throws(() =>
    validateDisposableWorkflow("capacity", "critical-postgres"),
  );
});

test("disposable database runner keeps signal handling alive until cleanup can finish", () => {
  const processRef = new EventEmitter();
  const cancellation = installDisposableDatabaseCancellationHandlers({
    processRef,
  });
  processRef.emit("SIGTERM");
  assert.equal(cancellation.signal, "SIGTERM");
  cancellation.dispose();
  processRef.emit("SIGINT");
  assert.equal(cancellation.signal, "SIGTERM");
  assert.equal(processRef.listenerCount("SIGTERM"), 0);
  assert.equal(processRef.listenerCount("SIGINT"), 0);
});

test("critical PostgreSQL failure summary keeps safe failed-test identity", () => {
  const stdout = [
    JSON.stringify({
      Action: "fail",
      Package: "github.com/saurick/plush-toy-erp/server/internal/data",
      Test: "TestInventoryPostgresConcurrentOutbound/one-winner",
    }),
    JSON.stringify({
      Action: "fail",
      Package: "github.com/saurick/plush-toy-erp/server/internal/data",
    }),
  ].join("\n");
  assert.equal(
    summarizeCriticalPostgresFailure({ status: 1, stdout }),
    "tests=TestInventoryPostgresConcurrentOutbound/one-winner",
  );
});

test("critical PostgreSQL failure summary rejects raw unstructured output", () => {
  assert.equal(
    summarizeCriticalPostgresFailure({
      status: 1,
      stdout:
        "postgres://tester:local-secret@127.0.0.1:55432/example failed without JSON",
    }),
    "process_exit=1 structured_failure=absent",
  );
  assert.equal(
    summarizeCriticalPostgresFailure({ signal: "SIGKILL" }),
    "process_signal=SIGKILL",
  );
});

test("critical CLI keeps canonical evidence in the checkout when invoked from server", async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "plush-database-cli-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "server"));
  await mkdir(path.join(root, "scripts/qa/lib"), { recursive: true });
  for (const file of [
    "disposable-database-runner.mjs",
    "database-target.mjs",
    "database-inventory.mjs",
    "lib/repository-identity.mjs",
  ]) {
    await copyFile(new URL(file, import.meta.url), path.join(root, "scripts/qa", file));
  }
  const bin = path.join(root, "bin");
  await mkdir(bin);
  // Only external commands are simulated; run the actual CLI, identity reader
  // and artifact writer in an independent checkout-shaped directory.
  const command = `#!${process.execPath}
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
const state = process.env.TEST_DATABASE_STATE;
if (name === 'git' && args.includes('rev-parse')) console.log('a'.repeat(40));
if (name === 'psql') {
  const sql = args.at(-1);
  if (sql.startsWith('CREATE DATABASE')) fs.writeFileSync(state, 'created');
  else if (sql.startsWith('DROP DATABASE')) fs.unlinkSync(state);
  else console.log(fs.existsSync(state) ? '1' : '0');
}
if (name === 'atlas' && args.includes('status')) console.log(JSON.stringify({Current: '20261017094049'}));
if (name === 'bash') {
  for (const Action of ['run', process.env.TEST_CRITICAL_FAIL ? 'fail' : 'pass'])
    console.log(JSON.stringify({Action, Package: 'server/internal/data', Test: 'TestSourceDocumentPostgresIntegrationSupplierDelivery'}));
  process.exitCode = process.env.TEST_CRITICAL_FAIL ? 1 : 0;
}
`;
  for (const name of ["git", "psql", "atlas", "bash"]) {
    const file = path.join(bin, name);
    await writeFile(file, command);
    await chmod(file, 0o700);
  }
  for (const failed of [false, true]) {
    const runID = failed ? "20261018_failure" : "20261018_success";
    const execution = spawnSync(process.execPath, [
      path.join(root, "scripts/qa/disposable-database-runner.mjs"),
      "--profile", "ci", "--workflow", "critical-postgres", "--run-id", runID,
      "--out", "extra-receipt.json",
    ], {
      cwd: path.join(root, "server"),
      env: {
        ...process.env, GIT_OPTIONAL_LOCKS: "0", PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        DISPOSABLE_DATABASE_BASE_URL: BASE_URL,
        TEST_DATABASE_STATE: path.join(root, "database-state"),
        TEST_CRITICAL_FAIL: failed ? "1" : "",
      },
      encoding: "utf8", timeout: 20_000,
    });
    assert.equal(execution.status, failed ? 1 : 0, execution.stderr);
    assert.match(execution.stdout, /\[disposable-database\] status=/u);
    const relative = `output/dev-workbench/database/ci-${runID}.json`;
    const report = JSON.parse(await readFile(path.join(root, relative), "utf8"));
    assert.equal(report.status, failed ? "failed" : "passed");
    assert.equal(report.cleanup.residualDatabase, "");
    assert.equal(report.testReport.path, relative.replace(/\.json$/u, ".go.jsonl"));
    const events = await readFile(path.join(root, report.testReport.path));
    assert.equal(report.testReport.digest, createHash("sha256").update(events).digest("hex"));
    assert.match(events.toString(), failed ? /"Action":"fail"/u : /"Action":"pass"/u);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "server/extra-receipt.json"), "utf8")), report);
    await assert.rejects(readFile(path.join(root, "server", relative)), { code: "ENOENT" });
  }
});
