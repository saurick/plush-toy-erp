import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRollbackManifest,
  validateRollbackManifest,
} from "./rollback-manifest.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";

const FROM_SHA = "a".repeat(40);
const TO_SHA = "b".repeat(40);
const HASH = "c".repeat(64);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";

function ancestry() {
  return {
    schemaVersion: "plush.git-ancestry-relation/v1",
    currentGitSha: FROM_SHA,
    candidateGitSha: TO_SHA,
    relation: "behind",
    actionClass: "rollback",
    actionReason: "candidate_is_ancestor_of_current",
  };
}

function release(gitSha, overrides = {}) {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: gitSha === FROM_SHA ? "2026.07.29-2" : "2026.07.29-1",
    gitSha,
    strict: releaseManifestStrictEvidenceFixture(),
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
    target: "demo-133",
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
    ancestry: ancestry(),
  });
  assert.equal(validateRollbackManifest(manifest).status, "eligible");
  assert.equal(manifest.rollback.mode, "code_and_images_only");
  assert.equal(manifest.rollback.automaticDatabaseDownMigration, false);
  assert.deepEqual(manifest.transport, {
    mode: "legacy_target_cache",
    targetManifestSha256: "6".repeat(64),
  });
  assert.deepEqual(manifest.blockers, []);
  const drifted = structuredClone(manifest);
  drifted.transport.targetManifestSha256 = "7".repeat(64);
  assert.throws(
    () => validateRollbackManifest(drifted),
    /transport identity/u,
  );
  const withoutTransport = structuredClone(manifest);
  delete withoutTransport.transport;
  assert.throws(
    () => validateRollbackManifest(withoutTransport),
    /transport identity/u,
  );
  const withoutReleaseSchema = structuredClone(manifest);
  delete withoutReleaseSchema.to.schemaVersion;
  assert.throws(
    () => validateRollbackManifest(withoutReleaseSchema),
    /image identity/u,
  );
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
    ancestry: ancestry(),
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
    ancestry: ancestry(),
  });
  assert.equal(manifest.status, "blocked");
  assert.deepEqual(manifest.blockers, ["target_disk_capacity_low"]);
});
