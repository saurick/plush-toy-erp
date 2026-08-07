#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { applyManualAcceptanceCustomerConfig } from "./manual-acceptance-customer-config.mjs";
import {
  MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
  applyManualAcceptanceAccountScenarios,
  buildManualAcceptanceAccountScenarioPlan,
  manualAcceptanceFormalAccountBootstrapConfirmation,
} from "./manual-acceptance-account-scenarios.mjs";
import {
  MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
  applyManualAcceptanceFactPlan,
  buildManualAcceptanceFactPlan,
} from "./manual-acceptance-fact-data.mjs";
import {
  buildManualAcceptanceReadinessPlan,
  verifyManualAcceptanceReadiness,
} from "./manual-acceptance-readiness.mjs";
import {
  MANUAL_ACCEPTANCE_CONFIRM_PHRASE,
  applyManualAcceptanceSourceData,
  buildManualAcceptanceSourceDataPlan,
} from "./manual-acceptance-source-data.mjs";
import {
  CONFIRM_PHRASE as MANUAL_ACCEPTANCE_TASK_CONFIRM_PHRASE,
  LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE,
  LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
  TASK_COPY_REVISION,
  TASK_PROFILE_LONG_LIVED_WORKBENCH,
  applyManualAcceptanceTaskData,
  buildLegacyManualAcceptanceTaskBatchReference,
  buildManualAcceptanceTaskDataPlan,
  manualAcceptanceTaskRetireConfirmation,
  retireLegacyManualAcceptanceTaskBatch,
} from "./manual-acceptance-task-data.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  SCENARIO_DEMO_ORIGIN,
  SCENARIO_DEMO_TARGET,
  assertManualAcceptanceDatabaseIdentity,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  manualAcceptanceTargetConfirmation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import { buildLocalTestApplyRuntimeManifest } from "./customer-config-runtime-manifest.mjs";
import { classifyDatabaseName, parseDatabaseURL } from "./database-target.mjs";
import {
  assertRepositoryIdentityEqual,
  readRepositoryIdentity,
} from "./lib/repository-identity.mjs";

export const SCENARIO_DEMO_SCHEMA_VERSION = "plush.scenario-demo-plan/v1";
export const SCENARIO_DEMO_READBACK_SCHEMA_VERSION =
  "plush.dev-data-preparation-readback/v1";
export const SCENARIO_DEMO_SCHEDULE_ANCHOR_UTC = "2026-07-16T12:00:00.000Z";
export const SCENARIO_DEMO_CATALOG_TARGET_COUNT = 52;
export const SCENARIO_DEMO_REPLAY_MODE = "exact-create-or-readback";

const REGISTERED_DEVELOPMENT_HOST = "192.168.0.106";
const REGISTERED_DEVELOPMENT_PORT = 5432;
const LOCAL_ROLE_DEMO_PASSWORD = "12345678";
const LOCAL_STABLE_ADMIN_PASSWORD = "adminadmin";
const SCENARIO_DEMO_QUERY_READY_COUNT = 42;
const SCENARIO_DEMO_BROWSER_ONLY_GAP_COUNT = 10;
const SCENARIO_DEMO_AUDIT_MINIMUM = 30;
const CUSTOMER_KEY = "yoyoosun";
const ADMIN_USERNAME = "admin";
const DEFAULT_OUTPUT_ROOT = path.join(
  "output",
  "qa",
  "scenario-demo",
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
);
const REQUIRED_MODULES = Object.freeze([
  "customers",
  "suppliers",
  "products",
  "materials",
  "processes",
  "sales_orders",
  "workflow_tasks",
  "purchase_orders",
  "outsourcing_orders",
  "material_bom",
  "production_orders",
  "production",
  "inventory",
  "shipments",
  "finance",
  "finance_payments",
  "purchase_receipts",
  "quality_inspections",
]);

export class ScenarioDemoError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "ScenarioDemoError";
    this.exitCode = exitCode;
  }
}

export function buildScenarioDemoCustomerConfigManifest() {
  const manifest = buildLocalTestApplyRuntimeManifest(yoyoosunCustomerPackage);
  if (
    manifest.customer_key !== CUSTOMER_KEY ||
    manifest.revision !== LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION ||
    manifest.product_version !==
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION ||
    manifest.compiled_snapshot?.applyPurpose !==
      LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE
  ) {
    throw new ScenarioDemoError(
      "scenario-demo tracked customer configuration identity drifted",
      2,
    );
  }
  return manifest;
}

const EXPECTED_CUSTOMER_CONFIG_MANIFEST =
  buildScenarioDemoCustomerConfigManifest();
