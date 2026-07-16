#!/usr/bin/env node

import { createHash } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  FORMAL_DEMO_ACCOUNTS,
  MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS,
} from "./manual-acceptance-account-scenarios.mjs";
import { buildAttachmentFixtures } from "./manual-acceptance-attachment-data.mjs";
import {
  DEFAULT_SOURCE_DATA_SCALE,
  SIMULATION_PREFIX as SOURCE_PREFIX,
} from "./manual-acceptance-source-data.mjs";
import {
  MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
  createManualAcceptanceDatasetStageRunner,
} from "./manual-acceptance-dataset-runner.mjs";
import {
  buildManualAcceptanceTaskDataPlan,
  TOTAL_TASKS,
} from "./manual-acceptance-task-data.mjs";
import {
  CUSTOMER_TRIAL_133_ORIGIN,
  CUSTOMER_TRIAL_133_TARGET,
  LOCAL_DEV_TARGET,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceTargetAttestation,
  manualAcceptanceTargetConfirmation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

export const DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION = "2026.07.15-v3";
export const LOCAL_DATASET_TARGET = "local";
export const MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS = Object.freeze([
  "core",
  "role",
  "source",
  "task",
  "facts",
  "purchase-quality",
  "attachments",
  "readiness",
]);

function stageCapability(mode, supportedTargets, reason) {
  return Object.freeze({
    mode,
    supportedTargets: Object.freeze([...supportedTargets]),
    reason,
  });
}

export const MANUAL_ACCEPTANCE_DATASET_STAGE_CAPABILITIES = Object.freeze({
  core: stageCapability(
    "registered-targets-read-only",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "both targets use the same formal RPC verifier for exact stable unit and warehouse codes; local database seed is never implicit",
  ),
  role: stageCapability(
    "registered-targets",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "the registered account-scenario component reconciles the same simulated accounts on both targets; remote role capabilities remain verify-only",
  ),
  source: stageCapability(
    "registered-targets",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "source-data has explicit local and registered customer-trial target guards",
  ),
  task: stageCapability(
    "registered-targets",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "task-data has explicit local and registered customer-trial target guards",
  ),
  facts: stageCapability(
    "registered-targets",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "the unified fact runner uses formal source-driven APIs under the shared target, runtime, and attestation policy",
  ),
  "purchase-quality": stageCapability(
    "facts-integrated",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "purchase receipt and quality scenarios are created and verified by the unified source-driven facts stage",
  ),
  attachments: stageCapability(
    "registered-targets",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "attachment apply binds exact source, fact, and task reports to the shared target policy",
  ),
  readiness: stageCapability(
    "registered-targets-read-only",
    [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
    "readiness is read-only and binds exact reports, runtime, confirmation, and remote attestation",
  ),
});

const CUSTOMER_KEY = "yoyoosun";
const DATASET_KEY = MANUAL_ACCEPTANCE_DATASET_KEY;
const LOCAL_BACKEND_URL = "http://127.0.0.1:8300";
const DATA_VERSION_PATTERN = /^(20\d{2})\.(\d{2})\.(\d{2})-V([1-9]\d*)$/iu;
const REPORT_ROOT =
  "output/qa/manual-acceptance/datasets/${DATA_VERSION}/${TARGET_ALIAS}";
const ALLOWED_RUNNER_OPERATIONS = new Set([
  "applied",
  "completed",
  "resumed",
  "reused",
  "verified",
]);
const ATTACHMENT_OWNER_FILE_COUNTS = Object.freeze([5, 4, 4, 3, 3, 3, 5]);
const ATTACHMENT_FIXTURE_METADATA = Object.freeze(
  buildAttachmentFixtures().map((item) =>
    Object.freeze({
      fileName: item.file_name,
      mimeType: item.mime_type,
      sizeClass: item.sizeClass,
    }),
  ),
);

export class ManualAcceptanceDatasetError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "ManualAcceptanceDatasetError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new ManualAcceptanceDatasetError(`${name} is required`);
  return text;
}

function normalizeGeneratedAt(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new ManualAcceptanceDatasetError("generatedAt must be a valid date");
  }
  return date.toISOString();
}

export function normalizeManualAcceptanceDataVersion(value) {
  const raw = requiredText(value, "dataVersion");
  const match = raw.match(DATA_VERSION_PATTERN);
  if (!match) {
    throw new ManualAcceptanceDatasetError(
      "dataVersion must use the current YYYY.MM.DD-vN contract, for example 2026.07.15-v3",
    );
  }
  const [, yearText, monthText, dayText, versionText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day, 12, 0, 0);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ManualAcceptanceDatasetError(
      "dataVersion contains an invalid calendar date",
    );
  }
  const normalized = `${yearText}.${monthText}.${dayText}-v${versionText}`;
  if (normalized !== DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION) {
    throw new ManualAcceptanceDatasetError(
      `unsupported dataVersion ${normalized}; current manual acceptance dataset is ${DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION}`,
    );
  }
  return normalized;
}

export function deriveManualAcceptanceDatasetIdentity(
  value = DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
) {
  const dataVersion = normalizeManualAcceptanceDataVersion(value);
  const [, year, month, day, version] = dataVersion.match(DATA_VERSION_PATTERN);
  const compactDate = `${year}${month}${day}`;
  const dateAnchorUtc = `${year}-${month}-${day}T12:00:00.000Z`;
  const runId = `${compactDate}-V${version}`;
  return {
    datasetKey: DATASET_KEY,
    dataVersion,
    runId,
    dateAnchorUtc,
    dateAnchorUnix: Math.floor(Date.parse(dateAnchorUtc) / 1000),
    prefixes: {
      core: "SIM-PLUSH-CORE",
      source: `${SOURCE_PREFIX}-${runId}`,
      task: `SIM-YOYOOSUN-UAT-TASK-${runId}`,
      purchaseQuality: `SIM-YOYOOSUN-PQ-${runId}`,
      facts: `SIM-YOYOOSUN-UAT-FACT-${runId}`,
      attachments: `SIM-YOYOOSUN-UAT-ATT-${runId}`,
    },
  };
}

