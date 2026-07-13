import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildInputTemplate,
  buildPreflightReport,
  buildSmokeReport,
  buildSimulatedBossDoneTask,
  buildSimulatedBossRejectTask,
  buildSimulatedBossTask,
  buildSimulatedQualityTask,
  buildSimulatedWarehouseInboundTask,
  buildSimulatedWarehouseTask,
  buildSimulatedTaskPlan,
  buildSimulatedTaskPlanCoverage,
  parseCliArgs,
  sanitizeRunId,
} from "../../web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.resolve(
  repoRoot,
  "web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs",
);
const mobileTaskActionHookPath = path.resolve(
  repoRoot,
  "web/src/erp/mobile/hooks/useMobileRoleTaskActions.js",
);

function createMockYoyoosunEntryAuditRuntime() {
  return {
    async fetchText(url) {
      if (url.includes(":5177/customer-config.js")) {
        return {
          ok: true,
          status: 200,
          contentType: "application/javascript",
          body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({ customerKey: "yoyoosun" })',
        };
      }
      if (url.includes(":5175/customer-config.js")) {
        return {
          ok: true,
          status: 200,
          contentType: "application/javascript",
          body: "window.__PLUSH_ERP_CUSTOMER_CONFIG__ = window.__PLUSH_ERP_CUSTOMER_CONFIG__ || null",
        };
      }
      if (url.includes(":5176/customer-config.js")) {
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html></html>",
        };
      }
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: "",
      };
    },
    async fetchHead(url) {
      if (url.includes(":5177/customer-assets/yoyoosun/")) {
        return {
          ok: true,
          status: 200,
          contentType: "image/svg+xml",
          body: "",
        };
      }
      if (url.includes(":5176/customer-assets/yoyoosun/")) {
        return {
          ok: true,
          status: 200,
          contentType: "text/html",
          body: "",
        };
      }
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: "",
      };
    },
    async getPortProcess(port) {
      if (port === "5177") {
        return {
          listening: true,
          pid: "5177",
          command: "node web/scripts/startYoyoosunDev.mjs",
          cwd: repoRoot,
        };
      }
      return { listening: false, pid: "", command: "", cwd: "" };
    },
  };
}

test("mobile workflow runtime browser smoke creates simulated workflow task only", () => {
  const options = parseCliArgs(["--run-id", "browser demo"]);
  const bossTask = buildSimulatedBossTask(options);
  const bossDoneTask = buildSimulatedBossDoneTask(options);
  const bossRejectTask = buildSimulatedBossRejectTask(options);
  const qualityTask = buildSimulatedQualityTask(options);
  const warehouseInboundTask = buildSimulatedWarehouseInboundTask(options);
  const warehouseTask = buildSimulatedWarehouseTask(options, 88);

  assert.equal(options.runId, "BROWSER-DEMO");
  assert.equal(Object.hasOwn(bossTask, "customer_key"), false);
  assert.match(bossTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u);
  assert.equal(bossTask.task_group, "order_approval");
  assert.equal(bossTask.owner_role_key, "boss");
  assert.equal(bossTask.task_status_key, "ready");
  assert.equal(bossTask.payload.simulated_only, true);
  assert.equal(bossTask.payload.mobile_workflow_browser_smoke, true);
  assert.equal(bossTask.payload.critical_path, true);
  assert.equal(bossTask.payload.notification_type, "approval_required");
  assert.match(bossTask.payload.complete_condition, /岗位任务端/u);

  assert.equal(Object.hasOwn(bossDoneTask, "customer_key"), false);
  assert.match(bossDoneTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u);
  assert.equal(bossDoneTask.task_group, "order_approval");
  assert.equal(bossDoneTask.owner_role_key, "boss");
  assert.equal(bossDoneTask.task_status_key, "ready");
  assert.equal(bossDoneTask.business_status_key, "project_pending");
  assert.equal(bossDoneTask.payload.simulated_only, true);
  assert.equal(bossDoneTask.payload.mobile_workflow_browser_smoke, true);
  assert.equal(bossDoneTask.payload.notification_type, "approval_required");
  assert.match(bossDoneTask.payload.complete_condition, /完成反馈/u);

  assert.equal(Object.hasOwn(bossRejectTask, "customer_key"), false);
  assert.match(bossRejectTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u);
  assert.equal(bossRejectTask.task_group, "order_approval");
  assert.equal(bossRejectTask.owner_role_key, "boss");
  assert.equal(bossRejectTask.task_status_key, "ready");
  assert.equal(bossRejectTask.business_status_key, "project_pending");
  assert.equal(bossRejectTask.payload.simulated_only, true);
  assert.equal(bossRejectTask.payload.mobile_workflow_browser_smoke, true);
  assert.equal(bossRejectTask.payload.notification_type, "approval_required");
  assert.match(bossRejectTask.payload.complete_condition, /退回/u);

  assert.equal(Object.hasOwn(qualityTask, "customer_key"), false);
  assert.match(qualityTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u);
  assert.equal(qualityTask.task_group, "finished_goods_qc");
  assert.equal(qualityTask.owner_role_key, "quality");
  assert.equal(qualityTask.task_status_key, "ready");
  assert.equal(qualityTask.business_status_key, "qc_pending");
  assert.equal(qualityTask.payload.simulated_only, true);
  assert.equal(qualityTask.payload.mobile_workflow_browser_smoke, true);
  assert.equal(
    qualityTask.payload.notification_type,
    "finished_goods_qc_pending",
  );
  assert.match(qualityTask.payload.complete_condition, /品质/u);

  assert.equal(Object.hasOwn(warehouseInboundTask, "customer_key"), false);
  assert.match(
    warehouseInboundTask.task_code,
    /^SIM-YOYOOSUN-MOBILE-BROWSER-/u,
  );
  assert.equal(warehouseInboundTask.task_group, "warehouse_inbound");
  assert.equal(warehouseInboundTask.owner_role_key, "warehouse");
  assert.equal(warehouseInboundTask.task_status_key, "ready");
  assert.equal(
    warehouseInboundTask.business_status_key,
    "warehouse_inbound_pending",
  );
  assert.equal(warehouseInboundTask.payload.simulated_only, true);
  assert.equal(
    warehouseInboundTask.payload.mobile_workflow_browser_smoke,
    true,
  );
  assert.equal(
    warehouseInboundTask.payload.notification_type,
    "inbound_pending",
  );
  assert.match(warehouseInboundTask.payload.complete_condition, /入库/u);

  assert.equal(Object.hasOwn(warehouseTask, "customer_key"), false);
  assert.match(warehouseTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u);
  assert.equal(warehouseTask.task_group, "shipment_release");
  assert.equal(warehouseTask.owner_role_key, "warehouse");
  assert.equal(warehouseTask.assignee_id, 88);
  assert.equal(warehouseTask.task_status_key, "ready");
  assert.equal(warehouseTask.payload.simulated_only, true);
  assert.equal(warehouseTask.payload.mobile_workflow_browser_smoke, true);
  assert.equal(warehouseTask.payload.critical_path, true);
  assert.equal(
    warehouseTask.payload.notification_type,
    "shipment_release_pending",
  );
  assert.match(warehouseTask.payload.complete_condition, /催办/u);
});