const EXPECTED_RUNTIME = Object.freeze({
  target: SCENARIO_DEMO_TARGET,
  customerKey: CUSTOMER_KEY,
  configRevision: EXPECTED_CUSTOMER_CONFIG_MANIFEST.revision,
  configProductVersion: EXPECTED_CUSTOMER_CONFIG_MANIFEST.product_version,
  configApplyPurpose:
    EXPECTED_CUSTOMER_CONFIG_MANIFEST.compiled_snapshot.applyPurpose,
  source: "active_customer_config_revision",
  requiredModules: REQUIRED_MODULES,
});
const FACT_RECORD_KEYS = Object.freeze([
  "productionFacts",
  "purchaseReceipts",
  "purchaseReturns",
  "purchaseReceiptAdjustments",
  "qualityInspections",
  "inventoryLots",
  "inventoryTxns",
  "outsourcingFacts",
  "stockReservations",
  "shipments",
  "financeFacts",
  "reworkIntakes",
  "financePayments",
  "financeCreditNotes",
]);
const SOURCE_DOCUMENT_KEYS = Object.freeze([
  "salesOrders",
  "purchaseOrders",
  "outsourcingOrders",
]);
const execFileAsync = promisify(execFile);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function scenarioDemoDigest(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function resolveLocalScenarioDemoCredentials(environment = {}) {
  return Object.freeze({
    rolePassword: String(
      environment.MANUAL_ACCEPTANCE_PASSWORD ||
        environment.ERP_ROLE_DEMO_PASSWORD ||
        LOCAL_ROLE_DEMO_PASSWORD,
    ).trim(),
    adminPassword: String(
      environment.MANUAL_ACCEPTANCE_ADMIN_PASSWORD ||
        environment.REAL_LOGIN_ADMIN_PASSWORD ||
        LOCAL_STABLE_ADMIN_PASSWORD,
    ).trim(),
  });
}

function safeErrorMessage(error) {
  return String(error?.message || error || "scenario-demo failed")
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(
      /\b(?:password|token|secret|authorization|cookie|dsn)=([^\s&]+)/giu,
      "credential=<redacted>",
    )
    .replace(
      /\b(?:password|token|secret|authorization|cookie|dsn)\b/giu,
      "credential",
    )
    .replace(/\/(?:Users|home|private|var|tmp)\/[^\s:]+/gu, "<local-path>")
    .slice(0, 500);
}

function assertRegisteredScenarioDatabase(databaseURL) {
  const parsed = parseDatabaseURL(databaseURL, {
    allowRegisteredDevelopment: true,
  });
  const classification = classifyDatabaseName(parsed.databaseName);
  if (
    parsed.host !== REGISTERED_DEVELOPMENT_HOST ||
    parsed.port !== REGISTERED_DEVELOPMENT_PORT ||
    classification.disposable ||
    !new Set(["development", "legacy-development"]).has(classification.profile)
  ) {
    throw new ScenarioDemoError(
      "scenario-demo requires the registered non-disposable development PostgreSQL target",
      2,
    );
  }
  return parsed;
}

function migrationPreflightFingerprint(stdout) {
  const output = String(stdout || "").trim();
  const migration = output.match(
    /migration 已是最新版本（([^，\r\n]+)，(\d+)\/(\d+)）/u,
  );
  if (
    !/schema\/migration 守卫通过/u.test(output) ||
    !migration ||
    migration[2] !== migration[3] ||
    !/non-system-schema function=0 procedure=0 non-internal-trigger=0/u.test(
      output,
    )
  ) {
    throw new ScenarioDemoError(
      "scenario-demo migration preflight contract did not match",
      2,
    );
  }
  return scenarioDemoDigest({
    contract: "scenario-demo-migration-preflight/v1",
    migrationVersion: migration[1],
    appliedFiles: Number(migration[2]),
    availableFiles: Number(migration[3]),
    pendingFiles: 0,
    programmableObjects: {
      functions: 0,
      procedures: 0,
      nonInternalTriggers: 0,
    },
  });
}

async function defaultCommandRunner(command, args, options) {
  return execFileAsync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
  });
}

async function rpcCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl,
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
        id: `scenario-demo-preflight-${domain}-${method}`,
        method,
        params:
          domain === "customer_config"
            ? { customer_key: CUSTOMER_KEY, ...params }
            : params,
      }),
    },
  );
  if (response?.redirected || !response?.ok) {
    throw new ScenarioDemoError(
      `scenario-demo ${domain}.${method} preflight failed`,
      2,
    );
  }
  const payload = await response.json();
  if (payload?.result?.code !== 0) {
    throw new ScenarioDemoError(
      `scenario-demo ${domain}.${method} preflight was rejected`,
      2,
    );
  }
  return payload.result.data || {};
}

