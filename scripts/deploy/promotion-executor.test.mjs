import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createOrReuseDeliveryOperation,
  DELIVERY_OPERATION_STORE_REPO_ROOT_ENV,
  resolveDeliveryOperationStore,
} from "./delivery-operation-store.mjs";

import {
  classifyImmediatePromotionPreflight,
  consumeTargetReleaseFetchCredential,
  REMOTE_PROMOTION_RECEIPT_CONTRACT,
  REMOTE_TARGET_INITIALIZATION_RECEIPT_CONTRACT,
  validateRemotePromotionReceipt,
  validateRemoteTargetInitializationReceipt,
} from "./promotion-executor.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const PROMOTION_STAGES = [
  "artifact_fetch",
  "package_verification",
  "capacity_recheck",
  "release_materialization",
  "image_load_and_readback",
  "fresh_backup_and_restore_check",
  "env_and_static_preflight",
  "maintenance_window",
  "migration_plan",
  "migration_apply_started",
  "migration_applied",
  "compose_start",
  "runtime_verified",
  "public_entry_switch",
  "current_source_switch",
];

test("promotion executor consumes the inherited target fetch credential once", () => {
  const env = {
    KEEP_ME: "safe",
    PLUSH_GITLAB_TOKEN: "provider-token",
    PLUSH_GITLAB_TARGET_FETCH_TOKEN: "target-fetch-token",
  };
  assert.equal(consumeTargetReleaseFetchCredential(env), "target-fetch-token");
  assert.deepEqual(env, { KEEP_ME: "safe" });
  assert.equal(consumeTargetReleaseFetchCredential(env), undefined);
});

test("promotion CLI reads the canonical operation store selected by its parent service", (t) => {
  const canonicalRoot = mkdtempSync(
    path.join(os.tmpdir(), "promotion-operation-canonical-"),
  );
  const executionRoot = mkdtempSync(
    path.join(os.tmpdir(), "promotion-operation-execution-"),
  );
  t.after(() => {
    rmSync(canonicalRoot, { recursive: true, force: true });
    rmSync(executionRoot, { recursive: true, force: true });
  });
  const store = resolveDeliveryOperationStore(canonicalRoot);
  createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "customer-test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: "version-center:promotion:canonical-store",
    operationId: OPERATION_ID,
  });
  const script = fileURLToPath(
    new URL("./promotion-executor.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--operation-id",
      OPERATION_ID,
      "--bundle-dir",
      path.join(executionRoot, "bundle"),
      "--release-manifest",
      path.join(executionRoot, "release-manifest.json"),
      "--confirmation",
      `PROMOTE:customer-test-133:${SHA}:${OPERATION_ID}`,
      "--json",
    ],
    {
      cwd: executionRoot,
      env: {
        ...process.env,
        [DELIVERY_OPERATION_STORE_REPO_ROOT_ENV]: canonicalRoot,
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not in the eligible ready state/u);
  assert.equal(result.stderr.includes(canonicalRoot), false);
});

function blockedAbsentCustomerConfigPreflight(overrides = {}) {
  return {
    status: "blocked",
    blockers: ["target_customer_config_readback_failed"],
    remote: {
      runtime: {
        database: "blocked",
        customerConfigState: "absent",
        serverSha: "d".repeat(40),
        webSha: "d".repeat(40),
        activeCustomerConfig: {
          revision: "unknown",
          productVersion: "unknown",
          datasetVersion: "unknown",
        },
      },
    },
    ...overrides,
  };
}

const promotionRelation = Object.freeze({
  actionClass: "promote",
  actionReason: "candidate_is_descendant",
  currentGitSha: "d".repeat(40),
  candidateGitSha: SHA,
});

function receipt(overrides = {}) {
  return {
    schemaVersion: REMOTE_PROMOTION_RECEIPT_CONTRACT,
    status: "passed",
    operationId: OPERATION_ID,
    target: "demo-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    releaseManifestSha256: HASH,
    releaseRehearsalSha256: "9".repeat(64),
    promotionFingerprint: "c".repeat(64),
    stage: "passed",
    issueCode: "none",
    before: { runtimeSha: "d".repeat(40) },
    acquisition: {
      mode: "target_cache",
      downloadedBytes: 0,
      expectedBytes: 0,
      catalogAndChecksumsVerified: true,
      credentialCleanupProven: true,
    },
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
      stillExecuted: ["migration", "health", "ready", "public_entry"],
    },
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
      publicEntry: true,
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
    startedAt: "2026-07-29T03:59:40Z",
    finishedAt: "2026-07-29T04:00:00Z",
    durationMs: 20_000,
    timings: PROMOTION_STAGES.map((id) => ({
      id,
      status: "passed",
      durationMs: 1_000,
    })),
    ...overrides,
  };
}

