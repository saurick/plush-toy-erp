#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/task-data";
const CUSTOMER_KEY = "yoyoosun";
const RUNTIME_ADMIN_USERNAME = "admin";
const SOURCE_TYPE = "simulated-manual-acceptance-task-batch";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT-TASK";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_ENVIRONMENTS = new Set(["local", "dev"]);
const STABLE_ANCHOR_BASE_UNIX = Date.UTC(2024, 0, 1, 12, 0, 0) / 1000;
const STABLE_ANCHOR_WINDOW_DAYS = 10 * 366;

export const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS";
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
      "确认重点订单交期",
      "复核大额订单报价",
      "查看本周经营风险",
      "确认客户特殊要求",
      "协调跨部门优先事项",
    ]),
    summary: "请结合客户交期、成本和当前产能给出明确意见。",
    blockedReason: "客户交期与价格确认尚未齐全，暂不能作出决定。",
    rejectedReason: "交期承诺缺少产能依据，请补充后再提交。",
    context: Object.freeze({
      customer_name: "【试用】华南礼赠客户",
      style_no: "圆耳抱枕熊",
      product_name: "圆耳抱枕熊",
      quantity: "3600",
      unit: "只",
    }),
  }),
  sales: Object.freeze({
    label: "业务",
    businessStatus: "project_pending",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "补齐客户确认资料",
      "确认订单颜色要求",
      "跟进包装方式确认",
      "核对交货地址信息",
      "回复客户交期询问",
    ]),
    summary: "请把客户确认内容记录完整，并同步下一位经办人。",
    blockedReason: "客户尚未确认颜色和包装方式，当前无法继续。",
    rejectedReason: "客户确认记录不完整，请补齐联系人意见后重新提交。",
    context: Object.freeze({
      customer_name: "【试用】文创礼品客户",
      style_no: "星星挂件兔",
      product_name: "星星挂件兔",
      quantity: "2400",
      unit: "只",
    }),
  }),
  purchase: Object.freeze({
    label: "采购",
    businessStatus: "material_preparing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "核对主料到货安排",
      "确认辅料采购交期",
      "跟进供应商回签",
      "核对采购数量差异",
      "确认加急物料进度",
    ]),
    summary: "请确认供应商回复、预计到货日期和数量差异。",
    blockedReason: "供应商交期尚未书面确认，暂不能承诺到货日期。",
    rejectedReason: "采购数量与订单需求不一致，请重新核对。",
    context: Object.freeze({
      material_name: "【试用】短毛绒面料",
      spec: "米白色 10 毫米毛高",
      supplier_name: "【试用】东莞绒料供应商",
      quantity: "680",
      unit: "米",
    }),
  }),
  production: Object.freeze({
    label: "生产经理",
    businessStatus: "production_processing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "确认今日车缝排产",
      "调整充棉工序安排",
      "跟进首件确认结果",
      "协调返工批次计划",
      "确认班组交接事项",
    ]),
    summary: "请根据物料齐套和班组产能更新当天安排。",
    blockedReason: "关键物料未齐，当前批次暂不能排产。",
    rejectedReason: "排产数量超出当日产能，请调整后重新提交。",
    context: Object.freeze({
      customer_name: "【试用】乐园礼品客户",
      style_no: "彩虹抱枕",
      product_name: "彩虹抱枕",
      quantity: "1800",
      unit: "只",
    }),
  }),
  warehouse: Object.freeze({
    label: "仓库",
    businessStatus: "warehouse_processing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "核对成品库位与数量",
      "确认待发货备货情况",
      "复核来料暂存位置",
      "检查批次标签信息",
      "确认出库交接数量",
    ]),
    summary: "请按实物、标签和单据逐项核对后记录结果。",
    blockedReason: "库位与实物数量核对不一致，需要重新盘点。",
    rejectedReason: "批次标签与实物不一致，请更正后重新交接。",
    context: Object.freeze({
      customer_name: "【试用】商超礼赠客户",
      style_no: "趴趴熊公仔",
      product_name: "趴趴熊公仔",
      quantity: "960",
      unit: "箱",
    }),
  }),
  finance: Object.freeze({
    label: "财务",
    businessStatus: "reconciling",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "核对应收到账安排",
      "复核供应商对账差异",
      "确认开票资料完整性",
      "跟进逾期款项说明",
      "核对本周付款计划",
    ]),
    summary: "请核对金额、往来单位和约定日期，并记录差异说明。",
    blockedReason: "回款信息与银行流水尚未核对，暂不能确认。",
    rejectedReason: "对账金额与业务单据不一致，请查明差异后重提。",
    context: Object.freeze({
      customer_name: "【试用】品牌联名客户",
      style_no: "联名纪念熊",
      product_name: "联名纪念熊",
      amount: "128600.00",
      quantity: "1200",
      unit: "只",
    }),
  }),
  pmc: Object.freeze({
    label: "PMC",
    businessStatus: "material_preparing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "跟进物料齐套计划",
      "协调订单优先顺序",
      "确认本周交付风险",
      "核对生产准备进度",
      "催办跨部门待办事项",
    ]),
    summary: "请汇总物料、产能和交期信息，明确下一步负责人。",
    blockedReason: "主料到货日期存在冲突，需要采购和生产共同确认。",
    rejectedReason: "齐套判断缺少关键物料信息，请补齐后重新提交。",
    context: Object.freeze({
      customer_name: "【试用】节庆礼品客户",
      style_no: "节庆围巾熊",
      product_name: "节庆围巾熊",
      quantity: "4200",
      unit: "只",
    }),
  }),
  quality: Object.freeze({
    label: "品质",
    businessStatus: "qc_pending",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "复核来料抽检记录",
      "确认首件检验结果",
      "跟进返工复检安排",
      "核对出货检验项目",
      "记录外观问题分布",
    ]),
    summary: "请按检验要求记录抽样数量、发现问题和处理意见。",
    blockedReason: "抽检样品与检验标准未齐，暂不能完成判定。",
    rejectedReason: "检验记录缺少抽样依据，请补充后重新提交。",
    context: Object.freeze({
      material_name: "【试用】环保填充棉",
      spec: "A 级弹性填充",
      supplier_name: "【试用】填充材料供应商",
      quantity: "320",
      unit: "千克",
    }),
  }),
  engineering: Object.freeze({
    label: "工程",
    businessStatus: "engineering_preparing",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "完善物料清单说明",
      "核对款图尺寸要求",
      "补充车缝工艺要点",
      "确认包装资料版本",
      "整理首件制作要求",
    ]),
    summary: "请确认当前资料可供采购和生产直接使用。",
    blockedReason: "款图与尺寸表版本尚未确认，资料暂不能下发。",
    rejectedReason: "工艺说明与样品做法不一致，请更正后重新提交。",
    context: Object.freeze({
      customer_name: "【试用】博物馆文创客户",
      style_no: "文创生肖公仔",
      product_name: "文创生肖公仔",
      quantity: "1500",
      unit: "只",
    }),
  }),
});

