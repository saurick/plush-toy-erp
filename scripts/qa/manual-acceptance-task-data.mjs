#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CUSTOMER_TRIAL_133_TARGET,
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  normalizeManualAcceptanceBackendURL,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/task-data";
const CUSTOMER_KEY = "yoyoosun";
const RUNTIME_ADMIN_USERNAME = "admin";
const SOURCE_TYPE = "simulated-manual-acceptance-task-batch";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT-TASK";
export const TASK_COPY_REVISION = "PLAIN3";
const STABLE_ANCHOR_BASE_UNIX = Date.UTC(2024, 0, 1, 12, 0, 0) / 1000;
const STABLE_ANCHOR_WINDOW_DAYS = 10 * 366;

export const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS";
export const RETIRE_CONFIRM_PREFIX =
  "RETIRE_LEGACY_SIMULATED_MANUAL_ACCEPTANCE_TASKS";
export const WORKFLOW_TASK_CAS_MIGRATION = "20260711063237";
export const WORKFLOW_TASK_CAS_RELEASE =
  "929ec0b3a563bec0796274d033a97277519bcb51";
export const TASKS_PER_ROLE = 20;
export const TASK_ROLES = Object.freeze([
  "boss",
  "sales",
  "purchase",
  "production",
  "warehouse",
  "finance",
  "pmc",
  "quality",
  "engineering",
]);
export const TOTAL_TASKS = TASK_ROLES.length * TASKS_PER_ROLE;
export const ROLE_USERS = Object.freeze({
  boss: "demo_boss",
  sales: "demo_sales",
  purchase: "demo_purchase",
  production: "demo_production",
  warehouse: "demo_warehouse",
  finance: "demo_finance",
  pmc: "demo_pmc",
  quality: "demo_quality",
  engineering: "demo_engineering",
});

export function assertManualAcceptanceTaskTargetCompatibility(
  plan,
  targetAttestation,
) {
  const policy = resolveManualAcceptanceTarget(plan);
  if (policy.target !== CUSTOMER_TRIAL_133_TARGET) {
    if (targetAttestation) {
      throw new CliError(
        "target attestation is only valid for customer-trial-133",
        2,
      );
    }
    return undefined;
  }
  const attested = assertManualAcceptanceTargetAttestation({
    policy,
    attestation: targetAttestation,
  });
  if (
    !/^\d{14}$/u.test(attested.migration) ||
    attested.migration < WORKFLOW_TASK_CAS_MIGRATION
  ) {
    throw new CliError(
      `${CUSTOMER_TRIAL_133_TARGET} requires Workflow task CAS migration >= ${WORKFLOW_TASK_CAS_MIGRATION} before the first task write`,
      2,
    );
  }
  if (attested.release !== WORKFLOW_TASK_CAS_RELEASE) {
    throw new CliError(
      `${CUSTOMER_TRIAL_133_TARGET} requires the reviewed Workflow task CAS release ${WORKFLOW_TASK_CAS_RELEASE} before the first task write`,
      2,
    );
  }
  return attested;
}

export const TASK_STATUS_KEYS = Object.freeze([
  "ready",
  "blocked",
  "done",
  "rejected",
]);
const REJECT_ACTION_ROLES = new Set([
  "boss",
  "warehouse",
  "finance",
  "quality",
]);
const ACTIONABLE_STATUS_COUNTS = Object.freeze({
  ready: 12,
  blocked: 3,
  done: 3,
  rejected: 2,
});
const NON_REJECT_STATUS_COUNTS = Object.freeze({
  ready: 14,
  blocked: 3,
  done: 3,
  rejected: 0,
});
const BOSS_STATUS_COUNTS = Object.freeze({
  ready: 15,
  blocked: 3,
  done: 0,
  rejected: 2,
});

export function getManualAcceptanceTaskStatusCounts(roleKey) {
  if (roleKey === "boss") return BOSS_STATUS_COUNTS;
  return REJECT_ACTION_ROLES.has(roleKey)
    ? ACTIONABLE_STATUS_COUNTS
    : NON_REJECT_STATUS_COUNTS;
}
const ACTION_METHOD_BY_STATUS = Object.freeze({
  blocked: "block_task_action",
  done: "complete_task_action",
  rejected: "reject_task_action",
});
const ACTION_KEY_BY_STATUS = Object.freeze({
  blocked: "block",
  done: "complete",
  rejected: "reject",
});
const ACTION_PAYLOAD_SYSTEM_KEYS = new Set([
  "business_status_key",
  "command_key",
  "domain_command",
  "domain_command_key",
  "expected_version",
  "idempotency_key",
  "intent_hash",
  "owner_role_key",
  "source_id",
  "source_line_id",
  "source_no",
  "source_type",
  "task_status_key",
  "task_version",
  "version",
]);
const FORBIDDEN_BUSINESS_COPY =
  /\b(?:workflow|fact|json-rpc|rbac|usecase|schema|api|version|idempotency|debugrunid|raw\s*id)\b|甲方/iu;