const expected = {
  operationId: OPERATION_ID,
  targetKey: "demo-133",
  gitSha: SHA,
  version: "2026.07.29-1",
  releaseManifestSha256: HASH,
  releaseRehearsalSha256: "9".repeat(64),
  promotionFingerprint: "c".repeat(64),
  acquisitionExpectedBytes: 0,
};

const initializationExpected = {
  operationId: OPERATION_ID,
  targetKey: "demo-133",
  gitSha: SHA,
  version: "2026.07.29-1",
  migration: "20260729000000",
  releaseManifestSha256: HASH,
  releaseRehearsalSha256: "9".repeat(64),
  initializationFingerprint: "c".repeat(64),
  acquisitionExpectedBytes: 581_043_372,
};

function initializationReceipt(overrides = {}) {
  return {
    schemaVersion: REMOTE_TARGET_INITIALIZATION_RECEIPT_CONTRACT,
    status: "passed",
    operationId: OPERATION_ID,
    target: "demo-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    releaseManifestSha256: HASH,
    releaseRehearsalSha256: "9".repeat(64),
    initializationFingerprint: "c".repeat(64),
    stage: "passed",
    issueCode: "none",
    before: { targetState: "absent" },
    acquisition: {
      mode: "gitlab_internal",
      downloadedBytes: 581_043_372,
      expectedBytes: 581_043_372,
      durationMs: 4_000,
      catalogAndChecksumsVerified: true,
      credentialCleanupProven: true,
    },
    images: {
      serverContentId: `sha256:${"e".repeat(64)}`,
      webContentId: `sha256:${"f".repeat(64)}`,
    },
    migration: {
      applyStarted: true,
      automaticDownMigration: false,
      readback: "20260729000000",
    },
    bootstrap: {
      started: true,
      completed: true,
      secretPersistedOnTarget: false,
    },
    rollbackPoint: {
      backupAlias: `initial-${SHA.slice(0, 12)}-${OPERATION_ID}`,
      backupSha256: "1".repeat(64),
      backupSizeBytes: 612_412,
      restoreChecked: true,
    },
    checks: {
      staticConfig: true,
      releaseIdentity: true,
      health: true,
      ready: true,
      basicSmoke: true,
      publicEntry: true,
      backupRestore: true,
      dataEnvironment: true,
    },
    rollback: {
      complete: true,
      retainedTarget: true,
      preservesOtherTargets: true,
    },
    finishedAt: "2026-07-29T04:00:00Z",
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsolutePaths: false,
      containsRawEnvironmentValues: false,
      containsRawLogs: false,
    },
    notProven: [
      "demo seed or customer-test business acceptance data",
      "customer UAT and sign-off",
    ],
    ...overrides,
  };
}

test("promotion executor accepts only an identity-bound redacted receipt", () => {
  assert.equal(
    validateRemotePromotionReceipt(receipt(), expected).status,
    "passed",
  );
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
  assert.throws(
    () =>
      validateRemotePromotionReceipt(
        receipt({
          durationMs: 20_000_000_000,
          timings: PROMOTION_STAGES.map((id) => ({
            id,
            status: "passed",
            durationMs: 1_000_000_000,
          })),
        }),
        expected,
      ),
    /timing contract/u,
  );
});

test("promotion executor defers only the exact planned first customer config activation blocker", () => {
  assert.deepEqual(
    classifyImmediatePromotionPreflight({
      targetPreflight: blockedAbsentCustomerConfigPreflight(),
      gitRelation: promotionRelation,
      customerConfigActivationRequiredAfterPromotion: true,
    }),
    {
      status: "passed",
      blockers: [],
      customerConfigActivationDeferred: true,
    },
  );

  assert.deepEqual(
    classifyImmediatePromotionPreflight({
      targetPreflight: blockedAbsentCustomerConfigPreflight({
        blockers: [
          "target_customer_config_readback_failed",
          "target_public_entry_failed",
        ],
      }),
      gitRelation: promotionRelation,
      customerConfigActivationRequiredAfterPromotion: true,
    }),
    {
      status: "passed",
      blockers: ["target_public_entry_failed"],
      customerConfigActivationDeferred: true,
    },
  );
});

