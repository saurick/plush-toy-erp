import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parsePromotionControllerArgs,
  preparePromotion,
  readPromotionPlan,
} from "./promotion-controller.mjs";
import { resolveDeliveryOperationStore } from "./delivery-operation-store.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";

const SHA = "a".repeat(40);
const CURRENT_SHA = "b".repeat(40);
const IDEMPOTENCY_KEY =
  "promotion:test-133:123e4567-e89b-42d3-a456-426614174000";

function classifyRelation({ currentGitSha, candidateGitSha }) {
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

function releaseManifest({ artifactSha256, receiptSha256 }) {
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
        workflowRef:
          "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
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
      manifestSha256: artifactSha256,
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
      receiptSha256,
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

function artifactManifest() {
  return {
    schemaVersion: "plush-release-artifact/v1",
    passed: true,
    releaseVersion: "2026.07.29-1",
    git: { commit: SHA, head: SHA, worktreeClean: true },
    sourceArchive: { sha256: "e".repeat(64), secretScan: "passed" },
    migration: { latest: "20260729000000", sequenceSha256: "f".repeat(64) },
    customerConfig: { sourceSha256: "1".repeat(64) },
    sbom: { sha256: "7".repeat(64) },
    images: [
      {
        kind: "server",
        contentId: `sha256:${"3".repeat(64)}`,
        gitSha: SHA,
        releaseVersion: "2026.07.29-1",
        platform: "linux/amd64",
        archive: {
          file: "server-image.tar",
          sha256: "3".repeat(64),
          sizeBytes: 100,
        },
        metadataSecretScan: { passed: true },
      },
      {
        kind: "web",
        contentId: `sha256:${"5".repeat(64)}`,
        gitSha: SHA,
        releaseVersion: "2026.07.29-1",
        platform: "linux/amd64",
        archive: {
          file: "web-image.tar",
          sha256: "5".repeat(64),
          sizeBytes: 100,
        },
        metadataSecretScan: { passed: true },
      },
    ],
  };
}

function rehearsalReceipt(artifact) {
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
    schemaVersion: "plush-local-release-rehearsal/v1",
    passed: true,
    customer: "yoyoosun",
    generatedAt: "2026-08-29T01:00:00.000Z",
    finishedAt: "2026-08-29T01:05:00.000Z",
    git: { commit: SHA, head: SHA, worktreeClean: true },
    artifact: {
      manifestSchema: artifact.schemaVersion,
      server: artifact.images[0].contentId,
      web: artifact.images[1].contentId,
      migrationSequenceSha256: artifact.migration.sequenceSha256,
      sbomSha256: artifact.sbom.sha256,
    },
    environment: {
      kind: "local-isolated-release-compose",
      composeSource: "server/deploy/compose/prod/compose.yml",
      databaseIdentityBound: true,
    },
    migration: {
      ...artifact.migration,
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
    failure: null,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawCustomerRows: false,
    },
  };
}

function targetPreflight(blocked = false) {
  return {
    schemaVersion: "plush.target-preflight/v1",
    status: blocked ? "blocked" : "passed",
    target: "test-133",
    customer: "yoyoosun",
    blockers: blocked ? ["target_disk_capacity_low"] : [],
    remote: {
      capacity: {
        availableBytes: blocked ? 14 * 1024 ** 3 : 40 * 1024 ** 3,
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
  };
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "promotion-controller-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "output"), { recursive: true });
  const releaseManifestPath = path.join(root, "release-manifest.json");
  const artifact = artifactManifest();
  const artifactContent = `${JSON.stringify(artifact, null, 2)}\n`;
  const receipt = rehearsalReceipt(artifact);
  const receiptContent = `${JSON.stringify(receipt, null, 2)}\n`;
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  writeFileSync(path.join(root, "release-artifact.json"), artifactContent);
  writeFileSync(path.join(root, "release-rehearsal.json"), receiptContent);
  writeFileSync(
    releaseManifestPath,
    `${JSON.stringify(
      releaseManifest({
        artifactSha256: digest(artifactContent),
        receiptSha256: digest(receiptContent),
      }),
      null,
      2,
    )}\n`,
  );
  return {
    root,
    releaseManifestPath,
    store: resolveDeliveryOperationStore(root),
  };
}

test("promotion preparation awaits one read-only preflight and becomes ready", async (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  const runtime = {
    classifyRelation,
    now: (() => {
      let second = 0;
      return () => `2026-07-29T03:00:0${second++}.000Z`;
    })(),
    runPreflight: async () => {
      preflightCalls += 1;
      return targetPreflight(false);
    },
  };
  const request = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "test-133",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationStore: data.store,
  };
  const first = await preparePromotion(request, runtime);
  const second = await preparePromotion(request, runtime);
  assert.equal(first.operation.status, "ready");
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(preflightCalls, 1);
  assert.equal(
    readPromotionPlan(data.store, first.operation.id).status,
    "eligible",
  );
});

test("promotion preparation persists disk blocker as a terminal operation", async (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  const request = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "test-133",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationStore: data.store,
  };
  const first = await preparePromotion(request, {
    classifyRelation,
    runPreflight: () => {
      preflightCalls += 1;
      return targetPreflight(true);
    },
  });
  const second = await preparePromotion(request, {
    classifyRelation,
    runPreflight: () => {
      preflightCalls += 1;
      return targetPreflight(false);
    },
  });
  assert.equal(first.operation.status, "blocked");
  assert.equal(second.operation.status, "blocked");
  assert.equal(preflightCalls, 1);
  assert.deepEqual(first.plan.blockers, ["target_disk_capacity_low"]);
  assert.doesNotMatch(
    readFileSync(
      path.join(data.store, "operations", `${first.operation.id}.json`),
      "utf8",
    ),
    /192\.168|\/home\/simon|password|token/iu,
  );
});

test("promotion controller CLI exposes explicit terminal retry lineage", () => {
  const options = parsePromotionControllerArgs([
    "--release-manifest",
    "output/releases/example/release-manifest.json",
    "--target",
    "test-133",
    "--idempotency-key",
    "promotion-retry-example",
    "--retry-of-operation-id",
    "123e4567-e89b-42d3-a456-426614174000",
    "--json",
  ]);
  assert.equal(
    options.retryOfOperationId,
    "123e4567-e89b-42d3-a456-426614174000",
  );
  assert.equal(options.json, true);
});

test("explicit terminal retry creates a distinct ready operation lineage", async (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  const common = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "test-133",
    operationStore: data.store,
  };
  const first = await preparePromotion(
    { ...common, idempotencyKey: IDEMPOTENCY_KEY },
    {
      classifyRelation,
      runPreflight: () => {
        preflightCalls += 1;
        return targetPreflight(true);
      },
    },
  );
  const retry = await preparePromotion(
    {
      ...common,
      idempotencyKey: `${IDEMPOTENCY_KEY}:retry-2`,
      retryOfOperationId: first.operation.id,
    },
    {
      classifyRelation,
      runPreflight: () => {
        preflightCalls += 1;
        return targetPreflight(false);
      },
    },
  );
  assert.equal(first.operation.status, "blocked");
  assert.equal(retry.operation.status, "ready");
  assert.notEqual(retry.operation.id, first.operation.id);
  assert.equal(retry.operation.attempt, 2);
  assert.equal(retry.operation.retryOfOperationId, first.operation.id);
  assert.equal(retry.operation.rootOperationId, first.operation.id);
  assert.equal(preflightCalls, 2);
});
