import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  REMOTE_TARGET_PREFLIGHT_CONTRACT,
  REMOTE_TARGET_PREFLIGHT_SCRIPT,
  parseRemoteTargetPreflight,
  runTargetPreflight,
  runTargetPreflightAsync,
} from "./target-preflight.mjs";

const SHA = "a".repeat(40);
const BACKUP_HASH = "b".repeat(64);
const RETENTION_CANDIDATE_SHAS = Array.from({ length: 9 }, (_, index) =>
  (index + 1).toString(16).repeat(40),
);

function remoteReport(overrides = {}) {
  const values = {
    SCHEMA_VERSION: REMOTE_TARGET_PREFLIGHT_CONTRACT,
    STATUS: "passed",
    TARGET: "demo-133",
    HOSTNAME: "r640",
    USER: "simon",
    ROOT_AVAILABLE_BYTES: String(40 * 1024 ** 3),
    MINIMUM_AVAILABLE_BYTES: String(30 * 1024 ** 3),
    CAPACITY_STATUS: "passed",
    ENV_STATUS: "passed",
    RESOURCE_IDENTITY_STATUS: "passed",
    COMPOSE_STATUS: "passed",
    DATABASE_STATUS: "passed",
    DATABASE_NAME: "plush_erp_demo_v1",
    MIGRATION_VERSION: "20260728100514",
    ACTIVE_CONFIG_REVISION:
      "yoyoosun-customer-trial-133-package-v7.runtime-manifest-v1",
    ACTIVE_CONFIG_PRODUCT_VERSION: "customer-trial-133-test-2026.07.16-v5",
    ACTIVE_DATASET_VERSION: "2026.07.16-v5",
    DEBUG_ENV: "prod",
    DEBUG_SEED_ENABLED: "false",
    DEBUG_SEED_ALLOWED: "false",
    DEBUG_CLEANUP_ENABLED: "false",
    DEBUG_CLEANUP_ALLOWED: "false",
    DEBUG_BUSINESS_CLEAR_ENABLED: "false",
    DEBUG_BUSINESS_CLEAR_ALLOWED: "false",
    SERVER_SHA: SHA,
    WEB_SHA: SHA,
    SERVER_HEALTH: "passed",
    SERVER_READY: "passed",
    WEB_HEALTH: "passed",
    PUBLIC_ENTRY_STATUS: "passed",
    PUBLIC_CONTAINER: `plush-toy-erp-demo-web-public-${SHA.slice(0, 8)}`,
    PUBLIC_SHA: SHA,
    PUBLIC_HEALTH: "passed",
    PUBLIC_PROVIDER: "passed",
    MIGRATION_LOCK_STATUS: "free",
    BACKUP_TOOLING_STATUS: "passed",
    ARCHIVE_TOOLING_STATUS: "passed",
    LATEST_BACKUP_SHA256: BACKUP_HASH,
    LATEST_BACKUP_SIZE_BYTES: "612412",
    RELEASE_DIRECTORY_COUNT: "20",
    IDENTIFIED_RELEASE_COUNT: "13",
    PROTECTED_RELEASE_COUNT: "4",
    RETENTION_CANDIDATE_COUNT: String(RETENTION_CANDIDATE_SHAS.length),
    RETENTION_CANDIDATE_BYTES: "123456",
    RETENTION_CANDIDATE_SHAS: RETENTION_CANDIDATE_SHAS.join(","),
    MANUAL_REVIEW_RELEASE_COUNT: "7",
    FORMAL_CACHE_COUNT: "2",
    OPERATION_DIRECTORY_COUNT: "25",
    RETAINED_OPERATION_COUNT: "0",
    STOPPED_PUBLIC_CONTAINER_COUNT: "4",
    RETENTION_MODE: "preview_only",
    BLOCKERS: "none",
    ...overrides,
  };
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

test("target preflight parser returns bounded redacted evidence", () => {
  const report = parseRemoteTargetPreflight(remoteReport());
  assert.equal(report.status, "passed");
  assert.equal(report.runtime.resourceIdentity, "passed");
  assert.equal(report.runtime.serverSha, SHA);
  assert.equal(report.runtime.migrationVersion, "20260728100514");
  assert.deepEqual(report.runtime.activeCustomerConfig, {
    revision: "yoyoosun-customer-trial-133-package-v7.runtime-manifest-v1",
    productVersion: "customer-trial-133-test-2026.07.16-v5",
    datasetVersion: "2026.07.16-v5",
  });
  assert.deepEqual(report.runtime.debug, {
    environment: "prod",
    seedEnabled: false,
    seedAllowed: false,
    cleanupEnabled: false,
    cleanupAllowed: false,
    businessDataClearEnabled: false,
    businessDataClearAllowed: false,
  });
  assert.equal(report.publicEntry.gitSha, SHA);
  assert.equal(report.publicEntry.endpoint, "https://demo.yoyoosun.net");
  assert.equal(report.backup.freshBackupRequiredForPromotion, true);
  assert.deepEqual(report.archiveTooling, {
    status: "passed",
    zstdRequired: true,
  });
  assert.deepEqual(report.retention, {
    mode: "preview_only",
    releaseDirectoryCount: 20,
    identifiedReleaseCount: 13,
    protectedReleaseCount: 4,
    candidateCount: 9,
    candidateBytes: 123456,
    candidateShas: RETENTION_CANDIDATE_SHAS,
    manualReviewReleaseCount: 7,
    formalCacheCount: 2,
    operationDirectoryCount: 25,
    retainedOperationCount: 0,
    stoppedPublicContainerCount: 4,
    deletionPerformed: false,
    candidateStillRequiresManualReadback: true,
  });
  assert.equal("ssh" in report, false);
  assert.doesNotMatch(JSON.stringify(report), /192\.168|\/home\/simon/u);
});

test("target preflight parser fails closed on identity and blocker drift", () => {
  assert.throws(
    () => parseRemoteTargetPreflight(remoteReport({ HOSTNAME: "other" })),
    /identity/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({ DEBUG_CLEANUP_ALLOWED: "true" }),
      ),
    /debug cleanup allowed must be false/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({
          STATUS: "blocked",
          CAPACITY_STATUS: "blocked",
          BLOCKERS: "none",
        }),
      ),
    /blocker\/status/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(`${remoteReport()}UNEXPECTED=/private/path\n`),
    /key is invalid/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({ RETENTION_CANDIDATE_COUNT: "8" }),
      ),
    /retention candidate identity/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({ MANUAL_REVIEW_RELEASE_COUNT: "6" }),
      ),
    /contradicts the fixed contract/u,
  );
  const partial = parseRemoteTargetPreflight(
    remoteReport({
      STATUS: "blocked",
      WEB_SHA: "unknown",
      PUBLIC_ENTRY_STATUS: "blocked",
      PUBLIC_SHA: "unknown",
      PUBLIC_HEALTH: "failed",
      PUBLIC_PROVIDER: "failed",
      BLOCKERS:
        "target_public_entry_container_invalid,target_runtime_sha_mismatch,target_web_container_invalid",
    }),
  );
  assert.equal(partial.status, "blocked");
  assert.equal(partial.runtime.webSha, "unknown");
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({ MIGRATION_VERSION: "2026-07-28" }),
      ),
    /migration version/u,
  );
  assert.throws(
    () =>
      parseRemoteTargetPreflight(
        remoteReport({ ACTIVE_CONFIG_REVISION: "secret/value" }),
      ),
    /customer config revision/u,
  );
});

