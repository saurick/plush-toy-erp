#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/customers/yoyoosun/purchase-quality-simulated-matrix";
const PREFIX = "SIM-YOYOOSUN-PQ";
const CONFIRM_PHRASE = "APPLY_SIMULATED_PURCHASE_QUALITY_MATRIX";
const ROLE_USERS = Object.freeze({
  purchase: "demo_purchase",
  quality: "demo_quality",
  warehouse: "demo_warehouse",
  boss: "demo_boss",
});

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new CliError(`${name} is required`);
  return text;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(`${name} must be a positive integer`);
  }
  return parsed;
}

function safeRunId(value) {
  const normalized = requiredText(value, "runId")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!normalized || normalized.length > 32) {
    throw new CliError("runId must be 1-32 safe characters");
  }
  return normalized;
}

function timestampRunId() {
  return new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function normalizeBackendURL(value) {
  const url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) throw new CliError("backend URL must not contain credentials");
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    backendURL: process.env.PURCHASE_QUALITY_SIM_BACKEND_URL || DEFAULT_BACKEND_URL,
    out: DEFAULT_OUT_DIR,
    runId: process.env.PURCHASE_QUALITY_SIM_RUN_ID || timestampRunId(),
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
    if (!arg.startsWith("--")) throw new CliError(`unexpected argument ${arg}`, 2);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new CliError(`missing value for ${arg}`, 2);
    index += 1;
    switch (key) {
      case "backend-url": options.backendURL = value; break;
      case "out": options.out = value; break;
      case "run-id": options.runId = value; break;
      case "supplier-id": options.supplierId = positiveInt(value, arg); break;
      case "material-id": options.materialId = positiveInt(value, arg); break;
      case "unit-id": options.unitId = positiveInt(value, arg); break;
      case "warehouse-id": options.warehouseId = positiveInt(value, arg); break;
      default: throw new CliError(`unknown option ${arg}`, 2);
    }
  }
  options.backendURL = normalizeBackendURL(options.backendURL);
  options.runId = safeRunId(options.runId);
  return options;
}

export function buildPlan(options) {
  const ids = {
    supplierId: positiveInt(options.supplierId, "supplierId"),
    materialId: positiveInt(options.materialId, "materialId"),
    unitId: positiveInt(options.unitId, "unitId"),
    warehouseId: positiveInt(options.warehouseId, "warehouseId"),
  };
  const runId = safeRunId(options.runId);
  const prefix = `${PREFIX}-${runId}`;
  const orderStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELLED"];
  const receiptScenarios = [
    { key: "DRAFT", inspectionAction: "none", receiptAction: "none" },
    { key: "PASSED", inspectionAction: "pass", receiptAction: "none" },
    { key: "REJECTED", inspectionAction: "reject", receiptAction: "none" },
    { key: "POSTED", inspectionAction: "pass", receiptAction: "post" },
    { key: "CANCELLED", inspectionAction: "pass", receiptAction: "cancel" },
  ];
  return {
    scope: "purchase-quality-simulated-matrix",
    simulatedOnly: true,
    realCustomerImport: false,
    backendURL: normalizeBackendURL(options.backendURL),
    runId,
    prefix,
    ids,
    orderStatuses,
    receiptScenarios,
  };
}

async function rpcCall({ backendURL, domain, method, params = {}, token }) {
  const response = await fetch(new URL(`/rpc/${domain}`, `${backendURL}/`).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: `pq-sim-${method}-${Date.now()}`, method, params }),
  });
  if (!response.ok) throw new CliError(`${domain}.${method} HTTP ${response.status}`);
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(`${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`);
  }
  return json.result.data || {};
}

async function loginRoles(backendURL, password) {
  const entries = await Promise.all(Object.entries(ROLE_USERS).map(async ([role, username]) => {
    const data = await rpcCall({
      backendURL,
      domain: "auth",
      method: "admin_login",
      params: { username, password },
    });
    const token = data.access_token || data.token;
    if (!token) throw new CliError(`${username} login response missing token`);
    return [role, token];
  }));
  return Object.fromEntries(entries);
}

function orderParams(plan, status, index) {
  return {
    purchase_order_no: `${plan.prefix}-PO-${String(index + 1).padStart(2, "0")}-${status}`,
    supplier_id: plan.ids.supplierId,
    supplier_snapshot: { name: "模拟回归供应商", simulated_only: true },
    purchase_date: new Date().toISOString().slice(0, 10),
    expected_arrival_date: new Date(Date.now() + (index + 2) * 86400000).toISOString().slice(0, 10),
    note: `模拟采购单 ${status} 状态；非甲方真实数据。`,
    items: [{
      line_no: 1,
      material_id: plan.ids.materialId,
      unit_id: plan.ids.unitId,
      material_code_snapshot: `${plan.prefix}-MAT`,
      material_name_snapshot: "模拟短毛绒材料",
      purchased_quantity: String(20 + index * 5),
      unit_price: "3.20",
      amount: String((20 + index * 5) * 3.2),
      expected_arrival_date: new Date(Date.now() + (index + 2) * 86400000).toISOString().slice(0, 10),
    }],
  };
}

