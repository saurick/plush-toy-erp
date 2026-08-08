import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  executeDatabaseRebuild,
  prepareDatabaseRebuildTransfer,
  REMOTE_DATABASE_REBUILD_RECEIPT_CONTRACT,
  validateRemoteDatabaseRebuildReceipt,
} from "./database-rebuild-executor.mjs";
import { prepareDatabaseRebuild } from "./database-rebuild-controller.mjs";
import { buildDatabaseRebuildManifest } from "./database-rebuild-manifest.mjs";
import {
  readDeliveryOperation,
  resolveDeliveryOperationStore,
} from "./delivery-operation-store.mjs";
import { sha256File } from "./release-catalog.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";

const SHA = "a".repeat(40);
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const MANIFEST_HASH = "b".repeat(64);
const FINGERPRINT = "c".repeat(64);
const MIGRATION = "20260731124000";

function receipt(overrides = {}) {
  return {
    schemaVersion: REMOTE_DATABASE_REBUILD_RECEIPT_CONTRACT,
    status: "passed",
    operationId: OPERATION_ID,
    target: "test-133",
    gitSha: SHA,
    version: "2026.08.03-1",
    releaseManifestSha256: MANIFEST_HASH,
    databaseRebuildFingerprint: FINGERPRINT,
    stage: "passed",
    issueCode: "none",
    database: {
      logicalName: "plush_erp_uat_20260716_v5",
      previousDataAlias: `rollback-${SHA.slice(0, 12)}-${OPERATION_ID.slice(0, 8)}`,
      dataSwitchStarted: true,
      predecessorRecovered: false,
      predecessorPreserved: true,
      freshDirectoryActive: true,
      automaticDeletion: false,
      systemIdentifierBefore: "7582156890123456789",
      systemIdentifierAfter: "7582156890987654321",
    },
    rollbackPoint: {
      backupAlias: `pre-rebuild-${SHA.slice(0, 12)}-${OPERATION_ID}`,
      backupSha256: "d".repeat(64),
      backupSizeBytes: 612412,
      restoreChecked: true,
    },
    migration: {
      automaticDownMigration: false,
      applyStarted: true,
      readback: MIGRATION,
    },
    bootstrap: {
      started: true,
      completed: true,
      secretPersistedOnTarget: false,
    },
    checks: {
      releaseIdentity: true,
      freshDatabase: true,
      emptyBusinessBaseline: true,
      health: true,
      ready: true,
      webHealth: true,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsolutePaths: false,
      containsRawEnvironmentValues: false,
      containsRawLogs: false,
    },
    notProven: [
      "customer configuration activation and effective-session readback",
      "nine-stage acceptance dataset and 52-page browser/PDF regression",
      "credential rotation and 11-account role smoke",
      "customer UAT and sign-off",
    ],
    finishedAt: "2026-08-03T12:30:00Z",
    ...overrides,
  };
}

const expected = {
  operationId: OPERATION_ID,
  gitSha: SHA,
  version: "2026.08.03-1",
  migration: MIGRATION,
  releaseManifestSha256: MANIFEST_HASH,
  databaseRebuildFingerprint: FINGERPRINT,
};

