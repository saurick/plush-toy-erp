import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { applyAttachmentData } from "./manual-acceptance-attachment-data.mjs";
import {
  manualAcceptanceFormalAccountBootstrapConfirmation,
  runManualAcceptanceAccountScenarioCli,
} from "./manual-acceptance-account-scenarios.mjs";
import { runManualAcceptanceFactCli } from "./manual-acceptance-fact-data.mjs";
import {
  MANUAL_ACCEPTANCE_GENERATOR_STAGES,
  MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
} from "./manual-acceptance-page-data-contract.mjs";
import { runManualAcceptanceReadinessCli } from "./manual-acceptance-readiness.mjs";
import {
  MANUAL_ACCEPTANCE_CORE_UNIT_CODE,
  MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES,
  resolveManualAcceptanceCoreReferences,
  runManualAcceptanceSourceDataCli,
} from "./manual-acceptance-source-data.mjs";
import {
  CONFIRM_PHRASE as TASK_CONFIRM_PHRASE,
  applyManualAcceptanceTaskData,
  buildManualAcceptanceTaskDataPlan,
  buildManualAcceptanceTaskSchedule,
} from "./manual-acceptance-task-data.mjs";
import {
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceDatabaseIdentity,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

export const MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION =
  "manual-acceptance-dataset-runner-v5";

const DATASET_CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
const ACCOUNT_CONFIRM_PHRASE = "APPLY_SIMULATED_ACCOUNT_SCENARIOS";
const ATTACHMENT_CONFIRM_PHRASE =
  "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS";
export const MANUAL_ACCEPTANCE_DATASET_OUTPUT_ROOT =
  "output/qa/manual-acceptance/datasets";
const BROWSER_ONLY_READINESS_GROUPS = Object.freeze({
  printPreviewPages: 5,
  printWorkspacePages: 5,
});
const BROWSER_ONLY_READINESS_TARGET_COUNT = Object.values(
  BROWSER_ONLY_READINESS_GROUPS,
).reduce((total, count) => total + count, 0);

export const MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES = Object.freeze(
  [
    {
      key: "customers",
      domain: "masterdata",
      method: "list_customers",
      listKey: "customers",
    },
    {
      key: "suppliers",
      domain: "masterdata",
      method: "list_suppliers",
      listKey: "suppliers",
    },
    {
      key: "materials",
      domain: "masterdata",
      method: "list_materials",
      listKey: "materials",
    },
    {
      key: "products",
      domain: "masterdata",
      method: "list_products",
      listKey: "products",
    },
    {
      key: "productSkus",
      domain: "masterdata",
      method: "list_product_skus",
      listKey: "product_skus",
    },
    {
      key: "processes",
      domain: "masterdata",
      method: "list_processes",
      listKey: "processes",
    },
    {
      key: "bomVersions",
      domain: "bom",
      method: "list_bom_versions",
      listKey: "bom_versions",
    },
    {
      key: "salesOrders",
      domain: "sales_order",
      method: "list_sales_orders",
      listKey: "sales_orders",
    },
    {
      key: "purchaseOrders",
      domain: "purchase_order",
      method: "list_purchase_orders",
      listKey: "purchase_orders",
    },
    {
      key: "outsourcingOrders",
      domain: "outsourcing_order",
      method: "list_outsourcing_orders",
      listKey: "outsourcing_orders",
    },
    {
      key: "productionOrders",
      domain: "production_order",
      method: "list_production_orders",
      listKey: "production_orders",
      includeCustomerKey: false,
    },
    {
      key: "purchaseReceipts",
      domain: "purchase",
      method: "list_purchase_receipts",
      listKey: "purchase_receipts",
    },
    {
      key: "purchaseReturns",
      domain: "purchase",
      method: "list_purchase_returns",
      listKey: "purchase_returns",
      includeCustomerKey: false,
    },
    {
      key: "purchaseReceiptAdjustments",
      domain: "purchase",
      method: "list_purchase_receipt_adjustments",
      listKey: "purchase_receipt_adjustments",
      includeCustomerKey: false,
    },
    {
      key: "qualityInspections",
      domain: "quality",
      method: "list_quality_inspections",
      listKey: "quality_inspections",
    },
    {
      key: "inventoryBalances",
      domain: "inventory",
      method: "list_inventory_balances",
      listKey: "inventory_balances",
    },
    {
      key: "inventoryLots",
      domain: "inventory",
      method: "list_inventory_lots",
      listKey: "inventory_lots",
    },
    {
      key: "inventoryTxns",
      domain: "inventory",
      method: "list_inventory_txns",
      listKey: "inventory_txns",
    },
    {
      key: "productionFacts",
      domain: "operational_fact",
      method: "list_production_facts",
      listKey: "production_facts",
    },
    {
      key: "outsourcingFacts",
      domain: "operational_fact",
      method: "list_outsourcing_facts",
      listKey: "outsourcing_facts",
    },
    {
      key: "stockReservations",
      domain: "operational_fact",
      method: "list_stock_reservations",
      listKey: "stock_reservations",
    },
    {
      key: "shipments",
      domain: "operational_fact",
      method: "list_shipments",
      listKey: "shipments",
    },
    {
      key: "financeFacts",
      domain: "operational_fact",
      method: "list_finance_facts",
      listKey: "finance_facts",
    },
    {
      key: "workflowTasks",
      domain: "workflow",
      method: "list_tasks",
      listKey: "tasks",
    },
  ].map((probe) => Object.freeze(probe)),
);

function pageGeneratorEntrypoint(stageKey) {
  const entrypoints = MANUAL_ACCEPTANCE_GENERATOR_STAGES[stageKey]?.entrypoints;
  if (!Array.isArray(entrypoints) || entrypoints.length !== 1) {
    throw new Error(
      `page generator stage ${stageKey} must have exactly one registered entrypoint`,
    );
  }
  return entrypoints[0];
}

const COMPONENT_ENTRYPOINTS = Object.freeze({
  core: "scripts/qa/manual-acceptance-dataset-runner.mjs#core-rpc-verifier",
  baseline:
    "scripts/qa/manual-acceptance-dataset-runner.mjs#empty-baseline-rpc-verifier",
  role: pageGeneratorEntrypoint("role"),
  source: pageGeneratorEntrypoint("source"),
  task: pageGeneratorEntrypoint("task"),
  facts: pageGeneratorEntrypoint("facts"),
  "purchase-quality": pageGeneratorEntrypoint("facts"),
  attachments: "scripts/qa/manual-acceptance-attachment-data.mjs",
  readiness: "scripts/qa/manual-acceptance-readiness.mjs",
});

export const MANUAL_ACCEPTANCE_DATASET_STAGE_REPORT_FILES = Object.freeze({
  core: "apply-report.json",
  baseline: "verify-report.json",
  role: "apply-report.json",
  source: "apply-report.json",
  task: "apply-report.json",
  facts: "apply-report.json",
  "purchase-quality": "verify-report.json",
  attachments: "apply-report.json",
  readiness: "verify-report.json",
});

export const MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS = Object.freeze([
  "contract",
  "alias",
  "policyTarget",
  "backendURL",
  "databaseName",
  "confirmation",
  "attestation",
  "credentials",
  "reportRoot",
  "executionPolicy",
]);

export class ManualAcceptanceDatasetRunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ManualAcceptanceDatasetRunnerError";
    this.code = String(code || "dataset_runner_failed");
    this.details = jsonRecord(details, "runner error details");
  }

  toBlockedReason(stageKey) {
    return {
      code: this.code,
      stageKey,
      runnerRevision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
      ...this.details,
    };
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJSON(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJSON(item)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`unsupported JSON value ${typeof value}`);
}

