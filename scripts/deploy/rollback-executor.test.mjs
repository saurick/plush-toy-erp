import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  consumeTargetReleaseFetchCredential,
  REMOTE_ROLLBACK_BOOTSTRAP,
  REMOTE_ROLLBACK_RECEIPT_CONTRACT,
  validateRemoteRollbackReceipt,
} from "./rollback-executor.mjs";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const FROM_SHA = "a".repeat(40);
const TO_SHA = "b".repeat(40);
const HASH = "c".repeat(64);
const ROLLBACK_STAGES = [
  "artifact_fetch",
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

test("rollback executor consumes the inherited target fetch credential once", () => {
  const env = {
    KEEP_ME: "safe",
    PLUSH_GITLAB_TOKEN: "provider-token",
    PLUSH_GITLAB_TARGET_FETCH_TOKEN: "target-fetch-token",
  };
  assert.equal(
    consumeTargetReleaseFetchCredential(env),
    "target-fetch-token",
  );
  assert.deepEqual(env, { KEEP_ME: "safe" });
  assert.equal(consumeTargetReleaseFetchCredential(env), undefined);
});

function expected() {
  return {
    operationId: OPERATION_ID,
    targetKey: "demo-133",
    fromGitSha: FROM_SHA,
    toGitSha: TO_SHA,
    toVersion: "2026.07.29-1",
    currentManifestSha256: "d".repeat(64),
    targetManifestSha256: "e".repeat(64),
    rollbackFingerprint: HASH,
    acquisitionExpectedBytes: 0,
    cache: {
      packageHit: true,
      imageHit: true,
      cacheSource: "formal",
      avoidedBytes: 1_325_933_239,
      dockerLoadSkipped: true,
      basis: [
        "release_manifest_sha256",
        "archive_sha256",
        "registry_digest",
        "docker_content_id",
        "embedded_git_sha",
      ],
      stillExecuted: ["migration_status", "health", "ready", "public_entry"],
    },
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
    target: "demo-133",
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
    acquisition: {
      mode: "target_cache",
      downloadedBytes: 0,
      expectedBytes: 0,
      catalogAndChecksumsVerified: true,
      credentialCleanupProven: true,
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
      publicEntry: passed,
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
    cache: expected().cache,
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
  const failedWithoutCredentialCleanup = receipt("failed");
  failedWithoutCredentialCleanup.acquisition.credentialCleanupProven = false;
  assert.throws(
    () =>
      validateRemoteRollbackReceipt(
        failedWithoutCredentialCleanup,
        expected(),
      ),
    /inconsistent/u,
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
  for (const mutate of [
    (value) => {
      value.cache.avoidedBytes += 1;
    },
    (value) => {
      value.cache.cacheSource = "retained_operation";
    },
    (value) => {
      value.cache.imageHit = false;
      value.cache.dockerLoadSkipped = false;
    },
  ]) {
    const changed = structuredClone(receipt());
    mutate(changed);
    assert.throws(
      () => validateRemoteRollbackReceipt(changed, expected()),
      /inconsistent/u,
    );
  }
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
  assert.match(source, /validateReleaseArtifactBinding/u);
  const manifestReader = source.slice(
    source.indexOf("function readReleaseManifest(file)"),
    source.indexOf("export function prepareRollbackTransfer"),
  );
  assert.match(manifestReader, /readBoundedPlainFile/u);
  assert.match(manifestReader, /sha256: snapshot[.]sha256/u);
  assert.doesNotMatch(manifestReader, /sha256File/u);
  assert.match(source, /rollback target manifest is outside its bundle/u);
  const remoteSource = readFileSync(
    new URL("./remote-code-rollback.sh", import.meta.url),
    "utf8",
  );
  assert.match(
    remoteSource,
    /cmp --silent "\$incoming\/remote-code-rollback[.]sh" "\$live_rollback_script"/u,
  );
  assert.match(source, /const REMOTE_ROLLBACK_BOOTSTRAP = String[.]raw/u);
  assert.match(source, /owned_private_directory "\$current\/scripts\/deploy"/u);
  assert.match(source, /cmp --silent "\$incoming_script" "\$live_script"/u);
  assert.match(source, /exec \/bin\/bash "\$live_script" "\$@"/u);
  assert.doesNotMatch(
    source,
    /const remoteScript = `\$\{target[.]filesystem[.]root\}\/incoming\//u,
  );
  assert.match(
    remoteSource,
    /public_cutover_script=\$current\/deployments\/yoyoosun\/scripts\/cutover-public-web[.]sh/u,
  );
});

test("rollback bootstrap executes only an identical script below the physical current tree", (t) => {
  function fixture(name) {
    const root = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), `plush-rollback-bootstrap-${name}-`)),
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const currentDeploy = path.join(root, "current", "scripts", "deploy");
    const incoming = path.join(root, "incoming");
    mkdirSync(currentDeploy, { recursive: true, mode: 0o700 });
    mkdirSync(incoming, { mode: 0o700 });
    const script = Buffer.from(
      "set -euo pipefail\nprintf 'bootstrap-ok:%s\\n' \"$1\"\n",
    );
    writeFileSync(path.join(currentDeploy, "remote-code-rollback.sh"), script, {
      mode: 0o600,
    });
    writeFileSync(path.join(incoming, "remote-code-rollback.sh"), script, {
      mode: 0o600,
    });
    return { root, currentDeploy, incoming };
  }

  function run({ root, incoming }) {
    return spawnSync(
      "/bin/bash",
      [
        "-c",
        REMOTE_ROLLBACK_BOOTSTRAP,
        "plush-rollback-bootstrap",
        root,
        incoming,
        "sentinel",
      ],
      { encoding: "utf8" },
    );
  }

  const valid = fixture("valid");
  const accepted = run(valid);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.stdout, "bootstrap-ok:sentinel\n");

  const mismatch = fixture("mismatch");
  writeFileSync(
    path.join(mismatch.incoming, "remote-code-rollback.sh"),
    "set -euo pipefail\nexit 0\n",
    { mode: 0o600 },
  );
  assert.notEqual(run(mismatch).status, 0);

  const permissive = fixture("permissive");
  chmodSync(permissive.currentDeploy, 0o722);
  assert.notEqual(run(permissive).status, 0);

  const linked = fixture("linked");
  const physicalCurrent = path.join(linked.root, "current-physical");
  const current = path.join(linked.root, "current");
  renameSync(current, physicalCurrent);
  symlinkSync(physicalCurrent, current);
  assert.notEqual(run(linked).status, 0);
});

test("rollback executor has explicit confirmation and no automatic retry path", () => {
  const source = readFileSync(
    new URL("./rollback-executor.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /ROLLBACK:\$\{targetKey\}:\$\{plan[.]from[.]gitSha\}:\$\{plan[.]to[.]gitSha\}/u,
  );
  assert.match(source, /automatic retry is disabled/u);
  assert.match(source, /databaseChangedByExecutor: false/u);
  assert.match(source, /buildFixedTargetRsyncTransfer/u);
  assert.match(source, /PLUSH_GITLAB_TARGET_FETCH_TOKEN/u);
  const executeSource = source.slice(
    source.indexOf("export function executeRollback("),
    source.indexOf("function parseArgs("),
  );
  assert.ok(
    executeSource.indexOf("consumeTargetReleaseFetchCredential()") <
      executeSource.indexOf("runPreflight(targetKey)"),
  );
  assert.doesNotMatch(source, /process[.]env[.]PLUSH_GITLAB_TOKEN/u);
  assert.match(source, /input: targetFetchToken \? `\$\{targetFetchToken\}\\n` : ""/u);
  assert.doesNotMatch(source, /target-release-fetch[.]secret/u);
  const v2ControlTransfer = source.match(
    /const V2_CONTROL_TRANSFER_FILES = Object[.]freeze\(\[[\s\S]+?\]\);/u,
  )?.[0];
  const legacyControlTransfer = source.match(
    /const LEGACY_CONTROL_TRANSFER_FILES = Object[.]freeze\(\[[\s\S]+?\]\);/u,
  )?.[0];
  assert.ok(v2ControlTransfer);
  assert.ok(legacyControlTransfer);
  for (const file of [
    "checksums.sha256",
    "release-artifact.json",
    "release-manifest.json",
    "release-rehearsal.json",
    "sbom.cdx.json",
    "server-image.tar",
    "source.tar",
    "web-image.tar",
  ]) {
    assert.doesNotMatch(
      v2ControlTransfer,
      new RegExp(`"${file.replaceAll(".", "[.]")}"`, "u"),
    );
  }
  for (const file of [
    "current-release-manifest.json",
    "remote-code-rollback.sh",
    "remote-release-acquire.sh",
    "rollback-manifest.json",
    "transfer-checksums.sha256",
  ]) {
    assert.match(
      v2ControlTransfer,
      new RegExp(`"${file.replaceAll(".", "[.]")}"`, "u"),
    );
  }
  assert.doesNotMatch(legacyControlTransfer, /remote-release-acquire[.]sh/u);
  for (const file of [
    "release-artifact.json",
    "release-manifest.json",
    "release-rehearsal.json",
    "sbom.cdx.json",
    "server-image.tar",
    "source.tar",
    "web-image.tar",
  ]) {
    assert.doesNotMatch(
      legacyControlTransfer,
      new RegExp(`"${file.replaceAll(".", "[.]")}"`, "u"),
    );
  }
  assert.match(
    source,
    /const inheritedFetchToken = consumeTargetReleaseFetchCredential\(\)/u,
  );
  const rollbackRoot = source.indexOf("const transferRoot = path.join(");
  const cleanupBoundary = source.indexOf(
    "rmSync(transferRoot, { recursive: true, force: true })",
    rollbackRoot,
  );
  const cleanupTry = source.indexOf("try {", rollbackRoot);
  for (const guardedStep of [
    "transfer = prepareRollbackTransfer(",
    "assertLocalRsync(runCommand)",
    'status: "running"',
  ]) {
    const step = source.indexOf(guardedStep, rollbackRoot);
    assert.ok(
      cleanupTry >= 0 && cleanupTry < step && step < cleanupBoundary,
      `${guardedStep} must stay inside the exact local transfer cleanup boundary`,
    );
  }
  assert.match(source, /targetPrepared = true;\s+prepareCache\(/u);
  assert.match(
    source,
    /const outcomeUnknown = remoteStarted \|\| !targetCleanupProven/u,
  );
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
