#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  getEnvironmentFingerprint,
  validateDevWorkbenchReceipt,
} from "./dev-workbench-receipt.mjs";
import { runFieldLinkageQa } from "./erp-field-linkage.mjs";
import {
  buildAffectedPlan,
  collectChangedFiles,
  resolveProjectPnpm,
} from "./affected.mjs";
import {
  assertRepositoryIdentityEqual,
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from "./lib/repository-identity.mjs";
import {
  buildCoverageReport,
  parseGoCoverprofile,
  parseNodeNativeCoverage,
} from "./test-coverage-report.mjs";
import { verifyGoTestJson } from "./verify-go-test-json.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

export const COVERAGE_EVIDENCE_SCHEMA = "plush-test-coverage-evidence/v1";
export const COVERAGE_EVIDENCE_RELATIVE_PATH =
  "output/qa/coverage/baseline.latest.json";
export const AGGREGATED_REPORT_RELATIVE_PATH = "output/qa/coverage/latest.json";
export const FIELD_LINKAGE_EVIDENCE_RELATIVE_PATH =
  "output/qa/coverage/field-linkage.latest.json";

export const BASELINE_STAGE_KEYS = Object.freeze([
  "t0-static",
  "t1-docs",
  "go",
  "web-lint",
  "web-css",
  "web-error-codes",
  "web",
  "import",
  "field-linkage",
]);

export const BUSINESS_DOMAIN_KEYS = Object.freeze([
  "master-data",
  "source-documents",
  "fact-inventory",
  "fact-purchase",
  "fact-quality",
  "fact-production",
  "fact-outsourcing",
  "fact-shipment",
  "fact-finance",
  "workflow",
  "rbac-api",
  "frontend",
  "print",
  "import",
]);

const goScenario = (id, packageName, testPrefix) =>
  Object.freeze({ id, package: packageName, testPrefix });

export const GO_BUSINESS_SCENARIOS = Object.freeze({
  "master-data": Object.freeze([
    goScenario(
      "masterdata-input-normalization",
      "server/internal/biz",
      "TestMasterDataUsecaseNormalizesCustomerSupplierAndContactInput",
    ),
    goScenario(
      "product-unit-guard",
      "server/internal/biz",
      "TestMasterDataUsecaseProductGuardsUnit",
    ),
    goScenario(
      "masterdata-create-rbac",
      "server/internal/service",
      "TestJsonrpcDispatcher_MasterDataCreateCustomerRequiresAdminAndPermission",
    ),
  ]),
  "source-documents": Object.freeze([
    goScenario(
      "sales-order-lifecycle",
      "server/internal/biz",
      "TestSalesOrderUsecaseLifecycleGuards",
    ),
    goScenario(
      "purchase-order-lifecycle",
      "server/internal/biz",
      "TestPurchaseOrderUsecaseLifecycleGuards",
    ),
    goScenario(
      "bom-lifecycle-contract",
      "server/internal/biz",
      "TestBOMStatusContractOnlyKnowsCurrentLifecycle",
    ),
  ]),
  "fact-inventory": Object.freeze([
    goScenario(
      "stock-reservation-input",
      "server/internal/biz",
      "TestOperationalFactUsecaseCreateStockReservationFromSalesOrderNormalizesPublicIntent",
    ),
    goScenario(
      "stock-reservation-source-truth",
      "server/internal/data",
      "TestOperationalFactRepoCreateStockReservationFromSalesOrderDerivesSourceAndReplaysIntent",
    ),
    goScenario(
      "inventory-lot-status-guard",
      "server/internal/data",
      "TestInventoryRepo_LotStatusGuardsOrdinaryDeduction",
    ),
  ]),
  "fact-purchase": Object.freeze([
    goScenario(
      "purchase-receipt-process-command",
      "server/internal/biz",
      "TestPurchaseReceiptProcessDomainCommandCreateRequiresWarehouse",
    ),
    goScenario(
      "purchase-receipt-source-line-truth",
      "server/internal/biz",
      "TestNormalizePurchaseReceiptItemCreateUsesPurchaseOrderLineAsSourceLineTruth",
    ),
    goScenario(
      "purchase-return-quality-source",
      "server/internal/data",
      "TestPurchaseReturnFromRejectedQualityInspectionDerivesSourceAndPosts",
    ),
  ]),
  "fact-quality": Object.freeze([
    goScenario(
      "quality-filter-default-boundary",
      "server/internal/biz",
      "TestNormalizeQualityInspectionFilterDefaultsToIncomingMaterialBoundary",
    ),
    goScenario(
      "quality-filter-wip-rejection",
      "server/internal/biz",
      "TestNormalizeQualityInspectionFilterRejectsProductionWIPFields",
    ),
    goScenario(
      "outsourcing-quality-source",
      "server/internal/data",
      "TestQualityInspectionFromOutsourcingReturnDerivesSourceAndGuardsCancellation",
    ),
  ]),
  "fact-production": Object.freeze([
    goScenario(
      "production-material-freeze",
      "server/internal/data",
      "TestProductionOrderReleaseFreezesMaterialRequirementsAndKeepsNoBOMExplicit",
    ),
    goScenario(
      "production-completion-source-truth",
      "server/internal/biz",
      "TestOperationalFactUsecaseCreateProductionCompletionOwnsSourceFields",
    ),
    goScenario(
      "production-exception-source",
      "server/internal/biz",
      "TestProductionExceptionSubmitNormalizesAndRequiresTypedSource",
    ),
  ]),
  "fact-outsourcing": Object.freeze([
    goScenario(
      "outsourcing-subject-boundary",
      "server/internal/data",
      "TestOutsourcingOrderRepoProductAndMaterialSubjects",
    ),
    goScenario(
      "outsourcing-style-snapshot",
      "server/internal/data",
      "TestOutsourcingProductNoSnapshotPrefersStyleNo",
    ),
    goScenario(
      "outsourcing-fact-source",
      "server/internal/data",
      "TestOutsourcingFactFromOrderDerivesSourceAndRestrictsLineTypes",
    ),
  ]),
  "fact-shipment": Object.freeze([
    goScenario(
      "shipment-source-filter",
      "server/internal/biz",
      "TestOperationalFactUsecaseListShipmentSourceCandidatesRejectsInvalidFilters",
    ),
    goScenario(
      "shipment-source-candidate-truth",
      "server/internal/data",
      "TestOperationalFactRepoListShipmentSourceCandidatesUsesShippedTruth",
    ),
    goScenario(
      "shipment-customer-snapshot",
      "server/internal/data",
      "TestOperationalFactRepoCreateSourceShipmentOwnsCustomerSnapshotAndReplay",
    ),
  ]),
  "fact-finance": Object.freeze([
    goScenario(
      "receivable-shipment-customer-truth",
      "server/internal/biz",
      "TestFinanceProcessDomainCommandReceivableLeadRequiresShipmentCustomerTruth",
    ),
    goScenario(
      "finance-payment-api-contract",
      "server/internal/service",
      "TestOperationalFactFinancePaymentCreateAndListContract",
    ),
    goScenario(
      "finance-payment-allocation",
      "server/internal/data",
      "TestFinancePaymentMultiAllocationAndReversal",
    ),
  ]),
  workflow: Object.freeze([
    goScenario(
      "workflow-status-permissions",
      "server/internal/biz",
      "TestWorkflowStatusActionPermissionMapsUpdateCompleteApproveReject",
    ),
    goScenario(
      "workflow-owner-assignee-status",
      "server/internal/biz",
      "TestCanAdminHandleWorkflowTaskEnforcesOwnerAssigneeAndStatus",
    ),
    goScenario(
      "warehouse-inbound-block-reason",
      "server/internal/biz",
      "TestWorkflowUsecase_WarehouseInboundBlockedRequiresReason",
    ),
    goScenario(
      "shipment-release-terminal-reason",
      "server/internal/data",
      "TestWorkflowRepo_ShipmentReleaseBlockedAndRejectedPreserveReasonPayload",
    ),
  ]),
  "rbac-api": Object.freeze([
    goScenario(
      "super-admin-permission",
      "server/internal/biz",
      "TestAdminHasPermissionSuperAdminHasAllPermissions",
    ),
    goScenario(
      "disabled-admin-denial",
      "server/internal/biz",
      "TestAdminHasPermissionDisabledAdminHasNoPermissions",
    ),
    goScenario(
      "builtin-role-fact-permissions",
      "server/internal/biz",
      "TestBuiltinRoleOperationalFactPermissionProjection",
    ),
    goScenario(
      "jwt-session-invalid-states",
      "server/internal/server",
      "TestAuthClaimsMiddlewareRealJWTSessionChainRejectsInvalidStates",
    ),
  ]),
  print: Object.freeze([
    goScenario(
      "pdf-active-content-rejection",
      "server/internal/server",
      "TestValidateTemplatePDFHTMLRejectsActiveAndExternalContent",
    ),
    goScenario(
      "pdf-realtime-authorization",
      "server/internal/server",
      "TestAuthorizeTemplatePDFRequestRequiresRealtimePermissionEffectiveActionAndModule",
    ),
    goScenario(
      "pdf-resource-budget",
      "server/internal/server",
      "TestTemplatePDFResourceBudgetContract",
    ),
  ]),
});

export const FIELD_LINKAGE_PRINT_CASE_IDS = Object.freeze([
  "FL_processing_contract_table_headers__paper_uses_shared_subject_aware_columns",
  "FL_print_supplier_contact_snapshot__prefills_from_primary_supplier_contact",
  "FL_print_supplier_contact_snapshot__purchase_and_outsourcing_pages_fetch_supplier_contacts_before_save",
  "FL_material_purchase_print_dates__keeps_string_date_snapshots",
  "FL_material_purchase_unit__normalizes_unit_to_chinese_for_print",
  "FL_material_purchase_print_snapshot__does_not_fallback_to_raw_ids",
  "FL_material_purchase_print_party_defaults__uses_customer_config_party_defaults_only",
  "FL_material_purchase_print_party_snapshot__order_snapshot_overrides_customer_defaults",
  "FL_processing_contract_business_draft__does_not_create_blank_line_without_items",
  "FL_processing_contract_fact_trace__uses_business_numbers_without_internal_ids",
  "FL_processing_contract_print_lines__filters_canceled_outsourcing_items",
  "FL_processing_contract_print_party_defaults__uses_customer_config_party_defaults_only",
  "FL_processing_contract_print_party_snapshot__order_snapshot_overrides_customer_defaults",
  "FL_print_workspace_window_snapshot__persists_current_html_snapshot",
  "FL_print_templates_sample__uses_generic_sample_values_without_customer_identity",
  "FL_print_templates_contract__declares_field_requirements_and_pdf_module_guard",
  "FL_print_templates_processing_preview__uses_processing_signature_and_totals",
  "FL_print_templates_output_zero__does_not_use_falsy_fallback_for_paper_values",
]);

function readCriticalPostgresTestPattern() {
  const configPath = fileURLToPath(
    new URL("./critical-postgres-tests.sh", import.meta.url),
  );
  const pattern = readFileSync(configPath, "utf8").match(
    /^CRITICAL_POSTGRES_TEST_PATTERN='([^']+)'$/mu,
  )?.[1];
  if (!pattern) {
    throw new Error(
      "critical-postgres-tests.sh missing CRITICAL_POSTGRES_TEST_PATTERN",
    );
  }
  return pattern;
}