function canonicalJSON(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ManualAcceptanceDatasetError(
        "semantic plan cannot contain non-finite numbers",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJSON(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new ManualAcceptanceDatasetError(
    `semantic plan cannot contain ${typeof value}`,
  );
}

export function digestManualAcceptanceSemanticPlan(semanticPlan) {
  return createHash("sha256").update(canonicalJSON(semanticPlan)).digest("hex");
}

function command(entrypoint, args, extra = {}) {
  return {
    kind: "registered-entrypoint",
    entrypoint,
    args,
    execution: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
    ...extra,
  };
}

function capabilityForStage(stageKey) {
  const capability = MANUAL_ACCEPTANCE_DATASET_STAGE_CAPABILITIES[stageKey];
  if (!capability) {
    throw new ManualAcceptanceDatasetError(
      `stage ${stageKey} is missing an apply capability declaration`,
    );
  }
  return {
    mode: capability.mode,
    supportedTargets: [...capability.supportedTargets],
    reason: capability.reason,
  };
}

function verificationOnlyExecution() {
  return {
    [LOCAL_DATASET_TARGET]: {
      seedAllowed: false,
      allowedOperations: ["verified", "reused"],
    },
    [CUSTOMER_TRIAL_133_TARGET]: {
      seedAllowed: false,
      allowedOperations: ["verified", "reused"],
    },
  };
}

function roleStageExecution() {
  return {
    [LOCAL_DATASET_TARGET]: {
      seedAllowed: false,
      allowedOperations: ["applied", "completed", "verified", "reused"],
    },
    [CUSTOMER_TRIAL_133_TARGET]: {
      seedAllowed: false,
      allowedOperations: [
        "applied",
        "completed",
        "resumed",
        "reused",
        "verified",
      ],
    },
  };
}

function buildStages(identity) {
  const taskPlan = buildManualAcceptanceTaskDataPlan({
    runId: identity.runId,
    dataVersion: identity.dataVersion,
    target: LOCAL_DEV_TARGET,
    nowSec: identity.dateAnchorUnix,
    backendURL: LOCAL_BACKEND_URL,
  });
  const attachmentFixtures = ATTACHMENT_FIXTURE_METADATA.map((item) => ({
    ...item,
  }));
  const stages = [
    {
      key: "core",
      applyCapability: capabilityForStage("core"),
      purpose:
        "两端都通过正式 RPC 精确核对同一组稳定基础资料编码；本地 seed 仅是绑定专用验收库后的显式准备动作，不由默认 runner 执行。",
      writesBusinessData: false,
      targetExecution: verificationOnlyExecution(),
      commands: [
        command(
          "scripts/seed-core-demo-data.sh",
          ["--prefix", identity.prefixes.core],
          {
            execution: "out-of-band-explicit-only",
            supportedTargets: [LOCAL_DATASET_TARGET],
            defaultRunner: false,
            dedicatedAcceptanceDatabaseBindingRequired: true,
            remoteSeedAllowed: false,
          },
        ),
        {
          kind: "registered-read-only-verification",
          execution: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
          supportedTargets: [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
          operation: "verify-or-reuse",
          seedAllowed: false,
          stablePrefix: identity.prefixes.core,
          unitCode: "SIM-PLUSH-CORE-PCS",
          warehouseCodes: [
            "SIM-PLUSH-CORE-RM-WH",
            "SIM-PLUSH-CORE-FG-WH",
            "SIM-PLUSH-CORE-QC-HOLD",
            "SIM-PLUSH-CORE-WIP-WH",
          ],
        },
      ],
      expected: {
        units: 1,
        warehouses: 4,
      },
      replay: "upsert-by-stable-code",
      cleanupPolicy: "forward-only",
    },
    {
      key: "role",
      applyCapability: capabilityForStage("role"),
      purpose:
        "两端共用正式账号场景 API：十个正式岗位账号缺失即阻断，三类模拟场景账号同源调和；本地岗位 seed 不由默认 runner 执行。",
      writesBusinessData: true,
      targetExecution: roleStageExecution(),
      commands: [
        command(
          "scripts/seed-role-demo-admins.sh",
          ["--reset-password"],
          {
            execution: "out-of-band-explicit-only",
            supportedTargets: [LOCAL_DATASET_TARGET],
            defaultRunner: false,
            dedicatedAcceptanceDatabaseBindingRequired: true,
            remoteSeedAllowed: false,
          },
        ),
        command(
          "scripts/qa/manual-acceptance-account-scenarios.mjs",
          [
            "--apply",
            "--target",
            "${TARGET_POLICY_TARGET}",
            "--data-version",
            identity.dataVersion,
            "--run-id",
            identity.runId,
            "--backend-url",
            "${TARGET_BACKEND_URL}",
            "--audit-minimum",
            "30",
          ],
          {
            supportedTargets: [LOCAL_DATASET_TARGET, CUSTOMER_TRIAL_133_TARGET],
            remoteSeedAllowed: false,
            remoteRoleCapabilityMutationAllowed: false,
            scenarioAccountReconcileAllowed: true,
            environment: {
              MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM:
                "APPLY_SIMULATED_ACCOUNT_SCENARIOS",
              MANUAL_ACCEPTANCE_TARGET_CONFIRM: "${TARGET_CONFIRMATION}",
              MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON:
                "${TARGET_ATTESTATION_JSON}",
            },
          },
        ),
      ],
      expected: {
        formalAccounts: [...FORMAL_DEMO_ACCOUNTS],
        scenarioAccounts: MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.map(
          ({ key, username, roleKeys, disabled }) => ({
            key,
            username,
            roleKeys: [...roleKeys],
            disabled,
          }),
        ),
      },
      replay: "reconcile-by-username-and-role-metadata",
      cleanupPolicy: "forward-only",
    },
    {
      key: "source",
      applyCapability: capabilityForStage("source"),
      purpose: "准备客户、供应商、材料、产品、工序、销售、采购、委外和 BOM 模拟源单。",
      writesBusinessData: true,
      commands: [
        command("scripts/qa/manual-acceptance-source-data.mjs", [
          "--apply",
          "--target",
          "${TARGET_POLICY_TARGET}",
          "--data-version",
          identity.dataVersion,
          "--run-id",
          identity.runId,
          "--backend-url",
          "${TARGET_BACKEND_URL}",
          "--out",
          `${REPORT_ROOT}/source`,
        ], {
          environment: {
            MANUAL_ACCEPTANCE_SIM_CONFIRM:
              "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA",
            MANUAL_ACCEPTANCE_TARGET_CONFIRM: "${TARGET_CONFIRMATION}",
            MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON:
              "${TARGET_ATTESTATION_JSON}",
          },
        }),
      ],
      expected: { scale: { ...DEFAULT_SOURCE_DATA_SCALE } },
      replay: "resume-or-reuse-by-stable-business-code",
      cleanupPolicy: "retire",
    },
    {
      key: "task",
      applyCapability: capabilityForStage("task"),
      purpose: "准备九个岗位的 Workflow 手工验收任务状态矩阵。",
      writesBusinessData: true,
      commands: [
        command("scripts/qa/manual-acceptance-task-data.mjs", [
          "--apply",
          "--target",
          "${TARGET_POLICY_TARGET}",
          "--data-version",
          identity.dataVersion,
          "--run-id",
          identity.runId,
          "--backend-url",
          "${TARGET_BACKEND_URL}",
          "--out",
          `${REPORT_ROOT}/task`,
        ], {
          environment: {
            MANUAL_ACCEPTANCE_TASK_CONFIRM:
              "APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS",
            MANUAL_ACCEPTANCE_TARGET_CONFIRM: "${TARGET_CONFIRMATION}",
            MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON:
              "${TARGET_ATTESTATION_JSON}",
          },
        }),
      ],
      expected: {
        tasks: TOTAL_TASKS,
        sourceType: taskPlan.sourceType,
        sourceIdempotencyID: taskPlan.sourceID,
        statusSummary: taskPlan.summary,
        scheduleAnchorUnix: taskPlan.generatedAtUnix,
      },
      replay: "resume-or-reuse-by-task-code-and-idempotency-key",
      cleanupPolicy: "forward-only",
    },
    {
      key: "purchase-quality",
      applyCapability: capabilityForStage("purchase-quality"),
      purpose:
        "声明采购收货与质检覆盖要求；实际写入由下一步统一事实链完成，避免两套入口重复造数据。",
      writesBusinessData: false,
      targetExecution: verificationOnlyExecution(),
      commands: [
        {
          kind: "delegated-fact-stage-contract",
          contract: "source-driven-operational-facts-v1",
          execution: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
          delegatedTo: "facts",
          entrypoint: "scripts/qa/manual-acceptance-fact-data.mjs",
          genericWriterAllowed: false,
          directWriteAllowed: false,
        },
      ],
      expected: {
        delegatedTo: "facts",
        purchaseReceiptsMinimum: 54,
        qualityInspectionsMinimum: 54,
        lifecycleMatrixRequired: true,
      },
      replay: "verified-from-the-same-fact-stage-report",
      cleanupPolicy: "forward-only",
    },
    {
      key: "facts",
      applyCapability: capabilityForStage("facts"),
      purpose:
        "在同批采购、收货、质检和材料库存前置上，按正式源单链继续生产、委外、预留、出货和财务事实。",
      writesBusinessData: true,
      commands: [
        command(
          "scripts/qa/manual-acceptance-fact-data.mjs",
          [
            "--apply",
            "--target",
            "${TARGET_POLICY_TARGET}",
            "--data-version",
            identity.dataVersion,
            "--run-id",
            identity.runId,
            "--backend-url",
            "${TARGET_BACKEND_URL}",
            "--source-report",
            `${REPORT_ROOT}/source/apply-report.json`,
            "--out",
            `${REPORT_ROOT}/facts`,
          ],
          {
            contract: "source-driven-operational-facts-v1",
            genericApplyAllowed: false,
            formalBusinessAPIsOnly: true,
            environment: {
              MANUAL_ACCEPTANCE_SIM_CONFIRM:
                "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA",
              MANUAL_ACCEPTANCE_TARGET_CONFIRM: "${TARGET_CONFIRMATION}",
              MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON:
                "${TARGET_ATTESTATION_JSON}",
            },
          },
        ),
        {
          kind: "source-driven-fact-contract",
          contract: "source-driven-operational-facts-v1",
          execution: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
          applyEntrypoint: "scripts/qa/manual-acceptance-fact-data.mjs",
          helperEntrypoint:
            "scripts/qa/manual-acceptance-source-driven-facts.mjs",
          genericApplyAllowed: false,
          formalBusinessAPIsOnly: true,
          requiredChains: [
            "production-order-to-requirement-to-issue-to-completion",
            "outsourcing-order-to-issue-to-return-to-quality",
            "sales-order-to-reservation-to-shipment",
            "shipped-or-posted-source-to-finance-to-reconciliation",
          ],
        },
      ],
      expected: {
        sourceDriven: true,
        directSQL: false,
        inventoryBudgetRequired: true,
        purchaseReceiptsMinimum: 54,
        qualityInspectionsMinimum: 54,
        productionOrdersMinimum: 45,
        productionFactsMinimum: 45,
        stockReservationsMinimum: 45,
        shipmentsMinimum: 45,
        financeFactsPerTypeMinimum: 45,
      },
      replay: "idempotent-source-reference-and-payload-digest",
      cleanupPolicy: "forward-only",
    },
    {
      key: "attachments",
      applyCapability: capabilityForStage("attachments"),
      purpose: "为源单、事实和 Workflow 任务准备可下载的模拟附件。",
      writesBusinessData: true,
      commands: [
        command(
          "scripts/qa/manual-acceptance-attachment-data.mjs",
          [
            "--backend-url",
            "${TARGET_BACKEND_URL}",
            "--source-report",
            `${REPORT_ROOT}/source/apply-report.json`,
            "--fact-report",
            `${REPORT_ROOT}/facts/apply-report.json`,
            "--task-report",
            `${REPORT_ROOT}/task/apply-report.json`,
            "--out",
            `${REPORT_ROOT}/attachments/apply-report.json`,
          ],
          {
            environment: {
              MANUAL_ACCEPTANCE_ATTACHMENT_CONFIRM:
                "APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS",
              MANUAL_ACCEPTANCE_TARGET_CONFIRM: "${TARGET_CONFIRMATION}",
              MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON:
                "${TARGET_ATTESTATION_JSON}",
            },
          },
        ),
      ],
      expected: {
        owners: ATTACHMENT_OWNER_FILE_COUNTS.length,
        attachments: ATTACHMENT_OWNER_FILE_COUNTS.reduce(
          (sum, count) => sum + count,
          0,
        ),
        fixtures: attachmentFixtures,
      },
      replay: "reuse-by-owner-and-versioned-file-name-with-download-readback",
      cleanupPolicy: "forward-only",
    },
    {
      key: "readiness",
      applyCapability: capabilityForStage("readiness"),
      purpose: "只读核对当前版本各阶段报告和页面数据就绪度。",
      writesBusinessData: false,
      targetExecution: verificationOnlyExecution(),
      commands: [
        command(
          "scripts/qa/manual-acceptance-readiness.mjs",
          [
            "--verify",
            "--backend-url",
            "${TARGET_BACKEND_URL}",
            "--source-report",
            `${REPORT_ROOT}/source/apply-report.json`,
            "--fact-report",
            `${REPORT_ROOT}/facts/apply-report.json`,
            "--task-report",
            `${REPORT_ROOT}/task/apply-report.json`,
            "--out",
            `${REPORT_ROOT}/readiness`,
          ],
          {
            environment: {
              MANUAL_ACCEPTANCE_TARGET_CONFIRM: "${TARGET_CONFIRMATION}",
              MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON:
                "${TARGET_ATTESTATION_JSON}",
            },
          },
        ),
      ],
      expected: {
        componentDataVersion: identity.dataVersion,
        componentSemanticDigest: "${SEMANTIC_DIGEST}",
        queryChecksPassed: true,
        queryEvidenceComplete: false,
        datasetSubstrateVerified: true,
        browserEvidencePending: true,
        browserOnlyNotProvenTargets: 10,
      },
      replay: "read-only-repeatable-verification",
      cleanupPolicy: "not-applicable",
    },
  ];
  return MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS.map((stageKey) => {
    const stage = stages.find((item) => item.key === stageKey);
    if (!stage) {
      throw new ManualAcceptanceDatasetError(
        `stage ${stageKey} is missing from the semantic plan`,
      );
    }
    return stage;
  });
}

export function buildManualAcceptanceSemanticPlan(options = {}) {
  const identity = deriveManualAcceptanceDatasetIdentity(
    options.dataVersion || DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
  );
  return {
    contract: "manual-acceptance-dataset-semantic-plan-v2",
    datasetKey: identity.datasetKey,
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQLFacts: false,
    dataVersion: identity.dataVersion,
    runId: identity.runId,
    dateAnchorUtc: identity.dateAnchorUtc,
    dateAnchorUnix: identity.dateAnchorUnix,
    prefixes: identity.prefixes,
    stageOrder: [...MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS],
    runnerContract: {
      serial: true,
      failClosed: true,
      revision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
      handlerRegistry: "scripts/qa/manual-acceptance-dataset-runner.mjs",
      placeholders: {
        "${TARGET_POLICY_TARGET}": "target.policyTarget",
        "${TARGET_BACKEND_URL}": "target.backendURL",
        "${TARGET_CONFIRMATION}": "targetConfirmation",
        "${TARGET_ATTESTATION_JSON}": "targetAttestation",
      },
    },
    stages: buildStages(identity),
    replay: {
      sameDataVersion: "resume-or-reuse-with-stage-readback",
      semanticMismatch: "fail-closed-before-next-stage",
      newDataVersion: "create-a-new-forward-only-batch",
    },
    cleanup: "retire/forward-only",
    boundary:
      "全部为模拟试用数据；正式部署默认不执行，本地与 133 只共享业务语义，不共享数据库 ID。",
  };
}

function normalizeTargetAlias(value) {
  const target = requiredText(value, "target");
  if (target === LOCAL_DATASET_TARGET || target === LOCAL_DEV_TARGET) {
    return LOCAL_DATASET_TARGET;
  }
  if (target === CUSTOMER_TRIAL_133_TARGET) return target;
  throw new ManualAcceptanceDatasetError(
    `unsupported target ${target}; only ${LOCAL_DATASET_TARGET} and ` +
      `${CUSTOMER_TRIAL_133_TARGET} are allowed`,
  );
}

function normalizedStageCapability(stage) {
  const capability = stage?.applyCapability;
  if (!capability || typeof capability !== "object" || Array.isArray(capability)) {
    throw new ManualAcceptanceDatasetError(
      `stage ${stage?.key || "unknown"} is missing an apply capability object`,
    );
  }
  const mode = requiredText(
    capability.mode,
    `${stage.key}.applyCapability.mode`,
  );
  if (!Array.isArray(capability.supportedTargets)) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key}.applyCapability.supportedTargets must be an array`,
    );
  }
  const supportedTargets = capability.supportedTargets.map((target) =>
    normalizeTargetAlias(target),
  );
  if (new Set(supportedTargets).size !== supportedTargets.length) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key}.applyCapability.supportedTargets contains duplicates`,
    );
  }
  return {
    mode,
    supportedTargets,
    reason: requiredText(
      capability.reason,
      `${stage.key}.applyCapability.reason`,
    ),
  };
}