export async function preflightScenarioDemoRuntime({
  policy,
  rolePassword,
  adminPassword,
  fetchImpl,
}) {
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy,
    fetchImpl,
  });
  const login = await rpcCall({
    backendURL: policy.backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username: ADMIN_USERNAME, password: adminPassword },
    fetchImpl,
  });
  const adminToken = String(login.access_token || login.token || "").trim();
  if (
    !adminToken ||
    login.username !== ADMIN_USERNAME ||
    (login.is_super_admin !== true && login.isSuperAdmin !== true)
  ) {
    throw new ScenarioDemoError(
      "scenario-demo admin credential did not prove the local super administrator",
      2,
    );
  }
  if ([...rolePassword].length < 8 || [...rolePassword].length > 20) {
    throw new ScenarioDemoError(
      "MANUAL_ACCEPTANCE_PASSWORD must contain 8-20 characters",
      2,
    );
  }
  const capabilities = await rpcCall({
    backendURL: policy.backendURL,
    domain: "debug",
    method: "capabilities",
    token: adminToken,
    fetchImpl,
  });
  assertManualAcceptanceDatabaseIdentity({ policy, capabilities });
  const sessionData = await rpcCall({
    backendURL: policy.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: adminToken,
    fetchImpl,
  });
  return assertManualAcceptanceRuntimePolicy({
    policy,
    capabilities,
    session: sessionData.session || {},
    requiredModules: REQUIRED_MODULES,
    customerKey: CUSTOMER_KEY,
  });
}

export function buildScenarioDemoPlan({
  repository,
  databaseTarget,
  migrationFingerprint,
  runtime,
} = {}) {
  const policy = resolveManualAcceptanceTarget({
    target: SCENARIO_DEMO_TARGET,
    backendURL: SCENARIO_DEMO_ORIGIN,
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    databaseName: databaseTarget?.databaseName,
  });
  if (
    databaseTarget?.host !== REGISTERED_DEVELOPMENT_HOST ||
    databaseTarget?.port !== REGISTERED_DEVELOPMENT_PORT ||
    !/^[0-9a-f]{64}$/u.test(String(databaseTarget?.targetFingerprint || "")) ||
    !/^[0-9a-f]{64}$/u.test(String(migrationFingerprint || "")) ||
    runtime?.target !== SCENARIO_DEMO_TARGET ||
    runtime?.customerKey !== CUSTOMER_KEY
  ) {
    throw new ScenarioDemoError(
      "scenario-demo plan preflight identity is incomplete",
      2,
    );
  }
  const accountPlan = buildManualAcceptanceAccountScenarioPlan({
    ...policy,
    auditMinimum: SCENARIO_DEMO_AUDIT_MINIMUM,
  });
  const sourcePlan = buildManualAcceptanceSourceDataPlan(policy);
  const taskPlan = buildManualAcceptanceTaskDataPlan({
    ...policy,
    scheduleAnchorUtc: SCENARIO_DEMO_SCHEDULE_ANCHOR_UTC,
    taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
  });
  const supersededTaskBatch = buildLegacyManualAcceptanceTaskBatchReference({
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    copyRevision: TASK_COPY_REVISION,
    backendURL: policy.backendURL,
  });
  const plan = {
    schemaVersion: SCENARIO_DEMO_SCHEMA_VERSION,
    profileKey: SCENARIO_DEMO_TARGET,
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    backendURL: SCENARIO_DEMO_ORIGIN,
    databaseName: policy.databaseName,
    repository,
    target: {
      safeTarget: databaseTarget.safeTarget,
      targetFingerprint: databaseTarget.targetFingerprint,
      disposable: false,
      registeredDevelopmentPostgresOnly: true,
      loopbackBackendOnly: true,
    },
    migrationFingerprint,
    runtime: {
      customerKey: runtime.customerKey,
      configRevision: runtime.configRevision,
      configProductVersion: runtime.configProductVersion,
      configApplyPurpose: runtime.configApplyPurpose,
      source: runtime.source,
      requiredModules: [...runtime.requiredModules],
    },
    taskPolicy: {
      profile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
      copyRevision: LONG_LIVED_WORKBENCH_TASK_COPY_REVISION,
      stableActionablePerRole: LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE,
      supersessionMode: "workflow-lifecycle",
      physicalDelete: false,
      supersededBatch: {
        runId: supersededTaskBatch.runId,
        copyRevision: supersededTaskBatch.copyRevision,
        prefix: supersededTaskBatch.prefix,
        sourceType: supersededTaskBatch.sourceType,
        sourceID: supersededTaskBatch.sourceID,
      },
    },
    componentDigests: {
      customerConfig: scenarioDemoDigest(EXPECTED_CUSTOMER_CONFIG_MANIFEST),
      accounts: scenarioDemoDigest(accountPlan),
      source: sourcePlan.semanticDigest,
      tasks: scenarioDemoDigest(taskPlan),
      facts: scenarioDemoDigest({
        contract: "source-driven-operational-facts-v1",
        datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
        dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
        runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
      }),
      readiness: scenarioDemoDigest({
        contract: "manual-acceptance-page-data-ownership-v2",
        catalogTargetCount: SCENARIO_DEMO_CATALOG_TARGET_COUNT,
      }),
    },
    execution: {
      stageOrder: [
        "core-references",
        "role-accounts",
        "customer-config",
        "accounts",
        "source-documents",
        "tasks-and-process-runtime",
        "retire-superseded-task-batch",
        "facts",
        "catalog-readiness",
      ],
      replayMode: SCENARIO_DEMO_REPLAY_MODE,
      dataRetention: "long-lived",
      cleanupSupported: false,
      cleanupMode: "forward-only",
      directBusinessSQL: false,
      browserChecksRequired: true,
      manualAcceptanceCompleted: false,
      auditMinimum: SCENARIO_DEMO_AUDIT_MINIMUM,
    },
  };
  return Object.freeze({
    ...plan,
    planDigest: scenarioDemoDigest(plan),
  });
}

