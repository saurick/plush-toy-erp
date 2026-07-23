#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS } from "./manual-acceptance-catalog.mjs";

import {
  CUSTOMER_TRIAL_133_TARGET,
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
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
export const TASK_SOURCE_TYPE = "simulated-manual-acceptance-task-batch";
export const TASK_SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT-TASK";
const SOURCE_TYPE = TASK_SOURCE_TYPE;
const SIMULATION_PREFIX = TASK_SIMULATION_PREFIX;
export const TASK_COPY_REVISION = "PLAIN5";
export const TASK_VISIBLE_CODE_PREFIX_BY_ROLE = Object.freeze({
  boss: "YS-V5-LD",
  sales: "YS-V5-XS",
  purchase: "YS-V5-CG",
  production: "YS-V5-SC",
  warehouse: "YS-V5-CK",
  finance: "YS-V5-CW",
  pmc: "YS-V5-JH",
  quality: "YS-V5-ZJ",
  engineering: "YS-V5-GC",
});
const STABLE_ANCHOR_BASE_UNIX = Date.UTC(2024, 0, 1, 12, 0, 0) / 1000;
const STABLE_ANCHOR_WINDOW_DAYS = 10 * 366;
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const TASK_SCHEDULE_POLICY = Object.freeze({
  contract: "manual-acceptance-task-schedule-policy-v1",
  anchorSource: "fresh-dataset-apply-reused-on-resume",
  overdueOffsetSeconds: -2 * DAY_SECONDS,
  dueSoonOffsetSeconds: 23 * HOUR_SECONDS,
  thisWeekOffsetSeconds: 2 * DAY_SECONDS,
  laterOffsetSeconds: 7 * DAY_SECONDS,
  dueSoonWindowSeconds: DAY_SECONDS,
});

export const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS";
export const RETIRE_CONFIRM_PREFIX =
  "RETIRE_LEGACY_SIMULATED_MANUAL_ACCEPTANCE_TASKS";
export const WORKFLOW_TASK_CAS_MIGRATION = "20260711063237";
// Historical review anchor only. Remote writes are gated by the forward
// migration floor plus live runtime/readback checks, so later immutable
// releases are not incorrectly rejected.
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
const SINGLE_TASK_GROUP_BY_ROLE = Object.freeze({
  boss: "trial_boss_work",
  sales: "trial_sales_work",
  purchase: "trial_purchase_work",
  production: "trial_production_work",
  warehouse: "trial_warehouse_work",
  finance: "trial_finance_work",
  pmc: "trial_pmc_work",
  quality: "trial_quality_work",
  engineering: "trial_engineering_work",
});
const TASK_GROUP_OVERRIDES_BY_ROLE_SCENARIO = Object.freeze({
  production: Object.freeze({
    // “今日生产”仍由生产计划视角展示，但它只是模拟任务，不能占用
    // production_scheduling 的正式来源任务组或 source-* 编号前缀。
    today_production: "trial_pmc_work",
  }),
});
// Primary desktop group only. Role-wide coverage must use the scenario mapping
// helpers below because production and warehouse intentionally span groups.
export const TASK_GROUP_BY_ROLE = Object.freeze({
  ...SINGLE_TASK_GROUP_BY_ROLE,
});
const FORMAL_SOURCE_TASK_GROUPS = Object.freeze([
  "production_scheduling",
  "production_exception",
  "shipment_release",
]);
const FORMAL_SOURCE_TASK_CODE_PREFIXES = Object.freeze([
  "source-production-scheduling-",
  "source-production-exception-",
  "source-shipment-release-",
]);
const BUSINESS_STATUS_OVERRIDES_BY_ROLE_SCENARIO = Object.freeze({
  production: Object.freeze({
    today_production: "production_processing",
    outsourcing_return: "production_processing",
    rework: "qc_failed",
    production_exception: "production_processing",
  }),
  warehouse: Object.freeze({
    receiving: "warehouse_inbound_pending",
    inbound: "warehouse_inbound_pending",
    material_picking: "warehouse_processing",
    shipping: "shipment_pending",
    exception: "blocked",
  }),
});
const TASK_SCENARIO_SCHEDULE_BY_ROLE = Object.freeze({
  production: Object.freeze([
    "production_exception",
    "today_production",
    "outsourcing_return",
    "rework",
    "today_production",
    "production_exception",
    "outsourcing_return",
    "rework",
    "today_production",
    "outsourcing_return",
    "production_exception",
    "rework",
    "today_production",
    "outsourcing_return",
    "production_exception",
    "rework",
    "today_production",
    "production_exception",
    "outsourcing_return",
    "rework",
  ]),
  warehouse: Object.freeze([
    "receiving",
    "shipping",
    "inbound",
    "material_picking",
    "exception",
    "receiving",
    "inbound",
    "material_picking",
    "exception",
    "receiving",
    "inbound",
    "exception",
    "shipping",
    "receiving",
    "material_picking",
    "shipping",
    "inbound",
    "material_picking",
    "shipping",
    "exception",
  ]),
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
      "处理订单延期",
      "处理返工问题",
      "处理成品质量问题",
      "处理设备停机",
      "处理主料缺料",
    ]),
    scenarioTopics: Object.freeze({
      today_production: Object.freeze([
        "安排今日生产",
        "查看今日进度",
        "确认今天先做哪一单",
        "确认今天能完成多少",
      ]),
      outsourcing_return: Object.freeze([
        "确认委外回货",
        "核对回货进度",
        "跟进委外回货",
      ]),
      rework: Object.freeze(["安排返工", "查看返工进度", "处理返工问题"]),
      production_exception: Object.freeze([
        "处理订单延期",
        "处理成品质量问题",
        "处理设备停机",
        "处理主料缺料",
      ]),
    }),
    summary: "请确认异常影响什么、由谁处理和下一步怎么做。",
    blockedReason: "还在等材料、设备或品质确认。",
    rejectedReason: "异常说明不完整，请补充。",
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
    businessStatus: "shipment_pending",
    requiredCapability: "workflow.task.complete",
    topics: Object.freeze([
      "核对备货数量",
      "核对质检结果",
      "确认箱唛",
      "确认送货地址",
      "确认出货时间",
    ]),
    scenarioTopics: Object.freeze({
      receiving: Object.freeze([
        "确认委外回货",
        "核对委外回货数量",
        "确认委外回货批次",
      ]),
      inbound: Object.freeze([
        "确认采购来料入库",
        "核对来料入库数量",
        "确认来料入库仓位",
      ]),
      material_picking: Object.freeze([
        "确认生产备料",
        "核对生产备料数量",
        "确认领料位置",
      ]),
      shipping: Object.freeze([
        "核对质检结果",
        "确认箱唛",
        "确认送货地址",
        "确认出货时间",
      ]),
      exception: Object.freeze([
        "处理数量异常",
        "处理批次异常",
        "处理包装异常",
      ]),
    }),
    summary: "请确认数量、批次、库位、备料或送货资料都齐全。",
    blockedReason: "数量、库位或送货资料还没确认。",
    rejectedReason: "数量、批次或送货资料不对，请更正。",
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
    [--database-name <name>] [--schedule-anchor-utc <iso>] \\
    [--source-report <path>] \\
    [--out <directory>] [--apply] \\
    [--retire-legacy-run-id <text>] [--retire-legacy-copy-revision <text>]

Apply to the dedicated local acceptance runtime:
  MANUAL_ACCEPTANCE_TASK_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-task-data.mjs --apply \\
      --target local-dev \\
      --backend-url http://127.0.0.1:8310 \\
      --database-name plush_erp_acceptance_20260716_v5_dev \\
      --data-version 2026.07.16-v5 \\
      --run-id 20260716-V5 \\
      --schedule-anchor-utc 2026-07-17T09:00:00.000Z \\
      --source-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source/apply-report.json \\
      --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/task

The registered customer trial target additionally requires
--target customer-trial-133, the exact registered backend origin, an explicit
--data-version, MANUAL_ACCEPTANCE_TARGET_CONFIRM bound to target/version/run,
and MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON with exact
origin/customer/release/migration/debug fields.

Default mode only prints the deterministic 180-task plan. Apply uses the formal
workflow JSON-RPC create/action contracts, never writes facts, and never connects
to SQL directly. Apply requires the schedule anchor captured by the fresh dataset
run; a same-batch resume must reuse that exact anchor. Apply writes
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

export function manualAcceptanceTaskBatchIdentity(runId) {
  const normalizedRunID = sanitizeRunId(runId);
  return Object.freeze({
    runId: normalizedRunID,
    copyRevision: TASK_COPY_REVISION,
    sourceType: TASK_SOURCE_TYPE,
    sourceID: stablePositiveSourceID(
      `${normalizedRunID}:${TASK_COPY_REVISION}`,
    ),
    prefix: `${TASK_SIMULATION_PREFIX}-${normalizedRunID}-${TASK_COPY_REVISION}`,
  });
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
  const codeScheme =
    normalizedCopyRevision === TASK_COPY_REVISION
      ? "short-v5"
      : !normalizedCopyRevision || /^PLAIN[1-4]$/u.test(normalizedCopyRevision)
        ? "long-batch"
        : null;
  if (!codeScheme) {
    throw new CliError(
      `unsupported legacy task copy revision ${normalizedCopyRevision}`,
      2,
    );
  }
  return Object.freeze({
    runId: normalizedRunID,
    copyRevision: normalizedCopyRevision,
    backendURL: normalizeManualAcceptanceBackendURL(backendURL),
    sourceType: SOURCE_TYPE,
    sourceID: stablePositiveSourceID(identity),
    prefix: `${SIMULATION_PREFIX}-${normalizedRunID}${normalizedCopyRevision ? `-${normalizedCopyRevision}` : ""}`,
    codeScheme,
  });
}

export function manualAcceptanceLegacyTaskCode(legacyBatch, roleKey, index) {
  if (!TASK_ROLES.includes(roleKey)) {
    throw new CliError(`unknown legacy task role ${roleKey}`, 2);
  }
  const sequence = pad(index);
  if (legacyBatch?.codeScheme === "short-v5") {
    return `${TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey]}-${sequence}`;
  }
  if (legacyBatch?.codeScheme === "long-batch") {
    return `${legacyBatch.prefix}-${roleKey.toUpperCase()}-${sequence}`;
  }
  throw new CliError("legacy task code scheme is invalid", 2);
}

export function manualAcceptanceTaskRetireConfirmation(keepPlan, legacyBatch) {
  const parts = [RETIRE_CONFIRM_PREFIX, keepPlan.target, legacyBatch.runId];
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

export function getManualAcceptanceTaskGroupScenarioCounts(roleKey, taskGroup) {
  const expectedScenarios =
    getManualAcceptanceTaskGroupScenarios(roleKey)[taskGroup];
  if (!expectedScenarios) {
    throw new CliError(`${roleKey} has unknown task group ${taskGroup}`);
  }
  const counts = Object.fromEntries(
    expectedScenarios.map((scenarioKey) => [scenarioKey, 0]),
  );
  for (let index = 1; index <= TASKS_PER_ROLE; index += 1) {
    const scenarioKey = taskScenarioAt(roleKey, index);
    if (getManualAcceptanceTaskGroup(roleKey, scenarioKey) === taskGroup) {
      counts[scenarioKey] += 1;
    }
  }
  return counts;
}

export function getManualAcceptanceTaskGroupCount(roleKey, taskGroup) {
  return Object.values(
    getManualAcceptanceTaskGroupScenarioCounts(roleKey, taskGroup),
  ).reduce((total, count) => total + count, 0);
}

export function getManualAcceptanceTaskGroupStatusCounts(roleKey, taskGroup) {
  getManualAcceptanceTaskGroupScenarioCounts(roleKey, taskGroup);
  const counts = Object.fromEntries(
    TASK_STATUS_KEYS.map((status) => [status, 0]),
  );
  for (let index = 1; index <= TASKS_PER_ROLE; index += 1) {
    const scenarioKey = taskScenarioAt(roleKey, index);
    if (getManualAcceptanceTaskGroup(roleKey, scenarioKey) === taskGroup) {
      counts[targetStatusAt(roleKey, index)] += 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).filter(([, count]) => count > 0),
  );
}

export function buildManualAcceptanceTaskSchedule(anchorUnix) {
  const normalizedAnchor = positiveSafeInteger(anchorUnix, "schedule anchor");
  const dueSoonValidUntilUnix =
    normalizedAnchor + TASK_SCHEDULE_POLICY.dueSoonOffsetSeconds;
  return Object.freeze({
    contract: "manual-acceptance-task-schedule-v1",
    anchorSource: TASK_SCHEDULE_POLICY.anchorSource,
    anchorUnix: normalizedAnchor,
    anchorUtc: new Date(normalizedAnchor * 1000).toISOString(),
    dueSoonValidUntilUnix,
    dueSoonValidUntilUtc: new Date(dueSoonValidUntilUnix * 1000).toISOString(),
    offsets: Object.freeze({
      overdue: TASK_SCHEDULE_POLICY.overdueOffsetSeconds,
      dueSoon: TASK_SCHEDULE_POLICY.dueSoonOffsetSeconds,
      thisWeek: TASK_SCHEDULE_POLICY.thisWeekOffsetSeconds,
      later: TASK_SCHEDULE_POLICY.laterOffsetSeconds,
    }),
  });
}

export function manualAcceptanceTaskScheduleAnchorUnix(value) {
  const text = requiredText(value, "schedule anchor UTC");
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) {
    throw new CliError("schedule anchor UTC must be a valid ISO timestamp", 2);
  }
  return positiveSafeInteger(
    Math.floor(milliseconds / 1000),
    "schedule anchor UTC",
  );
}

export function manualAcceptanceTaskDueAt(index, anchorUnix) {
  const anchor = positiveSafeInteger(anchorUnix, "schedule anchor");
  switch ((index - 1) % 4) {
    case 0:
      return {
        scenario: "overdue",
        value: anchor + TASK_SCHEDULE_POLICY.overdueOffsetSeconds,
      };
    case 1:
      return {
        scenario: "due_soon",
        value: anchor + TASK_SCHEDULE_POLICY.dueSoonOffsetSeconds,
      };
    case 2:
      return {
        scenario: "this_week",
        value: anchor + TASK_SCHEDULE_POLICY.thisWeekOffsetSeconds,
      };
    default:
      return {
        scenario: "later",
        value: anchor + TASK_SCHEDULE_POLICY.laterOffsetSeconds,
      };
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

function requiredTaskScenarios(roleKey) {
  const scenarios = MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS[roleKey];
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new CliError(`${roleKey} is missing catalog task scenarios`);
  }
  if (
    scenarios.some(
      (scenario) =>
        typeof scenario !== "string" ||
        !scenario.trim() ||
        !/^[a-z][a-z0-9_]*$/u.test(scenario),
    ) ||
    new Set(scenarios).size !== scenarios.length
  ) {
    throw new CliError(`${roleKey} catalog task scenarios are invalid`);
  }
  return scenarios;
}

export function getManualAcceptanceTaskGroup(roleKey, scenarioKey) {
  const scenarios = requiredTaskScenarios(roleKey);
  if (!scenarios.includes(scenarioKey)) {
    throw new CliError(`${roleKey} has unknown task scenario ${scenarioKey}`);
  }
  const taskGroup =
    TASK_GROUP_OVERRIDES_BY_ROLE_SCENARIO[roleKey]?.[scenarioKey] ||
    SINGLE_TASK_GROUP_BY_ROLE[roleKey];
  if (!taskGroup) {
    throw new CliError(`${roleKey}/${scenarioKey} has no task group mapping`);
  }
  return taskGroup;
}

export function getManualAcceptanceTaskBusinessStatus(roleKey, scenarioKey) {
  const profile = ROLE_SCENARIOS[roleKey];
  if (!profile) throw new CliError(`unknown task role ${roleKey}`);
  getManualAcceptanceTaskGroup(roleKey, scenarioKey);
  return (
    BUSINESS_STATUS_OVERRIDES_BY_ROLE_SCENARIO[roleKey]?.[scenarioKey] ||
    profile.businessStatus
  );
}

export function getManualAcceptanceTaskGroupScenarios(roleKey) {
  const grouped = {};
  for (const scenarioKey of requiredTaskScenarios(roleKey)) {
    const taskGroup = getManualAcceptanceTaskGroup(roleKey, scenarioKey);
    grouped[taskGroup] ||= [];
    grouped[taskGroup].push(scenarioKey);
  }
  return Object.fromEntries(
    Object.entries(grouped)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([taskGroup, scenarios]) => [taskGroup, [...scenarios]]),
  );
}

export function getManualAcceptanceRoleTaskGroups(roleKey) {
  return Object.keys(getManualAcceptanceTaskGroupScenarios(roleKey));
}

function taskScenarioAt(roleKey, index) {
  const schedule = TASK_SCENARIO_SCHEDULE_BY_ROLE[roleKey];
  if (schedule) {
    if (schedule.length !== TASKS_PER_ROLE) {
      throw new CliError(
        `${roleKey} task scenario schedule must contain ${TASKS_PER_ROLE} items`,
      );
    }
    const scenarioKey = schedule[index - 1];
    if (!requiredTaskScenarios(roleKey).includes(scenarioKey)) {
      throw new CliError(
        `${roleKey} task scenario schedule contains unknown ${scenarioKey}`,
      );
    }
    return scenarioKey;
  }
  const scenarios = requiredTaskScenarios(roleKey);
  return scenarios[(index - 1) % scenarios.length];
}

function taskTopicAt(profile, scenarioKey, index) {
  const scenarioTopics = profile.scenarioTopics?.[scenarioKey];
  if (scenarioTopics) {
    return scenarioTopics[
      Math.floor((index - 1) / Object.keys(profile.scenarioTopics).length) %
        scenarioTopics.length
    ];
  }
  const scenarioIndex = requiredTaskScenarios(profile.roleKey).indexOf(
    scenarioKey,
  );
  return profile.topics[scenarioIndex];
}

function catalogScenarioContract() {
  return Object.fromEntries(
    TASK_ROLES.map((roleKey) => [
      roleKey,
      {
        scenarios: [...requiredTaskScenarios(roleKey)],
        groups: getManualAcceptanceTaskGroupScenarios(roleKey),
        schedule: Array.from({ length: TASKS_PER_ROLE }, (_, offset) =>
          taskScenarioAt(roleKey, offset + 1),
        ),
      },
    ]),
  );
}

export const TASK_CATALOG_SCENARIO_DIGEST = createHash("sha256")
  .update(JSON.stringify(catalogScenarioContract()))
  .digest("hex");

function summarizeTaskCoverage(tasks) {
  const taskGroupsByRole = {};
  const scenariosByRoleTaskGroup = {};
  for (const roleKey of TASK_ROLES) {
    const roleTasks = tasks.filter((task) => task.roleKey === roleKey);
    const groups = getManualAcceptanceRoleTaskGroups(roleKey);
    taskGroupsByRole[roleKey] = groups;
    scenariosByRoleTaskGroup[roleKey] = {};
    for (const taskGroup of groups) {
      const counts = Object.fromEntries(
        getManualAcceptanceTaskGroupScenarios(roleKey)[taskGroup].map(
          (scenarioKey) => [scenarioKey, 0],
        ),
      );
      for (const task of roleTasks.filter(
        (candidate) => candidate.createParams.task_group === taskGroup,
      )) {
        const scenarioKey = task.createParams.payload?.acceptance_scenario_key;
        if (Object.hasOwn(counts, scenarioKey)) {
          counts[scenarioKey] += 1;
        } else {
          counts[`__unexpected__:${scenarioKey}`] =
            (counts[`__unexpected__:${scenarioKey}`] || 0) + 1;
        }
      }
      scenariosByRoleTaskGroup[roleKey][taskGroup] = counts;
    }
  }
  return {
    taskGroupsByRole,
    scenariosByRoleTaskGroup,
    catalogScenarioDigest: TASK_CATALOG_SCENARIO_DIGEST,
  };
}

function buildRoleTask({ roleKey, index, runId, sourceID, nowSec }) {
  const profile = ROLE_SCENARIOS[roleKey];
  const targetStatus = targetStatusAt(roleKey, index);
  const action = actionFor(roleKey, targetStatus, runId, index, profile);
  const due = manualAcceptanceTaskDueAt(index, nowSec);
  const assignmentMode = index % 2 === 0 ? "role_account" : "owner_pool";
  const scenarioKey = taskScenarioAt(roleKey, index);
  const topic = taskTopicAt({ ...profile, roleKey }, scenarioKey, index);
  const taskCode = `${TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey]}-${pad(index)}`;
  const sourceNo = `样例-${profile.label}-${pad(index)}`;
  const taskGroup = getManualAcceptanceTaskGroup(roleKey, scenarioKey);
  const businessStatus = getManualAcceptanceTaskBusinessStatus(
    roleKey,
    scenarioKey,
  );
  const payload = {
    simulated_only: true,
    real_customer_data: false,
    trial_task: true,
    acceptance_scenario_key: scenarioKey,
    business_summary: profile.summary,
    attention_note:
      index % 5 === 0 ? "内容较多，请逐项确认。" : "按提示处理即可。",
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
      business_status_key: businessStatus,
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
  const byStatus = Object.fromEntries(
    TASK_STATUS_KEYS.map((status) => [status, 0]),
  );
  const byTaskGroup = {};
  const dueScenarios = {};
  let assigned = 0;
  let actionCount = 0;
  for (const task of tasks) {
    byRole[task.roleKey] += 1;
    byStatus[task.targetStatus] += 1;
    const taskGroup = task.createParams.task_group;
    byTaskGroup[taskGroup] = (byTaskGroup[taskGroup] || 0) + 1;
    dueScenarios[task.dueScenario] = (dueScenarios[task.dueScenario] || 0) + 1;
    if (task.assignmentMode === "role_account") assigned += 1;
    if (task.action) actionCount += 1;
  }
  return {
    total: tasks.length,
    byRole,
    byStatus,
    byTaskGroup,
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
  const expectedSchedule = buildManualAcceptanceTaskSchedule(
    plan.generatedAtUnix,
  );
  if (JSON.stringify(plan.schedule) !== JSON.stringify(expectedSchedule)) {
    throw new CliError(
      "task plan schedule does not match its controlled anchor",
    );
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
    const scenarioCounts = Object.fromEntries(
      requiredTaskScenarios(roleKey).map((scenarioKey) => [scenarioKey, 0]),
    );
    for (const task of roleTasks) {
      const params = task.createParams || {};
      if (seenCodes.has(params.task_code)) {
        throw new CliError(`duplicate task_code ${params.task_code}`);
      }
      seenCodes.add(params.task_code);
      if (
        FORMAL_SOURCE_TASK_CODE_PREFIXES.some((prefix) =>
          params.task_code.startsWith(prefix),
        )
      ) {
        throw new CliError(
          `${task.key} simulated task must not use a formal source task code`,
        );
      }
      if (
        params.task_code !==
        `${TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey]}-${pad(task.index)}`
      ) {
        throw new CliError(`${task.key} visible task code is not canonical`);
      }
      const expectedDue = manualAcceptanceTaskDueAt(
        task.index,
        plan.schedule.anchorUnix,
      );
      if (
        task.dueScenario !== expectedDue.scenario ||
        params.due_at !== expectedDue.value
      ) {
        throw new CliError(
          `${task.key} due schedule does not match the anchor`,
        );
      }
      statusCounts[task.targetStatus] += 1;
      if (
        params.owner_role_key !== roleKey ||
        params.owner_pool_key !== roleKey
      ) {
        throw new CliError(`${task.key} owner scope does not match its role`);
      }
      const scenarioKey = params.payload?.acceptance_scenario_key;
      if (!Object.hasOwn(scenarioCounts, scenarioKey)) {
        throw new CliError(
          `${task.key} acceptance scenario is outside the catalog`,
        );
      }
      const expectedTaskGroup = getManualAcceptanceTaskGroup(
        roleKey,
        scenarioKey,
      );
      if (params.task_group !== expectedTaskGroup) {
        throw new CliError(
          `${task.key} task group does not match scenario ${scenarioKey}`,
        );
      }
      if (
        !params.task_group.startsWith("trial_") ||
        FORMAL_SOURCE_TASK_GROUPS.includes(params.task_group)
      ) {
        throw new CliError(
          `${task.key} simulated task must stay in the trial_* namespace`,
        );
      }
      const expectedBusinessStatus = getManualAcceptanceTaskBusinessStatus(
        roleKey,
        scenarioKey,
      );
      if (params.business_status_key !== expectedBusinessStatus) {
        throw new CliError(
          `${task.key} business status does not match scenario ${scenarioKey}`,
        );
      }
      scenarioCounts[scenarioKey] += 1;
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
    const missingScenarios = Object.entries(scenarioCounts)
      .filter(([, count]) => count === 0)
      .map(([scenarioKey]) => scenarioKey);
    if (missingScenarios.length > 0) {
      throw new CliError(
        `${roleKey} is missing catalog task scenarios: ${missingScenarios.join(", ")}`,
      );
    }
  }
  const expectedCoverage = summarizeTaskCoverage(plan.tasks);
  if (JSON.stringify(plan.coverage) !== JSON.stringify(expectedCoverage)) {
    throw new CliError(
      "task plan coverage does not match its catalog scenarios",
    );
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
    databaseName: options.databaseName,
  });
  const backendURL = targetPolicy.backendURL;
  const nowSec = runAnchorSeconds(runId, options.nowSec);
  const schedule = buildManualAcceptanceTaskSchedule(nowSec);
  const batchIdentity = manualAcceptanceTaskBatchIdentity(runId);
  const { prefix, sourceID } = batchIdentity;
  const tasks = TASK_ROLES.flatMap((roleKey) =>
    Array.from({ length: TASKS_PER_ROLE }, (_, offset) =>
      buildRoleTask({
        roleKey,
        index: offset + 1,
        runId,
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
    databaseName: targetPolicy.databaseName,
    runId,
    copyRevision: TASK_COPY_REVISION,
    prefix,
    sourceType: SOURCE_TYPE,
    sourceID,
    generatedAtUnix: nowSec,
    schedule,
    roleUsers: Object.fromEntries(
      TASK_ROLES.map((roleKey) => [roleKey, ROLE_USERS[roleKey]]),
    ),
    summary: summarizePlanTasks(tasks),
    coverage: summarizeTaskCoverage(tasks),
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
    databaseName: process.env.MANUAL_ACCEPTANCE_DATABASE_NAME,
    scheduleAnchorUtc:
      process.env.MANUAL_ACCEPTANCE_TASK_SCHEDULE_ANCHOR_UTC || "",
    dataVersion: process.env.MANUAL_ACCEPTANCE_TASK_DATA_VERSION,
    retireLegacyRunId: "",
    retireLegacyCopyRevision: "",
    sourceReport: process.env.MANUAL_ACCEPTANCE_SOURCE_REPORT || "",
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
      case "database-name":
        options.databaseName = value;
        break;
      case "run-id":
        options.runId = value;
        break;
      case "schedule-anchor-utc":
        options.scheduleAnchorUtc = requiredText(
          value,
          "--schedule-anchor-utc",
        );
        break;
      case "source-report":
        options.sourceReport = requiredText(value, "--source-report");
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
  if (options.scheduleAnchorUtc) {
    options.nowSec = manualAcceptanceTaskScheduleAnchorUnix(
      options.scheduleAnchorUtc,
    );
    options.scheduleAnchorUtc = new Date(options.nowSec * 1000).toISOString();
  }
  if (options.retireLegacyRunId && !options.apply) {
    throw new CliError("--retire-legacy-run-id requires --apply", 2);
  }
  if (options.retireLegacyCopyRevision && !options.retireLegacyRunId) {
    throw new CliError(
      "--retire-legacy-copy-revision requires --retire-legacy-run-id",
      2,
    );
  }
  if (
    options.apply &&
    !options.retireLegacyRunId &&
    !options.scheduleAnchorUtc
  ) {
    throw new CliError(
      "task --apply requires --schedule-anchor-utc captured by the fresh dataset run; same-batch replay must reuse it",
      2,
    );
  }
  if (options.apply && !options.retireLegacyRunId && !options.sourceReport) {
    throw new CliError(
      "task --apply requires --source-report from the same dataset run",
      2,
    );
  }
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: options.backendURL,
    target: options.target,
    dataVersion: options.dataVersion,
    runId: options.runId,
    databaseName: options.databaseName,
  });
  options.backendURL = targetPolicy.backendURL;
  options.target = targetPolicy.target;
  options.dataVersion = targetPolicy.dataVersion;
  options.databaseName = targetPolicy.databaseName;
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
  includeSalesRuntime = false,
  fetchImpl,
}) {
  const attested = targetAttestation
    ? assertManualAcceptanceTargetAttestation({
        policy: plan,
        attestation: targetAttestation,
      })
    : undefined;
  const capabilities = await rpcCall({
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
    requiredModules: includeSalesRuntime
      ? ["workflow_tasks", "sales_orders"]
      : ["workflow_tasks"],
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

function assertTaskIdentity(
  task,
  plannedTask,
  accounts,
  { allowCommercialRedaction = false } = {},
) {
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
    if (
      allowCommercialRedaction &&
      key === "amount" &&
      task?.payload?.[key] === undefined
    ) {
      continue;
    }
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
  // PMC owns task creation but intentionally cannot read finance commercial
  // values. Validate its redacted receipt, then bind the task to the owner's
  // full readback before any action or final-state assertion.
  assertTaskIdentity(created, plannedTask, accounts, {
    allowCommercialRedaction: true,
  });
  if (created.task_status_key !== plannedTask.createParams.task_status_key) {
    throw new CliError(
      `${plannedTask.key} create expected ${plannedTask.createParams.task_status_key}, got ${created.task_status_key}`,
    );
  }
  const ownerTasks = await listRoleBatch({
    plan,
    roleKey: plannedTask.roleKey,
    account: accounts[plannedTask.roleKey],
    fetchImpl,
  });
  const ownerVisibleTask = ownerTasks.find((item) => item.id === created.id);
  if (!ownerVisibleTask) {
    throw new CliError(
      `${plannedTask.key} owner readback did not return the created task`,
    );
  }
  assertTaskIdentity(ownerVisibleTask, plannedTask, accounts);
  return ownerVisibleTask;
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

export function validateSalesOrderAcceptanceSourceReport(report, plan) {
  if (
    !report ||
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    report.datasetKey !== plan.datasetKey ||
    report.dataVersion !== plan.dataVersion ||
    report.runId !== plan.runId ||
    report.target !== plan.target ||
    report.backendURL !== plan.backendURL ||
    report.databaseName !== plan.databaseName
  ) {
    throw new CliError(
      "source report does not belong to this simulated task dataset run",
      2,
    );
  }
  const candidates = report.referenceRecords?.salesOrderProcessCandidates;
  if (!Array.isArray(candidates) || candidates.length < 5) {
    throw new CliError(
      "source report requires five DRAFT sales order process candidates",
      2,
    );
  }
  const seen = new Set();
  return candidates.slice(0, 5).map((candidate) => {
    const id = positiveSafeInteger(candidate?.id, "process candidate id");
    const orderNo = requiredText(
      candidate?.orderNo,
      "process candidate orderNo",
    );
    if (candidate?.status !== "DRAFT" || seen.has(id) || seen.has(orderNo)) {
      throw new CliError(
        "process candidates must be unique DRAFT sales orders",
        2,
      );
    }
    seen.add(id);
    seen.add(orderNo);
    return { id, orderNo, status: "DRAFT" };
  });
}

function requireSalesRuntimeTask(task, source) {
  if (
    !task ||
    typeof task !== "object" ||
    positiveSafeInteger(task.id, "linked task id") <= 0 ||
    positiveSafeInteger(task.version, "linked task version") <= 0 ||
    task.source_type !== "sales_order" ||
    Number(task.source_id) !== source.id ||
    !String(task.task_status_key || "").trim() ||
    !String(task.owner_role_key || "").trim() ||
    !Number.isSafeInteger(Number(task.process_instance_id)) ||
    Number(task.process_instance_id) <= 0 ||
    !Number.isSafeInteger(Number(task.process_node_instance_id)) ||
    Number(task.process_node_instance_id) <= 0
  ) {
    throw new CliError(`${source.orderNo} linked task readback is invalid`);
  }
  return task;
}

async function listSalesOrderProcessTasks({
  plan,
  source,
  runtimeAdmin,
  fetchImpl,
}) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: "list_tasks",
    params: {
      source_type: "sales_order",
      source_id: source.id,
      limit: 50,
      offset: 0,
    },
    token: runtimeAdmin.token,
    fetchImpl,
  });
  if (
    !Array.isArray(data.tasks) ||
    !Number.isSafeInteger(Number(data.total)) ||
    Number(data.total) !== data.tasks.length
  ) {
    throw new CliError(`${source.orderNo} linked task readback is incomplete`);
  }
  return data.tasks.map((task) => requireSalesRuntimeTask(task, source));
}

async function readSalesOrderProcessContext({
  plan,
  source,
  task,
  token,
  fetchImpl,
}) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: "get_task_process_context",
    params: { task_id: task.id },
    token,
    fetchImpl,
  });
  const processContext = data.process_context;
  if (
    processContext?.source?.type !== "sales_order" ||
    Number(processContext?.source?.id) !== source.id ||
    processContext?.process_instance?.process_key !==
      "sales_order_acceptance" ||
    !new Set(["active", "blocked", "completed"]).has(
      processContext?.process_instance?.status,
    ) ||
    !Array.isArray(processContext.nodes) ||
    !Array.isArray(processContext.current_nodes) ||
    !Array.isArray(processContext.completed_nodes)
  ) {
    throw new CliError(
      `${source.orderNo} process context readback is incomplete`,
    );
  }
  return processContext;
}

function requireSalesOrderAcceptanceStart(data, source) {
  const instance = data?.process_instance;
  const node = data?.started_node;
  const matchingNode = Array.isArray(data?.nodes)
    ? data.nodes.find(
        (candidate) =>
          candidate?.id === node?.id &&
          candidate.process_instance_id === instance?.id &&
          candidate.node_key === node?.node_key &&
          candidate.node_type === node?.node_type &&
          candidate.status === node?.status &&
          candidate.version === node?.version,
      )
    : undefined;
  if (
    !Number.isSafeInteger(Number(instance?.id)) ||
    Number(instance.id) <= 0 ||
    instance.process_key !== "sales_order_acceptance" ||
    instance.business_ref_type !== "sales_order" ||
    Number(instance.business_ref_id) !== source.id ||
    instance.status !== "active" ||
    !Number.isSafeInteger(Number(node?.id)) ||
    Number(node.id) <= 0 ||
    !Number.isSafeInteger(Number(node?.version)) ||
    Number(node.version) <= 0 ||
    Number(node.process_instance_id) !== Number(instance.id) ||
    node.node_key !== "submit_sales_order" ||
    node.node_type !== "domain_command" ||
    !new Set(["active", "completed"]).has(node.status) ||
    !matchingNode ||
    (node.status === "completed" && node.outcome !== "sales_order.submitted")
  ) {
    throw new CliError(
      `${source.orderNo} process start readback is incomplete`,
    );
  }
  return { instance, node, nodes: data.nodes };
}

function requireSalesOrderAcceptanceExecution(data, source, expected) {
  const node = data?.completed_node;
  const matchingNode = Array.isArray(data?.nodes)
    ? data.nodes.find(
        (candidate) =>
          candidate?.id === node?.id &&
          Number(candidate.process_instance_id) === expected.instanceID &&
          candidate.node_key === "submit_sales_order" &&
          candidate.node_type === "domain_command" &&
          candidate.status === "completed" &&
          candidate.version === node?.version,
      )
    : undefined;
  if (
    Number(node?.id) !== expected.nodeID ||
    Number(node?.process_instance_id) !== expected.instanceID ||
    node?.node_key !== "submit_sales_order" ||
    node?.node_type !== "domain_command" ||
    node?.status !== "completed" ||
    node?.outcome !== "sales_order.submitted" ||
    Number(node?.version) !== expected.version + 1 ||
    !matchingNode
  ) {
    throw new CliError(
      `${source.orderNo} submit execution readback is incomplete`,
    );
  }
  return node;
}

async function mutateSalesOrderProcessTask({
  plan,
  source,
  task,
  target,
  accounts,
  fetchImpl,
}) {
  const contracts = {
    blocked: ["block_task_action", "block"],
    rejected: ["reject_task_action", "reject"],
    done: ["complete_task_action", "complete"],
  };
  const [method, actionKey] = contracts[target] || [];
  const account = accounts[task.owner_role_key];
  if (!method || !account) {
    throw new CliError(
      `no trial account can perform ${target} for ${task.owner_role_key}`,
    );
  }
  const reason =
    target === "blocked"
      ? "验收样例：等待客户补充资料。"
      : target === "rejected"
        ? "验收样例：订单资料不完整，退回补充。"
        : "验收样例：当前节点已核对完成。";
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method,
    params: {
      task_id: task.id,
      expected_version: task.version,
      idempotency_key: [
        "manual-acceptance-runtime",
        plan.runId,
        task.id,
        target,
      ].join(":"),
      action_key: actionKey,
      reason,
      payload: target === "done" ? { feedback: reason } : {},
    },
    token: account.token,
    fetchImpl,
  });
  const updated = requireSalesRuntimeTask(
    requireTaskRecord(data, method),
    source,
  );
  if (updated.id !== task.id || updated.task_status_key !== target) {
    throw new CliError(
      `${source.orderNo} ${method} returned another task state`,
    );
  }
  return updated;
}