const USAGE = `Manual acceptance task data

Usage:
  node scripts/qa/manual-acceptance-task-data.mjs [--run-id <text>] \\
    [--backend-url <loopback-url>] [--out <directory>] [--apply]

Apply to the loopback local/dev runtime only:
  MANUAL_ACCEPTANCE_TASK_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-task-data.mjs --apply \\
      --backend-url http://127.0.0.1:8300 \\
      --run-id LOCAL-UAT-20260711 \\
      --out output/qa/manual-acceptance/task-data

Default mode only prints the deterministic 180-task plan. Apply uses the formal
workflow JSON-RPC create/action contracts, never writes facts, and never connects
to SQL directly. A date-bearing run id uses that UTC date as its schedule anchor;
other run ids use a stable hash anchor and remain reproducible. Apply writes
<out>/apply-report.json with runId, prefix, sourceType, and sourceID batch fields.
The independent local super admin is used only for debug.capabilities; task reads,
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
  const url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain credentials", 2);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new CliError("backend URL must use http or https", 2);
  }
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new CliError(
      `refuse external backend ${url.origin}; manual acceptance task writes are local-only`,
      2,
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

function stablePositiveSourceID(runId) {
  const hash = stableHash32(`${CUSTOMER_KEY}:${runId}`);
  return (hash % 2_000_000_000) + 1;
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
        : `已按${profile.label}任务说明完成核对并记录结果。`;
  const actionKey = ACTION_KEY_BY_STATUS[targetStatus];
  return {
    method: ACTION_METHOD_BY_STATUS[targetStatus],
    actionKey,
    targetStatus,
    reason,
    idempotencyKey: `manual-acceptance:${runId}:${roleKey}:${pad(index)}:${actionKey}`,
    payload: {
      handling_note: reason,
      evidence_summary: "已记录经办说明，供试用人员查看。",
      result_label:
        targetStatus === "blocked"
          ? "暂时卡住"
          : targetStatus === "rejected"
            ? "退回补充"
            : "已完成",
    },
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
  const sourceNo = `试用任务单-${profile.label}-${pad(index)}`;
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
        ? "本项内容较多，请逐项核对后再提交处理结果。"
        : "请按页面提示完成本岗位处理。",
    expected_result:
      targetStatus === "blocked"
        ? "记录当前卡点并等待相关岗位补齐条件。"
        : targetStatus === "rejected"
          ? "退回补充后再重新确认。"
          : targetStatus === "done"
            ? "保留已完成记录，后续岗位可继续查看。"
            : "信息确认无误后继续推进。",
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
      task_name: `【试用】${profile.label}：${topic}（${pad(index)}）`,
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
  normalizeLocalBackendURL(plan.backendURL);
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
    plan.prefix !== `${SIMULATION_PREFIX}-${plan.runId}`
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
  const backendURL = normalizeLocalBackendURL(
    options.backendURL || DEFAULT_BACKEND_URL,
  );
  const nowSec = runAnchorSeconds(runId, options.nowSec);
  const prefix = `${SIMULATION_PREFIX}-${runId}`;
  const sourceID = stablePositiveSourceID(runId);
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
    backendURL,
    runId,
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
      case "run-id":
        options.runId = value;
        break;
      case "out":
        options.out = requiredText(value, "--out");
        break;
      default:
        throw new CliError(`unknown option --${key}`, 2);
    }
  }
  options.backendURL = normalizeLocalBackendURL(options.backendURL);
  options.runId = sanitizeRunId(options.runId);
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

async function assertSafeRuntime({ plan, accounts, runtimeAdmin, fetchImpl }) {
  const capabilities = await rpcCall({
    backendURL: plan.backendURL,
    domain: "debug",
    method: "capabilities",
    token: runtimeAdmin.token,
    fetchImpl,
  });
  if (!SAFE_ENVIRONMENTS.has(capabilities.environment)) {
    throw new CliError(
      `refuse manual acceptance task writes in environment=${capabilities.environment || "unknown"}`,
    );
  }
  const sessionData = await rpcCall({
    backendURL: plan.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: accounts.pmc.token,
    fetchImpl,
  });
  const session = sessionData.session || {};
  const configRevision = optionalText(
    session.configRevision || session.config_revision,
  );
  if (
    session?.customer?.key !== CUSTOMER_KEY ||
    session.source !== "active_customer_config_revision" ||
    !configRevision
  ) {
    throw new CliError(
      "refuse task writes: yoyoosun active customer configuration is not the current runtime source",
    );
  }
  if (session?.modules?.workflow_tasks !== "enabled") {
    throw new CliError(
      "refuse task writes: required module workflow_tasks is not enabled",
    );
  }
  return {
    environment: capabilities.environment,
    customerKey: session.customer.key,
    configRevision,
    source: session.source,
    requiredModules: ["workflow_tasks"],
  };
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
      task.payload?.handling_note || task.payload?.completion_summary,
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
    fetchImpl = fetch,
  } = {},
) {
  validateManualAcceptanceTaskPlan(plan);
  normalizeLocalBackendURL(plan.backendURL);
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
  const effectiveAdminPassword = requiredText(
    adminPassword ?? process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  const runtimeAdmin = await loginRuntimeAdmin({
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

async function writeApplyReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, "apply-report.json");
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
  const report = await applyManualAcceptanceTaskData(plan);
  const reportPath = await writeApplyReport(options.out, report);
  process.stdout.write(
    `[qa:manual-acceptance-task-data] apply complete json=${reportPath}\n`,
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
