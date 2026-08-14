#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { applyManualAcceptanceCustomerConfig } from "./manual-acceptance-customer-config.mjs";
import { MANUAL_ACCEPTANCE_DATASET_OUTPUT_ROOT } from "./manual-acceptance-dataset-runner.mjs";
import {
  PERSISTENT_SCENARIO_DATASET_TARGET,
  applyManualAcceptanceDataset,
  buildManualAcceptanceDatasetTargetPlan,
  manualAcceptanceDatasetApplyReportPath,
} from "./manual-acceptance-dataset.mjs";
import {
  CUSTOMER_TRIAL_133_DATABASE,
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
  LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  SCENARIO_DEMO_ORIGIN,
  SCENARIO_DEMO_TARGET,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  manualAcceptanceTargetConfirmation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import { buildLocalTestApplyRuntimeManifest } from "./customer-config-runtime-manifest.mjs";
import { classifyDatabaseName, parseDatabaseURL } from "./database-target.mjs";
import {
  assertRepositoryIdentityEqual,
  readRepositoryIdentity,
} from "./lib/repository-identity.mjs";
import { MANUAL_ACCEPTANCE_CORE_CONTRACT } from "./manual-acceptance-core-contract.mjs";

export const SCENARIO_DEMO_SCHEMA_VERSION = "plush.scenario-demo-plan/v2";
export const SCENARIO_DEMO_READBACK_SCHEMA_VERSION =
  "plush.dev-data-preparation-readback/v1";
export const SCENARIO_DEMO_REPLAY_MODE = "exact-create-or-readback";

const REGISTERED_DEVELOPMENT_HOST = "192.168.0.106";
const REGISTERED_DEVELOPMENT_PORT = 5432;
const LOCAL_ROLE_DEMO_PASSWORD = "12345678";
const LOCAL_STABLE_ADMIN_PASSWORD = "adminadmin";
const CUSTOMER_KEY = "yoyoosun";
const ADMIN_USERNAME = "admin";
const DATASET_CONFIRM_PREFIX = "APPLY_SCENARIO_DEMO";
const QUERY_READY_COUNT = 41;
const CATALOG_TARGET_COUNT = 51;
const BROWSER_ONLY_GAP_COUNT = 10;
const FACT_COUNT_KEYS = Object.freeze([
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
  "financePayments",
  "financeCreditNotes",
]);
const SOURCE_DOCUMENT_COUNT_KEYS = Object.freeze([
  "sales_order.create",
  "sales_order.reuse",
  "purchase_order.create",
  "purchase_order.reuse",
  "outsourcing_order.create",
  "outsourcing_order.reuse",
]);
const execFileAsync = promisify(execFile);

export class ScenarioDemoError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "ScenarioDemoError";
    this.exitCode = exitCode;
  }
}

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

export function resolveCustomerTrialScenarioDemoCredentials(environment = {}) {
  const credentials = Object.freeze({
    rolePassword: String(environment.MANUAL_ACCEPTANCE_PASSWORD || "").trim(),
    adminPassword: String(
      environment.MANUAL_ACCEPTANCE_ADMIN_PASSWORD || "",
    ).trim(),
  });
  if (!credentials.rolePassword || !credentials.adminPassword) {
    throw new ScenarioDemoError(
      "customer-trial-133 controlled runtime credentials are required for apply",
      2,
    );
  }
  return credentials;
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

function migrationPreflightEvidence(stdout) {
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
  const evidence = {
    contract: "scenario-demo-migration-preflight/v2",
    migrationVersion: migration[1],
    appliedFiles: Number(migration[2]),
    availableFiles: Number(migration[3]),
    pendingFiles: 0,
    programmableObjects: {
      functions: 0,
      procedures: 0,
      nonInternalTriggers: 0,
    },
  };
  return Object.freeze({
    migrationVersion: evidence.migrationVersion,
    fingerprint: scenarioDemoDigest(evidence),
  });
}

async function defaultCommandRunner(command, args, options) {
  return execFileAsync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
  });
}

function runtimeContract(targetAlias) {
  if (targetAlias === PERSISTENT_SCENARIO_DATASET_TARGET) {
    return Object.freeze({
      customerKey: CUSTOMER_KEY,
      configRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
      configProductVersion: LOCAL_MANUAL_ACCEPTANCE_CONFIG_PRODUCT_VERSION,
      configApplyPurpose: LOCAL_MANUAL_ACCEPTANCE_CONFIG_APPLY_PURPOSE,
      configDatasetVersion: null,
      configTarget: null,
    });
  }
  return Object.freeze({
    customerKey: CUSTOMER_KEY,
    configRevision:
      MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configRevision,
    configProductVersion:
      MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configProductVersion,
    configApplyPurpose: "customer_trial_test_apply",
    configDatasetVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    configTarget: CUSTOMER_TRIAL_133_TARGET,
  });
}