export function evaluateManualAcceptanceTargetCapabilities(
  semanticPlan,
  targetAlias,
) {
  const alias = normalizeTargetAlias(targetAlias);
  if (!Array.isArray(semanticPlan?.stages)) {
    throw new ManualAcceptanceDatasetError(
      "semantic plan stages must be an array",
    );
  }
  const supportedStages = [];
  const blockedStages = [];
  for (const stage of semanticPlan.stages) {
    const stageKey = requiredText(stage?.key, "stage.key");
    const capability = normalizedStageCapability(stage);
    if (capability.supportedTargets.includes(alias)) {
      supportedStages.push(stageKey);
      continue;
    }
    blockedStages.push({
      stageKey,
      mode: capability.mode,
      reason: capability.reason,
    });
  }
  return {
    targetAlias: alias,
    ready: blockedStages.length === 0,
    supportedStages,
    blockedStages,
  };
}

function buildTarget({
  targetAlias,
  backendURL,
  databaseName,
  dataVersion,
  runId,
  targetAttestation,
}) {
  const alias = normalizeTargetAlias(targetAlias);
  const policyTarget =
    alias === LOCAL_DATASET_TARGET ? LOCAL_DEV_TARGET : CUSTOMER_TRIAL_133_TARGET;
  const policy = resolveManualAcceptanceTarget({
    target: policyTarget,
    backendURL:
      backendURL ||
      (alias === LOCAL_DATASET_TARGET
        ? LOCAL_BACKEND_URL
        : CUSTOMER_TRIAL_133_ORIGIN),
    datasetKey: DATASET_KEY,
    dataVersion,
    runId,
    databaseName,
  });
  const parsedAttestation = parseManualAcceptanceTargetAttestation(
    targetAttestation,
  );
  if (parsedAttestation && !policy.external) {
    throw new ManualAcceptanceDatasetError(
      "target attestation is only valid for customer-trial-133",
    );
  }
  const attestation = parsedAttestation
    ? assertManualAcceptanceTargetAttestation({
        policy,
        attestation: parsedAttestation,
      })
    : null;
  const attestationTemplate = policy.external
    ? {
        target: CUSTOMER_TRIAL_133_TARGET,
        origin: CUSTOMER_TRIAL_133_ORIGIN,
        customerKey: CUSTOMER_KEY,
        environment: "prod",
        release: "<immutable-release>",
        migration: "<migration-revision>",
        debug: {
          seedEnabled: false,
          seedAllowed: false,
          cleanupEnabled: false,
          cleanupAllowed: false,
          businessDataClearEnabled: false,
          businessDataClearAllowed: false,
        },
      }
    : null;
  return {
    alias,
    policyTarget: policy.target,
    classification:
      alias === LOCAL_DATASET_TARGET ? "local-development" : "customer-trial",
    productionTarget: false,
    backendURL: policy.backendURL,
    databaseName: policy.databaseName || null,
    external: policy.external,
    expectedCustomerKey: CUSTOMER_KEY,
    datasetKey: DATASET_KEY,
    dataVersion,
    runId,
    expectedConfirmation: manualAcceptanceTargetConfirmation(policy) || null,
    targetAttestation: attestation,
    targetAttestationTemplate: attestationTemplate,
    databaseIdentity: "independent-per-target/runtime-readback-exact",
    bindingReady:
      alias === LOCAL_DATASET_TARGET
        ? Boolean(backendURL && policy.databaseName)
        : Boolean(attestation),
  };
}

