import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runPriorityAudit } from "./multi-client-role-workflow-priority-audit.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts/qa/multi-client-role-workflow-priority-audit.mjs");

function spawnAudit(args) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "priority-audit-test-"));
  const stdoutPath = path.join(tempDir, "stdout.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", stdoutFd, "pipe"],
  });
  closeSync(stdoutFd);
  const stdout = readFileSync(stdoutPath, "utf8");
  rmSync(tempDir, { recursive: true, force: true });
  return {
    ...result,
    stdout,
  };
}

function extractReportPathFromCommand(command) {
  const match = String(command || "").match(/(?:^|\s)--report\s+(\S+)/);
  return match ? match[1] : "";
}

function assertRunnerReportPathOutsideEvidence(pathValue) {
  assert.match(
    pathValue,
    /^output\/release-evidence-closeout\/[^/]+\/[^/]+-runner-report\.json$/,
  );
  assert.doesNotMatch(pathValue, /^deployments\/[^/]+\/evidence(?:\/|$)/);
  assert.doesNotMatch(pathValue, /\/deployments\/[^/]+\/evidence(?:\/|$)/);
}

function assertReportCommandPathOutsideEvidence(command) {
  const reportPath = extractReportPathFromCommand(command);
  assert.notEqual(reportPath, "", `missing --report in command: ${command}`);
  assertRunnerReportPathOutsideEvidence(reportPath);
}

function assertReportFileCommandIsReportOnly(command, actionId) {
  assert.match(
    command,
    new RegExp(
      `^node scripts/deploy/release-evidence-closeout-runner\\.mjs .*--only ${actionId} .*--json$`,
    ),
  );
  assertReportCommandPathOutsideEvidence(command);
  assert.doesNotMatch(
    command,
    /--execute|RELEASE_CLOSEOUT_CONFIRM|<target-[^>]+>|<server-image-ref>|<web-image-ref>|sha256:<64-hex>|<redacted-[^>]+>/,
  );
  assert.doesNotMatch(command, /SOURCE_POSTGRES_DSN=|CUSTOMER_CONFIG_ADMIN_TOKEN=/);
}

test("multi-client role workflow priority audit help documents input checklist as collection only", () => {
  const result = spawnAudit(["--help"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--input-checklist-json/);
  assert.match(result.stdout, /--input-checklist-markdown/);
  assert.match(result.stdout, /--input-checklist-csv/);
  assert.match(result.stdout, /Input checklist modes are input collection views only/);
  assert.match(result.stdout, /do not execute\s+closeout actions/);
  assert.match(result.stdout, /do not write release evidence/);
  assert.match(result.stdout, /collectionPlan omits\s+executeCommand/);
  assert.match(result.stdout, /CSV output is for spreadsheets and external collection/);
  assert.doesNotMatch(result.stdout, /RELEASE_CLOSEOUT_CONFIRM|--execute/);
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN=|CUSTOMER_CONFIG_ADMIN_TOKEN=/);
});

