import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readDeliveryOperation,
  resolveDeliveryOperationStore,
} from "./delivery-operation-store.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";
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
    target: "test-133",
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

test("rollback controller awaits preflight and produces one idempotent ready operation", async (t) => {
  const fixture = createFixture(t);
  const input = {
    repoRoot: fixture.root,
    currentReleaseManifestPath: fixture.currentManifest,
    targetReleaseManifestPath: fixture.targetManifest,
    targetKey: "test-133",
    idempotencyKey: "rollback-controller:fixed:0001",
    operationStore: fixture.store,
  };
  const first = await prepareRollback(input, {
    classifyRelation,
    runPreflight: async () => preflight(),
  });
  const second = await prepareRollback(input, {
    runPreflight: () => {
      throw new Error("preflight must not rerun");
    },
  });
  assert.equal(first.operation.status, "ready");
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(
    readRollbackPlan(fixture.store, first.operation.id).status,
    "eligible",
  );
});

test("rollback controller persists incompatible schema as terminal blocked", async (t) => {
  const fixture = createFixture(t, "9".repeat(64));
  const report = await prepareRollback(
    {
      repoRoot: fixture.root,
      currentReleaseManifestPath: fixture.currentManifest,
      targetReleaseManifestPath: fixture.targetManifest,
      targetKey: "test-133",
      idempotencyKey: "rollback-controller:blocked:0001",
      operationStore: fixture.store,
    },
    { classifyRelation, runPreflight: () => preflight() },
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