test("target preflight uses only fixed SSH destination and streamed script", () => {
  let invocation;
  const report = runTargetPreflight("demo-133", {
    now: "2026-07-29T02:00:00.000Z",
    runCommand: (command, args, options) => {
      invocation = { command, args, options };
      return { status: 0, stdout: remoteReport(), stderr: "" };
    },
  });
  assert.equal(report.status, "passed");
  assert.equal(invocation.command, "ssh");
  assert.deepEqual(invocation.args.slice(-3), [
    "simon@192.168.0.133",
    "bash",
    "-s",
  ]);
  assert.equal(invocation.options.input, REMOTE_TARGET_PREFLIGHT_SCRIPT);
  assert.doesNotMatch(
    invocation.args.join(" "),
    /docker|compose|\/home\/simon|plush_erp/u,
  );
  assert.equal(
    Object.keys(invocation.options).some((key) =>
      /password|secret|token/iu.test(key),
    ),
    false,
  );
  assert.doesNotMatch(REMOTE_TARGET_PREFLIGHT_SCRIPT, /curl\s+-k/u);
});

test("async target preflight keeps the dev server event loop non-blocking and bounded", async () => {
  let streamedInput = "";
  let killed = false;
  const spawnCommand = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new EventEmitter();
    child.stdin.end = (input) => {
      streamedInput = input;
      queueMicrotask(() => {
        child.stdout.write(remoteReport());
        child.emit("close", 0);
      });
    };
    child.kill = () => {
      killed = true;
    };
    return child;
  };
  const report = await runTargetPreflightAsync("demo-133", {
    spawnCommand,
    now: "2026-08-08T03:00:00.000Z",
    timeoutMs: 100,
  });
  assert.equal(report.status, "passed");
  assert.equal(streamedInput, REMOTE_TARGET_PREFLIGHT_SCRIPT);
  assert.equal(killed, false);

  await assert.rejects(
    runTargetPreflightAsync("demo-133", {
      timeoutMs: 5,
      spawnCommand: () => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new EventEmitter();
        child.stdin.end = () => {};
        child.kill = () => {};
        return child;
      },
    }),
    /timed out/u,
  );
});