async function createOrderMatrix(plan, tokens, steps) {
  for (const [index, targetStatus] of plan.orderStatuses.entries()) {
    const created = await rpcCall({
      backendURL: plan.backendURL,
      domain: "purchase_order",
      method: "save_purchase_order_with_items",
      params: orderParams(plan, targetStatus, index),
      token: tokens.purchase,
    });
    const order = created.purchase_order;
    if (!order?.id) throw new CliError(`purchase order ${targetStatus} missing id`);
    if (["SUBMITTED", "APPROVED", "CLOSED"].includes(targetStatus)) {
      await rpcCall({ backendURL: plan.backendURL, domain: "purchase_order", method: "submit_purchase_order", params: { id: order.id }, token: tokens.purchase });
    }
    if (["APPROVED", "CLOSED"].includes(targetStatus)) {
      await rpcCall({ backendURL: plan.backendURL, domain: "purchase_order", method: "approve_purchase_order", params: { id: order.id }, token: tokens.boss });
    }
    if (targetStatus === "CLOSED") {
      await rpcCall({ backendURL: plan.backendURL, domain: "purchase_order", method: "close_purchase_order", params: { id: order.id }, token: tokens.purchase });
    }
    if (targetStatus === "CANCELLED") {
      await rpcCall({ backendURL: plan.backendURL, domain: "purchase_order", method: "cancel_purchase_order", params: { id: order.id }, token: tokens.purchase });
    }
    steps.push({ target: "purchase_order", id: order.id, expectedStatus: targetStatus });
  }
}

function receiptParams(plan, scenario, index) {
  return {
    receipt_no: `${plan.prefix}-PR-${String(index + 1).padStart(2, "0")}-${scenario.key}`,
    supplier_name: "模拟回归供应商",
    received_at: new Date().toISOString().slice(0, 10),
    items: [{
      material_id: plan.ids.materialId,
      warehouse_id: plan.ids.warehouseId,
      unit_id: plan.ids.unitId,
      lot_no: `${plan.prefix}-LOT-${String(index + 1).padStart(2, "0")}`,
      quantity: String(10 + index * 2),
      source_line_no: String(index + 1),
    }],
  };
}

async function createReceiptMatrix(plan, tokens, steps) {
  for (const [index, scenario] of plan.receiptScenarios.entries()) {
    const created = await rpcCall({
      backendURL: plan.backendURL,
      domain: "purchase",
      method: "create_purchase_receipt_with_items",
      params: receiptParams(plan, scenario, index),
      token: tokens.purchase,
    });
    const receipt = created.purchase_receipt;
    const inspection = receipt?.quality_inspections?.[0];
    if (!receipt?.id || !inspection?.id) throw new CliError(`receipt scenario ${scenario.key} missing receipt or inspection id`);
    if (scenario.inspectionAction === "pass") {
      await rpcCall({
        backendURL: plan.backendURL,
        domain: "quality",
        method: "pass_quality_inspection",
        params: { id: inspection.id, result: index % 2 === 0 ? "PASS" : "CONCESSION", inspected_at: new Date().toISOString().slice(0, 10), decision_note: "模拟检验通过；非真实质检结论。" },
        token: tokens.quality,
      });
    } else if (scenario.inspectionAction === "reject") {
      await rpcCall({
        backendURL: plan.backendURL,
        domain: "quality",
        method: "reject_quality_inspection",
        params: { id: inspection.id, result: "REJECT", inspected_at: new Date().toISOString().slice(0, 10), decision_note: "模拟尺寸偏差拒收；非真实质检结论。" },
        token: tokens.quality,
      });
    }
    if (scenario.receiptAction === "post" || scenario.receiptAction === "cancel") {
      await rpcCall({ backendURL: plan.backendURL, domain: "purchase", method: "post_purchase_receipt", params: { id: receipt.id }, token: tokens.warehouse });
    }
    if (scenario.receiptAction === "cancel") {
      await rpcCall({ backendURL: plan.backendURL, domain: "purchase", method: "cancel_purchase_receipt", params: { id: receipt.id }, token: tokens.warehouse });
    }
    steps.push({
      target: "purchase_receipt_quality",
      receiptId: receipt.id,
      inspectionId: inspection.id,
      scenario: scenario.key,
    });
  }
}

export async function applyPlan(plan, password) {
  const tokens = await loginRoles(plan.backendURL, requiredText(password, "PURCHASE_QUALITY_SIM_PASSWORD"));
  const steps = [];
  await createOrderMatrix(plan, tokens, steps);
  await createReceiptMatrix(plan, tokens, steps);
  return steps;
}

function usage() {
  return `Purchase / quality simulated matrix\n\nReport-only:\n  node scripts/qa/purchase-quality-simulated-matrix.mjs --supplier-id <id> --material-id <id> --unit-id <id> --warehouse-id <id>\n\nApply:\n  PURCHASE_QUALITY_SIM_CONFIRM=${CONFIRM_PHRASE} PURCHASE_QUALITY_SIM_PASSWORD='<demo-password>' node scripts/qa/purchase-quality-simulated-matrix.mjs --apply --backend-url http://127.0.0.1:8300 --supplier-id <id> --material-id <id> --unit-id <id> --warehouse-id <id>\n\nAll records use ${PREFIX}; they are simulated manual-regression data, never real customer import.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const plan = buildPlan(options);
  if (options.apply && process.env.PURCHASE_QUALITY_SIM_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(`apply requires PURCHASE_QUALITY_SIM_CONFIRM=${CONFIRM_PHRASE}`);
  }
  const steps = options.apply
    ? await applyPlan(plan, process.env.PURCHASE_QUALITY_SIM_PASSWORD || process.env.TRIAL_ACCOUNT_PASSWORD || process.env.ERP_ROLE_DEMO_PASSWORD)
    : [];
  const report = { mode: options.apply ? "apply" : "report-only", generatedAt: new Date().toISOString(), plan, steps };
  await mkdir(options.out, { recursive: true });
  await writeFile(path.join(options.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  });
}