function targetEnvironment(targetAlias) {
  return targetAlias === PERSISTENT_SCENARIO_DATASET_TARGET
    ? "local-development"
    : "customer-trial-133";
}

export function buildScenarioDemoPlan({
  repository,
  targetAlias = PERSISTENT_SCENARIO_DATASET_TARGET,
  databaseTarget,
  migrationFingerprint,
  migrationVersion,
  targetAttestation,
} = {}) {
  const local = targetAlias === PERSISTENT_SCENARIO_DATASET_TARGET;
  if (!local && targetAlias !== CUSTOMER_TRIAL_133_TARGET) {
    throw new ScenarioDemoError("scenario-demo target alias is invalid", 2);
  }
  if (
    local &&
    (databaseTarget?.host !== REGISTERED_DEVELOPMENT_HOST ||
      databaseTarget?.port !== REGISTERED_DEVELOPMENT_PORT)
  ) {
    throw new ScenarioDemoError(
      "scenario-demo local database identity is incomplete",
      2,
    );
  }
  const backendURL = local ? SCENARIO_DEMO_ORIGIN : CUSTOMER_TRIAL_133_ORIGIN;
  const databaseName = local
    ? databaseTarget?.databaseName
    : CUSTOMER_TRIAL_133_DATABASE;
  const canonicalPlan = buildManualAcceptanceDatasetTargetPlan({
    targetAlias,
    backendURL,
    databaseName,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    targetAttestation,
  });
  if (
    !repository ||
    !/^[0-9a-f]{40}$/u.test(String(repository.commit || "")) ||
    typeof repository.dirty !== "boolean" ||
    !/^[0-9a-f]{64}$/u.test(String(repository.fingerprint || "")) ||
    !/^[0-9a-f]{64}$/u.test(String(migrationFingerprint || "")) ||
    !/^20[0-9]{12}$/u.test(String(migrationVersion || "")) ||
    !databaseName ||
    canonicalPlan.target.applyReady !== true
  ) {
    throw new ScenarioDemoError(
      "scenario-demo canonical plan preflight identity is incomplete",
      2,
    );
  }
  const runtime = runtimeContract(targetAlias);
  const targetFingerprint = local
    ? databaseTarget.targetFingerprint
    : scenarioDemoDigest({
        targetAlias,
        databaseName,
        release: canonicalPlan.target.targetAttestation?.release,
        migration: canonicalPlan.target.targetAttestation?.migration,
      });
  const plan = {
    schemaVersion: SCENARIO_DEMO_SCHEMA_VERSION,
    profileKey: "scenario-demo",
    targetAlias,
    targetEnvironment: targetEnvironment(targetAlias),
    datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
    dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
    runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
    semanticDigest: canonicalPlan.semanticDigest,
    backendURL,
    databaseName,
    repository,
    target: {
      safeTarget: local
        ? databaseTarget.safeTarget
        : `${CUSTOMER_TRIAL_133_TARGET}:${databaseName}`,
      targetFingerprint,
      disposable: false,
      registeredTargetOnly: true,
      loopbackBackendOnly: true,
    },
    migrationFingerprint,
    migrationVersion,
    release:
      canonicalPlan.target.targetAttestation?.release || repository.commit,
    runtime,
    canonicalRunner: {
      stageOrder: [...canonicalPlan.semanticPlan.stageOrder],
      stageCount: canonicalPlan.semanticPlan.stageOrder.length,
      semanticDigest: canonicalPlan.semanticDigest,
      targetPolicy: canonicalPlan.target.policyTarget,
      persistentBaseline: true,
    },
    execution: {
      replayMode: SCENARIO_DEMO_REPLAY_MODE,
      dataRetention: "long-lived",
      cleanupSupported: false,
      cleanupMode: "forward-only",
      directBusinessSQL: false,
      browserChecksRequired: true,
      manualAcceptanceCompleted: false,
    },
  };
  return Object.freeze({
    ...plan,
    planDigest: scenarioDemoDigest(plan),
    canonicalPlan,
  });
}