export const CRITICAL_POSTGRES_TEST_PATTERN =
  readCriticalPostgresTestPattern();
export const BASELINE_GO_SKIP_PATTERN = `${CRITICAL_POSTGRES_TEST_PATTERN}|^TestTemplatePDFChromiumSecurityIntegration$`;

const IMPORT_TEST_FILES = Object.freeze([
  "scripts/import/customerImportDryRun.test.mjs",
  "scripts/import/customerSourceExtract.test.mjs",
  "scripts/import/customerSourceManifestCheck.test.mjs",
  "scripts/import/customerSourceSnapshotFreezeCheck.test.mjs",
]);

const RECEIPT_ACCEPTANCE_KEYS = Object.freeze([
  "postgres",
  "browser",
  "readiness",
  "targetEnvironment",
  "uat",
]);

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function emptyCounts() {
  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    executed: 0,
    missing: 0,
    total: 0,
  };
}

function statusFromCounts(record) {
  if (record.failed > 0) return "failed";
  if (record.blocked > 0) return "blocked";
  if (record.skipped > 0) return "skipped";
  if (record.executed === 0) return "missing";
  if (
    record.missing > 0 ||
    record.passed !== record.executed ||
    record.executed < record.total
  ) {
    return "partial";
  }
  return "passed";
}

