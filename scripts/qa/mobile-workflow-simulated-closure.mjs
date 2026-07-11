#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR =
  "output/customers/yoyoosun/mobile-workflow-simulated-closure";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-MOBILE-WORKFLOW";
const INPUT_TEMPLATE_SCOPE = "mobile-workflow-simulated-closure-input-template";
const CONFIRM_PHRASE = "APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS";
const FORBIDDEN_ARG_PATTERN =
  /--(?:execute|import|real|real-import|customer-data)/u;

const ROLE_USERS = {
  pmc: "demo_pmc",
  boss: "demo_boss",
  quality: "demo_quality",
  warehouse: "demo_warehouse",
};

const USAGE = `Mobile workflow simulated closure

Usage:
  node scripts/qa/mobile-workflow-simulated-closure.mjs
  node scripts/qa/mobile-workflow-simulated-closure.mjs --print-input-template

Apply simulated mobile workflow tasks through JSON-RPC:
  MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS \\
  MOBILE_WORKFLOW_SIM_PASSWORD='replace-with-password' \\
    node scripts/qa/mobile-workflow-simulated-closure.mjs \\
      --apply \\
      --backend-url http://127.0.0.1:8300

Options:
  --print-input-template Print local input checklist only; no report/backend/database writes.
  --apply              Create and update simulated workflow tasks.
  --backend-url <url>  Backend base URL. Default ${DEFAULT_BACKEND_URL}.
  --out <dir>          Output report directory. Default ${DEFAULT_OUT_DIR}.
  --run-id <text>      Optional unique run suffix. Default timestamp.
  --help               Print this help.

This script only writes explicitly marked simulated mobile workflow tasks. It never
imports real customer data, never writes business_records directly, never creates
schema or migrations, and never posts production, shipment, inventory, reservation,
or finance facts.`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function requiredText(value, pathName) {
  const text = optionalText(value);
  if (!text) {
    throw new CliError(`${pathName} is required`);
  }
  return text;
}

