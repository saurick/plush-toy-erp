import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPromotionManifest,
  validatePromotionManifest,
  writePromotionManifest,
} from "./promotion-manifest.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";

const SHA = "a".repeat(40);
const CURRENT_SHA = "b".repeat(40);
const HASH = "c".repeat(64);
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function releaseManifest() {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: "2026.07.29-1",
    gitSha: SHA,
    strict: releaseManifestStrictEvidenceFixture(),
    artifact: {
      manifestSha256: HASH,
      sourceArchiveSha256: "e".repeat(64),
    },
    migration: {
      latest: "20260729000000",
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

function preflight(overrides = {}) {
  return {
    schemaVersion: "plush.target-preflight/v1",
    status: "passed",
    target: "test-133",
    customer: "yoyoosun",
    blockers: [],
    remote: {
      capacity: {
        availableBytes: 40 * 1024 ** 3,
        minimumAvailableBytes: 30 * 1024 ** 3,
      },
      runtime: {
        serverSha: CURRENT_SHA,
        webSha: CURRENT_SHA,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
      },
      backup: {
        latestSha256: "6".repeat(64),
        latestSizeBytes: 612412,
      },
    },
    ...overrides,
  };
}

test("promotion manifest binds release target preflight and rollback boundary", () => {
  const manifest = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: preflight(),
    createdAt: "2026-07-29T03:00:00.000Z",
  });
  assert.equal(manifest.status, "eligible");
  assert.equal(validatePromotionManifest(manifest), manifest);
  assert.equal(manifest.before.runtimeSha, CURRENT_SHA);
  assert.equal(
    manifest.before.latestBackupIsRollbackPointForThisOperation,
    false,
  );
  assert.equal(manifest.rollback.automaticDatabaseDownMigration, false);
  assert.doesNotMatch(JSON.stringify(manifest), /192\.168|\/home\/simon/u);
});

test("promotion manifest preserves capacity blocker and detects already-current", () => {
  const blocked = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: preflight({
      status: "blocked",
      blockers: ["target_disk_capacity_low"],
    }),
  });
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers, ["target_disk_capacity_low"]);

  const current = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: preflight({
      remote: {
        ...preflight().remote,
        runtime: {
          ...preflight().remote.runtime,
          serverSha: SHA,
          webSha: SHA,
        },
      },
    }),
  });
  assert.equal(current.status, "already_current");
});

test("promotion manifest is private idempotent and immutable", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "promotion-manifest-"));
  try {
    const file = path.join(root, "promotion.json");
    const manifest = buildPromotionManifest({
      operationId: OPERATION_ID,
      releaseManifest: releaseManifest(),
      releaseManifestSha256: HASH,
      targetPreflight: preflight(),
    });
    assert.equal(writePromotionManifest(file, manifest).reused, false);
    assert.equal(writePromotionManifest(file, manifest).reused, true);
    const changed = JSON.parse(readFileSync(file, "utf8"));
    changed.release.version = "2026.07.29-2";
    assert.throws(
      () => writePromotionManifest(file, changed),
      /contract|different content|status\/rollback\/redaction/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