function jsonRecord(value, name) {
  if (!isPlainRecord(value)) {
    throw new Error(`${name} must be an explicit object`);
  }
  return JSON.parse(canonicalJSON(value));
}

export function digestManualAcceptanceDatasetComponentReport(report) {
  return createHash("sha256").update(canonicalJSON(report)).digest("hex");
}

function requiredText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new ManualAcceptanceDatasetRunnerError(
      "runner_input_invalid",
      `${name} is required`,
      { field: name },
    );
  }
  return text;
}

function reportDirectory(targetAdapter, stageKey) {
  return path.join(targetAdapter.reportRoot, stageKey);
}

export function manualAcceptanceDatasetStageReportPath({
  outputRoot = MANUAL_ACCEPTANCE_DATASET_OUTPUT_ROOT,
  dataVersion,
  targetAlias,
  stageKey,
}) {
  const fileName = MANUAL_ACCEPTANCE_DATASET_STAGE_REPORT_FILES[stageKey];
  if (!fileName) {
    throw new ManualAcceptanceDatasetRunnerError(
      "stage_report_path_invalid",
      `stage ${stageKey} has no canonical report file`,
      { stageKey },
    );
  }
  return path.join(
    outputRoot,
    requiredText(dataVersion, "dataVersion"),
    requiredText(targetAlias, "targetAlias"),
    stageKey,
    fileName,
  );
}

function reportPathFor(targetAdapter, stageKey, dataVersion) {
  return manualAcceptanceDatasetStageReportPath({
    outputRoot: path.dirname(path.dirname(targetAdapter.reportRoot)),
    dataVersion,
    targetAlias: targetAdapter.alias,
    stageKey,
  });
}