const ROLE_SCENARIOS = Object.freeze({
  boss: Object.freeze({
    label: "老板",
    businessStatus: "project_pending",
    requiredCapability: "workflow.task.approve",
    topics: Object.freeze([
      "确认交期",
      "看一下报价",
      "看本周哪些订单可能延期",
      "确认客户要求",
      "安排优先订单",
    ]),
    summary: "请看交期、成本和产能，再给出意见。",
    blockedReason: "还在等客户确认交期或价格。",
    rejectedReason: "产能安排不清楚，请补充。",
    context: Object.freeze({
      customer_name: "东莞美悦礼品",
      style_no: "27001#",
      product_name: "云朵小熊",
      quantity: "3600",
      unit: "只",
    }),
  }),
  sales: Object.freeze({
    label: "业务",
    businessStatus: "project_pending",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "补齐客户资料",
      "确认颜色",
      "确认包装方式",
      "确认交货地址",
      "回复交期",
    ]),
    summary: "请记下客户确认内容，再交给下一位。",
    blockedReason: "还在等客户确认颜色或包装。",
    rejectedReason: "客户确认内容不全，请补齐。",
    context: Object.freeze({
      customer_name: "深圳美悦礼品",
      style_no: "27002#",
      product_name: "星星挂兔",
      quantity: "2400",
      unit: "只",
    }),
  }),
  purchase: Object.freeze({
    label: "采购",
    businessStatus: "material_preparing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "确认主料到货",
      "确认辅料交期",
      "确认供应商回复",
      "检查采购数量",
      "催一下加急物料",
    ]),
    summary: "请确认到货日期和数量。",
    blockedReason: "供应商还没确认交期。",
    rejectedReason: "采购数量不对，请重查。",
    context: Object.freeze({
      material_name: "米白短毛绒",
      spec: "58 英寸 / 280g",
      supplier_name: "嘉顺布行",
      quantity: "680",
      unit: "米",
    }),
  }),
  production: Object.freeze({
    label: "生产经理",
    businessStatus: "production_processing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "安排今日车缝",
      "调整充棉安排",
      "看首件是否合格",
      "安排返工",
      "确认交接内容",
    ]),
    summary: "请看材料是否到齐，再安排今天做多少。",
    blockedReason: "主料还没到，今天还不能开始做。",
    rejectedReason: "数量超过今天产能，请调整。",
    context: Object.freeze({
      customer_name: "广州美悦礼品",
      style_no: "27003#",
      product_name: "奶油小狗",
      quantity: "1800",
      unit: "只",
    }),
  }),
  warehouse: Object.freeze({
    label: "仓库",
    businessStatus: "warehouse_processing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "检查成品数量",
      "确认备货数量",
      "安排来料放哪里",
      "检查标签",
      "确认出库数量",
    ]),
    summary: "请对照实物、标签和单据确认。",
    blockedReason: "系统数量和实物对不上，请盘点。",
    rejectedReason: "标签和实物不一致，请更正。",
    context: Object.freeze({
      customer_name: "东莞美悦礼品",
      style_no: "27001#",
      product_name: "云朵小熊",
      quantity: "960",
      unit: "只",
    }),
  }),
  finance: Object.freeze({
    label: "财务",
    businessStatus: "reconciling",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "确认客户回款",
      "核对供应商账单",
      "核对开票资料",
      "跟进逾期款",
      "确认本周付款",
    ]),
    summary: "请确认金额、客户或供应商和日期。",
    blockedReason: "回款和银行记录还没对上。",
    rejectedReason: "对账金额不一致，请重查。",
    context: Object.freeze({
      customer_name: "深圳美悦礼品",
      style_no: "27002#",
      product_name: "星星挂兔",
      amount: "128600.00",
      quantity: "1200",
      unit: "只",
    }),
  }),
  pmc: Object.freeze({
    label: "生产跟单",
    businessStatus: "material_preparing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "确认材料齐不齐",
      "安排订单先后",
      "看本周哪些会延期",
      "确认生产准备",
      "催一下没做完的事",
    ]),
    summary: "请看材料是否到齐、今天能做多少和交期，再安排下一步。",
    blockedReason: "主料到货日期有冲突，请一起确认。",
    rejectedReason: "材料信息不全，请补齐。",
    context: Object.freeze({
      customer_name: "广州美悦礼品",
      style_no: "27003#",
      product_name: "奶油小狗",
      quantity: "4200",
      unit: "只",
    }),
  }),
  quality: Object.freeze({
    label: "品质",
    businessStatus: "qc_pending",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "检查来料记录",
      "检查第一件",
      "检查返工品",
      "检查待出货成品",
      "记录外观问题",
    ]),
    summary: "请记录检查了多少、发现什么问题和怎么处理。",
    blockedReason: "样品或检验要求还没准备好。",
    rejectedReason: "检验记录不全，请补充。",
    context: Object.freeze({
      material_name: "白色填充棉",
      spec: "A级 PP棉",
      supplier_name: "佳美辅料",
      quantity: "320",
      unit: "千克",
    }),
  }),
  engineering: Object.freeze({
    label: "工程",
    businessStatus: "engineering_preparing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "补充材料明细",
      "检查款图尺寸",
      "补充车缝说明",
      "确认包装资料",
      "整理首件要求",
    ]),
    summary: "请确认资料能直接给采购和生产使用。",
    blockedReason: "款图或尺寸表还没确认。",
    rejectedReason: "做法和样品不一样，请更正。",
    context: Object.freeze({
      customer_name: "东莞美悦礼品",
      style_no: "27001#",
      product_name: "云朵小熊",
      quantity: "1500",
      unit: "只",
    }),
  }),
});

const USAGE = `Manual acceptance task data

Usage:
  node scripts/qa/manual-acceptance-task-data.mjs [--run-id <text>] \\
    [--backend-url <url>] [--target <profile>] [--data-version <text>] \\
    [--out <directory>] [--apply] [--retire-legacy-run-id <text>] [--retire-legacy-copy-revision <text>]

Apply to the default loopback local/dev runtime:
  MANUAL_ACCEPTANCE_TASK_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-task-data.mjs --apply \\
      --backend-url http://127.0.0.1:8300 \\
      --run-id LOCAL-UAT-20260711 \\
      --out output/qa/manual-acceptance/task-data

The registered customer trial target additionally requires
--target customer-trial-133, the exact registered backend origin, an explicit
--data-version, MANUAL_ACCEPTANCE_TARGET_CONFIRM bound to target/version/run,
and MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON with exact
origin/customer/release/migration/debug fields.

Default mode only prints the deterministic 180-task plan. Apply uses the formal
workflow JSON-RPC create/action contracts, never writes facts, and never connects
to SQL directly. A date-bearing run id uses that UTC date as its schedule anchor;
other run ids use a stable hash anchor and remain reproducible. Apply writes
<out>/apply-report.json with runId, prefix, sourceType, and sourceID batch fields.
The independent runtime super admin is used only for debug.capabilities; task reads,
creates, and actions continue to use the corresponding demo role accounts.`;

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function requiredText(value, name) {
  const normalized = optionalText(value);
  if (!normalized) throw new CliError(`${name} is required`);
  return normalized;
}

function positiveSafeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

function timestampRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function stableHash32(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function exactUTCSeconds(parts, defaultHour) {
  const [year, month, day, hour = defaultHour, minute = 0, second = 0] = parts;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestamp);
  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return undefined;
  }
  return Math.floor(timestamp / 1000);
}

function runAnchorSeconds(runId, explicitNowSec) {
  if (explicitNowSec !== undefined) {
    return positiveSafeInteger(explicitNowSec, "nowSec");
  }
  const timestampMatch = String(runId).match(
    /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/u,
  );
  if (timestampMatch) {
    const timestamp = exactUTCSeconds(timestampMatch.slice(1).map(Number), 0);
    if (timestamp !== undefined) return timestamp;
  }
  const dateMatch = String(runId).match(/(\d{4})(\d{2})(\d{2})/u);
  if (dateMatch) {
    const timestamp = exactUTCSeconds(dateMatch.slice(1).map(Number), 12);
    if (timestamp !== undefined) return timestamp;
  }
  const dayOffset =
    stableHash32(`${CUSTOMER_KEY}:schedule-anchor:${runId}`) %
    STABLE_ANCHOR_WINDOW_DAYS;
  return STABLE_ANCHOR_BASE_UNIX + dayOffset * 24 * 60 * 60;
}

export function sanitizeRunId(value) {
  const normalized = requiredText(value, "runId")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!normalized || normalized.length > 20) {
    throw new CliError("runId must be 1-20 safe characters");
  }
  return normalized;
}

export function normalizeLocalBackendURL(value) {
  return resolveManualAcceptanceTarget({
    backendURL: normalizeManualAcceptanceBackendURL(
      value || DEFAULT_BACKEND_URL,
    ),
  }).backendURL;
}

function stablePositiveSourceID(runId) {
  const hash = stableHash32(`${CUSTOMER_KEY}:${runId}`);
  return (hash % 2_000_000_000) + 1;
}

