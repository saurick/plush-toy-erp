import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  parseDatabaseRebuildControllerArgs,
  prepareDatabaseRebuild,
  readDatabaseRebuildPlan,
} from "./database-rebuild-controller.mjs";
import { resolveDeliveryOperationStore } from "./delivery-operation-store.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";

const SHA = "a".repeat(40);
const IDEMPOTENCY_KEY =
  "rebuild-database:customer-test-133:123e4567-e89b-42d3-a456-426614174000";

function classifyRelation({ currentGitSha, candidateGitSha }) {
  const current = currentGitSha === candidateGitSha;
  return {
    schemaVersion: "plush.git-ancestry-relation/v1",
    currentGitSha,
    candidateGitSha,
    relation: current ? "current" : "diverged",
    actionClass: current ? "current" : "blocked",
    actionReason: current ? "exact_sha_current" : "git_histories_diverged",
  };
}

function releaseManifest() {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: "2026.08.03-1",
    gitSha: SHA,
    strict: releaseManifestStrictEvidenceFixture({
      fingerprint: "b".repeat(64),
    }),
    artifact: {
      manifestSha256: "c".repeat(64),
      sourceArchiveSha256: "d".repeat(64),
    },
    migration: {
      latest: "20260731124000",
      sequenceSha256: "e".repeat(64),
    },
    customerConfig: { sourceSha256: "f".repeat(64) },
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

function preflight({ blocked = false, sha = SHA } = {}) {
  return {
    schemaVersion: "plush.target-preflight/v1",
    status: blocked ? "blocked" : "passed",
    target: "customer-test-133",
    customer: "yoyoosun",
    blockers: blocked ? ["target_migration_lock_held"] : [],
    remote: {
      capacity: {
        availableBytes: 80 * 1024 ** 3,
        minimumAvailableBytes: 30 * 1024 ** 3,
      },
      runtime: {
        databaseName: "plush_erp_customer_test_v1",
        serverSha: sha,
        webSha: sha,
        serverHealth: "passed",
        serverReady: "passed",
        webHealth: "passed",
      },
    },
  };
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "database-rebuild-controller-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "output"), { recursive: true });
  const releaseManifestPath = path.join(root, "release-manifest.json");
  writeFileSync(
    releaseManifestPath,
    `${JSON.stringify(releaseManifest(), null, 2)}\n`,
  );
  return {
    root,
    releaseManifestPath,
    store: resolveDeliveryOperationStore(root),
  };
}

test("database rebuild preparation becomes ready and reuses its operation", (t) => {
  const data = fixture(t);
  let calls = 0;
  let second = 0;
  const request = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "customer-test-133",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationStore: data.store,
  };
  const runtime = {
    classifyRelation,
    runPreflight: () => {
      calls += 1;
      return preflight();
    },
    now: () => `2026-08-03T12:00:0${second++}.000Z`,
  };
  const first = prepareDatabaseRebuild(request, runtime);
  const reused = prepareDatabaseRebuild(request, runtime);
  assert.equal(first.operation.action, "rebuild-database");
  assert.equal(first.operation.status, "ready");
  assert.equal(reused.reused, true);
  assert.equal(reused.operation.id, first.operation.id);
  assert.equal(calls, 1);
  assert.equal(
    readDatabaseRebuildPlan(data.store, first.operation.id).status,
    "eligible",
  );
});

test("database rebuild preparation persists a terminal blocker", (t) => {
  const data = fixture(t);
  const report = prepareDatabaseRebuild(
    {
      repoRoot: data.root,
      releaseManifestPath: data.releaseManifestPath,
      targetKey: "customer-test-133",
      idempotencyKey: IDEMPOTENCY_KEY,
      operationStore: data.store,
    },
    {
      classifyRelation,
      runPreflight: () => preflight({ blocked: true }),
    },
  );
  assert.equal(report.operation.status, "blocked");
  assert.deepEqual(report.plan.blockers, ["target_migration_lock_held"]);
  assert.doesNotMatch(
    readFileSync(
      path.join(data.store, "operations", `${report.operation.id}.json`),
      "utf8",
    ),
    /192\.168|\/home\/simon|password|token/iu,
  );
});

test("database rebuild controller CLI exposes explicit terminal retry lineage", () => {
  const options = parseDatabaseRebuildControllerArgs([
    "--release-manifest",
    "output/releases/example/release-manifest.json",
    "--target",
    "customer-test-133",
    "--idempotency-key",
    "database-rebuild-retry-example",
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

test("explicit terminal database rebuild retry creates a distinct ready lineage", (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  const common = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "customer-test-133",
    operationStore: data.store,
  };
  const first = prepareDatabaseRebuild(
    { ...common, idempotencyKey: IDEMPOTENCY_KEY },
    {
      classifyRelation,
      runPreflight: () => {
        preflightCalls += 1;
        return preflight({ blocked: true });
      },
    },
  );
  const retry = prepareDatabaseRebuild(
    {
      ...common,
      idempotencyKey: `${IDEMPOTENCY_KEY}:retry-2`,
      retryOfOperationId: first.operation.id,
    },
    {
      classifyRelation,
      runPreflight: () => {
        preflightCalls += 1;
        return preflight();
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

test("database rebuild controller help is plan-only", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "database-rebuild-controller.mjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /only prepares/iu);
  assert.match(result.stdout, /never stops services/iu);
  assert.match(result.stdout, /--retry-of-operation-id/iu);
});
