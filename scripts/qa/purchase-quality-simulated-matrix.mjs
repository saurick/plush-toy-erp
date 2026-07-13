#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR =
  "output/customers/yoyoosun/purchase-quality-simulated-matrix";
const PREFIX = "SIM-YOYOOSUN-PQ";
const CONFIRM_PHRASE = "APPLY_SIMULATED_PURCHASE_QUALITY_MATRIX";
const CUSTOMER_KEY = "yoyoosun";
const ADMIN_USERNAME = "admin";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_ENVIRONMENTS = new Set(["local", "dev"]);
const REQUIRED_PURCHASE_QUALITY_MODULES = Object.freeze([
  "purchase_orders",
  "purchase_receipts",
  "quality_inspections",
  "inventory",
]);
const RECEIPT_SCENARIO_CODES = Object.freeze({
  DRAFT: "DRA",
  SUBMITTED: "SUB",
  PASSED_POSTED: "PAS",
  REJECTED: "REJ",
  INSPECTION_CANCELLED: "QCN",
  RECEIPT_CANCELLED: "RCN",
});
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
  return new Date()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function normalizeBackendURL(value) {
  const url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password)
    throw new CliError("backend URL must not contain credentials");
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new CliError("backend URL must use http or https", 2);
  }
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new CliError(
      `refuse external backend ${url.origin}; purchase/quality simulated writes are local-only`,
      2,
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    backendURL:
      process.env.PURCHASE_QUALITY_SIM_BACKEND_URL || DEFAULT_BACKEND_URL,
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
    if (!arg.startsWith("--"))
      throw new CliError(`unexpected argument ${arg}`, 2);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new CliError(`missing value for ${arg}`, 2);
    index += 1;
    switch (key) {
      case "backend-url":
        options.backendURL = value;
        break;
      case "out":
        options.out = value;
        break;
      case "run-id":
        options.runId = value;
        break;
      case "supplier-id":
        options.supplierId = positiveInt(value, arg);
        break;
      case "supplier-name":
        options.supplierName = requiredText(value, arg);
        break;
      case "material-id":
        options.materialId = positiveInt(value, arg);
        break;
      case "material-name":
        options.materialName = requiredText(value, arg);
        break;
      case "unit-id":
        options.unitId = positiveInt(value, arg);
        break;
      case "warehouse-id":
        options.warehouseId = positiveInt(value, arg);
        break;
      default:
        throw new CliError(`unknown option ${arg}`, 2);
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
  const orderStatuses = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "CLOSED",
    "CANCELED",
  ];
  const receiptScenarios = [
    { key: "DRAFT", inspectionAction: "none", receiptAction: "none" },
    { key: "SUBMITTED", inspectionAction: "none", receiptAction: "none" },
    { key: "PASSED_POSTED", inspectionAction: "pass", receiptAction: "post" },
    { key: "REJECTED", inspectionAction: "reject", receiptAction: "none" },
    {
      key: "INSPECTION_CANCELLED",
      inspectionAction: "cancel",
      receiptAction: "none",
    },
    {
      key: "RECEIPT_CANCELLED",
      inspectionAction: "pass",
      receiptAction: "cancel",
    },
  ];
  return {
    scope: "purchase-quality-simulated-matrix",
    simulatedOnly: true,
    realCustomerImport: false,
    backendURL: normalizeBackendURL(options.backendURL),
    runId,
    prefix,
    ids,
    names: {
      supplier: String(options.supplierName || "【试用】模拟采购供应商").trim(),
      material: String(options.materialName || "【试用】模拟短毛绒材料").trim(),
    },
    orderStatuses,
    receiptScenarios,
  };
}

async function rpcCall({
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
        id: `pq-sim-${method}-${Date.now()}`,
        method,
        params:
          domain === "auth"
            ? params
            : { customer_key: CUSTOMER_KEY, ...params },
      }),
    },
  );
  if (response.redirected === true) {
    throw new CliError(`${domain}.${method} refused a redirected response`);
  }
  if (!response.ok)
    throw new CliError(`${domain}.${method} HTTP ${response.status}`);
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

