import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquireDevQaExecutionLock,
  attachDevQaExecutionChild,
  readDevQaExecutionLock,
  releaseDevQaExecutionLock,
  resolveDevQaExecutionLockFile,
} from "./dev-qa-execution-lock.mjs";

const COVERAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const TESTING_ID = "123e4567-e89b-42d3-a456-426614174001";
const QUALITY_ID = "123e4567-e89b-42d3-a456-426614174002";

async function stores(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-qa-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    coverage: path.join(root, "coverage-operations"),
    testing: path.join(root, "testing-operations"),
    quality: path.join(root, "quality-gate-operations"),
  };
}

test("global QA lock is shared by coverage and fixed testing actions", async (t) => {
  const store = await stores(t);
  const acquired = acquireDevQaExecutionLock(store.coverage, {
    kind: "coverage",
    profile: "baseline",
    operationId: COVERAGE_ID,
    ownerPid: 101,
    now: "2026-07-30T10:00:00.000Z",
  });
  assert.equal(
    resolveDevQaExecutionLockFile(store.coverage),
    resolveDevQaExecutionLockFile(store.testing),
  );
  assert.equal(acquired.childPid, null);
  assert.throws(
    () =>
      acquireDevQaExecutionLock(store.testing, {
        kind: "testing",
        profile: "fast",
        operationId: TESTING_ID,
        ownerPid: 102,
      }),
    (error) => error?.code === "DEV_QA_EXECUTION_LOCKED",
  );
});

test("global QA lock serializes full and strict with other local QA work", async (t) => {
  const store = await stores(t);
  acquireDevQaExecutionLock(store.quality, {
    kind: "quality",
    profile: "strict",
    operationId: QUALITY_ID,
    ownerPid: 401,
  });
  assert.equal(
    resolveDevQaExecutionLockFile(store.quality),
    resolveDevQaExecutionLockFile(store.testing),
  );
  assert.throws(
    () =>
      acquireDevQaExecutionLock(store.testing, {
        kind: "testing",
        profile: "fast",
        operationId: TESTING_ID,
        ownerPid: 402,
      }),
    (error) => error?.code === "DEV_QA_EXECUTION_LOCKED",
  );
  releaseDevQaExecutionLock(store.quality, {
    kind: "quality",
    profile: "strict",
    operationId: QUALITY_ID,
  });
});

test("global QA lock attaches only the matching child and releases exactly", async (t) => {
  const store = await stores(t);
  acquireDevQaExecutionLock(store.testing, {
    kind: "testing",
    profile: "role-access",
    operationId: TESTING_ID,
    ownerPid: 201,
  });
  assert.throws(
    () =>
      attachDevQaExecutionChild(store.testing, {
        kind: "testing",
        profile: "field-linkage",
        operationId: TESTING_ID,
        childPid: 301,
      }),
    /child identity/u,
  );
  assert.equal(
    attachDevQaExecutionChild(store.testing, {
      kind: "testing",
      profile: "role-access",
      operationId: TESTING_ID,
      childPid: 301,
    }).childPid,
    301,
  );
  assert.throws(
    () =>
      releaseDevQaExecutionLock(store.testing, {
        kind: "testing",
        profile: "role-access",
        operationId: COVERAGE_ID,
      }),
    /belongs to another/u,
  );
  assert.equal(
    releaseDevQaExecutionLock(store.testing, {
      kind: "testing",
      profile: "role-access",
      operationId: TESTING_ID,
    }),
    true,
  );
  assert.equal(readDevQaExecutionLock(store.coverage), null);
});

test("global QA lock rejects invalid kind/profile combinations", async (t) => {
  const store = await stores(t);
  assert.throws(
    () =>
      acquireDevQaExecutionLock(store.testing, {
        kind: "coverage",
        profile: "fast",
        operationId: TESTING_ID,
      }),
    /kind\/profile/u,
  );
});