test("promotion executor keeps invalid, unplanned and non-promote customer config blockers closed", () => {
  const invalid = blockedAbsentCustomerConfigPreflight();
  invalid.remote.runtime.customerConfigState = "invalid";
  for (const [targetPreflight, gitRelation, planned] of [
    [invalid, promotionRelation, true],
    [blockedAbsentCustomerConfigPreflight(), promotionRelation, false],
    [
      blockedAbsentCustomerConfigPreflight(),
      { ...promotionRelation, actionClass: "current" },
      true,
    ],
    [blockedAbsentCustomerConfigPreflight(), null, true],
  ]) {
    assert.deepEqual(
      classifyImmediatePromotionPreflight({
        targetPreflight,
        gitRelation,
        customerConfigActivationRequiredAfterPromotion: planned,
      }),
      {
        status: "blocked",
        blockers: ["target_customer_config_readback_failed"],
        customerConfigActivationDeferred: false,
      },
    );
  }
});

test("target initialization receipt binds pristine state, backup and rollback", () => {
  assert.equal(
    validateRemoteTargetInitializationReceipt(
      initializationReceipt(),
      initializationExpected,
    ).status,
    "passed",
  );
  assert.throws(
    () =>
      validateRemoteTargetInitializationReceipt(
        initializationReceipt({
          rollback: {
            complete: true,
            retainedTarget: false,
            preservesOtherTargets: true,
          },
        }),
        initializationExpected,
      ),
    /inconsistent/u,
  );
  assert.equal(
    validateRemoteTargetInitializationReceipt(
      initializationReceipt({
        status: "failed",
        stage: "database_start",
        issueCode: "initialization_rolled_back",
        images: {
          serverContentId: "unknown",
          webContentId: "unknown",
        },
        migration: {
          applyStarted: false,
          automaticDownMigration: false,
          readback: "unknown",
        },
        bootstrap: {
          started: false,
          completed: false,
          secretPersistedOnTarget: false,
        },
        rollbackPoint: {
          backupAlias: `initial-${SHA.slice(0, 12)}-${OPERATION_ID}`,
          backupSha256: "none",
          backupSizeBytes: 0,
          restoreChecked: false,
        },
        checks: Object.fromEntries(
          Object.keys(initializationReceipt().checks).map((key) => [
            key,
            false,
          ]),
        ),
        rollback: {
          complete: true,
          retainedTarget: false,
          preservesOtherTargets: true,
        },
        acquisition: {
          mode: "gitlab_internal",
          downloadedBytes: 581_043_372,
          expectedBytes: 581_043_372,
          durationMs: 4_000,
          catalogAndChecksumsVerified: true,
          credentialCleanupProven: true,
        },
      }),
      initializationExpected,
    ).status,
    "failed",
  );
  assert.equal(
    validateRemoteTargetInitializationReceipt(
      initializationReceipt({
        status: "failed",
        stage: "artifact_fetch",
        issueCode: "initialization_rolled_back",
        images: { serverContentId: "unknown", webContentId: "unknown" },
        migration: {
          applyStarted: false,
          automaticDownMigration: false,
          readback: "unknown",
        },
        bootstrap: {
          started: false,
          completed: false,
          secretPersistedOnTarget: false,
        },
        rollbackPoint: {
          backupAlias: `initial-${SHA.slice(0, 12)}-${OPERATION_ID}`,
          backupSha256: "none",
          backupSizeBytes: 0,
          restoreChecked: false,
        },
        checks: Object.fromEntries(
          Object.keys(initializationReceipt().checks).map((key) => [
            key,
            false,
          ]),
        ),
        rollback: {
          complete: true,
          retainedTarget: false,
          preservesOtherTargets: true,
        },
        acquisition: {
          mode: "none",
          downloadedBytes: 0,
          expectedBytes: 581_043_372,
          durationMs: 200,
          catalogAndChecksumsVerified: false,
          credentialCleanupProven: true,
        },
      }),
      initializationExpected,
    ).stage,
    "artifact_fetch",
  );
  assert.throws(
    () =>
      validateRemoteTargetInitializationReceipt(
        initializationReceipt({
          status: "failed",
          stage: "database_start",
          issueCode: "initialization_rolled_back",
          images: { serverContentId: "unknown", webContentId: "unknown" },
          migration: {
            applyStarted: false,
            automaticDownMigration: false,
            readback: "unknown",
          },
          bootstrap: {
            started: false,
            completed: false,
            secretPersistedOnTarget: false,
          },
          rollbackPoint: {
            backupAlias: `initial-${SHA.slice(0, 12)}-${OPERATION_ID}`,
            backupSha256: "none",
            backupSizeBytes: 0,
            restoreChecked: false,
          },
          checks: Object.fromEntries(
            Object.keys(initializationReceipt().checks).map((key) => [
              key,
              false,
            ]),
          ),
          rollback: {
            complete: true,
            retainedTarget: false,
            preservesOtherTargets: true,
          },
          acquisition: {
            mode: "none",
            downloadedBytes: 0,
            expectedBytes: 581_043_372,
            durationMs: 200,
            catalogAndChecksumsVerified: false,
            credentialCleanupProven: true,
          },
        }),
        initializationExpected,
      ),
    /contract/u,
  );
  assert.throws(
    () =>
      validateRemoteTargetInitializationReceipt(
        initializationReceipt({
          acquisition: {
            mode: "target_cache",
            downloadedBytes: 0,
            expectedBytes: 0,
            durationMs: 1,
            catalogAndChecksumsVerified: true,
            credentialCleanupProven: true,
          },
        }),
        initializationExpected,
      ),
    /contract/u,
  );
  assert.throws(
    () =>
      validateRemoteTargetInitializationReceipt(
        initializationReceipt({
          acquisition: {
            ...initializationReceipt().acquisition,
            downloadedBytes: 581_043_371,
          },
        }),
        initializationExpected,
      ),
    /contract/u,
  );
});

