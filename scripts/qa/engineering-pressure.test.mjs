import assert from "node:assert/strict";
import test from "node:test";
import { ENGINEERING_PRESSURE_PROFILES, engineeringPressurePoolSize, runEngineeringPressure } from "./engineering-pressure.mjs";
import { pressureLifecyclePlan } from "./pressure-isolated-lifecycle.mjs";

test("normal capacity has bounded continuous work, a distinct order pool and recovery", () => {
  const profile = ENGINEERING_PRESSURE_PROFILES.capacity;
  assert.ok(profile[1].durationMs >= 600000);
  assert.ok(profile[1].pacingMs > 0 && profile[1].concurrency <= 100);
  assert.equal(profile[2].key, "recovery"); assert.ok(profile[2].concurrency < profile[1].concurrency);
  assert.ok(engineeringPressurePoolSize("capacity") > engineeringPressurePoolSize("quick"));
});
test("500-row sustained pagination requires the volume dataset, including a full and a tail page", () => {
  assert.deepEqual(pressureLifecyclePlan("capacity", "volume").pagination,
    { pageSize: 500, totalOrders: 762, fullPages: 1, tailRows: 262 });
  assert.deepEqual(pressureLifecyclePlan("quick", "volume").pagination,
    { pageSize: 500, totalOrders: 542, fullPages: 1, tailRows: 42 });
  assert.equal(pressureLifecyclePlan("capacity", "growth").pagination.fullPages, 0);
});
test("business pressure refuses a mismatched receipt before authentication or load", async () => {
  await assert.rejects(runEngineeringPressure({
    baseURL: "http://127.0.0.1:1", databaseName: "plush_erp_capacity_test",
    databaseURL: "postgres://u:p@127.0.0.1:5432/plush_erp_capacity_test", tokens: {}, receipt: { status: "passed" },
  }), /receipt/u);
});