test("multi-client role workflow priority audit passes current executable evidence", () => {
  const audit = runPriorityAudit();

  assert.equal(audit.ok, true);
  assert.equal(audit.readOnly, true);
  assert.equal(audit.releaseReady, audit.releaseEvidenceProgress.ready);
  assert.equal(audit.scope.readOnly, true);
  assert.equal(audit.scope.executableEvidenceOnly, true);
  assert.match(audit.scope.readyMeaning, /guarded and evidence-required items remain explicitly incomplete/);
  assert(
    audit.scope.notProvenByThisAudit.includes("target smoke was run"),
  );
  assert(
    audit.scope.notProvenByThisAudit.includes("real customer data import was approved or executed"),
  );
  assert.equal(audit.counts.failed, 0);
  assert(audit.counts.total >= 14);
  assert.equal(audit.counts.statuses.ready >= 1, true);
  assert.equal(audit.counts.statuses.guarded, 1);
  assert.equal(audit.counts.statuses["evidence-required"], 1);
  assert.equal(audit.releaseEvidenceProgress.evidenceDir, "deployments/yoyoosun/evidence/releases/2026-06-29");
  assert.equal(audit.releaseEvidenceProgress.runtimeEnvFile, "server/deploy/compose/prod/.env");
  assert.equal(audit.completionAudit.canUsePriorityAsExecutionQueue, true);
  assert.equal(
    audit.completionAudit.canCompleteLocally,
    audit.releaseEvidenceProgress.ready &&
      audit.completionAudit.localGuardedRequirementIds.length === 0,
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "runtime-schema-migration",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "frontend-effective-session-projection",
    ),
  );
  assert(
    audit.completionAudit.localEvidenceRequiredRequirementIds.includes(
      "release-preflight-target-evidence",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "super-admin-break-glass-governance",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "workflow-task-runtime-anchors",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-minimum",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "workflow-task-process-link",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-linked-human-task",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-start-first-node",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-linked-task-completion",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "workflow-complete-action-process-runtime-completion",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-sequential-next-node",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-named-policy-branch",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-fan-out-join",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-return-to-attempt",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-blocked-due-at",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-domain-command-handler",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-material-supply-definition-evidence",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-material-supply-domain-command-contract-preflight",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-material-supply-receipt-runtime-api",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-material-supply-purchase-order-explicit-runtime-api",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-finished-goods-shipment-finance-contract-preflight",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-finished-goods-delivery-definition-evidence",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "p4-finished-goods-remaining-domain-handlers",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-wait-event-wakeup",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-end-node-completion",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "workflow-task-configured-candidates",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "domain-command-entry-preflight",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "second-customer-responsibility-difference",
    ),
  );
  assert(
    audit.completionAudit.localReadyRequirementIds.includes(
      "module-disabled-readonly-gate",
    ),
  );
  assert.equal(
    audit.completionAudit.state,
    audit.releaseEvidenceProgress.ready ? "ready" : "target-evidence-required",
  );
  assert.equal(
    audit.completionAudit.blockingCategory,
    audit.releaseEvidenceProgress.ready
      ? "none"
      : "external-release-evidence-required",
  );
  assert.equal(typeof audit.completionAudit.gateErrorTotals.errors, "number");
  assert.equal(typeof audit.completionAudit.gateErrorTotals.warnings, "number");
  assert.equal(Array.isArray(audit.referenceCoverage), true);
  assert.equal(audit.referenceCoverage.length, 31);
  assert.equal(Array.isArray(audit.implementationOrder), true);
  assert.deepEqual(
    audit.implementationOrder.map((phase) => phase.id),
    [
      "p0-source-rbac-workflow-boundaries",
      "p1-customer-config-runtime",
      "p2-entitlement-work-pools",
      "p3-narrow-process-runtime",
      "p4-three-golden-loops",
      "p5-release-import-second-customer",
    ],
  );
  const p0Phase = audit.implementationOrder.find(
    (phase) => phase.id === "p0-source-rbac-workflow-boundaries",
  );
  assert.equal(p0Phase.state, "ready");
  assert(
    p0Phase.checkIds.includes("workflow-action-contracts"),
  );
  assert(
    p0Phase.forbiddenScope.includes(
      "不把 Workflow task done 当 Fact posted",
    ),
  );
  const p2Phase = audit.implementationOrder.find(
    (phase) => phase.id === "p2-entitlement-work-pools",
  );
  assert.equal(p2Phase.state, "ready");
  assert(
    p2Phase.guardedCheckIds.includes("domain-command-entry-remains-guarded"),
  );
  assert(
    p2Phase.requirementIds.includes("domain-command-entry-preflight"),
  );
  const p5Phase = audit.implementationOrder.find(
    (phase) => phase.id === "p5-release-import-second-customer",
  );
  assert.equal(p5Phase.localState, "evidence-required");
  assert.equal(
    p5Phase.state,
    audit.releaseEvidenceProgress.ready ? "ready" : "target-evidence-required",
  );
  assert.equal(
    p5Phase.targetState,
    audit.releaseEvidenceProgress.ready ? "ready" : "evidence-required",
  );
  assert(
    p5Phase.releaseActionIds.includes("immutable-version"),
  );
  assert.deepEqual(p5Phase.guardedCheckIds, []);
  assert.deepEqual(p5Phase.failedCheckIds, []);
  assert(
    p5Phase.requirementIds.includes("module-disabled-readonly-gate"),
  );
  if (!audit.releaseEvidenceProgress.ready) {
    assert.equal(p5Phase.nextAction.kind, "release-closeout");
    assert.equal(p5Phase.nextAction.actionId, "immutable-version");
    assert.equal(p5Phase.nextAction.actionState, "blocked");
    assert(
      p5Phase.nextAction.missingPrerequisiteIds.includes("SERVER_IMAGE"),
    );
    assert.equal(p5Phase.nextAction.reportOnlyWritesReleaseEvidence, false);
    assert.equal(
      p5Phase.nextAction.executeRequiresConfirm,
      "RUN_YOYOOSUN_RELEASE_CLOSEOUT",
    );
    assert.equal(
      p5Phase.nextAction.inputChecklist.actionId,
      "immutable-version",
    );
    assert(
      p5Phase.nextAction.inputChecklist.resolvedInputIds.includes(
        "RELEASE_VERSION",
      ),
    );
    assert(
      p5Phase.nextAction.inputChecklist.missingInputIdsByKind.env.includes(
        "SERVER_IMAGE_DIGEST",
      ),
    );
    assert(
      p5Phase.nextAction.inputChecklist.missingInputEnvTemplate.includes(
        "SERVER_IMAGE_DIGEST='sha256:<64-hex>'",
      ),
    );
    assert(
      p5Phase.nextAction.inputChecklist.operatorChecklist.some(
        (item) =>
          item.id === "BACKUP_ID" &&
          item.status === "missing" &&
          item.evidenceTarget.includes("backup-evidence.md"),
      ),
    );
    assert.equal(
      p5Phase.nextAction.inputChecklist.nextRunnerReportPath,
      "output/release-evidence-closeout/2026-06-29/immutable-version-runner-report.json",
    );
    assert.match(
      p5Phase.nextAction.executeCommand,
      /RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT .*--only immutable-version .*--execute/,
    );
    assert.doesNotMatch(
      p5Phase.nextAction.reportFileCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.equal(p5Phase.nextAction.gateSummary.errorCount >= 1, true);
    assert.match(
      p5Phase.nextAction.reportOnlyCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--json/,
    );
    assert(
      p5Phase.nextAction.note.includes("report-only commands do not write release evidence"),
    );
    assert(
      p5Phase.forbiddenScope.includes(
        "当前没有正式生产环境时不伪造 release evidence",
      ),
    );
  }
  const schemaCoverage = audit.referenceCoverage.find(
    (item) => item.id === "runtime-schema-migration",
  );
  assert.equal(schemaCoverage.state, "ready");
  assert.equal(schemaCoverage.localState, "ready");
  assert.equal(schemaCoverage.targetState, "not-applicable");
  assert.deepEqual(schemaCoverage.checkIds, ["customer-config-runtime-schema"]);
  assert(
    schemaCoverage.evidence.includes(
      "server/internal/data/model/schema/customer_config_revision.go",
    ),
  );
  const usecaseCoverage = audit.referenceCoverage.find(
    (item) => item.id === "usecase-repo-api-rbac",
  );
  assert.equal(usecaseCoverage.state, "ready");
  assert.equal(usecaseCoverage.localState, "ready");
  assert.equal(usecaseCoverage.targetState, "not-applicable");
  assert(
    usecaseCoverage.checkIds.includes("customer-config-usecase-repo-api-rbac"),
  );
  const demoPackageCheck = audit.checks.find(
    (check) => check.id === "demo-customer-package-compile",
  );
  assert.equal(demoPackageCheck.status, "ready");
  assert.equal(demoPackageCheck.pass, true);
  assert(
    demoPackageCheck.evidence.includes(
      "config/customers/demo/customerPackage.mjs",
    ),
  );
  const moduleStatusExplainCheck = audit.checks.find(
    (check) => check.id === "customer-config-module-status-explain",
  );
  assert.equal(moduleStatusExplainCheck.status, "ready");
  assert.equal(moduleStatusExplainCheck.pass, true);
  assert(
    moduleStatusExplainCheck.evidence.includes(
      "server/internal/service/jsonrpc_customer_config.go",
    ),
  );
  const moduleReadonlyGuardedCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-consistency-remains-guarded",
  );
  const moduleProcessStartGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-process-start-gate",
  );
  const moduleEffectiveSessionGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-effective-session-projection-gate",
  );
  const moduleImportExecuteGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-import-execute-gate",
  );
  const moduleImportPrepNoExecuteGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-import-prep-no-execute-gate",
  );
  const moduleCustomerConfigExecuteGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-customer-config-execute-gate",
  );
  const moduleSalesOrderAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-sales-order-api-gate",
  );
  const modulePurchaseOrderAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-purchase-order-api-gate",
  );
  const moduleOutsourcingOrderAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-outsourcing-order-api-gate",
  );
  const moduleMaterialBOMAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-material-bom-api-gate",
  );
  const moduleMasterDataCoreAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-masterdata-core-api-gate",
  );
  const moduleProcessMasterDataAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-process-masterdata-api-gate",
  );
  const modulePurchaseAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-purchase-api-gate",
  );
  const moduleQualityAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-quality-api-gate",
  );
  const moduleShipmentAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-shipment-api-gate",
  );
  const moduleStockReservationAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-stock-reservation-api-gate",
  );
  const moduleProductionAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-production-api-gate",
  );
  const moduleOutsourcingAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-outsourcing-api-gate",
  );
  const moduleFinanceAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-finance-api-gate",
  );
  const moduleAttachmentAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-attachment-api-gate",
  );
  const moduleWorkflowAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-workflow-api-gate",
  );
  const modulePrintAPIGateCheck = audit.checks.find(
    (check) => check.id === "module-disabled-readonly-print-api-gate",
  );
  const moduleSchedulerGateCheck = audit.checks.find(
    (check) =>
      check.id === "module-disabled-readonly-no-active-business-scheduler-gate",
  );
  const moduleJSONRPCWriteInventoryGateCheck = audit.checks.find(
    (check) =>
      check.id === "module-disabled-readonly-jsonrpc-write-inventory-gate",
  );
  assert.equal(moduleProcessStartGateCheck.status, "ready");
  assert.equal(moduleProcessStartGateCheck.pass, true);
  assert(
    moduleProcessStartGateCheck.evidence.includes(
      "server/internal/biz/customer_config_test.go",
    ),
  );
  assert.equal(moduleEffectiveSessionGateCheck.status, "ready");
  assert.equal(moduleEffectiveSessionGateCheck.pass, true);
  assert(
    moduleEffectiveSessionGateCheck.evidence.includes(
      "server/internal/biz/customer_config_test.go",
    ),
  );
  assert.equal(moduleImportExecuteGateCheck.status, "ready");
  assert.equal(moduleImportExecuteGateCheck.pass, true);
  assert(
    moduleImportExecuteGateCheck.evidence.includes(
      "scripts/import/customerImportExecute.mjs",
    ),
  );
  assert.equal(moduleImportPrepNoExecuteGateCheck.status, "ready");
  assert.equal(moduleImportPrepNoExecuteGateCheck.pass, true);
  assert(
    moduleImportPrepNoExecuteGateCheck.evidence.includes(
      "scripts/import/customerImportDryRun.test.mjs",
    ),
  );
  assert.equal(moduleCustomerConfigExecuteGateCheck.status, "ready");
  assert.equal(moduleCustomerConfigExecuteGateCheck.pass, true);
  assert(
    moduleCustomerConfigExecuteGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_customer_config_test.go",
    ),
  );
  assert.equal(moduleSalesOrderAPIGateCheck.status, "ready");
  assert.equal(moduleSalesOrderAPIGateCheck.pass, true);
  assert(
    moduleSalesOrderAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_masterdata_order_test.go",
    ),
  );
  assert.equal(modulePurchaseOrderAPIGateCheck.status, "ready");
  assert.equal(modulePurchaseOrderAPIGateCheck.pass, true);
  assert(
    modulePurchaseOrderAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_purchase_order_test.go",
    ),
  );
  assert.equal(moduleOutsourcingOrderAPIGateCheck.status, "ready");
  assert.equal(moduleOutsourcingOrderAPIGateCheck.pass, true);
  assert(
    moduleOutsourcingOrderAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_outsourcing_order_test.go",
    ),
  );
  assert.equal(moduleMaterialBOMAPIGateCheck.status, "ready");
  assert.equal(moduleMaterialBOMAPIGateCheck.pass, true);
  assert(
    moduleMaterialBOMAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_bom_test.go",
    ),
  );
  assert.equal(moduleMasterDataCoreAPIGateCheck.status, "ready");
  assert.equal(moduleMasterDataCoreAPIGateCheck.pass, true);
  assert(
    moduleMasterDataCoreAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_masterdata_order_test.go",
    ),
  );
  assert.equal(moduleProcessMasterDataAPIGateCheck.status, "ready");
  assert.equal(moduleProcessMasterDataAPIGateCheck.pass, true);
  assert(
    moduleProcessMasterDataAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_masterdata_order_test.go",
    ),
  );
  assert.equal(modulePurchaseAPIGateCheck.status, "ready");
  assert.equal(modulePurchaseAPIGateCheck.pass, true);
  assert(
    modulePurchaseAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_purchase_test.go",
    ),
  );
  assert.equal(moduleQualityAPIGateCheck.status, "ready");
  assert.equal(moduleQualityAPIGateCheck.pass, true);
  assert(
    moduleQualityAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_quality_test.go",
    ),
  );
  assert.equal(moduleShipmentAPIGateCheck.status, "ready");
  assert.equal(moduleShipmentAPIGateCheck.pass, true);
  assert(
    moduleShipmentAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_operational_fact_test.go",
    ),
  );
  assert.equal(moduleStockReservationAPIGateCheck.status, "ready");
  assert.equal(moduleStockReservationAPIGateCheck.pass, true);
  assert(
    moduleStockReservationAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_operational_fact_test.go",
    ),
  );
  assert.equal(moduleProductionAPIGateCheck.status, "ready");
  assert.equal(moduleProductionAPIGateCheck.pass, true);
  assert(
    moduleProductionAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_operational_fact_test.go",
    ),
  );
  assert.equal(moduleOutsourcingAPIGateCheck.status, "ready");
  assert.equal(moduleOutsourcingAPIGateCheck.pass, true);
  assert(
    moduleOutsourcingAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_operational_fact_test.go",
    ),
  );
  assert.equal(moduleFinanceAPIGateCheck.status, "ready");
  assert.equal(moduleFinanceAPIGateCheck.pass, true);
  assert(
    moduleFinanceAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_operational_fact_test.go",
    ),
  );
  assert.equal(moduleAttachmentAPIGateCheck.status, "ready");
  assert.equal(moduleAttachmentAPIGateCheck.pass, true);
  assert(
    moduleAttachmentAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_attachment_test.go",
    ),
  );
  assert.equal(moduleWorkflowAPIGateCheck.status, "ready");
  assert.equal(moduleWorkflowAPIGateCheck.pass, true);
  assert(
    moduleWorkflowAPIGateCheck.evidence.includes(
      "server/internal/service/jsonrpc_workflow_test.go",
    ),
  );
  assert.equal(modulePrintAPIGateCheck.status, "ready");
  assert.equal(modulePrintAPIGateCheck.pass, true);
  assert(
    modulePrintAPIGateCheck.evidence.includes(
      "server/internal/server/template_pdf_test.go",
    ),
  );
  assert.equal(moduleSchedulerGateCheck.status, "ready");
  assert.equal(moduleSchedulerGateCheck.pass, true);
  assert.deepEqual(moduleSchedulerGateCheck.scanFindings, []);
  assert(
    moduleSchedulerGateCheck.evidence.includes(
      "server/internal/server/template_pdf.go",
    ),
  );
  assert.equal(moduleJSONRPCWriteInventoryGateCheck.status, "ready");
  assert.equal(moduleJSONRPCWriteInventoryGateCheck.pass, true);
  assert.deepEqual(moduleJSONRPCWriteInventoryGateCheck.scanFindings, []);
  assert(
    moduleJSONRPCWriteInventoryGateCheck.evidence.includes(
      "scripts/qa/multi-client-role-workflow-priority-audit.mjs",
    ),
  );
  assert.equal(moduleReadonlyGuardedCheck.status, "ready");
  assert.equal(moduleReadonlyGuardedCheck.pass, true);
  assert(
    moduleReadonlyGuardedCheck.notProven.includes(
      "目标环境已经验证模块关闭前置检查和历史只读查询",
    ),
  );
  const moduleReadonlyCoverage = audit.referenceCoverage.find(
    (item) => item.id === "module-disabled-readonly-gate",
  );
  assert.equal(moduleReadonlyCoverage.state, "ready");
  assert.equal(moduleReadonlyCoverage.localState, "ready");
  assert.equal(moduleReadonlyCoverage.targetState, "not-applicable");
  assert.deepEqual(moduleReadonlyCoverage.checkIds, [
    "module-disabled-readonly-process-start-gate",
    "module-disabled-readonly-effective-session-projection-gate",
    "module-disabled-readonly-import-execute-gate",
    "module-disabled-readonly-import-prep-no-execute-gate",
    "module-disabled-readonly-customer-config-execute-gate",
    "module-disabled-readonly-sales-order-api-gate",
    "module-disabled-readonly-purchase-order-api-gate",
    "module-disabled-readonly-outsourcing-order-api-gate",
    "module-disabled-readonly-material-bom-api-gate",
    "module-disabled-readonly-masterdata-core-api-gate",
    "module-disabled-readonly-process-masterdata-api-gate",
    "module-disabled-readonly-purchase-api-gate",
    "module-disabled-readonly-quality-api-gate",
    "module-disabled-readonly-shipment-api-gate",
    "module-disabled-readonly-stock-reservation-api-gate",
    "module-disabled-readonly-production-api-gate",
    "module-disabled-readonly-outsourcing-api-gate",
    "module-disabled-readonly-finance-api-gate",
    "module-disabled-readonly-attachment-api-gate",
    "module-disabled-readonly-workflow-api-gate",
    "module-disabled-readonly-print-api-gate",
    "module-disabled-readonly-no-active-business-scheduler-gate",
    "module-disabled-readonly-jsonrpc-write-inventory-gate",
    "module-disabled-readonly-consistency-remains-guarded",
  ]);
  assert.equal(moduleReadonlyCoverage.missingCheckIds.length, 0);
  assert(
    moduleReadonlyCoverage.notProven.includes(
      "目标环境已经验证模块关闭前置检查和历史只读查询",
    ),
  );
  const frontendCoverage = audit.referenceCoverage.find(
    (item) => item.id === "frontend-effective-session-projection",
  );
  assert(
    frontendCoverage.checkIds.includes("customer-config-frontend-projection"),
  );
  assert.equal(frontendCoverage.localState, "ready");
  assert.equal(
    frontendCoverage.targetState,
    audit.releaseEvidenceProgress.ready ? "ready" : "evidence-required",
  );
  assert(
    frontendCoverage.releaseActionIds.includes(
      "customer-config-effective-session",
    ),
  );
  assert(
    frontendCoverage.notProven.includes(
      "target environment smoke read back the active customer config revision",
    ),
  );
  const releaseCoverage = audit.referenceCoverage.find(
    (item) => item.id === "release-preflight-target-evidence",
  );
  assert(
    releaseCoverage.checkIds.includes("release-preflight-fast-gate"),
  );
  assert(
    releaseCoverage.releaseActionIds.includes("backup-restore-rehearsal"),
  );
  assert(
    releaseCoverage.releaseActionIds.includes("release-signoff"),
  );
  assert.equal(releaseCoverage.localState, "evidence-required");
  assert.equal(
    releaseCoverage.targetState,
    audit.releaseEvidenceProgress.ready ? "ready" : "evidence-required",
  );
  assert.equal(
    releaseCoverage.state,
    audit.releaseEvidenceProgress.ready ? "ready" : "evidence-required",
  );
  assert.equal(releaseCoverage.missingCheckIds.length, 0);
  const breakGlassCoverage = audit.referenceCoverage.find(
    (item) => item.id === "super-admin-break-glass-governance",
  );
  assert.equal(breakGlassCoverage.state, "ready");
  assert.equal(breakGlassCoverage.localState, "ready");
  assert.equal(breakGlassCoverage.targetState, "not-applicable");
  assert.deepEqual(breakGlassCoverage.checkIds, [
    "super-admin-break-glass-controlled-runtime",
  ]);
  assert(
    breakGlassCoverage.notProven.includes(
      "target environment break-glass was exercised",
    ),
  );
  const workflowTaskAnchorsCoverage = audit.referenceCoverage.find(
    (item) => item.id === "workflow-task-runtime-anchors",
  );
  assert.equal(workflowTaskAnchorsCoverage.state, "ready");
  assert.equal(workflowTaskAnchorsCoverage.localState, "ready");
  assert.equal(workflowTaskAnchorsCoverage.targetState, "not-applicable");
  assert.deepEqual(workflowTaskAnchorsCoverage.checkIds, [
    "workflow-task-runtime-anchors",
  ]);
  assert(
    workflowTaskAnchorsCoverage.notProven.includes(
      "process runtime automatically creates WorkflowTask from human_task / approval nodes",
    ),
  );
  const processRuntimeCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-minimum",
  );
  assert.equal(processRuntimeCoverage.state, "ready");
  assert.equal(processRuntimeCoverage.localState, "ready");
  assert.equal(processRuntimeCoverage.targetState, "not-applicable");
  assert.deepEqual(processRuntimeCoverage.checkIds, [
    "process-runtime-minimum",
  ]);
  assert(
    processRuntimeCoverage.notProven.includes(
      "process runtime advances nodes or joins branches",
    ),
  );
  const workflowTaskProcessLinkCoverage = audit.referenceCoverage.find(
    (item) => item.id === "workflow-task-process-link",
  );
  assert.equal(workflowTaskProcessLinkCoverage.state, "ready");
  assert.equal(workflowTaskProcessLinkCoverage.localState, "ready");
  assert.equal(workflowTaskProcessLinkCoverage.targetState, "not-applicable");
  assert.deepEqual(workflowTaskProcessLinkCoverage.checkIds, [
    "workflow-task-process-link",
  ]);
  assert(
    workflowTaskProcessLinkCoverage.notProven.includes(
      "node status advances when linked workflow task is completed",
    ),
  );
  const linkedHumanTaskCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-linked-human-task",
  );
  assert.equal(linkedHumanTaskCoverage.state, "ready");
  assert.equal(linkedHumanTaskCoverage.localState, "ready");
  assert.equal(linkedHumanTaskCoverage.targetState, "not-applicable");
  assert.deepEqual(linkedHumanTaskCoverage.checkIds, [
    "process-runtime-linked-human-task",
  ]);
  assert(
    linkedHumanTaskCoverage.notProven.includes(
      "process runner automatically starts human_task / approval nodes",
    ),
  );
  const processRuntimeStartCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-start-first-node",
  );
  assert.equal(processRuntimeStartCoverage.state, "ready");
  assert.equal(processRuntimeStartCoverage.localState, "ready");
  assert.equal(processRuntimeStartCoverage.targetState, "not-applicable");
  assert.deepEqual(processRuntimeStartCoverage.checkIds, [
    "process-runtime-start-first-node",
  ]);
  assert(
    processRuntimeStartCoverage.notProven.includes(
      "background scheduler automatically starts process instances",
    ),
  );
  const linkedTaskCompletionCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-linked-task-completion",
  );
  assert.equal(linkedTaskCompletionCoverage.state, "ready");
  assert.equal(linkedTaskCompletionCoverage.localState, "ready");
  assert.equal(linkedTaskCompletionCoverage.targetState, "not-applicable");
  assert.deepEqual(linkedTaskCompletionCoverage.checkIds, [
    "process-runtime-linked-task-completion",
  ]);
  assert(
    linkedTaskCompletionCoverage.notProven.includes(
      "process runner scans definitions or creates linked tasks beyond the just-activated adjacent human_task / approval node",
    ),
  );
  const workflowCompleteActionCoverage = audit.referenceCoverage.find(
    (item) => item.id === "workflow-complete-action-process-runtime-completion",
  );
  assert.equal(workflowCompleteActionCoverage.state, "ready");
  assert.equal(workflowCompleteActionCoverage.localState, "ready");
  assert.equal(workflowCompleteActionCoverage.targetState, "not-applicable");
  assert.deepEqual(workflowCompleteActionCoverage.checkIds, [
    "workflow-complete-action-process-runtime-completion",
  ]);
  assert(
    workflowCompleteActionCoverage.notProven.includes(
      "removed raw workflow status API is available to trigger ProcessRuntime completion",
    ),
  );
  assert(
    workflowCompleteActionCoverage.notProven.includes(
      "process runner scans definitions or creates linked tasks beyond the just-activated adjacent human_task / approval node",
    ),
  );
  const sequentialNextNodeCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-sequential-next-node",
  );
  assert.equal(sequentialNextNodeCoverage.state, "ready");
  assert.equal(sequentialNextNodeCoverage.localState, "ready");
  assert.equal(sequentialNextNodeCoverage.targetState, "not-applicable");
  assert.deepEqual(sequentialNextNodeCoverage.checkIds, [
    "process-runtime-sequential-next-node",
  ]);
  assert(
    sequentialNextNodeCoverage.notProven.includes(
      "process runner scans definitions or creates linked tasks beyond the just-activated adjacent human_task / approval node",
    ),
  );
  assert(
    sequentialNextNodeCoverage.notProven.includes(
      "domain_command nodes execute domain usecases",
    ),
  );
  const namedPolicyBranchCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-named-policy-branch",
  );
  assert.equal(namedPolicyBranchCoverage.state, "ready");
  assert.equal(namedPolicyBranchCoverage.localState, "ready");
  assert.equal(namedPolicyBranchCoverage.targetState, "not-applicable");
  assert.deepEqual(namedPolicyBranchCoverage.checkIds, [
    "process-runtime-named-policy-branch",
  ]);
  assert(
    namedPolicyBranchCoverage.notProven.includes(
      "non-selected branch nodes are automatically skipped or settled",
    ),
  );
  assert(
    namedPolicyBranchCoverage.notProven.includes(
      "target environment exercised returnTo branches",
    ),
  );
  const fanOutJoinCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-fan-out-join",
  );
  assert.equal(fanOutJoinCoverage.state, "ready");
  assert.equal(fanOutJoinCoverage.localState, "ready");
  assert.equal(fanOutJoinCoverage.targetState, "not-applicable");
  assert.deepEqual(fanOutJoinCoverage.checkIds, [
    "process-runtime-fan-out-join",
  ]);
  assert(
    fanOutJoinCoverage.notProven.includes(
      "target environment exercised returnTo branches",
    ),
  );
  assert(
    fanOutJoinCoverage.notProven.includes(
      "fan-out / join routes are loaded from customer package process definitions on the target environment",
    ),
  );
  const returnToCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-return-to-attempt",
  );
  assert.equal(returnToCoverage.state, "ready");
  assert.equal(returnToCoverage.localState, "ready");
  assert.equal(returnToCoverage.targetState, "not-applicable");
  assert.deepEqual(returnToCoverage.checkIds, [
    "process-runtime-return-to-attempt",
  ]);
  assert(
    returnToCoverage.notProven.includes(
      "target environment exercised returnTo branches",
    ),
  );
  const blockedDueAtCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-blocked-due-at",
  );
  assert.equal(blockedDueAtCoverage.state, "ready");
  assert.equal(blockedDueAtCoverage.localState, "ready");
  assert.equal(blockedDueAtCoverage.targetState, "not-applicable");
  assert.deepEqual(blockedDueAtCoverage.checkIds, [
    "process-runtime-blocked-due-at",
  ]);
  assert(
    blockedDueAtCoverage.notProven.includes(
      "background scheduler automatically scans overdue process nodes",
    ),
  );
  assert(
    blockedDueAtCoverage.notProven.includes(
      "target environment exercised blocked / due_at escalation",
    ),
  );
  const processRuntimeDomainCommandCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-domain-command-handler",
  );
  assert.equal(processRuntimeDomainCommandCoverage.state, "ready");
  assert.equal(processRuntimeDomainCommandCoverage.localState, "ready");
  assert.equal(processRuntimeDomainCommandCoverage.targetState, "not-applicable");
  assert.deepEqual(processRuntimeDomainCommandCoverage.checkIds, [
    "process-runtime-domain-command-handler-guard",
    "sales-order-submit-domain-command-handler",
    "sales-order-acceptance-minimum-process-chain",
    "customer-config-sales-order-process-definition-manifest",
    "sales-order-acceptance-explicit-start-jsonrpc",
    "sales-order-acceptance-submit-domain-command-jsonrpc",
  ]);
  assert(
    processRuntimeDomainCommandCoverage.notProven.includes(
      "workflow task completion automatically invokes domain command handlers",
    ),
  );
  assert(
    processRuntimeDomainCommandCoverage.notProven.includes(
      "shipment / finance domain command usecases are bound",
    ),
  );
  const materialSupplyCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-material-supply-definition-evidence",
  );
  assert.equal(materialSupplyCoverage.state, "ready");
  assert.equal(materialSupplyCoverage.localState, "ready");
  assert.equal(materialSupplyCoverage.targetState, "not-applicable");
  assert.deepEqual(materialSupplyCoverage.checkIds, [
    "material-supply-runtime-loader-definition",
  ]);
  assert(
    materialSupplyCoverage.notProven.includes(
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
    ),
  );
  const materialSupplyContractCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-material-supply-domain-command-contract-preflight",
  );
  assert.equal(materialSupplyContractCoverage.state, "ready");
  assert.equal(materialSupplyContractCoverage.localState, "ready");
  assert.equal(materialSupplyContractCoverage.targetState, "not-applicable");
  assert.deepEqual(materialSupplyContractCoverage.checkIds, [
    "material-supply-domain-command-contract-preflight",
  ]);
  assert(
    materialSupplyContractCoverage.notProven.includes(
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
    ),
  );
  const materialSupplyReceiptRuntimeCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-material-supply-receipt-runtime-api",
  );
  assert.equal(materialSupplyReceiptRuntimeCoverage.state, "ready");
  assert.equal(materialSupplyReceiptRuntimeCoverage.localState, "ready");
  assert.equal(materialSupplyReceiptRuntimeCoverage.targetState, "not-applicable");
  assert.deepEqual(materialSupplyReceiptRuntimeCoverage.checkIds, [
    "material-supply-receipt-runtime-api",
  ]);
  assert(
    materialSupplyReceiptRuntimeCoverage.notProven.includes(
      "workflow task completion posts purchase receipt, quality inspection or inventory facts",
    ),
  );
  const materialSupplyPurchaseOrderRuntimeCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-material-supply-purchase-order-explicit-runtime-api",
  );
  assert.equal(materialSupplyPurchaseOrderRuntimeCoverage.state, "ready");
  assert.equal(materialSupplyPurchaseOrderRuntimeCoverage.localState, "ready");
  assert.equal(materialSupplyPurchaseOrderRuntimeCoverage.targetState, "not-applicable");
  assert.deepEqual(materialSupplyPurchaseOrderRuntimeCoverage.checkIds, [
    "material-supply-purchase-order-explicit-runtime-api",
  ]);
  assert(
    materialSupplyPurchaseOrderRuntimeCoverage.notProven.includes(
      "target environment constructed material_supply from active customer config",
    ),
  );
  const finishedGoodsShipmentFinanceCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-finished-goods-shipment-finance-contract-preflight",
  );
  assert.equal(finishedGoodsShipmentFinanceCoverage.state, "ready");
  assert.equal(finishedGoodsShipmentFinanceCoverage.localState, "ready");
  assert.equal(finishedGoodsShipmentFinanceCoverage.targetState, "not-applicable");
  assert.deepEqual(finishedGoodsShipmentFinanceCoverage.checkIds, [
    "finished-goods-shipment-finance-contract-preflight",
  ]);
  assert(
    finishedGoodsShipmentFinanceCoverage.notProven.includes(
      "workflow task completion posts shipment, inventory OUT, receivable or invoice facts",
    ),
  );
  assert(
    finishedGoodsShipmentFinanceCoverage.notProven.includes(
      "target environment exercised the finished goods shipment golden loop",
    ),
  );
  const finishedGoodsDeliveryDefinitionCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-finished-goods-delivery-definition-evidence",
  );
  assert.equal(finishedGoodsDeliveryDefinitionCoverage.state, "ready");
  assert.equal(finishedGoodsDeliveryDefinitionCoverage.localState, "ready");
  assert.equal(finishedGoodsDeliveryDefinitionCoverage.targetState, "not-applicable");
  assert.deepEqual(finishedGoodsDeliveryDefinitionCoverage.checkIds, [
    "finished-goods-delivery-definition-evidence",
  ]);
  assert(
    !finishedGoodsDeliveryDefinitionCoverage.notProven.includes(
      "shipment.finance_release runtime domain command handler is registered",
    ),
  );
  assert(
    finishedGoodsDeliveryDefinitionCoverage.evidence.includes(
      "server/internal/service/jsonrpc_quality.go",
    ),
  );
  assert(
    finishedGoodsDeliveryDefinitionCoverage.evidence.includes(
      "server/internal/data/inventory_repo_quality_inspection_test.go",
    ),
  );
  assert(
    finishedGoodsDeliveryDefinitionCoverage.evidence.includes(
      "server/internal/service/jsonrpc_quality_test.go",
    ),
  );
  assert(
    finishedGoodsDeliveryDefinitionCoverage.evidence.includes(
      "server/internal/biz/finished_goods_delivery_process_test.go",
    ),
  );
  const finishedGoodsRemainingHandlerCoverage = audit.referenceCoverage.find(
    (item) => item.id === "p4-finished-goods-remaining-domain-handlers",
  );
  assert.equal(finishedGoodsRemainingHandlerCoverage.state, "ready");
  assert.equal(finishedGoodsRemainingHandlerCoverage.localState, "ready");
  assert.equal(finishedGoodsRemainingHandlerCoverage.targetState, "not-applicable");
  assert.deepEqual(finishedGoodsRemainingHandlerCoverage.checkIds, [
    "finished-goods-finance-release-handler-registered",
  ]);
  assert(
    !finishedGoodsRemainingHandlerCoverage.notProven.includes(
      "finished_goods_quality.decide ProcessRuntime handler is registered for shipment-linked quality fact",
    ),
  );
  assert(
    !finishedGoodsRemainingHandlerCoverage.notProven.includes(
      "shipment.finance_release ProcessRuntime handler is registered and does not ship inventory",
    ),
  );
  assert(
    !finishedGoodsRemainingHandlerCoverage.notProven.includes(
      "finance.receivable_lead ProcessRuntime handler is registered after real shipped source is available",
    ),
  );
  assert(
    finishedGoodsRemainingHandlerCoverage.evidence.includes(
      "scripts/qa/customer-config-runtime-manifest.mjs",
    ),
  );
  const processRuntimeWaitEventCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-wait-event-wakeup",
  );
  assert.equal(processRuntimeWaitEventCoverage.state, "ready");
  assert.equal(processRuntimeWaitEventCoverage.localState, "ready");
  assert.equal(processRuntimeWaitEventCoverage.targetState, "not-applicable");
  assert.deepEqual(processRuntimeWaitEventCoverage.checkIds, [
    "process-runtime-wait-event-wakeup",
  ]);
  assert(
    processRuntimeWaitEventCoverage.notProven.includes(
      "event subscription automatically wakes wait_event nodes",
    ),
  );
  const processRuntimeEndCoverage = audit.referenceCoverage.find(
    (item) => item.id === "process-runtime-end-node-completion",
  );
  assert.equal(processRuntimeEndCoverage.state, "ready");
  assert.equal(processRuntimeEndCoverage.localState, "ready");
  assert.equal(processRuntimeEndCoverage.targetState, "not-applicable");
  assert.deepEqual(processRuntimeEndCoverage.checkIds, [
    "process-runtime-end-node-completion",
  ]);
  assert(
    processRuntimeEndCoverage.notProven.includes(
      "target environment exercised returnTo branches",
    ),
  );
  assert(
    processRuntimeEndCoverage.notProven.includes(
      "domain facts are posted when a process reaches end",
    ),
  );
  const workflowTaskConfiguredCandidatesCoverage = audit.referenceCoverage.find(
    (item) => item.id === "workflow-task-configured-candidates",
  );
  assert.equal(workflowTaskConfiguredCandidatesCoverage.state, "ready");
  assert.equal(workflowTaskConfiguredCandidatesCoverage.localState, "ready");
  assert.equal(workflowTaskConfiguredCandidatesCoverage.targetState, "not-applicable");
  assert.deepEqual(workflowTaskConfiguredCandidatesCoverage.checkIds, [
    "workflow-task-configured-candidates-explain",
  ]);
  assert(
    workflowTaskConfiguredCandidatesCoverage.notProven.includes(
      "task candidates are filtered directly by owner_pool_key",
    ),
  );
  const domainCommandEntryCoverage = audit.referenceCoverage.find(
    (item) => item.id === "domain-command-entry-preflight",
  );
  assert.equal(domainCommandEntryCoverage.state, "ready");
  assert.equal(domainCommandEntryCoverage.localState, "ready");
  assert.equal(domainCommandEntryCoverage.targetState, "not-applicable");
  assert.deepEqual(domainCommandEntryCoverage.checkIds, [
    "domain-command-entry-explain-guard",
  ]);
  assert(
    domainCommandEntryCoverage.notProven.includes(
      "a concrete domain fact usecase binding exists",
    ),
  );
  assert.equal(typeof audit.releaseEvidenceProgress.status, "string");
  const inputChecklistDocs = audit.checks.find(
    (check) => check.id === "priority-audit-input-checklist-docs",
  );
  assert.equal(inputChecklistDocs.status, "ready");
  assert.equal(inputChecklistDocs.pass, true);
  assert(
    inputChecklistDocs.evidence.includes("scripts/README.md"),
  );
  assert.equal(typeof audit.releaseEvidenceProgress.ready, "boolean");
  assert.equal(typeof audit.releaseEvidenceProgress.closeoutSummary.blockers, "number");
  assert.equal(Array.isArray(audit.releaseEvidenceProgress.closeoutGateSummary), true);
  assert.equal(typeof audit.releaseEvidenceProgress.closeoutPlanSummary.blocked, "number");
  assert.equal(Array.isArray(audit.releaseEvidenceProgress.closeoutPlanSummary.blockedActionIds), true);
  assert.equal(Array.isArray(audit.releaseEvidenceProgress.closeoutPlanSummary.manualActionIds), true);
  if (!audit.releaseEvidenceProgress.ready) {
    const immutableRunnerReportPath =
      "output/release-evidence-closeout/2026-06-29/immutable-version-runner-report.json";
    assert.equal(audit.completionAudit.canCompleteLocally, false);
    assert(
      audit.completionAudit.targetEvidenceRequiredRequirementIds.includes(
        "frontend-effective-session-projection",
      ),
    );
    assert(
      audit.completionAudit.targetEvidenceRequiredRequirementIds.includes(
        "release-preflight-target-evidence",
      ),
    );
    assert(
      audit.completionAudit.remainingReleaseActionIds.includes(
        "immutable-version",
      ),
    );
    assert(
      audit.completionAudit.remainingReleaseActionIds.includes(
        "release-signoff",
      ),
    );
    assert.equal(
      audit.completionAudit.firstBlockedReleaseAction.id,
      "immutable-version",
    );
    assert.equal(
      audit.completionAudit.firstBlockedInputChecklist.actionId,
      "immutable-version",
    );
    assert.equal(
      audit.completionAudit.firstBlockedInputChecklist.actionState,
      "blocked",
    );
    assert(
      audit.completionAudit.firstBlockedInputChecklist.resolvedInputIds.includes(
        "RELEASE_VERSION",
      ),
    );
    assert(
      audit.completionAudit.firstBlockedInputChecklist.missingInputIds.includes(
        "SERVER_IMAGE",
      ),
    );
    assert(
      audit.completionAudit.firstBlockedInputChecklist.missingInputIdsByKind.env.includes(
        "SERVER_IMAGE",
      ),
    );
    assert(
      audit.completionAudit.firstBlockedInputChecklist.missingInputEnvTemplate.includes(
        "SERVER_IMAGE='<server-image-ref>'",
      ),
    );
    assert(
      audit.completionAudit.firstBlockedInputChecklist.operatorChecklist.some(
        (item) =>
          item.id === "SERVER_IMAGE" &&
          item.status === "missing" &&
          item.sourceHint.includes("release build") &&
          item.evidenceTarget.includes("release-evidence.md"),
      ),
    );
    assert(
      audit.completionAudit.firstBlockedInputChecklist.operatorChecklist.some(
        (item) =>
          item.id === "RELEASE_VERSION" &&
          item.status === "resolved" &&
          item.source === "release-evidence.md",
      ),
    );
    assert.match(
      audit.completionAudit.firstBlockedInputChecklist.nextRunnerReportCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--json/,
    );
    assert.doesNotMatch(
      audit.completionAudit.firstBlockedInputChecklist.nextRunnerReportCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.equal(
      audit.completionAudit.firstBlockedInputChecklist.nextRunnerReportPath,
      immutableRunnerReportPath,
    );
    assert.match(
      audit.completionAudit.firstBlockedInputChecklist.nextRunnerReportFileCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json .*--json/,
    );
    assert.doesNotMatch(
      audit.completionAudit.firstBlockedInputChecklist.nextRunnerReportFileCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.match(
      audit.completionAudit.firstBlockedInputChecklist.nextInputTemplateCommand,
      /immutable-version-evidence\.mjs .*--print-input-template/,
    );
    assert.match(
      audit.completionAudit.firstBlockedInputChecklist.nextRunnerExecuteCommand,
      /RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--execute/,
    );
    assert(
      audit.completionAudit.firstBlockedReleaseAction.requiredEnvExports.includes(
        "SERVER_IMAGE='<server-image-ref>'",
      ),
    );
    assert(
      audit.completionAudit.firstBlockedReleaseAction.operatorChecklist.some(
        (item) =>
          item.id === "SERVER_IMAGE_DIGEST" &&
          item.status === "missing" &&
          item.validation === "sha256:<64-hex>",
      ),
    );
    assert.equal(
      audit.completionAudit.firstBlockedReleaseAction.resolvedInputs.RELEASE_VERSION.source,
      "release-evidence.md",
    );
    assert(
      audit.completionAudit.firstBlockedReleaseAction.missingPrerequisites.some(
        (item) => item.id === "SERVER_IMAGE" && item.kind === "env",
      ),
    );
    assert.equal(
      audit.completionAudit.firstBlockedReleaseAction.gateSummary.errorCount >= 1,
      true,
    );
    assert.match(
      audit.completionAudit.firstBlockedReleaseAction.closeoutRunnerReportCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--json/,
    );
    assert.doesNotMatch(
      audit.completionAudit.firstBlockedReleaseAction.closeoutRunnerReportCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.equal(
      audit.completionAudit.firstBlockedReleaseAction.closeoutRunnerReportPath,
      immutableRunnerReportPath,
    );
    assert.match(
      audit.completionAudit.firstBlockedReleaseAction.closeoutRunnerReportFileCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json .*--json/,
    );
    assert.doesNotMatch(
      audit.completionAudit.firstBlockedReleaseAction.closeoutRunnerReportFileCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.match(
      audit.completionAudit.firstBlockedReleaseAction.inputTemplateCommand,
      /immutable-version-evidence\.mjs .*--print-input-template/,
    );
    assert.match(
      audit.completionAudit.firstBlockedReleaseAction.closeoutRunnerExecuteCommand,
      /RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--execute/,
    );
    assert(
      audit.completionAudit.externalPrerequisiteIds.includes("SERVER_IMAGE"),
    );
    assert(
      audit.completionAudit.remainingPrerequisitesByKind.env.includes(
        "SERVER_IMAGE",
      ),
    );
    assert(
      audit.completionAudit.remainingPrerequisitesByKind.file.includes(
        "prod-env-file",
      ),
    );
    assert(
      audit.completionAudit.remainingPrerequisitesByKind.manual.includes(
        "manual-release-signoff",
      ),
    );
    assert(
      audit.completionAudit.remainingPrerequisites.some(
        (item) =>
          item.id === "prod-env-file" &&
          item.kind === "file" &&
          item.actionIds.includes("production-preflight"),
      ),
    );
    assert.equal(
      audit.completionAudit.firstUnverifiedGateGroup.id,
      "immutable-version",
    );
    assert.equal(
      audit.completionAudit.firstUnverifiedGateGroup.errorCount >= 1,
      true,
    );
    assert.match(
      audit.completionAudit.firstUnverifiedGateGroup.firstError,
      /release-evidence\.md|image-digests\.txt/,
    );
    assert.equal(audit.completionAudit.gateErrorTotals.errors >= 1, true);
    assert(
      audit.completionAudit.guidance.includes(
        "do not mark the reference implementation complete until releaseReady=true",
      ),
    );
    assert.equal(audit.releaseEvidenceProgress.closeoutSummary.blockers >= 1, true);
    assert.equal(audit.releaseEvidenceProgress.closeoutGateSummary.length >= 1, true);
    const immutableGate = audit.releaseEvidenceProgress.closeoutGateSummary.find(
      (item) => item.id === "immutable-version",
    );
    assert.equal(typeof immutableGate.errorCount, "number");
    assert.equal(Array.isArray(immutableGate.sampleErrors), true);
    assert.equal(audit.releaseEvidenceProgress.nextActionCount >= 1, true);
    assert.match(audit.releaseEvidenceProgress.closeoutPlanCommand, /release-evidence-closeout-plan\.mjs/);
    assert.match(audit.releaseEvidenceProgress.closeoutPlanCommand, /--runtime-env-file server\/deploy\/compose\/prod\/\.env/);
    assert.match(audit.releaseEvidenceProgress.closeoutRunnerCommand, /release-evidence-closeout-runner\.mjs/);
    assert.match(audit.releaseEvidenceProgress.closeoutRunnerCommand, /--runtime-env-file server\/deploy\/compose\/prod\/\.env/);
    assert.equal(
      audit.releaseEvidenceProgress.closeoutRunnerReportPath,
      "output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json",
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutRunnerReportCommand,
      /release-evidence-closeout-runner\.mjs .*--json/,
    );
    assert.doesNotMatch(
      audit.releaseEvidenceProgress.closeoutRunnerReportCommand,
      /--execute|--report|<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutRunnerReportFileCommand,
      /release-evidence-closeout-runner\.mjs .*--report output\/release-evidence-closeout\/2026-06-29\/all-actions-runner-report\.json .*--json/,
    );
    assert.doesNotMatch(
      audit.releaseEvidenceProgress.closeoutRunnerReportFileCommand,
      /--execute|RELEASE_CLOSEOUT_CONFIRM|<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.equal(
      audit.releaseEvidenceProgress.closeoutRunnerReportWritesReleaseEvidence,
      false,
    );
    const allInputChecklist = audit.releaseEvidenceProgress.closeoutInputChecklist;
    assert.equal(allInputChecklist.reportOnly, true);
    assert.equal(allInputChecklist.writesReleaseEvidence, false);
    assert(
      allInputChecklist.missingInputIdsByKind.env.includes("SERVER_IMAGE"),
    );
    assert(
      allInputChecklist.missingInputIdsByKind.env.includes(
        "CUSTOMER_CONFIG_ADMIN_TOKEN",
      ),
    );
    assert(
      allInputChecklist.missingInputIdsByKind.file.includes("prod-env-file"),
    );
    assert(
      allInputChecklist.missingInputIdsByKind.manual.includes(
        "manual-release-signoff",
      ),
    );
    assert(
      allInputChecklist.missingInputEnvTemplate.includes(
        "SERVER_IMAGE='<server-image-ref>'",
      ),
    );
    assert(
      allInputChecklist.missingInputEnvTemplate.includes(
        "CUSTOMER_CONFIG_ADMIN_TOKEN='<redacted-admin-token>'",
      ),
    );
    assert(
      allInputChecklist.secretInputIds.includes("SOURCE_POSTGRES_DSN"),
    );
    assert(
      allInputChecklist.secretInputIds.includes(
        "CUSTOMER_CONFIG_ADMIN_TOKEN",
      ),
    );
    assert(
      allInputChecklist.secretInputIds.includes("prod-env-file"),
    );
    assert(
      allInputChecklist.actionIdsByInput.RELEASE_ENVIRONMENT.includes(
        "immutable-version",
      ),
    );
    assert(
      allInputChecklist.actionIdsByInput.RELEASE_ENVIRONMENT.includes(
        "target-smoke",
      ),
    );
    assert(
      allInputChecklist.actionIdsByInput["prod-env-file"].includes(
        "production-preflight",
      ),
    );
    assert(
      allInputChecklist.missingInputs.some(
        (item) =>
          item.id === "CUSTOMER_CONFIG_ADMIN_TOKEN" &&
          item.kind === "env" &&
          item.secret === true &&
          item.actionIds.includes("customer-config-effective-session"),
      ),
    );
    assert(
      allInputChecklist.operatorChecklist.some(
        (item) =>
          item.id === "CUSTOMER_CONFIG_ADMIN_TOKEN" &&
          item.secret === true &&
          item.evidenceTarget.includes("not stored") &&
          item.evidenceTarget.includes("sanitized pass/fail evidence"),
      ),
    );
    assert.equal(Array.isArray(allInputChecklist.collectionPlan), true);
    assert.equal(allInputChecklist.collectionPlan[0].actionId, "immutable-version");
    assert.equal(allInputChecklist.collectionPlan[0].actionState, "blocked");
    assert(
      allInputChecklist.collectionPlan[0].missingInputIds.includes(
        "SERVER_IMAGE_DIGEST",
      ),
    );
    const preflightCollection = allInputChecklist.collectionPlan.find(
      (item) => item.actionId === "production-preflight",
    );
    assert(
      preflightCollection.missingInputIdsByKind.file.includes("prod-env-file"),
    );
    assert(preflightCollection.secretInputIds.includes("prod-env-file"));
    assert.equal(preflightCollection.reportOnly, true);
    assert.equal(preflightCollection.writesReleaseEvidence, false);
    const smokeCollection = allInputChecklist.collectionPlan.find(
      (item) => item.actionId === "target-smoke",
    );
    assert(
      smokeCollection.missingInputIdsByKind.env.includes(
        "CUSTOMER_CONFIG_ADMIN_TOKEN",
      ),
    );
    assert(
      smokeCollection.secretInputIds.includes("CUSTOMER_CONFIG_ADMIN_TOKEN"),
    );
    assert.equal(Object.hasOwn(smokeCollection, "executeCommand"), false);
    assert.doesNotMatch(
      smokeCollection.runnerReportCommand,
      /<redacted-admin-token>|--execute|RELEASE_CLOSEOUT_CONFIRM/,
    );
    const signoffCollection = allInputChecklist.collectionPlan.find(
      (item) => item.actionId === "release-signoff",
    );
    assert.equal(signoffCollection.actionState, "manual");
    assert(
      signoffCollection.missingInputIdsByKind.manual.includes(
        "manual-release-signoff",
      ),
    );
    assert.equal(Object.hasOwn(signoffCollection, "executeCommand"), false);
    assert.match(
      audit.releaseEvidenceProgress.priorityAuditCommands.json,
      /multi-client-role-workflow-priority-audit\.mjs .*--json/,
    );
    assert.match(
      audit.releaseEvidenceProgress.priorityAuditCommands.releaseGate,
      /--fail-on-release-not-ready/,
    );
    assert.match(
      audit.releaseEvidenceProgress.priorityAuditCommands.completionGate,
      /--fail-on-completion-not-ready/,
    );
    assert.equal(Array.isArray(audit.releaseEvidenceProgress.closeoutActionQueue), true);
    assert.equal(audit.releaseEvidenceProgress.closeoutActionQueue.length >= 7, true);
    assert.equal(audit.releaseEvidenceProgress.closeoutPlanSummary.blocked >= 1, true);
    assert.equal(audit.releaseEvidenceProgress.closeoutPlanSummary.manualOnly >= 1, true);
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.blockedActionIds.includes(
        "immutable-version",
      ),
    );
    assert.equal(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.id,
      "immutable-version",
    );
    assert.equal(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.title,
      "不可变版本证据",
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.commands.some(
        (command) => command.includes("immutable-version-evidence.mjs"),
      ),
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.manualChecks.some(
        (check) => check.includes("same release batch"),
      ),
    );
    assert.equal(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.gateSummary.errorCount >= 1,
      true,
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.gateSummary.sampleErrors.join("\n"),
      /release-evidence\.md|image-digests\.txt/,
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.missingPrerequisiteIds.includes(
        "SERVER_IMAGE",
      ),
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.missingPrerequisiteIds.includes(
        "MIGRATION_BEFORE",
      ),
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.missingPrerequisites.some(
        (check) => check.id === "SERVER_IMAGE" && check.kind === "env",
      ),
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.requiredEnvExports.includes(
        "SERVER_IMAGE='<server-image-ref>'",
      ),
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.operatorChecklist.some(
        (item) =>
          item.id === "MIGRATION_BEFORE" &&
          item.status === "missing" &&
          item.evidenceTarget.includes("migrationBefore"),
      ),
    );
    assert(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.requiredEnvExports.includes(
        "MIGRATION_BEFORE='<migration-before>'",
      ),
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.closeoutRunnerReportCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--json/,
    );
    assert.doesNotMatch(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.closeoutRunnerReportCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.equal(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.closeoutRunnerReportPath,
      immutableRunnerReportPath,
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.closeoutRunnerReportFileCommand,
      /release-evidence-closeout-runner\.mjs .*--only immutable-version .*--report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json .*--json/,
    );
    assert.doesNotMatch(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.closeoutRunnerReportFileCommand,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.inputTemplateCommand,
      /immutable-version-evidence\.mjs .*--print-input-template/,
    );
    assert.match(
      audit.releaseEvidenceProgress.closeoutPlanSummary.firstBlockedAction.closeoutRunnerExecuteCommand,
      /RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--execute/,
    );
    const preflightAction = audit.releaseEvidenceProgress.closeoutActionQueue.find(
      (action) => action.id === "production-preflight",
    );
    assert.equal(preflightAction.state, "blocked");
    assert.equal(preflightAction.gateSummary.errorCount >= 1, true);
    assert(
      preflightAction.missingPrerequisites.some(
        (check) => check.id === "prod-env-file" && check.kind === "file",
      ),
    );
    assert.match(
      preflightAction.closeoutRunnerReportCommand,
      /release-evidence-closeout-runner\.mjs .*--only production-preflight .*--json/,
    );
    const signoffAction = audit.releaseEvidenceProgress.closeoutActionQueue.find(
      (action) => action.id === "release-signoff",
    );
    assert.equal(signoffAction.state, "manual");
    assert.equal(signoffAction.closeoutRunnerExecuteCommand, "");
    const effectiveSessionAction = audit.releaseEvidenceProgress.closeoutActionQueue.find(
      (action) => action.id === "customer-config-effective-session",
    );
    assert.equal(effectiveSessionAction.state, "blocked");
    assert(
      effectiveSessionAction.requiredEnvExports.includes(
        "CUSTOMER_CONFIG_ADMIN_TOKEN='<redacted-admin-token>'",
      ),
    );
    assert.equal(
      effectiveSessionAction.missingPrerequisiteIds.filter(
        (id) => id === "RELEASE_VERSION",
      ).length,
      0,
    );
    assert.equal(
      effectiveSessionAction.requiredEnvExports.filter(
        (item) => item.startsWith("RELEASE_VERSION="),
      ).length,
      0,
    );
    assert.equal(
      effectiveSessionAction.resolvedInputs.RELEASE_VERSION.source,
      "release-evidence.md",
    );
    assert(
      audit.releaseEvidenceProgress.nextActions.every(
        (action) => typeof action.title === "string" && action.title.length > 0,
      ),
    );
    assert(
      audit.releaseEvidenceProgress.nextActions.some(
        (action) => action.id === "production-preflight" || action.id === "target-smoke",
      ),
    );
  }
  assert(
    audit.checks.some((check) => check.id === "domain-command-entry-remains-guarded"),
  );
  const breakGlassCheck = audit.checks.find(
    (check) => check.id === "super-admin-break-glass-controlled-runtime",
  );
  assert.equal(breakGlassCheck.status, "ready");
  assert.equal(breakGlassCheck.pass, true);
  assert(
    breakGlassCheck.evidence.includes(
      "server/internal/service/jsonrpc_workflow_test.go",
    ),
  );
  const runtimeSchemaCheck = audit.checks.find(
    (check) => check.id === "customer-config-runtime-schema",
  );
  assert.equal(runtimeSchemaCheck.status, "ready");
  assert(
    runtimeSchemaCheck.evidence.includes(
      "server/internal/data/model/schema/customer_config_revision.go",
    ),
  );
  assert(
    runtimeSchemaCheck.evidence.includes(
      "server/internal/data/model/migrate/*.sql",
    ),
  );
  const usecaseRepoApiCheck = audit.checks.find(
    (check) => check.id === "customer-config-usecase-repo-api-rbac",
  );
  assert.equal(usecaseRepoApiCheck.status, "ready");
  assert(
    usecaseRepoApiCheck.evidence.includes(
      "server/internal/biz/customer_config.go",
    ),
  );
  assert(
    usecaseRepoApiCheck.evidence.includes(
      "server/internal/service/jsonrpc_customer_config_test.go",
    ),
  );
  const frontendProjectionCheck = audit.checks.find(
    (check) => check.id === "customer-config-frontend-projection",
  );
  assert.equal(frontendProjectionCheck.status, "ready");
  assert(
    frontendProjectionCheck.evidence.includes(
      "scripts/qa/formal-frontend-customer-config-boundary.test.mjs",
    ),
  );
  assert(
    frontendProjectionCheck.evidence.includes(
      "web/scripts/style-l1/scenarios.mjs",
    ),
  );
  const releaseEvidenceCheck = audit.checks.find(
    (check) => check.id === "release-evidence-target-remains-evidence-required",
  );
  assert.equal(releaseEvidenceCheck.status, "evidence-required");
  assert.equal(releaseEvidenceCheck.pass, true);
  assert(
    releaseEvidenceCheck.evidence.includes("scripts/deploy/release-evidence-status.mjs"),
  );
  const preflightFastGateCheck = audit.checks.find(
    (check) => check.id === "release-preflight-fast-gate",
  );
  assert.equal(preflightFastGateCheck.status, "ready");
  assert(
    preflightFastGateCheck.evidence.includes(
      "scripts/deploy/production-preflight.test.mjs",
    ),
  );
});

test("multi-client role workflow priority audit keeps runner reports outside release evidence", () => {
  const audit = runPriorityAudit();

  assertRunnerReportPathOutsideEvidence(
    audit.releaseEvidenceProgress.closeoutRunnerReportPath,
  );
  assertReportCommandPathOutsideEvidence(
    audit.releaseEvidenceProgress.closeoutRunnerReportFileCommand,
  );
  assert.equal(
    audit.releaseEvidenceProgress.closeoutRunnerReportWritesReleaseEvidence,
    false,
  );

  for (const action of audit.releaseEvidenceProgress.closeoutActionQueue) {
    assertRunnerReportPathOutsideEvidence(action.closeoutRunnerReportPath);
    assertReportCommandPathOutsideEvidence(action.closeoutRunnerReportFileCommand);
  }

  const p5Phase = audit.implementationOrder.find(
    (phase) => phase.id === "p5-release-import-second-customer",
  );
  if (p5Phase.nextAction) {
    assertRunnerReportPathOutsideEvidence(
      p5Phase.nextAction.inputChecklist.nextRunnerReportPath,
    );
    assertReportCommandPathOutsideEvidence(p5Phase.nextAction.reportFileCommand);
    assert.equal(p5Phase.nextAction.reportOnlyWritesReleaseEvidence, false);
  }

  for (const item of audit.releaseEvidenceProgress.closeoutInputChecklist
    .collectionPlan) {
    assertRunnerReportPathOutsideEvidence(item.runnerReportPath);
    assert.equal(item.writesReleaseEvidence, false);
  }
});

test("multi-client role workflow priority audit CLI supports JSON output", () => {
  const result = spawnAudit(["--json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.releaseReady, payload.releaseEvidenceProgress.ready);
  assert.equal(payload.source, "docs/product/多甲方角色能力流程编排优先级.md");
  assert.equal(payload.scope.readOnly, true);
  assert.equal(payload.scope.executableEvidenceOnly, true);
  assert.equal(payload.releaseEvidenceProgress.evidenceDir, "deployments/yoyoosun/evidence/releases/2026-06-29");
  assert.equal(payload.releaseEvidenceProgress.runtimeEnvFile, "server/deploy/compose/prod/.env");
  assert.equal(payload.completionAudit.canUsePriorityAsExecutionQueue, true);
  assert.equal(payload.implementationOrder.length, 6);
  assert.equal(
    payload.implementationOrder.at(-1).id,
    "p5-release-import-second-customer",
  );
  if (!payload.releaseEvidenceProgress.ready) {
    assert.equal(
      payload.implementationOrder.at(-1).state,
      "target-evidence-required",
    );
    assert.equal(
      payload.implementationOrder.at(-1).nextAction.actionId,
      "immutable-version",
    );
  }
  assert.equal(
    payload.completionAudit.canCompleteLocally,
    payload.releaseEvidenceProgress.ready &&
      payload.completionAudit.localGuardedRequirementIds.length === 0,
  );
  assert.equal(typeof payload.completionAudit.blockingCategory, "string");
  assert.equal(
    payload.completionAudit.blockingCategory,
    payload.releaseEvidenceProgress.ready
      ? "none"
      : "external-release-evidence-required",
  );
  assert.equal(Array.isArray(payload.completionAudit.remainingPrerequisites), true);
  assert.equal(typeof payload.completionAudit.remainingPrerequisitesByKind, "object");
  assert.equal(typeof payload.completionAudit.gateErrorTotals.errors, "number");
  assert.equal(payload.referenceCoverage.length, 31);
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "second-customer-responsibility-difference",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "module-disabled-readonly-gate",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "p4-finished-goods-remaining-domain-handlers",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "super-admin-break-glass-governance",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "workflow-task-runtime-anchors",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-minimum",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "workflow-task-process-link",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-linked-human-task",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-start-first-node",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-linked-task-completion",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "workflow-complete-action-process-runtime-completion",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-sequential-next-node",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-named-policy-branch",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-fan-out-join",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-return-to-attempt",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-blocked-due-at",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-domain-command-handler",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "p4-finished-goods-shipment-finance-contract-preflight",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "p4-finished-goods-delivery-definition-evidence",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-wait-event-wakeup",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "process-runtime-end-node-completion",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "workflow-task-configured-candidates",
    ),
  );
  assert(
    payload.completionAudit.localReadyRequirementIds.includes(
      "domain-command-entry-preflight",
    ),
  );
  assert(
    payload.referenceCoverage.some(
      (item) =>
        item.id === "release-preflight-target-evidence" &&
        item.releaseActionIds.includes("target-smoke"),
    ),
  );
  assert.equal(typeof payload.releaseEvidenceProgress.ready, "boolean");
  if (!payload.releaseEvidenceProgress.ready) {
    assert.equal(payload.releaseEvidenceProgress.nextActionCount >= 1, true);
    assert.equal(payload.releaseEvidenceProgress.closeoutPlanSummary.blocked >= 1, true);
  }
  assert.match(payload.releaseEvidenceProgress.closeoutPlanCommand, /release-evidence-closeout-plan\.mjs/);
  assert.match(payload.releaseEvidenceProgress.closeoutRunnerCommand, /release-evidence-closeout-runner\.mjs/);
  assert.match(
    payload.releaseEvidenceProgress.priorityAuditCommands.json,
    /multi-client-role-workflow-priority-audit\.mjs .*--json/,
  );
  assert.match(
    payload.releaseEvidenceProgress.priorityAuditCommands.releaseGate,
    /--fail-on-release-not-ready/,
  );
  assert.match(
    payload.releaseEvidenceProgress.priorityAuditCommands.completionGate,
    /--fail-on-completion-not-ready/,
  );
  assert.equal(Array.isArray(payload.releaseEvidenceProgress.closeoutGateSummary), true);
  assert(
    payload.scope.notProvenByThisAudit.includes(
      "customer config revision was activated or rolled back on the target environment",
    ),
  );
  assert.equal(payload.checks.every((check) => check.pass), true);

  const textResult = spawnAudit([]);

  assert.equal(textResult.status, 0, textResult.stderr);
  assert.match(textResult.stdout, /ready means: priority document items/);
  assert.match(textResult.stdout, /completion audit: (ready|guarded|target-evidence-required), canCompleteLocally=(true|false)/);
  assert.match(textResult.stdout, /reference coverage:/);
  assert.match(textResult.stdout, /runtime-schema-migration: ready \(local=ready, target=not-applicable/);
  assert.match(textResult.stdout, /super-admin-break-glass-governance: ready \(local=ready, target=not-applicable/);
  assert.match(textResult.stdout, /frontend-effective-session-projection: evidence-required \(local=ready, target=evidence-required|frontend-effective-session-projection: ready \(local=ready, target=ready/);
  assert.match(textResult.stdout, /release-preflight-target-evidence: evidence-required \(local=evidence-required, target=evidence-required|release-preflight-target-evidence: ready \(local=evidence-required, target=ready/);
  assert.match(textResult.stdout, /release evidence: .+, ready=(true|false), blockers=/);
  assert.match(textResult.stdout, /local guarded: none/);
  if (!payload.releaseEvidenceProgress.ready) {
    assert.match(textResult.stdout, /remaining priority work:/);
    assert.match(textResult.stdout, /target evidence required: .*release-preflight-target-evidence/);
    assert.match(textResult.stdout, /remaining release actions: .*immutable-version/);
    assert.match(textResult.stdout, /first blocked release action: immutable-version/);
    assert.match(textResult.stdout, /first blocked resolved inputs: .*RELEASE_VERSION/);
    assert.match(textResult.stdout, /first blocked env: .*SERVER_IMAGE='<server-image-ref>'/);
    assert.match(textResult.stdout, /first blocked gate: errors=\d+, warnings=\d+/);
    assert.match(textResult.stdout, /first blocked input template: .*immutable-version-evidence\.mjs .*--print-input-template/);
    assert.match(
      textResult.stdout,
      /first blocked runner report path: output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json/,
    );
    assert.match(textResult.stdout, /first blocked runner report: .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--json/);
    assert.match(
      textResult.stdout,
      /first blocked runner report file: .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json .*--json/,
    );
    assert.match(textResult.stdout, /first blocked runner execute: .*RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--execute/);
    assert.match(textResult.stdout, /blocking category: external-release-evidence-required/);
    assert.match(textResult.stdout, /blocking reason: real target release evidence is still missing or unverified/);
    assert.match(textResult.stdout, /next input checklist action: immutable-version \(blocked\)/);
    assert.match(textResult.stdout, /next resolved inputs: .*RELEASE_VERSION/);
    assert.match(textResult.stdout, /next missing inputs: .*SERVER_IMAGE/);
    assert.match(textResult.stdout, /next missing env: .*SERVER_IMAGE/);
    assert.match(textResult.stdout, /next env template: .*SERVER_IMAGE='<server-image-ref>'/);
    assert.match(textResult.stdout, /next operator checklist:/);
    assert.match(textResult.stdout, /SERVER_IMAGE: missing; source=server image reference produced by the release build/);
    assert.match(textResult.stdout, /RELEASE_VERSION: resolved; source=release batch id chosen for this target deployment/);
    assert.match(textResult.stdout, /next input template: .*immutable-version-evidence\.mjs .*--print-input-template/);
    assert.match(
      textResult.stdout,
      /next runner report path: output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json/,
    );
    assert.match(textResult.stdout, /next runner report: .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--json/);
    assert.match(
      textResult.stdout,
      /next runner report file: .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json .*--json/,
    );
    assert.match(textResult.stdout, /next runner execute: .*RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT .*release-evidence-closeout-runner\.mjs .*--only immutable-version .*--execute/);
    assert.match(textResult.stdout, /external prerequisites: .*SERVER_IMAGE/);
    assert.match(textResult.stdout, /env prerequisites: .*SERVER_IMAGE/);
    assert.match(textResult.stdout, /file prerequisites: .*prod-env-file/);
    assert.match(textResult.stdout, /manual prerequisites: .*manual-release-signoff/);
    assert.match(textResult.stdout, /gate errors: \d+, warnings=\d+/);
    assert.match(textResult.stdout, /first unverified gate group: immutable-version/);
    assert.match(textResult.stdout, /first gate error: release-evidence\.md|first gate error: image-digests\.txt/);
    assert.match(textResult.stdout, /release evidence gate summary:/);
    assert.match(textResult.stdout, /immutable-version: errors=\d+, warnings=\d+/);
    assert.match(textResult.stdout, /release evidence next actions:/);
    assert.doesNotMatch(textResult.stdout, /undefined/);
    assert.match(textResult.stdout, /release evidence closeout plan:/);
    assert.match(textResult.stdout, /release-evidence-closeout-plan\.mjs --evidence-dir/);
    assert.match(textResult.stdout, /release evidence closeout runner:/);
    assert.match(textResult.stdout, /release-evidence-closeout-runner\.mjs --evidence-dir/);
    assert.match(
      textResult.stdout,
      /all actions runner report path: output\/release-evidence-closeout\/2026-06-29\/all-actions-runner-report\.json/,
    );
    assert.match(
      textResult.stdout,
      /all actions runner report: node scripts\/deploy\/release-evidence-closeout-runner\.mjs .*--json/,
    );
    assert.doesNotMatch(textResult.stdout, /all actions runner report: .*<target-environment>/);
    assert.match(
      textResult.stdout,
      /all actions runner report file: node scripts\/deploy\/release-evidence-closeout-runner\.mjs .*--report output\/release-evidence-closeout\/2026-06-29\/all-actions-runner-report\.json .*--json/,
    );
    assert.doesNotMatch(textResult.stdout, /all actions runner report file: .*<target-environment>/);
    assert.match(
      textResult.stdout,
      /all actions runner report writes release evidence: false/,
    );
    assert.match(textResult.stdout, /release closeout input checklist:/);
    assert.match(textResult.stdout, /missing env inputs: .*SERVER_IMAGE/);
    assert.match(textResult.stdout, /missing env inputs: .*CUSTOMER_CONFIG_ADMIN_TOKEN/);
    assert.match(textResult.stdout, /missing file inputs: .*prod-env-file/);
    assert.match(textResult.stdout, /missing manual inputs: .*manual-release-signoff/);
    assert.match(textResult.stdout, /input env template: .*SERVER_IMAGE='<server-image-ref>'/);
    assert.match(textResult.stdout, /input env template: .*CUSTOMER_CONFIG_ADMIN_TOKEN='<redacted-admin-token>'/);
    assert.match(textResult.stdout, /secret inputs: .*SOURCE_POSTGRES_DSN.*CUSTOMER_CONFIG_ADMIN_TOKEN/);
    assert.match(textResult.stdout, /collection plan by action:/);
    assert.match(textResult.stdout, /1\. immutable-version: blocked; inputs=.*SERVER_IMAGE_DIGEST/);
    assert.match(textResult.stdout, /2\. production-preflight: blocked; inputs=prod-env-file; secret=prod-env-file/);
    assert.match(textResult.stdout, /4\. target-smoke: blocked; inputs=.*CUSTOMER_CONFIG_ADMIN_TOKEN.*secret=CUSTOMER_CONFIG_ADMIN_TOKEN/);
    assert.match(textResult.stdout, /6\. release-signoff: manual; inputs=manual-release-signoff; secret=none/);
    assert.match(textResult.stdout, /report-only: true/);
    assert.match(textResult.stdout, /writes release evidence: false/);
    assert.match(textResult.stdout, /priority audit gate commands:/);
    assert.match(textResult.stdout, /json: node scripts\/qa\/multi-client-role-workflow-priority-audit\.mjs .*--json/);
    assert.match(textResult.stdout, /release gate: node scripts\/qa\/multi-client-role-workflow-priority-audit\.mjs .*--fail-on-release-not-ready/);
    assert.match(textResult.stdout, /completion gate: node scripts\/qa\/multi-client-role-workflow-priority-audit\.mjs .*--fail-on-completion-not-ready/);
    assert.match(textResult.stdout, /summary: runnable=\d+, blocked=\d+, manualOnly=\d+/);
    assert.match(textResult.stdout, /action queue:/);
    assert.match(textResult.stdout, /1\. immutable-version: blocked/);
    assert.match(textResult.stdout, /6\. release-signoff: manual/);
    assert.match(textResult.stdout, /first blocked: immutable-version/);
    assert.match(textResult.stdout, /first command: node scripts\/deploy\/immutable-version-evidence\.mjs/);
    assert.match(textResult.stdout, /first env: RELEASE_ENVIRONMENT='<target-environment>'/);
    assert.match(textResult.stdout, /first operator input: RELEASE_ENVIRONMENT -> approved target environment name/);
    assert.match(textResult.stdout, /first input template: node scripts\/deploy\/immutable-version-evidence\.mjs .*--print-input-template/);
    assert.match(
      textResult.stdout,
      /first runner report path: output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json/,
    );
    assert.match(textResult.stdout, /first runner report: node scripts\/deploy\/release-evidence-closeout-runner\.mjs/);
    assert.doesNotMatch(textResult.stdout, /first runner report: .*<target-environment>/);
    assert.match(
      textResult.stdout,
      /first runner report file: node scripts\/deploy\/release-evidence-closeout-runner\.mjs .*--report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json/,
    );
    assert.doesNotMatch(textResult.stdout, /first runner report file: .*<target-environment>/);
    assert.match(textResult.stdout, /first runner execute: RELEASE_ENVIRONMENT='<target-environment>'.*RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT/);
  }
  assert.match(textResult.stdout, /not proven by this audit:/);
  assert.match(textResult.stdout, /target environment release was executed/);
});

test("multi-client role workflow priority audit supports custom release evidence dir", () => {
  const customDir = "deployments/yoyoosun/evidence/releases/not-created-yet";
  const audit = runPriorityAudit({
    releaseEvidenceDir: customDir,
    runtimeEnvFile: "server/deploy/compose/prod/.env.custom",
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.releaseEvidenceProgress.evidenceDir, customDir);
  assert.equal(audit.releaseEvidenceProgress.runtimeEnvFile, "server/deploy/compose/prod/.env.custom");
  assert.equal(audit.releaseEvidenceProgress.status, "missing");
  assert.equal(audit.releaseEvidenceProgress.ready, false);
  assert.equal(audit.completionAudit.state, "target-evidence-required");
  assert.equal(audit.completionAudit.canCompleteLocally, false);
  assert.equal(audit.completionAudit.firstUnverifiedGateGroup, null);
  assert.equal(audit.completionAudit.gateErrorTotals.errors, 0);
  assert(
    audit.completionAudit.remainingPrerequisitesByKind.file.includes(
      "evidence-dir",
    ),
  );
  assert(
    audit.completionAudit.remainingReleaseActionIds.includes(
      "immutable-version",
    ),
  );
  assert.equal(audit.releaseEvidenceProgress.closeoutSummary.blockers >= 1, true);
  assert.match(audit.releaseEvidenceProgress.closeoutPlanCommand, /server\/deploy\/compose\/prod\/\.env\.custom/);
  assert.match(audit.releaseEvidenceProgress.closeoutRunnerCommand, /server\/deploy\/compose\/prod\/\.env\.custom/);
  assert.match(audit.releaseEvidenceProgress.priorityAuditCommands.json, /server\/deploy\/compose\/prod\/\.env\.custom/);
  assert.match(audit.releaseEvidenceProgress.priorityAuditCommands.releaseGate, /not-created-yet/);
  assert.match(audit.releaseEvidenceProgress.priorityAuditCommands.completionGate, /--fail-on-completion-not-ready/);

  const cliResult = spawnAudit([
    "--json",
    "--release-evidence-dir",
    customDir,
    "--runtime-env-file",
    "server/deploy/compose/prod/.env.custom",
  ]);

  assert.equal(cliResult.status, 0, cliResult.stderr);
  const payload = JSON.parse(cliResult.stdout);
  assert.equal(payload.releaseEvidenceProgress.evidenceDir, customDir);
  assert.equal(payload.releaseEvidenceProgress.runtimeEnvFile, "server/deploy/compose/prod/.env.custom");
  assert.equal(payload.releaseEvidenceProgress.status, "missing");
  assert.equal(payload.completionAudit.canCompleteLocally, false);

  const inlineResult = spawnAudit([
    `--release-evidence-dir=${customDir}`,
    "--runtime-env-file=server/deploy/compose/prod/.env.custom",
  ]);

  assert.equal(inlineResult.status, 0, inlineResult.stderr);
  assert.match(inlineResult.stdout, /release evidence: missing, ready=false, blockers=/);
  assert.match(inlineResult.stdout, /--runtime-env-file server\/deploy\/compose\/prod\/\.env\.custom/);
});

test("multi-client role workflow priority audit can fail when release evidence is not ready", () => {
  const customDir = "deployments/yoyoosun/evidence/releases/not-created-yet";
  const result = spawnAudit([
    "--json",
    "--release-evidence-dir",
    customDir,
    "--fail-on-release-not-ready",
  ]);

  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.releaseReady, false);
  assert.equal(payload.releaseEvidenceProgress.status, "missing");
  assert.equal(payload.releaseEvidenceProgress.ready, false);
  assert.equal(payload.completionAudit.state, "target-evidence-required");
  assert.equal(payload.releaseEvidenceProgress.closeoutPlanSummary.blocked >= 1, true);
});

test("multi-client role workflow priority audit fails default release gate while target evidence is missing", () => {
  const result = spawnAudit(["--json", "--fail-on-release-not-ready"]);

  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.releaseReady, false);
  assert.equal(
    payload.releaseEvidenceProgress.evidenceDir,
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  );
  assert.equal(payload.releaseEvidenceProgress.ready, false);
  assert.equal(payload.releaseEvidenceProgress.closeoutPlanSummary.blocked >= 1, true);
  assert.equal(
    payload.releaseEvidenceProgress.closeoutInputChecklist.reportOnly,
    true,
  );
  assert.equal(
    payload.releaseEvidenceProgress.closeoutInputChecklist.writesReleaseEvidence,
    false,
  );
  assert(
    payload.releaseEvidenceProgress.closeoutInputChecklist.missingInputIds.includes(
      "SERVER_IMAGE_DIGEST",
    ),
  );
  assert.equal(
    payload.releaseEvidenceProgress.closeoutInputChecklist.collectionPlan[0].actionId,
    "immutable-version",
  );
});

test("multi-client role workflow priority audit can fail when completion is not ready", () => {
  const customDir = "deployments/yoyoosun/evidence/releases/not-created-yet";
  const result = spawnAudit([
    "--json",
    "--release-evidence-dir",
    customDir,
    "--fail-on-completion-not-ready",
  ]);

  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.releaseReady, false);
  assert.equal(payload.completionAudit.canCompleteLocally, false);
  assert.equal(payload.completionAudit.state, "target-evidence-required");
  assert.equal(
    payload.completionAudit.blockingCategory,
    "external-release-evidence-required",
  );
  assert.equal(
    payload.completionAudit.firstBlockedInputChecklist.actionId,
    "immutable-version",
  );
  assert(
    payload.completionAudit.remainingReleaseActionIds.includes(
      "immutable-version",
    ),
  );
});

test("multi-client role workflow priority audit fails default completion gate while P5 target evidence is missing", () => {
  const result = spawnAudit(["--json", "--fail-on-completion-not-ready"]);

  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.releaseReady, false);
  assert.equal(payload.completionAudit.canCompleteLocally, false);
  assert.equal(payload.completionAudit.state, "target-evidence-required");
  assert.equal(
    payload.completionAudit.blockingCategory,
    "external-release-evidence-required",
  );
  assert.equal(
    payload.implementationOrder.find(
      (item) => item.id === "p5-release-import-second-customer",
    ).state,
    "target-evidence-required",
  );
  assert.equal(
    payload.completionAudit.firstBlockedInputChecklist.actionId,
    "immutable-version",
  );
  assert(
    payload.completionAudit.remainingReleaseActionIds.includes(
      "immutable-version",
    ),
  );
  assert.equal(
    payload.releaseEvidenceProgress.closeoutInputChecklist.collectionPlan.length,
    7,
  );
  assert.equal(
    payload.releaseEvidenceProgress.closeoutInputChecklist.writesReleaseEvidence,
    false,
  );
  assert(
    payload.completionAudit.guidance.includes(
      "do not mark the reference implementation complete until releaseReady=true",
    ),
  );
});

test("multi-client role workflow priority audit can emit input checklist JSON only", () => {
  const result = spawnAudit(["--input-checklist-json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.readOnly, true);
  assert.equal(payload.releaseReady, false);
  assert.equal(payload.completionState, "target-evidence-required");
  assert.equal(
    payload.blockingCategory,
    "external-release-evidence-required",
  );
  assert.equal(
    payload.evidenceDir,
    "deployments/yoyoosun/evidence/releases/2026-06-29",
  );
  assert.equal(payload.runtimeEnvFile, "server/deploy/compose/prod/.env");
  assert.equal(
    Array.isArray(payload.closeoutInputChecklist.missingInputs),
    true,
  );
  assert(
    payload.closeoutInputChecklist.missingInputIdsByKind.env.includes(
      "SERVER_IMAGE",
    ),
  );
  assert(
    payload.closeoutInputChecklist.missingInputIdsByKind.file.includes(
      "prod-env-file",
    ),
  );
  assert(
    payload.closeoutInputChecklist.missingInputIdsByKind.manual.includes(
      "manual-release-signoff",
    ),
  );
  assert(
    payload.closeoutInputChecklist.secretInputIds.includes(
      "CUSTOMER_CONFIG_ADMIN_TOKEN",
    ),
  );
  assert(
    payload.closeoutInputChecklist.secretInputIds.includes(
      "SOURCE_POSTGRES_DSN",
    ),
  );
  assert(
    payload.closeoutInputChecklist.missingInputEnvTemplate.includes(
      "SOURCE_POSTGRES_DSN='<redacted-source-postgres-dsn>'",
    ),
  );
  assert(
    payload.closeoutInputChecklist.missingInputEnvTemplate.includes(
      "CUSTOMER_CONFIG_ADMIN_TOKEN='<redacted-admin-token>'",
    ),
  );
  const serverDigestMissingInput =
    payload.closeoutInputChecklist.missingInputs.find(
      (item) => item.id === "SERVER_IMAGE_DIGEST",
    );
  assert.equal(serverDigestMissingInput.status, "missing");
  assert.match(
    serverDigestMissingInput.sourceHint,
    /server image digest from the registry or build output/,
  );
  assert.match(
    serverDigestMissingInput.evidenceTarget,
    /release-evidence\.md field serverImageDigest/,
  );
  assert.match(serverDigestMissingInput.validation, /sha256:<64-hex>/);
  const sourcePostgresMissingInput =
    payload.closeoutInputChecklist.missingInputs.find(
      (item) => item.id === "SOURCE_POSTGRES_DSN",
    );
  assert.equal(sourcePostgresMissingInput.secret, true);
  assert.equal(sourcePostgresMissingInput.status, "missing");
  assert.match(
    sourcePostgresMissingInput.sourceHint,
    /secure operator shell or secret manager/,
  );
  assert.match(sourcePostgresMissingInput.evidenceTarget, /not stored/);
  assert.match(
    sourcePostgresMissingInput.validation,
    /backup restore rehearsal/,
  );
  assert.equal(payload.closeoutInputChecklist.reportOnly, true);
  assert.equal(payload.closeoutInputChecklist.writesReleaseEvidence, false);
  assert.equal(
    Array.isArray(payload.closeoutInputChecklist.collectionPlan),
    true,
  );
  assert.equal(
    Array.isArray(payload.closeoutInputChecklist.collectionGroups),
    true,
  );
  assert.equal(payload.closeoutInputChecklist.collectionPlan.length, 7);
  assert.equal(payload.closeoutInputChecklist.collectionGroups.length, 7);
  const releaseBuildGroup =
    payload.closeoutInputChecklist.collectionGroups.find(
      (item) => item.id === "release-build-version-owner",
    );
  assert.deepEqual(releaseBuildGroup.actionIds, ["immutable-version"]);
  assert(
    releaseBuildGroup.missingInputIds.includes("SERVER_IMAGE_DIGEST"),
  );
  assert.equal(releaseBuildGroup.secretInputIds.length, 0);
  const targetSmokeGroup =
    payload.closeoutInputChecklist.collectionGroups.find(
      (item) => item.id === "target-smoke-operator",
    );
  assert.deepEqual(targetSmokeGroup.actionIds, ["target-smoke"]);
  assert(
    targetSmokeGroup.missingInputIds.includes("SMOKE_ENDPOINT"),
  );
  assert(
    targetSmokeGroup.missingInputIds.includes("CUSTOMER_CONFIG_ADMIN_TOKEN"),
  );
  assert.deepEqual(targetSmokeGroup.secretInputIds, [
    "CUSTOMER_CONFIG_ADMIN_TOKEN",
  ]);
  assert.equal(targetSmokeGroup.reportOnly, true);
  assert.equal(targetSmokeGroup.writesReleaseEvidence, false);
  const customerConfigReadbackGroup =
    payload.closeoutInputChecklist.collectionGroups.find(
      (item) => item.id === "customer-config-readback-operator",
    );
  assert.deepEqual(customerConfigReadbackGroup.actionIds, [
    "customer-config-effective-session",
  ]);
  assert(
    customerConfigReadbackGroup.missingInputIds.includes(
      "CUSTOMER_CONFIG_ADMIN_TOKEN",
    ),
  );
  assert(
    customerConfigReadbackGroup.missingInputIds.includes(
      "ROLLBACK_TARGET_RELEASE",
    ),
  );
  assert.deepEqual(customerConfigReadbackGroup.secretInputIds, [
    "CUSTOMER_CONFIG_ADMIN_TOKEN",
  ]);
  assert.equal(customerConfigReadbackGroup.reportOnly, true);
  assert.equal(customerConfigReadbackGroup.writesReleaseEvidence, false);
  for (const item of payload.closeoutInputChecklist.collectionGroups) {
    assert.equal(item.reportOnly, true);
    assert.equal(item.writesReleaseEvidence, false);
    assert.equal(Object.hasOwn(item, "executeCommand"), false);
    for (const reportPath of item.runnerReportPaths) {
      assertRunnerReportPathOutsideEvidence(reportPath);
    }
  }
  for (const item of payload.closeoutInputChecklist.collectionPlan) {
    assert.equal(item.reportOnly, true);
    assert.equal(item.writesReleaseEvidence, false);
    assert.equal(Array.isArray(item.missingInputs), true);
    assert.deepEqual(
      item.missingInputs.map((input) => input.id),
      item.missingInputIds,
    );
    for (const input of item.missingInputs) {
      assert.equal(input.status, "missing");
      assert.equal(Array.isArray(input.actionIds), true);
      assert.equal(input.actionIds.includes(item.actionId), true);
      assert.equal(typeof input.sourceHint, "string");
      assert.equal(typeof input.evidenceTarget, "string");
      assert.equal(typeof input.validation, "string");
    }
    assertRunnerReportPathOutsideEvidence(item.runnerReportPath);
    assertReportFileCommandIsReportOnly(
      item.runnerReportFileCommand,
      item.actionId,
    );
    assert.doesNotMatch(item.runnerReportCommand, /--report|--execute/);
    assert.doesNotMatch(
      item.runnerReportCommand,
      /RELEASE_CLOSEOUT_CONFIRM|<target-[^>]+>|<redacted-[^>]+>/,
    );
    assert.equal(Object.hasOwn(item, "executeCommand"), false);
  }
  assert.equal(
    payload.closeoutInputChecklist.collectionPlan[0].actionId,
    "immutable-version",
  );
  assert.equal(
    payload.closeoutInputChecklist.collectionPlan[0].actionState,
    "blocked",
  );
  const immutableServerDigestInput =
    payload.closeoutInputChecklist.collectionPlan[0].missingInputs.find(
      (item) => item.id === "SERVER_IMAGE_DIGEST",
    );
  assert.match(
    immutableServerDigestInput.sourceHint,
    /server image digest from the registry or build output/,
  );
  assert.match(
    immutableServerDigestInput.evidenceTarget,
    /release-evidence\.md field serverImageDigest/,
  );
  assert.match(immutableServerDigestInput.validation, /sha256:<64-hex>/);
  const signoffPlan = payload.closeoutInputChecklist.collectionPlan.find(
    (item) => item.actionId === "release-signoff",
  );
  assert.equal(signoffPlan.actionState, "manual");
  assert.equal(Object.hasOwn(signoffPlan, "executeCommand"), false);
  assert.equal(signoffPlan.reportOnly, true);
  assert.equal(signoffPlan.writesReleaseEvidence, false);
  assert(
    signoffPlan.missingInputIdsByKind.manual.includes(
      "manual-release-signoff",
    ),
  );
  assert.match(
    signoffPlan.operatorChecklist[0].validation,
    /manual approval cannot be generated by runner/,
  );
  const signoffManualInput = signoffPlan.missingInputs.find(
    (item) => item.id === "manual-release-signoff",
  );
  assert.equal(signoffManualInput.kind, "manual");
  assert.match(
    signoffManualInput.validation,
    /manual approval cannot be generated by runner/,
  );
  const targetSmokePlan = payload.closeoutInputChecklist.collectionPlan.find(
    (item) => item.actionId === "target-smoke",
  );
  assert.equal(targetSmokePlan.reportOnly, true);
  assert.equal(targetSmokePlan.writesReleaseEvidence, false);
  assert(
    targetSmokePlan.secretInputIds.includes("CUSTOMER_CONFIG_ADMIN_TOKEN"),
  );
  assert.equal(Object.hasOwn(targetSmokePlan, "executeCommand"), false);
  assert.doesNotMatch(
    targetSmokePlan.runnerReportFileCommand,
    /<redacted-admin-token>|--execute|RELEASE_CLOSEOUT_CONFIRM/,
  );
  assertReportCommandPathOutsideEvidence(targetSmokePlan.runnerReportFileCommand);
  const targetSmokeAdminTokenInput = targetSmokePlan.missingInputs.find(
    (item) => item.id === "CUSTOMER_CONFIG_ADMIN_TOKEN",
  );
  assert.equal(targetSmokeAdminTokenInput.secret, true);
  assert.match(targetSmokeAdminTokenInput.evidenceTarget, /not stored/);
  assert.match(
    targetSmokeAdminTokenInput.validation,
    /customer config readback smoke/,
  );
  const sourcePostgresOperatorItem =
    payload.closeoutInputChecklist.operatorChecklist.find(
      (item) => item.id === "SOURCE_POSTGRES_DSN",
    );
  assert.equal(sourcePostgresOperatorItem.secret, true);
  assert.match(sourcePostgresOperatorItem.evidenceTarget, /not stored/);
  assert.match(
    sourcePostgresOperatorItem.validation,
    /backup restore rehearsal/,
  );
  const adminTokenOperatorItem =
    payload.closeoutInputChecklist.operatorChecklist.find(
      (item) => item.id === "CUSTOMER_CONFIG_ADMIN_TOKEN",
    );
  assert.equal(adminTokenOperatorItem.secret, true);
  assert.match(adminTokenOperatorItem.evidenceTarget, /not stored/);
  assert.match(adminTokenOperatorItem.validation, /customer config readback smoke/);
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN='postgres(?:ql)?:\/\//);
  assert.doesNotMatch(
    result.stdout,
    /CUSTOMER_CONFIG_ADMIN_TOKEN='(?!<redacted-admin-token>)[^']+'/,
  );
  assert.doesNotMatch(result.stdout, /https?:\/\/[^/\s'"]+:[^@\s'"]+@/);
  assert.doesNotMatch(
    result.stdout,
    /--report\s+deployments\/[^/]+\/evidence\//,
  );
  assert(
    payload.notProvenByThisAudit.includes("target smoke was run"),
  );
  assert(
    payload.notProvenByThisAudit.includes(
      "target environment release was executed",
    ),
  );
  assert(
    payload.notProvenByThisAudit.includes("target migration was applied"),
  );
  assert(
    payload.notProvenByThisAudit.includes(
      "backup restore rehearsal was performed",
    ),
  );
  assert(
    payload.notProvenByThisAudit.includes(
      "rollback or forward-fix rehearsal was performed",
    ),
  );
  assert(
    payload.notProvenByThisAudit.includes(
      "customer config revision was activated or rolled back on the target environment",
    ),
  );
  assert(
    payload.notProvenByThisAudit.includes(
      "real customer data import was approved or executed",
    ),
  );
  assert.equal(Object.hasOwn(payload, "releaseEvidenceProgress"), false);
  assert.equal(Object.hasOwn(payload, "referenceCoverage"), false);
  assert.equal(Object.hasOwn(payload, "checks"), false);
});

test("multi-client role workflow priority audit JSON checklist uses custom release paths read-only", () => {
  const customEvidenceDir = "output/test-release-evidence/releases/2099-02-01";
  const customRuntimeEnvFile = "output/test-env/prod-json.env";
  const result = spawnAudit([
    "--input-checklist-json",
    "--release-evidence-dir",
    customEvidenceDir,
    "--runtime-env-file",
    customRuntimeEnvFile,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.readOnly, true);
  assert.equal(payload.evidenceDir, customEvidenceDir);
  assert.equal(payload.runtimeEnvFile, customRuntimeEnvFile);
  assert.equal(payload.releaseReady, false);
  assert.equal(payload.completionState, "target-evidence-required");
  assert.equal(Array.isArray(payload.implementationBreakdown), true);
  const p5Breakdown = payload.implementationBreakdown.find(
    (item) => item.id === "p5-release-import-second-customer",
  );
  assert.equal(p5Breakdown.state, "target-evidence-required");
  assert.equal(p5Breakdown.localState, "evidence-required");
  assert.equal(p5Breakdown.targetState, "evidence-required");
  assert.equal(p5Breakdown.nextAction.actionId, "immutable-version");
  assert.equal(p5Breakdown.nextAction.reportOnlyWritesReleaseEvidence, false);
  assert.equal(Object.hasOwn(p5Breakdown.nextAction, "executeCommand"), false);
  assert.equal(
    Object.hasOwn(p5Breakdown.nextAction, "executeRequiresConfirm"),
    false,
  );
  assert(
    p5Breakdown.forbiddenScope.some((item) =>
      item.includes("不伪造 release evidence"),
    ),
  );
  assert(
    p5Breakdown.executionContract.allowedPaths.includes(
      "output/release-evidence-closeout/** for report-only runner output",
    ),
  );
  assert(
    p5Breakdown.executionContract.forbiddenPaths.some((item) =>
      item.includes("deployments/**/evidence/releases/** unless real release batch inputs"),
    ),
  );
  assert(
    p5Breakdown.executionContract.notDoing.some((item) =>
      item.includes("不把 report-only"),
    ),
  );
  assert(
    p5Breakdown.executionContract.validationCommands.includes(
      "node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready",
    ),
  );
  assert.equal(payload.closeoutInputChecklist.reportOnly, true);
  assert.equal(payload.closeoutInputChecklist.writesReleaseEvidence, false);

  const collectionPlan = payload.closeoutInputChecklist.collectionPlan;
  assert.equal(Array.isArray(collectionPlan), true);
  assert.equal(
    Array.isArray(payload.closeoutInputChecklist.collectionGroups),
    true,
  );
  assert.deepEqual(
    collectionPlan.map((item) => item.actionId),
    [
      "immutable-version",
      "production-preflight",
      "backup-restore-rehearsal",
      "target-smoke",
      "rollback-forward-fix",
      "release-signoff",
    ],
  );
  for (const item of collectionPlan) {
    assert.equal(item.reportOnly, true);
    assert.equal(item.writesReleaseEvidence, false);
    assert.equal(Array.isArray(item.missingInputs), true);
    assert.deepEqual(
      item.missingInputs.map((input) => input.id),
      item.missingInputIds,
    );
    assert.match(item.runnerReportPath, /^output\/release-evidence-closeout\/2099-02-01\//);
    assert.match(item.runnerReportCommand, new RegExp(`--evidence-dir ${customEvidenceDir}`));
    assert.match(item.runnerReportCommand, new RegExp(`--runtime-env-file ${customRuntimeEnvFile}`));
    assert.match(item.runnerReportFileCommand, new RegExp(`--evidence-dir ${customEvidenceDir}`));
    assert.match(item.runnerReportFileCommand, new RegExp(`--runtime-env-file ${customRuntimeEnvFile}`));
    assert.match(item.runnerReportFileCommand, /--report output\/release-evidence-closeout\/2099-02-01\//);
    assert.doesNotMatch(item.runnerReportCommand, /--report|--execute/);
    assert.doesNotMatch(item.runnerReportFileCommand, /--execute|RELEASE_CLOSEOUT_CONFIRM/);
    assert.doesNotMatch(item.runnerReportFileCommand, /--report\s+output\/test-release-evidence\//);
  }
  for (const item of payload.closeoutInputChecklist.collectionGroups) {
    assert.equal(item.reportOnly, true);
    assert.equal(item.writesReleaseEvidence, false);
    assert.equal(Object.hasOwn(item, "executeCommand"), false);
    for (const reportPath of item.runnerReportPaths) {
      assert.match(reportPath, /^output\/release-evidence-closeout\/2099-02-01\//);
      assert.doesNotMatch(reportPath, /^output\/test-release-evidence\//);
    }
  }

  const immutableVersion = collectionPlan.find(
    (item) => item.actionId === "immutable-version",
  );
  assert.match(
    immutableVersion.runnerReportFileCommand,
    /--only immutable-version --report output\/release-evidence-closeout\/2099-02-01\/immutable-version-runner-report\.json --json/,
  );
  const targetSmoke = collectionPlan.find((item) => item.actionId === "target-smoke");
  assert.equal(Object.hasOwn(targetSmoke, "executeCommand"), false);
  assert.doesNotMatch(
    targetSmoke.runnerReportFileCommand,
    /<redacted-admin-token>|--execute|RELEASE_CLOSEOUT_CONFIRM/,
  );
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN='postgres(?:ql)?:\/\//);
  assert.doesNotMatch(result.stdout, /https?:\/\/[^/\s'"]+:[^@\s'"]+@/);
  assert.equal(Object.hasOwn(payload, "releaseEvidenceProgress"), false);
  assert.equal(Object.hasOwn(payload, "referenceCoverage"), false);
  assert.equal(Object.hasOwn(payload, "checks"), false);
});

test("multi-client role workflow priority audit can emit input checklist CSV only", () => {
  const result = spawnAudit(["--input-checklist-csv"]);

  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.equal(
    lines[0],
    [
      "evidence_dir",
      "runtime_env_file",
      "release_ready",
      "completion_state",
      "blocking_category",
      "phase_id",
      "phase_state",
      "phase_local_state",
      "phase_target_state",
      "phase_next_action",
      "group_id",
      "group_title",
      "action_id",
      "input_id",
      "kind",
      "secret",
      "status",
      "source",
      "evidence_target",
      "validation",
      "report_only",
      "writes_release_evidence",
    ].map((cell) => `"${cell}"`).join(","),
  );
  assert(
    lines.some((line) =>
      line.includes('"deployments/yoyoosun/evidence/releases/2026-06-29"') &&
      line.includes('"server/deploy/compose/prod/.env"') &&
      line.includes('"false","target-evidence-required","external-release-evidence-required"') &&
      line.includes('"p5-release-import-second-customer","target-evidence-required","evidence-required","evidence-required","immutable-version"') &&
      line.includes('"release-build-version-owner"') &&
      line.includes('"immutable-version"') &&
      line.includes('"SERVER_IMAGE_DIGEST"') &&
      line.includes('"sha256:<64-hex>"') &&
      line.endsWith('"true","false"'),
    ),
  );
  assert(
    lines.some((line) =>
      line.includes('"target-smoke-operator"') &&
      line.includes('"target-smoke"') &&
      line.includes('"CUSTOMER_CONFIG_ADMIN_TOKEN"') &&
      line.includes('"true"') &&
      line.includes('"not stored; smoke report records only sanitized pass/fail evidence"'),
    ),
  );
  assert(
    lines.some((line) =>
      line.includes('"customer-config-readback-operator"') &&
      line.includes('"customer-config-effective-session"') &&
      line.includes('"ROLLBACK_TARGET_RELEASE"'),
    ),
  );
  assert(
    lines.some((line) =>
      line.includes('"release-signoff-reviewer"') &&
      line.includes('"release-signoff"') &&
      line.includes('"manual-release-signoff"') &&
      line.includes('"manual approval cannot be generated by runner"'),
    ),
  );
  assert.doesNotMatch(result.stdout, /--execute|RELEASE_CLOSEOUT_CONFIRM/);
  assert.doesNotMatch(result.stdout, /executeCommand|runner-report|--report/);
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN=/);
  assert.doesNotMatch(result.stdout, /CUSTOMER_CONFIG_ADMIN_TOKEN=/);
  assert.doesNotMatch(result.stdout, /postgres(?:ql)?:\/\/[^,\s"]+/);
  assert.doesNotMatch(result.stdout, /https?:\/\/[^/\s,"]+:[^@\s,"]+@/);
  assert.doesNotMatch(result.stdout, /releaseEvidenceProgress|referenceCoverage|"checks"/);
});

test("multi-client role workflow priority audit CSV checklist uses custom release paths read-only", () => {
  const customEvidenceDir = "output/test-release-evidence/releases/2099-03-01";
  const customRuntimeEnvFile = "output/test-env/prod-csv.env";
  const result = spawnAudit([
    "--input-checklist-csv",
    "--release-evidence-dir",
    customEvidenceDir,
    "--runtime-env-file",
    customRuntimeEnvFile,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.match(lines[0], /"evidence_dir","runtime_env_file","release_ready"/);
  assert(
    lines.some((line) =>
      line.startsWith(
        `"${customEvidenceDir}","${customRuntimeEnvFile}","false","target-evidence-required","external-release-evidence-required"`,
      ) &&
      line.includes('"p5-release-import-second-customer","target-evidence-required"') &&
      line.includes('"immutable-version"') &&
      line.includes('"SERVER_IMAGE_DIGEST"'),
    ),
  );
  assert.doesNotMatch(result.stdout, /--execute|RELEASE_CLOSEOUT_CONFIRM/);
  assert.doesNotMatch(result.stdout, /executeCommand|runner-report|--report/);
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN=/);
  assert.doesNotMatch(result.stdout, /CUSTOMER_CONFIG_ADMIN_TOKEN=/);
  assert.doesNotMatch(result.stdout, /postgres(?:ql)?:\/\/[^,\s"]+/);
  assert.doesNotMatch(result.stdout, /https?:\/\/[^/\s,"]+:[^@\s,"]+@/);
  assert.doesNotMatch(result.stdout, /releaseEvidenceProgress|referenceCoverage|"checks"/);
});

test("multi-client role workflow priority audit can emit input checklist Markdown", () => {
  const result = spawnAudit(["--input-checklist-markdown"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# P5 Release Closeout Input Checklist/m);
  assert.match(result.stdout, /\| readOnly \| true \|/);
  assert.match(result.stdout, /\| releaseReady \| false \|/);
  assert.match(
    result.stdout,
    /\| completionState \| target-evidence-required \|/,
  );
  assert.match(result.stdout, /## Missing Inputs/);
  assert.match(
    result.stdout,
    /\| SERVER_IMAGE \| env \| false \| immutable-version \|/,
  );
  assert.match(
    result.stdout,
    /\| prod-env-file \| file \| true \| production-preflight \|/,
  );
  assert.match(
    result.stdout,
    /\| SOURCE_POSTGRES_DSN \| env \| true \| backup-restore-rehearsal \|/,
  );
  assert.match(
    result.stdout,
    /\| CUSTOMER_CONFIG_ADMIN_TOKEN \| env \| true \| target-smoke<br>customer-config-effective-session \|/,
  );
  assert.match(result.stdout, /## Collection Plan/);
  assert.match(result.stdout, /## Implementation Breakdown/);
  assert.match(
    result.stdout,
    /\| Phase \| State \| Local State \| Target State \| Next Action \| Objective \| Allowed Paths \| Forbidden Paths \| Not Doing \| Validation Commands \|/,
  );
  assert.match(
    result.stdout,
    /\| p5-release-import-second-customer \| target-evidence-required \| evidence-required \| evidence-required \| immutable-version \| .*客户配置导入.*output\/release-evidence-closeout\/\*\* for report-only runner output.*deployments\/\*\*\/evidence\/releases\/\*\* unless real release batch inputs.*不把 report-only.*--fail-on-release-not-ready.* \|/,
  );
  assert.match(
    result.stdout,
    /\| Order \| Action \| State \| Missing Inputs \| Secret Inputs \| Report Path \| Report File Command \| Report-only Command \|/,
  );
  assert.match(
    result.stdout,
    /\| 1 \| immutable-version \| blocked \| .*SERVER_IMAGE_DIGEST.*\| none \| output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json \| node scripts\/deploy\/release-evidence-closeout-runner\.mjs .*--only immutable-version --report output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json --json \|/,
  );
  assert.match(
    result.stdout,
    /\| 6 \| release-signoff \| manual \| manual-release-signoff \| none \| output\/release-evidence-closeout\/2026-06-29\/release-signoff-runner-report\.json \| node scripts\/deploy\/release-evidence-closeout-runner\.mjs .*--only release-signoff --report output\/release-evidence-closeout\/2026-06-29\/release-signoff-runner-report\.json --json \|/,
  );
  const collectionRows = result.stdout
    .split("\n")
    .filter((line) => /^\| [1-7] \| /.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()));
  assert.deepEqual(
    collectionRows.map((cells) => cells[2]),
    [
      "immutable-version",
      "production-preflight",
      "backup-restore-rehearsal",
      "target-smoke",
      "rollback-forward-fix",
      "release-signoff",
      "customer-config-effective-session",
    ],
  );
  assert.equal(
    collectionRows.find((cells) => cells[2] === "production-preflight")[5],
    "prod-env-file",
  );
  assert.equal(
    collectionRows.find((cells) => cells[2] === "backup-restore-rehearsal")[5],
    "SOURCE_POSTGRES_DSN",
  );
  assert.equal(
    collectionRows.find((cells) => cells[2] === "target-smoke")[5],
    "CUSTOMER_CONFIG_ADMIN_TOKEN",
  );
  assert.equal(
    collectionRows.find(
      (cells) => cells[2] === "customer-config-effective-session",
    )[5],
    "CUSTOMER_CONFIG_ADMIN_TOKEN",
  );
  assert.equal(
    collectionRows.find((cells) => cells[2] === "release-signoff")[5],
    "none",
  );
  assert.match(result.stdout, /## Collection Groups/);
  assert.match(
    result.stdout,
    /\| Group \| Actions \| Missing Inputs \| Secret Inputs \| Report Paths \|/,
  );
  assert.match(
    result.stdout,
    /\| release-build-version-owner \| immutable-version \| .*SERVER_IMAGE_DIGEST.* \| none \| output\/release-evidence-closeout\/2026-06-29\/immutable-version-runner-report\.json \|/,
  );
  assert.match(
    result.stdout,
    /\| target-smoke-operator \| target-smoke \| .*SMOKE_ENDPOINT.*CUSTOMER_CONFIG_ADMIN_TOKEN.* \| CUSTOMER_CONFIG_ADMIN_TOKEN \| output\/release-evidence-closeout\/2026-06-29\/target-smoke-runner-report\.json \|/,
  );
  assert.match(
    result.stdout,
    /\| customer-config-readback-operator \| customer-config-effective-session \| .*CUSTOMER_CONFIG_ADMIN_TOKEN.*ROLLBACK_TARGET_RELEASE.* \| CUSTOMER_CONFIG_ADMIN_TOKEN \| output\/release-evidence-closeout\/2026-06-29\/customer-config-effective-session-runner-report\.json \|/,
  );
  assert.match(result.stdout, /## Collection Input Details/);
  assert.match(
    result.stdout,
    /\| Action \| Input \| Kind \| Secret \| Source \| Evidence Target \| Validation \|/,
  );
  assert.match(
    result.stdout,
    /\| immutable-version \| SERVER_IMAGE_DIGEST \| env \| false \| server image digest from the registry or build output \| release-evidence\.md field serverImageDigest and image-digests\.txt \| sha256:<64-hex> \|/,
  );
  assert.match(
    result.stdout,
    /\| production-preflight \| prod-env-file \| file \| true \| production runtime env file path on the release workstation \| production-preflight-report\.txt \| file exists and is not an example env file \|/,
  );
  assert.match(
    result.stdout,
    /\| target-smoke \| CUSTOMER_CONFIG_ADMIN_TOKEN \| env \| true \| secure operator shell or secret manager for the target admin token \| not stored; smoke report records only sanitized pass\/fail evidence \| required only while running target customer config readback smoke \|/,
  );
  assert.match(
    result.stdout,
    /\| release-signoff \| manual-release-signoff \| manual \| false \| human sign-off after evidence gate, known limitations, smoke, restore and rollback evidence are reviewed \| release-signoff-checklist\.md \| manual approval cannot be generated by runner \|/,
  );
  assert.match(result.stdout, /## Not Proven By This Audit/);
  assert.match(result.stdout, /- target smoke was run/);
  assert.match(result.stdout, /writesReleaseEvidence \| false/);
  const reportFileCommandCells = result.stdout
    .split("\n")
    .filter((line) =>
      line.includes("runner-report.json") &&
      line.includes("--report output/release-evidence-closeout/"),
    )
    .map((line) => line.split("|").map((cell) => cell.trim())[7])
    .filter(Boolean);
  assert.equal(reportFileCommandCells.length, 7);
  for (const command of reportFileCommandCells) {
    assert.match(
      command,
      /^node scripts\/deploy\/release-evidence-closeout-runner\.mjs /,
    );
    assert.doesNotMatch(
      command,
      /<target-environment>|<server-image-ref>|sha256:<64-hex>/,
    );
    assert.doesNotMatch(command, /--execute|RELEASE_CLOSEOUT_CONFIRM/);
  }
  assert.doesNotMatch(
    result.stdout,
    /--report\s+deployments\/[^/]+\/evidence\//,
  );
  assert.doesNotMatch(result.stdout, /--execute|RELEASE_CLOSEOUT_CONFIRM/);
  assert.doesNotMatch(
    result.stdout,
    /\| deployments\/[^/]+\/evidence\/[^|]*runner-report\.json \|/,
  );
  assert.doesNotMatch(result.stdout, /referenceCoverage/);
  assert.doesNotMatch(result.stdout, /"checks"/);
  assert.doesNotMatch(result.stdout, /SOURCE_POSTGRES_DSN=/);
  assert.doesNotMatch(result.stdout, /CUSTOMER_CONFIG_ADMIN_TOKEN=/);
  assert.doesNotMatch(result.stdout, /postgres(?:ql)?:\/\/[^|\s]+/);
  assert.doesNotMatch(result.stdout, /https?:\/\/[^/\s|]+:[^@\s|]+@/);
});

test("multi-client role workflow priority audit Markdown checklist uses custom release paths read-only", () => {
  const customEvidenceDir = "output/test-release-evidence/releases/2099-01-31";
  const customRuntimeEnvFile = "output/test-env/prod.env";
  const result = spawnAudit([
    "--input-checklist-markdown",
    "--release-evidence-dir",
    customEvidenceDir,
    "--runtime-env-file",
    customRuntimeEnvFile,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /\| evidenceDir \| output\/test-release-evidence\/releases\/2099-01-31 \|/,
  );
  assert.match(
    result.stdout,
    /\| runtimeEnvFile \| output\/test-env\/prod\.env \|/,
  );
  assert.match(result.stdout, /\| evidence-dir \| file \| false \|/);
  assert.match(
    result.stdout,
    /output\/release-evidence-closeout\/2099-01-31\/immutable-version-runner-report\.json/,
  );
  assert.match(
    result.stdout,
    /--evidence-dir output\/test-release-evidence\/releases\/2099-01-31 --runtime-env-file output\/test-env\/prod\.env --only immutable-version --report output\/release-evidence-closeout\/2099-01-31\/immutable-version-runner-report\.json --json/,
  );
  const collectionRows = result.stdout
    .split("\n")
    .filter((line) => /^\| [1-9] \| /.test(line));
  assert(collectionRows.length > 0);
  for (const row of collectionRows) {
    assert.match(
      row,
      /--evidence-dir output\/test-release-evidence\/releases\/2099-01-31/,
    );
    assert.match(row, /--runtime-env-file output\/test-env\/prod\.env/);
    assert.match(row, /--report output\/release-evidence-closeout\/2099-01-31\//);
  }
  assert.doesNotMatch(result.stdout, /--report\s+output\/test-release-evidence\//);
  assert.doesNotMatch(result.stdout, /--execute|RELEASE_CLOSEOUT_CONFIRM/);
});
