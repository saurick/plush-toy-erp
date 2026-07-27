import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DATABASE_CLEANUP_SCHEMA,
  databaseCleanupConfirmation,
  runDatabaseCleanup,
} from "./database-cleanup.mjs";
import { DATABASE_ARCHIVE_SCHEMA } from "./database-archive.mjs";

const databaseName = "plush_erp_acceptance_cleanup_fixture_dev";
const backupHash = "a".repeat(64);
const sourceFingerprint = "b".repeat(64);

function fixture() {
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), "plush-db-cleanup-"));
  const backup = Buffer.from("archive");
  const actualHash = createHash("sha256")
    .update(backup)
    .digest("hex");
  fs.writeFileSync(path.join(manifestDir, "database.dump"), backup);
  const manifest = {
    schemaVersion: DATABASE_ARCHIVE_SCHEMA,
    status: "passed",
    source: {
      databaseName,
      safeTarget: `host=127.0.0.1 port=55432 database=${databaseName}`,
      targetFingerprint: sourceFingerprint,
    },
    backup: {
      file: "database.dump",
      sha256: actualHash,
      sizeBytes: backup.length,
    },
    restore: {
      removedAfterVerification: true,
      residualDatabase: "",
    },
    deletionAuthorizedByReceipt: false,
  };
  const inventory = {
    mode: "report-only",
    status: "complete",
    databases: [
      {
        name: databaseName,
        owner: "postgres",
        connections: 0,
        evidenceReferences: [],
      },
    ],
  };
  return { actualHash, inventory, manifest, manifestDir };
}

test("cleanup requires exact archive-bound confirmation and verifies disappearance", () => {
  const { actualHash, inventory, manifest, manifestDir } = fixture();
  let exists = true;
  const confirmation = databaseCleanupConfirmation({
    backupHash: actualHash,
    databaseName,
    sourceFingerprint,
  });
  const report = runDatabaseCleanup({
    adminURL:
      "postgres://postgres:secret@127.0.0.1:55432/postgres?sslmode=disable",
    confirmation,
    databaseName,
    generatedAt: new Date("2026-07-28T00:00:00Z"),
    inventory,
    manifest,
    manifestDir,
    runtime: {
      databaseState: () =>
        exists
          ? { exists: true, owner: "postgres", connections: 0 }
          : { exists: false, owner: "", connections: 0 },
      dropDatabase: () => {
        exists = false;
      },
    },
  });
  assert.equal(report.schemaVersion, DATABASE_CLEANUP_SCHEMA);
  assert.equal(report.status, "passed");
  assert.equal(report.databaseName, databaseName);
  assert.equal(report.dropped, true);
  assert.equal(report.residualDatabase, "");
  assert.equal(report.containsSecrets, false);
});

test("cleanup fails closed on references, active connections, bad backup, and long-lived names", () => {
  const base = fixture();
  const confirmation = databaseCleanupConfirmation({
    backupHash: base.actualHash,
    databaseName,
    sourceFingerprint,
  });
  const common = {
    adminURL:
      "postgres://postgres:secret@127.0.0.1:55432/postgres?sslmode=disable",
    confirmation,
    databaseName,
    manifest: base.manifest,
    manifestDir: base.manifestDir,
    runtime: {
      databaseState: () => ({
        exists: true,
        owner: "postgres",
        connections: 0,
      }),
      dropDatabase: () => {},
    },
  };
  assert.throws(
    () =>
      runDatabaseCleanup({
        ...common,
        inventory: {
          ...base.inventory,
          databases: [
            {
              ...base.inventory.databases[0],
              evidenceReferences: ["scripts/example.mjs"],
            },
          ],
        },
      }),
    /repository references/u,
  );
  assert.throws(
    () =>
      runDatabaseCleanup({
        ...common,
        inventory: {
          ...base.inventory,
          databases: [
            { ...base.inventory.databases[0], connections: 1 },
          ],
        },
      }),
    /connections/u,
  );
  fs.writeFileSync(path.join(base.manifestDir, "database.dump"), "changed");
  assert.throws(
    () =>
      runDatabaseCleanup({
        ...common,
        inventory: base.inventory,
      }),
    /hash or size/u,
  );
  assert.throws(
    () =>
      databaseCleanupConfirmation({
        backupHash,
        databaseName: "plush_erp",
        sourceFingerprint,
      }),
    /identity is invalid|cleanup/u,
  );
});
