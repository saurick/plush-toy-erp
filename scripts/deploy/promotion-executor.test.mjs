import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import {
  REMOTE_PROMOTION_RECEIPT_CONTRACT,
  validateRemotePromotionReceipt,
} from "./promotion-executor.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";

function receipt(overrides = {}) {
  return {
    schemaVersion: REMOTE_PROMOTION_RECEIPT_CONTRACT,
    status: "passed",
    operationId: OPERATION_ID,
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    releaseManifestSha256: HASH,
    promotionFingerprint: "c".repeat(64),
    stage: "passed",
    issueCode: "none",
    before: { runtimeSha: "d".repeat(40) },
    images: {
      serverContentId: `sha256:${"e".repeat(64)}`,
      webContentId: `sha256:${"f".repeat(64)}`,
    },
    rollbackPoint: {
      backupAlias: `pre-migration-${SHA.slice(0, 12)}-${OPERATION_ID}`,
      backupSha256: "1".repeat(64),
      backupSizeBytes: 612412,
      restoreChecked: true,
    },
    migration: {
      automaticDownMigration: false,
      applyStarted: true,
    },
    checks: {
      releaseIdentity: true,
      health: true,
      ready: true,
      basicSmoke: true,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsolutePaths: false,
      containsRawEnvironmentValues: false,
      containsRawLogs: false,
    },
    notProven: [
      "credentialed role matrix and PDF smoke",
      "customer UAT and sign-off",
    ],
    finishedAt: "2026-07-29T04:00:00Z",
    ...overrides,
  };
}

const expected = {
  operationId: OPERATION_ID,
  gitSha: SHA,
  version: "2026.07.29-1",
  releaseManifestSha256: HASH,
  promotionFingerprint: "c".repeat(64),
};

test("promotion executor accepts only an identity-bound redacted receipt", () => {
  assert.equal(validateRemotePromotionReceipt(receipt(), expected).status, "passed");
  assert.throws(
    () =>
      validateRemotePromotionReceipt(
        receipt({ operationId: "223e4567-e89b-42d3-a456-426614174000" }),
        expected,
      ),
    /contract/u,
  );
  assert.throws(
    () =>
      validateRemotePromotionReceipt(
        receipt({
          redaction: {
            ...receipt().redaction,
            containsRawLogs: true,
          },
        }),
        expected,
      ),
    /contract/u,
  );
});

test("failed and unknown receipts cannot masquerade as passed", () => {
  const failed = receipt({
    status: "failed",
    issueCode: "promotion_failed_before_migration",
    checks: {
      releaseIdentity: false,
      health: false,
      ready: false,
      basicSmoke: false,
    },
  });
  assert.equal(validateRemotePromotionReceipt(failed, expected).status, "failed");
  const earlyFailure = receipt({
    status: "failed",
    issueCode: "promotion_failed_before_migration",
    before: { runtimeSha: "unknown" },
    images: {
      serverContentId: "unknown",
      webContentId: "unknown",
    },
    rollbackPoint: {
      backupAlias: `pre-migration-${SHA.slice(0, 12)}-${OPERATION_ID}`,
      backupSha256: "none",
      backupSizeBytes: 0,
      restoreChecked: false,
    },
    migration: {
      automaticDownMigration: false,
      applyStarted: false,
    },
    checks: {
      releaseIdentity: false,
      health: false,
      ready: false,
      basicSmoke: false,
    },
  });
  assert.equal(
    validateRemotePromotionReceipt(earlyFailure, expected).status,
    "failed",
  );
  assert.throws(
    () =>
      validateRemotePromotionReceipt(
        receipt({ status: "not_proven", issueCode: "none" }),
        expected,
      ),
    /inconsistent/u,
  );
});

test("promotion executor help requires ready operation and explicit confirmation", () => {
  const script = path.join(import.meta.dirname, "promotion-executor.mjs");
  const result = spawnSync(process.execPath, [script, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /operation must already be ready/iu);
  assert.match(result.stdout, /PROMOTE:test-133/u);
});

test("promotion executor contains no target build or automatic retry path", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "promotion-executor.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /docker\s+build|buildx|pnpm|go\s+build/u);
  assert.doesNotMatch(source, /setTimeout|setInterval|fresh lifecycle/iu);
  assert.match(source, /targetWriteStarted: false/u);
  assert.match(source, /automatic retry is disabled/u);
});
