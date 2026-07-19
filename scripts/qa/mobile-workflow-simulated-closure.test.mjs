import assert from "node:assert/strict";
import { execFile as execFileWithCallback } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildInputTemplate,
  buildPlan,
  buildTaskStatusActionParams,
  buildTimestampRunId,
  buildUrgeTaskParams,
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
  assert.match(
    plan.tasks.approval.task_code,
    /^SIM-YOYOOSUN-MOBILE-WORKFLOW-/u,
  );
  assert(
    Object.values(plan.tasks).every((task) => task.task_code.length <= 64),
  );
  assert.equal(plan.tasks.approval.task_group, "order_approval");
  assert.equal(plan.tasks.approvalRejected.task_group, "order_approval");
  assert.equal(plan.tasks.quality.task_group, "finished_goods_qc");
  assert.equal(plan.tasks.warehouseInbound.task_group, "warehouse_inbound");
  assert.equal(plan.tasks.shipmentRelease.task_group, "trial_warehouse_exception");
  assert.equal(plan.tasks.warehouseUrge.task_group, "trial_warehouse_urge");
  assert.equal(
    plan.tasks.shipmentRelease.business_status_key,
    "shipment_pending",
  );
  assert.equal(plan.actions.approvalRejected.nextStatus, "rejected");
  assert.equal(plan.actions.approvalRejected.role, "boss");
  assert.match(plan.actions.approvalRejected.reason, /退回销售补齐/u);
  assert.equal(plan.actions.warehouseUrged.action, "urge_task");
  assert.equal(plan.actions.warehouseUrged.role, "pmc");
  assert.equal(
    plan.actions.warehouseUrged.payload.surface_key,
    "mobile_role_tasks",
  );
  assert(!Object.hasOwn(plan.actions.warehouseUrged.payload, "notification_type"));
});

test("mobile workflow simulated mobile closure refuses real import flags", () => {
  assert.throws(() => parseCliArgs(["--real-import"]), /refuses real import/u);
});

test("mobile workflow simulated run id preserves the 64 character task code contract", () => {
  assert.equal(sanitizeRunId("1234567890123456789"), "1234567890123456789");
  assert.throws(
    () => sanitizeRunId("12345678901234567890"),
    /runId must be 1-19 safe characters/u,
  );
});

test("mobile workflow simulated mobile closure rejects credentialed backend URL", () => {
  assert.throws(
    () => parseCliArgs(["--backend-url", "http://demo:secret@127.0.0.1:8300"]),
    /backend URL must not contain username or password/u,
  );
});

test("mobile workflow simulated mobile closure action payload omits evidence refs and keeps feedback and exceptions", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "mobile feedback"]));

  assert.equal(plan.newActionEvidenceRefs, "omitted");
  for (const action of [
    plan.actions.approvalDone,
    plan.actions.approvalRejected,
    plan.actions.qualityDone,
    plan.actions.warehouseInboundDone,
    plan.actions.shipmentReleaseBlocked,
  ]) {
    assert(!Object.hasOwn(action.payload, "mobile_action_evidence_refs"));
    assert(!Object.hasOwn(action.payload, "mobile_action"));
    assert.equal(action.payload.surface_key, "mobile_role_tasks");
  }
  for (const action of [
    plan.actions.approvalDone,
    plan.actions.qualityDone,
    plan.actions.warehouseInboundDone,
  ]) {
    assert.equal(action.reason, "");
    assert.equal(action.payload.feedback, action.feedback);
    assert(!Object.hasOwn(action.payload, "mobile_exception_report"));
  }
  for (const action of [
    plan.actions.approvalRejected,
    plan.actions.shipmentReleaseBlocked,
  ]) {
    assert(!Object.hasOwn(action.payload, "feedback"));
    assert.equal(action.payload.mobile_exception_report.reason, action.reason);
  }
  assert.equal(
    plan.actions.shipmentReleaseBlocked.payload.mobile_exception_report
      .simulated_only,
    true,
  );
  assert.equal(
    plan.actions.approvalRejected.payload.mobile_exception_report
      .simulated_only,
    true,
  );
  assert.equal(
    plan.actions.approvalRejected.payload.mobile_exception_report.action_key,
    "rejected",
  );
  assert(
    !Object.hasOwn(
      plan.actions.approvalRejected.payload.mobile_exception_report,
      "evidence_refs",
    ),
  );
  assert.match(
    plan.actions.shipmentReleaseBlocked.reason,
    /模拟出货唛头未确认/u,
  );
  assert.match(plan.actions.approvalRejected.reason, /资料不完整/u);
  assert.deepEqual(plan.actions.warehouseUrged.payload, {
    surface_key: "mobile_role_tasks",
  });
});