function requireMutationRecord(data, key, method, expectedStatus) {
  const item = data?.[key];
  if (!item?.id) {
    throw new CliError(`${method} response missing ${key}.id`);
  }
  const status = String(item.status || item.lifecycle_status || "")
    .trim()
    .toUpperCase();
  if (!status) {
    throw new CliError(`${method} response missing ${key} status`);
  }
  if (expectedStatus && status !== expectedStatus) {
    throw new CliError(`${method} expected ${expectedStatus}, got ${status}`);
  }
  return { item, status };
}

async function loginAccount(backendURL, username, password, fetchImpl) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  const token = data.access_token || data.token;
  if (!token) throw new CliError(`${username} login response missing token`);
  return token;
}

async function loginRoles(backendURL, password, fetchImpl) {
  const entries = [];
  for (const [role, username] of Object.entries(ROLE_USERS)) {
    entries.push([
      role,
      await loginAccount(backendURL, username, password, fetchImpl),
    ]);
  }
  return Object.fromEntries(entries);
}

function reusableAuthSession(deps, backendURL) {
  const session = deps.authSession;
  if (session == null) return null;
  if (typeof session !== "object" || Array.isArray(session)) {
    throw new CliError("authSession must be a mutable object");
  }
  if (session.backendURL && session.backendURL !== backendURL) {
    throw new CliError("authSession backend does not match the apply backend");
  }
  return session;
}

async function assertSafeRuntime({
  backendURL,
  tokens,
  adminToken,
  fetchImpl,
}) {
  const capabilities = await rpcCall({
    backendURL,
    domain: "debug",
    method: "capabilities",
    token: adminToken,
    fetchImpl,
  });
  if (!SAFE_ENVIRONMENTS.has(capabilities.environment)) {
    throw new CliError(
      `refuse purchase/quality simulated writes in environment=${capabilities.environment || "unknown"}`,
    );
  }

  const data = await rpcCall({
    backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: tokens.purchase,
    fetchImpl,
  });
  const session = data.session || {};
  const configRevision = String(
    session.configRevision || session.config_revision || "",
  ).trim();
  if (
    session?.customer?.key !== CUSTOMER_KEY ||
    session.source !== "active_customer_config_revision" ||
    !configRevision
  ) {
    throw new CliError(
      "refuse purchase/quality simulated writes: yoyoosun active customer configuration is not current",
    );
  }
  const modules = session.modules || {};
  const unavailableModules = REQUIRED_PURCHASE_QUALITY_MODULES.filter(
    (key) => modules[key] !== "enabled",
  );
  if (unavailableModules.length > 0) {
    throw new CliError(
      `refuse purchase/quality simulated writes: required modules are not enabled: ${unavailableModules.join(", ")}`,
    );
  }
}

async function assertPurchaseQualityRunIsEmpty({
  backendURL,
  prefix,
  tokens,
  fetchImpl,
}) {
  const probes = [
    ["purchase", "purchase_order", "list_purchase_orders", "purchase_orders"],
    ["purchase", "purchase", "list_purchase_receipts", "purchase_receipts"],
  ];
  for (const [role, domain, method, listKey] of probes) {
    const data = await rpcCall({
      backendURL,
      domain,
      method,
      params: { keyword: prefix, limit: 1, offset: 0 },
      token: tokens[role],
      fetchImpl,
    });
    const rows = Array.isArray(data[listKey]) ? data[listKey] : [];
    const total = Number.isInteger(data.total) ? data.total : rows.length;
    if (total > 0) {
      throw new CliError(
        `run ${prefix} already contains purchase or quality records; use a new runId`,
      );
    }
  }
}