test("mobile workflow runtime browser smoke keeps safe run id boundary", () => {
  assert.equal(sanitizeRunId("  a/b c  "), "A-B-C");
  assert.throws(() => sanitizeRunId(""), /runId/u);
  assert.throws(() => sanitizeRunId("123456789012345678901"), /runId/u);
});

test("mobile workflow runtime browser smoke rejects credentialed URLs", async () => {
  assert.throws(
    () => parseCliArgs(["--base-url", "http://demo:secret@127.0.0.1:4195"]),
    /URL must not contain username or password/u,
  );
  assert.throws(
    () => parseCliArgs(["--backend-url", "http://demo:secret@127.0.0.1:8300"]),
    /URL must not contain username or password/u,
  );
  assert.throws(
    () => parseCliArgs(["--preflight-report", "/tmp/mobile-workflow.json"]),
    /must stay inside the repository/u,
  );
  assert.throws(
    () =>
      parseCliArgs([
        "--report",
        "deployments/yoyoosun/evidence/mobile-workflow.json",
      ]),
    /must not be written under deployments evidence/u,
  );

  const source = await readFile(scriptPath, "utf8");
  assert.match(
    source,
    /MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL[\s\S]+assertNoURLCredentials\(backendHealthURL\)/u,
  );
});

test("mobile workflow runtime browser smoke input template is no-write", () => {
  const template = buildInputTemplate(parseCliArgs(["--run-id", "template"]));
  const serialized = JSON.stringify(template);

  assert.equal(
    template.scope,
    "mobile-workflow-runtime-browser-smoke-input-template",
  );
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.startsBrowser, false);
  assert.equal(template.startsDevServer, false);
  assert.equal(template.readsLocalConfig, false);
  assert.equal(template.createsWorkflowTasks, false);
  assert.equal(template.downstreamCreatesWorkflowTasks, true);
  assert.equal(template.downstreamStartsBrowser, true);
  assert.equal(template.downstreamCallsBackend, true);
  assert(template.realSmokeRequires.includes("demo password env is present"));
  assert(
    template.realSmokeRequires.includes(
      "external base URL is audited as yoyoosun config and asset when provided",
    ),
  );
  assert(
    template.notProvenByThisTemplate.includes(
      "done / blocked / rejected / urge action submission",
    ),
  );
  assert(
    template.notProvenByThisTemplate.includes(
      "target environment release evidence",
    ),
  );
  assert.deepEqual(template.secretInputs, [
    "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD or TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD",
  ]);
  assert.equal(template.simulatedTaskPlanSummary.length, 6);
  assert.equal(template.simulatedTaskPlanCoverage.ok, true);
  assert.equal(
    template.yoyoosunEntryAuditPlan.requiredForExternalBaseURL,
    true,
  );
  assert.match(
    template.yoyoosunEntryAuditPlan.command,
    /audit:yoyoosun-entry/u,
  );
  assert.equal(
    template.yoyoosunEntryAuditPlan.expectedCustomerConfigStatus,
    "yoyoosun_config",
  );
  assert.equal(
    template.yoyoosunEntryAuditPlan.expectedCustomerAssetStatus,
    "yoyoosun_asset",
  );
  assert.deepEqual(template.simulatedTaskPlanCoverage.actionLabels, [
    "催办协同",
    "完成任务",
    "完成成品质检任务",
    "完成采购入库任务",
    "标记阻塞",
    "退回任务",
  ]);
  assert.equal(
    template.simulatedTaskPlanCoverage.coversCompletionFeedback,
    true,
  );
  assert.equal(template.simulatedTaskPlanCoverage.coversExceptionReport, true);
  assert.equal(template.simulatedTaskPlanCoverage.coversQualityComplete, true);
  assert.equal(
    template.simulatedTaskPlanCoverage.coversWarehouseInboundComplete,
    true,
  );
  assert.equal(
    template.simulatedTaskPlanCoverage.coversInternalNotificationHints,
    true,
  );
  assert(
    template.simulatedTaskPlanSummary.some(
      (item) =>
        item.ownerRole === "老板" &&
        item.taskGroupLabel === "销售订单受理" &&
        item.actionLabel === "完成任务" &&
        item.simulatedOnly === true,
    ),
  );
  assert(
    template.simulatedTaskPlanSummary.some(
      (item) =>
        item.ownerRole === "仓库" &&
        item.taskGroupLabel === "采购入库协同" &&
        item.actionLabel === "完成采购入库任务" &&
        item.simulatedOnly === true,
    ),
  );
  assert(
    template.simulatedTaskPlanSummary.some(
      (item) =>
        item.ownerRole === "品质" &&
        item.taskGroupLabel === "成品质检协同" &&
        item.actionLabel === "完成成品质检任务" &&
        item.simulatedOnly === true,
    ),
  );
  assert(
    template.simulatedTaskPlanSummary.some(
      (item) =>
        item.ownerRole === "仓库" &&
        item.actionLabel === "催办协同" &&
        item.simulatedOnly === true,
    ),
  );
  assert.doesNotMatch(serialized, /"simulatedTaskPlan"/u);
  assert.doesNotMatch(serialized, /"ownerRoleKey"/u);
  assert.doesNotMatch(serialized, /"taskGroup"/u);
  assert.doesNotMatch(serialized, /"browserAction"/u);
  assert.doesNotMatch(serialized, /"notificationType"/u);
  assert.doesNotMatch(
    serialized,
    /order_approval|finished_goods_qc|warehouse_inbound|shipment_release/u,
  );
  assert.match(
    template.commands.join("\n"),
    /smoke:mobile-workflow-runtime-browser/u,
  );
  assert.match(template.commands.join("\n"), /--preflight-report/u);
  assert.match(template.commands.join("\n"), /audit:yoyoosun-entry/u);
  assert.match(template.commands.join("\n"), /<audited-yoyoosun-url>/u);
  assert.doesNotMatch(template.commands.join("\n"), /127\.0\.0\.1:5175/u);
  assert.match(template.boundary, /does not prove mobile workflow/u);
  assert.match(template.boundary, /audited frontend runtime/u);
  assert.match(template.boundary, /simulated_only workflow task evidence/u);
});

