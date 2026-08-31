import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

function ancestry(currentGitSha = CURRENT_SHA, candidateGitSha = SHA) {
  const current = currentGitSha === candidateGitSha;
  return {
    schemaVersion: "plush.git-ancestry-relation/v1",
    currentGitSha,
    candidateGitSha,
    relation: current ? "current" : "ahead",
    actionClass: current ? "current" : "promote",
    actionReason: current
      ? "exact_sha_current"
      : "candidate_descends_from_current",
  };
}

function releaseManifest() {
  const strict = releaseManifestStrictEvidenceFixture();
  const counts = { executed: 1, passed: 1, failed: 0, skipped: 0 };
  const runtime = {
    serverHealth: "passed",
    serverReady: "passed",
    webHealth: "passed",
    webRoot: "passed",
    runtimeIdentity: "passed",
    authenticatedAdmin: "passed",
    embeddedGitSha: SHA,
  };
  return {
    schemaVersion: "plush.release-manifest/v2",
    passed: true,
    version: "2026.07.29-1",
    gitSha: SHA,
    strict: {
      ...strict,
      contract: "plush.exact-sha-strict/v3",
      identity: {
        repository: "saurick/plush-toy-erp",
        gitSha: SHA,
        sourceArchiveSha256: "e".repeat(64),
        policyFingerprint: strict.fingerprint,
        workflowFingerprint: "8".repeat(64),
        toolchainFingerprint: "9".repeat(64),
        migrationSequenceSha256: "f".repeat(64),
        dependencyLockFingerprint: "a".repeat(64),
        customerConfigFingerprint: "1".repeat(64),
      },
      checks: Object.fromEntries(
        ["web", "server", "database", "browser", "security"].map((key) => [
          key,
          counts,
        ]),
      ),
      timeSensitiveChecks: {
        vulnerabilityDatabase: {
          status: "passed",
          checkedAt: "2026-08-29T00:00:00.000Z",
          validUntil: "2026-08-30T00:00:00.000Z",
        },
      },
      provenance: {
        source: "gitlab-ci",
        repository: "saurick/plush-toy-erp",
        workflowRef: "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
        runId: "123",
        runAttempt: "1",
        job: "quality_aggregate",
        eventName: "push",
        ref: "refs/heads/main",
        refName: "main",
        headRepository: "saurick/plush-toy-erp",
        conclusion: "success",
      },
    },
    artifact: {
      schemaVersion: "plush-release-artifact/v1",
      manifestSha256: HASH,
      sourceArchiveSha256: "e".repeat(64),
    },
    migration: {
      latest: "20260729000000",
      sequenceSha256: "f".repeat(64),
    },
    customerConfig: { sourceSha256: "1".repeat(64) },
    sbom: { sha256: "7".repeat(64) },
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
    rehearsal: {
      contract: "plush-local-release-rehearsal/v1",
      status: "passed",
      receiptSha256: "6".repeat(64),
      generatedAt: "2026-08-29T01:00:00.000Z",
      finishedAt: "2026-08-29T01:05:00.000Z",
      gitSha: SHA,
      artifact: {
        manifestSchema: "plush-release-artifact/v1",
        serverContentId: `sha256:${"3".repeat(64)}`,
        webContentId: `sha256:${"5".repeat(64)}`,
        migrationSequenceSha256: "f".repeat(64),
        sbomSha256: "7".repeat(64),
      },
      environment: {
        kind: "local-isolated-release-compose",
        composeSource: "server/deploy/compose/prod/compose.yml",
        databaseIdentityBound: true,
      },
      migration: {
        latest: "20260729000000",
        sequenceSha256: "f".repeat(64),
        directoryValidation: "passed",
        dryRun: "passed",
        apply: "passed",
        readback: "passed",
      },
      runtime: { initial: runtime, steadyStateRestart: runtime },
      backupRestore: {
        status: "passed",
        backupSha256: "b".repeat(64),
        backupSizeBytes: 1024,
        dumpRetained: false,
      },
      recoveryRestart: {
        status: "passed",
        bootstrapSecretRemoved: true,
        sameServerContentId: true,
        sameWebContentId: true,
        healthReadyAndLoginRecovered: true,
        customerConfigRecovered: true,
      },
      cleanup: {
        attempted: true,
        passed: true,
        residualContainers: 0,
        temporaryDatabaseRetained: false,
      },
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsFullDsn: false,
        containsAbsoluteWorkspacePaths: false,
        containsRawCustomerRows: false,
      },
    },
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
    target: "demo-133",
    customer: "yoyoosun",
    blockers: [],
    remote: {
      capacity: {
        availableBytes: 40 * 1024 ** 3,
        minimumAvailableBytes: 30 * 1024 ** 3,
      },
      runtime: {
        database: "passed",
        serverSha: CURRENT_SHA,
        webSha: CURRENT_SHA,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
        customerConfigState: "active",
        activeCustomerConfig: {
          revision: "revision-1",
          productVersion: "product-1",
          datasetVersion: "dataset-1",
        },
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
    ancestry: ancestry(),
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
  assert.equal(manifest.release.rehearsalReceiptFile, "release-rehearsal.json");
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
    ancestry: ancestry(),
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
    ancestry: ancestry(SHA, SHA),
  });
  assert.equal(current.status, "already_current");
});