async function persistReport(reportPath, report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function resolveCredentials(deps = {}) {
  const credentials = deps.credentials || {};
  return {
    rolePassword:
      credentials.rolePassword ??
      deps.password ??
      process.env.MANUAL_ACCEPTANCE_PASSWORD ??
      process.env.TRIAL_ACCOUNT_PASSWORD ??
      process.env.ERP_ROLE_DEMO_PASSWORD ??
      "",
    adminPassword:
      credentials.adminPassword ??
      deps.adminPassword ??
      process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD ??
      "",
  };
}

export function buildManualAcceptanceRunnerBusinessInput(context) {
  const stage = context?.stage || {};
  return {
    contract: "manual-acceptance-dataset-runner-business-input-v1",
    datasetKey: requiredText(
      context?.semanticPlan?.datasetKey,
      "semanticPlan.datasetKey",
    ),
    dataVersion: requiredText(context?.dataVersion, "dataVersion"),
    runId: requiredText(context?.semanticPlan?.runId, "semanticPlan.runId"),
    dateAnchorUtc: requiredText(context?.dateAnchorUtc, "dateAnchorUtc"),
    taskScheduleAnchorUtc: requiredText(
      context?.taskScheduleAnchorUtc,
      "taskScheduleAnchorUtc",
    ),
    semanticDigest: requiredText(context?.semanticDigest, "semanticDigest"),
    prefixes: structuredClone(context.semanticPlan.prefixes),
    stage: {
      key: requiredText(stage.key, "stage.key"),
      purpose: requiredText(stage.purpose, `${stage.key}.purpose`),
      writesBusinessData: stage.writesBusinessData === true,
      commands: structuredClone(stage.commands || []),
      expected: structuredClone(stage.expected || {}),
      replay: requiredText(stage.replay, `${stage.key}.replay`),
      cleanupPolicy: requiredText(
        stage.cleanupPolicy,
        `${stage.key}.cleanupPolicy`,
      ),
    },
  };
}

export function buildManualAcceptanceTargetAdapter(context, deps = {}) {
  const target = context?.target || {};
  const alias = requiredText(target.alias, "target.alias");
  const outputRoot = deps.outputRoot || MANUAL_ACCEPTANCE_DATASET_OUTPUT_ROOT;
  const adapter = {
    contract: "manual-acceptance-dataset-target-adapter-v1",
    alias,
    policyTarget: requiredText(target.policyTarget, "target.policyTarget"),
    backendURL: requiredText(target.backendURL, "target.backendURL"),
    databaseName: requiredText(target.databaseName, "target.databaseName"),
    confirmation: context.targetConfirmation || null,
    attestation: context.targetAttestation
      ? structuredClone(context.targetAttestation)
      : null,
    credentials: resolveCredentials(deps),
    reportRoot: path.join(outputRoot, context.dataVersion, alias),
    executionPolicy: structuredClone(
      context.stage?.targetExecution?.[alias] || {
        seedAllowed: false,
        allowedOperations: ["verified"],
      },
    ),
  };
  const keys = Object.keys(adapter);
  if (
    keys.length !== MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS.length ||
    keys.some(
      (key, index) => key !== MANUAL_ACCEPTANCE_TARGET_ADAPTER_KEYS[index],
    )
  ) {
    throw new ManualAcceptanceDatasetRunnerError(
      "target_adapter_invalid",
      "target adapter contains fields outside the environment binding contract",
      { keys },
    );
  }
  return adapter;
}

function componentInvocation(execution) {
  return {
    businessInput: structuredClone(execution.businessInput),
    targetAdapter: structuredClone(execution.targetAdapter),
    reportPath: execution.reportPath,
    reportDirectory: path.dirname(execution.reportPath),
  };
}

function normalizeComponentResult(raw, execution, defaultOperation) {
  const wrapped = raw?.report ? raw : { report: raw };
  if (!isPlainRecord(wrapped) || !isPlainRecord(wrapped.report)) {
    throw new ManualAcceptanceDatasetRunnerError(
      "component_report_invalid",
      `${execution.stageKey} component must return a report object`,
      { stageKey: execution.stageKey },
    );
  }
  const report = JSON.parse(canonicalJSON(wrapped.report));
  const input = execution.businessInput;
  const adapter = execution.targetAdapter;
  for (const [field, expected] of Object.entries({
    datasetKey: input.datasetKey,
    dataVersion: input.dataVersion,
    runId: input.runId,
    target: adapter.policyTarget,
    backendURL: adapter.backendURL,
    databaseName: adapter.databaseName,
  })) {
    if (String(report[field] ?? "") !== String(expected)) {
      throw new ManualAcceptanceDatasetRunnerError(
        "component_identity_mismatch",
        `${execution.stageKey} component report ${field} does not match the runner binding`,
        { stageKey: execution.stageKey, field },
      );
    }
  }
  if (execution.stageKey === "task") {
    const expectedSchedule = buildManualAcceptanceTaskSchedule(
      Math.floor(Date.parse(input.taskScheduleAnchorUtc) / 1000),
    );
    if (canonicalJSON(report.schedule) !== canonicalJSON(expectedSchedule)) {
      throw new ManualAcceptanceDatasetRunnerError(
        "task_schedule_anchor_mismatch",
        "task component report does not reuse the dataset task schedule anchor",
        { stageKey: execution.stageKey },
      );
    }
  }
  if (!isPlainRecord(report.summary)) {
    throw new ManualAcceptanceDatasetRunnerError(
      "component_summary_missing",
      `${execution.stageKey} component report must include an explicit summary`,
      { stageKey: execution.stageKey },
    );
  }
  const operation = String(
    wrapped.operation || report.operation || defaultOperation,
  );
  const reportPath = String(wrapped.reportPath || execution.reportPath);
  if (path.resolve(reportPath) !== path.resolve(execution.reportPath)) {
    throw new ManualAcceptanceDatasetRunnerError(
      "component_report_path_mismatch",
      `${execution.stageKey} component report path is not canonical`,
      { stageKey: execution.stageKey },
    );
  }
  return {
    operation,
    report,
    reportPath,
    summary: jsonRecord(wrapped.summary || report.summary, "component summary"),
    references: isPlainRecord(wrapped.references)
      ? jsonRecord(wrapped.references, "component references")
      : {},
  };
}

async function executeRegisteredComponent(
  execution,
  defaultComponent,
  defaultOperation,
) {
  const injected = execution.deps.components?.[execution.stageKey];
  const component = injected || defaultComponent;
  if (typeof component !== "function") {
    throw new ManualAcceptanceDatasetRunnerError(
      "component_entrypoint_unavailable",
      `${execution.stageKey} has no safe registered component entrypoint`,
      {
        stageKey: execution.stageKey,
        handlerId: execution.handlerId,
        componentEntrypoint: COMPONENT_ENTRYPOINTS[execution.stageKey],
      },
    );
  }
  const raw = await component(componentInvocation(execution));
  const normalized = normalizeComponentResult(raw, execution, defaultOperation);
  if (!raw?.reportPath) {
    await persistReport(normalized.reportPath, normalized.report);
  }
  return normalized;
}

function receipt(execution, component) {
  const digest = digestManualAcceptanceDatasetComponentReport(component.report);
  return {
    ok: true,
    status: "completed",
    stageKey: execution.stageKey,
    dataVersion: execution.businessInput.dataVersion,
    semanticDigest: execution.businessInput.semanticDigest,
    operation: component.operation,
    summary: component.summary,
    references: {
      ...component.references,
      runner: {
        revision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
        handlerId: execution.handlerId,
        componentEntrypoint: COMPONENT_ENTRYPOINTS[execution.stageKey],
        componentDigest: digest,
        reportPath: component.reportPath,
      },
      component: {
        datasetKey:
          component.report.datasetKey || execution.businessInput.datasetKey,
        dataVersion:
          component.report.dataVersion || execution.businessInput.dataVersion,
        runId: component.report.runId || execution.businessInput.runId,
        target: component.report.target || execution.targetAdapter.policyTarget,
        backendURL: component.report.backendURL,
        databaseName: component.report.databaseName,
        semanticDigest: component.report.semanticDigest || null,
      },
    },
  };
}

function requiredCredential(value, field, stageKey) {
  const text = String(value || "").trim();
  if (!text) {
    throw new ManualAcceptanceDatasetRunnerError(
      "credential_binding_missing",
      `${stageKey} requires target adapter credential ${field}`,
      { stageKey, credential: field },
    );
  }
  return text;
}

async function coreRPC({
  backendURL,
  domain,
  method,
  params = {},
  includeCustomerKey = true,
  token,
  fetchImpl = fetch,
  stageKey = "core",
}) {
  const response = await fetchImpl(
    new URL(`/rpc/${domain}`, `${backendURL}/`).toString(),
    {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `manual-acceptance-${stageKey}-${domain}-${method}`,
        method,
        params:
          domain === "auth" || !includeCustomerKey
            ? params
            : { customer_key: "yoyoosun", ...params },
      }),
    },
  );
  if (response.redirected === true) {
    throw new ManualAcceptanceDatasetRunnerError(
      `${stageKey}_verifier_redirected`,
      `${domain}.${method} refused a redirected response`,
      { stageKey, domain, method },
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || body?.result?.code !== 0) {
    throw new ManualAcceptanceDatasetRunnerError(
      `${stageKey}_verifier_rpc_failed`,
      `${domain}.${method} failed`,
      {
        stageKey,
        domain,
        method,
        httpStatus: response.status,
        rpcCode: body?.result?.code ?? null,
      },
    );
  }
  return body.result.data || {};
}

