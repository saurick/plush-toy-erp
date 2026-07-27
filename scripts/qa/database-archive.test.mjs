import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DATABASE_ARCHIVE_SCHEMA,
  runDatabaseArchiveLifecycle,
} from "./database-archive.mjs";

const sourceURL =
  "postgres://postgres:secret@127.0.0.1:55432/plush_erp_acceptance_archive_fixture_dev?sslmode=disable";

function fakeRuntime({ activeConnections = 0, mismatch = false } = {}) {
  const existing = new Set();
  let restored = false;
  const counts = [{ schema: "public", table: "admin_users", count: 10 }];
  return {
    activeConnections: () => activeConnections,
    atlasStatus: () => ({
      applied: 102,
      available: 102,
      currentVersion: "20260726174057",
      outOfOrder: 0,
      pending: 0,
      status: "OK",
    }),
    createDatabase: (_url, name) => existing.add(name),
    databaseExists: (_url, name) => existing.has(name),
    dropDatabase: (_url, name) => existing.delete(name),
    dump: (_url, backupPath) => fs.writeFileSync(backupPath, "archive"),
    restore: () => {
      restored = true;
    },
    schemaHash: (url) =>
      mismatch && restored && url.includes("plush_erp_restore_")
        ? "b".repeat(64)
        : "a".repeat(64),
    tableCounts: () => counts,
  };
}

test("archive restores, compares, removes the restore target, and stays non-authorizing", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "plush-db-archive-"));
  const report = runDatabaseArchiveLifecycle({
    databaseName: "plush_erp_acceptance_archive_fixture_dev",
    databaseURL: sourceURL,
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    outDir,
    runID: "archive_fixture",
    runtime: fakeRuntime(),
  });

  assert.equal(report.schemaVersion, DATABASE_ARCHIVE_SCHEMA);
  assert.equal(report.status, "passed");
  assert.equal(report.source.activeConnections, 0);
  assert.equal(report.backup.sizeBytes, 7);
  assert.match(report.backup.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(report.restore.removedAfterVerification, true);
  assert.equal(report.deletionAuthorizedByReceipt, false);
  assert.equal(report.containsSecrets, false);
  assert.equal(report.containsRawCustomerRows, false);
  assert(report.stages.some((stage) => stage.name === "restore-readback"));
  assert(report.stages.some((stage) => stage.name === "restore-cleanup-readback"));
});

test("archive rejects active, long-lived, remote, and mismatched sources", () => {
  const base = {
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    outDir: fs.mkdtempSync(path.join(os.tmpdir(), "plush-db-archive-")),
    runID: "archive_fixture",
  };
  assert.throws(
    () =>
      runDatabaseArchiveLifecycle({
        ...base,
        databaseName: "plush_erp_acceptance_archive_fixture_dev",
        databaseURL: sourceURL,
        runtime: fakeRuntime({ activeConnections: 1 }),
      }),
    /zero active connections/u,
  );
  assert.throws(
    () =>
      runDatabaseArchiveLifecycle({
        ...base,
        databaseName: "plush_erp",
        databaseURL:
          "postgres://postgres:secret@127.0.0.1:55432/plush_erp?sslmode=disable",
        runtime: fakeRuntime(),
      }),
    /non-long-lived/u,
  );
  assert.throws(
    () =>
      runDatabaseArchiveLifecycle({
        ...base,
        databaseName: "plush_erp_acceptance_archive_fixture_dev",
        databaseURL: sourceURL.replace("127.0.0.1", "192.168.0.133"),
        runtime: fakeRuntime(),
      }),
    /loopback/u,
  );
  assert.throws(
    () =>
      runDatabaseArchiveLifecycle({
        ...base,
        databaseName: "plush_erp_acceptance_other_fixture_dev",
        databaseURL: sourceURL,
        runtime: fakeRuntime(),
      }),
    /does not match/u,
  );
});

test("archive fails closed on restore fingerprint drift and still removes restore target", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "plush-db-archive-"));
  assert.throws(
    () =>
      runDatabaseArchiveLifecycle({
        databaseName: "plush_erp_acceptance_archive_fixture_dev",
        databaseURL: sourceURL,
        generatedAt: new Date("2026-07-28T00:00:00Z"),
        outDir,
        runID: "archive_fixture",
        runtime: fakeRuntime({ mismatch: true }),
      }),
    /fingerprint does not match/u,
  );
});
