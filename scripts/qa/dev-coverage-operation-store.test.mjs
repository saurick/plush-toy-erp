import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  COVERAGE_OPERATION_SCHEMA,
  acquireCoverageExecutionLock,
  attachCoverageExecutionChild,
  createOrReuseCoverageOperation,
  listCoverageOperations,
  readCoverageExecutionLock,
  readCoverageOperation,
  readCoverageOperationByIdempotencyKey,
  releaseCoverageExecutionLock,
  transitionCoverageOperation,
  validateCoverageOperation,
} from "./dev-coverage-operation-store.mjs";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const IDEMPOTENCY_KEY =
  "coverage:collect:baseline:223e4567-e89b-42d3-a456-426614174000";
const REPOSITORY = Object.freeze({
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
});

function createStore(t) {
  const store = mkdtempSync(path.join(os.tmpdir(), "coverage-operation-"));
  t.after(() => rmSync(store, { recursive: true, force: true }));
  return store;
}

test("coverage operation persists an exact queued to completed timeline", (t) => {
  const store = createStore(t);
  const created = createOrReuseCoverageOperation(store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    repository: REPOSITORY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  assert.equal(created.reused, false);
  assert.equal(created.operation.schemaVersion, COVERAGE_OPERATION_SCHEMA);
  assert.equal(created.operation.status, "queued");

  const running = transitionCoverageOperation(store, OPERATION_ID, {
    status: "running",
    stage: "go",
    message: "正在采集 Go 测试与代码覆盖",
    now: "2026-07-29T01:01:00.000Z",
  });
  assert.equal(running.revision, 2);
  assert.equal(running.finishedAt, null);

  const completed = transitionCoverageOperation(store, OPERATION_ID, {
    status: "completed",
    stage: "finished",
    message: "覆盖采集完成，报告包含失败或缺失项",
    outcome: "issues",
    exitCode: 2,
    now: "2026-07-29T01:02:00.000Z",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.outcome, "issues");
  assert.equal(completed.events.length, 3);
  assert.deepEqual(readCoverageOperation(store, OPERATION_ID), completed);
  assert.deepEqual(listCoverageOperations(store), [completed]);
});

test("coverage operation idempotency reuses the original immutable intent", (t) => {
  const store = createStore(t);
  const first = createOrReuseCoverageOperation(store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    repository: REPOSITORY,
    operationId: OPERATION_ID,
    now: "2026-07-29T02:00:00.000Z",
  });
  const second = createOrReuseCoverageOperation(store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    repository: {
      ...REPOSITORY,
      fingerprint: "c".repeat(64),
    },
    operationId: "323e4567-e89b-42d3-a456-426614174000",
    now: "2026-07-29T02:01:00.000Z",
  });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, OPERATION_ID);
  assert.deepEqual(
    readCoverageOperationByIdempotencyKey(store, IDEMPOTENCY_KEY),
    first.operation,
  );
});

test("coverage operation rejects backward stages and invented terminal success", (t) => {
  const store = createStore(t);
  createOrReuseCoverageOperation(store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    repository: REPOSITORY,
    operationId: OPERATION_ID,
    now: "2026-07-29T03:00:00.000Z",
  });
  transitionCoverageOperation(store, OPERATION_ID, {
    status: "running",
    stage: "web",
    message: "正在采集 Web 测试与代码覆盖",
    now: "2026-07-29T03:01:00.000Z",
  });
  assert.throws(
    () =>
      transitionCoverageOperation(store, OPERATION_ID, {
        status: "running",
        stage: "go",
        message: "错误的倒退阶段",
        now: "2026-07-29T03:02:00.000Z",
      }),
    /stage transition/u,
  );
  assert.throws(
    () =>
      transitionCoverageOperation(store, OPERATION_ID, {
        status: "completed",
        stage: "finished",
        message: "不能伪造成功",
        outcome: "passed",
        exitCode: 1,
        now: "2026-07-29T03:03:00.000Z",
      }),
    /state is inconsistent/u,
  );
});

test("coverage execution lock is private, exclusive, and owner-bound", (t) => {
  const store = createStore(t);
  const lock = acquireCoverageExecutionLock(store, OPERATION_ID, {
    ownerPid: 4321,
    now: "2026-07-29T04:00:00.000Z",
  });
  assert.equal(lock.ownerPid, 4321);
  assert.equal(lock.childPid, null);
  assert.throws(
    () =>
      acquireCoverageExecutionLock(
        store,
        "423e4567-e89b-42d3-a456-426614174000",
      ),
    /another coverage operation/u,
  );
  const attached = attachCoverageExecutionChild(store, OPERATION_ID, 9876);
  assert.equal(attached.childPid, 9876);
  assert.deepEqual(readCoverageExecutionLock(store), attached);
  assert.throws(
    () =>
      releaseCoverageExecutionLock(
        store,
        "523e4567-e89b-42d3-a456-426614174000",
      ),
    /belongs to another/u,
  );
  assert.equal(releaseCoverageExecutionLock(store, OPERATION_ID), true);
  assert.equal(readCoverageExecutionLock(store), null);
});

test("coverage operation validator rejects extra fields and unsafe messages", () => {
  const base = {
    schemaVersion: COVERAGE_OPERATION_SCHEMA,
    id: OPERATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    profile: "baseline",
    repository: REPOSITORY,
    status: "queued",
    stage: "queued",
    outcome: null,
    exitCode: null,
    revision: 1,
    createdAt: "2026-07-29T05:00:00.000Z",
    updatedAt: "2026-07-29T05:00:00.000Z",
    finishedAt: null,
    message: "覆盖采集任务已进入队列",
    events: [
      {
        at: "2026-07-29T05:00:00.000Z",
        status: "queued",
        stage: "queued",
        message: "覆盖采集任务已进入队列",
      },
    ],
  };
  assert.throws(
    () => validateCoverageOperation({ ...base, command: "rm" }),
    /unsupported fields/u,
  );
  assert.throws(
    () =>
      validateCoverageOperation({
        ...base,
        message: "read /Users/example/private.txt",
      }),
    /unsafe content/u,
  );
});