function normalizeExecutionCounts({
  passed = 0,
  failed = 0,
  skipped = 0,
  blocked = 0,
  missing = 0,
  executed = passed + failed + skipped,
  total = executed + blocked + missing,
  status = "",
  required,
  note = "",
} = {}) {
  const record = {
    passed: count(passed, "passed"),
    failed: count(failed, "failed"),
    skipped: count(skipped, "skipped"),
    blocked: count(blocked, "blocked"),
    executed: count(executed, "executed"),
    missing: count(missing, "missing"),
    total: count(total, "total"),
  };
  if (record.passed + record.failed + record.skipped > record.executed) {
    throw new Error("execution result counts exceed executed");
  }
  if (record.executed + record.blocked + record.missing > record.total) {
    throw new Error("execution result counts exceed total");
  }
  const output = {
    ...record,
    requiredCount: record.total,
    status: status || statusFromCounts(record),
  };
  if (typeof required === "boolean") output.required = required;
  if (note) output.note = note;
  return output;
}

function commandFailureRecord(note = "") {
  return normalizeExecutionCounts({
    executed: 1,
    failed: 1,
    total: 1,
    status: "failed",
    note,
  });
}

function notApplicableGate(note) {
  return {
    ...emptyCounts(),
    required: false,
    requiredCount: 0,
    status: "not_applicable",
    note,
  };
}

function missingRequiredGate(note) {
  return {
    ...emptyCounts(),
    required: true,
    requiredCount: 1,
    missing: 1,
    total: 1,
    status: "missing",
    note,
  };
}

function notCollectedAcceptance(note) {
  return {
    ...emptyCounts(),
    requiredCount: 0,
    status: "not_collected",
    note,
  };
}

export function parseArgs(argv) {
  const options = { help: false, profile: "", write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--write") {
      if (options.write) throw new Error("--write may only be specified once");
      options.write = true;
      continue;
    }
    if (arg === "--profile") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("--profile requires a value");
      }
      if (options.profile) {
        throw new Error("--profile may only be specified once");
      }
      options.profile = value;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  if (!options.help && options.profile !== "baseline") {
    throw new Error("--profile must be baseline");
  }
  return options;
}

export function usage() {
  return `用法:
  node scripts/qa/test-coverage-collect.mjs --profile baseline [--write]

作用:
  运行不写 PostgreSQL 的本地 baseline：T0 静态、文档清单、Go 单元/合同
  覆盖、Web lint/css/Node coverage、导入合同和字段联动专项。执行前后绑定
  同一 repository identity，并保守读取同一 clean commit 的结构化门禁回执。

边界:
  baseline 不执行 PostgreSQL 写入、真实浏览器、readiness、目标环境发布或 UAT；
  这些状态只允许由当前且可验证的正式回执提供，否则保持 not_collected。
  --write 写入 ${COVERAGE_EVIDENCE_RELATIVE_PATH} 并聚合
  ${AGGREGATED_REPORT_RELATIVE_PATH}。`;
}

export async function assertProjectNodeRuntime(
  projectRoot,
  runtimeVersion = process.version,
) {
  const expected = (
    await readFile(path.join(projectRoot, ".node-version"), "utf8")
  ).trim();
  if (
    !/^\d+\.\d+\.\d+$/u.test(expected) ||
    runtimeVersion !== `v${expected}`
  ) {
    throw new Error(
      `coverage collector requires Node ${expected}; run scripts/doctor.sh and fix the local runtime`,
    );
  }
  return expected;
}

export function runCommand({ command, args = [], cwd, env = process.env }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    error: result.error ? "command-start-failed" : "",
    status: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

export function simpleCommandExecution(result, note = "") {
  if (result.error || result.status !== 0) {
    return commandFailureRecord(note);
  }
  return normalizeExecutionCounts({
    executed: 1,
    passed: 1,
    total: 1,
    note,
  });
}

export function nodeCommandExecution(result, note = "") {
  let summary;
  try {
    summary = verifyNodeTestSummary(`${result.stdout}\n${result.stderr}`);
  } catch {
    return commandFailureRecord(note);
  }
  if (summary.missing.length > 0 || summary.duplicate.length > 0) {
    return commandFailureRecord(note);
  }
  const parsed = {
    passed: summary.pass ?? 0,
    failed: (summary.fail ?? 0) + (summary.cancelled ?? 0),
    skipped: (summary.skipped ?? 0) + (summary.todo ?? 0),
    executed: summary.tests ?? 0,
  };
  if (result.error || result.status !== 0) {
    if (parsed.failed === 0) {
      parsed.failed += 1;
      parsed.executed += 1;
    }
    return normalizeExecutionCounts({
      ...parsed,
      total: parsed.executed,
      status: "failed",
      note,
    });
  }
  return normalizeExecutionCounts({
    ...parsed,
    total: parsed.executed,
    status: summary.ok ? "passed" : "",
    note,
  });
}

export function goCommandExecution(result, note = "") {
  let summary;
  try {
    summary = verifyGoTestJson(result.stdout);
  } catch {
    return commandFailureRecord(note);
  }
  const parsed = {
    passed: summary.pass,
    failed: summary.fail,
    skipped: summary.skip,
    executed: summary.run,
  };
  if (result.error || result.status !== 0) {
    if (parsed.failed === 0) {
      parsed.failed += 1;
      parsed.executed += 1;
    }
    return normalizeExecutionCounts({
      ...parsed,
      total: parsed.executed,
      status: "failed",
      note,
    });
  }
  return normalizeExecutionCounts({
    ...parsed,
    total: parsed.executed,
    status: summary.ok ? "passed" : "",
    note,
  });
}

function commandGateRecord(executions, note, required = true) {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    executed: 0,
    missing: 0,
  };
  for (const execution of executions) {
    counts.executed += 1;
    if (execution.status === "passed") counts.passed += 1;
    else if (execution.status === "failed") counts.failed += 1;
    else if (execution.status === "blocked") counts.blocked += 1;
    else if (execution.status === "skipped") counts.skipped += 1;
    else counts.missing += 1;
  }
  return normalizeExecutionCounts({
    ...counts,
    required,
    total: executions.length,
    note,
  });
}

