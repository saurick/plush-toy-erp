import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  REMOTE_ROLLBACK_RECEIPT_CONTRACT,
  validateRemoteRollbackReceipt,
} from "./rollback-executor.mjs";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const FROM_SHA = "a".repeat(40);
const TO_SHA = "b".repeat(40);
const HASH = "c".repeat(64);
const ROLLBACK_STAGES = [
  "package_verification",
  "target_identity_recheck",
  "release_materialization",
  "image_load_and_readback",
  "static_preflight",
  "service_switch",
  "runtime_verified",
  "public_entry_switch",
  "current_source_switch",
];

function expected() {
  return {
    operationId: OPERATION_ID,
    fromGitSha: FROM_SHA,
    toGitSha: TO_SHA,
    toVersion: "2026.07.29-1",
    currentManifestSha256: "d".repeat(64),
    targetManifestSha256: "e".repeat(64),
    rollbackFingerprint: HASH,
  };
}

function receipt(status = "passed") {
  const passed = status === "passed";
  const visibleStages = passed
    ? ROLLBACK_STAGES
    : ROLLBACK_STAGES.slice(0, ROLLBACK_STAGES.indexOf("service_switch") + 1);
  return {
    schemaVersion: REMOTE_ROLLBACK_RECEIPT_CONTRACT,
    status,
    operationId: OPERATION_ID,
    target: "test-133",
    fromGitSha: FROM_SHA,
    toGitSha: TO_SHA,
    toVersion: "2026.07.29-1",
    currentManifestSha256: "d".repeat(64),
    targetManifestSha256: "e".repeat(64),
    rollbackFingerprint: HASH,
    stage: passed ? "passed" : "service_switch",
    issueCode: passed ? "none" : "rollback_failed_previous_release_restored",
    images: {
      serverContentId: passed ? `sha256:${"1".repeat(64)}` : "unknown",
      webContentId: passed ? `sha256:${"2".repeat(64)}` : "unknown",
    },
    database: {
      downMigrationAutomatic: false,
      restoreAutomatic: false,
      changedByExecutor: false,
    },
    checks: {
      releaseIdentity: passed,
      migrationUnchanged: passed,
      customerConfigUnchanged: passed,
      health: passed,
      ready: passed,
      basicSmoke: passed,
    },
    serviceSwitchStarted: true,
    startedAt: "2026-07-29T00:59:40.000Z",
    finishedAt: "2026-07-29T01:00:00.000Z",
    durationMs: 20_000,
    timings: visibleStages.map((id, index) => ({
      id,
      status:
        !passed && index === visibleStages.length - 1 ? "failed" : "passed",
      durationMs: 1_000,
    })),
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
  };
}

test("rollback executor accepts only identity-bound redacted receipts", () => {
  assert.equal(
    validateRemoteRollbackReceipt(receipt(), expected()).status,
    "passed",
  );
  assert.equal(
    validateRemoteRollbackReceipt(receipt("failed"), expected()).status,
    "failed",
  );
  assert.throws(
    () =>
      validateRemoteRollbackReceipt(
        {
          ...receipt(),
          database: {
            ...receipt().database,
            changedByExecutor: true,
          },
        },
        expected(),
      ),
    /contract/u,
  );
  assert.throws(
    () =>
      validateRemoteRollbackReceipt(
        { ...receipt(), toGitSha: "f".repeat(40) },
        expected(),
      ),
    /contract/u,
  );
  assert.throws(
    () =>
      validateRemoteRollbackReceipt(
        {
          ...receipt(),
          durationMs: 20_000_000_000,
          timings: ROLLBACK_STAGES.map((id) => ({
            id,
            status: "passed",
            durationMs: 1_000_000_000,
          })),
        },
        expected(),
      ),
    /timing contract/u,
  );
});

test("rollback uses the live release control script, not the historical target script", () => {
  const source = readFileSync(
    new URL("./rollback-executor.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /\$\{current[.]manifest[.]gitSha\}:scripts\/deploy\/remote-code-rollback[.]sh/u,
  );
  assert.doesNotMatch(
    source,
    /\$\{target[.]manifest[.]gitSha\}:scripts\/deploy\/remote-code-rollback[.]sh/u,
  );
  const remoteSource = readFileSync(
    new URL("./remote-code-rollback.sh", import.meta.url),
    "utf8",
  );
  assert.match(
    remoteSource,
    /cmp --silent[\s\S]*?"\$incoming\/remote-code-rollback[.]sh"[\s\S]*?"\$current\/scripts\/deploy\/remote-code-rollback[.]sh"/u,
  );
  assert.match(
    remoteSource,
    /public_cutover_script=\$current\/deployments\/yoyoosun\/scripts\/cutover-public-web[.]sh/u,
  );
});

test("rollback executor has explicit confirmation and no automatic retry path", () => {
  const source = readFileSync(
    new URL("./rollback-executor.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /ROLLBACK:test-133:\$\{plan[.]from[.]gitSha\}:\$\{plan[.]to[.]gitSha\}/u,
  );
  assert.match(source, /automatic retry is disabled/u);
  assert.match(source, /databaseChangedByExecutor: false/u);
  assert.match(source, /buildFixedTargetRsyncTransfer/u);
  assert.doesNotMatch(source, /["']scp["']/u);
  assert.doesNotMatch(source, /docker build|compose build|git clone/u);
});

test("rollback executor help states the code-only database boundary", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("./rollback-executor.mjs", import.meta.url).pathname, "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /changes code and images/u);
  assert.match(result.stdout, /never builds/u);
  assert.match(result.stdout, /database down migration/u);
  assert.match(result.stdout, /automatically retries/u);
});