export function buildLegacyManualAcceptanceTaskBatchReference({
  runId,
  copyRevision,
  backendURL = DEFAULT_BACKEND_URL,
} = {}) {
  const normalizedRunID = sanitizeRunId(runId);
  const normalizedCopyRevision = copyRevision
    ? sanitizeRunId(copyRevision)
    : undefined;
  const identity = normalizedCopyRevision
    ? `${normalizedRunID}:${normalizedCopyRevision}`
    : normalizedRunID;
  return Object.freeze({
    runId: normalizedRunID,
    copyRevision: normalizedCopyRevision,
    backendURL: normalizeManualAcceptanceBackendURL(backendURL),
    sourceType: SOURCE_TYPE,
    sourceID: stablePositiveSourceID(identity),
    prefix: `${SIMULATION_PREFIX}-${normalizedRunID}${normalizedCopyRevision ? `-${normalizedCopyRevision}` : ""}`,
  });
}

export function manualAcceptanceTaskRetireConfirmation(
  keepPlan,
  legacyBatch,
) {
  const parts = [
    RETIRE_CONFIRM_PREFIX,
    keepPlan.target,
    legacyBatch.runId,
  ];
  if (legacyBatch.copyRevision) parts.push(legacyBatch.copyRevision);
  parts.push(keepPlan.runId, keepPlan.copyRevision);
  return parts.join(":");
}

function targetStatusAt(roleKey, index) {
  let consumed = 0;
  for (const [status, count] of Object.entries(
    getManualAcceptanceTaskStatusCounts(roleKey),
  )) {
    consumed += count;
    if (index <= consumed) return status;
  }
  throw new CliError(`task index ${index} exceeds role scale`);
}

function dueAtFor(index, nowSec) {
  const hour = 60 * 60;
  const day = 24 * hour;
  switch ((index - 1) % 4) {
    case 0:
      return { scenario: "overdue", value: nowSec - 2 * day };
    case 1:
      return { scenario: "due_soon", value: nowSec + 4 * hour };
    case 2:
      return { scenario: "this_week", value: nowSec + 2 * day };
    default:
      return { scenario: "later", value: nowSec + 7 * day };
  }
}

function actionFor(roleKey, targetStatus, runId, index, profile) {
  const supportsAction =
    targetStatus === "blocked" ||
    (targetStatus === "done" && roleKey !== "boss") ||
    (targetStatus === "rejected" && REJECT_ACTION_ROLES.has(roleKey));
  if (!supportsAction) return null;

  const reason =
    targetStatus === "blocked"
      ? profile.blockedReason
      : targetStatus === "rejected"
        ? profile.rejectedReason
        : "已处理，可以继续。";
  const actionKey = ACTION_KEY_BY_STATUS[targetStatus];
  return {
    method: ACTION_METHOD_BY_STATUS[targetStatus],
    actionKey,
    targetStatus,
    reason,
    idempotencyKey: `manual-acceptance:${runId}:${roleKey}:${pad(index)}:${actionKey}`,
    payload: targetStatus === "done" ? { feedback: reason } : {},
  };
}

function buildRoleTask({ roleKey, index, runId, prefix, sourceID, nowSec }) {
  const profile = ROLE_SCENARIOS[roleKey];
  const targetStatus = targetStatusAt(roleKey, index);
  const action = actionFor(roleKey, targetStatus, runId, index, profile);
  const due = dueAtFor(index, nowSec);
  const assignmentMode = index % 2 === 0 ? "role_account" : "owner_pool";
  const topic = profile.topics[(index - 1) % profile.topics.length];
  const taskCode = `${prefix}-${roleKey.toUpperCase()}-${pad(index)}`;
  const sourceNo = `样例-${profile.label}-${pad(index)}`;
  const taskGroup =
    roleKey === "pmc"
      ? "production_scheduling"
      : roleKey === "production"
        ? "production_exception"
        : `trial_${roleKey}_work`;
  const payload = {
    simulated_only: true,
    real_customer_data: false,
    trial_task: true,
    business_summary: profile.summary,
    attention_note:
      index % 5 === 0
        ? "内容较多，请逐项确认。"
        : "按提示处理即可。",
    expected_result:
      targetStatus === "blocked"
        ? "写明还缺什么，等条件齐了再处理。"
        : targetStatus === "rejected"
          ? "补齐后再提交。"
          : targetStatus === "done"
            ? "已完成，下一位可以继续处理。"
            : "确认无误后继续。",
    ...profile.context,
  };
  return {
    key: `${roleKey}-${pad(index)}`,
    roleKey,
    index,
    targetStatus,
    assignmentMode,
    dueScenario: due.scenario,
    action,
    createParams: {
      task_code: taskCode,
      task_group: taskGroup,
      task_name: `${topic}（${pad(index)}）`,
      source_type: SOURCE_TYPE,
      source_id: sourceID,
      source_no: sourceNo,
      business_status_key: profile.businessStatus,
      // create_task 只接受 ready；blocked/done/rejected 必须由正式动作产生。
      task_status_key: "ready",
      owner_role_key: roleKey,
      owner_pool_key: roleKey,
      required_capability_key: profile.requiredCapability,
      priority: index % 5 === 0 ? 3 : index % 3 === 0 ? 2 : 1,
      due_at: due.value,
      payload,
    },
  };
}

function summarizePlanTasks(tasks) {
  const byRole = Object.fromEntries(TASK_ROLES.map((roleKey) => [roleKey, 0]));
  const byStatus = Object.fromEntries(TASK_STATUS_KEYS.map((status) => [status, 0]));
  const dueScenarios = {};
  let assigned = 0;
  let actionCount = 0;
  for (const task of tasks) {
    byRole[task.roleKey] += 1;
    byStatus[task.targetStatus] += 1;
    dueScenarios[task.dueScenario] = (dueScenarios[task.dueScenario] || 0) + 1;
    if (task.assignmentMode === "role_account") assigned += 1;
    if (task.action) actionCount += 1;
  }
  return {
    total: tasks.length,
    byRole,
    byStatus,
    assigned,
    ownerPoolOnly: tasks.length - assigned,
    dueScenarios,
    actionCount,
  };
}