function combineExecutionRecords(records, note = "") {
  const combined = records.reduce((output, record) => {
    for (const key of [
      "passed",
      "failed",
      "skipped",
      "blocked",
      "executed",
      "missing",
      "total",
    ]) {
      output[key] += record[key] || 0;
    }
    return output;
  }, emptyCounts());
  return normalizeExecutionCounts({ ...combined, note });
}

function parseGoTestTerminals(content) {
  const tests = new Map();
  for (const rawLine of String(content).split(/\r?\n/u)) {
    if (!rawLine.trim()) continue;
    let event;
    try {
      event = JSON.parse(rawLine);
    } catch {
      throw new Error("Go test JSON contains an invalid event");
    }
    if (!event.Test || !event.Package) continue;
    const key = `${event.Package}\0${event.Test}`;
    const current = tests.get(key) || {
      package: event.Package,
      test: event.Test,
      ran: false,
      terminal: "",
    };
    if (event.Action === "run") current.ran = true;
    if (["pass", "fail", "skip"].includes(event.Action)) {
      current.terminal = event.Action;
    }
    tests.set(key, current);
  }
  const values = [...tests.values()].filter((entry) => entry.ran);
  return values.filter(
    (entry) =>
      !values.some(
        (candidate) =>
          candidate.package === entry.package &&
          candidate.test.startsWith(`${entry.test}/`),
      ),
  );
}

export function classifyGoBusinessDomains(
  content,
  globalExecution,
  registry = GO_BUSINESS_SCENARIOS,
) {
  let tests;
  try {
    tests = parseGoTestTerminals(content);
  } catch {
    return Object.fromEntries(
      Object.keys(registry).map((key) => [
        key,
        commandFailureRecord("Go test JSON 无法按业务域分类。"),
      ]),
    );
  }

  const classifyScenario = (scenario) => {
    const selected = tests.filter(
      (entry) =>
        entry.package === scenario.package &&
        (entry.test === scenario.testPrefix ||
          entry.test.startsWith(`${scenario.testPrefix}/`)),
    );
    let status = "passed";
    if (selected.length === 0 || selected.some((entry) => !entry.terminal)) {
      status = "missing";
    } else if (selected.some((entry) => entry.terminal === "fail")) {
      status = "failed";
    } else if (selected.some((entry) => entry.terminal === "skip")) {
      status = "skipped";
    }
    return {
      id: scenario.id,
      package: scenario.package,
      testPrefix: scenario.testPrefix,
      status,
      matchedTests: selected.map((entry) => entry.test).sort(),
    };
  };

  return Object.fromEntries(
    Object.entries(registry).map(([key, scenarios]) => {
      const scenarioResults = scenarios.map(classifyScenario);
      const record = normalizeExecutionCounts({
        passed: scenarioResults.filter((item) => item.status === "passed")
          .length,
        failed: scenarioResults.filter((item) => item.status === "failed")
          .length,
        skipped: scenarioResults.filter((item) => item.status === "skipped")
          .length,
        missing: scenarioResults.filter((item) => item.status === "missing")
          .length,
        executed: scenarioResults.filter((item) => item.status !== "missing")
          .length,
        total: scenarioResults.length,
        note: "只统计 baseline 显式场景注册表及其 leaf subtests；不按文件名、包名或测试名关键词推断业务覆盖。",
      });
      const output = { ...record, scenarios: scenarioResults };
      if (globalExecution.status === "passed") return [key, output];
      return [
        key,
        {
          ...output,
          status:
            globalExecution.status === "missing"
              ? "missing"
              : globalExecution.status,
          note: "Go baseline 未完整通过，相关业务域不能标记为通过。",
        },
      ];
    }),
  );
}

function fieldLinkageFailureRecords(note) {
  const failure = commandFailureRecord(note);
  return { frontend: failure, print: failure };
}

