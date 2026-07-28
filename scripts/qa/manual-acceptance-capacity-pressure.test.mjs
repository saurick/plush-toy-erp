import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESSURE_LEVELS,
  PRESSURE_PROFILES,
  normalizeLoopbackURL,
  percentile,
  selectCapacityIdempotencyTask,
} from "./manual-acceptance-capacity-pressure.mjs";
import { assertDisposableDatabaseTarget } from "./database-target.mjs";

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

test("capacity, saturation, and soak profiles have ramp and recovery semantics", () => {
  assert.deepEqual(PRESSURE_LEVELS, [
    { key: "ramp", concurrency: 5, requests: 100 },
    {
      key: "capacity",
      concurrency: 20,
      requests: 1000,
      cooldownBeforeMs: 2000,
      pacingMs: 400,
    },
    {
      key: "recovery",
      concurrency: 5,
      requests: 100,
      cooldownBeforeMs: 5000,
      pacingMs: 200,
    },
  ]);
  assert.equal(PRESSURE_PROFILES.saturation[1].concurrency, 100);
  assert.equal(PRESSURE_PROFILES.saturation[1].key, "saturation");
  assert.deepEqual(PRESSURE_PROFILES.saturation[1].allowedErrorClasses, [
    "rate_limited",
    "overloaded",
    "timeout",
  ]);
  assert.equal(PRESSURE_PROFILES.soak[1].key, "soak");
  for (const profile of Object.values(PRESSURE_PROFILES)) {
    assert.equal(profile.at(0).key, "ramp");
    assert.equal(profile.at(-1).key, "recovery");
  }
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
      "shipment_finance_approval",
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

test("capacity database target cannot escape loopback or reuse a long-lived database", () => {
  const databaseName = "plush_erp_capacity_20260728_a1b2";
  const target = assertDisposableDatabaseTarget({
    databaseName,
    databaseURL: `postgres://u:p@127.0.0.1:55432/${databaseName}?sslmode=disable`,
    profile: "capacity",
  });
  assert.equal(target.databaseRunIdentity, "capacity:20260728_a1b2");
  for (const databaseURL of [
    "postgres://u:p@127.0.0.1:55432/plush_erp?sslmode=disable",
    `postgres://u:p@192.168.0.133:55432/${databaseName}?sslmode=disable`,
  ]) {
    assert.throws(() =>
      assertDisposableDatabaseTarget({
        databaseName: new URL(databaseURL).pathname.slice(1),
        databaseURL,
        profile: "capacity",
      }),
    );
  }
});