test("promotion manifest defers only the proven first customer-config activation blocker", () => {
  const base = preflight();
  const absentConfig = {
    ...base,
    status: "blocked",
    blockers: ["target_customer_config_readback_failed"],
    remote: {
      ...base.remote,
      runtime: {
        ...base.remote.runtime,
        database: "blocked",
        customerConfigState: "absent",
        activeCustomerConfig: {
          revision: "unknown",
          productVersion: "unknown",
          datasetVersion: "unknown",
        },
      },
    },
  };
  const eligible = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: absentConfig,
    ancestry: ancestry(),
  });

  assert.equal(eligible.status, "eligible");
  assert.deepEqual(eligible.blockers, []);
  assert.equal(eligible.before.customerConfigState, "absent");
  assert.equal(
    eligible.before.customerConfigActivationRequiredAfterPromotion,
    true,
  );
  assert.equal(
    eligible.notProven.includes(
      "release-bound customer configuration activation and readback",
    ),
    true,
  );
  assert.doesNotMatch(eligible.steps.join("\n"), /customer configuration/u);

  const invalidReadback = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: {
      ...absentConfig,
      remote: {
        ...absentConfig.remote,
        runtime: {
          ...absentConfig.remote.runtime,
          customerConfigState: "invalid",
        },
      },
    },
    ancestry: ancestry(),
  });
  assert.equal(invalidReadback.status, "blocked");
  assert.deepEqual(invalidReadback.blockers, [
    "target_customer_config_readback_failed",
  ]);
  assert.equal(
    invalidReadback.before.customerConfigActivationRequiredAfterPromotion,
    false,
  );

  const otherBlocker = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: {
      ...absentConfig,
      blockers: [
        "target_customer_config_readback_failed",
        "target_disk_capacity_low",
      ],
    },
    ancestry: ancestry(),
  });
  assert.equal(otherBlocker.status, "blocked");
  assert.deepEqual(otherBlocker.blockers, ["target_disk_capacity_low"]);

  const alreadyCurrent = buildPromotionManifest({
    operationId: OPERATION_ID,
    releaseManifest: releaseManifest(),
    releaseManifestSha256: HASH,
    targetPreflight: {
      ...absentConfig,
      remote: {
        ...absentConfig.remote,
        runtime: {
          ...absentConfig.remote.runtime,
          serverSha: SHA,
          webSha: SHA,
        },
      },
    },
    ancestry: ancestry(SHA, SHA),
  });
  assert.equal(alreadyCurrent.status, "blocked");
  assert.deepEqual(alreadyCurrent.blockers, [
    "target_customer_config_readback_failed",
  ]);
  assert.equal(
    alreadyCurrent.before.customerConfigActivationRequiredAfterPromotion,
    false,
  );
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
      ancestry: ancestry(),
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