export function fieldLinkageBusinessRecords({
  artifact,
  commandResult,
  repository,
}) {
  if (
    commandResult.error ||
    commandResult.status !== 0 ||
    !artifact ||
    !repositoryIdentitiesEqual(artifact.repository, repository)
  ) {
    return fieldLinkageFailureRecords(
      "字段联动专项未生成绑定当前仓库的有效制品。",
    );
  }
  const summary = artifact.summary || {};
  const scenarioValues = [
    summary.totalScenarios,
    summary.passedScenarios,
    summary.failedScenarios,
    summary.skippedScenarios,
    summary.missingScenarios,
  ];
  if (
    scenarioValues.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    summary.passedScenarios +
      summary.failedScenarios +
      summary.skippedScenarios +
      summary.missingScenarios !==
      summary.totalScenarios
  ) {
    return fieldLinkageFailureRecords("字段联动专项 summary 不完整。");
  }
  const frontend = normalizeExecutionCounts({
    passed: summary.passedScenarios,
    failed: summary.failedScenarios,
    skipped: summary.skippedScenarios,
    missing: summary.missingScenarios,
    executed:
      summary.passedScenarios +
      summary.failedScenarios +
      summary.skippedScenarios,
    total: summary.totalScenarios,
    note: "字段联动专项按声明场景计数，不代表完整 Web source baseline。",
  });

  if (!Array.isArray(artifact.cases)) {
    return {
      frontend,
      print: commandFailureRecord("字段联动专项缺少 cases，无法证明打印链路。"),
    };
  }
  const caseById = new Map(
    artifact.cases
      .filter((item) => typeof item?.caseId === "string")
      .map((item) => [item.caseId, item]),
  );
  const printCases = FIELD_LINKAGE_PRINT_CASE_IDS.map(
    (caseId) => caseById.get(caseId) || { caseId, status: "missing" },
  );
  const print = normalizeExecutionCounts({
    passed: printCases.filter((item) => item.status === "pass").length,
    failed: printCases.filter((item) => item.status === "fail").length,
    skipped: printCases.filter((item) => item.status === "skip").length,
    missing: printCases.filter(
      (item) => !["pass", "fail", "skip"].includes(item.status),
    ).length,
    executed: printCases.filter((item) =>
      ["pass", "fail", "skip"].includes(item.status),
    ).length,
    total: printCases.length,
    note: "打印业务域只计显式登记的字段联动打印 caseId；不按标题或文件名关键词推断。",
  });
  return { frontend, print };
}

function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function verifyReceiptArtifacts(repoRoot, receipt) {
  if (receipt.artifacts.length === 0) return true;
  return receipt.artifacts.every((relativePath) => {
    const absolutePath = path.resolve(repoRoot, relativePath);
    const relative = path.relative(repoRoot, absolutePath);
    if (
      !relative ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      !existsSync(absolutePath) ||
      !statSync(absolutePath).isFile()
    ) {
      return false;
    }
    return (
      receipt.artifactDigests[relativePath] ===
      `sha256:${sha256(readFileSync(absolutePath))}`
    );
  });
}

export function receiptIsCurrent({
  receipt,
  repository,
  environmentFingerprint,
  repoRoot,
}) {
  try {
    validateDevWorkbenchReceipt(receipt);
  } catch {
    return false;
  }
  return (
    !repository.dirty &&
    receipt.treeState === "clean" &&
    receipt.gitCommit === repository.commit &&
    receipt.environmentFingerprint === environmentFingerprint &&
    verifyReceiptArtifacts(repoRoot, receipt)
  );
}