test("failed and unknown receipts cannot masquerade as passed", () => {
  const failed = receipt({
    status: "failed",
    stage: "capacity_recheck",
    issueCode: "promotion_failed_before_migration",
    timings: PROMOTION_STAGES.slice(
      0,
      PROMOTION_STAGES.indexOf("capacity_recheck") + 1,
    ).map((id) => ({
      id,
      status: id === "capacity_recheck" ? "failed" : "passed",
      durationMs: 1_000,
    })),
    checks: {
      releaseIdentity: false,
      health: false,
      ready: false,
      basicSmoke: false,
      publicEntry: false,
    },
  });
  assert.equal(
    validateRemotePromotionReceipt(failed, expected).status,
    "failed",
  );
  assert.throws(
    () =>
      validateRemotePromotionReceipt(
        {
          ...failed,
          acquisition: {
            ...failed.acquisition,
            credentialCleanupProven: false,
          },
        },
        expected,
      ),
    /inconsistent/u,
  );
  const migrationPlanIndex = PROMOTION_STAGES.indexOf("migration_plan");
  const migrationPlanFailure = receipt({
    status: "failed",
    stage: "migration_plan",
    issueCode: "promotion_failed_before_migration",
    timings: PROMOTION_STAGES.slice(0, migrationPlanIndex + 1).map(
      (id, index) => ({
        id,
        status: index === migrationPlanIndex ? "failed" : "passed",
        durationMs: 1_000,
      }),
    ),
    checks: {
      releaseIdentity: false,
      health: false,
      ready: false,
      basicSmoke: false,
      publicEntry: false,
    },
    migration: {
      automaticDownMigration: false,
      applyStarted: false,
    },
  });
  assert.equal(
    validateRemotePromotionReceipt(migrationPlanFailure, expected).status,
    "failed",
  );
  assert.throws(
    () =>
      validateRemotePromotionReceipt(
        {
          ...migrationPlanFailure,
          timings: [
            ...migrationPlanFailure.timings.slice(0, -2),
            migrationPlanFailure.timings.at(-1),
            migrationPlanFailure.timings.at(-2),
          ],
        },
        expected,
      ),
    /timing contract/u,
  );
  const earlyFailure = receipt({
    status: "failed",
    stage: "package_verification",
    issueCode: "promotion_failed_before_migration",
    timings: [
      {
        id: "artifact_fetch",
        status: "passed",
        durationMs: 1_000,
      },
      {
        id: "package_verification",
        status: "failed",
        durationMs: 1_000,
      },
    ],
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
      publicEntry: false,
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
  assert.match(result.stdout, /PROMOTE:<target>/u);
});

test("promotion executor contains no target build or automatic retry path", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "promotion-executor.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /docker\s+build|buildx|pnpm|go\s+build/u);
  assert.doesNotMatch(source, /setTimeout|setInterval|fresh lifecycle/iu);
  assert.match(source, /buildFixedTargetRsyncTransfer/u);
  assert.doesNotMatch(source, /["']scp["']/u);
  assert.match(source, /targetWriteStarted: false/u);
  assert.match(source, /automatic retry is disabled/u);
  assert.match(source, /release-rehearsal[.]json/u);
  assert.match(source, /PLUSH_GITLAB_TARGET_FETCH_TOKEN/u);
  assert.doesNotMatch(source, /process[.]env[.]PLUSH_GITLAB_TOKEN/u);
  assert.match(
    source,
    /input: targetFetchToken \? `\$\{targetFetchToken\}\\n` : ""/u,
  );
  assert.match(source, /input: `\$\{targetFetchToken\}\\n`/u);
  assert.doesNotMatch(source, /target-release-fetch[.]secret/u);
  const controlTransfer = source.match(
    /const CONTROL_TRANSFER_FILES = Object[.]freeze\(\[[\s\S]+?\]\);/u,
  )?.[0];
  assert.ok(controlTransfer);
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
      controlTransfer,
      new RegExp(`"${file.replaceAll(".", "[.]")}"`, "u"),
    );
  }
  for (const file of [
    "promotion-manifest.json",
    "remote-promotion.sh",
    "remote-release-acquire.sh",
    "transfer-checksums.sha256",
  ]) {
    assert.match(
      controlTransfer,
      new RegExp(`"${file.replaceAll(".", "[.]")}"`, "u"),
    );
  }
  const upgradeRoot = source.lastIndexOf("const transferRoot = path.join(");
  const cleanupBoundary = source.indexOf(
    "rmSync(transferRoot, { recursive: true, force: true })",
    upgradeRoot,
  );
  const cleanupTry = source.indexOf("try {", upgradeRoot);
  for (const guardedStep of [
    "transfer = preparePromotionTransfer(",
    "assertLocalRsync(runCommand)",
    'status: "running"',
  ]) {
    const step = source.indexOf(guardedStep, upgradeRoot);
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
  const prepareIndex = source.indexOf("prepareCache(");
  const transferTimerIndex = source.lastIndexOf(
    "const controlTransferStartedAt = Date.now()",
  );
  const rsyncIndex = source.indexOf('"transfer promotion control package"');
  assert(
    prepareIndex < transferTimerIndex && transferTimerIndex < rsyncIndex,
    "transfer timing must measure rsync without counting remote directory preparation",
  );
  for (const metric of [
    "controlTransferDurationMs",
    "controlTransferBytesPerSecond",
    "targetAcquisitionDurationMs",
    "targetAcquisitionBytesPerSecond",
    "serverArchiveBytes",
    "webArchiveBytes",
    "serverDigest",
    "webDigest",
    "buildPerformance",
    "avoidedTransferBytes",
    "dockerLoadSkipped",
  ]) {
    assert.match(source, new RegExp(`\\b${metric}\\b`, "u"));
  }
  assert.equal(
    source.match(
      /bootstrapAccessStored: Boolean\(accessFile && existsSync\(accessFile\)\)/gu,
    )?.length,
    2,
    "both terminal initialization paths must report the actual access-file state",
  );
});

test("ordinary promotion cannot invoke the independent database rebuild path", () => {
  for (const file of [
    "promotion-controller.mjs",
    "promotion-executor.mjs",
    "remote-promotion.sh",
  ]) {
    const source = readFileSync(path.join(import.meta.dirname, file), "utf8");
    assert.doesNotMatch(
      source,
      /database-rebuild|rebuild-database|REBUILD_DATABASE/u,
      `${file} must preserve target data and remain separate from rebuild`,
    );
  }
});