test("mobile workflow runtime browser smoke simulated task plan covers required actions and notifications", () => {
  const plan = buildSimulatedTaskPlan();
  const coverage = buildSimulatedTaskPlanCoverage(plan);

  assert.equal(plan.length, 6);
  assert.equal(coverage.ok, true);
  assert.equal(coverage.taskCount, 6);
  assert.deepEqual(coverage.ownerRoles, ["仓库", "品质", "老板"]);
  assert.equal(coverage.allSimulatedOnly, true);
  assert.equal(coverage.allKeepEvidenceRefs, true);
  assert.equal(coverage.coversBossBlock, true);
  assert.equal(coverage.coversBossComplete, true);
  assert.equal(coverage.coversBossReject, true);
  assert.equal(coverage.coversQualityComplete, true);
  assert.equal(coverage.coversWarehouseInboundComplete, true);
  assert.equal(coverage.coversCrossRoleUrge, true);
  assert.equal(coverage.coversReasonRequiredActions, true);
  assert.equal(coverage.coversCompletionFeedback, true);
  assert.equal(coverage.coversExceptionReport, true);
  assert.equal(coverage.coversInternalNotificationHints, true);
  assert.deepEqual(coverage.notificationHints, [
    "审批待处理提醒",
    "成品质检待处理提醒",
    "入库待处理提醒",
    "出货放行待处理提醒",
  ]);

  const incompleteCoverage = buildSimulatedTaskPlanCoverage(
    plan.filter((item) => item.browserAction !== "reject"),
  );
  assert.equal(incompleteCoverage.ok, false);
  assert(incompleteCoverage.blockers.includes("missing-boss-reject-action"));
  assert(incompleteCoverage.blockers.includes("expected-six-simulated-tasks"));
});