async function currentReceipts(repoRoot, repository) {
  const receiptDir = path.join(repoRoot, "output", "dev-workbench", "receipts");
  let entries = [];
  try {
    entries = await readdir(receiptDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const environmentFingerprint = getEnvironmentFingerprint(repoRoot);
  const receipts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const absolutePath = path.join(receiptDir, entry.name);
    const receipt = readJsonIfPresent(absolutePath);
    if (
      receipt &&
      receiptIsCurrent({
        receipt,
        repository,
        environmentFingerprint,
        repoRoot,
      })
    ) {
      receipts.push({
        receipt,
        path: path.relative(repoRoot, absolutePath).split(path.sep).join("/"),
      });
    }
  }
  return receipts.sort(
    (left, right) =>
      Date.parse(right.receipt.finishedAt) -
      Date.parse(left.receipt.finishedAt),
  );
}

function receiptCommandRecord(receipt, note, required = true) {
  const statuses = {
    passed: { passed: 1 },
    failed: { failed: 1 },
    blocked: { blocked: 1 },
    skipped: { skipped: 1 },
  };
  return normalizeExecutionCounts({
    ...statuses[receipt.status],
    executed: receipt.status === "blocked" ? 0 : 1,
    total: 1,
    status: receipt.status,
    required,
    note,
  });
}

export function adaptCurrentReceipts(receiptEntries) {
  const byGate = new Map();
  for (const entry of receiptEntries) {
    if (!byGate.has(entry.receipt.gate)) {
      byGate.set(entry.receipt.gate, entry);
    }
  }
  const acceptance = Object.fromEntries(
    RECEIPT_ACCEPTANCE_KEYS.map((key) => [
      key,
      notCollectedAcceptance(
        key === "uat"
          ? "客户 UAT 只能由客户签收证据提供。"
          : "baseline 未执行该运行态，且没有当前可验证回执。",
      ),
    ]),
  );
  const sourceReceipts = [];
  const passedWithArtifacts = (gate) => {
    const entry = byGate.get(gate);
    if (
      !entry ||
      entry.receipt.status !== "passed" ||
      entry.receipt.artifacts.length === 0
    ) {
      return null;
    }
    sourceReceipts.push(entry.path);
    return entry;
  };

  const browser = passedWithArtifacts("browser");
  if (browser) {
    acceptance.browser = normalizeExecutionCounts({
      executed: 1,
      passed: 1,
      total: 1,
      note: "当前 clean commit 的 browser 回执已通过。",
    });
  }
  const rehearsal = passedWithArtifacts("release-rehearsal");
  if (rehearsal) {
    acceptance.readiness = normalizeExecutionCounts({
      executed: 1,
      passed: 1,
      total: 1,
      note: "当前 clean commit 的 release rehearsal 回执已通过。",
    });
  }
  const target = passedWithArtifacts("target-release");
  if (target) {
    acceptance.readiness = normalizeExecutionCounts({
      executed: 1,
      passed: 1,
      total: 1,
      note: "当前 clean commit 的 target release 回执已通过。",
    });
    acceptance.targetEnvironment = normalizeExecutionCounts({
      executed: 1,
      passed: 1,
      total: 1,
      note: "当前 clean commit 的 target release 回执已通过。",
    });
  }

  let t8 = null;
  if (target) {
    t8 = receiptCommandRecord(
      target.receipt,
      "T8 由当前 target-release 回执声明；UAT 仍独立报告。",
    );
  } else if (rehearsal) {
    t8 = {
      ...receiptCommandRecord(
        rehearsal.receipt,
        "本地发布演练不等于目标环境发布。",
      ),
      status: "partial",
    };
  }
  return {
    acceptance,
    gates: { T8: t8 },
    sourceReceipts: [...new Set(sourceReceipts)].sort(),
  };
}

function collectionStatus(stageExecutions) {
  for (const status of ["failed", "blocked", "skipped", "missing", "partial"]) {
    if (Object.values(stageExecutions).some((item) => item.status === status)) {
      return status;
    }
  }
  return "passed";
}

function codeCoverageRecord(parsed, execution, scopeNote) {
  if (!parsed || !parsed.metrics || Object.keys(parsed.metrics).length === 0) {
    return {
      status: execution.status === "passed" ? "missing" : execution.status,
      note: "测试运行没有生成可验证的代码覆盖指标。",
      testExecution: execution,
    };
  }
  return {
    status: execution.status === "passed" ? "collected" : execution.status,
    metrics: parsed.metrics,
    testExecution: execution,
    note: scopeNote,
  };
}

export function buildCoverageEvidence({
  generatedAt,
  repository,
  stageExecutions,
  goCoverage,
  webCoverage,
  goDomains,
  fieldLinkage,
  receiptAdapter,
  affectedPlan,
}) {
  const domains = Object.fromEntries(
    BUSINESS_DOMAIN_KEYS.map((key) => [
      key,
      goDomains[key] || {
        ...emptyCounts(),
        requiredCount: 0,
        status: "missing",
        note: "baseline 没有该业务域的分类证据。",
      },
    ]),
  );
  domains.frontend = fieldLinkage.frontend;
  domains.print = combineExecutionRecords(
    [goDomains.print, fieldLinkage.print],
    "打印域合并 Go PDF 合同与字段联动中的显式打印用例。",
  );
  domains.import = stageExecutions.import;

  const requiredScopes = new Set(affectedPlan?.affectedScopes || []);
  const gateRequired = (scope) => requiredScopes.has(scope);
  const missingOrNotApplicable = (scope, missingNote, notApplicableNote) =>
    gateRequired(scope)
      ? missingRequiredGate(missingNote)
      : notApplicableGate(notApplicableNote);
  const t8 =
    receiptAdapter.gates.T8 ||
    missingOrNotApplicable(
      "T8",
      "affected plan 要求 T8，但 baseline 未执行发布或目标环境操作，且没有当前可验证的专用回执。",
      "affected plan 未要求 T8；baseline 也不执行发布或目标环境操作。",
    );
  if (receiptAdapter.gates.T8) {
    t8.required = gateRequired("T8");
  }

  const gates = {
    T0: commandGateRecord(
      [stageExecutions["t0-static"]],
      "baseline 执行 git diff --check。",
      gateRequired("T0"),
    ),
    T1: commandGateRecord(
      [stageExecutions["t1-docs"]],
      "baseline 执行文档清单合同测试。",
      gateRequired("T1"),
    ),
    T2: missingOrNotApplicable(
      "T2",
      "affected plan 要求 T2，但 baseline 不执行 schema 生成、migration 或数据库读回。",
      "affected plan 未要求 T2；baseline 不执行 schema 或 migration。",
    ),
    T3: commandGateRecord(
      [stageExecutions.go],
      "baseline 执行 Go 全包非 PostgreSQL 单元与合同测试。",
      gateRequired("T3"),
    ),
    T4: commandGateRecord(
      [stageExecutions.go],
      "同一 Go baseline 覆盖 service/server API 与 RBAC 合同。",
      gateRequired("T4"),
    ),
    T5: commandGateRecord(
      [
        stageExecutions["web-lint"],
        stageExecutions["web-css"],
        stageExecutions.web,
      ],
      "baseline 执行 Web lint、CSS 和 Node coverage tests；不包含浏览器。",
      gateRequired("T5"),
    ),
    T6: commandGateRecord(
      [stageExecutions.import],
      "baseline 执行导入 manifest/extract/freeze/dry-run 合同测试。",
      gateRequired("T6"),
    ),
    T7: missingOrNotApplicable(
      "T7",
      "affected plan 要求 T7，但 baseline 未执行隔离 PostgreSQL 或真实业务浏览器链路。",
      "affected plan 未要求 T7；baseline 不执行 PostgreSQL 或真实业务浏览器链路。",
    ),
    T8: t8,
  };

  return {
    schemaVersion: COVERAGE_EVIDENCE_SCHEMA,
    generatedAt,
    repository,
    collector: {
      profile: "baseline",
      status: collectionStatus(stageExecutions),
      stages: Object.fromEntries(
        BASELINE_STAGE_KEYS.map((key) => [
          key,
          {
            status: stageExecutions[key].status,
            executed: stageExecutions[key].executed,
            passed: stageExecutions[key].passed,
            failed: stageExecutions[key].failed,
            skipped: stageExecutions[key].skipped,
          },
        ]),
      ),
      boundaries: [
        "no-postgresql-write",
        "no-real-browser",
        "no-readiness-probe",
        "no-target-deployment",
        "no-uat",
      ],
      affectedPlan: {
        affectedScopes: [...requiredScopes],
        maxAffectedScope: affectedPlan?.maxAffectedScope || "T0",
        localGate: affectedPlan?.localGate || "focused",
        changedFileCount: affectedPlan?.changedFiles?.length || 0,
        followUps: (affectedPlan?.followUps || []).map(({ id, scope }) => ({
          id,
          scope,
        })),
      },
    },
    codeCoverage: {
      go: codeCoverageRecord(
        goCoverage,
        stageExecutions.go,
        "Go baseline 覆盖 go test ./... 中非 PostgreSQL测试实际加载的 package scope。",
      ),
      web: codeCoverageRecord(
        webCoverage,
        stageExecutions.web,
        "Web baseline 覆盖 Node test 实际加载模块，不冒充完整 JSX/browser baseline。",
      ),
    },
    businessCoverage: {
      domains: BUSINESS_DOMAIN_KEYS.map((key) => ({
        key,
        ...domains[key],
      })),
    },
    gates,
    acceptance: receiptAdapter.acceptance,
    sourceReceipts: receiptAdapter.sourceReceipts,
  };
}

async function writeTextAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readGoCoverage(filePath) {
  try {
    return parseGoCoverprofile(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readWebCoverage(result) {
  try {
    return parseNodeNativeCoverage(`${result.stdout}\n${result.stderr}`);
  } catch {
    return null;
  }
}

export function buildBaselineCommandPlan({
  projectRoot,
  goCoverprofile,
  pnpmBin,
}) {
  return [
    [
      "t0-static",
      {
        command: "git",
        args: ["diff", "--check"],
        cwd: projectRoot,
      },
    ],
    [
      "t1-docs",
      {
        command: process.execPath,
        args: [
          "--test",
          "--test-reporter=tap",
          "scripts/qa/docs-inventory.test.mjs",
        ],
        cwd: projectRoot,
      },
    ],
    [
      "go",
      {
        command: "go",
        args: [
          "test",
          "-count=1",
          "-json",
          "-covermode=atomic",
          `-coverprofile=${goCoverprofile}`,
          "-skip",
          BASELINE_GO_SKIP_PATTERN,
          "./...",
        ],
        cwd: path.join(projectRoot, "server"),
      },
    ],
    [
      "web-lint",
      {
        command: pnpmBin,
        args: ["lint"],
        cwd: path.join(projectRoot, "web"),
      },
    ],
    [
      "web-css",
      {
        command: pnpmBin,
        args: ["css"],
        cwd: path.join(projectRoot, "web"),
      },
    ],
    [
      "web-error-codes",
      {
        command: process.execPath,
        args: ["scripts/gen-error-codes.mjs", "--check"],
        cwd: projectRoot,
      },
    ],
    [
      "web",
      {
        command: process.execPath,
        args: [
          "--test",
          "--experimental-test-coverage",
          "--test-reporter=tap",
        ],
        cwd: path.join(projectRoot, "web"),
      },
    ],
    [
      "import",
      {
        command: process.execPath,
        args: ["--test", "--test-reporter=tap", ...IMPORT_TEST_FILES],
        cwd: projectRoot,
      },
    ],
  ];
}

export function resolveCoverageStaging(projectRoot, stagingId) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      String(stagingId || ""),
    )
  ) {
    throw new Error("coverage staging id must be a UUID v4");
  }
  const root = path.join(
    projectRoot,
    "output",
    "qa",
    "coverage",
    ".staging",
    stagingId,
  );
  return {
    root,
    baselineEvidence: path.join(root, "baseline.latest.json"),
    fieldLinkageEvidence: path.join(root, "field-linkage.latest.json"),
    fieldLinkageTap: path.join(root, "field-linkage.tap"),
    candidateReport: path.join(root, "latest.json"),
  };
}

export async function collectBaselineEvidence({
  projectRoot,
  stagingId = randomUUID(),
  execute = runCommand,
  executeFieldLinkage = runFieldLinkageQa,
  repositoryReader = () => readRepositoryIdentity(projectRoot),
  clock = () => new Date(),
}) {
  const expectedRepository = await repositoryReader();
  const staging = resolveCoverageStaging(projectRoot, stagingId);
  const affectedPlan = buildAffectedPlan(
    collectChangedFiles({ root: projectRoot }),
    { root: projectRoot },
  );
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "plush-test-coverage-"),
  );
  const goCoverprofile = path.join(temporaryRoot, "go.coverprofile");
  try {
    const pnpmBin = resolveProjectPnpm(projectRoot);
    const results = {};
    const run = (key, command) => {
      process.stderr.write(`[qa:test-coverage-collect] stage=${key}\n`);
      results[key] = execute(command);
      return results[key];
    };
    for (const [key, command] of buildBaselineCommandPlan({
      projectRoot,
      goCoverprofile,
      pnpmBin,
    })) {
      run(key, command);
    }
    process.stderr.write(
      "[qa:test-coverage-collect] stage=field-linkage\n",
    );
    try {
      await executeFieldLinkage({
        repositoryReader,
        outputDirectory: staging.root,
        nodeTapFile: staging.fieldLinkageTap,
        coverageReportFile: staging.fieldLinkageEvidence,
      });
      results["field-linkage"] = {
        error: "",
        status: 0,
        stdout: "",
        stderr: "",
      };
    } catch {
      results["field-linkage"] = {
        error: "field-linkage-failed",
        status: 1,
        stdout: "",
        stderr: "",
      };
    }

    const stageExecutions = {
      "t0-static": simpleCommandExecution(
        results["t0-static"],
        "git diff --check",
      ),
      "t1-docs": nodeCommandExecution(
        results["t1-docs"],
        "docs inventory contract",
      ),
      go: goCommandExecution(results.go, "Go baseline"),
      "web-lint": simpleCommandExecution(results["web-lint"], "Web lint"),
      "web-css": simpleCommandExecution(results["web-css"], "Web CSS"),
      "web-error-codes": simpleCommandExecution(
        results["web-error-codes"],
        "Web error code generation check",
      ),
      web: nodeCommandExecution(results.web, "Web Node coverage tests"),
      import: nodeCommandExecution(results.import, "Import contract tests"),
      "field-linkage": simpleCommandExecution(
        results["field-linkage"],
        "Field linkage runner",
      ),
    };

    const fieldArtifact = readJsonIfPresent(staging.fieldLinkageEvidence);
    const fieldLinkage = fieldLinkageBusinessRecords({
      artifact: fieldArtifact,
      commandResult: results["field-linkage"],
      repository: expectedRepository,
    });
    const goDomains = classifyGoBusinessDomains(
      results.go.stdout,
      stageExecutions.go,
    );
    const receiptAdapter = adaptCurrentReceipts(
      await currentReceipts(projectRoot, expectedRepository),
    );
    process.stderr.write(
      "[qa:test-coverage-collect] stage=identity-check\n",
    );
    assertRepositoryIdentityEqual(expectedRepository, await repositoryReader());

    return buildCoverageEvidence({
      generatedAt: clock().toISOString(),
      repository: expectedRepository,
      stageExecutions,
      goCoverage: readGoCoverage(goCoverprofile),
      webCoverage: readWebCoverage(results.web),
      goDomains,
      fieldLinkage,
      receiptAdapter,
      affectedPlan,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function discoverCandidateArtifactPaths(projectRoot) {
  const coverageRoot = path.join(projectRoot, "output", "qa", "coverage");
  const excluded = new Set([
    path.basename(AGGREGATED_REPORT_RELATIVE_PATH),
    path.basename(COVERAGE_EVIDENCE_RELATIVE_PATH),
    path.basename(FIELD_LINKAGE_EVIDENCE_RELATIVE_PATH),
  ]);
  try {
    return (await readdir(coverageRoot, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          !excluded.has(entry.name),
      )
      .map((entry) => path.join(coverageRoot, entry.name))
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function remapCandidateEvidencePaths(value, replacements) {
  if (typeof value === "string") return replacements.get(value) || value;
  if (Array.isArray(value)) {
    return value.map((entry) =>
      remapCandidateEvidencePaths(entry, replacements),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        remapCandidateEvidencePaths(entry, replacements),
      ]),
    );
  }
  return value;
}

const relativeEvidencePath = (projectRoot, absolutePath) =>
  path.relative(projectRoot, absolutePath).split(path.sep).join("/");

export async function publishBaselineEvidence({
  projectRoot,
  stagingId,
  evidence,
  repositoryReader = () => readRepositoryIdentity(projectRoot),
  reportBuilder = buildCoverageReport,
  clock = () => new Date(),
}) {
  const staging = resolveCoverageStaging(projectRoot, stagingId);
  const assertIdentity = async () =>
    assertRepositoryIdentityEqual(
      evidence.repository,
      await repositoryReader(),
    );

  await assertIdentity();
  await writeJsonAtomic(staging.baselineEvidence, evidence);
  const artifactPaths = [
    ...(await discoverCandidateArtifactPaths(projectRoot)),
    staging.baselineEvidence,
    staging.fieldLinkageEvidence,
  ];
  const rawCandidate = await reportBuilder({
    projectRoot,
    repository: evidence.repository,
    generatedAt: clock().toISOString(),
    artifactPaths,
  });
  const candidate = remapCandidateEvidencePaths(
    rawCandidate,
    new Map([
      [
        relativeEvidencePath(projectRoot, staging.baselineEvidence),
        COVERAGE_EVIDENCE_RELATIVE_PATH,
      ],
      [
        relativeEvidencePath(projectRoot, staging.fieldLinkageEvidence),
        FIELD_LINKAGE_EVIDENCE_RELATIVE_PATH,
      ],
    ]),
  );
  const candidateText = JSON.stringify(candidate);
  if (
    candidate.schemaVersion !== "plush-test-coverage-report/v1" ||
    !repositoryIdentitiesEqual(candidate.repository, evidence.repository) ||
    candidateText.includes("/.staging/") ||
    candidateText.includes("\\.staging\\")
  ) {
    throw new Error("coverage candidate report is invalid");
  }
  await writeJsonAtomic(staging.candidateReport, candidate);
  const candidateReadback = JSON.parse(
    await readFile(staging.candidateReport, "utf8"),
  );
  if (
    candidateReadback.schemaVersion !==
      "plush-test-coverage-report/v1" ||
    !repositoryIdentitiesEqual(
      candidateReadback.repository,
      evidence.repository,
    )
  ) {
    throw new Error("coverage candidate report readback failed");
  }

  await assertIdentity();
  await writeJsonAtomic(
    path.join(projectRoot, COVERAGE_EVIDENCE_RELATIVE_PATH),
    evidence,
  );
  await assertIdentity();
  if (existsSync(staging.fieldLinkageEvidence)) {
    await writeJsonAtomic(
      path.join(projectRoot, FIELD_LINKAGE_EVIDENCE_RELATIVE_PATH),
      JSON.parse(await readFile(staging.fieldLinkageEvidence, "utf8")),
    );
    await assertIdentity();
  }
  const canonicalReportPath = path.join(
    projectRoot,
    AGGREGATED_REPORT_RELATIVE_PATH,
  );
  let previousReport = null;
  try {
    previousReport = await readFile(canonicalReportPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeJsonAtomic(canonicalReportPath, candidateReadback);
  try {
    await assertIdentity();
  } catch (error) {
    if (previousReport === null) {
      await rm(canonicalReportPath, { force: true });
    } else {
      await writeTextAtomic(canonicalReportPath, previousReport);
    }
    throw error;
  }
  return candidateReadback;
}

async function findProjectRoot(cwd) {
  const result = runCommand({
    command: "git",
    args: ["rev-parse", "--show-toplevel"],
    cwd,
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error("repository root is unavailable");
  }
  return result.stdout.trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const projectRoot = await findProjectRoot(process.cwd());
  await assertProjectNodeRuntime(projectRoot);
  const stagingId = randomUUID();
  const staging = resolveCoverageStaging(projectRoot, stagingId);
  let evidence;
  try {
    evidence = await collectBaselineEvidence({ projectRoot, stagingId });
    if (!options.write) {
      process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    } else {
      process.stderr.write("[qa:test-coverage-collect] stage=aggregate\n");
      await publishBaselineEvidence({
        projectRoot,
        stagingId,
        evidence,
      });
      process.stdout.write(
        `[qa:test-coverage-collect] evidence=${COVERAGE_EVIDENCE_RELATIVE_PATH} report=${AGGREGATED_REPORT_RELATIVE_PATH}\n`,
      );
    }
  } finally {
    await rm(staging.root, { recursive: true, force: true });
  }
  if (evidence.collector.status !== "passed") process.exitCode = 2;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`[qa:test-coverage-collect] ${error.message}\n`);
    process.exitCode = 1;
  });
}
