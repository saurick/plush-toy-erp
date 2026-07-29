import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createOrReuseDeliveryOperation,
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
    statSync(
      path.join(fixture.store, "operations", `${OPERATION_ID}.json`),
    ).mode & 0o777,
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
    recoverInterruptedDeliveryOperations(
      store,
      "2026-07-29T01:04:00.000Z",
    )[0].operation.status,
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