export function buildManualAcceptanceDatasetTargetPlan(options = {}) {
  const semanticPlan = buildManualAcceptanceSemanticPlan(options);
  const semanticDigest = digestManualAcceptanceSemanticPlan(semanticPlan);
  const targetBinding = buildTarget({
    targetAlias: options.targetAlias || LOCAL_DATASET_TARGET,
    backendURL: options.backendURL,
    databaseName: options.databaseName,
    dataVersion: semanticPlan.dataVersion,
    runId: semanticPlan.runId,
    targetAttestation: options.targetAttestation,
  });
  const stageCapabilities = evaluateManualAcceptanceTargetCapabilities(
    semanticPlan,
    targetBinding.alias,
  );
  return {
    mode: "plan",
    dryRun: true,
    writesBackend: false,
    scope: "manual-acceptance-dataset",
    generatedAt: normalizeGeneratedAt(options.generatedAt),
    target: {
      ...targetBinding,
      stageCapabilities,
      applyReady: targetBinding.bindingReady && stageCapabilities.ready,
    },
    targetSelectionExplicit: Boolean(options.targetAlias),
    dataVersion: semanticPlan.dataVersion,
    datasetKey: semanticPlan.datasetKey,
    semanticDigest,
    semanticPlan,
    cleanup: semanticPlan.cleanup,
  };
}