test("target preflight CLI reports current disk blocker without mutation", () => {
  const fixtureRoot = mkdtempSync(
    path.join(tmpdir(), "plush-target-preflight-cli-"),
  );
  const fakeSSH = path.join(fixtureRoot, "ssh");
  const marker = path.join(fixtureRoot, "ssh-invoked");
  const blockedRemoteReport = remoteReport({
    STATUS: "blocked",
    ROOT_AVAILABLE_BYTES: String(14 * 1024 ** 3),
    CAPACITY_STATUS: "blocked",
    BLOCKERS: "target_disk_capacity_low",
  });
  writeFileSync(
    fakeSSH,
    `#!/bin/sh
set -eu
cat >/dev/null
: > "$TARGET_PREFLIGHT_FAKE_SSH_MARKER"
printf '%s' "$TARGET_PREFLIGHT_FAKE_SSH_REPORT"
`,
  );
  chmodSync(fakeSSH, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "target-preflight.mjs"),
        "--target",
        "demo-133",
        "--json",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fixtureRoot}${path.delimiter}${process.env.PATH || ""}`,
          TARGET_PREFLIGHT_FAKE_SSH_MARKER: marker,
          TARGET_PREFLIGHT_FAKE_SSH_REPORT: blockedRemoteReport,
        },
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 2, result.stderr);
    assert.equal(
      existsSync(marker),
      true,
      "CLI must use the hermetic fake SSH",
    );
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "blocked");
    assert(report.blockers.includes("target_disk_capacity_low"));
    assert(report.remote.capacity.availableBytes < 30 * 1024 ** 3);
    assert.equal(
      report.notProven.includes("new release promotion and smoke"),
      true,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("remote target preflight script is read-only and contains no build command", () => {
  assert.doesNotMatch(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /\b(?:docker\s+build|pnpm|go\s+build|make\s+build|git\s+clone|git\s+checkout)\b/u,
  );
  assert.doesNotMatch(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /\b(?:rm|mv|cp|mkdir|touch|truncate|docker\s+load|docker\s+compose.+up|atlas\s+migrate\s+apply)\b/u,
  );
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /minimum_available_bytes=32212254720/u,
  );
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /\/usr\/bin\/rsync --version/u);
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /target_rsync_unavailable/u);
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /trial_atlas_bin=\/home\/simon\/plush-toy-erp-demo-v1\/tools\/atlas\/v1[.]2[.]0\/atlas/u,
  );
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /trial_atlas_required_version=v1[.]2[.]0/u,
  );
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /stat -c '%u'/u);
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /target_atlas_tooling_invalid/u);
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /target_archive_tooling_unavailable/u,
  );
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /tar --help 2>\/dev\/null \| grep -F -- '--zstd' >\/dev\/null/u,
  );
  assert.doesNotMatch(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /tar --help 2>\/dev\/null \| grep -Fq -- '--zstd'/u,
  );
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /retention_mode=preview_only/u);
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /release-cache/u);
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /PUBLIC_ENTRY_STATUS/u);
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /target_public_entry_sha_mismatch/u,
  );
  assert.match(REMOTE_TARGET_PREFLIGHT_SCRIPT, /fresh pre-migration/u);
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /SELECT version FROM atlas_schema_revisions[.]atlas_schema_revisions/u,
  );
  assert.match(
    REMOTE_TARGET_PREFLIGHT_SCRIPT,
    /jsonb_extract_path_text\(compiled_snapshot, 'datasetVersion'\)/u,
  );
});
