import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { applyAttachmentData } from "./manual-acceptance-attachment-data.mjs";
import { runManualAcceptanceAccountScenarioCli } from "./manual-acceptance-account-scenarios.mjs";
import { runManualAcceptanceFactCli } from "./manual-acceptance-fact-data.mjs";
import { MANUAL_ACCEPTANCE_GENERATOR_STAGES } from "./manual-acceptance-page-data-contract.mjs";
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
} from "./manual-acceptance-task-data.mjs";
import {
  assertManualAcceptanceDatabaseIdentity,
  assertManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

export const MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION =
  "manual-acceptance-dataset-runner-v1";

const DATASET_CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
const ACCOUNT_CONFIRM_PHRASE = "APPLY_SIMULATED_ACCOUNT_SCENARIOS";
const ATTACHMENT_CONFIRM_PHRASE =
  "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS";
const DEFAULT_OUTPUT_ROOT = "output/qa/manual-acceptance/datasets";

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
  role: pageGeneratorEntrypoint("role"),
  source: pageGeneratorEntrypoint("source"),
  task: pageGeneratorEntrypoint("task"),
  facts: pageGeneratorEntrypoint("facts"),
  "purchase-quality": pageGeneratorEntrypoint("facts"),
  attachments: "scripts/qa/manual-acceptance-attachment-data.mjs",
  readiness: "scripts/qa/manual-acceptance-readiness.mjs",
});

const STAGE_REPORT_FILES = Object.freeze({
  core: "apply-report.json",
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

function componentDigest(report) {
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

function reportPathFor(targetAdapter, stageKey) {
  return path.join(
    reportDirectory(targetAdapter, stageKey),
    STAGE_REPORT_FILES[stageKey],
  );
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
  const outputRoot = deps.outputRoot || DEFAULT_OUTPUT_ROOT;
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
    if (
      report[field] !== undefined &&
      String(report[field]) !== String(expected)
    ) {
      throw new ManualAcceptanceDatasetRunnerError(
        "component_identity_mismatch",
        `${execution.stageKey} component report ${field} does not match the runner binding`,
        { stageKey: execution.stageKey, field },
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
  return {
    operation,
    report,
    reportPath: String(wrapped.reportPath || execution.reportPath),
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
  const digest = componentDigest(component.report);
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
  token,
  fetchImpl = fetch,
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
        id: `manual-acceptance-core-${domain}-${method}`,
        method,
        params:
          domain === "auth" ? params : { customer_key: "yoyoosun", ...params },
      }),
    },
  );
  if (response.redirected === true) {
    throw new ManualAcceptanceDatasetRunnerError(
      "core_verifier_redirected",
      `${domain}.${method} refused a redirected response`,
      { stageKey: "core", domain, method },
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
      "core_verifier_rpc_failed",
      `${domain}.${method} failed`,
      {
        stageKey: "core",
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
  if (policy.external) {
    assertManualAcceptanceTargetAttestation({
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
  const queryParams = {
    keyword: "SIM-PLUSH-CORE",
    active_only: true,
    limit: 200,
  };
  const [unitData, warehouseData] = await Promise.all([
    coreRPC({
      backendURL: policy.backendURL,
      domain: "masterdata",
      method: "list_units",
      params: queryParams,
      token: adminToken,
      fetchImpl,
    }),
    coreRPC({
      backendURL: policy.backendURL,
      domain: "masterdata",
      method: "list_warehouses",
      params: queryParams,
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
    unitCode: MANUAL_ACCEPTANCE_CORE_UNIT_CODE,
    warehouseCodes: Object.values(MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES),
    summary: { units: 1, warehouses: 4 },
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
    nowSec: Math.floor(Date.parse(businessInput.dateAnchorUtc) / 1000),
  });
  const report = await applyManualAcceptanceTaskData(plan, {
    password: requiredCredential(
      targetAdapter.credentials.rolePassword,
      "rolePassword",
      "task",
    ),
    adminPassword: targetAdapter.attestation
      ? undefined
      : requiredCredential(
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
  if (result.exitCode !== 0 || !result.report || !result.output?.jsonPath) {
    throw new ManualAcceptanceDatasetRunnerError(
      "readiness_component_failed",
      "readiness did not prove complete query evidence",
      { stageKey: "readiness", exitCode: result.exitCode },
    );
  }
  return {
    operation: "verified",
    report: result.report,
    reportPath: result.output.jsonPath,
  };
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
    summary: { purchaseReceipts, qualityInspections },
    delegatedFactReport: {
      reportPath: facts.reportPath,
      componentDigest: componentDigest(facts.report),
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
  const state = { componentReports: new Map() };
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
    const handlerId = `${MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION}:${stageKey}`;
    return handler({
      stageKey,
      handlerId,
      businessInput,
      targetAdapter,
      reportPath: reportPathFor(targetAdapter, stageKey),
      deps: { ...deps, state },
      state,
    });
  };
}