function businessCopyStrings(task) {
  const values = [
    task.createParams.task_name,
    task.createParams.source_no,
    task.action?.reason,
  ];
  const visit = (value) => {
    if (typeof value === "string") {
      values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(task.createParams.payload);
  visit(task.action?.payload);
  return values.filter(Boolean);
}

export function validateManualAcceptanceTaskPlan(plan) {
  if (!plan || plan.customerKey !== CUSTOMER_KEY) {
    throw new CliError("task plan customerKey must be yoyoosun");
  }
  resolveManualAcceptanceTarget(plan);
  if (
    plan.simulatedOnly !== true ||
    plan.realCustomerImport !== false ||
    plan.writesFacts !== false ||
    plan.directSQL !== false
  ) {
    throw new CliError("task plan must remain simulated-only and fact-free");
  }
  if (
    plan.sourceType !== SOURCE_TYPE ||
    !Number.isSafeInteger(plan.sourceID) ||
    plan.sourceID <= 0
  ) {
    throw new CliError("task plan source batch boundary is invalid");
  }
  if (
    sanitizeRunId(plan.runId) !== plan.runId ||
    plan.copyRevision !== TASK_COPY_REVISION ||
    plan.prefix !== `${SIMULATION_PREFIX}-${plan.runId}-${TASK_COPY_REVISION}`
  ) {
    throw new CliError("task plan run prefix is invalid");
  }
  if (!Array.isArray(plan.tasks) || plan.tasks.length !== TOTAL_TASKS) {
    throw new CliError(`task plan must contain exactly ${TOTAL_TASKS} tasks`);
  }
  const seenCodes = new Set();
  for (const roleKey of TASK_ROLES) {
    const roleTasks = plan.tasks.filter((task) => task.roleKey === roleKey);
    if (roleTasks.length !== TASKS_PER_ROLE) {
      throw new CliError(`${roleKey} must contain ${TASKS_PER_ROLE} tasks`);
    }
    const statusCounts = Object.fromEntries(
      TASK_STATUS_KEYS.map((status) => [status, 0]),
    );
    for (const task of roleTasks) {
      const params = task.createParams || {};
      if (seenCodes.has(params.task_code)) {
        throw new CliError(`duplicate task_code ${params.task_code}`);
      }
      seenCodes.add(params.task_code);
      statusCounts[task.targetStatus] += 1;
      if (
        params.owner_role_key !== roleKey ||
        params.owner_pool_key !== roleKey
      ) {
        throw new CliError(`${task.key} owner scope does not match its role`);
      }
      if (
        params.source_type !== SOURCE_TYPE ||
        params.source_id !== plan.sourceID
      ) {
        throw new CliError(
          `${task.key} source boundary does not match its batch`,
        );
      }
      if (
        params.config_revision !== undefined ||
        params.process_instance_id !== undefined ||
        params.process_node_instance_id !== undefined ||
        params.assignee_id !== undefined ||
        params.id !== undefined
      ) {
        throw new CliError(`${task.key} contains a guarded create field`);
      }
      if (
        params.task_code.length > 64 ||
        params.task_group.length > 32 ||
        params.task_name.length > 128
      ) {
        throw new CliError(
          `${task.key} exceeds the workflow task field length`,
        );
      }
      if (!Number.isSafeInteger(params.due_at) || params.due_at <= 0) {
        throw new CliError(
          `${task.key} due_at must be a positive Unix timestamp`,
        );
      }
      if (params.task_status_key !== "ready") {
        throw new CliError(`${task.key} create seed must start from ready`);
      }
      if (task.action) {
        if (
          !task.action.reason.trim() ||
          !task.action.idempotencyKey.trim() ||
          task.action.idempotencyKey.length > 128
        ) {
          throw new CliError(
            `${task.key} action must include reason and idempotency key`,
          );
        }
        if (
          task.action.method !== ACTION_METHOD_BY_STATUS[task.targetStatus] ||
          task.action.actionKey !== ACTION_KEY_BY_STATUS[task.targetStatus] ||
          task.action.targetStatus !== task.targetStatus
        ) {
          throw new CliError(
            `${task.key} action contract does not match target`,
          );
        }
        for (const key of Object.keys(task.action.payload || {})) {
          if (ACTION_PAYLOAD_SYSTEM_KEYS.has(key.trim())) {
            throw new CliError(
              `${task.key} action payload contains guarded system field ${key}`,
            );
          }
        }
      } else if (task.targetStatus !== "ready") {
        throw new CliError(
          `${task.key} terminal target must use a formal workflow action`,
        );
      }
      if (
        params.payload?.simulated_only !== true ||
        params.payload?.real_customer_data !== false ||
        params.payload?.trial_task !== true
      ) {
        throw new CliError(`${task.key} simulated-data marker is invalid`);
      }
      for (const text of businessCopyStrings(task)) {
        if (FORBIDDEN_BUSINESS_COPY.test(text)) {
          throw new CliError(
            `${task.key} contains developer-facing business copy`,
          );
        }
      }
      if (task.targetStatus === "rejected") {
        const reason = task.action?.reason || params.payload?.rejected_reason;
        if (!optionalText(reason)) {
          throw new CliError(`${task.key} rejected task must include a reason`);
        }
      }
    }
    for (const [status, expected] of Object.entries(
      getManualAcceptanceTaskStatusCounts(roleKey),
    )) {
      if (statusCounts[status] !== expected) {
        throw new CliError(
          `${roleKey} ${status} expected ${expected}, got ${statusCounts[status]}`,
        );
      }
    }
  }
  return plan;
}

export function buildManualAcceptanceTaskDataPlan(options = {}) {
  const runId = sanitizeRunId(options.runId || timestampRunId());
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: options.backendURL || DEFAULT_BACKEND_URL,
    target: options.target,
    dataVersion: options.dataVersion,
    runId,
  });
  const backendURL = targetPolicy.backendURL;
  const nowSec = runAnchorSeconds(runId, options.nowSec);
  const prefix = `${SIMULATION_PREFIX}-${runId}-${TASK_COPY_REVISION}`;
  const sourceID = stablePositiveSourceID(`${runId}:${TASK_COPY_REVISION}`);
  const tasks = TASK_ROLES.flatMap((roleKey) =>
    Array.from({ length: TASKS_PER_ROLE }, (_, offset) =>
      buildRoleTask({
        roleKey,
        index: offset + 1,
        runId,
        prefix,
        sourceID,
        nowSec,
      }),
    ),
  );
  const plan = {
    scope: "manual-acceptance-task-data",
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    writesFacts: false,
    directSQL: false,
    target: targetPolicy.target,
    datasetKey: targetPolicy.datasetKey,
    dataVersion: targetPolicy.dataVersion,
    backendURL,
    runId,
    copyRevision: TASK_COPY_REVISION,
    prefix,
    sourceType: SOURCE_TYPE,
    sourceID,
    generatedAtUnix: nowSec,
    roleUsers: Object.fromEntries(
      TASK_ROLES.map((roleKey) => [roleKey, ROLE_USERS[roleKey]]),
    ),
    summary: summarizePlanTasks(tasks),
    tasks,
  };
  return validateManualAcceptanceTaskPlan(plan);
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    help: false,
    out: DEFAULT_OUT_DIR,
    backendURL:
      process.env.MANUAL_ACCEPTANCE_TASK_BACKEND_URL || DEFAULT_BACKEND_URL,
    target: process.env.MANUAL_ACCEPTANCE_TASK_TARGET,
    dataVersion: process.env.MANUAL_ACCEPTANCE_TASK_DATA_VERSION,
    retireLegacyRunId: "",
    retireLegacyCopyRevision: "",
    runId:
      process.env.MANUAL_ACCEPTANCE_TASK_RUN_ID || timestampRunId(new Date()),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new CliError(`unexpected argument ${arg}`, 2);
    }
    const equalIndex = arg.indexOf("=");
    const key = arg.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : arg.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`missing value for --${key}`, 2);
    }
    switch (key) {
      case "backend-url":
        options.backendURL = value;
        break;
      case "target":
        options.target = value;
        break;
      case "data-version":
        options.dataVersion = value;
        break;
      case "run-id":
        options.runId = value;
        break;
      case "retire-legacy-run-id":
        options.retireLegacyRunId = sanitizeRunId(value);
        break;
      case "retire-legacy-copy-revision":
        options.retireLegacyCopyRevision = sanitizeRunId(value);
        break;
      case "out":
        options.out = requiredText(value, "--out");
        break;
      default:
        throw new CliError(`unknown option --${key}`, 2);
    }
  }
  options.runId = sanitizeRunId(options.runId);
  if (options.retireLegacyRunId && !options.apply) {
    throw new CliError("--retire-legacy-run-id requires --apply", 2);
  }
  if (options.retireLegacyCopyRevision && !options.retireLegacyRunId) {
    throw new CliError(
      "--retire-legacy-copy-revision requires --retire-legacy-run-id",
      2,
    );
  }
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: options.backendURL,
    target: options.target,
    dataVersion: options.dataVersion,
    runId: options.runId,
  });
  options.backendURL = targetPolicy.backendURL;
  options.target = targetPolicy.target;
  options.dataVersion = targetPolicy.dataVersion;
  return options;
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