test("mobile workflow runtime browser smoke preflight report is no-write and redacted", async () => {
  const previousHealthURL =
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL;
  const previousPassword = process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD;
  const previousTrialPassword = process.env.TRIAL_ACCOUNT_PASSWORD;
  const previousRolePassword = process.env.ERP_ROLE_DEMO_PASSWORD;
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL =
    "http://127.0.0.1:1/healthz";
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD = "";
  process.env.TRIAL_ACCOUNT_PASSWORD = "";
  process.env.ERP_ROLE_DEMO_PASSWORD = "";
  try {
    const report = await buildPreflightReport(
      parseCliArgs(["--run-id", "preflight"]),
      createMockYoyoosunEntryAuditRuntime(),
    );
    const serialized = JSON.stringify(report);

    assert.equal(
      report.scope,
      "mobile-workflow-runtime-browser-smoke-preflight-report",
    );
    assert.equal(report.writesDatabase, false);
    assert.equal(report.preflightOnly, true);
    assert.equal(report.callsJSONRPC, false);
    assert.equal(report.startsBrowser, false);
    assert.equal(report.startsDevServer, false);
    assert.equal(report.createsWorkflowTasks, false);
    assert.equal(report.readsPasswordValue, false);
    assert.equal(report.storesPasswordValue, false);
    assert.equal(report.storesAccessToken, false);
    assert.equal(report.storesAuthorizationHeader, false);
    assert.equal(report.passwordEnvPresent, false);
    assert.equal(
      report.yoyoosunEntryAudit.scope,
      "mobile-workflow-yoyoosun-entry-preflight",
    );
    assert.equal(report.yoyoosunEntryAudit.readOnly, true);
    assert.equal(report.yoyoosunEntryAudit.callsJSONRPC, false);
    assert.equal(report.yoyoosunEntryAudit.writesDatabase, false);
    assert.equal(report.yoyoosunEntryAudit.startsBrowser, false);
    assert.equal(report.yoyoosunEntryAudit.startsDevServer, false);
    assert.equal(
      report.yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun,
      true,
    );
    assert.deepEqual(report.yoyoosunEntryAudit.checkedPorts, [
      "5175",
      "5176",
      "5177",
      "5178",
      "5179",
    ]);
    assert.deepEqual(report.yoyoosunEntryAudit.yoyoosunPorts, ["5177"]);
    assert.deepEqual(report.yoyoosunEntryAudit.auditedYoyoosunURLs, [
      "http://localhost:5177/erp",
    ]);
    assert.equal(
      report.yoyoosunEntryAudit.suggestedExternalBaseURL,
      "http://localhost:5177/erp",
    );
    assert.match(
      report.suggestedRealSmokeCommand,
      /MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL='http:\/\/localhost:5177\/erp'/u,
    );
    assert.match(
      report.suggestedRealSmokeCommand,
      /--report output\/mobile-workflow-runtime-browser-smoke\/report\.json/u,
    );
    assert(
      report.yoyoosunEntryAudit.notProvenByThisAudit.includes(
        "mobile task entry access",
      ),
    );
    assert.equal(report.readyForRealSmoke, false);
    assert(
      report.realSmokeRequires.includes("local backend health is reachable"),
    );
    assert(report.realSmokeRequires.includes("demo password env is present"));
    assert(
      report.notProvenByThisPreflight.includes(
        "backend RBAC / effective session for demo accounts",
      ),
    );
    assert(
      report.notProvenByThisPreflight.includes(
        "done / blocked / rejected / urge action submission",
      ),
    );
    assert(
      report.notProvenByThisPreflight.includes(
        "target environment release evidence",
      ),
    );
    assert.equal(report.simulatedTaskPlanSummary.length, 6);
    assert.equal(report.simulatedTaskPlanCoverage.ok, true);
    assert.equal(report.simulatedTaskPlanCoverage.coversBossBlock, true);
    assert.equal(report.simulatedTaskPlanCoverage.coversBossComplete, true);
    assert.equal(report.simulatedTaskPlanCoverage.coversBossReject, true);
    assert.equal(report.simulatedTaskPlanCoverage.coversQualityComplete, true);
    assert.equal(
      report.simulatedTaskPlanCoverage.coversWarehouseInboundComplete,
      true,
    );
    assert.equal(report.simulatedTaskPlanCoverage.coversCrossRoleUrge, true);
    assert.equal(
      report.simulatedTaskPlanCoverage.coversInternalNotificationHints,
      true,
    );
    assert(report.blockers.includes("missing-demo-password-env"));
    assert(report.blockers.includes("backend-health-unreachable"));
    assert.doesNotMatch(
      report.blockers.join("\n"),
      /external-base-url-not-yoyoosun-entry/u,
    );
    assert.doesNotMatch(serialized, /replace-with-local-demo-password/u);
    assert.doesNotMatch(serialized, /Bearer/u);
    assert.doesNotMatch(serialized, /access_token/u);
    assert.doesNotMatch(serialized, /"simulatedTaskPlan"/u);
    assert.doesNotMatch(serialized, /"ownerRoleKey"/u);
    assert.doesNotMatch(serialized, /"taskGroup"/u);
    assert.doesNotMatch(serialized, /"browserAction"/u);
    assert.doesNotMatch(serialized, /"notificationType"/u);
    assert.doesNotMatch(
      serialized,
      /order_approval|finished_goods_qc|warehouse_inbound|shipment_release/u,
    );
  } finally {
    if (previousHealthURL === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL;
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL =
        previousHealthURL;
    }
    if (previousPassword === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD;
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD = previousPassword;
    }
    if (previousTrialPassword === undefined) {
      delete process.env.TRIAL_ACCOUNT_PASSWORD;
    } else {
      process.env.TRIAL_ACCOUNT_PASSWORD = previousTrialPassword;
    }
    if (previousRolePassword === undefined) {
      delete process.env.ERP_ROLE_DEMO_PASSWORD;
    } else {
      process.env.ERP_ROLE_DEMO_PASSWORD = previousRolePassword;
    }
  }
});

