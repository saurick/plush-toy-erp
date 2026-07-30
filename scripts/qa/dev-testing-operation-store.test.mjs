import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createOrReuseDevTestingOperation,
  listDevTestingOperations,
  readDevTestingOperation,
  readDevTestingOperationByIdempotencyKey,
  transitionDevTestingOperation,
} from "./dev-testing-operation-store.mjs";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const KEY = `testing:fast:${ID}`;
const REPOSITORY = Object.freeze({
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
});

async function store(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-testing-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, "testing-operations");
}

test("testing operation persists, transitions and reuses one intent", async (t) => {
  const target = await store(t);
  const created = createOrReuseDevTestingOperation(target, {
    action: "fast",
    idempotencyKey: KEY,
    repository: REPOSITORY,
    operationId: ID,
    now: "2026-07-30T10:00:00.000Z",
  });
  assert.equal(created.reused, false);
  assert.equal(created.operation.status, "queued");
  const running = transitionDevTestingOperation(target, ID, {
    status: "running",
    stage: "running",
    message: "正在运行开发门禁",
    now: "2026-07-30T10:00:01.000Z",
  });
  assert.equal(running.revision, 2);
  const completed = transitionDevTestingOperation(target, ID, {
    status: "completed",
    stage: "finished",
    message: "开发门禁完成",
    outcome: "passed",
    exitCode: 0,
    now: "2026-07-30T10:00:02.000Z",
  });
  assert.equal(completed.finishedAt, "2026-07-30T10:00:02.000Z");
  assert.equal(readDevTestingOperation(target, ID).status, "completed");
  assert.equal(
    readDevTestingOperationByIdempotencyKey(target, KEY)?.id,
    ID,
  );
  assert.equal(
    createOrReuseDevTestingOperation(target, {
      action: "fast",
      idempotencyKey: KEY,
      repository: REPOSITORY,
    }).reused,
    true,
  );
  assert.deepEqual(
    listDevTestingOperations(target).map((operation) => operation.id),
    [ID],
  );
});

test("testing operation represents role preconditions as blocked", async (t) => {
  const target = await store(t);
  const roleKey = `testing:role-access:${ID}`;
  createOrReuseDevTestingOperation(target, {
    action: "role-access",
    idempotencyKey: roleKey,
    repository: REPOSITORY,
    operationId: ID,
  });
  transitionDevTestingOperation(target, ID, {
    status: "running",
    stage: "running",
    message: "正在运行岗位权限巡检",
  });
  const blocked = transitionDevTestingOperation(target, ID, {
    status: "blocked",
    stage: "finished",
    message: "本地后端或演示账号凭据尚未就绪",
    outcome: "blocked",
    exitCode: 2,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.outcome, "blocked");
});

test("testing operation rejects mismatched intents, unsafe messages and regressions", async (t) => {
  const target = await store(t);
  assert.throws(
    () =>
      createOrReuseDevTestingOperation(target, {
        action: "field-linkage",
        idempotencyKey: KEY,
        repository: REPOSITORY,
        operationId: ID,
      }),
    /invalid/u,
  );
  createOrReuseDevTestingOperation(target, {
    action: "fast",
    idempotencyKey: KEY,
    repository: REPOSITORY,
    operationId: ID,
  });
  assert.throws(
    () =>
      transitionDevTestingOperation(target, ID, {
        status: "running",
        stage: "running",
        message: "token=secret-value",
      }),
    /unsafe/u,
  );
  transitionDevTestingOperation(target, ID, {
    status: "running",
    stage: "identity-check",
    message: "正在核对仓库身份",
  });
  assert.throws(
    () =>
      transitionDevTestingOperation(target, ID, {
        status: "running",
        stage: "running",
        message: "回退阶段",
      }),
    /stage transition/u,
  );
});