function orderParams(plan, status, index) {
  const labels = {
    DRAFT: "草稿待补充",
    SUBMITTED: "已提交待审批",
    APPROVED: "已审批待到货",
    CLOSED: "已关闭",
    CANCELED: "已取消",
  };
  return {
    purchase_order_no: `${plan.prefix}-PO-${String(index + 1).padStart(2, "0")}-${status}`,
    supplier_id: plan.ids.supplierId,
    supplier_snapshot: {
      name: plan.names.supplier,
      simulated_only: true,
    },
    purchase_date: new Date().toISOString().slice(0, 10),
    expected_arrival_date: new Date(Date.now() + (index + 2) * 86400000)
      .toISOString()
      .slice(0, 10),
    note: `【试用】采购订单-${labels[status]}；模拟试用数据，请勿用于正式业务。`,
    items: [
      {
        line_no: 1,
        material_id: plan.ids.materialId,
        unit_id: plan.ids.unitId,
        material_code_snapshot: `${plan.prefix}-MAT`,
        material_name_snapshot: plan.names.material,
        purchased_quantity: String(20 + index * 5),
        unit_price: "3.20",
        amount: String((20 + index * 5) * 3.2),
        expected_arrival_date: new Date(Date.now() + (index + 2) * 86400000)
          .toISOString()
          .slice(0, 10),
      },
    ],
  };
}

async function createOrderMatrix(plan, tokens, steps, fetchImpl) {
  const orders = [];
  for (const [index, targetStatus] of plan.orderStatuses.entries()) {
    const created = await rpcCall({
      backendURL: plan.backendURL,
      domain: "purchase_order",
      method: "save_purchase_order_with_items",
      params: orderParams(plan, targetStatus, index),
      token: tokens.purchase,
      fetchImpl,
    });
    const createdOrder = requireMutationRecord(
      created,
      "purchase_order",
      "save_purchase_order_with_items",
      "DRAFT",
    );
    const order = createdOrder.item;
    const orderItems = created.purchase_order_items;
    if (!Array.isArray(orderItems) || !orderItems[0]?.id) {
      throw new CliError(
        "save_purchase_order_with_items response missing purchase_order_items",
      );
    }
    let actualStatus = createdOrder.status;
    if (["SUBMITTED", "APPROVED", "CLOSED"].includes(targetStatus)) {
      const submitted = await rpcCall({
        backendURL: plan.backendURL,
        domain: "purchase_order",
        method: "submit_purchase_order",
        params: { id: order.id },
        token: tokens.purchase,
        fetchImpl,
      });
      actualStatus = requireMutationRecord(
        submitted,
        "purchase_order",
        "submit_purchase_order",
        "SUBMITTED",
      ).status;
    }
    if (["APPROVED", "CLOSED"].includes(targetStatus)) {
      const approved = await rpcCall({
        backendURL: plan.backendURL,
        domain: "purchase_order",
        method: "approve_purchase_order",
        params: { id: order.id },
        token: tokens.boss,
        fetchImpl,
      });
      actualStatus = requireMutationRecord(
        approved,
        "purchase_order",
        "approve_purchase_order",
        "APPROVED",
      ).status;
    }
    if (targetStatus === "CLOSED") {
      const closed = await rpcCall({
        backendURL: plan.backendURL,
        domain: "purchase_order",
        method: "close_purchase_order",
        params: { id: order.id },
        token: tokens.purchase,
        fetchImpl,
      });
      actualStatus = requireMutationRecord(
        closed,
        "purchase_order",
        "close_purchase_order",
        "CLOSED",
      ).status;
    }
    if (targetStatus === "CANCELED") {
      const canceled = await rpcCall({
        backendURL: plan.backendURL,
        domain: "purchase_order",
        method: "cancel_purchase_order",
        params: { id: order.id },
        token: tokens.purchase,
        fetchImpl,
      });
      actualStatus = requireMutationRecord(
        canceled,
        "purchase_order",
        "cancel_purchase_order",
        "CANCELED",
      ).status;
    }
    steps.push({
      target: "purchase_order",
      id: order.id,
      expectedStatus: targetStatus,
      actualStatus,
    });
    orders.push({ targetStatus, order, items: orderItems });
  }
  return orders;
}

function scenarioDate(index) {
  const offsets = [-30, -14, -7, -3, -1, 0];
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsets[index]);
  return value.toISOString().slice(0, 10);
}