async function resolveScenarioDemoPlan({
  targetAlias,
  targetAttestation,
  projectRoot,
  environment,
  commandRunner,
  fetchImpl,
  readRepository,
}) {
  const repository = await readRepository(projectRoot);
  if (targetAlias === CUSTOMER_TRIAL_133_TARGET) {
    const attestation =
      targetAttestation ||
      environment.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON;
    const parsed =
      typeof attestation === "string" ? JSON.parse(attestation) : attestation;
    const migrationVersion = String(parsed?.migration || "");
    return {
      plan: buildScenarioDemoPlan({
        repository,
        targetAlias,
        targetAttestation: parsed,
        migrationVersion,
        migrationFingerprint: scenarioDemoDigest({
          targetAlias,
          release: parsed?.release,
          migration: parsed?.migration,
        }),
      }),
      credentials: null,
    };
  }
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
  const migration = migrationPreflightEvidence(migrationResult.stdout);
  return {
    plan: buildScenarioDemoPlan({
      repository,
      targetAlias,
      databaseTarget,
      migrationFingerprint: migration.fingerprint,
      migrationVersion: migration.migrationVersion,
    }),
    credentials: resolveLocalScenarioDemoCredentials(environment),
  };
}

function sumNumericFields(summary, keys) {
  return keys.reduce((total, key) => {
    const value = Number(summary?.[key] || 0);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ScenarioDemoError(`scenario-demo summary ${key} is invalid`);
    }
    return total + value;
  }, 0);
}

export function buildScenarioDemoReadback({ plan, datasetReport } = {}) {
  if (
    !datasetReport?.ok ||
    datasetReport.dataVersion !== plan?.dataVersion ||
    datasetReport.runId !== plan?.runId ||
    datasetReport.semanticDigest !== plan?.semanticDigest ||
    datasetReport.target?.alias !== plan?.targetAlias ||
    datasetReport.target?.databaseName !== plan?.databaseName ||
    !Array.isArray(datasetReport.stages) ||
    JSON.stringify(datasetReport.stages.map((stage) => stage.key)) !==
      JSON.stringify(plan?.canonicalRunner?.stageOrder || []) ||
    datasetReport.stages.some((stage) => stage.status !== "completed")
  ) {
    throw new ScenarioDemoError(
      "scenario-demo canonical dataset readback is incomplete",
    );
  }
  const stages = new Map(
    datasetReport.stages.map((stage) => [stage.key, stage]),
  );
  const source = stages.get("source")?.summary;
  const task = stages.get("task")?.summary;
  const facts = stages.get("facts")?.summary;
  const readiness = stages.get("readiness")?.summary;
  const sourceDocumentCount = sumNumericFields(
    source,
    SOURCE_DOCUMENT_COUNT_KEYS,
  );
  const processRuntimeCount = Object.keys(task?.byRole || {}).length;
  const factCount = sumNumericFields(facts, FACT_COUNT_KEYS);
  if (
    sourceDocumentCount < 1 ||
    processRuntimeCount < 1 ||
    factCount < 1 ||
    readiness?.passedTargetData !== QUERY_READY_COUNT ||
    readiness?.totalTargets !== CATALOG_TARGET_COUNT ||
    readiness?.notProvenTargetData !== BROWSER_ONLY_GAP_COUNT ||
    readiness?.queryChecksPassed !== true ||
    readiness?.manualAcceptanceCompleted !== false
  ) {
    throw new ScenarioDemoError(
      "scenario-demo exact readback is incomplete or drifted",
    );
  }
  return Object.freeze({
    schemaVersion: SCENARIO_DEMO_READBACK_SCHEMA_VERSION,
    profileKey: "scenario-demo",
    targetKey: plan.targetEnvironment,
    targetEnvironment: plan.targetEnvironment,
    targetFingerprint: plan.target.targetFingerprint,
    databaseName: plan.databaseName,
    release: plan.release,
    migrationVersion: plan.migrationVersion,
    customerConfigRevision: plan.runtime.configRevision,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    semanticDigest: plan.semanticDigest,
    stageCount: datasetReport.stages.length,
    sourceDocumentCount,
    processRuntimeCount,
    factCount,
    catalogReadyCount: readiness.passedTargetData,
    catalogTargetCount: readiness.totalTargets,
    browserChecksPending: readiness.notProvenTargetData,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: SCENARIO_DEMO_REPLAY_MODE,
  });
}