async function resolveScenarioDemoPlan({
  projectRoot,
  environment,
  commandRunner,
  fetchImpl,
  readRepository,
}) {
  const targetResult = await commandRunner(
    "go",
    ["run", "./cmd/dburl", "-conf", "./configs/dev/config.yaml"],
    { cwd: path.join(projectRoot, "server"), env: environment },
  );
  const databaseTarget = assertRegisteredScenarioDatabase(
    String(targetResult.stdout || "").trim(),
  );
  const policy = resolveManualAcceptanceTarget({
    target: SCENARIO_DEMO_TARGET,
    backendURL: SCENARIO_DEMO_ORIGIN,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    databaseName: databaseTarget.databaseName,
  });
  const migrationResult = await commandRunner(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "local-runtime-preflight.mjs"),
      "--mode",
      "database",
    ],
    { cwd: projectRoot, env: environment },
  );
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy,
    fetchImpl,
  });
  const repository = await readRepository(projectRoot);
  const credentials = resolveLocalScenarioDemoCredentials(environment);
  return {
    plan: buildScenarioDemoPlan({
      repository,
      databaseTarget,
      migrationFingerprint: migrationPreflightFingerprint(
        migrationResult.stdout,
      ),
      runtime: EXPECTED_RUNTIME,
    }),
    credentials,
    policy,
  };
}

async function assertRepositoryUnchanged(
  projectRoot,
  expected,
  readRepository,
) {
  assertRepositoryIdentityEqual(expected, await readRepository(projectRoot));
}

async function writeStageReport(outputRoot, stage, report) {
  const directory = path.join(outputRoot, stage);
  await mkdir(directory, { recursive: true });
  const file = path.join(
    directory,
    report.mode === "retire" ? "retire-report.json" : "apply-report.json",
  );
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return file;
}

function assertReportIdentity(report, plan, label, mode = "apply") {
  if (
    !report ||
    report.mode !== mode ||
    report.datasetKey !== plan.datasetKey ||
    report.dataVersion !== plan.dataVersion ||
    report.runId !== plan.runId ||
    report.target !== plan.profileKey ||
    report.backendURL !== plan.backendURL ||
    report.databaseName !== plan.databaseName
  ) {
    throw new ScenarioDemoError(
      `${label} report identity does not match the fixed scenario-demo batch`,
    );
  }
  return report;
}

function assertReadinessReportCoupling(
  readinessReport,
  plan,
  sourceReport,
  taskReport,
  factReport,
) {
  assertReportIdentity(readinessReport, plan, "readiness", "verify");
  const sourceInput = readinessReport.reportInputs?.sourceReport;
  const taskInput = readinessReport.reportInputs?.taskReport;
  const factInput = readinessReport.reportInputs?.factReport;
  for (const key of [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
  ]) {
    if (
      sourceInput?.[key] !== sourceReport[key] ||
      taskInput?.[key] !== taskReport[key] ||
      factInput?.[key] !== factReport[key]
    ) {
      throw new ScenarioDemoError(
        `readiness report input ${key} is not coupled to the same batch`,
      );
    }
  }
  if (
    sourceInput.prefix !== sourceReport.prefix ||
    factInput.reportContract !== factReport.reportContract ||
    factInput.semanticDigest !== factReport.semanticDigest ||
    factInput.financeFieldContract?.digest !==
      factReport.financeFieldContract?.digest ||
    taskInput.prefix !== taskReport.prefix ||
    taskInput.sourceType !== taskReport.sourceType ||
    taskInput.sourceID !== taskReport.sourceID ||
    taskInput.taskGroupCoverageDigest !==
      taskReport.coverage?.catalogScenarioDigest ||
    readinessReport.runtimePreflight?.configRevision !==
      plan.runtime.configRevision ||
    readinessReport.runtimePreflight?.source !== plan.runtime.source
  ) {
    throw new ScenarioDemoError(
      "readiness report upstream semantic identity is incomplete or drifted",
    );
  }
}