function releaseManifest() {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: "2026.08.03-1",
    gitSha: SHA,
    strict: releaseManifestStrictEvidenceFixture({
      fingerprint: "1".repeat(64),
    }),
    artifact: {
      manifestSha256: "2".repeat(64),
      sourceArchiveSha256: "3".repeat(64),
    },
    migration: { latest: MIGRATION, sequenceSha256: "4".repeat(64) },
    customerConfig: { sourceSha256: "5".repeat(64) },
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: `sha256:${"6".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-server@sha256:${"6".repeat(64)}`,
        sourceContentId: `sha256:${"7".repeat(64)}`,
        platform: "linux/amd64",
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: `sha256:${"8".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-web@sha256:${"8".repeat(64)}`,
        sourceContentId: `sha256:${"9".repeat(64)}`,
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

function preflight() {
  return {
    schemaVersion: "plush.target-preflight/v1",
    status: "passed",
    target: "test-133",
    customer: "yoyoosun",
    blockers: [],
    remote: {
      capacity: {
        availableBytes: 80 * 1024 ** 3,
        minimumAvailableBytes: 30 * 1024 ** 3,
      },
      runtime: {
        databaseName: "plush_erp_uat_20260716_v5",
        serverSha: SHA,
        webSha: SHA,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
      },
    },
  };
}

function executableFixture(t, suffix) {
  const root = mkdtempSync(path.join(os.tmpdir(), `database-rebuild-${suffix}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "output"), { recursive: true });
  const releasePath = path.join(root, "release-manifest.json");
  writeFileSync(releasePath, `${JSON.stringify(releaseManifest(), null, 2)}\n`);
  const store = resolveDeliveryOperationStore(root);
  const prepared = prepareDatabaseRebuild(
    {
      repoRoot: root,
      releaseManifestPath: releasePath,
      targetKey: "test-133",
      idempotencyKey: `rebuild-database:test-133:${suffix}`,
      operationStore: store,
    },
    { runPreflight: () => preflight() },
  );
  return { root, releasePath, store, prepared };
}

test("database rebuild executor accepts only a redacted identity-bound receipt", () => {
  assert.equal(
    validateRemoteDatabaseRebuildReceipt(receipt(), expected).status,
    "passed",
  );
  assert.throws(
    () =>
      validateRemoteDatabaseRebuildReceipt(
        receipt({
          database: {
            ...receipt().database,
            systemIdentifierAfter: receipt().database.systemIdentifierBefore,
          },
        }),
        expected,
      ),
    /inconsistent/u,
  );
  assert.throws(
    () =>
      validateRemoteDatabaseRebuildReceipt(
        receipt({
          redaction: { ...receipt().redaction, containsSecrets: true },
        }),
        expected,
      ),
    /contract/u,
  );
});

test("failed database rebuild receipts cannot masquerade as passed", () => {
  const failed = receipt({
    status: "failed",
    stage: "package_verification",
    issueCode: "database_rebuild_failed_before_data_switch",
    database: {
      ...receipt().database,
      dataSwitchStarted: false,
      predecessorPreserved: false,
      freshDirectoryActive: false,
      systemIdentifierBefore: "unknown",
      systemIdentifierAfter: "unknown",
    },
    rollbackPoint: {
      ...receipt().rollbackPoint,
      backupSha256: "none",
      backupSizeBytes: 0,
      restoreChecked: false,
    },
    migration: {
      automaticDownMigration: false,
      applyStarted: false,
      readback: "unknown",
    },
    bootstrap: {
      started: false,
      completed: false,
      secretPersistedOnTarget: false,
    },
    checks: Object.fromEntries(
      Object.keys(receipt().checks).map((key) => [key, false]),
    ),
  });
  assert.equal(
    validateRemoteDatabaseRebuildReceipt(failed, expected).status,
    "failed",
  );
  assert.throws(
    () =>
      validateRemoteDatabaseRebuildReceipt(
        receipt({ status: "not_proven", issueCode: "none" }),
        expected,
      ),
    /inconsistent/u,
  );
});

test("database rebuild transfer keeps the secret private and outside checksums", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "database-rebuild-transfer-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "output"), { recursive: true });
  const releasePath = path.join(root, "release-manifest.json");
  writeFileSync(releasePath, `${JSON.stringify(releaseManifest(), null, 2)}\n`);
  const releaseHash = sha256File(releasePath);
  const plan = buildDatabaseRebuildManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: releaseHash,
    targetPreflight: preflight(),
  });
  const destination = path.join(root, "output", "transfer");
  const runCommand = (command, args) => {
    if (command === "git" && args[0] === "show") {
      return { status: 0, stdout: "#!/usr/bin/env bash\nexit 0\n", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const transfer = prepareDatabaseRebuildTransfer(
    {
      repoRoot: root,
      releaseManifestPath: releasePath,
      databaseRebuildPlan: plan,
      destination,
    },
    { runCommand, createSecret: () => "FreshAdmin9!abcd" },
  );
  assert.equal(statSync(transfer.secretFile).mode & 0o777, 0o600);
  assert.equal(readFileSync(transfer.secretFile, "utf8"), "FreshAdmin9!abcd");
  const checksums = readFileSync(
    path.join(destination, "transfer-checksums.sha256"),
    "utf8",
  );
  assert.doesNotMatch(checksums, /bootstrap-admin\.secret/u);
  assert.doesNotMatch(
    readFileSync(path.join(destination, "database-rebuild-manifest.json"), "utf8"),
    /FreshAdmin9/u,
  );
  chmodSync(transfer.secretFile, 0o600);
});

test("database rebuild executor blocks an unexplained immediate preflight failure before writes", (t) => {
  const { root, releasePath, store, prepared } = executableFixture(
    t,
    "executor-preflight-blocked",
  );
  let commands = 0;
  const report = executeDatabaseRebuild(
    {
      repoRoot: root,
      operationId: prepared.operation.id,
      releaseManifestPath: releasePath,
      confirmation:
        `REBUILD_DATABASE:test-133:${SHA}:${prepared.operation.id}`,
      operationStore: store,
    },
    {
      runPreflight: () => ({
        ...preflight(),
        status: "blocked",
        blockers: [],
      }),
      runCommand: () => {
        commands += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  );
  assert.equal(report.operation.status, "blocked");
  assert.equal(report.targetWriteStarted, false);
  assert.equal(report.receipt, null);
  assert.equal(commands, 0);
  assert.deepEqual(report.operation.issues.map((issue) => issue.code), [
    "database_rebuild_target_preflight_blocked",
  ]);
});

test("database rebuild executor removes the remote secret after a partial transfer", (t) => {
  const { root, releasePath, store, prepared } = executableFixture(
    t,
    "partial-transfer-cleanup",
  );
  const sshInputs = [];
  const runCommand = (command, args, options = {}) => {
    if (command === "git" && args[0] === "show") {
      return { status: 0, stdout: "#!/usr/bin/env bash\nexit 0\n", stderr: "" };
    }
    if (command === "git") return { status: 0, stdout: "", stderr: "" };
    if (command === "ssh") {
      sshInputs.push(String(options.input || ""));
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "rsync" && args[0] === "--version") {
      return {
        status: 0,
        stdout: "rsync  version 3.4.4  protocol version 32\n",
        stderr: "",
      };
    }
    if (command === "rsync") {
      return { status: 1, stdout: "", stderr: "transfer interrupted" };
    }
    throw new Error(`unexpected command: ${command}`);
  };
  assert.throws(
    () =>
      executeDatabaseRebuild(
        {
          repoRoot: root,
          operationId: prepared.operation.id,
          releaseManifestPath: releasePath,
          confirmation:
            `REBUILD_DATABASE:test-133:${SHA}:${prepared.operation.id}`,
          operationStore: store,
        },
        {
          runPreflight: () => preflight(),
          runCommand,
          createSecret: () => "FreshAdmin9!abcd",
        },
      ),
    /transfer fixed database rebuild package failed/u,
  );
  assert.equal(sshInputs.length, 2);
  assert.match(sshInputs[1], /bootstrap-admin\.secret/u);
  assert.match(sshInputs[1], /rm -f -- "\$secret"/u);
  assert.doesNotMatch(sshInputs[1], /rm\s+-rf/u);
  assert.equal(
    readDeliveryOperation(store, prepared.operation.id).status,
    "failed",
  );
});

test("database rebuild executor freezes a partial transfer when secret cleanup is unproven", (t) => {
  const { root, releasePath, store, prepared } = executableFixture(
    t,
    "partial-transfer-cleanup-unknown",
  );
  let sshCalls = 0;
  const runCommand = (command, args, options = {}) => {
    if (command === "git" && args[0] === "show") {
      return { status: 0, stdout: "#!/usr/bin/env bash\nexit 0\n", stderr: "" };
    }
    if (command === "git") return { status: 0, stdout: "", stderr: "" };
    if (command === "ssh") {
      sshCalls += 1;
      return {
        status: sshCalls === 1 ? 0 : 1,
        stdout: "",
        stderr: options.input ? "cleanup interrupted" : "",
      };
    }
    if (command === "rsync" && args[0] === "--version") {
      return {
        status: 0,
        stdout: "rsync  version 3.4.4  protocol version 32\n",
        stderr: "",
      };
    }
    if (command === "rsync") {
      return { status: 1, stdout: "", stderr: "transfer interrupted" };
    }
    throw new Error(`unexpected command: ${command}`);
  };
  assert.throws(
    () =>
      executeDatabaseRebuild(
        {
          repoRoot: root,
          operationId: prepared.operation.id,
          releaseManifestPath: releasePath,
          confirmation:
            `REBUILD_DATABASE:test-133:${SHA}:${prepared.operation.id}`,
          operationStore: store,
        },
        {
          runPreflight: () => preflight(),
          runCommand,
          createSecret: () => "FreshAdmin9!abcd",
        },
      ),
    /bootstrap secret cleanup is unproven/u,
  );
  assert.equal(
    readDeliveryOperation(store, prepared.operation.id).status,
    "not_proven",
  );
});

test("database rebuild executor help requires exact confirmation", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "database-rebuild-executor.mjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REBUILD_DATABASE:test-133/u);
  assert.match(result.stdout, /never deletes a database generation/iu);
});