test("mobile workflow runtime browser smoke preflight blocks external non-yoyoosun base URL", async () => {
  const previousHealthURL =
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL;
  const previousPassword = process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD;
  const previousTrialPassword = process.env.TRIAL_ACCOUNT_PASSWORD;
  const previousRolePassword = process.env.ERP_ROLE_DEMO_PASSWORD;
  const previousBaseURL = process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL;
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL =
    "http://127.0.0.1:1/healthz";
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD =
    "present-for-preflight-only";
  process.env.TRIAL_ACCOUNT_PASSWORD = "";
  process.env.ERP_ROLE_DEMO_PASSWORD = "";
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL = "http://127.0.0.1:1";
  try {
    const report = await buildPreflightReport(
      parseCliArgs(["--run-id", "external-port"]),
    );

    assert.equal(
      report.yoyoosunEntryAudit.externalBaseURL,
      "http://127.0.0.1:1",
    );
    assert.equal(report.yoyoosunEntryAudit.externalPort, "1");
    assert.equal(
      report.yoyoosunEntryAudit.suggestedExternalBaseURL,
      "http://127.0.0.1:1",
    );
    assert.match(
      report.suggestedRealSmokeCommand,
      /MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL='http:\/\/127\.0\.0\.1:1'/u,
    );
    assert.equal(
      report.yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun,
      false,
    );
    assert(report.blockers.includes("external-base-url-not-yoyoosun-entry"));
    assert.equal(report.readyForRealSmoke, false);
  } finally {
    if (previousHealthURL === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL;
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL =
        previousHealthURL;
    }
    if (previousPassword === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD;
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD = previousPassword;
    }
    if (previousTrialPassword === undefined) {
      delete process.env.TRIAL_ACCOUNT_PASSWORD;
    } else {
      process.env.TRIAL_ACCOUNT_PASSWORD = previousTrialPassword;
    }
    if (previousRolePassword === undefined) {
      delete process.env.ERP_ROLE_DEMO_PASSWORD;
    } else {
      process.env.ERP_ROLE_DEMO_PASSWORD = previousRolePassword;
    }
    if (previousBaseURL === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL;
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL = previousBaseURL;
    }
  }
});

test("mobile workflow runtime browser smoke CLI input template does not start runtime or require password", () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--print-input-template"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD: "",
        TRIAL_ACCOUNT_PASSWORD: "",
        ERP_ROLE_DEMO_PASSWORD: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL: "",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const template = JSON.parse(result.stdout);
  const serialized = JSON.stringify(template);

  assert.equal(
    template.scope,
    "mobile-workflow-runtime-browser-smoke-input-template",
  );
  assert.equal(template.writesDatabase, false);
  assert.equal(template.callsBackend, false);
  assert.equal(template.startsBrowser, false);
  assert.equal(template.startsDevServer, false);
  assert.equal(template.readsLocalConfig, false);
  assert.equal(template.createsWorkflowTasks, false);
  assert.equal(template.downstreamCreatesWorkflowTasks, true);
  assert(template.realSmokeRequires.includes("demo password env is present"));
  assert(template.notProvenByThisTemplate.includes("real admin login"));
  assert.match(
    template.commands.join("\n"),
    /smoke:mobile-workflow-runtime-browser/u,
  );
  assert.match(template.commands.join("\n"), /audit:yoyoosun-entry/u);
  assert.match(template.commands.join("\n"), /<audited-yoyoosun-url>/u);
  assert.match(
    template.commands.join("\n"),
    /--report output\/mobile-workflow-runtime-browser-smoke\/report\.json/u,
  );
  assert(
    template.optionalInputs.includes(
      "--report output/mobile-workflow-runtime-browser-smoke/report.json",
    ),
  );
  assert.equal(template.simulatedTaskPlanSummary.length, 6);
  assert.doesNotMatch(serialized, /"simulatedTaskPlan"/u);
  assert.doesNotMatch(serialized, /"ownerRoleKey"/u);
  assert.doesNotMatch(serialized, /"taskGroup"/u);
  assert.doesNotMatch(serialized, /"browserAction"/u);
  assert.doesNotMatch(serialized, /"notificationType"/u);
  assert.doesNotMatch(
    serialized,
    /order_approval|finished_goods_qc|warehouse_inbound|shipment_release/u,
  );
});

