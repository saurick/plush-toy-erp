import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRollbackManifest,
  validateRollbackManifest,
} from "./rollback-manifest.mjs";

const FROM_SHA = "a".repeat(40);
const TO_SHA = "b".repeat(40);
const HASH = "c".repeat(64);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";

function release(gitSha, overrides = {}) {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: gitSha === FROM_SHA ? "2026.07.29-2" : "2026.07.29-1",
    gitSha,
    strict: { status: "passed", fingerprint: "d".repeat(64) },
    artifact: {
      manifestSha256: "e".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
    },
    migration: { latest: "20260729000000", sequenceSha256: HASH },
    customerConfig: { sourceSha256: HASH },
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: `sha256:${"1".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-server@sha256:${"1".repeat(64)}`,
        sourceContentId: `sha256:${"2".repeat(64)}`,
        platform: "linux/amd64",
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: `sha256:${"3".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-web@sha256:${"3".repeat(64)}`,
        sourceContentId: `sha256:${"4".repeat(64)}`,
        platform: "linux/amd64",
      },
    ],
    rollback: { databaseDownMigrationAutomatic: false },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
    ...overrides,
  };
}

function preflight(runtimeSha = FROM_SHA, blockers = []) {
  return {
    schemaVersion: "plush.target-preflight/v1",
    target: "test-133",
    customer: "yoyoosun",
    blockers,
    remote: {
      runtime: {
        serverSha: runtimeSha,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
      },
      locks: { migration: "free" },
    },
  };
}

test("rollback qualification permits only equal migration and config identity", () => {
  const manifest = buildRollbackManifest({
    operationId: OPERATION_ID,
    currentReleaseManifest: release(FROM_SHA),
    currentReleaseManifestSha256: "5".repeat(64),
    targetReleaseManifest: release(TO_SHA),
    targetReleaseManifestSha256: "6".repeat(64),
    targetPreflight: preflight(),
  });
  assert.equal(validateRollbackManifest(manifest).status, "eligible");
  assert.equal(manifest.rollback.mode, "code_and_images_only");
  assert.equal(manifest.rollback.automaticDatabaseDownMigration, false);
  assert.deepEqual(manifest.blockers, []);
});

test("rollback qualification blocks schema, config and runtime mismatch", () => {
  const manifest = buildRollbackManifest({
    operationId: OPERATION_ID,
    currentReleaseManifest: release(FROM_SHA),
    currentReleaseManifestSha256: "5".repeat(64),
    targetReleaseManifest: release(TO_SHA, {
      migration: {
        latest: "20260729000001",
        sequenceSha256: "7".repeat(64),
      },
      customerConfig: { sourceSha256: "8".repeat(64) },
    }),
    targetReleaseManifestSha256: "6".repeat(64),
    targetPreflight: preflight("9".repeat(40)),
  });
  assert.equal(manifest.status, "blocked");
  assert.deepEqual(manifest.blockers, [
    "rollback_current_release_mismatch",
    "rollback_customer_config_incompatible",
    "rollback_migration_incompatible",
  ]);
});

test("rollback qualification preserves target preflight blockers", () => {
  const manifest = buildRollbackManifest({
    operationId: OPERATION_ID,
    currentReleaseManifest: release(FROM_SHA),
    currentReleaseManifestSha256: "5".repeat(64),
    targetReleaseManifest: release(TO_SHA),
    targetReleaseManifestSha256: "6".repeat(64),
    targetPreflight: preflight(FROM_SHA, ["target_disk_capacity_low"]),
  });
  assert.equal(manifest.status, "blocked");
  assert.deepEqual(manifest.blockers, ["target_disk_capacity_low"]);
});