function receiptParams(plan, scenario, index) {
  const labels = {
    DRAFT: "草稿待检",
    SUBMITTED: "已提交待判定",
    PASSED_POSTED: "质检通过并已入库",
    REJECTED: "质检拒收",
    INSPECTION_CANCELLED: "质检已取消",
    RECEIPT_CANCELLED: "入库已取消并冲回",
  };
  return {
    receipt_no: `${plan.prefix}-PR-${String(index + 1).padStart(2, "0")}-${RECEIPT_SCENARIO_CODES[scenario.key]}`,
    supplier_name: plan.names.supplier,
    received_at: scenarioDate(index),
    items: [
      {
        material_id: plan.ids.materialId,
        warehouse_id: plan.ids.warehouseId,
        unit_id: plan.ids.unitId,
        lot_no: `${plan.prefix}-LOT-${String(index + 1).padStart(2, "0")}`,
        quantity: String(10 + index * 2),
        source_line_no: String(index + 1),
        note: `【试用】采购入库-${labels[scenario.key]}`,
      },
    ],
  };
}

function linkedReceiptParams(plan, scenario, index, approvedOrder) {
  return {
    purchase_order_id: approvedOrder.order.id,
    receipt_no: `${plan.prefix}-PR-${String(index + 1).padStart(2, "0")}-${RECEIPT_SCENARIO_CODES[scenario.key]}`,
    warehouse_id: plan.ids.warehouseId,
    received_at: scenarioDate(index),
    note: "【试用】从已审批采购订单生成，核对来源订单和来源行。",
  };
}