test("mobile workflow runtime browser smoke report is redacted local evidence only", () => {
  const options = parseCliArgs([
    "--run-id",
    "report",
    "--report",
    "output/mobile-workflow-runtime-browser-smoke/report.json",
  ]);
  const createdBossTask = {
    task_code: "SIM-YOYOOSUN-MOBILE-BROWSER-REPORT-BLOCK",
  };
  const createdBossDoneTask = {
    task_code: "SIM-YOYOOSUN-MOBILE-BROWSER-REPORT-DONE",
  };
  const createdBossRejectTask = {
    task_code: "SIM-YOYOOSUN-MOBILE-BROWSER-REPORT-REJECT",
  };
  const createdQualityTask = {
    task_code: "SIM-YOYOOSUN-MOBILE-BROWSER-REPORT-QUALITY-DONE",
  };
  const createdWarehouseInboundTask = {
    task_code: "SIM-YOYOOSUN-MOBILE-BROWSER-REPORT-INBOUND-DONE",
  };
  const createdWarehouseTask = {
    task_code: "SIM-YOYOOSUN-MOBILE-BROWSER-REPORT-URGE",
  };
  const browserResult = {
    blockReason: "阻塞原因",
    blockEvidence: "BLOCK-PHOTO",
    doneEvidence: "DONE-PHOTO",
    rejectReason: "退回原因",
    rejectEvidence: "REJECT-PHOTO",
    qualityEvidence: "QUALITY-PHOTO",
    warehouseInboundEvidence: "INBOUND-PHOTO",
    urgeReason: "催办原因",
    urgeEvidence: "URGE-PHOTO",
    metrics: { scrollWidth: 390, clientWidth: 390 },
    qualityMetrics: { scrollWidth: 390, clientWidth: 390 },
    warehouseInboundMetrics: { scrollWidth: 390, clientWidth: 390 },
    urgeMetrics: { scrollWidth: 390, clientWidth: 390 },
  };
  const report = buildSmokeReport({
    options,
    browserResult,
    createdBossTask,
    createdBossDoneTask,
    createdBossRejectTask,
    createdQualityTask,
    createdWarehouseInboundTask,
    createdWarehouseTask,
    updatedBossTask: {
      task_code: createdBossTask.task_code,
      owner_role_key: "boss",
      task_group: "order_approval",
      task_status_key: "blocked",
      blocked_reason: browserResult.blockReason,
      payload: {
        mobile_action_evidence_refs: [browserResult.blockEvidence],
        mobile_exception_report: { reason: browserResult.blockReason },
      },
    },
    updatedBossDoneTask: {
      task_code: createdBossDoneTask.task_code,
      owner_role_key: "boss",
      task_group: "order_approval",
      task_status_key: "done",
      business_status_key: "project_approved",
      payload: {
        mobile_action_evidence_refs: [browserResult.doneEvidence],
      },
    },
    updatedBossRejectTask: {
      task_code: createdBossRejectTask.task_code,
      owner_role_key: "boss",
      task_group: "order_approval",
      task_status_key: "rejected",
      business_status_key: "project_pending",
      payload: {
        mobile_action_evidence_refs: [browserResult.rejectEvidence],
        mobile_exception_report: { reason: browserResult.rejectReason },
      },
    },
    updatedQualityTask: {
      task_code: createdQualityTask.task_code,
      owner_role_key: "quality",
      task_group: "finished_goods_qc",
      task_status_key: "done",
      payload: {
        mobile_action_evidence_refs: [browserResult.qualityEvidence],
      },
    },
    updatedWarehouseInboundTask: {
      task_code: createdWarehouseInboundTask.task_code,
      owner_role_key: "warehouse",
      task_group: "warehouse_inbound",
      task_status_key: "done",
      payload: {
        mobile_action_evidence_refs: [browserResult.warehouseInboundEvidence],
      },
    },
    updatedWarehouseTask: {
      task_code: createdWarehouseTask.task_code,
      owner_role_key: "warehouse",
      task_group: "shipment_release",
      task_status_key: "ready",
      payload: {
        last_urge_reason: browserResult.urgeReason,
        mobile_action_evidence_refs: [browserResult.urgeEvidence],
      },
    },
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.scope, "mobile-workflow-runtime-browser-smoke-report");
  assert.equal(report.simulatedOnly, true);
  assert.equal(report.realCustomerImport, false);
  assert.equal(report.releaseEvidence, false);
  assert.equal(report.writesDatabase, true);
  assert.equal(report.writesWorkflowTasks, true);
  assert.equal(report.writesBusinessFacts, false);
  assert.equal(report.factPosted, false);
  assert.equal(report.storesPasswordValue, false);
  assert.equal(report.storesAccessToken, false);
  assert.equal(report.storesAuthorizationHeader, false);
  assert.equal(report.storesRawCustomerPackage, false);
  assert.equal(report.storesRawActionRequest, false);
  assert.equal(report.storesRawWorkflowPayload, false);
  assert.equal(report.storesRedactedActionSummary, true);
  assert.equal(report.summary.totalTasks, 6);
  assert.equal(report.summary.done, 3);
  assert.equal(report.summary.noHorizontalOverflow, true);
  assert.equal(report.summary.simulatedTaskPlanCoverageOK, true);
  assert.deepEqual(report.summary.simulatedTaskPlanCoverageBlockers, []);
  assert.equal(report.simulatedTaskPlanCoverage.ok, true);
  assert.deepEqual(report.simulatedTaskPlanCoverage.ownerRoles, [
    "仓库",
    "品质",
    "老板",
  ]);
  assert.deepEqual(report.simulatedTaskPlanCoverage.actionLabels, [
    "催办协同",
    "完成任务",
    "完成成品质检任务",
    "完成采购入库任务",
    "标记阻塞",
    "退回任务",
  ]);
  assert.deepEqual(report.simulatedTaskPlanCoverage.notificationHints, [
    "审批待处理提醒",
    "成品质检待处理提醒",
    "入库待处理提醒",
    "出货放行待处理提醒",
  ]);
  assert.equal(report.simulatedTaskPlanCoverage.coversBossBlock, true);
  assert.equal(report.simulatedTaskPlanCoverage.coversBossComplete, true);
  assert.equal(report.simulatedTaskPlanCoverage.coversBossReject, true);
  assert.equal(report.simulatedTaskPlanCoverage.coversQualityComplete, true);
  assert.equal(
    report.simulatedTaskPlanCoverage.coversWarehouseInboundComplete,
    true,
  );
  assert.equal(report.simulatedTaskPlanCoverage.coversCrossRoleUrge, true);
  assert.equal(
    report.simulatedTaskPlanCoverage.coversInternalNotificationHints,
    true,
  );
  assert(
    report.notProvenByThisReport.includes(
      "inventory, shipment, finance, purchase, or quality facts posted by workflow task completion",
    ),
  );
  assert.deepEqual(
    report.tasks.map((item) => [
      item.key,
      item.ownerRole,
      item.taskGroupLabel,
      item.statusLabel,
      item.actionLabel,
    ]),
    [
      ["boss-block", "老板", "销售订单受理", "已阻塞", "标记阻塞"],
      ["boss-complete", "老板", "销售订单受理", "已完成", "完成任务"],
      ["boss-reject", "老板", "销售订单受理", "已退回", "退回任务"],
      ["quality-complete", "品质", "成品质检协同", "已完成", "完成任务"],
      [
        "warehouse-inbound-complete",
        "仓库",
        "采购入库协同",
        "已完成",
        "完成任务",
      ],
      ["warehouse-urge", "仓库", "出货放行协同", "待处理", "催办协同"],
    ],
  );
  assert.doesNotMatch(serialized, /Bearer/u);
  assert.doesNotMatch(serialized, /access_token/u);
  assert.doesNotMatch(serialized, /Authorization:\s*Bearer/iu);
  assert.doesNotMatch(serialized, /"payload"/u);
  assert.doesNotMatch(serialized, /"mobile_exception_report"/u);
  assert.doesNotMatch(serialized, /"mobile_action_evidence_refs"/u);
  assert.doesNotMatch(serialized, /"ownerRoleKey"/u);
  assert.doesNotMatch(serialized, /"ownerRoleKeys"/u);
  assert.doesNotMatch(serialized, /"taskGroup"/u);
  assert.doesNotMatch(
    serialized,
    /"status"\s*:\s*"(ready|blocked|done|rejected)"/u,
  );
  assert.doesNotMatch(
    serialized,
    /"action"\s*:\s*"(block|blocked|complete|done|reject|rejected|urge|urge-only)"/u,
  );
  assert.doesNotMatch(serialized, /owner_role_key|task_status_key/u);
  assert.doesNotMatch(
    serialized,
    /order_approval|finished_goods_qc|warehouse_inbound|shipment_release/u,
  );
  assert.doesNotMatch(serialized, /replace-with-local-demo-password/u);
  assert.match(report.boundary, /不证明目标环境发布/u);
});

test("mobile workflow runtime browser smoke docs keep no-write and report boundary", async () => {
  const scriptReadme = await readFile(
    path.join(repoRoot, "scripts/README.md"),
    "utf8",
  );
  const webReadme = await readFile(
    path.join(repoRoot, "web/README.md"),
    "utf8",
  );
  const testStrategyDoc = await readFile(
    path.join(repoRoot, "docs/product/自动化测试策略.md"),
    "utf8",
  );
  const trialRunbook = await readFile(
    path.join(repoRoot, "docs/customers/yoyoosun/试用环境执行手册.md"),
    "utf8",
  );

  for (const [source, context] of [
    [scriptReadme, "scripts README"],
    [webReadme, "web README"],
    [testStrategyDoc, "automation test strategy"],
    [trialRunbook, "yoyoosun trial runbook"],
  ]) {
    assert.match(
      source,
      /mobileWorkflowRuntimeBrowserSmoke\.mjs[\s\S]{0,120}--preflight-report output\/mobile-workflow-runtime-browser-smoke\/preflight\.json/u,
      `${context} must document mobile workflow no-write preflight report`,
    );
    assert.match(
      source,
      /--report output\/mobile-workflow-runtime-browser-smoke\/report\.json/u,
      `${context} must document mobile workflow redacted report command`,
    );
    assert.match(
      source,
      /不保存密码、token、Authorization header、raw customer package 或 action 列表/u,
      `${context} must keep mobile workflow report redaction boundary`,
    );
    assert.match(
      source,
      /模拟任务计划 coverage 摘要/u,
      `${context} must document mobile workflow report coverage summary`,
    );
    assert.match(
      source,
      /品质(?:岗位)?完成|品质成品抽检/u,
      `${context} must document quality-owned completion coverage`,
    );
    assert.match(
      source,
      /仓库入库完成|仓库入库任务/u,
      `${context} must document warehouse inbound completion coverage`,
    );
    assert.match(
      source,
      /release evidence/u,
      `${context} must keep mobile workflow release evidence boundary`,
    );
  }

  assert.match(
    scriptReadme,
    /只写本地\/试用模拟 workflow 证据，不导入真实客户数据，也不写库存、采购、质检或财务事实/u,
  );
  assert.match(scriptReadme, /external-base-url-not-yoyoosun-entry/u);
  assert.match(
    webReadme,
    /该回归只覆盖本地 \/ 试用模拟 workflow 证据，不代表真实客户导入、生产写入或 Fact 落账/u,
  );
  assert.match(webReadme, /external-base-url-not-yoyoosun-entry/u);
  assert.match(
    testStrategyDoc,
    /只写本地脱敏报告，包含模拟任务计划 coverage 摘要和未证明项，不保存密码、token、Authorization header、raw customer package 或 action 列表，也不进入 release evidence/u,
  );
  assert.match(testStrategyDoc, /external-base-url-not-yoyoosun-entry/u);
  assert.match(trialRunbook, /external-base-url-not-yoyoosun-entry/u);
});

test("mobile workflow runtime browser smoke CLI preflight writes sanitized report without password", async () => {
  const reportPath = path.join(
    "output",
    "mobile-workflow-runtime-browser-smoke",
    "preflight-test.json",
  );
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--preflight-report", reportPath, "--run-id", "preflight"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD: "",
        TRIAL_ACCOUNT_PASSWORD: "",
        ERP_ROLE_DEMO_PASSWORD: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL:
          "http://127.0.0.1:1/healthz",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preflight report written/u);
  const report = JSON.parse(
    await readFile(path.resolve(repoRoot, reportPath), "utf8"),
  );
  const serialized = JSON.stringify(report);

  assert.equal(
    report.scope,
    "mobile-workflow-runtime-browser-smoke-preflight-report",
  );
  assert.equal(report.writesDatabase, false);
  assert.equal(report.preflightOnly, true);
  assert.equal(report.callsJSONRPC, false);
  assert.equal(report.startsBrowser, false);
  assert.equal(report.startsDevServer, false);
  assert.equal(report.createsWorkflowTasks, false);
  assert.equal(report.yoyoosunEntryAudit.readOnly, true);
  assert.equal(report.yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun, true);
  assert(
    report.realSmokeRequires.includes(
      "simulated task plan coverage is complete",
    ),
  );
  assert(report.notProvenByThisPreflight.includes("workflow task creation"));
  assert(
    report.notProvenByThisPreflight.includes(
      "target environment release evidence",
    ),
  );
  assert.equal(report.passwordEnvPresent, false);
  assert.equal(report.readyForRealSmoke, false);
  assert.equal(report.simulatedTaskPlanCoverage.ok, true);
  assert.deepEqual(report.simulatedTaskPlanCoverage.actionLabels, [
    "催办协同",
    "完成任务",
    "完成成品质检任务",
    "完成采购入库任务",
    "标记阻塞",
    "退回任务",
  ]);
  assert(report.blockers.includes("missing-demo-password-env"));
  assert(report.blockers.includes("backend-health-unreachable"));
  assert.doesNotMatch(serialized, /replace-with-local-demo-password/u);
  assert.doesNotMatch(serialized, /Bearer/u);
  assert.doesNotMatch(serialized, /access_token/u);
  assert.doesNotMatch(serialized, /"simulatedTaskPlan"/u);
  assert.doesNotMatch(serialized, /"ownerRoleKey"/u);
  assert.doesNotMatch(serialized, /"taskGroup"/u);
  assert.doesNotMatch(serialized, /"browserAction"/u);
  assert.doesNotMatch(serialized, /"notificationType"/u);
  assert.doesNotMatch(
    serialized,
    /order_approval|finished_goods_qc|warehouse_inbound|shipment_release/u,
  );
});