async function rpcCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl = fetch,
}) {
  let response;
  try {
    response = await fetchImpl(rpcURL(backendURL, domain), {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `manual-acceptance-task-${domain}-${method}-${Date.now()}`,
        method,
        params:
          domain === "auth" || domain === "workflow"
            ? params
            : { customer_key: CUSTOMER_KEY, ...params },
      }),
    });
    if (response?.redirected === true) {
      throw new CliError(`${domain}.${method} refused a redirected response`);
    }
  } catch (error) {
    const cause = error?.cause?.message || error?.message || String(error);
    throw new CliError(`${domain}.${method} request failed: ${cause}`);
  }
  if (!response?.ok) {
    throw new CliError(
      `${domain}.${method} HTTP ${response?.status || "unknown"}`,
    );
  }
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

function permissionSet(profile) {
  return new Set(
    (Array.isArray(profile?.permissions) ? profile.permissions : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
}

function roleSet(profile) {
  return new Set(
    (Array.isArray(profile?.roles) ? profile.roles : [])
      .map((item) => String(item?.role_key || item?.key || "").trim())
      .filter(Boolean),
  );
}

function requiredRolePermissions(roleKey) {
  const permissions = new Set(["workflow.task.read", "workflow.task.update"]);
  if (roleKey !== "boss") permissions.add("workflow.task.complete");
  if (REJECT_ACTION_ROLES.has(roleKey)) permissions.add("workflow.task.reject");
  if (roleKey === "boss") permissions.add("workflow.task.approve");
  if (roleKey === "pmc") permissions.add("workflow.task.create");
  return permissions;
}

async function loginAccount({ backendURL, username, password, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  const token = optionalText(data.access_token || data.token);
  const id = Number(data.id || data.user_id);
  if (!token || !Number.isSafeInteger(id) || id <= 0) {
    throw new CliError(
      `${username}: login response missing token or account id`,
    );
  }
  if (data.disabled === true) {
    throw new CliError(`${username}: account is disabled`);
  }
  return { ...data, id, token };
}

async function loginAccounts({ backendURL, password, fetchImpl }) {
  const entries = [];
  for (const [roleKey, username] of Object.entries(ROLE_USERS)) {
    entries.push([
      roleKey,
      await loginAccount({ backendURL, username, password, fetchImpl }),
    ]);
  }
  const accounts = Object.fromEntries(entries);
  for (const roleKey of TASK_ROLES) {
    const profile = accounts[roleKey];
    if (!roleSet(profile).has(roleKey)) {
      throw new CliError(
        `${ROLE_USERS[roleKey]} is not assigned to ${roleKey}`,
      );
    }
    const permissions = permissionSet(profile);
    for (const requiredPermission of requiredRolePermissions(roleKey)) {
      if (!permissions.has(requiredPermission)) {
        throw new CliError(
          `${ROLE_USERS[roleKey]} is missing ${requiredPermission}`,
        );
      }
    }
  }
  return accounts;
}

async function loginRuntimeAdmin({ backendURL, password, fetchImpl }) {
  const profile = await loginAccount({
    backendURL,
    username: RUNTIME_ADMIN_USERNAME,
    password,
    fetchImpl,
  });
  if (profile.is_super_admin !== true) {
    throw new CliError(
      `${RUNTIME_ADMIN_USERNAME}: manual acceptance runtime guard requires a local super admin`,
    );
  }
  return profile;
}

async function assertSafeRuntime({
  plan,
  accounts,
  runtimeAdmin,
  targetAttestation,
  fetchImpl,
}) {
  const attested = targetAttestation
    ? assertManualAcceptanceTargetAttestation({
        policy: plan,
        attestation: targetAttestation,
      })
    : undefined;
  const capabilities = attested
    ? { environment: attested.environment, ...attested.debug }
    : await rpcCall({
        backendURL: plan.backendURL,
        domain: "debug",
        method: "capabilities",
        token: runtimeAdmin.token,
        fetchImpl,
      });
  assertManualAcceptanceCapabilitiesPolicy({ policy: plan, capabilities });
  const sessionData = await rpcCall({
    backendURL: plan.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: accounts.pmc.token,
    fetchImpl,
  });
  const session = sessionData.session || {};
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy: plan,
    capabilities,
    session,
    requiredModules: ["workflow_tasks"],
    customerKey: CUSTOMER_KEY,
  });
  return attested
    ? {
        ...runtime,
        targetAttestation: {
          source: "out-of-band",
          release: attested.release,
          migration: attested.migration,
        },
      }
    : runtime;
}

function requireTaskRecord(data, method) {
  const task = data?.task;
  if (!task || typeof task !== "object") {
    throw new CliError(`${method} response missing task`);
  }
  positiveSafeInteger(task.id, `${method} task.id`);
  positiveSafeInteger(task.version, `${method} task.version`);
  requiredText(task.task_code, `${method} task.task_code`);
  requiredText(task.task_status_key, `${method} task.task_status_key`);
  return task;
}

function hydratedCreateParams(plannedTask, accounts) {
  const params = {
    ...plannedTask.createParams,
    payload: { ...plannedTask.createParams.payload },
  };
  if (plannedTask.assignmentMode === "role_account") {
    params.assignee_id = accounts[plannedTask.roleKey].id;
  }
  return params;
}

function expectedBusinessStatusKey(task, plannedTask) {
  return plannedTask.action?.targetStatus === "blocked" &&
    task?.task_status_key === "blocked"
    ? "blocked"
    : plannedTask.createParams.business_status_key;
}

function assertTaskIdentity(task, plannedTask, accounts) {
  const expected = plannedTask.createParams;
  for (const key of [
    "task_code",
    "task_group",
    "task_name",
    "source_type",
    "source_id",
    "source_no",
    "owner_role_key",
    "owner_pool_key",
    "required_capability_key",
    "priority",
    "due_at",
  ]) {
    if (task?.[key] !== expected[key]) {
      throw new CliError(
        `${plannedTask.key} persisted ${key} does not match the plan`,
      );
    }
  }
  if (
    task?.business_status_key !== expectedBusinessStatusKey(task, plannedTask)
  ) {
    throw new CliError(
      `${plannedTask.key} persisted business_status_key does not match the expected action result`,
    );
  }
  for (const [key, value] of Object.entries(expected.payload || {})) {
    if (task?.payload?.[key] !== value) {
      throw new CliError(
        `${plannedTask.key} persisted payload.${key} does not match the plan`,
      );
    }
  }
  if (
    task?.payload?.simulated_only !== true ||
    task?.payload?.real_customer_data !== false
  ) {
    throw new CliError(`${plannedTask.key} lost its simulated-data marker`);
  }
  const expectedAssignee =
    plannedTask.assignmentMode === "role_account"
      ? accounts[plannedTask.roleKey].id
      : null;
  const actualAssignee = task.assignee_id ?? null;
  if (actualAssignee !== expectedAssignee) {
    throw new CliError(`${plannedTask.key} assignee does not match the plan`);
  }
}

function taskReason(task, status) {
  if (status === "blocked") {
    return optionalText(task.blocked_reason || task.payload?.blocked_reason);
  }
  if (status === "rejected") {
    return optionalText(task.rejected_reason || task.payload?.rejected_reason);
  }
  if (status === "done") {
    return optionalText(
      task.payload?.feedback || task.payload?.completion_summary,
    );
  }
  return optionalText(task.payload?.business_summary);
}

function assertFinalTask(task, plannedTask, accounts) {
  assertTaskIdentity(task, plannedTask, accounts);
  if (task.task_status_key !== plannedTask.targetStatus) {
    throw new CliError(
      `${plannedTask.key} expected ${plannedTask.targetStatus}, got ${task.task_status_key}`,
    );
  }
  if (!taskReason(task, plannedTask.targetStatus)) {
    throw new CliError(
      `${plannedTask.key} final ${plannedTask.targetStatus} state is missing readable context`,
    );
  }
}

async function listRoleBatch({ plan, roleKey, account, fetchImpl }) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: "list_tasks",
    params: {
      owner_role_key: roleKey,
      source_type: plan.sourceType,
      source_id: plan.sourceID,
      limit: 200,
      offset: 0,
    },
    token: account.token,
    fetchImpl,
  });
  if (!Array.isArray(data.tasks) || !Number.isSafeInteger(data.total)) {
    throw new CliError(`${roleKey} list_tasks response is malformed`);
  }
  if (data.total !== data.tasks.length) {
    throw new CliError(
      `${roleKey} batch list is incomplete: total=${data.total} returned=${data.tasks.length}`,
    );
  }
  return data.tasks;
}