export async function applySalesOrderAcceptanceRuntimeEvidence({
  plan,
  sources,
  accounts,
  runtimeAdmin,
  fetchImpl,
}) {
  const caseKeys = [
    "started_only",
    "active_ready",
    "task_blocked",
    "rejected",
    "completed",
  ];
  const evidence = [];
  for (let index = 0; index < caseKeys.length; index += 1) {
    const caseKey = caseKeys[index];
    const source = sources[index];
    const startData = await rpcCall({
      backendURL: plan.backendURL,
      domain: "customer_config",
      method: "start_sales_order_acceptance_process",
      params: {
        sales_order_id: source.id,
        business_ref_no: source.orderNo,
        idempotency_key: [
          "manual-acceptance-runtime",
          plan.runId,
          source.orderNo,
          "start",
        ].join(":"),
      },
      token: accounts.sales.token,
      fetchImpl,
    });
    const started = requireSalesOrderAcceptanceStart(startData, source);
    if (caseKey === "started_only") {
      if (started.node.status !== "active") {
        throw new CliError(
          `${source.orderNo} started-only evidence has already advanced`,
        );
      }
      evidence.push({
        caseKey,
        source,
        processInstance: started.instance,
        startedNode: started.node,
        nodes: started.nodes,
        evidenceClass: "formal_process_runtime",
      });
      continue;
    }

    let tasks = await listSalesOrderProcessTasks({
      plan,
      source,
      runtimeAdmin,
      fetchImpl,
    });
    if (tasks.length === 0 && started.node.status === "active") {
      const executionData = await rpcCall({
        backendURL: plan.backendURL,
        domain: "customer_config",
        method: "execute_sales_order_acceptance_submit",
        params: {
          process_instance_id: Number(started.instance.id),
          process_node_instance_id: Number(started.node.id),
          expected_version: Number(started.node.version),
          sales_order_id: source.id,
          idempotency_key: [
            "manual-acceptance-runtime",
            plan.runId,
            source.orderNo,
            "submit",
          ].join(":"),
        },
        token: accounts.sales.token,
        fetchImpl,
      });
      requireSalesOrderAcceptanceExecution(executionData, source, {
        instanceID: Number(started.instance.id),
        nodeID: Number(started.node.id),
        version: Number(started.node.version),
      });
      tasks = await listSalesOrderProcessTasks({
        plan,
        source,
        runtimeAdmin,
        fetchImpl,
      });
    }
    let activeTask = tasks.find((task) => task.task_status_key === "ready");

    if (caseKey === "task_blocked") {
      activeTask =
        tasks.find((task) => task.task_status_key === "blocked") || activeTask;
      if (!activeTask) {
        throw new CliError(`${source.orderNo} has no blockable linked task`);
      }
      if (activeTask.task_status_key === "ready") {
        activeTask = await mutateSalesOrderProcessTask({
          plan,
          source,
          task: activeTask,
          target: "blocked",
          accounts,
          fetchImpl,
        });
      }
    } else if (caseKey === "rejected") {
      activeTask =
        tasks.find((task) => task.task_status_key === "rejected") || activeTask;
      if (!activeTask) {
        throw new CliError(`${source.orderNo} has no rejectable linked task`);
      }
      if (activeTask.task_status_key === "ready") {
        activeTask = await mutateSalesOrderProcessTask({
          plan,
          source,
          task: activeTask,
          target: "rejected",
          accounts,
          fetchImpl,
        });
      }
    } else if (caseKey === "completed") {
      let processCompleted = false;
      for (let guard = 0; guard < 8; guard += 1) {
        if (!activeTask) {
          const contextTask = tasks[0];
          if (!contextTask) {
            throw new CliError(
              `${source.orderNo} has no linked task for completion readback`,
            );
          }
          const existingContext = await readSalesOrderProcessContext({
            plan,
            source,
            task: contextTask,
            token: runtimeAdmin.token,
            fetchImpl,
          });
          if (existingContext.process_instance.status === "completed") {
            activeTask = contextTask;
            processCompleted = true;
            break;
          }
          throw new CliError(`${source.orderNo} process stopped before end`);
        }
        activeTask = await mutateSalesOrderProcessTask({
          plan,
          source,
          task: activeTask,
          target: "done",
          accounts,
          fetchImpl,
        });
        const processContext = await readSalesOrderProcessContext({
          plan,
          source,
          task: activeTask,
          token: runtimeAdmin.token,
          fetchImpl,
        });
        if (processContext.process_instance.status === "completed") {
          processCompleted = true;
          break;
        }
        if (processContext.process_instance.status === "blocked") {
          throw new CliError(`${source.orderNo} process blocked before end`);
        }
        tasks = await listSalesOrderProcessTasks({
          plan,
          source,
          runtimeAdmin,
          fetchImpl,
        });
        activeTask = tasks.find((task) => task.task_status_key === "ready");
      }
      if (!processCompleted) {
        throw new CliError(`${source.orderNo} process did not reach end`);
      }
    } else if (!activeTask) {
      throw new CliError(
        `${source.orderNo} did not create an active linked task`,
      );
    }
    const processContext = await readSalesOrderProcessContext({
      plan,
      source,
      task: activeTask,
      token: runtimeAdmin.token,
      fetchImpl,
    });
    evidence.push({
      caseKey,
      source,
      task: activeTask,
      processContext,
      evidenceClass: "formal_process_runtime",
      writesFacts: false,
    });
  }
  const byKey = Object.fromEntries(
    evidence.map((item) => [item.caseKey, item]),
  );
  if (
    byKey.active_ready.processContext.process_instance.status !== "active" ||
    byKey.task_blocked.task.task_status_key !== "blocked" ||
    byKey.task_blocked.processContext.process_instance.status !== "active" ||
    byKey.rejected.task.task_status_key !== "rejected" ||
    byKey.rejected.processContext.process_instance.status !== "blocked" ||
    byKey.completed.processContext.process_instance.status !== "completed"
  ) {
    throw new CliError(
      "sales order acceptance runtime evidence states do not match the formal contract",
    );
  }
  return evidence;
}