function countArrays(report, keys, label) {
  let total = 0;
  for (const key of keys) {
    const records = report?.referenceRecords?.[key];
    if (!Array.isArray(records)) {
      throw new ScenarioDemoError(`${label} is missing ${key} readback`);
    }
    total += records.length;
  }
  return total;
}

export function buildScenarioDemoReadback({
  plan,
  sourceReport,
  taskReport,
  taskRetireReport,
  factReport,
  readinessReport,
} = {}) {
  assertReportIdentity(sourceReport, plan, "source");
  assertReportIdentity(taskReport, plan, "task");
  assertReportIdentity(
    taskRetireReport,
    plan,
    "superseded task retirement",
    "retire",
  );
  assertReportIdentity(factReport, plan, "fact");
  assertReadinessReportCoupling(
    readinessReport,
    plan,
    sourceReport,
    taskReport,
    factReport,
  );
  if (
    sourceReport.semanticDigest !== plan.componentDigests.source ||
    taskReport.taskProfile !== plan.taskPolicy.profile ||
    taskReport.copyRevision !== plan.taskPolicy.copyRevision ||
    taskReport.summary?.workbenchBuckets?.actionable !==
      LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE * 9 ||
    Object.values(taskReport.summary?.workbenchBucketsByRole || {}).some(
      (counts) =>
        counts?.actionable !== LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE,
    ) ||
    Object.keys(taskReport.summary?.workbenchBucketsByRole || {}).length !==
      9 ||
    taskRetireReport.keepBatch?.copyRevision !== plan.taskPolicy.copyRevision ||
    taskRetireReport.retiredBatch?.copyRevision !==
      plan.taskPolicy.supersededBatch.copyRevision ||
    taskRetireReport.retiredBatch?.sourceID !==
      plan.taskPolicy.supersededBatch.sourceID ||
    taskRetireReport.cleanup?.physicalDelete !== false ||
    taskRetireReport.summary?.activeAfter !== 0 ||
    ![0, 180].includes(taskRetireReport.summary?.total) ||
    taskRetireReport.summary?.absent !==
      (taskRetireReport.summary?.total === 0) ||
    taskReport.provesProcessRuntime !== true ||
    !Array.isArray(taskReport.runtimeEvidence) ||
    readinessReport?.mode !== "verify" ||
    readinessReport?.summary?.totalTargets !==
      SCENARIO_DEMO_CATALOG_TARGET_COUNT ||
    readinessReport.summary.failedTargetData !== 0 ||
    readinessReport.summary.passedTargetData !==
      SCENARIO_DEMO_QUERY_READY_COUNT ||
    readinessReport.summary.notProvenTargetData !==
      SCENARIO_DEMO_BROWSER_ONLY_GAP_COUNT ||
    readinessReport.summary.passedTargetData +
      readinessReport.summary.notProvenTargetData !==
      SCENARIO_DEMO_CATALOG_TARGET_COUNT ||
    readinessReport.summary.queryChecksPassed !== true ||
    readinessReport.summary.browserChecksCompleted !== 0 ||
    readinessReport.summary.browserChecksPending !==
      SCENARIO_DEMO_CATALOG_TARGET_COUNT ||
    readinessReport.summary.manualAcceptanceCompleted !== false
  ) {
    throw new ScenarioDemoError(
      "scenario-demo exact readback is incomplete or drifted",
    );
  }
  return Object.freeze({
    schemaVersion: SCENARIO_DEMO_READBACK_SCHEMA_VERSION,
    profileKey: SCENARIO_DEMO_TARGET,
    targetFingerprint: plan.target.targetFingerprint,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    sourceDocumentCount: countArrays(
      sourceReport,
      SOURCE_DOCUMENT_KEYS,
      "source report",
    ),
    processRuntimeCount: taskReport.runtimeEvidence.length,
    taskProfile: taskReport.taskProfile,
    stableActionablePerRole: LONG_LIVED_WORKBENCH_ACTIONABLE_PER_ROLE,
    stableActionableTaskCount: taskReport.summary.workbenchBuckets.actionable,
    supersededTaskBatch: {
      copyRevision: taskRetireReport.retiredBatch.copyRevision,
      total: taskRetireReport.summary.total,
      absent: taskRetireReport.summary.absent,
      activeBefore: taskRetireReport.summary.activeBefore,
      activeAfter: taskRetireReport.summary.activeAfter,
      actionsApplied: taskRetireReport.summary.actionsApplied,
      physicalDelete: false,
    },
    factCount: countArrays(factReport, FACT_RECORD_KEYS, "fact report"),
    catalogReadyCount: readinessReport.summary.passedTargetData,
    catalogTargetCount: readinessReport.summary.totalTargets,
    browserChecksPending: readinessReport.summary.notProvenTargetData,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: SCENARIO_DEMO_REPLAY_MODE,
  });
}