export function buildManualAcceptanceDatasetBundle(options = {}) {
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  const overrides = options.targetOverrides || {};
  const local = buildManualAcceptanceDatasetTargetPlan({
    ...overrides[LOCAL_DATASET_TARGET],
    dataVersion: options.dataVersion,
    generatedAt,
    targetAlias: LOCAL_DATASET_TARGET,
  });
  const trial = buildManualAcceptanceDatasetTargetPlan({
    ...overrides[CUSTOMER_TRIAL_133_TARGET],
    dataVersion: options.dataVersion,
    generatedAt,
    targetAlias: CUSTOMER_TRIAL_133_TARGET,
  });
  if (local.semanticDigest !== trial.semanticDigest) {
    throw new ManualAcceptanceDatasetError(
      "target semantic plans diverged; refuse environment-specific dataset semantics",
    );
  }
  return {
    mode: "plan",
    dryRun: true,
    writesBackend: false,
    scope: "manual-acceptance-dataset-bundle",
    generatedAt,
    dataVersion: local.dataVersion,
    datasetKey: local.datasetKey,
    semanticDigest: local.semanticDigest,
    targets: [local, trial],
    parity: {
      required: true,
      databaseIdsShared: false,
      rule: "same semanticDigest with independent database IDs",
    },
    cleanup: "retire/forward-only",
  };
}

