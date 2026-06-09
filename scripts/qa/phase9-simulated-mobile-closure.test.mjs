import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlan,
  buildTimestampRunId,
  parseCliArgs,
  sanitizeRunId,
} from "./phase9-simulated-mobile-closure.mjs";

test("phase9 simulated mobile closure plan stays simulated and workflow-only", () => {
  const options = parseCliArgs(["--run-id", "demo run"]);
  const plan = buildPlan(options);

  assert.equal(plan.phase, "Phase 9");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.factPosting, false);
  assert.equal(plan.customerAcceptanceRequiredForPhaseClosure, false);
  assert.match(plan.tasks.approval.task_code, /^SIM-YOYOOSUN-PHASE9-/u);
  assert.equal(plan.tasks.approval.task_group, "order_approval");
  assert.equal(plan.tasks.quality.task_group, "finished_goods_qc");
  assert.equal(plan.tasks.warehouseInbound.task_group, "warehouse_inbound");
  assert.equal(plan.tasks.shipmentRelease.task_group, "shipment_release");
  assert.equal(
    plan.tasks.shipmentRelease.business_status_key,
    "shipment_pending",
  );
});

test("phase9 simulated mobile closure refuses real import flags", () => {
  assert.throws(() => parseCliArgs(["--real-import"]), /refuses real import/u);
});

test("phase9 simulated mobile closure action payload records evidence and exception", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "mobile evidence"]));

  assert.deepEqual(
    plan.actions.qualityDone.payload.mobile_action_evidence_refs,
    ["SIM-YOYOOSUN-PHASE9-MOBILE-EVIDENCE-PHOTO-QC"],
  );
  assert.equal(
    plan.actions.shipmentReleaseBlocked.payload.mobile_exception_report
      .simulated_only,
    true,
  );
  assert.match(
    plan.actions.shipmentReleaseBlocked.reason,
    /模拟出货唛头未确认/u,
  );
});

test("phase9 simulated mobile closure normalizes run ids", () => {
  assert.equal(sanitizeRunId("  a/b c  "), "A-B-C");
  assert.equal(
    buildTimestampRunId(new Date("2026-06-09T12:34:56.789Z")),
    "20260609T123456Z",
  );
});