function normalizeBaseURL(raw) {
  const url = new URL(String(raw || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain username or password", 2);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function buildTimestampRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function sanitizeRunId(value) {
  const text = requiredText(value, "runId")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!text || text.length > 19) {
    throw new CliError("runId must be 1-19 safe characters");
  }
  return text;
}

function parseCliArgs(argv) {
  const options = {
    apply: false,
    help: false,
    printInputTemplate: false,
    out: DEFAULT_OUT_DIR,
    backendURL:
      process.env.MOBILE_WORKFLOW_SIM_BACKEND_URL || DEFAULT_BACKEND_URL,
    runId: process.env.MOBILE_WORKFLOW_SIM_RUN_ID || buildTimestampRunId(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (FORBIDDEN_ARG_PATTERN.test(token)) {
      throw new CliError(
        `Mobile workflow simulated closure refuses real import style flag: ${token}`,
        2,
      );
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--print-input-template") {
      options.printInputTemplate = true;
      continue;
    }
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    switch (key) {
      case "backend-url":
        options.backendURL = value;
        break;
      case "out":
        options.out = value;
        break;
      case "run-id":
        options.runId = sanitizeRunId(value);
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  options.backendURL = normalizeBaseURL(options.backendURL);
  options.runId = sanitizeRunId(options.runId);
  if (options.printInputTemplate && options.apply) {
    throw new CliError(
      "--print-input-template cannot be combined with --apply",
      2,
    );
  }
  return options;
}

function buildInputTemplate(options = {}) {
  const backendURL = normalizeBaseURL(
    options.backendURL || DEFAULT_BACKEND_URL,
  );
  const out = optionalText(options.out) || DEFAULT_OUT_DIR;
  const runId = sanitizeRunId(options.runId || "DEV-TESTING-REPORT");
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    customerKey: "yoyoosun",
    scenario: "mobile-workflow-simulated-closure",
    simulatedOnly: true,
    realCustomerImport: false,
    factPosting: false,
    customerAcceptanceRequiredForClosure: false,
    writesReports: false,
    writesDatabase: false,
    callsBackend: false,
    importsRealCustomerData: false,
    createsBusinessRecords: false,
    createsOperationalFacts: false,
    downstreamReportOnlyWritesReports: true,
    downstreamApplyWritesDatabase: true,
    defaultBackendURL: DEFAULT_BACKEND_URL,
    backendURL,
    defaultOut: DEFAULT_OUT_DIR,
    out,
    runId,
    roleAccounts: ROLE_USERS,
    simulatedTaskGroups: [
      "order_approval",
      "finished_goods_qc",
      "warehouse_inbound",
      "shipment_release",
    ],
    simulatedActions: [
      "boss done",
      "boss rejected with reason",
      "quality done with evidence",
      "warehouse done with evidence",
      "shipment release blocked with exception report",
      "pmc urges warehouse task without completing it",
    ],
    requiredApplyInputs: [
      "MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS",
      "MOBILE_WORKFLOW_SIM_PASSWORD or TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD",
    ],
    optionalInputs: [
      "--backend-url <url>",
      "--out <dir>",
      "--run-id <safe_run_id>",
    ],
    commands: {
      printInputTemplate:
        "PATH=/usr/local/bin:$PATH node scripts/qa/mobile-workflow-simulated-closure.mjs --print-input-template",
      reportOnly: `PATH=/usr/local/bin:$PATH node scripts/qa/mobile-workflow-simulated-closure.mjs --run-id ${runId} --out ${out}`,
      applySimulated:
        "MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS MOBILE_WORKFLOW_SIM_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/mobile-workflow-simulated-closure.mjs --apply --backend-url http://127.0.0.1:8300",
    },
    boundary:
      "This template only prints prerequisites and commands. It does not write reports, call backend, login, import real customer data, write business_records, create workflow tasks, or post operational facts.",
  };
}

function evidence(actionKey, roleKey, reason, evidenceRefs, nowSec) {
  const refs = Array.isArray(evidenceRefs) ? evidenceRefs : [];
  const payload = {
    mobile_action: {
      role_key: roleKey,
      action_key: actionKey,
      reason,
      evidence_refs: refs,
      recorded_at: nowSec,
      simulated_only: true,
    },
    mobile_action_evidence_refs: refs,
    mobile_action_recorded_at: nowSec,
    mobile_action_role_key: roleKey,
    mobile_action_key: actionKey,
  };
  if (["blocked", "rejected"].includes(actionKey)) {
    payload.mobile_exception_report = {
      role_key: roleKey,
      action_key: actionKey,
      reason,
      evidence_refs: refs,
      reported_at: nowSec,
      simulated_only: true,
    };
  }
  return payload;
}

function buildTask(prefix, task) {
  return {
    task_code: `${prefix}-${task.code}`,
    task_group: task.group,
    task_name: task.name,
    source_type: task.sourceType,
    source_id: task.sourceId,
    source_no: `${prefix}-${task.sourceNo}`,
    business_status_key: task.businessStatus,
    task_status_key: "ready",
    owner_role_key: task.ownerRole,
    priority: task.priority ?? 2,
    due_at: task.dueAt,
    payload: {
      simulated_only: true,
      simulation_prefix: SIMULATION_PREFIX,
      mobile_workflow_task: true,
      customer_name: "Mobile workflow 模拟客户",
      style_no: "MOBILE-WORKFLOW",
      product_name: "Mobile workflow 模拟产品",
      quantity: "24",
      unit: "pcs",
      critical_path: true,
      complete_condition: task.completeCondition,
      related_documents: [`${prefix}-${task.sourceNo}`],
      ...task.payload,
    },
  };
}

function buildPlan(options) {
  const prefix = `${SIMULATION_PREFIX}-${options.runId}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const dueAt = nowSec + 86400;
  return {
    customerKey: "yoyoosun",
    scenario: "mobile-workflow-simulated-closure",
    simulatedOnly: true,
    realCustomerImport: false,
    factPosting: false,
    customerAcceptanceRequiredForClosure: false,
    simulationPrefix: SIMULATION_PREFIX,
    runId: options.runId,
    backendURL: options.backendURL,
    tasks: {
      approval: buildTask(prefix, {
        code: "APPROVAL",
        group: "order_approval",
        name: "Mobile workflow 模拟老板审批",
        sourceType: "project-orders",
        sourceId: 910001,
        sourceNo: "SO-APPROVAL",
        businessStatus: "project_pending",
        ownerRole: "boss",
        dueAt,
        completeCondition: "老板在岗位任务端确认审批。",
        payload: {
          notification_type: "approval_required",
          alert_type: "approval_pending",
        },
      }),
      approvalRejected: buildTask(prefix, {
        code: "APPROVAL-REJECT",
        group: "order_approval",
        name: "Mobile workflow 模拟老板退回",
        sourceType: "project-orders",
        sourceId: 910005,
        sourceNo: "SO-REJECT",
        businessStatus: "project_pending",
        ownerRole: "boss",
        dueAt,
        completeCondition:
          "老板在岗位任务端填写退回原因，退回只写 Workflow 任务状态。",
        payload: {
          notification_type: "approval_required",
          alert_type: "approval_pending",
        },
      }),
      quality: buildTask(prefix, {
        code: "QC",
        group: "finished_goods_qc",
        name: "Mobile workflow 模拟成品抽检",
        sourceType: "production-progress",
        sourceId: 910002,
        sourceNo: "QC",
        businessStatus: "qc_pending",
        ownerRole: "quality",
        dueAt,
        completeCondition: "品质在岗位任务端确认成品抽检结果。",
        payload: {
          alert_type: "finished_goods_qc_pending",
          finished_goods: true,
        },
      }),
      warehouseInbound: buildTask(prefix, {
        code: "WH-IN",
        group: "warehouse_inbound",
        name: "Mobile workflow 模拟仓库入库确认",
        sourceType: "accessories-purchase",
        sourceId: 910003,
        sourceNo: "WH-IN",
        businessStatus: "warehouse_inbound_pending",
        ownerRole: "warehouse",
        dueAt,
        completeCondition: "仓库在岗位任务端确认入库数量、库位和经手人。",
        payload: {
          material_name: "Mobile workflow 模拟辅料",
        },
      }),
      warehouseUrge: buildTask(prefix, {
        code: "WH-URGE",
        group: "shipment_release",
        name: "Mobile workflow 模拟仓库任务催办",
        sourceType: "shipping-release",
        sourceId: 910006,
        sourceNo: "WH-URGE",
        businessStatus: "shipment_pending",
        ownerRole: "warehouse",
        priority: 3,
        dueAt,
        completeCondition: "PMC 只能催办仓库任务，不能代办完成、阻塞或退回。",
        payload: {
          shipment_release: true,
          notification_type: "shipment_release_pending",
          alert_type: "shipment_release_pending",
        },
      }),
      shipmentRelease: buildTask(prefix, {
        code: "SHIP-REL",
        group: "shipment_release",
        name: "Mobile workflow 模拟出货放行异常",
        sourceType: "shipping-release",
        sourceId: 910004,
        sourceNo: "SHIP-REL",
        businessStatus: "shipment_pending",
        ownerRole: "warehouse",
        priority: 3,
        dueAt,
        completeCondition:
          "仓库在岗位任务端确认出货放行；异常时必须上报原因和留痕。",
        payload: {
          shipment_release: true,
          shipment_risk: true,
        },
      }),
    },
    actions: {
      approvalDone: {
        role: "boss",
        nextStatus: "done",
        reason: "",
        payload: evidence(
          "done",
          "boss",
          "",
          [`${prefix}-PHOTO-APPROVAL`],
          nowSec,
        ),
      },
      approvalRejected: {
        role: "boss",
        nextStatus: "rejected",
        reason: "Mobile workflow 模拟资料不完整，退回销售补齐。",
        payload: evidence(
          "rejected",
          "boss",
          "Mobile workflow 模拟资料不完整，退回销售补齐。",
          [`${prefix}-PHOTO-REJECT`],
          nowSec,
        ),
      },
      qualityDone: {
        role: "quality",
        nextStatus: "done",
        reason: "",
        payload: {
          qc_result: "pass",
          ...evidence("done", "quality", "", [`${prefix}-PHOTO-QC`], nowSec),
        },
      },
      warehouseInboundDone: {
        role: "warehouse",
        nextStatus: "done",
        reason: "",
        payload: evidence(
          "done",
          "warehouse",
          "",
          [`${prefix}-PHOTO-WH-IN`],
          nowSec,
        ),
      },
      shipmentReleaseBlocked: {
        role: "warehouse",
        nextStatus: "blocked",
        reason: "Mobile workflow 模拟出货唛头未确认，只做本地模拟异常上报。",
        payload: evidence(
          "blocked",
          "warehouse",
          "Mobile workflow 模拟出货唛头未确认，只做本地模拟异常上报。",
          [`${prefix}-PHOTO-SHIP-EXCEPTION`],
          nowSec,
        ),
      },
      warehouseUrged: {
        role: "pmc",
        action: "urge_task",
        reason: "Mobile workflow 模拟 PMC 催办仓库出货放行。",
        payload: {
          mobile_urge: {
            role_key: "pmc",
            action_key: "urge_task",
            reason: "Mobile workflow 模拟 PMC 催办仓库出货放行。",
            simulated_only: true,
            recorded_at: nowSec,
          },
          notification_type: "urgent_escalation",
          alert_type: "urgent_escalation",
          mobile_action_key: "urge_task",
          mobile_action_role_key: "pmc",
          mobile_action_recorded_at: nowSec,
        },
      },
    },
  };
}

function rpcURLFor(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

async function rpcCall({ backendURL, domain, method, params = {}, token }) {
  let response;
  try {
    response = await fetch(rpcURLFor(backendURL, domain), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `mobile-workflow-sim-${method}-${Date.now()}`,
        method,
        params:
          domain === "auth"
            ? params
            : { customer_key: "yoyoosun", ...params },
      }),
    });
  } catch (error) {
    const cause = error?.cause?.message || error?.message || String(error);
    throw new CliError(`${domain}.${method} request failed: ${cause}`);
  }
  if (!response.ok) {
    throw new CliError(`${domain}.${method} HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

async function loginRole({ backendURL, username, password }) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
  });
  const token = data.access_token || data.token;
  if (!token) {
    throw new CliError(`${username}: admin_login response missing token`);
  }
  return token;
}

async function loginRoles({ backendURL, password }) {
  const tokens = {};
  for (const [role, username] of Object.entries(ROLE_USERS)) {
    tokens[role] = await loginRole({ backendURL, username, password });
  }
  return tokens;
}

async function createTask(plan, tokens, task) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: "create_task",
    params: task,
    token: tokens.pmc,
  });
  return data.task;
}

