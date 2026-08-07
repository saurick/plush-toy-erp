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
import test from "node:test";

import {
  preparePromotion,
  readPromotionPlan,
} from "./promotion-controller.mjs";
import { resolveDeliveryOperationStore } from "./delivery-operation-store.mjs";
import { releaseManifestStrictEvidenceFixture } from "./release-catalog-test-fixtures.mjs";

const SHA = "a".repeat(40);
const CURRENT_SHA = "b".repeat(40);
const HASH = "c".repeat(64);
const IDEMPOTENCY_KEY =
  "promotion:test-133:123e4567-e89b-42d3-a456-426614174000";

function releaseManifest() {
  return {
    schemaVersion: "plush.release-manifest/v1",
    passed: true,
    version: "2026.07.29-1",
    gitSha: SHA,
    strict: releaseManifestStrictEvidenceFixture(),
    artifact: {
      manifestSha256: HASH,
      sourceArchiveSha256: "e".repeat(64),
    },
    migration: {
      latest: "20260729000000",
      sequenceSha256: "f".repeat(64),
    },
    customerConfig: { sourceSha256: "1".repeat(64) },
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

test("promotion preparation becomes ready after one read-only preflight", (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  const runtime = {
    now: (() => {
      let second = 0;
      return () => `2026-07-29T03:00:0${second++}.000Z`;
    })(),
    runPreflight: () => {
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
  const first = preparePromotion(request, runtime);
  const second = preparePromotion(request, runtime);
  assert.equal(first.operation.status, "ready");
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(preflightCalls, 1);
  assert.equal(readPromotionPlan(data.store, first.operation.id).status, "eligible");
});

test("promotion preparation persists disk blocker as a terminal operation", (t) => {
  const data = fixture(t);
  let preflightCalls = 0;
  const request = {
    repoRoot: data.root,
    releaseManifestPath: data.releaseManifestPath,
    targetKey: "test-133",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationStore: data.store,
  };
  const first = preparePromotion(request, {
    runPreflight: () => {
      preflightCalls += 1;
      return targetPreflight(true);
    },
  });
  const second = preparePromotion(request, {
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
