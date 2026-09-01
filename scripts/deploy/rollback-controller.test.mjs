import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readDeliveryOperation,
  resolveDeliveryOperationStore,
} from "./delivery-operation-store.mjs";
import {
  releaseManifestStrictEvidenceFixture,
  releaseManifestV2Fixture,
} from "./release-catalog-test-fixtures.mjs";
import { prepareRollback, readRollbackPlan } from "./rollback-controller.mjs";

const FROM_SHA = "a".repeat(40);
const TO_SHA = "b".repeat(40);
const HASH = "c".repeat(64);

function classifyRelation({ currentGitSha, candidateGitSha }) {
  return {
    schemaVersion: "plush.git-ancestry-relation/v1",
    currentGitSha,
    candidateGitSha,
    relation: "behind",
    actionClass: "rollback",
    actionReason: "candidate_is_ancestor_of_current",
  };
}

function manifest(gitSha, migrationHash = HASH) {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: gitSha === FROM_SHA ? "2026.07.29-2" : "2026.07.29-1",
    gitSha,
    strict: releaseManifestStrictEvidenceFixture(),
    artifact: {
      manifestSha256: "e".repeat(64),
      sourceArchiveSha256: "f".repeat(64),
    },
    migration: {
      latest: "20260729000000",
      sequenceSha256: migrationHash,
    },
    customerConfig: { sourceSha256: HASH },
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: `sha256:${"1".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-server@sha256:${"1".repeat(64)}`,
        sourceContentId: `sha256:${"2".repeat(64)}`,
        platform: "linux/amd64",
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: `sha256:${"3".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-web@sha256:${"3".repeat(64)}`,
        sourceContentId: `sha256:${"4".repeat(64)}`,
        platform: "linux/amd64",
      },
    ],
    rollback: { databaseDownMigrationAutomatic: false },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
  };
}

function createFixture(t, migrationHash = HASH) {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "plush-rollback-controller-"),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const currentManifest = path.join(root, "current.json");
  const targetManifest = path.join(root, "target.json");
  writeFileSync(currentManifest, JSON.stringify(manifest(FROM_SHA)));
  writeFileSync(
    targetManifest,
    JSON.stringify(manifest(TO_SHA, migrationHash)),
  );
  return {
    root,
    store: resolveDeliveryOperationStore(root),
    currentManifest,
    targetManifest,
  };
}

function preflight(blockers = []) {
  return {
    schemaVersion: "plush.target-preflight/v1",
    target: "demo-133",
    customer: "yoyoosun",
    blockers,
    remote: {
      runtime: {
        serverSha: FROM_SHA,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
      },
      locks: { migration: "free" },
    },
  };
}

function legacyCacheIdentity({ releaseManifestPath }) {
  return {
    contract: "plush.target-release-cache/v2",
    cacheMode: "legacy_v1_existing_only",
    gitSha: TO_SHA,
    version: "2026.07.29-1",
    releaseManifestSha256: createHash("sha256")
      .update(readFileSync(releaseManifestPath))
      .digest("hex"),
    releaseArtifactSha256: "7".repeat(64),
    checksumsSha256: "8".repeat(64),
    releaseRehearsalSha256: null,
    sourceArchiveSha256: "f".repeat(64),
    sbomSha256: HASH,
    serverArchiveSha256: "9".repeat(64),
    webArchiveSha256: "d".repeat(64),
    serverContentId: `sha256:${"2".repeat(64)}`,
    webContentId: `sha256:${"4".repeat(64)}`,
    serverDigest: `sha256:${"1".repeat(64)}`,
    webDigest: `sha256:${"3".repeat(64)}`,
    serverRef: `plush-toy-erp-server:yoyoosun-${TO_SHA}`,
    webRef: `plush-toy-erp-web:yoyoosun-${TO_SHA}`,
  };
}

function legacyCacheHit(identity) {
  return {
    schemaVersion: "plush.target-release-cache/v2",
    releaseManifestSha256: identity.releaseManifestSha256,
    packageHit: true,
    imageHit: false,
    cacheSource: "formal",
    sourceToken: "formal",
    avoidedBytes: 1,
    basis: [
      "release_manifest_sha256",
      "archive_sha256",
      "registry_digest",
      "docker_content_id",
      "embedded_git_sha",
    ],
  };
}

test("rollback controller awaits preflight and produces one idempotent ready operation", async (t) => {
  const fixture = createFixture(t);
  const input = {
    repoRoot: fixture.root,
    currentReleaseManifestPath: fixture.currentManifest,
    targetReleaseManifestPath: fixture.targetManifest,
    targetKey: "demo-133",
    idempotencyKey: "rollback-controller:fixed:0001",
    operationStore: fixture.store,
  };
  const first = await prepareRollback(input, {
    classifyRelation,
    runPreflight: async () => preflight(),
    buildCacheIdentity: legacyCacheIdentity,
    probeCache: legacyCacheHit,
  });
  const second = await prepareRollback(input, {
    runPreflight: () => {
      throw new Error("preflight must not rerun");
    },
  });
  assert.equal(first.operation.status, "ready");
  assert.match(
    first.operation.metadata.rollbackTargetCacheFingerprint,
    /^[0-9a-f]{64}$/u,
  );
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(
    readRollbackPlan(fixture.store, first.operation.id).status,
    "eligible",
  );
});