export async function verifyManualAcceptanceCoreReferences({
  backendURL,
  policyTarget,
  databaseName,
  datasetKey,
  dataVersion,
  runId,
  targetAttestation,
  adminPassword,
  fetchImpl,
}) {
  const policy = resolveManualAcceptanceTarget({
    backendURL,
    target: policyTarget,
    datasetKey,
    dataVersion,
    runId,
    databaseName,
  });
  let attestedTarget;
  if (policy.external) {
    attestedTarget = assertManualAcceptanceTargetAttestation({
      policy,
      attestation: targetAttestation,
    });
  } else if (targetAttestation) {
    throw new ManualAcceptanceDatasetRunnerError(
      "core_verifier_attestation_forbidden",
      "local core verification must not receive a remote target attestation",
      { stageKey: "core" },
    );
  }
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy,
    attestation: attestedTarget,
    fetchImpl,
  });
  const adminLogin = await coreRPC({
    backendURL: policy.backendURL,
    domain: "auth",
    method: "admin_login",
    params: {
      username: "admin",
      password: requiredCredential(adminPassword, "adminPassword", "core"),
    },
    fetchImpl,
  });
  const adminToken = requiredText(
    adminLogin.access_token || adminLogin.token,
    "admin access token",
  );
  const capabilities = await coreRPC({
    backendURL: policy.backendURL,
    domain: "debug",
    method: "capabilities",
    params: {},
    token: adminToken,
    fetchImpl,
  });
  const databaseIdentity = assertManualAcceptanceDatabaseIdentity({
    policy,
    capabilities,
  });
  assertManualAcceptanceCapabilitiesPolicy({ policy, capabilities });
  const sessionData = await coreRPC({
    backendURL: policy.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    params: {},
    token: adminToken,
    fetchImpl,
  });
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy,
    capabilities,
    session: sessionData.session,
  });
  const queryBase = {
    active_only: true,
    limit: 200,
  };
  const [unitData, warehouseData] = await Promise.all([
    coreRPC({
      backendURL: policy.backendURL,
      domain: "masterdata",
      method: "list_units",
      params: { ...queryBase, keyword: MANUAL_ACCEPTANCE_CORE_UNIT_CODE },
      token: adminToken,
      fetchImpl,
    }),
    coreRPC({
      backendURL: policy.backendURL,
      domain: "masterdata",
      method: "list_warehouses",
      params: { ...queryBase, keyword: "YS5-CK-" },
      token: adminToken,
      fetchImpl,
    }),
  ]);
  try {
    resolveManualAcceptanceCoreReferences({
      units: unitData.units,
      warehouses: warehouseData.warehouses,
    });
  } catch (error) {
    throw new ManualAcceptanceDatasetRunnerError(
      "core_business_codes_incomplete",
      String(error?.message || error),
      { stageKey: "core" },
    );
  }
  return {
    databaseName: databaseIdentity.databaseName,
    configRevision: runtime.configRevision,
    configProductVersion: runtime.configProductVersion,
    configApplyPurpose: runtime.configApplyPurpose,
    configDatasetVersion: runtime.configDatasetVersion ?? null,
    configTarget: runtime.configTarget ?? null,
    unitCode: MANUAL_ACCEPTANCE_CORE_UNIT_CODE,
    warehouseCodes: Object.values(MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES),
    summary: { units: 1, warehouses: 4 },
  };
}

const BASELINE_CONFIG_FIELDS = Object.freeze([
  "configRevision",
  "configProductVersion",
  "configApplyPurpose",
  "configDatasetVersion",
  "configTarget",
]);

function exactBaselineList(data, probe, expectedTotal) {
  const items = data?.[probe.listKey];
  if (!Array.isArray(items)) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_list_missing",
      `${probe.domain}.${probe.method} response is missing ${probe.listKey}`,
      {
        stageKey: "baseline",
        objectKey: probe.key,
        listKey: probe.listKey,
      },
    );
  }
  if (!Number.isSafeInteger(data?.total) || data.total < 0) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_total_missing",
      `${probe.domain}.${probe.method} response is missing an exact total`,
      { stageKey: "baseline", objectKey: probe.key },
    );
  }
  if (data.total !== expectedTotal || items.length !== expectedTotal) {
    throw new ManualAcceptanceDatasetRunnerError(
      expectedTotal === 0
        ? "empty_baseline_not_empty"
        : "empty_baseline_core_mismatch",
      `${probe.key} must contain exactly ${expectedTotal} records before dataset apply`,
      {
        stageKey: "baseline",
        objectKey: probe.key,
        expectedTotal,
        actualTotal: data.total,
        returned: items.length,
      },
    );
  }
  return items;
}

function assertBaselineCoreCodes(units, warehouses) {
  const unitCodes = units.map((item) => String(item?.code || "")).sort();
  const warehouseCodes = warehouses
    .map((item) => String(item?.code || ""))
    .sort();
  const expectedUnitCodes = [MANUAL_ACCEPTANCE_CORE_UNIT_CODE];
  const expectedWarehouseCodes = Object.values(
    MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES,
  ).sort();
  if (
    JSON.stringify(unitCodes) !== JSON.stringify(expectedUnitCodes) ||
    JSON.stringify(warehouseCodes) !== JSON.stringify(expectedWarehouseCodes)
  ) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_core_code_mismatch",
      "fresh baseline must contain only the exact V5 unit and warehouse codes",
      {
        stageKey: "baseline",
        expectedUnitCodes,
        actualUnitCodes: unitCodes,
        expectedWarehouseCodes,
        actualWarehouseCodes: warehouseCodes,
      },
    );
  }
}

export async function verifyManualAcceptanceEmptyBaseline({
  backendURL,
  policyTarget,
  databaseName,
  datasetKey,
  dataVersion,
  runId,
  targetAttestation,
  adminPassword,
  coreReport,
  fetchImpl,
}) {
  const policy = resolveManualAcceptanceTarget({
    backendURL,
    target: policyTarget,
    datasetKey,
    dataVersion,
    runId,
    databaseName,
  });
  let attestedTarget;
  if (policy.external) {
    attestedTarget = assertManualAcceptanceTargetAttestation({
      policy,
      attestation: targetAttestation,
    });
  } else if (targetAttestation) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_attestation_forbidden",
      "local empty-baseline verification must not receive a remote target attestation",
      { stageKey: "baseline" },
    );
  }
  const runtimeIdentity =
    await assertManualAcceptanceRuntimeIdentityPrecondition({
      policy,
      attestation: attestedTarget,
      fetchImpl,
    });
  const adminLogin = await coreRPC({
    backendURL: policy.backendURL,
    domain: "auth",
    method: "admin_login",
    params: {
      username: "admin",
      password: requiredCredential(adminPassword, "adminPassword", "baseline"),
    },
    fetchImpl,
    stageKey: "baseline",
  });
  const adminToken = requiredText(
    adminLogin.access_token || adminLogin.token,
    "admin access token",
  );
  const capabilities = await coreRPC({
    backendURL: policy.backendURL,
    domain: "debug",
    method: "capabilities",
    params: {},
    token: adminToken,
    fetchImpl,
    stageKey: "baseline",
  });
  const databaseIdentity = assertManualAcceptanceDatabaseIdentity({
    policy,
    capabilities,
  });
  assertManualAcceptanceCapabilitiesPolicy({ policy, capabilities });
  const sessionData = await coreRPC({
    backendURL: policy.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    params: {},
    token: adminToken,
    fetchImpl,
    stageKey: "baseline",
  });
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy,
    capabilities,
    session: sessionData.session,
  });
  if (!isPlainRecord(coreReport)) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_core_receipt_missing",
      "empty-baseline verification requires the completed core report",
      { stageKey: "baseline" },
    );
  }
  if (String(coreReport.databaseName || "") !== databaseIdentity.databaseName) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_core_identity_mismatch",
      "empty-baseline database identity does not match the completed core report",
      { stageKey: "baseline", field: "databaseName" },
    );
  }
  for (const field of BASELINE_CONFIG_FIELDS) {
    if (String(coreReport[field] ?? "") !== String(runtime[field] ?? "")) {
      throw new ManualAcceptanceDatasetRunnerError(
        "empty_baseline_customer_config_mismatch",
        `empty-baseline customer configuration ${field} does not match the completed core report`,
        { stageKey: "baseline", field },
      );
    }
  }

  const query = async (probe, params) =>
    coreRPC({
      backendURL: policy.backendURL,
      domain: probe.domain,
      method: probe.method,
      params,
      includeCustomerKey: probe.includeCustomerKey !== false,
      token: adminToken,
      fetchImpl,
      stageKey: "baseline",
    });
  const unitProbe = {
    key: "units",
    domain: "masterdata",
    method: "list_units",
    listKey: "units",
  };
  const warehouseProbe = {
    key: "warehouses",
    domain: "masterdata",
    method: "list_warehouses",
    listKey: "warehouses",
  };
  const units = exactBaselineList(
    await query(unitProbe, { limit: 200, offset: 0 }),
    unitProbe,
    1,
  );
  const warehouses = exactBaselineList(
    await query(warehouseProbe, { limit: 200, offset: 0 }),
    warehouseProbe,
    4,
  );
  assertBaselineCoreCodes(units, warehouses);

  const zeroCounts = {};
  for (const probe of MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES) {
    exactBaselineList(await query(probe, { limit: 1, offset: 0 }), probe, 0);
    zeroCounts[probe.key] = 0;
  }
  return {
    databaseName: databaseIdentity.databaseName,
    runtimeIdentity: {
      scope: policy.external ? "release-v1" : "database-v1",
      proof: runtimeIdentity.proof,
      databaseName: runtimeIdentity.databaseName,
      release: runtimeIdentity.release ?? null,
      migration: runtimeIdentity.migration ?? null,
    },
    customerConfig: Object.fromEntries(
      BASELINE_CONFIG_FIELDS.map((field) => [field, runtime[field] ?? null]),
    ),
    core: {
      units: 1,
      warehouses: 4,
      unitCodes: [MANUAL_ACCEPTANCE_CORE_UNIT_CODE],
      warehouseCodes: Object.values(
        MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES,
      ).sort(),
    },
    zeroCounts,
  };
}