function buildTaskStatusActionParams(task, action) {
  const actionKeyByStatus = {
    done: "complete",
    blocked: "block",
    rejected: "reject",
  };
  const actionKey = actionKeyByStatus[action.nextStatus];
  if (!actionKey) {
    throw new CliError(
      `unsupported workflow task status action: ${action.nextStatus}`,
    );
  }
  return {
    task_id: task.id,
    action_key: actionKey,
    reason: action.reason,
    payload: {
      ...action.payload,
      mobile_role_key: action.role,
    },
  };
}

async function updateTask(plan, tokens, task, action) {
  const methodByStatus = {
    done: "complete_task_action",
    blocked: "block_task_action",
    rejected: "reject_task_action",
  };
  const method = methodByStatus[action.nextStatus];
  if (!method) {
    throw new CliError(
      `unsupported workflow task status action: ${action.nextStatus}`,
    );
  }
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method,
    params: buildTaskStatusActionParams(task, action),
    token: tokens[action.role],
  });
  return data.task;
}

function buildUrgeTaskParams(task, action) {
  return {
    task_id: task.id,
    action: action.action || "urge_task",
    reason: action.reason,
    payload: {
      ...action.payload,
      mobile_role_key: action.role,
    },
  };
}

async function urgeTask(plan, tokens, task, action) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "workflow",
    method: "urge_task",
    params: buildUrgeTaskParams(task, action),
    token: tokens[action.role],
  });
  return data.task;
}