async function preflightExistingBatch({ plan, accounts, fetchImpl }) {
  const plannedByCode = new Map(
    plan.tasks.map((task) => [task.createParams.task_code, task]),
  );
  const existingByCode = new Map();
  for (const roleKey of TASK_ROLES) {
    const items = await listRoleBatch({
      plan,
      roleKey,
      account: accounts[roleKey],
      fetchImpl,
    });
    for (const item of items) {
      const code = requiredText(
        item?.task_code,
        `${roleKey} existing task code`,
      );
      const plannedTask = plannedByCode.get(code);
      if (!plannedTask || plannedTask.roleKey !== roleKey) {
        throw new CliError(
          `${roleKey} batch source collision contains unexpected task ${code}`,
        );
      }
      if (existingByCode.has(code)) {
        throw new CliError(`batch contains duplicate persisted task ${code}`);
      }
      positiveSafeInteger(item.id, `${code} id`);
      positiveSafeInteger(item.version, `${code} version`);
      assertTaskIdentity(item, plannedTask, accounts);
      const allowedStatuses = plannedTask.action
        ? new Set([
            plannedTask.createParams.task_status_key,
            plannedTask.targetStatus,
          ])
        : new Set([plannedTask.targetStatus]);
      if (!allowedStatuses.has(item.task_status_key)) {
        throw new CliError(
          `${plannedTask.key} cannot safely resume from ${item.task_status_key}`,
        );
      }
      if (item.task_status_key === plannedTask.targetStatus) {
        assertFinalTask(item, plannedTask, accounts);
      }
      existingByCode.set(code, item);
    }
  }
  return existingByCode;
}

async function createPlannedTask({ plan, plannedTask, accounts, fetchImpl }) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: "create_task",
    params: hydratedCreateParams(plannedTask, accounts),
    token: accounts.pmc.token,
    fetchImpl,
  });
  const created = requireTaskRecord(data, "create_task");
  assertTaskIdentity(created, plannedTask, accounts);
  if (created.task_status_key !== plannedTask.createParams.task_status_key) {
    throw new CliError(
      `${plannedTask.key} create expected ${plannedTask.createParams.task_status_key}, got ${created.task_status_key}`,
    );
  }
  return created;
}

async function applyPlannedAction({
  plan,
  plannedTask,
  task,
  accounts,
  fetchImpl,
}) {
  const action = plannedTask.action;
  if (!action) return task;
  const currentVersion = positiveSafeInteger(
    task.version,
    `${plannedTask.key} expected version`,
  );
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: action.method,
    params: {
      task_id: positiveSafeInteger(task.id, `${plannedTask.key} task id`),
      expected_version: currentVersion,
      idempotency_key: action.idempotencyKey,
      action_key: action.actionKey,
      reason: action.reason,
      payload: { ...action.payload },
    },
    token: accounts[plannedTask.roleKey].token,
    fetchImpl,
  });
  const updated = requireTaskRecord(data, action.method);
  if (updated.id !== task.id) {
    throw new CliError(`${plannedTask.key} action returned another task`);
  }
  if (updated.version <= currentVersion) {
    throw new CliError(
      `${plannedTask.key} action did not advance task version`,
    );
  }
  assertFinalTask(updated, plannedTask, accounts);
  return updated;
}

async function verifyFinalBatch({ plan, accounts, fetchImpl }) {
  const finalTasks = [];
  const plannedByCode = new Map(
    plan.tasks.map((task) => [task.createParams.task_code, task]),
  );
  for (const roleKey of TASK_ROLES) {
    const items = await listRoleBatch({
      plan,
      roleKey,
      account: accounts[roleKey],
      fetchImpl,
    });
    if (items.length !== TASKS_PER_ROLE) {
      throw new CliError(
        `${roleKey} final batch expected ${TASKS_PER_ROLE}, got ${items.length}`,
      );
    }
    for (const item of items) {
      const plannedTask = plannedByCode.get(item.task_code);
      if (!plannedTask) {
        throw new CliError(
          `${roleKey} final batch contains an unexpected task`,
        );
      }
      assertFinalTask(item, plannedTask, accounts);
      finalTasks.push(item);
    }
  }
  if (finalTasks.length !== TOTAL_TASKS) {
    throw new CliError(
      `final batch expected ${TOTAL_TASKS}, got ${finalTasks.length}`,
    );
  }
  return finalTasks;
}

