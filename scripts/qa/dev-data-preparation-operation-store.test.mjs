import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createOrReuseDataPreparationOperation,
  transitionDataPreparationOperation,
} from "./dev-data-preparation-operation-store.mjs";

const HASH = "a".repeat(64);
const REPOSITORY = Object.freeze({
  commit: "b".repeat(40),
  dirty: true,
  fingerprint: "c".repeat(64),
});
const TARGET = Object.freeze({
  safeTarget: "host=192.168.0.106 port=5432 database=plush_erp",
  targetFingerprint: HASH,
  preflightFingerprint: "d".repeat(64),
  disposable: false,
  automaticCleanup: false,
});

function createFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "scenario-operation-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function scenarioReadback(overrides = {}) {
  return {
    schemaVersion: "plush.dev-data-preparation-readback/v1",
    profileKey: "scenario-demo",
    targetFingerprint: HASH,
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.07.16-v5",
    runId: "20260716-V5",
    sourceDocumentCount: 135,
    processRuntimeCount: 5,
    factCount: 500,
    catalogReadyCount: 40,
    catalogTargetCount: 50,
    browserChecksPending: 10,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: "exact-create-or-readback",
    ...overrides,
  };
}

function runningScenarioOperation(store) {
  const created = createOrReuseDataPreparationOperation(store, {
    idempotencyKey: "scenario-demo:123e4567-e89b-42d3-a456-426614174000",
    profileKey: "scenario-demo",
    repository: REPOSITORY,
    runId: "d260729020304_01020304",
    targetSummary: TARGET,
    planHash: "e".repeat(64),
    operationId: "123e4567-e89b-42d3-a456-426614174000",
    now: "2026-07-29T02:03:04.000Z",
  }).operation;
  transitionDataPreparationOperation(store, created.id, {
    status: "launching",
    message: "scenario demo launching",
    now: "2026-07-29T02:03:05.000Z",
  });
  return transitionDataPreparationOperation(store, created.id, {
    status: "running",
    message: "scenario demo running",
    now: "2026-07-29T02:03:06.000Z",
  });
}

test("scenario-demo operation store accepts only the fixed V5 40+10 forward-only readback", (t) => {
  const store = createFixture(t);
  const running = runningScenarioOperation(store);
  const passed = transitionDataPreparationOperation(store, running.id, {
    status: "passed",
    message: "scenario demo exact readback passed",
    readback: scenarioReadback(),
    now: "2026-07-29T02:03:07.000Z",
  });
  assert.equal(passed.readback.runId, "20260716-V5");
  assert.equal(passed.readback.catalogReadyCount, 40);
  assert.equal(passed.readback.browserChecksPending, 10);
  assert.equal(passed.readback.cleanupSupported, false);
  assert.equal(passed.readback.manualAcceptanceCompleted, false);
});

test("scenario-demo operation store rejects run drift, inflated catalog readiness, and cleanup claims", (t) => {
  for (const overrides of [
    { runId: "d260729020304_01020304" },
    { catalogReadyCount: 50 },
    { browserChecksPending: 50 },
    { manualAcceptanceCompleted: true },
    { cleanupSupported: true },
    { replayMode: "upsert" },
  ]) {
    const store = createFixture(t);
    const running = runningScenarioOperation(store);
    assert.throws(
      () =>
        transitionDataPreparationOperation(store, running.id, {
          status: "passed",
          message: "scenario demo invalid readback",
          readback: scenarioReadback(overrides),
          now: "2026-07-29T02:03:07.000Z",
        }),
      /scenario demo readback is invalid/u,
    );
  }
});