test("mobile workflow simulated apply action params do not replay workflow payload snapshots", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "action boundary"]));
  const task = {
    id: 42,
    version: 7,
    source_type: "shipment",
    source_id: 9001,
    source_no: "SHIP-9001",
    business_status_key: "shipment_pending",
    task_status_key: "ready",
    owner_role_key: "warehouse",
    payload: {
      source_type: "shipment",
      source_id: 9001,
      source_no: "SHIP-9001",
      business_status_key: "shipment_pending",
      task_status_key: "ready",
      owner_role_key: "warehouse",
      domain_command_key: "shipment.ship",
      customer_name: "Mobile workflow 模拟客户",
    },
  };

  const completeParams = buildTaskStatusActionParams(
    task,
    plan.actions.approvalDone,
  );
  const blockedParams = buildTaskStatusActionParams(
    task,
    plan.actions.shipmentReleaseBlocked,
  );
  const rejectedParams = buildTaskStatusActionParams(
    task,
    plan.actions.approvalRejected,
  );
  const urgeParams = buildUrgeTaskParams(task, plan.actions.warehouseUrged);

  for (const params of [
    completeParams,
    blockedParams,
    rejectedParams,
    urgeParams,
  ]) {
    assert.equal(params.task_id, 42);
    assert.equal(params.expected_version, 7);
    assert(!("business_status_key" in params));
    assert(!("task_status_key" in params));
    assert(!("source_type" in params));
    assert(!("source_id" in params));
    assert(!("source_no" in params));
    for (const forbiddenPayloadKey of [
      "source_type",
      "source_id",
      "source_no",
      "business_status_key",
      "task_status_key",
      "owner_role_key",
      "domain_command_key",
      "customer_name",
    ]) {
      assert(
        !(forbiddenPayloadKey in params.payload),
        `action payload must not replay ${forbiddenPayloadKey}`,
      );
    }
  }
  assert.equal(completeParams.payload.feedback, plan.actions.approvalDone.feedback);
  assert(!Object.hasOwn(completeParams, "reason"));
  assert.equal(blockedParams.reason, plan.actions.shipmentReleaseBlocked.reason);
  assert(!Object.hasOwn(blockedParams.payload, "feedback"));
  for (const params of [completeParams, blockedParams, rejectedParams, urgeParams]) {
    assert(!Object.hasOwn(params.payload, "mobile_action_evidence_refs"));
    assert(!Object.hasOwn(params.payload, "mobile_role_key"));
  }
  assert.equal(completeParams.action_key, "complete");
  assert.equal(blockedParams.action_key, "block");
  assert.equal(rejectedParams.action_key, "reject");
  assert.equal(urgeParams.action, "urge_task");
});

test("mobile workflow simulated apply rejects actions without a task version", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "missing version"]));
  const task = { id: 42 };

  assert.throws(
    () => buildTaskStatusActionParams(task, plan.actions.approvalDone),
    /task version is required/u,
  );
  assert.throws(
    () => buildUrgeTaskParams(task, plan.actions.warehouseUrged),
    /task version is required/u,
  );
});

test("mobile workflow simulated apply requires number-safe task identities", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "invalid identity"]));
  for (const id of [undefined, 0, "42", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () =>
        buildTaskStatusActionParams(
          { id, version: 1 },
          plan.actions.approvalDone,
        ),
      /task id is required/u,
    );
    assert.throws(
      () =>
        buildUrgeTaskParams({ id, version: 1 }, plan.actions.warehouseUrged),
      /task id is required/u,
    );
  }
  for (const version of [0, "1", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () =>
        buildTaskStatusActionParams(
          { id: 42, version },
          plan.actions.approvalDone,
        ),
      /task version is required/u,
    );
  }
});

test("mobile workflow simulated urge requires an explicit formal action", () => {
  const plan = buildPlan(parseCliArgs(["--run-id", "invalid urge"]));
  const task = { id: 42, version: 1 };

  for (const action of [
    { ...plan.actions.warehouseUrged, action: undefined },
    { ...plan.actions.warehouseUrged, action: "" },
    { ...plan.actions.warehouseUrged, action: "urge" },
  ]) {
    assert.throws(
      () => buildUrgeTaskParams(task, action),
      /urge action is required/u,
    );
  }
});

test("mobile workflow simulated apply report records omitted evidence refs without exposing business status", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert(!source.includes("business_status: updated.business_status_key"));
  assert(!source.includes("business=${step.business_status}"));
  assert(source.includes("evidence_refs_omitted:"));
  assert(source.includes("evidence_refs_omitted=true"));
  assert(!source.includes("evidence_count:"));
  assert(!source.includes(" evidence=${step.evidence_count}"));
  assert(
    source.includes("factPosting: false"),
    "report boundary must continue to state simulated actions do not post facts",
  );
});

test("mobile workflow simulated workflow requests do not send a client customer key", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.doesNotMatch(
    source,
    /\{\s*customer_key:\s*["']yoyoosun["'],\s*\.\.\.params\s*\}/u,
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
    "trial_warehouse_exception",
    "trial_warehouse_urge",
  ]);
  assert(template.simulatedActions.includes("boss rejected with reason"));
  assert(
    template.simulatedActions.includes(
      "pmc urges warehouse task without completing it",
    ),
  );
  assert.match(template.commands.printInputTemplate, /--print-input-template/u);
  assert.match(
    template.commands.reportOnly,
    /output\/custom\/mobile-workflow/u,
  );
  assert.match(
    template.commands.applySimulated,
    /MOBILE_WORKFLOW_SIM_CONFIRM/u,
  );
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
