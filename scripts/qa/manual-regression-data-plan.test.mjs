import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualRegressionDataPlan,
  formatManualRegressionDataPlan,
} from "./manual-regression-data-plan.mjs";

function expectContainsAll(actual, expected, label) {
  for (const item of expected) {
    assert(
      actual.includes(item),
      `${label} must include ${item}; actual=${actual.join(", ")}`,
    );
  }
}

test("manual-regression-data-plan: keeps read-only simulated boundary", () => {
  const plan = buildManualRegressionDataPlan();

  assert.equal(plan.scope, "manual-regression-data-plan");
  assert.equal(plan.readOnly, true);
  assert.equal(plan.writesDatabase, false);
  assert.equal(plan.callsBackend, false);
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.productCore.prefix, "SIM-PLUSH-CORE");
  assert.equal(plan.productCore.realCustomerImport, false);
  assert.equal(plan.yoyoosun.customerKey, "yoyoosun");
  assert.equal(plan.yoyoosun.dataVersion, "2026.07.16-v5");
  assert.equal(plan.yoyoosun.runId, "20260716-V5");
  assert.equal(plan.yoyoosun.simulatedOnly, true);
  assert.equal(plan.yoyoosun.realCustomerImport, false);
  assert.equal(plan.yoyoosun.fixtureStatus, "preview_only");

  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(serialized, /CUSTOMER_IMPORT_CONFIRM/u);
  assert.doesNotMatch(serialized, /EXECUTE_YOYOOSUN_IMPORT/u);
  assert.doesNotMatch(serialized, /POSTGRES_DSN|sql\.Open|pgx/u);
});

test("manual-regression-data-plan: fixture coverage is broad enough for manual regression", () => {
  const plan = buildManualRegressionDataPlan();
  const counts = plan.yoyoosun.fixtureCounts;

  assert.ok(counts.units >= 4);
  assert.ok(counts.customers >= 2);
  assert.ok(counts.suppliers >= 3);
  assert.ok(counts.materials >= 5);
  assert.ok(counts.products >= 3);
  assert.ok(counts.warehouses >= 4);
  assert.ok(counts.bomVersions >= 2);
  assert.ok(counts.salesOrders >= 3);
  assert.ok(counts.purchaseOrders >= 2);
  assert.ok(counts.outsourcingOrders >= 2);
  assert.ok(counts.purchaseReceipts >= 2);
  assert.ok(counts.qualityInspections >= 3);
  assert.ok(counts.inventoryLots >= 3);
  assert.ok(counts.shipments >= 3);
  assert.ok(counts.financeDrafts >= 3);
  assert.ok(counts.workflowTasks >= 5);

  expectContainsAll(
    plan.yoyoosun.fixtureStateCoverage.salesOrderLifecycleStatuses,
    ["active", "cancelled", "draft"],
    "sales statuses",
  );
  expectContainsAll(
    plan.yoyoosun.fixtureStateCoverage.qualityInspectionResults,
    ["passed", "pending", "rejected"],
    "quality results",
  );
  expectContainsAll(
    plan.yoyoosun.fixtureStateCoverage.shipmentStatuses,
    ["cancelled", "draft", "shipped"],
    "shipment statuses",
  );
  expectContainsAll(
    plan.yoyoosun.fixtureStateCoverage.workflowOwnerRoles,
    ["boss", "purchase", "quality", "sales", "warehouse"],
    "workflow roles",
  );
  expectContainsAll(
    plan.yoyoosun.fixtureStateCoverage.workflowTaskStatuses,
    ["blocked", "done", "ready"],
    "workflow task statuses",
  );
});

test("manual-regression-data-plan: current dataset uses one source-driven fact path for both targets", () => {
  const plan = buildManualRegressionDataPlan();
  const commands = plan.yoyoosun.commands;

  assert.equal(plan.yoyoosun.currentContract.version, "2026.07.16-v5");
  assert.equal(plan.yoyoosun.currentContract.runId, "20260716-V5");
  assert.deepEqual(plan.yoyoosun.currentContract.targets, [
    "local",
    "customer-trial-133",
  ]);
  assert.equal(
    plan.yoyoosun.currentContract.purchaseQualityHandledByFacts,
    true,
  );
  assert.equal(
    plan.yoyoosun.targetRules["customer-trial-133"].remoteSeedAllowed,
    false,
  );
  assert.equal(
    commands.factsEntrypoint,
    "scripts/qa/manual-acceptance-fact-data.mjs",
  );
  assert.match(commands.sourcePlan, /2026\.07\.16-v5.*20260716-V5/u);
  assert.doesNotMatch(
    JSON.stringify(plan),
    /purchase-quality-simulated-matrix|operational-fact-simulated-closure/u,
  );
});

test("manual-regression-data-plan: formatted output is reviewable", () => {
  const output = formatManualRegressionDataPlan(buildManualRegressionDataPlan());

  assert.match(output, /手工回归数据计划/u);
  assert.match(output, /本地通用基础资料/u);
  assert.match(output, /SIM-PLUSH-CORE/u);
  assert.match(output, /永绅模拟验收数据/u);
  assert.match(output, /2026\.07\.16-v5 \/ 20260716-V5/u);
  assert.match(output, /review-pass-1-runtime-contract-and-fixture-unit-tests/u);
});
