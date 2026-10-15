import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEV_QUALITY_GATE_HISTORY_LIMIT_PER_PROFILE,
  createOrReuseDevQualityGateOperation,
  listDevQualityGateOperations,
  readDevQualityGateOperation,
  transitionDevQualityGateOperation,
} from "./dev-quality-gate-operation-store.mjs";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const REPOSITORY = Object.freeze({
  commit: "a".repeat(40),
  dirty: true,
  fingerprint: "b".repeat(64),
});

async function store(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-quality-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, "quality-gate-operations");
}

function receipt(profile = "strict") {
  return {
    profile,
    status: "passed",
    gitCommit: REPOSITORY.commit,
    treeState: "dirty",
    durationMs: 1200,
    finishedAt: "2026-08-09T10:00:02.000Z",
    executed: 12,
    passed: 12,
    failed: 0,
    skipped: 0,
    environmentFingerprint: "c".repeat(64),
    bottleneckStageId: "environment_profile",
    stageTimings: [
      {
        id: "environment_profile",
        label: "环境与门禁配置",
        status: "passed",
        startedAt: "2026-08-09T10:00:00.000Z",
        finishedAt: "2026-08-09T10:00:01.200Z",
        durationMs: 1200,
      },
    ],
  };
}

test("quality gate operation persists stages, receipt and exact cleanup proof", async (t) => {
  const target = await store(t);
  const key = `quality-gate:strict:${ID}`;
  const created = createOrReuseDevQualityGateOperation(target, {
    profile: "strict",
    idempotencyKey: key,
    repository: REPOSITORY,
    operationId: ID,
    now: "2026-08-09T10:00:00.000Z",
  });
  assert.equal(created.reused, false);
  const running = transitionDevQualityGateOperation(target, ID, {
    status: "running",
    stage: "environment_profile",
    message: "正在准备环境与工具链",
    stageTimings: [
      {
        id: "environment_profile",
        label: "环境与门禁配置",
        status: "running",
        startedAt: "2026-08-09T10:00:00.000Z",
        finishedAt: null,
        durationMs: null,
      },
    ],
    now: "2026-08-09T10:00:01.000Z",
  });
  assert.equal(running.status, "running");
  const passed = transitionDevQualityGateOperation(target, ID, {
    status: "passed",
    message: "严格门禁通过",
    receipt: receipt(),
    stageTimings: receipt().stageTimings,
    cleanup: {
      status: "complete",
      message: "一次性数据库、进程组和运行锁已完成清理读回",
    },
    now: "2026-08-09T10:00:02.000Z",
  });
  assert.equal(passed.finishedAt, "2026-08-09T10:00:02.000Z");
  assert.equal(readDevQualityGateOperation(target, ID).receipt.executed, 12);
  assert.equal(
    createOrReuseDevQualityGateOperation(target, {
      profile: "strict",
      idempotencyKey: key,
      repository: REPOSITORY,
    }).reused,
    true,
  );
});

test("quality gate operation records cancelling and timeout without claiming pass", async (t) => {
  const target = await store(t);
  createOrReuseDevQualityGateOperation(target, {
    profile: "full",
    idempotencyKey: `quality-gate:full:${ID}`,
    repository: REPOSITORY,
    operationId: ID,
  });
  transitionDevQualityGateOperation(target, ID, {
    status: "running",
    stage: "server",
    message: "正在运行隔离数据库与服务端测试",
  });
  transitionDevQualityGateOperation(target, ID, {
    status: "cancelling",
    stage: "server",
    message: "运行已超时，正在等待清理",
    cancelRequestedAt: "2026-08-09T10:01:00.000Z",
  });
  const timedOut = transitionDevQualityGateOperation(target, ID, {
    status: "timed_out",
    message: "运行已超时并完成清理",
    firstFailure: "运行超过固定时限",
    cleanup: {
      status: "complete",
      message: "一次性数据库、进程组和运行锁已完成清理读回",
    },
  });
  assert.equal(timedOut.status, "timed_out");
  assert.equal(timedOut.receipt, null);
});

test("quality gate operation rejects unsafe fields, bad transitions and false pass", async (t) => {
  const target = await store(t);
  assert.throws(() =>
    createOrReuseDevQualityGateOperation(target, {
      profile: "strict",
      idempotencyKey: `quality-gate:full:${ID}`,
      repository: REPOSITORY,
      operationId: ID,
    }),
  );
  createOrReuseDevQualityGateOperation(target, {
    profile: "strict",
    idempotencyKey: `quality-gate:strict:${ID}`,
    repository: REPOSITORY,
    operationId: ID,
  });
  assert.throws(() =>
    transitionDevQualityGateOperation(target, ID, {
      status: "running",
      stage: "preparing",
      message: "token=unsafe",
    }),
  );
  assert.throws(() =>
    transitionDevQualityGateOperation(target, ID, {
      status: "passed",
      message: "不能假装通过",
    }),
  );
});

test("quality gate history keeps at most twenty terminal records per profile", async (t) => {
  const target = await store(t);
  for (let index = 0; index < 22; index += 1) {
    const suffix = String(index + 1).padStart(12, "0");
    const id = `123e4567-e89b-42d3-a456-${suffix}`;
    createOrReuseDevQualityGateOperation(target, {
      profile: "full",
      idempotencyKey: `quality-gate:full:${id}`,
      repository: REPOSITORY,
      operationId: id,
      now: new Date(Date.UTC(2026, 7, 9, 10, 0, index)).toISOString(),
    });
    transitionDevQualityGateOperation(target, id, {
      status: "failed",
      message: "完整门禁未通过",
      firstFailure: "共享基础检查未通过",
      cleanup: {
        status: "not_required",
        message: "门禁未进入数据库阶段",
      },
      now: new Date(Date.UTC(2026, 7, 9, 10, 1, index)).toISOString(),
    });
  }
  assert.equal(
    listDevQualityGateOperations(target, { limit: 100 }).length,
    DEV_QUALITY_GATE_HISTORY_LIMIT_PER_PROFILE,
  );
});
