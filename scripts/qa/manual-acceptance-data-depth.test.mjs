import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACHMENT_FIXTURES,
  ATTACHMENT_OWNER_SCENARIOS,
  CAPACITY_PROFILES,
  buildManualAcceptanceDataDepthReport,
} from "./manual-acceptance-data-depth.mjs";
import { buildAttachmentFixtures } from "./manual-acceptance-attachment-data.mjs";

test("manual acceptance data has single, medium and 25-line documents", () => {
  const report = buildManualAcceptanceDataDepthReport();
  for (const key of [
    "salesOrders",
    "purchaseOrders",
    "outsourcingOrders",
    "bomVersions",
  ]) {
    const counts = report.evidence.documentDepth[key];
    assert(Number(counts[1]) > 0, `${key} needs a one-line sample`);
    assert(Number(counts[8]) > 0, `${key} needs an eight-line sample`);
    assert(Number(counts[25]) > 0, `${key} needs a 25-line sample`);
  }
});

test("contacts and production workflow pages cover empty, multiple and state-rich data", () => {
  const report = buildManualAcceptanceDataDepthReport();
  for (const key of ["customers", "suppliers"]) {
    assert(Number(report.evidence.contactDepth[key][0]) > 0);
    assert(Number(report.evidence.contactDepth[key][1]) > 0);
    assert(Number(report.evidence.contactDepth[key][2]) > 0);
  }
  assert.equal(report.evidence.taskGroups.trial_pmc_work, 25);
  assert.equal(report.evidence.taskGroups.trial_production_work, 15);
  assert.equal(report.evidence.taskGroups.trial_warehouse_work, 20);
  assert.equal(report.evidence.taskGroups.production_scheduling, undefined);
  assert.equal(report.evidence.taskGroups.production_exception, undefined);
  assert.equal(report.evidence.taskGroups.shipment_release, undefined);
});

test("attachment matrix requires multiple realistic files and workflow CAS", () => {
  assert.deepEqual(
    ATTACHMENT_FIXTURES,
    buildAttachmentFixtures().map((item) => ({
      fileName: item.file_name,
      mimeType: item.mime_type,
      sizeClass: item.sizeClass,
    })),
  );
  assert.equal(ATTACHMENT_FIXTURES.length, 5);
  assert(ATTACHMENT_FIXTURES.some((item) => item.sizeClass === "near-limit"));
  assert(new Set(ATTACHMENT_FIXTURES.map((item) => item.mimeType)).size >= 4);
  assert(ATTACHMENT_OWNER_SCENARIOS.every((item) => item.files >= 3));
  assert.equal(
    ATTACHMENT_OWNER_SCENARIOS.find(
      (item) => item.ownerType === "workflow_task",
    )?.requiresExpectedVersion,
    true,
  );
});

test("capacity and stress profiles are isolated from manual acceptance claims", () => {
  const report = buildManualAcceptanceDataDepthReport();
  assert.equal(report.pressureTestClaim.manualProfileIsPressureTest, false);
  assert.equal(
    report.pressureTestClaim.capacityProfileRequiresIsolatedDatabase,
    true,
  );
  assert.equal(
    report.pressureTestClaim.stressProfileRequiresIsolatedDatabase,
    true,
  );
  assert(
    CAPACITY_PROFILES.capacity.workflowTasks >
      CAPACITY_PROFILES.manual.workflowTasks,
  );
  assert(
    CAPACITY_PROFILES.stress.concurrentUsers >
      CAPACITY_PROFILES.capacity.concurrentUsers,
  );
  assert(
    report.pressureTestClaim.requiredMetrics.includes("p50、p95、p99 响应时间"),
  );
});