async function applyScenarioDemo({
  projectRoot,
  resolved,
  expectedPlanDigest,
  confirmation,
  commandRunner,
  fetchImpl,
  readRepository,
  outputRoot,
  environment,
}) {
  const { plan, credentials, policy } = resolved;
  if (expectedPlanDigest !== plan.planDigest) {
    throw new ScenarioDemoError(
      "scenario-demo expected plan digest does not match current preflight",
      2,
    );
  }
  const expectedConfirmation = [
    "APPLY_SCENARIO_DEMO",
    plan.databaseName,
    plan.dataVersion,
    plan.runId,
    plan.planDigest,
  ].join(":");
  if (confirmation !== expectedConfirmation) {
    throw new ScenarioDemoError(
      "scenario-demo apply requires the exact non-secret plan confirmation",
      2,
    );
  }
  const targetConfirmation = manualAcceptanceTargetConfirmation(policy);
  assertManualAcceptanceMutationTarget(policy, {
    confirmation: targetConfirmation,
  });
  const repository = plan.repository;
  const checkRepository = () =>
    assertRepositoryUnchanged(projectRoot, repository, readRepository);
  const runStage = async (operation) => {
    await checkRepository();
    const result = await operation();
    await checkRepository();
    return result;
  };
  await checkRepository();

  await runStage(async () => {
    const seedConfirmation = [
      "SEED_SCENARIO_DEMO_CORE_REFERENCES",
      SCENARIO_DEMO_TARGET,
      plan.databaseName,
      plan.dataVersion,
      plan.runId,
    ].join(":");
    const result = await commandRunner(
      "go",
      [
        "run",
        "./cmd/seed-core-demo-data",
        "-conf",
        "./configs/dev/config.yaml",
        "--scenario-references",
        "--expected-database",
        plan.databaseName,
        "--confirm",
        seedConfirmation,
      ],
      {
        cwd: path.join(projectRoot, "server"),
        env: environment,
      },
    );
    const stdout = String(result.stdout || "");
    if (
      !/units=1\b/u.test(stdout) ||
      !/warehouses=4\b/u.test(stdout) ||
      !/scenario_references=true\b/u.test(stdout) ||
      !/no_business_records=true\b/u.test(stdout) ||
      !/no_direct_fact_posting=true\b/u.test(stdout)
    ) {
      throw new ScenarioDemoError(
        "scenario-demo core reference readback did not match",
      );
    }
  });

  await runStage(async () => {
    const result = await commandRunner(
      "bash",
      [path.join(projectRoot, "scripts", "seed-role-demo-admins.sh")],
      {
        cwd: projectRoot,
        env: {
          ...environment,
          ERP_ROLE_DEMO_PASSWORD: credentials.rolePassword,
        },
      },
    );
    const accounts = Number(
      String(result.stdout || "").match(
        /role demo admin seed completed accounts=(\d+)\b/u,
      )?.[1],
    );
    if (!Number.isSafeInteger(accounts) || accounts < 10) {
      throw new ScenarioDemoError(
        "scenario-demo role account bootstrap readback did not match",
      );
    }
  });

  const customerConfigManifest = buildScenarioDemoCustomerConfigManifest();
  if (
    scenarioDemoDigest(customerConfigManifest) !==
    plan.componentDigests.customerConfig
  ) {
    throw new ScenarioDemoError(
      "scenario-demo customer configuration plan drifted",
      2,
    );
  }
  const customerConfigApply = await runStage(() =>
    applyManualAcceptanceCustomerConfig({
      manifest: customerConfigManifest,
      policy,
      env: {
        MANUAL_ACCEPTANCE_TARGET_CONFIRM: targetConfirmation,
        MANUAL_ACCEPTANCE_ADMIN_USERNAME: ADMIN_USERNAME,
        MANUAL_ACCEPTANCE_ADMIN_PASSWORD: credentials.adminPassword,
        MANUAL_ACCEPTANCE_PASSWORD: credentials.rolePassword,
      },
      fetchImpl,
    }),
  );
  const customerConfigReport = {
    mode: "apply",
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    target: plan.profileKey,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
    customerKey: customerConfigApply.effectiveSession.customerKey,
    configRevision: customerConfigApply.effectiveSession.configRevision,
    configHash: customerConfigApply.effectiveSession.configHash,
    configHashVersion: customerConfigApply.effectiveSession.configHashVersion,
    configProductVersion:
      customerConfigApply.effectiveSession.configProductVersion,
    configApplyPurpose: customerConfigApply.effectiveSession.configApplyPurpose,
    source: customerConfigApply.effectiveSession.source,
    operations: customerConfigApply.operations,
  };
  assertReportIdentity(customerConfigReport, plan, "customer config");
  if (
    customerConfigReport.configRevision !== plan.runtime.configRevision ||
    customerConfigReport.configProductVersion !==
      plan.runtime.configProductVersion ||
    customerConfigReport.configApplyPurpose !==
      plan.runtime.configApplyPurpose ||
    customerConfigReport.source !== plan.runtime.source
  ) {
    throw new ScenarioDemoError(
      "scenario-demo customer configuration readback drifted",
      2,
    );
  }
  await writeStageReport(outputRoot, "customer-config", customerConfigReport);

  const runtime = await preflightScenarioDemoRuntime({
    policy,
    rolePassword: credentials.rolePassword,
    adminPassword: credentials.adminPassword,
    fetchImpl,
  });
  if (
    runtime.configRevision !== plan.runtime.configRevision ||
    runtime.configProductVersion !== plan.runtime.configProductVersion ||
    runtime.configApplyPurpose !== plan.runtime.configApplyPurpose ||
    runtime.source !== plan.runtime.source ||
    JSON.stringify(runtime.requiredModules) !==
      JSON.stringify(plan.runtime.requiredModules)
  ) {
    throw new ScenarioDemoError(
      "scenario-demo active customer configuration drifted from the prepared plan",
      2,
    );
  }
  await checkRepository();

  const accountPlan = buildManualAcceptanceAccountScenarioPlan({
    ...policy,
    auditMinimum: SCENARIO_DEMO_AUDIT_MINIMUM,
  });
  if (scenarioDemoDigest(accountPlan) !== plan.componentDigests.accounts) {
    throw new ScenarioDemoError("scenario-demo account plan drifted");
  }
  const accountReport = await runStage(() =>
    applyManualAcceptanceAccountScenarios(accountPlan, {
      password: credentials.rolePassword,
      adminPassword: credentials.adminPassword,
      confirmPhrase: MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM_PHRASE,
      targetConfirmation,
      formalAccountConfirmation:
        manualAcceptanceFormalAccountBootstrapConfirmation(accountPlan),
      fetchImpl,
    }),
  );
  assertReportIdentity(accountReport, plan, "account");
  await writeStageReport(outputRoot, "accounts", accountReport);

  const sourcePlan = buildManualAcceptanceSourceDataPlan(policy);
  if (sourcePlan.semanticDigest !== plan.componentDigests.source) {
    throw new ScenarioDemoError("scenario-demo source plan drifted");
  }
  const sourceReport = await runStage(() =>
    applyManualAcceptanceSourceData(sourcePlan, {
      password: credentials.rolePassword,
      adminPassword: credentials.adminPassword,
      confirmPhrase: MANUAL_ACCEPTANCE_CONFIRM_PHRASE,
      targetConfirmation,
      fetchImpl,
    }),
  );
  assertReportIdentity(sourceReport, plan, "source");
  if (sourceReport.semanticDigest !== sourcePlan.semanticDigest) {
    throw new ScenarioDemoError("scenario-demo source semantic digest drifted");
  }
  await writeStageReport(outputRoot, "source", sourceReport);

  const taskPlan = buildManualAcceptanceTaskDataPlan({
    ...policy,
    scheduleAnchorUtc: SCENARIO_DEMO_SCHEDULE_ANCHOR_UTC,
    taskProfile: TASK_PROFILE_LONG_LIVED_WORKBENCH,
  });
  if (scenarioDemoDigest(taskPlan) !== plan.componentDigests.tasks) {
    throw new ScenarioDemoError("scenario-demo task plan drifted");
  }
  const taskReport = await runStage(() =>
    applyManualAcceptanceTaskData(taskPlan, {
      password: credentials.rolePassword,
      adminPassword: credentials.adminPassword,
      confirmPhrase: MANUAL_ACCEPTANCE_TASK_CONFIRM_PHRASE,
      targetConfirmation,
      sourceReport,
      fetchImpl,
    }),
  );
  assertReportIdentity(taskReport, plan, "task");
  await writeStageReport(outputRoot, "tasks", taskReport);

  const supersededTaskBatch = buildLegacyManualAcceptanceTaskBatchReference({
    runId: plan.taskPolicy.supersededBatch.runId,
    copyRevision: plan.taskPolicy.supersededBatch.copyRevision,
    backendURL: plan.backendURL,
  });
  const taskRetireReport = await runStage(() =>
    retireLegacyManualAcceptanceTaskBatch(taskPlan, {
      retireRunId: supersededTaskBatch.runId,
      retireCopyRevision: supersededTaskBatch.copyRevision,
      allowAbsent: true,
      password: credentials.rolePassword,
      adminPassword: credentials.adminPassword,
      confirmPhrase: manualAcceptanceTaskRetireConfirmation(
        taskPlan,
        supersededTaskBatch,
      ),
      targetConfirmation,
      fetchImpl,
    }),
  );
  assertReportIdentity(
    taskRetireReport,
    plan,
    "superseded task retirement",
    "retire",
  );
  await writeStageReport(
    outputRoot,
    "retire-superseded-tasks",
    taskRetireReport,
  );

  const factPlan = buildManualAcceptanceFactPlan(sourceReport);
  const factContractDigest = scenarioDemoDigest({
    contract: "source-driven-operational-facts-v1",
    datasetKey: factPlan.datasetKey,
    dataVersion: factPlan.dataVersion,
    runId: factPlan.runId,
  });
  if (factContractDigest !== plan.componentDigests.facts) {
    throw new ScenarioDemoError("scenario-demo fact plan drifted");
  }
  const factReport = await runStage(() =>
    applyManualAcceptanceFactPlan(factPlan, sourceReport, {
      password: credentials.rolePassword,
      adminPassword: credentials.adminPassword,
      confirmPhrase: MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
      targetConfirmation,
      fetchImpl,
    }),
  );
  assertReportIdentity(factReport, plan, "fact");
  await writeStageReport(outputRoot, "facts", factReport);

  const readinessPlan = buildManualAcceptanceReadinessPlan({
    sourceReport,
    factReport,
    taskReport,
  });
  const readinessReport = await runStage(() =>
    verifyManualAcceptanceReadiness(readinessPlan, {
      backendURL: plan.backendURL,
      databaseName: plan.databaseName,
      password: credentials.rolePassword,
      adminPassword: credentials.adminPassword,
      targetConfirmation,
      fetchImpl,
    }),
  );
  await writeStageReport(outputRoot, "readiness", readinessReport);
  return buildScenarioDemoReadback({
    plan,
    sourceReport,
    taskReport,
    taskRetireReport,
    factReport,
    readinessReport,
  });
}