export async function applyManualAcceptanceTaskData(
  plan,
  {
    password,
    adminPassword,
    confirmPhrase = process.env.MANUAL_ACCEPTANCE_TASK_CONFIRM,
    targetConfirmation = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation = process.env
      .MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
  } = {},
) {
  validateManualAcceptanceTaskPlan(plan);
  assertManualAcceptanceMutationTarget(plan, {
    confirmation: targetConfirmation,
  });
  const parsedTargetAttestation = parseManualAcceptanceTargetAttestation(
    targetAttestation,
  );
  assertManualAcceptanceTaskTargetCompatibility(
    plan,
    parsedTargetAttestation,
  );
  if (confirmPhrase !== CONFIRM_PHRASE) {
    throw new CliError(
      `apply requires MANUAL_ACCEPTANCE_TASK_CONFIRM=${CONFIRM_PHRASE}`,
      2,
    );
  }
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  const effectiveAdminPassword = parsedTargetAttestation
    ? undefined
    : requiredText(
        adminPassword ?? process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
        "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
      );
  const runtimeAdmin = parsedTargetAttestation
    ? undefined
    : await loginRuntimeAdmin({
        backendURL: plan.backendURL,
        password: effectiveAdminPassword,
        fetchImpl,
      });
  const accounts = await loginAccounts({
    backendURL: plan.backendURL,
    password: effectivePassword,
    fetchImpl,
  });
  const runtime = await assertSafeRuntime({
    plan,
    accounts,
    runtimeAdmin,
    targetAttestation: parsedTargetAttestation,
    fetchImpl,
  });
  const existingByCode = await preflightExistingBatch({
    plan,
    accounts,
    fetchImpl,
  });
  const steps = [];
  let createdCount = 0;
  let resumedCount = 0;
  let reusedFinalCount = 0;
  let actionCount = 0;

  for (const plannedTask of plan.tasks) {
    const code = plannedTask.createParams.task_code;
    let task = existingByCode.get(code);
    if (!task) {
      task = await createPlannedTask({
        plan,
        plannedTask,
        accounts,
        fetchImpl,
      });
      createdCount += 1;
      steps.push({ key: plannedTask.key, operation: "create" });
    } else if (task.task_status_key === plannedTask.targetStatus) {
      reusedFinalCount += 1;
      steps.push({ key: plannedTask.key, operation: "reuse-final" });
      continue;
    } else {
      resumedCount += 1;
      steps.push({ key: plannedTask.key, operation: "resume" });
    }

    if (plannedTask.action) {
      task = await applyPlannedAction({
        plan,
        plannedTask,
        task,
        accounts,
        fetchImpl,
      });
      actionCount += 1;
      steps.push({
        key: plannedTask.key,
        operation: plannedTask.action.actionKey,
      });
    } else {
      assertFinalTask(task, plannedTask, accounts);
    }
  }

  const finalTasks = await verifyFinalBatch({ plan, accounts, fetchImpl });
  return {
    mode: "apply",
    generatedAt: new Date().toISOString(),
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    writesFacts: false,
    directSQL: false,
    runId: plan.runId,
    copyRevision: plan.copyRevision,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    target: plan.target,
    prefix: plan.prefix,
    sourceType: plan.sourceType,
    sourceID: plan.sourceID,
    backendURL: plan.backendURL,
    runtime,
    summary: {
      ...plan.summary,
      persisted: finalTasks.length,
      created: createdCount,
      resumed: resumedCount,
      reusedFinal: reusedFinalCount,
      actionsApplied: actionCount,
    },
    steps,
  };
}

function assertLegacyTaskBatchRecord(task, legacyBatch, roleKey, accounts) {
  positiveSafeInteger(task?.id, `${roleKey} legacy task.id`);
  positiveSafeInteger(task?.version, `${roleKey} legacy task.version`);
  const code = requiredText(task?.task_code, `${roleKey} legacy task.task_code`);
  if (
    !code.startsWith(`${legacyBatch.prefix}-${roleKey.toUpperCase()}-`) ||
    task.source_type !== legacyBatch.sourceType ||
    Number(task.source_id) !== legacyBatch.sourceID ||
    task.owner_role_key !== roleKey ||
    task.owner_pool_key !== roleKey
  ) {
    throw new CliError(`${code} is outside the exact legacy task batch`, 2);
  }
  if (
    task.payload?.simulated_only !== true ||
    task.payload?.real_customer_data !== false ||
    task.payload?.trial_task !== true
  ) {
    throw new CliError(`${code} is not a simulated manual-acceptance task`, 2);
  }
  const assigneeID = task.assignee_id ?? null;
  if (assigneeID !== null && assigneeID !== accounts[roleKey].id) {
    throw new CliError(`${code} is assigned outside the legacy role account`, 2);
  }
  if (!TASK_STATUS_KEYS.includes(task.task_status_key)) {
    throw new CliError(`${code} has unknown task status`, 2);
  }
  return task;
}

async function listLegacyTaskBatch({
  legacyBatch,
  accounts,
  fetchImpl,
}) {
  const tasks = [];
  for (const roleKey of TASK_ROLES) {
    const roleTasks = await listRoleBatch({
      plan: legacyBatch,
      roleKey,
      account: accounts[roleKey],
      fetchImpl,
    });
    if (roleTasks.length !== TASKS_PER_ROLE) {
      throw new CliError(
        `${roleKey} legacy batch expected ${TASKS_PER_ROLE}, got ${roleTasks.length}`,
        2,
      );
    }
    const expectedCodes = new Set(
      Array.from(
        { length: TASKS_PER_ROLE },
        (_, offset) =>
          `${legacyBatch.prefix}-${roleKey.toUpperCase()}-${pad(offset + 1)}`,
      ),
    );
    for (const task of roleTasks) {
      assertLegacyTaskBatchRecord(task, legacyBatch, roleKey, accounts);
      if (!expectedCodes.delete(task.task_code)) {
        throw new CliError(
          `${roleKey} legacy batch contains a duplicate or unexpected task`,
          2,
        );
      }
      tasks.push({ ...task, retireRoleKey: roleKey });
    }
    if (expectedCodes.size > 0) {
      throw new CliError(`${roleKey} legacy batch is incomplete`, 2);
    }
  }
  return tasks.sort((left, right) =>
    String(left.task_code).localeCompare(String(right.task_code), "en"),
  );
}

async function applyLegacyTaskRetireAction({
  keepPlan,
  legacyBatch,
  task,
  roleKey,
  method,
  actionKey,
  targetStatus,
  reason,
  accounts,
  fetchImpl,
}) {
  const currentVersion = positiveSafeInteger(
    task.version,
    `${task.task_code} expected version`,
  );
  const data = await rpcCall({
    backendURL: keepPlan.backendURL,
    domain: "workflow",
    method,
    params: {
      task_id: positiveSafeInteger(task.id, `${task.task_code} task id`),
      expected_version: currentVersion,
      idempotency_key: [
        "manual-acceptance-task-retire",
        legacyBatch.runId,
        task.task_code,
        actionKey,
      ].join(":"),
      action_key: actionKey,
      reason,
      payload: targetStatus === "done" ? { feedback: reason } : {},
    },
    token: accounts[roleKey].token,
    fetchImpl,
  });
  const updated = requireTaskRecord(data, method);
  if (
    updated.id !== task.id ||
    updated.version <= currentVersion ||
    updated.task_status_key !== targetStatus
  ) {
    throw new CliError(`${task.task_code} did not reach ${targetStatus}`);
  }
  assertLegacyTaskBatchRecord(updated, legacyBatch, roleKey, accounts);
  return updated;
}