async function defaultCoreComponent(invocation, deps) {
  const { businessInput, targetAdapter } = invocation;
  const prefix = requiredText(businessInput.prefixes?.core, "prefixes.core");
  const verified = await verifyManualAcceptanceCoreReferences({
    backendURL: targetAdapter.backendURL,
    databaseName: targetAdapter.databaseName,
    policyTarget: targetAdapter.policyTarget,
    datasetKey: businessInput.datasetKey,
    dataVersion: businessInput.dataVersion,
    runId: businessInput.runId,
    targetAttestation: targetAdapter.attestation || undefined,
    adminPassword: targetAdapter.credentials.adminPassword,
    fetchImpl: deps.fetchImpl,
  });
  return {
    operation: "verified",
    references: {
      businessCodes: {
        unit: verified.unitCode,
        warehouses: verified.warehouseCodes,
      },
    },
    report: {
      mode: "verify",
      scope: "manual-acceptance-core-data",
      simulatedOnly: true,
      datasetKey: businessInput.datasetKey,
      dataVersion: businessInput.dataVersion,
      runId: businessInput.runId,
      target: targetAdapter.policyTarget,
      backendURL: targetAdapter.backendURL,
      databaseName: verified.databaseName,
      configRevision: verified.configRevision,
      configProductVersion: verified.configProductVersion,
      configApplyPurpose: verified.configApplyPurpose,
      configDatasetVersion: verified.configDatasetVersion,
      configTarget: verified.configTarget,
      prefix,
      businessCodes: {
        unit: verified.unitCode,
        warehouses: verified.warehouseCodes,
      },
      summary: {
        ...verified.summary,
        seedExecuted: false,
      },
    },
  };
}

async function defaultBaselineComponent(invocation, deps) {
  const { businessInput, targetAdapter } = invocation;
  const core = deps.state.componentReports.get("core");
  if (!core?.report) {
    throw new ManualAcceptanceDatasetRunnerError(
      "empty_baseline_core_receipt_missing",
      "empty-baseline verification can only run after the completed core stage",
      { stageKey: "baseline" },
    );
  }
  const verified = await verifyManualAcceptanceEmptyBaseline({
    backendURL: targetAdapter.backendURL,
    databaseName: targetAdapter.databaseName,
    policyTarget: targetAdapter.policyTarget,
    datasetKey: businessInput.datasetKey,
    dataVersion: businessInput.dataVersion,
    runId: businessInput.runId,
    targetAttestation: targetAdapter.attestation || undefined,
    adminPassword: targetAdapter.credentials.adminPassword,
    coreReport: core.report,
    fetchImpl: deps.fetchImpl,
  });
  return {
    operation: "verified",
    references: {
      coreReport: {
        reportPath: core.reportPath,
        componentDigest: digestManualAcceptanceDatasetComponentReport(
          core.report,
        ),
      },
      runtimeIdentity: verified.runtimeIdentity,
    },
    report: {
      contract: "manual-acceptance-empty-baseline-report-v1",
      mode: "verify",
      scope: "manual-acceptance-empty-business-baseline",
      simulatedOnly: true,
      datasetKey: businessInput.datasetKey,
      dataVersion: businessInput.dataVersion,
      runId: businessInput.runId,
      target: targetAdapter.policyTarget,
      backendURL: targetAdapter.backendURL,
      databaseName: verified.databaseName,
      runtimeIdentity: verified.runtimeIdentity,
      customerConfig: verified.customerConfig,
      core: verified.core,
      zeroCounts: verified.zeroCounts,
      summary: {
        exactEmptyBusinessBaseline: true,
        checkedBusinessObjectKinds:
          MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length,
        zeroBusinessRecords: Object.values(verified.zeroCounts).every(
          (count) => count === 0,
        ),
        units: verified.core.units,
        warehouses: verified.core.warehouses,
      },
    },
  };
}

async function defaultSourceComponent(invocation, deps) {
  const { businessInput, targetAdapter, reportDirectory } = invocation;
  const result = await runManualAcceptanceSourceDataCli(
    [
      "--apply",
      "--target",
      targetAdapter.policyTarget,
      "--data-version",
      businessInput.dataVersion,
      "--run-id",
      businessInput.runId,
      "--backend-url",
      targetAdapter.backendURL,
      "--database-name",
      targetAdapter.databaseName,
      "--out",
      reportDirectory,
    ],
    {
      password: requiredCredential(
        targetAdapter.credentials.rolePassword,
        "rolePassword",
        "source",
      ),
      adminPassword: requiredCredential(
        targetAdapter.credentials.adminPassword,
        "adminPassword",
        "source",
      ),
      confirmPhrase: DATASET_CONFIRM_PHRASE,
      targetConfirmation: targetAdapter.confirmation || undefined,
      targetAttestation: targetAdapter.attestation || undefined,
      fetchImpl: deps.fetchImpl,
    },
  );
  if (result.exitCode !== 0 || !result.report || !result.output?.jsonPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "source_component_failed",
      "source component did not return a successful apply report",
      { stageKey: "source", exitCode: result.exitCode },
    );
  }
  return {
    operation: "applied",
    report: result.report,
    reportPath: result.output.jsonPath,
  };
}