export function parseScenarioDemoArgs(argv = []) {
  const options = {
    apply: false,
    expectedPlanDigest: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    } else if (token === "--expected-plan-digest") {
      options.expectedPlanDigest = String(argv[++index] || "").trim();
    } else {
      throw new ScenarioDemoError(`unknown option ${token}`, 2);
    }
  }
  if (options.apply && !/^[0-9a-f]{64}$/u.test(options.expectedPlanDigest)) {
    throw new ScenarioDemoError(
      "--apply requires --expected-plan-digest from the current plan",
      2,
    );
  }
  return options;
}

function usage() {
  return `长期共享库场景数据 / Scenario Demo

只读计划与前置核对：
  node scripts/qa/scenario-demo-data.mjs

执行固定 V5 批次：
  SCENARIO_DEMO_CONFIRM='APPLY_SCENARIO_DEMO:<database>:2026.07.16-v5:20260716-V5:<plan-digest>' \\
    node scripts/qa/scenario-demo-data.mjs --apply --expected-plan-digest <plan-digest>

仅允许 127.0.0.1:8300 对应的已登记 192.168.0.106:5432 长期开发库。
固定目标证明后使用项目登记的本机测试账号约定；显式 MANUAL_ACCEPTANCE_* /
ERP_ROLE_DEMO_PASSWORD / REAL_LOGIN_ADMIN_PASSWORD 覆盖值优先。
同批次只允许精确创建或读回；不支持自动清理，不代表页面人工验收完成。`;
}

