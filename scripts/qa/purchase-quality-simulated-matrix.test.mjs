import assert from "node:assert/strict";
import test from "node:test";

import { buildPlan, parseArgs } from "./purchase-quality-simulated-matrix.mjs";

test("buildPlan creates a simulated multi-status purchase and quality matrix", () => {
  const plan = buildPlan({
    backendURL: "http://127.0.0.1:8300",
    runId: "TARGET-20260710",
    supplierId: 1,
    materialId: 2,
    unitId: 3,
    warehouseId: 4,
  });
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.match(plan.prefix, /^SIM-YOYOOSUN-PQ-/u);
  assert.deepEqual(plan.orderStatuses, ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELLED"]);
  assert.deepEqual(plan.receiptScenarios.map((item) => item.key), ["DRAFT", "PASSED", "REJECTED", "POSTED", "CANCELLED"]);
});

test("parseArgs rejects incomplete identifiers and unsafe run ids", () => {
  const parsed = parseArgs([
    "--supplier-id", "1",
    "--material-id", "2",
    "--unit-id", "3",
    "--warehouse-id", "4",
    "--run-id", "target run",
  ]);
  assert.equal(parsed.runId, "TARGET-RUN");
  assert.throws(() => buildPlan({ ...parsed, materialId: 0 }), /materialId must be a positive integer/u);
});