export async function retireLegacyManualAcceptanceTaskBatch(
  keepPlan,
  {
    retireRunId,
    retireCopyRevision,
    password,
    adminPassword,
    confirmPhrase = process.env.MANUAL_ACCEPTANCE_TASK_RETIRE_CONFIRM,
    targetConfirmation = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation = process.env
      .MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
  } = {},
) {
  validateManualAcceptanceTaskPlan(keepPlan);
  const legacyBatch = buildLegacyManualAcceptanceTaskBatchReference({
    runId: retireRunId,
    copyRevision: retireCopyRevision,
    backendURL: keepPlan.backendURL,
  });
  if (
    legacyBatch.sourceID === keepPlan.sourceID ||
    legacyBatch.prefix === keepPlan.prefix
  ) {
    throw new CliError("legacy task batch must differ from the keep batch", 2);
  }
  assertManualAcceptanceMutationTarget(keepPlan, {
    confirmation: targetConfirmation,
  });
  const parsedTargetAttestation = parseManualAcceptanceTargetAttestation(
    targetAttestation,
  );
  assertManualAcceptanceTaskTargetCompatibility(
    keepPlan,
    parsedTargetAttestation,
  );
  const expectedConfirmation = manualAcceptanceTaskRetireConfirmation(
    keepPlan,
    legacyBatch,
  );
  if (confirmPhrase !== expectedConfirmation) {
    throw new CliError(
      `retire requires MANUAL_ACCEPTANCE_TASK_RETIRE_CONFIRM=${expectedConfirmation}`,
      2,
    );
  }
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  const effectiveAdminPassword = parsedTargetAttestation
    ? undefined
    : requiredText(
        adminPassword ?? process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
        "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
      );
  const runtimeAdmin = parsedTargetAttestation
    ? undefined
    : await loginRuntimeAdmin({
        backendURL: keepPlan.backendURL,
        password: effectiveAdminPassword,
        fetchImpl,
      });
  const accounts = await loginAccounts({
    backendURL: keepPlan.backendURL,
    password: effectivePassword,
    fetchImpl,
  });
  const runtime = await assertSafeRuntime({
    plan: keepPlan,
    accounts,
    runtimeAdmin,
    targetAttestation: parsedTargetAttestation,
    fetchImpl,
  });
  const keepTasks = await verifyFinalBatch({
    plan: keepPlan,
    accounts,
    fetchImpl,
  });
  if (keepTasks.length !== TOTAL_TASKS) {
    throw new CliError("keep task batch is not complete", 2);
  }
  const before = await listLegacyTaskBatch({
    legacyBatch,
    accounts,
    fetchImpl,
  });
  const reason = "旧样例已换新版。";
  const steps = [];
  let actionsApplied = 0;
  let resumed = 0;
  let terminalized = 0;
  let alreadyTerminal = 0;
  for (const original of before) {
    const roleKey = original.retireRoleKey;
    let task = original;
    if (new Set(["done", "rejected"]).has(task.task_status_key)) {
      alreadyTerminal += 1;
      steps.push({ taskCode: task.task_code, operation: "reuse-terminal" });
      continue;
    }
    if (task.task_status_key === "blocked") {
      task = await applyLegacyTaskRetireAction({
        keepPlan,
        legacyBatch,
        task,
        roleKey,
        method: "resume_task_action",
        actionKey: "resume",
        targetStatus: "ready",
        reason,
        accounts,
        fetchImpl,
      });
      resumed += 1;
      actionsApplied += 1;
      steps.push({ taskCode: task.task_code, operation: "resume" });
    }
    const reject = REJECT_ACTION_ROLES.has(roleKey);
    task = await applyLegacyTaskRetireAction({
      keepPlan,
      legacyBatch,
      task,
      roleKey,
      method: reject ? "reject_task_action" : "complete_task_action",
      actionKey: reject ? "reject" : "complete",
      targetStatus: reject ? "rejected" : "done",
      reason,
      accounts,
      fetchImpl,
    });
    terminalized += 1;
    actionsApplied += 1;
    steps.push({ taskCode: task.task_code, operation: reject ? "reject" : "complete" });
  }
  const after = await listLegacyTaskBatch({
    legacyBatch,
    accounts,
    fetchImpl,
  });
  if (
    after.some(
      (task) => !new Set(["done", "rejected"]).has(task.task_status_key),
    )
  ) {
    throw new CliError("legacy task batch still contains active tasks");
  }
  return {
    mode: "retire",
    generatedAt: new Date().toISOString(),
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    writesFacts: false,
    directSQL: false,
    target: keepPlan.target,
    datasetKey: keepPlan.datasetKey,
    dataVersion: keepPlan.dataVersion,
    runId: keepPlan.runId,
    backendURL: keepPlan.backendURL,
    runtime,
    keepBatch: {
      runId: keepPlan.runId,
      copyRevision: keepPlan.copyRevision,
      prefix: keepPlan.prefix,
      sourceType: keepPlan.sourceType,
      sourceID: keepPlan.sourceID,
      total: keepTasks.length,
    },
    retiredBatch: legacyBatch,
    cleanup: {
      mode: "workflow-lifecycle",
      physicalDelete: false,
      rollback:
        "终态任务不重新打开；需要恢复验收时，重复应用保留批次或创建新的替代批次。",
    },
    summary: {
      total: after.length,
      activeBefore: before.filter(
        (task) => !new Set(["done", "rejected"]).has(task.task_status_key),
      ).length,
      alreadyTerminal,
      resumed,
      terminalized,
      actionsApplied,
      finalDone: after.filter((task) => task.task_status_key === "done").length,
      finalRejected: after.filter(
        (task) => task.task_status_key === "rejected",
      ).length,
    },
    steps,
  };
}

async function writeTaskReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const reportPath = path.join(
    outDir,
    report.mode === "retire" ? "retire-report.json" : "apply-report.json",
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const plan = buildManualAcceptanceTaskDataPlan(options);
  if (!options.apply) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const report = options.retireLegacyRunId
    ? await retireLegacyManualAcceptanceTaskBatch(plan, {
        retireRunId: options.retireLegacyRunId,
        retireCopyRevision: options.retireLegacyCopyRevision,
      })
    : await applyManualAcceptanceTaskData(plan);
  const reportPath = await writeTaskReport(options.out, report);
  process.stdout.write(
    `[qa:manual-acceptance-task-data] ${report.mode} complete json=${reportPath}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[qa:manual-acceptance-task-data][fatal] ${error?.stack || error?.message || error}\n`,
    );
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  });
}