test("mobile workflow runtime browser smoke CLI report requires password and does not create report first", async () => {
  const reportPath = path.join(
    "output",
    "mobile-workflow-runtime-browser-smoke",
    "report-missing-password-test.json",
  );
  const absoluteReportPath = path.resolve(repoRoot, reportPath);
  await rm(absoluteReportPath, { force: true });

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--report", reportPath, "--run-id", "report"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD: "",
        TRIAL_ACCOUNT_PASSWORD: "",
        ERP_ROLE_DEMO_PASSWORD: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL: "",
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL:
          "http://127.0.0.1:1/healthz",
      },
    },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /缺少账号密码/u);
  await assert.rejects(() => readFile(absoluteReportPath, "utf8"), /ENOENT/u);
});

test("mobile workflow runtime browser smoke does not contain real import or fact writes", async () => {
  const source = await readFile(scriptPath, "utf8");
  const mobileTaskActionHookSource = await readFile(
    mobileTaskActionHookPath,
    "utf8",
  );

  assert.match(source, /method: 'create_task'/u);
  assert.match(source, /URL must not contain username or password/u);
  assert.match(source, /getByRole\('button', \{ name: \/阻塞\/u \}\)/u);
  assert.match(source, /mobile-role-detail-reason-input/u);
  assert.match(source, /请先填写阻塞或退回原因/u);
  assert.match(mobileTaskActionHookSource, /请先填写完成反馈或附件线索/u);
  assert.match(mobileTaskActionHookSource, /requiresMobileActionFeedback/u);
  assert.match(source, /getByRole\('button', \{ name: \/完成\/u \}\)/u);
  assert.match(
    source,
    /getByTestId\('mobile-role-evidence-input'\)\.fill\(doneEvidence\)[\s\S]+getByRole\('button', \{ name: \/完成\/u \}\)\.click\(\)[\s\S]+getByRole\('button', \{ name: '提交' \}\)\.click\(\)/u,
  );
  assert.match(source, /mobile-role-nav-done/u);
  assert.doesNotMatch(
    source,
    /updatedBoss(?:Done|Reject)Task\.business_status_key/u,
  );
  assert.match(source, /done task should retain mobile action evidence ref/u);
  assert.match(source, /username: 'demo_quality'/u);
  assert.match(source, /username: 'demo_warehouse'/u);
  assert.match(source, /buildSimulatedQualityTask/u);
  assert.match(source, /buildSimulatedWarehouseInboundTask/u);
  assert.match(
    source,
    /quality done task should retain mobile action evidence ref/u,
  );
  assert.match(
    source,
    /warehouse inbound done task should retain mobile action evidence ref/u,
  );
  assert.match(source, /qualityDone=\$\{createdQualityTask\.task_code\}/u);
  assert.match(
    source,
    /warehouseInboundDone=\$\{createdWarehouseInboundTask\.task_code\}/u,
  );
  assert.match(source, /getByRole\('button', \{ name: \/退回当前任务\/u \}\)/u);
  assert.match(
    source,
    /assert\.equal\(updatedBossRejectTask\.task_status_key, 'rejected'\)/u,
  );
  assert.match(
    source,
    /rejected task should retain mobile action evidence ref/u,
  );
  assert.match(source, /mobile-role-action-bar__button--urge/u);
  assert.match(source, /请先填写催办原因/u);
  assert.match(source, /催办已记录/u);
  assert.match(source, /您暂时不能处理这条任务，可以查看并催办/u);
  assert.match(source, /last_urge_action/u);
  assert.match(source, /rejected=\$\{createdBossRejectTask\.task_code\}/u);
  assert.match(source, /done=\$\{createdBossDoneTask\.task_code\}/u);
  assert.match(source, /--print-input-template/u);
  assert.match(source, /startsBrowser: false/u);
  assert.match(source, /startsDevServer: false/u);
  assert.match(source, /createsWorkflowTasks: false/u);
  assert.doesNotMatch(source, /至少 5 个字/u);
  assert.doesNotMatch(source, /real[-_ ]?import/iu);
  assert.doesNotMatch(source, /\binventory_txns\b/u);
  assert.doesNotMatch(source, /\bpurchase_receipts\b/u);
  assert.doesNotMatch(source, /\bquality_inspections\b/u);
  assert.doesNotMatch(source, /\bfinance_facts\b/u);
});