async function createReceiptMatrix(plan, tokens, steps, fetchImpl, orders) {
  const approvedOrder = orders.find((item) => item.targetStatus === "APPROVED");
  if (!approvedOrder?.order?.id || !approvedOrder.items?.[0]?.id) {
    throw new CliError(
      "approved purchase order is missing persisted line references",
    );
  }
  for (const [index, scenario] of plan.receiptScenarios.entries()) {
    const linkedToPurchaseOrder = scenario.key === "PASSED_POSTED";
    const created = await rpcCall({
      backendURL: plan.backendURL,
      domain: "purchase",
      method: linkedToPurchaseOrder
        ? "create_purchase_receipt_from_purchase_order"
        : "create_purchase_receipt_with_items",
      params: linkedToPurchaseOrder
        ? linkedReceiptParams(plan, scenario, index, approvedOrder)
        : receiptParams(plan, scenario, index),
      token: tokens.purchase,
      fetchImpl,
    });
    const createdReceipt = requireMutationRecord(
      created,
      "purchase_receipt",
      linkedToPurchaseOrder
        ? "create_purchase_receipt_from_purchase_order"
        : "create_purchase_receipt_with_items",
      "DRAFT",
    );
    const receipt = createdReceipt.item;
    const autoInspection = receipt?.quality_inspections?.[0];
    if (!receipt?.id || !autoInspection?.id)
      throw new CliError(
        `receipt scenario ${scenario.key} missing receipt or inspection id`,
      );
    const receiptItem = receipt.items?.[0];
    const lotId = Number(
      receiptItem?.inventory_lot_id ||
        receiptItem?.lot_id ||
        autoInspection.inventory_lot_id,
    );
    if (!receiptItem?.id || !Number.isSafeInteger(lotId) || lotId <= 0) {
      throw new CliError(
        "receipt-created quality inspection is missing its receipt line or lot reference",
      );
    }
    if (linkedToPurchaseOrder) {
      if (receiptItem.purchase_order_item_id !== approvedOrder.items[0].id) {
        throw new CliError(
          "linked purchase receipt response is missing its purchase order line",
        );
      }
    }
    let receiptStatus = createdReceipt.status;
    let inspection = autoInspection;
    let inspectionStatus = String(autoInspection.status || "").toUpperCase();
    if (inspectionStatus !== "SUBMITTED") {
      throw new CliError(
        `receipt-created quality inspection expected SUBMITTED, got ${inspectionStatus || "missing"}`,
      );
    }
    if (scenario.key === "DRAFT") {
      const drafted = await rpcCall({
        backendURL: plan.backendURL,
        domain: "quality",
        method: "create_quality_inspection_draft",
        params: {
          inspection_no: `${plan.prefix}-QI-01-DRAFT`,
          purchase_receipt_id: receipt.id,
          purchase_receipt_item_id: receiptItem.id,
          inventory_lot_id: lotId,
          material_id: plan.ids.materialId,
          warehouse_id: plan.ids.warehouseId,
          decision_note: "【试用】保留草稿，供试用人员核对未提交质检记录。",
        },
        token: tokens.quality,
        fetchImpl,
      });
      const draftedInspection = requireMutationRecord(
        drafted,
        "quality_inspection",
        "create_quality_inspection_draft",
        "DRAFT",
      );
      inspection = draftedInspection.item;
      inspectionStatus = draftedInspection.status;
    }
    if (scenario.inspectionAction === "pass") {
      const passed = await rpcCall({
        backendURL: plan.backendURL,
        domain: "quality",
        method: "pass_quality_inspection",
        params: {
          id: inspection.id,
          result: index % 2 === 0 ? "PASS" : "CONCESSION",
          inspected_at: scenarioDate(index),
          decision_note:
            "【试用】检验通过或让步接收；模拟试用记录，请勿作为正式质检结论。",
        },
        token: tokens.quality,
        fetchImpl,
      });
      inspectionStatus = requireMutationRecord(
        passed,
        "quality_inspection",
        "pass_quality_inspection",
        "PASSED",
      ).status;
    } else if (scenario.inspectionAction === "reject") {
      const rejected = await rpcCall({
        backendURL: plan.backendURL,
        domain: "quality",
        method: "reject_quality_inspection",
        params: {
          id: inspection.id,
          result: "REJECT",
          inspected_at: scenarioDate(index),
          decision_note:
            "【试用】尺寸偏差，执行拒收；模拟试用记录，请勿作为正式质检结论。",
        },
        token: tokens.quality,
        fetchImpl,
      });
      inspectionStatus = requireMutationRecord(
        rejected,
        "quality_inspection",
        "reject_quality_inspection",
        "REJECTED",
      ).status;
    } else if (scenario.inspectionAction === "cancel") {
      const canceled = await rpcCall({
        backendURL: plan.backendURL,
        domain: "quality",
        method: "cancel_quality_inspection",
        params: {
          id: inspection.id,
          decision_note:
            "【试用】本次质检记录取消，保留原批次状态供后续重新安排。",
        },
        token: tokens.quality,
        fetchImpl,
      });
      inspectionStatus = requireMutationRecord(
        canceled,
        "quality_inspection",
        "cancel_quality_inspection",
        "CANCELLED",
      ).status;
    }
    if (
      scenario.receiptAction === "post" ||
      scenario.receiptAction === "cancel"
    ) {
      const posted = await rpcCall({
        backendURL: plan.backendURL,
        domain: "purchase",
        method: "post_purchase_receipt",
        params: { id: receipt.id },
        token: tokens.warehouse,
        fetchImpl,
      });
      receiptStatus = requireMutationRecord(
        posted,
        "purchase_receipt",
        "post_purchase_receipt",
        "POSTED",
      ).status;
    }
    if (scenario.receiptAction === "cancel") {
      const canceled = await rpcCall({
        backendURL: plan.backendURL,
        domain: "purchase",
        method: "cancel_purchase_receipt",
        params: { id: receipt.id },
        token: tokens.warehouse,
        fetchImpl,
      });
      receiptStatus = requireMutationRecord(
        canceled,
        "purchase_receipt",
        "cancel_purchase_receipt",
        "CANCELLED",
      ).status;
    }
    steps.push({
      target: "purchase_receipt_quality",
      receiptId: receipt.id,
      lotId,
      inspectionId: inspection.id,
      autoInspectionId: autoInspection.id,
      scenario: scenario.key,
      linkedToPurchaseOrder,
      purchaseOrderId: linkedToPurchaseOrder ? approvedOrder.order.id : null,
      purchaseOrderItemId: linkedToPurchaseOrder
        ? approvedOrder.items[0].id
        : null,
      receiptStatus,
      inspectionStatus,
    });
  }
}

