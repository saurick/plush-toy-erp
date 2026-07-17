import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESSURE_LEVELS,
  normalizeLoopbackURL,
  percentile,
  selectCapacityIdempotencyTask,
} from "./manual-acceptance-capacity-pressure.mjs";

test("pressure target fails closed outside loopback", () => {
  assert.equal(
    normalizeLoopbackURL("http://127.0.0.1:8300"),
    "http://127.0.0.1:8300",
  );
  for (const value of [
    "https://example.com",
    "http://192.168.0.133:8300",
    "http://u:p@localhost:8300",
  ])
    assert.throws(() => normalizeLoopbackURL(value));
});

test("capacity and stress levels are distinct and reach 100 concurrent users", () => {
  assert.deepEqual(PRESSURE_LEVELS, [
    { key: "capacity", concurrency: 20, requests: 1000 },
    { key: "stress", concurrency: 100, requests: 5000 },
  ]);
});

test("percentile uses nearest-rank semantics", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5);
  assert.equal(percentile([], 0.99), 0);
});

test("capacity idempotency probe uses only the same-batch ready trial PMC task", () => {
  const batch = {
    sourceType: "simulated-manual-acceptance-task-batch",
    sourceID: 20260715,
  };
  const payload = {
    simulated_only: true,
    real_customer_data: false,
    trial_task: true,
  };
  const tasks = [
    ...[
      "production_scheduling",
      "production_exception",
      "shipment_release",
    ].map((task_group, index) => ({
      id: index + 1,
      task_group,
      task_status_key: "ready",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: batch.sourceID,
      payload,
    })),
    {
      id: 4,
      task_group: "trial_pmc_work",
      task_status_key: "ready",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: batch.sourceID + 1,
      payload,
    },
    {
      id: 5,
      task_group: "trial_pmc_work",
      task_status_key: "ready",
      owner_role_key: "pmc",
      source_type: batch.sourceType,
      source_id: batch.sourceID,
      payload,
    },
  ];
  assert.equal(selectCapacityIdempotencyTask(tasks, batch)?.id, 5);
  assert.equal(
    selectCapacityIdempotencyTask(tasks.slice(0, 4), batch),
    undefined,
  );
  assert.equal(
    selectCapacityIdempotencyTask(
      [{ ...tasks.at(-1), payload: { ...payload, simulated_only: false } }],
      batch,
    ),
    undefined,
  );
});
