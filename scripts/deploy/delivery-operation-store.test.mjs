import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createOrReuseDeliveryOperation,
  DELIVERY_OPERATION_ACTIONS,
  deliveryOperationRequestCounts,
  listDeliveryOperations,
  readDeliveryOperation,
  recoverInterruptedDeliveryOperation,
  recoverInterruptedDeliveryOperations,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from "./delivery-operation-store.mjs";

const SHA = "a".repeat(40);
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const IDEMPOTENCY_KEY = "deploy:test-133:123e4567-e89b-42d3-a456-426614174000";

function runChild(moduleUrl, store, key) {
  const source = `
    import { createOrReuseDeliveryOperation } from ${JSON.stringify(moduleUrl)};
    const result = createOrReuseDeliveryOperation(${JSON.stringify(store)}, {
      action: "release",
      target: "github-release",
      gitSha: ${JSON.stringify(SHA)},
      version: "2026.07.29-1",
      idempotencyKey: process.argv[1],
      metadata: { source: "version-center" },
      now: "2026-07-29T01:00:00.000Z"
    });
    process.stdout.write(result.operation.id);
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", source, key],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `child exited with ${String(code)}`));
    });
  });
}

test("delivery operation registry includes the fixed database rebuild action", () => {
  assert.equal(DELIVERY_OPERATION_ACTIONS.includes("rebuild-database"), true);
});

function createStore(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "delivery-operation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    store: resolveDeliveryOperationStore(root),
  };
}

test("delivery operation store creates private idempotent records", (t) => {
  const fixture = createStore(t);
  const request = {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
    metadata: { source: "version-center" },
  };
  const first = createOrReuseDeliveryOperation(fixture.store, request);
  const second = createOrReuseDeliveryOperation(fixture.store, request);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(
    statSync(path.join(fixture.store, "operations", `${OPERATION_ID}.json`))
      .mode & 0o777,
    0o600,
  );
  assert.doesNotMatch(
    readFileSync(
      path.join(fixture.store, "operations", `${OPERATION_ID}.json`),
      "utf8",
    ),
    /password|token|\/Users\//iu,
  );
  assert.throws(
    () =>
      createOrReuseDeliveryOperation(fixture.store, {
        ...request,
        action: "rollback",
      }),
    /another request/u,
  );
});

test("different browser keys reuse the same delivery intent", (t) => {
  const { store } = createStore(t);
  const base = {
    action: "release",
    target: "github-release",
    gitSha: SHA,
    version: "2026.07.29-1",
    metadata: { source: "version-center" },
    now: "2026-07-29T01:00:00.000Z",
  };
  const first = createOrReuseDeliveryOperation(store, {
    ...base,
    idempotencyKey:
      "version-center:release:123e4567-e89b-42d3-a456-426614174001",
  });
  const second = createOrReuseDeliveryOperation(store, {
    ...base,
    idempotencyKey:
      "version-center:release:123e4567-e89b-42d3-a456-426614174002",
  });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.operation.id, first.operation.id);
  assert.equal(
    deliveryOperationRequestCounts(store).get(first.operation.id),
    2,
  );
  assert.equal(listDeliveryOperations(store).length, 1);
});

test("operation identity stays random across isolated stores", (t) => {
  const first = createStore(t);
  const second = createStore(t);
  const request = {
    action: "release",
    target: "github-release",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey:
      "version-center:release:123e4567-e89b-42d3-a456-426614174008",
    metadata: { source: "version-center" },
    now: "2026-07-29T01:00:00.000Z",
  };
  assert.notEqual(
    createOrReuseDeliveryOperation(first.store, request).operation.id,
    createOrReuseDeliveryOperation(second.store, request).operation.id,
  );
});

test("invalid operation input does not reserve its idempotency key", (t) => {
  const { store } = createStore(t);
  const request = {
    action: "release",
    target: "github-release",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey:
      "version-center:release:123e4567-e89b-42d3-a456-426614174009",
    metadata: { source: "version-center" },
  };
  assert.throws(
    () => createOrReuseDeliveryOperation(store, { ...request, now: "invalid" }),
    /operation event is invalid/u,
  );
  const created = createOrReuseDeliveryOperation(store, {
    ...request,
    now: "2026-07-29T01:00:00.000Z",
  });
  assert.equal(created.reused, false);
  assert.equal(listDeliveryOperations(store).length, 1);
});

test("failed operation retry creates one linked immutable attempt", (t) => {
  const { store } = createStore(t);
  const request = {
    action: "release",
    target: "github-release",
    gitSha: SHA,
    version: "2026.07.29-1",
    metadata: { source: "version-center" },
    now: "2026-07-29T01:00:00.000Z",
  };
  const first = createOrReuseDeliveryOperation(store, {
    ...request,
    idempotencyKey:
      "version-center:release:123e4567-e89b-42d3-a456-426614174001",
  });
  transitionDeliveryOperation(store, first.operation.id, {
    status: "running",
    message: "release dispatch started",
    now: "2026-07-29T01:01:00.000Z",
  });
  transitionDeliveryOperation(store, first.operation.id, {
    status: "failed",
    message: "release dispatch failed before target write",
    now: "2026-07-29T01:02:00.000Z",
  });
  const retryRequest = {
    ...request,
    idempotencyKey: "version-center:retry:123e4567-e89b-42d3-a456-426614174002",
    retryOfOperationId: first.operation.id,
    now: "2026-07-29T01:03:00.000Z",
  };
  const retry = createOrReuseDeliveryOperation(store, retryRequest);
  const repeated = createOrReuseDeliveryOperation(store, {
    ...retryRequest,
    idempotencyKey: "version-center:retry:123e4567-e89b-42d3-a456-426614174003",
  });
  assert.equal(retry.reused, false);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.operation.id, retry.operation.id);
  assert.equal(retry.operation.attempt, 2);
  assert.equal(retry.operation.retryOfOperationId, first.operation.id);
  assert.equal(retry.operation.rootOperationId, first.operation.id);
  assert.equal(
    readDeliveryOperation(store, first.operation.id).status,
    "failed",
  );
  assert.equal(listDeliveryOperations(store).length, 2);
});

test("unknown target outcome cannot be retried", (t) => {
  const { store } = createStore(t);
  const first = createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    metadata: { source: "version-center" },
    idempotencyKey:
      "version-center:promote:123e4567-e89b-42d3-a456-426614174001",
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, first.operation.id, {
    status: "running",
    message: "target write started",
    now: "2026-07-29T01:01:00.000Z",
  });
  recoverInterruptedDeliveryOperation(
    store,
    first.operation.id,
    "2026-07-29T01:02:00.000Z",
  );
  assert.throws(
    () =>
      createOrReuseDeliveryOperation(store, {
        action: "promote",
        target: "test-133",
        gitSha: SHA,
        version: "2026.07.29-1",
        metadata: { source: "version-center" },
        idempotencyKey:
          "version-center:retry:123e4567-e89b-42d3-a456-426614174002",
        retryOfOperationId: first.operation.id,
      }),
    /read back before retry/u,
  );
});

test("parallel processes atomically converge on one operation", async (t) => {
  const { store } = createStore(t);
  const moduleUrl = new URL("./delivery-operation-store.mjs", import.meta.url)
    .href;
  assert.equal(
    fileURLToPath(new URL(moduleUrl)),
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "delivery-operation-store.mjs",
    ),
  );
  const ids = await Promise.all(
    Array.from({ length: 6 }, (_value, index) =>
      runChild(
        moduleUrl,
        store,
        `version-center:release:123e4567-e89b-42d3-a456-${String(index + 1).padStart(12, "0")}`,
      ),
    ),
  );
  assert.equal(new Set(ids).size, 1);
  assert.equal(listDeliveryOperations(store).length, 1);
  assert.equal(deliveryOperationRequestCounts(store).get(ids[0]), 6);
});

test("delivery operation terminal states cannot start another lifecycle", (t) => {
  const { store } = createStore(t);
  createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "target preflight started",
    now: "2026-07-29T01:01:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "blocked",
    message: "target disk capacity is below the fixed minimum",
    issues: [
      {
        code: "target_disk_capacity_low",
        level: "error",
        message: "目标根盘可用空间不足",
      },
    ],
    now: "2026-07-29T01:02:00.000Z",
  });
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, "blocked");
  assert.throws(
    () =>
      transitionDeliveryOperation(store, OPERATION_ID, {
        status: "running",
        message: "retry",
      }),
    /transition is invalid/u,
  );
});

test("interrupted target writes become not_proven and never auto-retry", (t) => {
  const { store } = createStore(t);
  createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "target write started",
    now: "2026-07-29T01:01:00.000Z",
  });
  const recovered = recoverInterruptedDeliveryOperation(
    store,
    OPERATION_ID,
    "2026-07-29T01:02:00.000Z",
  );
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.operation.status, "not_proven");
  assert.equal(
    recoverInterruptedDeliveryOperation(store, OPERATION_ID).recovered,
    false,
  );
});

test("ready operation can execute once without creating another identity", (t) => {
  const { store } = createStore(t);
  createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "read-only target preflight started",
    now: "2026-07-29T01:01:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "ready",
    message: "promotion plan is eligible",
    now: "2026-07-29T01:02:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "target write started",
    now: "2026-07-29T01:03:00.000Z",
  });
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, "running");
});

test("operation listing is bounded and startup recovery freezes running work", (t) => {
  const { store } = createStore(t);
  createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "target write started",
    now: "2026-07-29T01:01:00.000Z",
  });
  assert.equal(listDeliveryOperations(store).length, 1);
  const recovered = recoverInterruptedDeliveryOperations(
    store,
    "2026-07-29T01:02:00.000Z",
  );
  assert.equal(recovered[0].recovered, true);
  assert.equal(listDeliveryOperations(store)[0].status, "not_proven");
});

test("external release wait survives restart and can reconcile terminal state", (t) => {
  const { store } = createStore(t);
  createOrReuseDeliveryOperation(store, {
    action: "release",
    target: "github-release",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "release dispatch started",
    now: "2026-07-29T01:01:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "waiting",
    message: "release workflow accepted",
    now: "2026-07-29T01:02:00.000Z",
  });
  assert.equal(
    recoverInterruptedDeliveryOperations(store)[0].operation.status,
    "waiting",
  );
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "passed",
    message: "immutable release published",
    now: "2026-07-29T01:03:00.000Z",
  });
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, "passed");
});

test("launched child is frozen as not_proven when the workbench restarts", (t) => {
  const { store } = createStore(t);
  createOrReuseDeliveryOperation(store, {
    action: "promote",
    target: "test-133",
    gitSha: SHA,
    version: "2026.07.29-1",
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: "2026-07-29T01:00:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "running",
    message: "read-only preflight started",
    now: "2026-07-29T01:01:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "ready",
    message: "promotion ready",
    now: "2026-07-29T01:02:00.000Z",
  });
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: "launching",
    message: "promotion child launched",
    now: "2026-07-29T01:03:00.000Z",
  });
  assert.equal(
    recoverInterruptedDeliveryOperations(store, "2026-07-29T01:04:00.000Z")[0]
      .operation.status,
    "not_proven",
  );
});

test("delivery operation metadata rejects secrets paths and arbitrary output roots", (t) => {
  const { root, store } = createStore(t);
  assert.throws(
    () =>
      createOrReuseDeliveryOperation(store, {
        action: "promote",
        target: "test-133",
        gitSha: SHA,
        version: "2026.07.29-1",
        idempotencyKey: IDEMPOTENCY_KEY,
        operationId: OPERATION_ID,
        metadata: { token: "secret" },
      }),
    /disallowed key/u,
  );
  assert.throws(
    () =>
      createOrReuseDeliveryOperation(store, {
        action: "promote",
        target: "test-133",
        gitSha: SHA,
        version: "2026.07.29-1",
        idempotencyKey: IDEMPOTENCY_KEY,
        operationId: OPERATION_ID,
        metadata: { location: "/Users/example/private" },
      }),
    /sensitive content/u,
  );
  assert.throws(
    () => resolveDeliveryOperationStore(root, "../outside"),
    /repository output/u,
  );
});