async function applyLocalCustomerConfig({ plan, credentials, fetchImpl }) {
  const policy = resolveManualAcceptanceTarget({
    target: SCENARIO_DEMO_TARGET,
    backendURL: plan.backendURL,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    databaseName: plan.databaseName,
  });
  const result = await applyManualAcceptanceCustomerConfig({
    manifest: buildScenarioDemoCustomerConfigManifest(),
    policy,
    env: {
      MANUAL_ACCEPTANCE_TARGET_CONFIRM:
        manualAcceptanceTargetConfirmation(policy),
      MANUAL_ACCEPTANCE_ADMIN_USERNAME: ADMIN_USERNAME,
      MANUAL_ACCEPTANCE_ADMIN_PASSWORD: credentials.adminPassword,
      MANUAL_ACCEPTANCE_PASSWORD: credentials.rolePassword,
    },
    fetchImpl,
  });
  if (
    result.effectiveSession?.configRevision !== plan.runtime.configRevision ||
    result.effectiveSession?.configProductVersion !==
      plan.runtime.configProductVersion ||
    result.effectiveSession?.configApplyPurpose !==
      plan.runtime.configApplyPurpose
  ) {
    throw new ScenarioDemoError(
      "scenario-demo local customer configuration readback drifted",
    );
  }
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function applyScenarioDemo({
  projectRoot,
  resolved,
  expectedPlanDigest,
  confirmation,
  fetchImpl,
  readRepository,
  outputRoot,
  environment,
}) {
  const { plan } = resolved;
  const credentials =
    plan.targetAlias === CUSTOMER_TRIAL_133_TARGET
      ? resolveCustomerTrialScenarioDemoCredentials(environment)
      : resolved.credentials;
  if (expectedPlanDigest !== plan.planDigest) {
    throw new ScenarioDemoError(
      "scenario-demo expected plan digest does not match current preflight",
      2,
    );
  }
  const expectedConfirmation = [
    DATASET_CONFIRM_PREFIX,
    plan.targetAlias,
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
  const checkRepository = async () =>
    assertRepositoryIdentityEqual(
      plan.repository,
      await readRepository(projectRoot),
    );
  await checkRepository();
  if (plan.targetAlias === PERSISTENT_SCENARIO_DATASET_TARGET) {
    await applyLocalCustomerConfig({ plan, credentials, fetchImpl });
    await checkRepository();
  }
  const canonicalOutputRoot =
    outputRoot || path.join(projectRoot, MANUAL_ACCEPTANCE_DATASET_OUTPUT_ROOT);
  const applyReportPath = manualAcceptanceDatasetApplyReportPath({
    outputRoot: canonicalOutputRoot,
    dataVersion: plan.dataVersion,
    targetAlias: plan.targetAlias,
  });
  const report = await applyManualAcceptanceDataset(
    plan.canonicalPlan,
    {
      confirmation: plan.canonicalPlan.target.expectedConfirmation,
      targetAttestation:
        plan.canonicalPlan.target.targetAttestation || undefined,
      resumeReportPath: (await fileExists(applyReportPath))
        ? applyReportPath
        : undefined,
    },
    {
      outputRoot: canonicalOutputRoot,
      credentials,
      fetchImpl,
    },
  );
  await checkRepository();
  if (!report.ok) {
    throw new ScenarioDemoError(
      `scenario-demo canonical stage failed: ${report.failedStage || "unknown"}`,
    );
  }
  return buildScenarioDemoReadback({ plan, datasetReport: report });
}

export function parseScenarioDemoArgs(argv = []) {
  const options = {
    apply: false,
    expectedPlanDigest: "",
    target: PERSISTENT_SCENARIO_DATASET_TARGET,
    targetAttestation: "",
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
    } else if (token === "--target") {
      options.target = String(argv[++index] || "").trim();
    } else if (token === "--target-attestation-json") {
      options.targetAttestation = String(argv[++index] || "").trim();
    } else {
      throw new ScenarioDemoError(`unknown option ${token}`, 2);
    }
  }
  if (
    ![PERSISTENT_SCENARIO_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET].includes(
      options.target,
    )
  ) {
    throw new ScenarioDemoError("--target is not registered", 2);
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
  return `长期业务场景数据 / Scenario Demo

只读计划与前置核对：
  node scripts/qa/scenario-demo-data.mjs

执行本地长期 V6 批次：
  SCENARIO_DEMO_CONFIRM='APPLY_SCENARIO_DEMO:scenario-demo:<database>:2026.08.15-v6:20260815-V6:<plan-digest>' \\
    node scripts/qa/scenario-demo-data.mjs --apply --expected-plan-digest <plan-digest>

133 使用同一 canonical semantic digest，但必须显式 --target customer-trial-133、
固定 SSH 隧道、带外 attestation、独立确认和目标回执。本入口不接受主机、端口、
目录、DSN 或任意命令；不执行发布、migration 或客户真实数据导入。`;
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
    targetAttestation,
  } = {},
) {
  const options = parseScenarioDemoArgs(argv);
  if (options.help) {
    return { exitCode: 0, text: `${usage()}\n`, plan: null, readback: null };
  }
  let resolved;
  try {
    resolved = await resolveScenarioDemoPlan({
      targetAlias: options.target,
      targetAttestation: options.targetAttestation || targetAttestation,
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
      fetchImpl,
      readRepository,
      outputRoot,
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