function validateApplyPlan(plan, confirmation, targetAttestation) {
  if (!plan || plan.mode !== "plan" || plan.dryRun !== true) {
    throw new ManualAcceptanceDatasetError("apply requires a validated target plan");
  }
  if (plan.targetSelectionExplicit !== true) {
    throw new ManualAcceptanceDatasetError(
      "apply requires an explicitly selected target plan",
    );
  }
  const target = plan.target || {};
  const targetAlias = normalizeTargetAlias(target.alias);
  if (target.productionTarget !== false) {
    throw new ManualAcceptanceDatasetError("production targets are forbidden");
  }
  if (targetAlias === LOCAL_DATASET_TARGET) {
    if (target.bindingReady !== true || !target.databaseName) {
      throw new ManualAcceptanceDatasetError(
        "local apply requires an explicitly bound dedicated acceptance backend and databaseName",
      );
    }
    const localBackend = new URL(target.backendURL);
    if (localBackend.port === "8300") {
      throw new ManualAcceptanceDatasetError(
        "local apply refuses port 8300 because it is the shared development backend",
      );
    }
  }
  const digest = digestManualAcceptanceSemanticPlan(plan.semanticPlan);
  if (digest !== plan.semanticDigest) {
    throw new ManualAcceptanceDatasetError(
      "semantic plan digest mismatch; refuse apply",
    );
  }
  const policy = {
    target: target.policyTarget,
    datasetKey: plan.semanticPlan.datasetKey,
    backendURL: target.backendURL,
    databaseName: target.databaseName || undefined,
    dataVersion: plan.dataVersion,
    runId: plan.semanticPlan.runId,
  };
  const resolved = assertManualAcceptanceMutationTarget(policy, {
    confirmation,
  });
  const providedAttestation =
    targetAttestation ?? target.targetAttestation ?? undefined;
  if (!resolved.external && providedAttestation) {
    throw new ManualAcceptanceDatasetError(
      "target attestation is only valid for customer-trial-133",
    );
  }
  const attestation = resolved.external
    ? assertManualAcceptanceTargetAttestation({
        policy,
        attestation: providedAttestation,
      })
    : null;
  const stageCapabilities = evaluateManualAcceptanceTargetCapabilities(
    plan.semanticPlan,
    target.alias,
  );
  if (!stageCapabilities.ready) {
    throw new ManualAcceptanceDatasetError(
      `target ${target.alias} cannot apply the complete dataset; unsupported stages: ${stageCapabilities.blockedStages
        .map((item) => `${item.stageKey}[${item.mode}]`)
        .join(", ")}`,
    );
  }
  return {
    confirmation: manualAcceptanceTargetConfirmation(resolved)
      ? confirmation
      : null,
    targetAttestation: attestation,
    stageCapabilities,
  };
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeRunnerRecord(value, stageKey, field) {
  if (!isPlainRecord(value)) {
    throw new ManualAcceptanceDatasetError(
      `${stageKey} runner ${field} must be an explicit object`,
    );
  }
  try {
    return JSON.parse(canonicalJSON(value));
  } catch (error) {
    throw new ManualAcceptanceDatasetError(
      `${stageKey} runner ${field} must be a JSON-safe object: ${error?.message || error}`,
    );
  }
}

export function normalizeManualAcceptanceStageResult(result, stage, plan) {
  const value = result;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner must return an object`,
    );
  }
  if (value.ok !== true) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner must return ok=true: ${value?.error || "no verified success result"}`,
    );
  }
  if (value.status !== "completed") {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner returned non-complete status=${value.status}`,
    );
  }
  if (value.stageKey !== stage.key) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner returned stageKey=${value.stageKey}`,
    );
  }
  if (value.dataVersion !== plan.dataVersion) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner returned a different dataVersion`,
    );
  }
  if (value.semanticDigest !== plan.semanticDigest) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner returned a different semanticDigest`,
    );
  }
  const operation = String(value.operation || "");
  if (!ALLOWED_RUNNER_OPERATIONS.has(operation)) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner returned unsupported operation=${operation}`,
    );
  }
  const targetExecution = stage.targetExecution?.[plan.target?.alias];
  if (
    targetExecution &&
    (!Array.isArray(targetExecution.allowedOperations) ||
      !targetExecution.allowedOperations.includes(operation))
  ) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner operation=${operation} is forbidden for target ${plan.target?.alias}`,
    );
  }
  const summary = normalizeRunnerRecord(value.summary, stage.key, "summary");
  const references = normalizeRunnerRecord(
    value.references,
    stage.key,
    "references",
  );
  const runner = references.runner;
  if (!isPlainRecord(runner)) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner references.runner must be an explicit object`,
    );
  }
  if (runner.revision !== MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner receipt has an unexpected runner revision`,
    );
  }
  if (
    runner.handlerId !==
    `${MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION}:${stage.key}`
  ) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner receipt has an unexpected handler identity`,
    );
  }
  for (const field of ["componentEntrypoint", "reportPath"]) {
    if (!String(runner[field] || "").trim()) {
      throw new ManualAcceptanceDatasetError(
        `${stage.key} runner receipt is missing ${field}`,
      );
    }
  }
  if (!/^[0-9a-f]{64}$/u.test(String(runner.componentDigest || ""))) {
    throw new ManualAcceptanceDatasetError(
      `${stage.key} runner receipt has an invalid componentDigest`,
    );
  }
  return {
    status: value.status,
    stageKey: value.stageKey,
    dataVersion: value.dataVersion,
    semanticDigest: value.semanticDigest,
    operation,
    summary,
    references,
  };
}

function baseApplyReport(plan, generatedAt) {
  return {
    mode: "apply",
    ok: false,
    scope: "manual-acceptance-dataset",
    generatedAt,
    target: { ...plan.target },
    datasetKey: plan.semanticPlan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.semanticPlan.runId,
    dateAnchorUtc: plan.semanticPlan.dateAnchorUtc,
    semanticDigest: plan.semanticDigest,
    cleanup: "retire/forward-only",
    replay: { ...plan.semanticPlan.replay },
    failedStage: null,
    stages: plan.semanticPlan.stages.map((stage) => ({
      key: stage.key,
      stageKey: null,
      status: "not_started",
      dataVersion: null,
      semanticDigest: null,
      operation: null,
      replay: stage.replay,
      cleanupPolicy: stage.cleanupPolicy,
      summary: null,
      references: null,
      blockedReason: null,
      error: null,
    })),
  };
}

export async function applyManualAcceptanceDataset(
  plan,
  { confirmation, targetAttestation } = {},
  deps = {},
) {
  const executionBinding = validateApplyPlan(
    plan,
    confirmation,
    targetAttestation,
  );
  const runStage = createManualAcceptanceDatasetStageRunner(deps);
  const generatedAt = normalizeGeneratedAt(
    typeof deps.now === "function" ? deps.now() : deps.now,
  );
  const report = baseApplyReport(plan, generatedAt);
  report.targetConfirmation = executionBinding.confirmation;
  report.targetAttestation = executionBinding.targetAttestation;
  report.target.stageCapabilities = executionBinding.stageCapabilities;
  report.target.applyReady = true;
  report.target.targetAttestation = executionBinding.targetAttestation;
  for (let index = 0; index < plan.semanticPlan.stages.length; index += 1) {
    const stage = plan.semanticPlan.stages[index];
    const stageReport = report.stages[index];
    stageReport.status = "running";
    try {
      const result = await runStage({
        mode: "apply",
        target: structuredClone(plan.target),
        dataVersion: plan.dataVersion,
        dateAnchorUtc: plan.semanticPlan.dateAnchorUtc,
        semanticDigest: plan.semanticDigest,
        semanticPlan: structuredClone(plan.semanticPlan),
        stage: structuredClone(stage),
        targetConfirmation: executionBinding.confirmation,
        targetAttestation: executionBinding.targetAttestation
          ? structuredClone(executionBinding.targetAttestation)
          : null,
        completedStages: report.stages
          .slice(0, index)
          .map(
            ({
              key,
              stageKey,
              status,
              dataVersion,
              semanticDigest,
              operation,
            }) => ({
              key,
              stageKey,
              status,
              dataVersion,
              semanticDigest,
              operation,
            }),
          ),
      });
      const normalized = normalizeManualAcceptanceStageResult(
        result,
        stage,
        plan,
      );
      Object.assign(stageReport, normalized);
    } catch (error) {
      stageReport.status = "failed";
      stageReport.error = String(error?.message || error);
      if (typeof error?.toBlockedReason === "function") {
        stageReport.blockedReason = error.toBlockedReason(stage.key);
      } else if (String(error?.code || "").trim()) {
        stageReport.blockedReason = {
          code: String(error.code),
          stageKey: stage.key,
          runnerRevision: MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION,
        };
      }
      report.failedStage = stage.key;
      return report;
    }
  }
  report.ok = true;
  return report;
}

export function parseManualAcceptanceDatasetArgs(argv = []) {
  const options = {
    apply: false,
    help: false,
    dataVersion: DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION,
    target: "",
    backendURL: "",
    databaseName: "",
    confirmation: "",
    targetAttestation: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new ManualAcceptanceDatasetError(`unexpected argument ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ManualAcceptanceDatasetError(`missing value for ${token}`);
    }
    index += 1;
    switch (key) {
      case "data-version":
        options.dataVersion = value;
        break;
      case "target":
        options.target = value;
        break;
      case "backend-url":
        options.backendURL = value;
        break;
      case "database-name":
        options.databaseName = value;
        break;
      case "confirm":
        options.confirmation = value;
        break;
      case "target-attestation-json":
        options.targetAttestation = value;
        break;
      default:
        throw new ManualAcceptanceDatasetError(`unknown option ${token}`);
    }
  }
  options.dataVersion = normalizeManualAcceptanceDataVersion(
    options.dataVersion,
  );
  if (options.apply) {
    if (!options.target) {
      throw new ManualAcceptanceDatasetError(
        "--apply requires explicit --target local or customer-trial-133",
      );
    }
    options.target = normalizeTargetAlias(options.target);
    if (options.target === LOCAL_DATASET_TARGET) {
      if (!options.backendURL || !options.databaseName) {
        throw new ManualAcceptanceDatasetError(
          "local --apply requires explicit --backend-url and --database-name for a dedicated acceptance backend",
        );
      }
      let localBackend;
      try {
        localBackend = new URL(options.backendURL);
      } catch {
        throw new ManualAcceptanceDatasetError("backend URL is invalid");
      }
      if (localBackend.port === "8300") {
        throw new ManualAcceptanceDatasetError(
          "local --apply refuses port 8300 because it is the shared development backend",
        );
      }
      if (!options.confirmation) {
        throw new ManualAcceptanceDatasetError(
          "local --apply requires the exact database-bound --confirm value",
        );
      }
    } else if (options.databaseName) {
      throw new ManualAcceptanceDatasetError(
        "customer-trial-133 uses its registered database identity; omit --database-name",
      );
    }
  } else if (
    options.target ||
    options.backendURL ||
    options.databaseName ||
    options.confirmation ||
    options.targetAttestation
  ) {
    throw new ManualAcceptanceDatasetError(
      "target and apply-binding options are only valid with --apply; " +
        "default plan always emits both targets",
    );
  }
  return options;
}

