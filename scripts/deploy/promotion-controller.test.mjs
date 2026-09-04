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
import {
  readDeliveryOperation,
  resolveDeliveryOperationStore,
} from "./delivery-operation-store.mjs";
import { releaseManifestV2Fixture } from "./release-catalog-test-fixtures.mjs";

const SHA = "a".repeat(40);
const CURRENT_SHA = "b".repeat(40);
const IDEMPOTENCY_KEY =
  "promotion:demo-133:123e4567-e89b-42d3-a456-426614174000";

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
  return releaseManifestV2Fixture({
    gitSha: SHA,
    version: "2026.07.29-1",
    artifactSha256,
    receiptSha256,
  });
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
    target: "demo-133",
    customer: "yoyoosun",
    blockers: blocked ? ["target_disk_capacity_low"] : [],
    remote: {
      capacity: {
        availableBytes: blocked ? 14 * 1024 ** 3 : 40 * 1024 ** 3,
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
  };
}

function targetInitializationPreflight(status = "blocked") {
  const eligible = status === "eligible";
  return {
    schemaVersion: "plush.target-initialization-preflight/v1",
    status,
    target: "demo-133",
    purpose: "project-demo-simulated",
    customer: "yoyoosun",
    trialTarget: "customer-trial-133",
    remote: {
      schemaVersion: "plush.remote-target-initialization-preflight/v1",
      status,
      target: "demo-133",
      host: { hostname: "r640", user: "simon" },
      rootState: eligible ? "absent" : "present",
      conflicts: {
        targetContainers: 0,
        targetNetworks: 0,
        publicContainers: 0,
        tcpPorts: 0,
        udpPorts: 0,
      },
      capacity: {
        availableBytes: 40 * 1024 ** 3,
        minimumAvailableBytes: 30 * 1024 ** 3,
      },
      tooling: "passed",
      atlas: "passed",
      baseImages: "passed",
      blockers: eligible ? [] : ["initialization_root_not_absent"],
    },
    blockers: eligible ? [] : ["initialization_root_not_absent"],
    nextAction: eligible
      ? "initialize this pristine registered target from one immutable release"
      : "resolve the fixed initialization blockers without taking over partial state",
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsSshTarget: false,
      containsAbsolutePaths: false,
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
    targetKey: "demo-133",
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

test("final eligibility qualification completes before ready is persisted", async (t) => {
  const data = fixture(t);
  let observedStatus = "";
  const report = await preparePromotion(
    {
      repoRoot: data.root,
      releaseManifestPath: data.releaseManifestPath,
      targetKey: "demo-133",
      idempotencyKey: `${IDEMPOTENCY_KEY}:final-qualification`,
      operationStore: data.store,
    },
    {
      classifyRelation,
      runPreflight: () => targetPreflight(false),
      qualifyEligiblePlan: async ({ operation, plan, promotionMode }) => {
        const current = readDeliveryOperation(data.store, operation.id);
        observedStatus = current.status;
        assert.equal(promotionMode, "upgrade");
        assert.equal(plan.status, "eligible");
        assert.deepEqual(
          current.events.map((event) => event.status),
          ["queued", "running"],
        );
        return {
          status: "ready",
          message:
            "promotion and current-release rollback transports are verified; explicit confirmation is required",
          metadata: {
            currentGitSha: plan.ancestry.currentGitSha,
            currentReleaseTransportVerified: true,
          },
        };
      },
    },
  );

  assert.equal(observedStatus, "running");
  assert.equal(report.operation.status, "ready");
  assert.equal(report.operation.metadata.currentReleaseTransportVerified, true);
  assert.deepEqual(
    report.operation.events.map((event) => event.status),
    ["queued", "running", "ready"],
  );
});

test("an initialized target without active customer config remains an upgrade and becomes ready", async (t) => {
  const data = fixture(t);
  const base = targetPreflight(false);
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
  let initializationCalls = 0;

  const report = await preparePromotion(
    {
      repoRoot: data.root,
      releaseManifestPath: data.releaseManifestPath,
      targetKey: "demo-133",
      idempotencyKey: `${IDEMPOTENCY_KEY}:config-bootstrap`,
      operationStore: data.store,
    },
    {
      classifyRelation,
      runPreflight: () => absentConfig,
      runInitializationPreflight: () => {
        initializationCalls += 1;
        return targetInitializationPreflight();
      },
    },
  );

  assert.equal(report.operation.status, "ready");
  assert.equal(report.operation.metadata.promotionMode, "upgrade");
  assert.equal(report.plan.status, "eligible");
  assert.equal(report.plan.before.customerConfigState, "absent");
  assert.equal(
    report.plan.before.customerConfigActivationRequiredAfterPromotion,
    true,
  );
  assert.equal(initializationCalls, 0);
});

test("a pristine registered target becomes one explicit initialization promotion", async (t) => {
  const data = fixture(t);
  let initializationCalls = 0;
  const absentTarget = targetPreflight(true);
  absentTarget.remote.runtime = {
    serverSha: "unknown",
    webSha: "unknown",
    serverHealth: "failed",
    serverReady: "failed",
    webHealth: "failed",
  };
  const report = await preparePromotion(
    {
      repoRoot: data.root,
      releaseManifestPath: data.releaseManifestPath,
      targetKey: "demo-133",
      idempotencyKey: `${IDEMPOTENCY_KEY}:initialize`,
      operationStore: data.store,
    },
    {
      classifyRelation: () => {
        throw new Error("ancestry must not run for an absent target");
      },
      runPreflight: () => absentTarget,
      runInitializationPreflight: () => {
        initializationCalls += 1;
        return targetInitializationPreflight("eligible");
      },
    },
  );

  assert.equal(report.operation.status, "ready");
  assert.equal(report.operation.metadata.promotionMode, "initialize");
  assert.equal(report.plan.mode, "initialize");
  assert.equal(report.plan.before.targetState, "absent");
  assert.equal(initializationCalls, 1);
  assert.equal(
    readPromotionPlan(data.store, report.operation.id).schemaVersion,
    "plush.target-initialization-manifest/v1",
  );
});

test("promotion preparation preserves existing-target blockers without reclassifying initialization", async (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  let initializationCalls = 0;
  const request = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "demo-133",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationStore: data.store,
  };
  const first = await preparePromotion(request, {
    classifyRelation,
    runInitializationPreflight: () => {
      initializationCalls += 1;
      return targetInitializationPreflight();
    },
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
  assert.equal(initializationCalls, 0);
  assert.equal(first.operation.metadata.promotionMode, "upgrade");
  assert.deepEqual(first.plan.blockers, ["target_disk_capacity_low"]);
  assert.doesNotMatch(
    readFileSync(
      path.join(data.store, "operations", `${first.operation.id}.json`),
      "utf8",
    ),
    /192\.168|\/home\/simon|password|token/iu,
  );
});

test("an unidentifiable partial target is blocked without claiming pristine state", async (t) => {
  const data = fixture(t);
  const blocked = targetPreflight(true);
  blocked.remote.runtime = {
    serverSha: "unknown",
    webSha: "unknown",
    serverHealth: "failed",
    serverReady: "failed",
    webHealth: "failed",
  };
  const report = await preparePromotion(
    {
      repoRoot: data.root,
      releaseManifestPath: data.releaseManifestPath,
      targetKey: "demo-133",
      idempotencyKey: `${IDEMPOTENCY_KEY}:partial-target`,
      operationStore: data.store,
    },
    {
      classifyRelation: () => {
        throw new Error("ancestry must not run without a runtime identity");
      },
      runPreflight: () => blocked,
      runInitializationPreflight: () => targetInitializationPreflight(),
    },
  );

  assert.equal(report.operation.status, "blocked");
  assert.equal(report.plan.mode, "initialize");
  assert.deepEqual(report.plan.before, {
    targetState: "present",
    runtimeSha: "unknown",
    backupState: "unknown",
    availableBytes: 40 * 1024 ** 3,
    minimumAvailableBytes: 30 * 1024 ** 3,
  });
  assert.deepEqual(report.plan.blockers, ["initialization_root_not_absent"]);
});

test("promotion controller CLI exposes explicit terminal retry lineage", () => {
  const options = parsePromotionControllerArgs([
    "--release-manifest",
    "output/releases/example/release-manifest.json",
    "--target",
    "demo-133",
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
    targetKey: "demo-133",
    operationStore: data.store,
  };
  const first = await preparePromotion(
    { ...common, idempotencyKey: IDEMPOTENCY_KEY },
    {
      classifyRelation,
      runInitializationPreflight: () => targetInitializationPreflight(),
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