export async function applyManualAcceptanceTaskData(
  plan,
  {
    password,
    adminPassword,
    confirmPhrase = process.env.MANUAL_ACCEPTANCE_TASK_CONFIRM,
    targetConfirmation = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation = process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
    sourceReport,
  } = {},
) {
  validateManualAcceptanceTaskPlan(plan);
  assertManualAcceptanceMutationTarget(plan, {
    confirmation: targetConfirmation,
  });
  const parsedTargetAttestation =
    parseManualAcceptanceTargetAttestation(targetAttestation);
  assertManualAcceptanceTaskTargetCompatibility(plan, parsedTargetAttestation);
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
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy: plan,
    attestation: parsedTargetAttestation,
    fetchImpl,
  });
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
    targetAttestation: parsedTargetAttestation,
    includeSalesRuntime: Boolean(sourceReport),
    fetchImpl,
  });
  const runtimeEvidence = sourceReport
    ? await applySalesOrderAcceptanceRuntimeEvidence({
        plan,
        sources: validateSalesOrderAcceptanceSourceReport(sourceReport, plan),
        accounts,
        runtimeAdmin,
        fetchImpl,
      })
    : [];
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
    evidenceClass:
      runtimeEvidence.length > 0
        ? "mixed_formal_runtime_and_simulated_display_only"
        : "simulated_display_only",
    provesProcessRuntime: runtimeEvidence.length > 0,
    runId: plan.runId,
    copyRevision: plan.copyRevision,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    target: plan.target,
    prefix: plan.prefix,
    sourceType: plan.sourceType,
    sourceID: plan.sourceID,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
    coverage: plan.coverage,
    schedule: plan.schedule,
    runtime,
    runtimeEvidence,
    displayOnlyTasks: {
      evidenceClass: "simulated_display_only",
      provesProcessRuntime: false,
      total: finalTasks.length,
    },
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
  const code = requiredText(
    task?.task_code,
    `${roleKey} legacy task.task_code`,
  );
  if (
    code !==
      manualAcceptanceLegacyTaskCode(
        legacyBatch,
        roleKey,
        Number(code.slice(-2)),
      ) ||
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
    throw new CliError(
      `${code} is assigned outside the legacy role account`,
      2,
    );
  }
  if (!TASK_STATUS_KEYS.includes(task.task_status_key)) {
    throw new CliError(`${code} has unknown task status`, 2);
  }
  return task;
}

async function listLegacyTaskBatch({ legacyBatch, accounts, fetchImpl }) {
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
      Array.from({ length: TASKS_PER_ROLE }, (_, offset) =>
        manualAcceptanceLegacyTaskCode(legacyBatch, roleKey, offset + 1),
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
    targetAttestation = process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
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
  const parsedTargetAttestation =
    parseManualAcceptanceTargetAttestation(targetAttestation);
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
  const effectiveAdminPassword = requiredText(
    adminPassword ?? process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy: keepPlan,
    attestation: parsedTargetAttestation,
    fetchImpl,
  });
  const runtimeAdmin = await loginRuntimeAdmin({
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
    steps.push({
      taskCode: task.task_code,
      operation: reject ? "reject" : "complete",
    });
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
    databaseName: keepPlan.databaseName,
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
      finalRejected: after.filter((task) => task.task_status_key === "rejected")
        .length,
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
    : await applyManualAcceptanceTaskData(plan, {
        sourceReport: JSON.parse(await readFile(options.sourceReport, "utf8")),
      });
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
