import assert from "node:assert/strict";
import { execFile as execFileWithCallback } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildInputTemplate,
  buildPlan,
  buildTimestampRunId,
  INPUT_TEMPLATE_SCOPE,
  parseCliArgs,
  sanitizeRunId,
} from "./mobile-workflow-simulated-closure.mjs";

const scriptPath = fileURLToPath(
  new URL("./mobile-workflow-simulated-closure.mjs", import.meta.url),
);
const execFile = promisify(execFileWithCallback);

test("mobile workflow simulated mobile closure plan stays simulated and workflow-only", () => {
  const options = parseCliArgs(["--run-id", "demo run"]);
  const plan = buildPlan(options);

  assert.equal(plan.scenario, "mobile-workflow-simulated-closure");
  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.factPosting, false);
  assert.equal(plan.customerAcceptanceRequiredForClosure, false);
  assert.match(plan.tasks.approval.task_code, /^SIM-YOYOOSUN-MOBILE-WORKFLOW-/u);
  assert.equal(plan.tasks.approval.task_group, "order_approval");
  assert.equal(plan.tasks.quality.task_group, "finished_goods_qc");
  assert.equal(plan.tasks.warehouseInbound.task_group, "warehouse_inbound");
  assert.equal(plan.tasks.shipmentRelease.task_group, "shipment_release");
  assert.equal(
    plan.tasks.shipmentRelease.business_status_key,
    "shipment_pending",
  );
});

test("mobile workflow simulated mobile closure refuses real import flags", () => {
  assert.throws(() => parseCliArgs(["--real-import"]), /refuses real import/u);
});

test("mobile workflow simulated mobile closure rejects credentialed backend URL", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "--backend-url",
        "http://demo:secret@127.0.0.1:8300",
      ]),
    /backend URL must not contain username or password/u,
  );
});

test("mobile workflow simulated mobile closure action payload records evidence and exception", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "mobile evidence"]));

  assert.deepEqual(
    plan.actions.qualityDone.payload.mobile_action_evidence_refs,
    ["SIM-YOYOOSUN-MOBILE-WORKFLOW-MOBILE-EVIDENCE-PHOTO-QC"],
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

test("mobile workflow simulated mobile closure normalizes run ids", () => {
  assert.equal(sanitizeRunId("  a/b c  "), "A-B-C");
  assert.equal(
    buildTimestampRunId(new Date("2026-06-09T12:34:56.789Z")),
    "20260609T123456Z",
  );
});

test("mobile workflow simulated mobile closure input template is no-write", () => {
  const template = buildInputTemplate({
    out: "output/custom/mobile-workflow",
    runId: "demo run",
  });

  assert.equal(template.scope, INPUT_TEMPLATE_SCOPE);
  assert.equal(template.simulatedOnly, true);
  assert.equal(template.realCustomerImport, false);
  assert.equal(template.factPosting, false);
  assert.equal(template.writesReports, false);
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.downstreamReportOnlyWritesReports, true);
  assert.equal(template.downstreamApplyWritesDatabase, true);
  assert.deepEqual(template.simulatedTaskGroups, [
    "order_approval",
    "finished_goods_qc",
    "warehouse_inbound",
    "shipment_release",
  ]);
  assert.match(template.commands.printInputTemplate, /--print-input-template/u);
  assert.match(template.commands.reportOnly, /output\/custom\/mobile-workflow/u);
  assert.match(template.commands.applySimulated, /MOBILE_WORKFLOW_SIM_CONFIRM/u);
  assert.match(template.boundary, /does not write reports/u);
  assert.match(template.boundary, /post operational facts/u);
});

test("mobile workflow simulated mobile closure CLI input template does not write reports", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "mobile-workflow-template-"));
  await rm(out, { recursive: true, force: true });
  const { stdout } = await execFile(process.execPath, [
    scriptPath,
    "--print-input-template",
    "--out",
    out,
  ]);
  const template = JSON.parse(stdout);

  assert.equal(template.scope, INPUT_TEMPLATE_SCOPE);
  assert.equal(template.writesReports, false);
  assert.equal(template.callsBackend, false);
  await assert.rejects(() => access(out), /ENOENT/u);
});

test("mobile workflow simulated mobile closure input template cannot be combined with apply", () => {
  assert.throws(
    () => parseCliArgs(["--print-input-template", "--apply"]),
    /cannot be combined/u,
  );
});
