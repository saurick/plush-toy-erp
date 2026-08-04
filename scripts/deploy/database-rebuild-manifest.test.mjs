import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDatabaseRebuildManifest,
  validateDatabaseRebuildManifest,
  writeDatabaseRebuildManifest,
} from "./database-rebuild-manifest.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function releaseManifest() {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: "2026.08.03-1",
    gitSha: SHA,
    strict: { status: "passed", fingerprint: "c".repeat(64) },
    artifact: {
      manifestSha256: "d".repeat(64),
      sourceArchiveSha256: "e".repeat(64),
    },
    migration: {
      latest: "20260731124000",
      sequenceSha256: "f".repeat(64),
    },
    customerConfig: { sourceSha256: "1".repeat(64) },
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: `sha256:${"2".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-server@sha256:${"2".repeat(64)}`,
        sourceContentId: `sha256:${"3".repeat(64)}`,
        platform: "linux/amd64",
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: `sha256:${"4".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-web@sha256:${"4".repeat(64)}`,
        sourceContentId: `sha256:${"5".repeat(64)}`,
        platform: "linux/amd64",
      },
    ],
    rollback: {
      targetRollbackPointRequiredBeforePromotion: true,
      databaseDownMigrationAutomatic: false,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
  };
}

function targetPreflight({ runtimeSha = SHA, blocked = false } = {}) {
  return {
    schemaVersion: "plush.target-preflight/v1",
    status: blocked ? "blocked" : "passed",
    target: "test-133",
    customer: "yoyoosun",
    blockers: blocked ? ["target_disk_capacity_low"] : [],
    remote: {
      capacity: {
        availableBytes: blocked ? 20 * 1024 ** 3 : 80 * 1024 ** 3,
        minimumAvailableBytes: 30 * 1024 ** 3,
      },
      runtime: {
        databaseName: "plush_erp_uat_20260716_v5",
        serverSha: runtimeSha,
        webSha: runtimeSha,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
      },
    },
  };
}

test("database rebuild plan binds a fresh physical generation and two rollback points", () => {
  const manifest = buildDatabaseRebuildManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: targetPreflight(),
    createdAt: "2026-08-03T12:00:00.000Z",
  });
  assert.equal(manifest.status, "eligible");
  assert.equal(manifest.execution.sameLogicalDatabaseName, true);
  assert.equal(manifest.execution.freshPhysicalDataDirectory, true);
  assert.equal(manifest.rollback.preservePreviousDataDirectory, true);
  assert.equal(manifest.rollback.preserveFreshBackup, true);
  assert.equal(manifest.rollback.automaticDataDeletion, false);
  assert.match(
    manifest.execution.preservedDataAlias,
    /^rollback-[0-9a-f]{12}-[0-9a-f]{8}$/u,
  );
  assert.equal(validateDatabaseRebuildManifest(manifest), manifest);
});

test("database rebuild plan blocks runtime drift and target preflight failures", () => {
  const drifted = buildDatabaseRebuildManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: targetPreflight({ runtimeSha: "9".repeat(40) }),
  });
  assert.equal(drifted.status, "blocked");
  assert.deepEqual(drifted.blockers, [
    "database_rebuild_runtime_release_mismatch",
  ]);
  const blocked = buildDatabaseRebuildManifest({
    operationId: "223e4567-e89b-42d3-a456-426614174000",
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: targetPreflight({ blocked: true }),
  });
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers, ["target_disk_capacity_low"]);
  const blockerWithoutDetail = buildDatabaseRebuildManifest({
    operationId: "323e4567-e89b-42d3-a456-426614174000",
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: {
      ...targetPreflight(),
      status: "blocked",
      blockers: [],
    },
  });
  assert.equal(blockerWithoutDetail.status, "blocked");
  assert.deepEqual(blockerWithoutDetail.blockers, [
    "database_rebuild_target_preflight_blocked",
  ]);
});

test("database rebuild plan is private, immutable and redacted", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "database-rebuild-plan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "plan.json");
  const manifest = buildDatabaseRebuildManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: targetPreflight(),
  });
  assert.equal(writeDatabaseRebuildManifest(file, manifest).reused, false);
  assert.equal(writeDatabaseRebuildManifest(file, manifest).reused, true);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.doesNotMatch(
    readFileSync(file, "utf8"),
    /192\.168|\/home\/simon|password|token/iu,
  );
  assert.throws(
    () => writeDatabaseRebuildManifest(file, { ...manifest, status: "blocked" }),
    /contract|different/u,
  );
});