function helpText() {
  return [
    "手工验收数据集编排器 / Manual Acceptance Dataset",
    "",
    `当前唯一数据合同为 ${DEFAULT_MANUAL_ACCEPTANCE_DATA_VERSION} / 20260715-V3。`,
    "默认只生成 local 与 customer-trial-133 两份同语义计划，",
    "不连接服务、不写文件、不写数据库：",
    "  node scripts/qa/manual-acceptance-dataset.mjs",
    "",
    `CLI --apply 固定使用 ${MANUAL_ACCEPTANCE_DATASET_RUNNER_REVISION}，并要求显式目标。`,
    "完整 apply 会 fail-closed：每个阶段只允许走唯一注册 handler 与严格组件回执。",
    "core 两端都只走正式 RPC 稳定码核对；默认 runner 不执行任何数据库 seed 脚本。",
    "role 两端都只走注册账号场景组件；正式岗位账号缺失会返回机器可读阻断原因。",
    "采购收货与质检归入统一 source-driven facts，不再调用旧通用写入器。",
    "local apply 必须显式提供非 8300 的专用后端、plush_erp_acceptance_* 数据库名，",
    "以及绑定 target/dataVersion/runId/databaseName 的精确确认串；runner 会先读回数据库身份和 core 稳定码，再执行任何写入。",
    "133 apply 还必须提供同一 dataVersion/runId 绑定的确认串，",
    "以及 target/origin/customer/release/migration/debug 的带外证明：",
    "  --target customer-trial-133",
    "  --confirm <exact-confirmation>",
    "  --target-attestation-json <exact-json>",
    "",
    "正式生产目标不在允许列表中。",
  ].join("\n");
}