export async function runScenarioDemoCli(
  argv = [],
  {
    projectRoot = path.resolve(import.meta.dirname, "..", ".."),
    environment = process.env,
    commandRunner = defaultCommandRunner,
    fetchImpl = fetch,
    readRepository = readRepositoryIdentity,
    outputRoot,
  } = {},
) {
  const options = parseScenarioDemoArgs(argv);
  if (options.help) {
    return { exitCode: 0, text: `${usage()}\n`, plan: null, readback: null };
  }
  let resolved;
  try {
    resolved = await resolveScenarioDemoPlan({
      projectRoot,
      environment,
      commandRunner,
      fetchImpl,
      readRepository,
    });
  } catch (error) {
    throw new ScenarioDemoError(safeErrorMessage(error), error?.exitCode || 1);
  }
  if (!options.apply) {
    return {
      exitCode: 0,
      text: `${JSON.stringify(resolved.plan, null, 2)}\n`,
      plan: resolved.plan,
      readback: null,
    };
  }
  try {
    const readback = await applyScenarioDemo({
      projectRoot,
      resolved,
      expectedPlanDigest: options.expectedPlanDigest,
      confirmation: environment.SCENARIO_DEMO_CONFIRM,
      commandRunner,
      fetchImpl,
      readRepository,
      outputRoot:
        outputRoot ||
        path.join(projectRoot, DEFAULT_OUTPUT_ROOT, resolved.plan.databaseName),
      environment,
    });
    return {
      exitCode: 0,
      text: `${JSON.stringify(readback)}\n`,
      plan: resolved.plan,
      readback,
    };
  } catch (error) {
    throw new ScenarioDemoError(safeErrorMessage(error), error?.exitCode || 1);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  runScenarioDemoCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `[qa:scenario-demo-data] ${safeErrorMessage(error)}\n`,
      );
      process.exitCode =
        error instanceof ScenarioDemoError ? error.exitCode : 1;
    });
}