async function defaultRoleComponent(invocation, deps) {
  const { businessInput, targetAdapter } = invocation;
  const result = await runManualAcceptanceAccountScenarioCli(
    [
      "--apply",
      "--target",
      targetAdapter.policyTarget,
      "--data-version",
      businessInput.dataVersion,
      "--run-id",
      businessInput.runId,
      "--backend-url",
      targetAdapter.backendURL,
      "--database-name",
      targetAdapter.databaseName,
      "--audit-minimum",
      "30",
      "--json",
    ],
    {
      password: requiredCredential(
        targetAdapter.credentials.rolePassword,
        "rolePassword",
        "role",
      ),
      adminPassword: requiredCredential(
        targetAdapter.credentials.adminPassword,
        "adminPassword",
        "role",
      ),
      confirmPhrase: ACCOUNT_CONFIRM_PHRASE,
      targetConfirmation: targetAdapter.confirmation || undefined,
      targetAttestation: targetAdapter.attestation || undefined,
      formalAccountConfirmation:
        manualAcceptanceFormalAccountBootstrapConfirmation({
          target: targetAdapter.policyTarget,
          dataVersion: businessInput.dataVersion,
          runId: businessInput.runId,
        }),
      fetchImpl: deps.fetchImpl,
    },
  );
  if (result.exitCode !== 0 || !result.report?.ready) {
    throw new ManualAcceptanceDatasetRunnerError(
      "role_component_failed",
      "role account component did not return a ready report",
      { stageKey: "role", exitCode: result.exitCode },
    );
  }
  return {
    operation: "applied",
    report: {
      ...result.report,
      summary: {
        ...result.report.summary,
        formalAccounts: result.report.protectedAccounts?.length || 0,
        localSeedExecuted: false,
      },
    },
  };
}

async function defaultTaskComponent(invocation, deps) {
  const { businessInput, targetAdapter, reportPath } = invocation;
  const plan = buildManualAcceptanceTaskDataPlan({
    target: targetAdapter.policyTarget,
    dataVersion: businessInput.dataVersion,
    runId: businessInput.runId,
    backendURL: targetAdapter.backendURL,
    databaseName: targetAdapter.databaseName,
    nowSec: Math.floor(Date.parse(businessInput.taskScheduleAnchorUtc) / 1000),
  });
  const report = await applyManualAcceptanceTaskData(plan, {
    password: requiredCredential(
      targetAdapter.credentials.rolePassword,
      "rolePassword",
      "task",
    ),
    adminPassword: requiredCredential(
      targetAdapter.credentials.adminPassword,
      "adminPassword",
      "task",
    ),
    confirmPhrase: TASK_CONFIRM_PHRASE,
    targetConfirmation: targetAdapter.confirmation || undefined,
    targetAttestation: targetAdapter.attestation || undefined,
    fetchImpl: deps.fetchImpl,
  });
  await persistReport(reportPath, report);
  return { operation: "applied", report, reportPath };
}

async function defaultFactsComponent(invocation, deps) {
  const { businessInput, targetAdapter, reportDirectory } = invocation;
  const sourceState = deps.state.componentReports.get("source");
  if (!sourceState?.reportPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "source_report_missing",
      "facts requires the exact source report from the same runner execution",
      { stageKey: "facts" },
    );
  }
  const result = await runManualAcceptanceFactCli(
    [
      "--apply",
      "--target",
      targetAdapter.policyTarget,
      "--data-version",
      businessInput.dataVersion,
      "--run-id",
      businessInput.runId,
      "--backend-url",
      targetAdapter.backendURL,
      "--database-name",
      targetAdapter.databaseName,
      "--source-report",
      sourceState.reportPath,
      "--out",
      reportDirectory,
    ],
    {
      password: requiredCredential(
        targetAdapter.credentials.rolePassword,
        "rolePassword",
        "facts",
      ),
      adminPassword: requiredCredential(
        targetAdapter.credentials.adminPassword,
        "adminPassword",
        "facts",
      ),
      confirmPhrase: DATASET_CONFIRM_PHRASE,
      targetConfirmation: targetAdapter.confirmation || undefined,
      targetAttestation: targetAdapter.attestation || undefined,
      fetchImpl: deps.fetchImpl,
    },
  );
  if (result.exitCode !== 0 || !result.report || !result.filePath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "facts_component_failed",
      "facts component did not return a successful apply report",
      { stageKey: "facts", exitCode: result.exitCode },
    );
  }
  return {
    operation: "applied",
    report: result.report,
    reportPath: result.filePath,
  };
}

async function defaultAttachmentsComponent(invocation, deps) {
  const { targetAdapter, reportPath } = invocation;
  const source = deps.state.componentReports.get("source");
  const facts = deps.state.componentReports.get("facts");
  const task = deps.state.componentReports.get("task");
  if (!source?.reportPath || !facts?.reportPath || !task?.reportPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "attachment_input_report_missing",
      "attachments requires source, facts, and task reports from the same runner execution",
      { stageKey: "attachments" },
    );
  }
  const report = await applyAttachmentData({
    backendURL: targetAdapter.backendURL,
    databaseName: targetAdapter.databaseName,
    adminPassword: requiredCredential(
      targetAdapter.credentials.adminPassword,
      "adminPassword",
      "attachments",
    ),
    rolePassword: requiredCredential(
      targetAdapter.credentials.rolePassword,
      "rolePassword",
      "attachments",
    ),
    confirm: ATTACHMENT_CONFIRM_PHRASE,
    targetConfirmation: targetAdapter.confirmation || undefined,
    targetAttestation: targetAdapter.attestation || undefined,
    sourceReportPath: source.reportPath,
    factReportPath: facts.reportPath,
    taskReportPath: task.reportPath,
  });
  await persistReport(reportPath, report);
  return { operation: "applied", report, reportPath };
}