export async function runManualAcceptanceDatasetCli(argv = [], deps = {}) {
  const options = parseManualAcceptanceDatasetArgs(argv);
  if (options.help) {
    return { text: `${helpText()}\n`, exitCode: 0, plan: null, report: null };
  }
  if (!options.apply) {
    const plan = buildManualAcceptanceDatasetBundle({
      dataVersion: options.dataVersion,
      generatedAt:
        typeof deps.now === "function" ? deps.now() : deps.now || new Date(),
    });
    return {
      text: `${JSON.stringify(plan, null, 2)}\n`,
      exitCode: 0,
      plan,
      report: null,
    };
  }
  const plan = buildManualAcceptanceDatasetTargetPlan({
    dataVersion: options.dataVersion,
    targetAlias: options.target,
    backendURL: options.backendURL || undefined,
    databaseName: options.databaseName || undefined,
    targetAttestation: options.targetAttestation || undefined,
    generatedAt:
      typeof deps.now === "function" ? deps.now() : deps.now || new Date(),
  });
  const report = await applyManualAcceptanceDataset(
    plan,
    {
      confirmation: options.confirmation || undefined,
      targetAttestation: options.targetAttestation || undefined,
    },
    deps,
  );
  return {
    text: `${JSON.stringify(report, null, 2)}\n`,
    exitCode: report.ok ? 0 : 1,
    plan,
    report,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runManualAcceptanceDatasetCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.message || error}\n`);
      process.exitCode = error instanceof ManualAcceptanceDatasetError ? error.exitCode : 1;
    });
}