test("rollback controller qualifies v2 target transport without legacy cache probing", async (t) => {
  const fixture = createFixture(t);
  writeFileSync(
    fixture.currentManifest,
    JSON.stringify(
      releaseManifestV2Fixture({
        gitSha: FROM_SHA,
        version: "2026.07.29-2",
        artifactSha256: "6".repeat(64),
        receiptSha256: "7".repeat(64),
      }),
    ),
  );
  writeFileSync(
    fixture.targetManifest,
    JSON.stringify(
      releaseManifestV2Fixture({
        gitSha: TO_SHA,
        version: "2026.07.29-1",
        artifactSha256: "8".repeat(64),
        receiptSha256: "9".repeat(64),
      }),
    ),
  );
  const report = await prepareRollback(
    {
      repoRoot: fixture.root,
      currentReleaseManifestPath: fixture.currentManifest,
      targetReleaseManifestPath: fixture.targetManifest,
      targetKey: "demo-133",
      idempotencyKey: "rollback-controller:v2:0001",
      operationStore: fixture.store,
    },
    {
      classifyRelation,
      runPreflight: () => preflight(),
      buildCacheIdentity: () => {
        throw new Error("v2 rollback must not build a legacy cache identity");
      },
      probeCache: () => {
        throw new Error("v2 rollback must not probe a legacy cache");
      },
    },
  );
  assert.equal(report.operation.status, "ready");
  assert.equal(report.plan.transport.mode, "gitlab_internal_or_target_cache");
  assert.equal(report.operation.metadata.rollbackTargetCacheFingerprint, null);
});

test("rollback controller rejects a symlinked release manifest before qualification", async (t) => {
  const fixture = createFixture(t);
  const currentLink = path.join(fixture.root, "current-link.json");
  symlinkSync(fixture.currentManifest, currentLink);
  await assert.rejects(
    prepareRollback({
      repoRoot: fixture.root,
      currentReleaseManifestPath: currentLink,
      targetReleaseManifestPath: fixture.targetManifest,
      targetKey: "demo-133",
      idempotencyKey: "rollback-controller:symlink:0001",
      operationStore: fixture.store,
    }),
    /bounded plain file/u,
  );
});

test("rollback controller persists incompatible schema as terminal blocked", async (t) => {
  const fixture = createFixture(t, "9".repeat(64));
  const report = await prepareRollback(
    {
      repoRoot: fixture.root,
      currentReleaseManifestPath: fixture.currentManifest,
      targetReleaseManifestPath: fixture.targetManifest,
      targetKey: "demo-133",
      idempotencyKey: "rollback-controller:blocked:0001",
      operationStore: fixture.store,
    },
    {
      classifyRelation,
      runPreflight: () => preflight(),
      buildCacheIdentity: legacyCacheIdentity,
      probeCache: legacyCacheHit,
    },
  );
  assert.equal(report.operation.status, "blocked");
  assert.deepEqual(report.plan.blockers, ["rollback_migration_incompatible"]);
  assert.equal(
    readDeliveryOperation(fixture.store, report.operation.id).status,
    "blocked",
  );
  assert.doesNotMatch(
    readFileSync(
      path.join(fixture.store, "plans", `${report.operation.id}.rollback.json`),
      "utf8",
    ),
    /\/tmp\/|password|token/iu,
  );
});

test("rollback controller blocks a legacy rollback before ready when formal cache is absent", async (t) => {
  const fixture = createFixture(t);
  const report = await prepareRollback(
    {
      repoRoot: fixture.root,
      currentReleaseManifestPath: fixture.currentManifest,
      targetReleaseManifestPath: fixture.targetManifest,
      targetKey: "demo-133",
      idempotencyKey: "rollback-controller:legacy-miss:0001",
      operationStore: fixture.store,
    },
    {
      classifyRelation,
      runPreflight: () => preflight(),
      buildCacheIdentity: legacyCacheIdentity,
      probeCache: (identity) => ({
        schemaVersion: "plush.target-release-cache/v2",
        releaseManifestSha256: identity.releaseManifestSha256,
        packageHit: false,
        imageHit: false,
        cacheSource: "none",
        sourceToken: "none",
        avoidedBytes: 0,
        basis: [],
      }),
    },
  );
  assert.equal(report.operation.status, "blocked");
  assert.deepEqual(report.plan.blockers, [
    "rollback_target_transport_unavailable",
  ]);
  assert.equal(report.plan.transport.mode, "legacy_target_cache");
  assert.equal(report.operation.metadata.rollbackTargetCacheFingerprint, null);
});