async function applyPlan(plan, tokens) {
  const steps = [];
  const run = async (label, taskPlan, action) => {
    let created;
    try {
      created = await createTask(plan, tokens, taskPlan);
    } catch (error) {
      throw new CliError(`${label} create failed: ${error.message}`);
    }
    steps.push({
      label: `${label} create`,
      id: created.id,
      status: created.task_status_key,
      task_group: created.task_group,
    });
    let updated;
    try {
      updated = await updateTask(plan, tokens, created, action);
    } catch (error) {
      throw new CliError(`${label} update failed: ${error.message}`);
    }
    steps.push({
      label: `${label} update`,
      id: updated.id,
      status: updated.task_status_key,
      evidence_count: updated.payload?.mobile_action_evidence_refs?.length || 0,
      exception_reported: Boolean(updated.payload?.mobile_exception_report),
    });
  };
  const runUrge = async (label, taskPlan, action) => {
    let created;
    try {
      created = await createTask(plan, tokens, taskPlan);
    } catch (error) {
      throw new CliError(`${label} create failed: ${error.message}`);
    }
    steps.push({
      label: `${label} create`,
      id: created.id,
      status: created.task_status_key,
      task_group: created.task_group,
    });
    let updated;
    try {
      updated = await urgeTask(plan, tokens, created, action);
    } catch (error) {
      throw new CliError(`${label} urge failed: ${error.message}`);
    }
    const hasUrgeMarker = Boolean(
      updated.payload?.urge_count || updated.payload?.last_urge_at,
    );
    steps.push({
      label: `${label} urge`,
      id: updated.id,
      status: updated.task_status_key,
      urge_count: hasUrgeMarker ? 1 : 0,
      notification_type: updated.payload?.notification_type || "",
    });
  };

  await run("approval", plan.tasks.approval, plan.actions.approvalDone);
  await run(
    "approval rejected",
    plan.tasks.approvalRejected,
    plan.actions.approvalRejected,
  );
  await run("quality", plan.tasks.quality, plan.actions.qualityDone);
  await run(
    "warehouse inbound",
    plan.tasks.warehouseInbound,
    plan.actions.warehouseInboundDone,
  );
  await run(
    "shipment release exception",
    plan.tasks.shipmentRelease,
    plan.actions.shipmentReleaseBlocked,
  );
  await runUrge(
    "warehouse urge",
    plan.tasks.warehouseUrge,
    plan.actions.warehouseUrged,
  );
  return steps;
}

