import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlan,
  buildTimestampRunId,
  parseCliArgs,
  sanitizeRunId,
} from "./operational-fact-simulated-closure.mjs";

test("operational fact simulated closure plan marks data as simulated and excludes customer acceptance blocker", () => {
  const options = parseCliArgs([
    "--product-id",
    "1",
    "--unit-id",
    "2",
    "--warehouse-id",
    "3",
    "--run-id",
    "demo run",
  ]);
  const plan = buildPlan(options);

  assert.equal(plan.scope, "Operational Facts");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.customerAcceptanceRequiredForClosure, false);
  assert.deepEqual(plan.ids, {
    productId: 1,
    unitId: 2,
    warehouseId: 3,
  });
  assert.match(plan.records.productionReceipt.fact_no, /^SIM-YOYOOSUN-OPFACT-/u);
  assert.equal(plan.records.productionReceipt.fact_type, "FINISHED_GOODS_RECEIPT");
  assert.equal(plan.records.outsourcingIssue.fact_type, "MATERIAL_ISSUE");
  assert.equal(plan.records.financeSettle.fact_type, "RECEIVABLE");
  assert.equal(plan.records.financeCancel.fact_type, "INVOICE");
});

test("operational fact simulated closure refuses real import style flags", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "--product-id",
        "1",
        "--unit-id",
        "1",
        "--warehouse-id",
        "1",
        "--real-import",
      ]),
    /refuses real import/u,
  );
});

test("operational fact simulated closure requires positive ids", () => {
  assert.throws(
    () =>
      buildPlan({
        backendURL: "http://127.0.0.1:8300",
        runId: "T",
        productId: 1,
        unitId: 1,
      }),
    /warehouseId must be a positive integer/u,
  );
});

test("operational fact simulated closure normalizes run ids", () => {
  assert.equal(sanitizeRunId("  a/b c  "), "A-B-C");
  assert.equal(
    buildTimestampRunId(new Date("2026-06-08T12:34:56.789Z")),
    "20260608T123456Z",
  );
});