export async function applyPlan(plan, password, deps = {}) {
  const backendURL = normalizeBackendURL(plan?.backendURL);
  const safePlan = { ...plan, backendURL };
  const fetchImpl = deps.fetchImpl || fetch;
  const rolePassword = requiredText(password, "PURCHASE_QUALITY_SIM_PASSWORD");
  const adminPassword = requiredText(
    deps.adminPassword,
    "PURCHASE_QUALITY_SIM_ADMIN_PASSWORD",
  );
  const authSession = reusableAuthSession(deps, backendURL);
  let adminToken = authSession?.adminToken;
  let tokens = authSession?.tokens;
  if (!adminToken || !tokens) {
    adminToken = await loginAccount(
      backendURL,
      ADMIN_USERNAME,
      adminPassword,
      fetchImpl,
    );
    tokens = await loginRoles(backendURL, rolePassword, fetchImpl);
    if (authSession) {
      authSession.backendURL = backendURL;
      authSession.adminToken = adminToken;
      authSession.tokens = tokens;
    }
  }
  requiredText(adminToken, "authSession.adminToken");
  for (const role of Object.keys(ROLE_USERS)) {
    requiredText(tokens?.[role], `authSession.tokens.${role}`);
  }
  await assertSafeRuntime({ backendURL, tokens, adminToken, fetchImpl });
  await assertPurchaseQualityRunIsEmpty({
    backendURL,
    prefix: safePlan.prefix,
    tokens,
    fetchImpl,
  });
  const steps = [];
  const orders = await createOrderMatrix(safePlan, tokens, steps, fetchImpl);
  await createReceiptMatrix(safePlan, tokens, steps, fetchImpl, orders);
  return steps;
}

function usage() {
  return `Purchase / quality simulated matrix\n\nReport-only:\n  node scripts/qa/purchase-quality-simulated-matrix.mjs --supplier-id <id> --material-id <id> --unit-id <id> --warehouse-id <id>\n\nApply:\n  PURCHASE_QUALITY_SIM_CONFIRM=${CONFIRM_PHRASE} PURCHASE_QUALITY_SIM_ADMIN_PASSWORD='<local-admin-password>' PURCHASE_QUALITY_SIM_PASSWORD='<demo-password>' node scripts/qa/purchase-quality-simulated-matrix.mjs --apply --backend-url http://127.0.0.1:8300 --supplier-id <id> --material-id <id> --unit-id <id> --warehouse-id <id>\n\nThe local admin account is used only for debug.capabilities; role demo accounts perform business actions. All records use ${PREFIX}; they are simulated manual-regression data, never real customer import.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const plan = buildPlan(options);
  if (
    options.apply &&
    process.env.PURCHASE_QUALITY_SIM_CONFIRM !== CONFIRM_PHRASE
  ) {
    throw new CliError(
      `apply requires PURCHASE_QUALITY_SIM_CONFIRM=${CONFIRM_PHRASE}`,
    );
  }
  let steps = [];
  if (options.apply) {
    const adminPassword = String(
      process.env.PURCHASE_QUALITY_SIM_ADMIN_PASSWORD || "",
    ).trim();
    if (!adminPassword) {
      throw new CliError(
        "apply requires PURCHASE_QUALITY_SIM_ADMIN_PASSWORD",
        2,
      );
    }
    steps = await applyPlan(
      plan,
      process.env.PURCHASE_QUALITY_SIM_PASSWORD ||
        process.env.TRIAL_ACCOUNT_PASSWORD ||
        process.env.ERP_ROLE_DEMO_PASSWORD,
      { adminPassword },
    );
  }
  const report = {
    mode: options.apply ? "apply" : "report-only",
    generatedAt: new Date().toISOString(),
    plan,
    steps,
  };
  await mkdir(options.out, { recursive: true });
  await writeFile(
    path.join(options.out, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  });
}