function buildMarkdownReport(report) {
  const lines = [
    "# Mobile Workflow Simulated Closure Report",
    "",
    `- mode: ${report.mode}`,
    `- backend: ${report.plan.backendURL}`,
    `- runId: ${report.plan.runId}`,
    `- simulatedOnly: ${report.plan.simulatedOnly}`,
    `- realCustomerImport: ${report.plan.realCustomerImport}`,
    `- factPosting: ${report.plan.factPosting}`,
    `- customerAcceptanceRequiredForClosure: ${report.plan.customerAcceptanceRequiredForClosure}`,
    "",
    "## Steps",
    "",
  ];
  if (report.steps.length === 0) {
    lines.push("- report-only: no JSON-RPC writes executed");
  } else {
    for (const step of report.steps) {
      lines.push(
        `- ${step.label}: status=${step.status}${step.evidence_count ? ` evidence=${step.evidence_count}` : ""}${step.exception_reported ? " exception_reported=true" : ""}${step.urge_count ? ` urge=${step.urge_count}` : ""}${step.notification_type ? ` notification=${step.notification_type}` : ""}`,
      );
    }
  }
  lines.push(
    "",
    "## Boundary",
    "",
    "- This report is simulated mobile workflow evidence only.",
    "- It is not real customer data import and not customer sign-off.",
    "- It does not post production, shipment, inventory, reservation, or finance facts.",
  );
  return `${lines.join("\n")}\n`;
}

async function writeReports(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(
    outDir,
    "mobile-workflow-simulated-closure-report.json",
  );
  const markdownPath = path.join(
    outDir,
    "mobile-workflow-simulated-closure-report.md",
  );
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, buildMarkdownReport(report));
  return { jsonPath, markdownPath };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (options.printInputTemplate) {
    process.stdout.write(
      `${JSON.stringify(buildInputTemplate(options), null, 2)}\n`,
    );
    return;
  }
  const plan = buildPlan(options);
  const report = {
    mode: options.apply
      ? "apply-simulated-mobile-workflow-mobile-tasks"
      : "report-only",
    generatedAt: new Date().toISOString(),
    plan,
    steps: [],
  };

  if (options.apply) {
    if (process.env.MOBILE_WORKFLOW_SIM_CONFIRM !== CONFIRM_PHRASE) {
      throw new CliError(
        `apply requires MOBILE_WORKFLOW_SIM_CONFIRM=${CONFIRM_PHRASE}`,
        2,
      );
    }
    const password = optionalText(
      process.env.MOBILE_WORKFLOW_SIM_PASSWORD ||
        process.env.TRIAL_ACCOUNT_PASSWORD ||
        process.env.ERP_ROLE_DEMO_PASSWORD,
    );
    if (!password) {
      throw new CliError(
        "apply requires MOBILE_WORKFLOW_SIM_PASSWORD, TRIAL_ACCOUNT_PASSWORD, or ERP_ROLE_DEMO_PASSWORD",
        2,
      );
    }
    const tokens = await loginRoles({ backendURL: plan.backendURL, password });
    report.steps = await applyPlan(plan, tokens);
  }

  const output = await writeReports(options.out, report);
  process.stdout.write(
    `[qa:mobile-workflow-simulated-closure] ${report.mode} complete. json=${output.jsonPath} md=${output.markdownPath}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[qa:mobile-workflow-simulated-closure][fatal] ${error?.stack || error?.message || error}\n`,
    );
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  });
}

export {
  buildInputTemplate,
  buildPlan,
  buildTaskStatusActionParams,
  buildTimestampRunId,
  buildUrgeTaskParams,
  CONFIRM_PHRASE,
  INPUT_TEMPLATE_SCOPE,
  parseCliArgs,
  sanitizeRunId,
};