async function defaultReadinessComponent(invocation, deps) {
  const { targetAdapter, reportDirectory } = invocation;
  const source = deps.state.componentReports.get("source");
  const facts = deps.state.componentReports.get("facts");
  const task = deps.state.componentReports.get("task");
  if (!source?.reportPath || !facts?.reportPath || !task?.reportPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "readiness_input_report_missing",
      "readiness requires source, facts, and task reports from the same runner execution",
      { stageKey: "readiness" },
    );
  }
  const result = await runManualAcceptanceReadinessCli(
    [
      "--verify",
      "--backend-url",
      targetAdapter.backendURL,
      "--database-name",
      targetAdapter.databaseName,
      "--source-report",
      source.reportPath,
      "--fact-report",
      facts.reportPath,
      "--task-report",
      task.reportPath,
      "--out",
      reportDirectory,
    ],
    {
      password: requiredCredential(
        targetAdapter.credentials.rolePassword,
        "rolePassword",
        "readiness",
      ),
      adminPassword: requiredCredential(
        targetAdapter.credentials.adminPassword,
        "adminPassword",
        "readiness",
      ),
      targetConfirmation: targetAdapter.confirmation || undefined,
      targetAttestation: targetAdapter.attestation || undefined,
      fetchImpl: deps.fetchImpl,
      now: deps.now,
    },
  );
  if (!result.report || !result.output?.jsonPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "readiness_component_failed",
      "readiness did not produce a query evidence report",
      { stageKey: "readiness", exitCode: result.exitCode },
    );
  }
  const datasetReadiness = assertManualAcceptanceDatasetReadinessBoundary(
    result.report,
    result.exitCode,
  );
  return {
    operation: "verified",
    report: result.report,
    reportPath: result.output.jsonPath,
    summary: {
      ...result.report.summary,
      ...datasetReadiness,
    },
  };
}

export function assertManualAcceptanceDatasetReadinessBoundary(
  report,
  exitCode,
) {
  const summary = jsonRecord(report?.summary, "readiness summary");
  const targets = Array.isArray(report?.targets) ? report.targets : [];
  const completeQueryEvidence =
    exitCode === 0 &&
    summary.queryChecksPassed === true &&
    summary.queryEvidenceComplete === true &&
    summary.failedTargetData === 0 &&
    summary.notProvenTargetData === 0;
  if (completeQueryEvidence) {
    return {
      datasetSubstrateVerified: true,
      browserEvidencePending: summary.manualAcceptanceCompleted !== true,
      browserOnlyNotProvenTargets: 0,
    };
  }

  const notProven = targets.filter(
    (target) => target?.dataStatus === "not_proven",
  );
  const failed = targets.filter(
    (target) => target?.dataStatus === "fail" || target?.dataStatus === "error",
  );
  const groupCounts = Object.fromEntries(
    Object.keys(BROWSER_ONLY_READINESS_GROUPS).map((group) => [
      group,
      notProven.filter((target) => target?.catalogGroup === group).length,
    ]),
  );
  const exactBrowserOnlyGap =
    exitCode === 1 &&
    summary.queryChecksPassed === true &&
    summary.queryEvidenceComplete === false &&
    summary.failedTargetData === 0 &&
    summary.notProvenTargetData === BROWSER_ONLY_READINESS_TARGET_COUNT &&
    summary.passedTargetData ===
      MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT -
        BROWSER_ONLY_READINESS_TARGET_COUNT &&
    summary.totalTargets === MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT &&
    targets.length === MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT &&
    failed.length === 0 &&
    notProven.length === BROWSER_ONLY_READINESS_TARGET_COUNT &&
    Object.entries(BROWSER_ONLY_READINESS_GROUPS).every(
      ([group, expected]) => groupCounts[group] === expected,
    ) &&
    notProven.every(
      (target) =>
        target?.browserRequired === true && target?.quantityNotProven === true,
    ) &&
    targets.every((target) =>
      notProven.includes(target) ? true : target?.dataStatus === "pass",
    );
  if (!exactBrowserOnlyGap) {
    throw new ManualAcceptanceDatasetRunnerError(
      "readiness_component_failed",
      "readiness did not prove the exact dataset query substrate",
      {
        stageKey: "readiness",
        exitCode,
        failedTargetData: summary.failedTargetData,
        notProvenTargetData: summary.notProvenTargetData,
        printPreviewNotProven: groupCounts.printPreviewPages,
        printWorkspaceNotProven: groupCounts.printWorkspacePages,
      },
    );
  }
  return {
    datasetSubstrateVerified: true,
    browserEvidencePending: true,
    browserOnlyNotProvenTargets: 10,
  };
}

function assertReusableBaseline(execution, report) {
  const currentCore = execution.state.componentReports.get("core")?.report;
  const expectedWarehouses = Object.values(
    MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES,
  ).sort();
  const validZeroCounts =
    isPlainRecord(report.zeroCounts) &&
    Object.keys(report.zeroCounts).length ===
      MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length &&
    MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.every(
      ({ key }) => report.zeroCounts[key] === 0,
    );
  const validCore =
    report.core?.units === 1 &&
    report.core?.warehouses === 4 &&
    JSON.stringify(report.core?.unitCodes) ===
      JSON.stringify([MANUAL_ACCEPTANCE_CORE_UNIT_CODE]) &&
    JSON.stringify([...(report.core?.warehouseCodes || [])].sort()) ===
      JSON.stringify(expectedWarehouses);
  const validSummary =
    report.contract === "manual-acceptance-empty-baseline-report-v1" &&
    report.summary?.exactEmptyBusinessBaseline === true &&
    report.summary?.zeroBusinessRecords === true &&
    report.summary?.checkedBusinessObjectKinds ===
      MANUAL_ACCEPTANCE_EMPTY_BASELINE_PROBES.length;
  if (!currentCore || !validZeroCounts || !validCore || !validSummary) {
    throw new ManualAcceptanceDatasetRunnerError(
      "resume_baseline_invalid",
      "resume receipt does not contain a complete fresh empty-baseline proof",
      { stageKey: "baseline" },
    );
  }
  if (
    report.databaseName !== currentCore.databaseName ||
    report.runtimeIdentity?.databaseName !== currentCore.databaseName
  ) {
    throw new ManualAcceptanceDatasetRunnerError(
      "resume_baseline_runtime_mismatch",
      "resume baseline database identity does not match the current core probe",
      { stageKey: "baseline", field: "databaseName" },
    );
  }
  for (const field of BASELINE_CONFIG_FIELDS) {
    if (
      String(report.customerConfig?.[field] ?? "") !==
      String(currentCore[field] ?? "")
    ) {
      throw new ManualAcceptanceDatasetRunnerError(
        "resume_baseline_config_mismatch",
        `resume baseline ${field} does not match the current core probe`,
        { stageKey: "baseline", field },
      );
    }
  }
  const attestation = execution.targetAdapter.attestation;
  const remoteIdentityMatches = attestation
    ? report.runtimeIdentity?.release === attestation.release &&
      report.runtimeIdentity?.migration === attestation.migration
    : report.runtimeIdentity?.release == null &&
      report.runtimeIdentity?.migration == null;
  if (!remoteIdentityMatches) {
    throw new ManualAcceptanceDatasetRunnerError(
      "resume_baseline_runtime_mismatch",
      "resume baseline release/migration does not match the current target binding",
      { stageKey: "baseline", field: "release/migration" },
    );
  }
}

