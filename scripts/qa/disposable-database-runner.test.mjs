import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  DISPOSABLE_DATABASE_RUN_SCHEMA,
  installDisposableDatabaseCancellationHandlers,
  runDisposableDatabaseLifecycle,
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