function reuseStageComponent(execution, resumeComponent) {
  if (!isPlainRecord(resumeComponent?.report)) {
    throw new ManualAcceptanceDatasetRunnerError(
      "resume_component_invalid",
      `${execution.stageKey} resume component is missing its report`,
      { stageKey: execution.stageKey },
    );
  }
  if (
    path.resolve(String(resumeComponent.reportPath || "")) !==
    path.resolve(execution.reportPath)
  ) {
    throw new ManualAcceptanceDatasetRunnerError(
      "resume_component_path_mismatch",
      `${execution.stageKey} resume component is outside its canonical report path`,
      { stageKey: execution.stageKey },
    );
  }
  const digest = digestManualAcceptanceDatasetComponentReport(
    resumeComponent.report,
  );
  if (digest !== resumeComponent.componentDigest) {
    throw new ManualAcceptanceDatasetRunnerError(
      "resume_component_digest_mismatch",
      `${execution.stageKey} resume component digest does not match its receipt`,
      { stageKey: execution.stageKey },
    );
  }
  const component = normalizeComponentResult(
    {
      operation: "reused",
      report: resumeComponent.report,
      reportPath: execution.reportPath,
      references: {
        resumeReceipt: {
          applyReportPath: resumeComponent.applyReportPath,
          priorOperation: resumeComponent.priorOperation,
          componentDigest: digest,
        },
      },
    },
    execution,
    "reused",
  );
  if (execution.stageKey === "baseline") {
    assertReusableBaseline(execution, component.report);
  }
  execution.state.componentReports.set(execution.stageKey, component);
  return receipt(execution, component);
}

async function registeredStage(execution, defaultComponent, operation) {
  const component = await executeRegisteredComponent(
    execution,
    defaultComponent
      ? (invocation) => defaultComponent(invocation, execution.deps)
      : null,
    operation,
  );
  execution.state.componentReports.set(execution.stageKey, component);
  return receipt(execution, component);
}

async function coreStageHandler(execution) {
  return registeredStage(execution, defaultCoreComponent, "verified");
}

async function baselineStageHandler(execution) {
  return registeredStage(execution, defaultBaselineComponent, "verified");
}

async function roleStageHandler(execution) {
  return registeredStage(execution, defaultRoleComponent, "applied");
}

async function sourceStageHandler(execution) {
  return registeredStage(execution, defaultSourceComponent, "applied");
}

async function taskStageHandler(execution) {
  return registeredStage(execution, defaultTaskComponent, "applied");
}

async function factsStageHandler(execution) {
  return registeredStage(execution, defaultFactsComponent, "applied");
}

async function purchaseQualityStageHandler(execution) {
  const facts = execution.state.componentReports.get("facts");
  if (!facts?.report || !facts?.reportPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "delegated_fact_report_missing",
      "purchase-quality can only be verified from the completed facts report",
      { stageKey: "purchase-quality", delegatedTo: "facts" },
    );
  }
  const purchaseReceipts = Number(facts.report.summary?.purchaseReceipts || 0);
  const qualityInspections = Number(
    facts.report.summary?.qualityInspections || 0,
  );
  const expected = execution.businessInput.stage.expected;
  if (
    purchaseReceipts < Number(expected.purchaseReceiptsMinimum) ||
    qualityInspections < Number(expected.qualityInspectionsMinimum)
  ) {
    throw new ManualAcceptanceDatasetRunnerError(
      "delegated_fact_evidence_incomplete",
      "facts report does not meet the purchase-quality minimums",
      {
        stageKey: "purchase-quality",
        purchaseReceipts,
        qualityInspections,
      },
    );
  }
  const report = {
    contract: "manual-acceptance-purchase-quality-derived-report-v1",
    mode: "verify",
    simulatedOnly: true,
    datasetKey: execution.businessInput.datasetKey,
    dataVersion: execution.businessInput.dataVersion,
    runId: execution.businessInput.runId,
    target: execution.targetAdapter.policyTarget,
    backendURL: execution.targetAdapter.backendURL,
    databaseName: execution.targetAdapter.databaseName,
    summary: { purchaseReceipts, qualityInspections },
    delegatedFactReport: {
      reportPath: facts.reportPath,
      componentDigest: digestManualAcceptanceDatasetComponentReport(
        facts.report,
      ),
    },
  };
  const component = normalizeComponentResult(
    {
      operation: "verified",
      report,
      references: { delegatedFactReport: report.delegatedFactReport },
    },
    execution,
    "verified",
  );
  await persistReport(component.reportPath, component.report);
  execution.state.componentReports.set(execution.stageKey, component);
  return receipt(execution, component);
}

async function attachmentsStageHandler(execution) {
  return registeredStage(execution, defaultAttachmentsComponent, "applied");
}

async function readinessStageHandler(execution) {
  return registeredStage(execution, defaultReadinessComponent, "verified");
}

export const MANUAL_ACCEPTANCE_DATASET_STAGE_REGISTRY = Object.freeze({
  core: coreStageHandler,
  baseline: baselineStageHandler,
  role: roleStageHandler,
  source: sourceStageHandler,
  task: taskStageHandler,
  facts: factsStageHandler,
  "purchase-quality": purchaseQualityStageHandler,
  attachments: attachmentsStageHandler,
  readiness: readinessStageHandler,
});

export function createManualAcceptanceDatasetStageRunner(deps = {}) {
  const registry = deps.registry || MANUAL_ACCEPTANCE_DATASET_STAGE_REGISTRY;
  const registeredStageKeys = Object.keys(registry);
  const state = { componentReports: new Map(), completedStageKeys: [] };
  return async function runManualAcceptanceDatasetStage(context) {
    const businessInput = buildManualAcceptanceRunnerBusinessInput(context);
    const targetAdapter = buildManualAcceptanceTargetAdapter(context, deps);
    const stageKey = businessInput.stage.key;
    const handler = registry[stageKey];
    if (typeof handler !== "function") {
      throw new ManualAcceptanceDatasetRunnerError(
        "stage_handler_unregistered",
        `stage ${stageKey} is not registered in the dataset runner`,
        { stageKey },
      );
    }
    const expectedStageKey =
      registeredStageKeys[state.completedStageKeys.length] || null;
    if (stageKey !== expectedStageKey) {
      throw new ManualAcceptanceDatasetRunnerError(
        "stage_sequence_violation",
        `stage ${stageKey} cannot run before ${expectedStageKey || "the registered sequence is complete"}`,
        {
          stageKey,
          expectedStageKey,
          completedStageKeys: [...state.completedStageKeys],
        },
      );
    }
    const handlerId = `${MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION}:${stageKey}`;
    const execution = {
      stageKey,
      handlerId,
      businessInput,
      targetAdapter,
      reportPath: reportPathFor(
        targetAdapter,
        stageKey,
        businessInput.dataVersion,
      ),
      deps: { ...deps, state },
      state,
    };
    const resumeComponent = deps.resumeComponents?.get?.(stageKey);
    const result = resumeComponent
      ? reuseStageComponent(execution, resumeComponent)
      : await handler(execution);
    state.completedStageKeys.push(stageKey);
    return result;
  };
}
