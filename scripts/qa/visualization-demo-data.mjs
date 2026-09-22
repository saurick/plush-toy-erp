#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  SCENARIO_DEMO_ORIGIN,
} from "./manual-acceptance-target-policy.mjs";
import { PERSISTENT_SCENARIO_DATASET_TARGET } from "./manual-acceptance-dataset.mjs";
import {
  resolveLocalScenarioDemoCredentials,
  runScenarioDemoCli,
} from "./scenario-demo-data.mjs";
import { manualAcceptanceFactRPCCall } from "./manual-acceptance-fact-data.mjs";

export const VISUALIZATION_DEMO_SCHEMA_VERSION =
  "plush.visualization-demo-data/v1";
export const VISUALIZATION_DEMO_RUN_ID_PATTERN = /^VIS-(\d{8})$/u;
export const VISUALIZATION_DEMO_RPC_METHODS = Object.freeze([
  "auth.admin_login",
  "sales_order.list_sales_orders",
  "sales_order.list_sales_order_items",
  "sales_order.list_sales_order_summary",
  "sales_order.save_sales_order_with_items",
  "purchase_order.list_purchase_orders",
  "purchase_order.list_purchase_order_items",
  "purchase_order.save_purchase_order_with_items",
  "production_order.create_production_order",
  "production_order.get_production_order",
  "production_order.list_production_orders",
  "production_order.release_production_order",
  "production_wip.get_production_wip",
  "operational_fact.list_finance_facts",
  "inventory.list_inventory_balances",
  "workflow.list_tasks",
]);

const CUSTOMER_KEY = "yoyoosun";
const APPLY_CONFIRM_PREFIX = "APPLY_VISUALIZATION_DEMO";
const SIMULATED_NOTE = "可视化测试模拟数据，不代表客户真实业务。";
const DEFAULT_OUTPUT_ROOT = "output/qa/visualization-demo";
const DEFAULT_SOURCE_REPORT = path.join(
  "output",
  "qa",
  "manual-acceptance",
  "datasets",
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  PERSISTENT_SCENARIO_DATASET_TARGET,
  "source",
  "apply-report.json",
);

export class VisualizationDemoError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "VisualizationDemoError";
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

export function visualizationDemoDigest(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function assertDateKey(value, field = "date") {
  const text = String(value || "").trim();
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(text)) {
    throw new VisualizationDemoError(`${field} must use YYYY-MM-DD`, 2);
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    throw new VisualizationDemoError(`${field} is not a valid date`, 2);
  }
  return text;
}

function addDays(dateKey, days) {
  const value = new Date(`${assertDateKey(dateKey)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function unixDate(dateKey) {
  return Math.floor(Date.parse(`${assertDateKey(dateKey)}T08:00:00Z`) / 1000);
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined),
  );
}

function requiredArray(value, field, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new VisualizationDemoError(
      `${field} requires at least ${minimum} records`,
      2,
    );
  }
  return value;
}

function requiredPositiveInt(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new VisualizationDemoError(`${field} must be a positive integer`, 2);
  }
  return number;
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new VisualizationDemoError(`${field} is required`, 2);
  return text;
}

function expectedRunID(anchorDate) {
  return `VIS-${anchorDate.replaceAll("-", "")}`;
}

function resolveRunIdentity({ anchorDate, runId }) {
  const date = assertDateKey(anchorDate, "anchorDate");
  const resolvedRunID = String(runId || expectedRunID(date)).trim();
  const match = VISUALIZATION_DEMO_RUN_ID_PATTERN.exec(resolvedRunID);
  if (!match || match[1] !== date.replaceAll("-", "")) {
    throw new VisualizationDemoError(
      "runId must be VIS-YYYYMMDD and match anchorDate",
      2,
    );
  }
  return {
    anchorDate: date,
    runId: resolvedRunID,
    visiblePrefix: `VIS-${date.slice(2).replaceAll("-", "")}`,
  };
}

function sourceIdentity(sourceReport) {
  if (
    sourceReport?.datasetKey !== MANUAL_ACCEPTANCE_DATASET_KEY ||
    sourceReport?.dataVersion !== CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION ||
    sourceReport?.runId !== CURRENT_MANUAL_ACCEPTANCE_RUN_ID ||
    sourceReport?.target !== PERSISTENT_SCENARIO_DATASET_TARGET ||
    sourceReport?.mode !== "apply"
  ) {
    throw new VisualizationDemoError(
      "visualization data requires the current scenario-demo source apply report",
      2,
    );
  }
  const refs = sourceReport.referenceRecords || {};
  const facts = refs.sourceDrivenFacts?.sourceCandidates || {};
  return {
    customers: requiredArray(refs.customers, "referenceRecords.customers"),
    suppliers: requiredArray(refs.suppliers, "referenceRecords.suppliers"),
    products: requiredArray(refs.products, "referenceRecords.products"),
    skus: requiredArray(refs.skus, "referenceRecords.skus"),
    materials: requiredArray(refs.materials, "referenceRecords.materials"),
    productionCandidates: requiredArray(
      facts.productionCandidates,
      "sourceDrivenFacts.productionCandidates",
      5,
    ),
  };
}

function salesScenario({ identity, prefix, index, label, deliveryOffset }) {
  const customer = identity.customers[(index - 1) % identity.customers.length];
  const product = identity.products[(index - 1) % identity.products.length];
  const sku =
    identity.skus.find(
      (item) => Number(item.productId) === Number(product.id),
    ) || identity.skus[0];
  const deliveryDate =
    deliveryOffset === null
      ? undefined
      : addDays(identity.anchorDate, deliveryOffset);
  const quantity = 200 + index * 40;
  return {
    key: label,
    expectedRisk: label,
    orderNo: `${prefix}-XS-${String(index).padStart(2, "0")}`,
    params: compact({
      order_no: `${prefix}-XS-${String(index).padStart(2, "0")}`,
      customer_id: requiredPositiveInt(customer.id, "customer.id"),
      customer_order_no: `${prefix.replaceAll("-", "")}${String(index).padStart(2, "0")}`,
      customer_snapshot: {
        code: customer.code,
        name: requiredText(customer.name, "customer.name"),
        simulated_only: true,
      },
      sales_owner: ["小陈", "小李", "小周", "小林", "小何"][index - 1],
      payment_method: "银行转账",
      payment_term_days: 30,
      currency: "CNY",
      tax_mode: "INCLUSIVE",
      tax_rate: "13",
      freight_terms: "EXCLUDED",
      quoted_freight_amount: "0",
      price_condition_note: "含税，运费另计",
      order_date: addDays(identity.anchorDate, -10 - index),
      planned_delivery_date: deliveryDate,
      note: `${SIMULATED_NOTE}${label}交期样本。`,
      items: [
        compact({
          line_no: 1,
          product_id: requiredPositiveInt(product.id, "product.id"),
          product_sku_id: requiredPositiveInt(sku.id, "sku.id"),
          unit_id: requiredPositiveInt(product.unitId, "product.unitId"),
          requested_product_name: product.name,
          customer_product_no: `${prefix}-KH-${String(index).padStart(2, "0")}`,
          order_category: "NEW",
          product_code_snapshot: product.code,
          product_name_snapshot: product.name,
          ordered_quantity: String(quantity),
          unit_price: "20",
          amount: String(quantity * 20),
          planned_delivery_date: deliveryDate,
          note: `${label}交期可视化样本`,
        }),
      ],
    }),
  };
}

function purchaseScenario({
  identity,
  prefix,
  index,
  label,
  arrivalOffset,
  confirmed,
}) {
  const supplier = identity.suppliers[(index - 1) % identity.suppliers.length];
  const material = identity.materials[(index - 1) % identity.materials.length];
  const arrivalDate =
    arrivalOffset === null
      ? undefined
      : addDays(identity.anchorDate, arrivalOffset);
  const quantity = 500 + index * 50;
  return {
    key: label,
    expectedRisk: label,
    orderNo: `${prefix}-CG-${String(index).padStart(2, "0")}`,
    params: compact({
      purchase_order_no: `${prefix}-CG-${String(index).padStart(2, "0")}`,
      supplier_id: requiredPositiveInt(supplier.id, "supplier.id"),
      supplier_purchase_order_no: `${prefix.replaceAll("-", "")}CG${String(index).padStart(2, "0")}`,
      supplier_snapshot: {
        code: supplier.code,
        name: requiredText(supplier.name, "supplier.name"),
        simulated_only: true,
      },
      contract_party_snapshot: {
        buyerCompany: "永绅演示工厂",
        buyerContact: "采购部",
        simulated_only: true,
      },
      currency: "CNY",
      payment_method: "银行转账",
      payment_term_days: 30,
      invoice_required: true,
      invoice_category: "VAT_SPECIAL_13",
      purchase_date: addDays(identity.anchorDate, -9 - index),
      expected_arrival_date: arrivalDate,
      supplier_confirmed_arrival_date: confirmed ? arrivalDate : undefined,
      delivery_address: "模拟工业区收货路 1 号",
      note: `${SIMULATED_NOTE}${label}到货样本。`,
      items: [
        compact({
          line_no: 1,
          material_id: requiredPositiveInt(material.id, "material.id"),
          unit_id: requiredPositiveInt(material.unitId, "material.unitId"),
          material_code_snapshot: material.code,
          material_name_snapshot: material.name,
          purchased_quantity: String(quantity),
          unit_price: "3.2",
          amount: String(quantity * 3.2),
          expected_arrival_date: arrivalDate,
          note: `${label}到货可视化样本`,
        }),
      ],
    }),
  };
}

function productionItem(candidate, lineNo, { routed }) {
  const item = candidate.item || {};
  const bom = candidate.bom || {};
  return compact({
    line_no: lineNo,
    product_id: requiredPositiveInt(
      item.productId,
      "production item.productId",
    ),
    product_sku_id: requiredPositiveInt(
      item.productSkuId,
      "production item.productSkuId",
    ),
    unit_id: requiredPositiveInt(item.unitId, "production item.unitId"),
    planned_quantity: String(20 + lineNo * 10),
    bom_header_id: routed
      ? requiredPositiveInt(bom.id, "production item.bom.id")
      : undefined,
    route_code: routed ? "PLUSH_SEW_HAND_V1" : undefined,
    customer_inspection_required: routed ? lineNo % 2 === 0 : false,
    note: routed ? `产品行 ${lineNo}，完整工序路线` : "生产计划可视化样本",
  });
}

function productionScenario({
  identity,
  prefix,
  index,
  label,
  startOffset,
  endOffset,
  release,
  routed,
}) {
  const plannedStart =
    startOffset === null
      ? undefined
      : unixDate(addDays(identity.anchorDate, startOffset));
  const plannedEnd =
    endOffset === null
      ? undefined
      : unixDate(addDays(identity.anchorDate, endOffset));
  const candidates = routed
    ? identity.productionCandidates.slice(0, 5)
    : [
        identity.productionCandidates[
          (index - 1) % identity.productionCandidates.length
        ],
      ];
  const orderNo = `${prefix}-SC-${String(index).padStart(2, "0")}`;
  return {
    key: label,
    expectedStatus: release ? "RELEASED" : "DRAFT",
    orderNo,
    release,
    routed,
    params: compact({
      order_no: orderNo,
      planned_start_at: plannedStart,
      planned_end_at: plannedEnd,
      note: routed
        ? `${SIMULATED_NOTE}五个产品行，用于生产工序总览。`
        : `${SIMULATED_NOTE}${label}生产计划样本。`,
      items: candidates.map((candidate, offset) =>
        productionItem(candidate, offset + 1, { routed }),
      ),
      idempotency_key: `visualization-demo:${identity.runId}:production:${index}:create`,
    }),
    releaseIdempotencyKey: `visualization-demo:${identity.runId}:production:${index}:release`,
  };
}

export function buildVisualizationDemoPlan(sourceReport, options = {}) {
  const anchorDate =
    options.anchorDate || new Date().toISOString().slice(0, 10);
  const runIdentity = resolveRunIdentity({
    anchorDate,
    runId: options.runId,
  });
  const references = sourceIdentity(sourceReport);
  const identity = { ...runIdentity, ...references };
  const salesDefinitions = [
    ["overdue", -5],
    ["today", 0],
    ["dueSoon", 3],
    ["future", 14],
    ["unscheduled", null],
  ];
  const purchaseDefinitions = [
    ["overdue", -4, false],
    ["today", 0, false],
    ["dueSoonConfirmed", 4, true],
    ["future", 15, false],
    ["unscheduled", null, false],
  ];
  const productionDefinitions = [
    ["overdue", -10, -2, true, false],
    ["today", -5, 0, true, false],
    ["dueSoon", -2, 4, true, false],
    ["future", 2, 16, true, false],
    ["unscheduled", null, null, true, false],
    ["draft", 1, 6, false, false],
    ["processOverview", -1, 7, true, true],
  ];
  const base = {
    schemaVersion: VISUALIZATION_DEMO_SCHEMA_VERSION,
    datasetKey: "visualization-demo",
    sourceDataset: {
      datasetKey: sourceReport.datasetKey,
      dataVersion: sourceReport.dataVersion,
      runId: sourceReport.runId,
      target: sourceReport.target,
    },
    target: PERSISTENT_SCENARIO_DATASET_TARGET,
    backendURL: SCENARIO_DEMO_ORIGIN,
    ...runIdentity,
    simulatedOnly: true,
    directDatabaseWrite: false,
    frontendFixture: false,
    records: {
      salesOrders: salesDefinitions.map(([label, offset], index) =>
        salesScenario({
          identity,
          prefix: runIdentity.visiblePrefix,
          index: index + 1,
          label,
          deliveryOffset: offset,
        }),
      ),
      purchaseOrders: purchaseDefinitions.map(
        ([label, offset, confirmed], index) =>
          purchaseScenario({
            identity,
            prefix: runIdentity.visiblePrefix,
            index: index + 1,
            label,
            arrivalOffset: offset,
            confirmed,
          }),
      ),
      productionOrders: productionDefinitions.map(
        ([label, start, end, release, routed], index) =>
          productionScenario({
            identity,
            prefix: runIdentity.visiblePrefix,
            index: index + 1,
            label,
            startOffset: start,
            endOffset: end,
            release,
            routed,
          }),
      ),
    },
    retainedServerCoverage: {
      financeFactsMinimum: 80,
      financeRequiredTypes: ["RECEIVABLE", "PAYABLE"],
      inventoryBalancesMinimum: 100,
      inventoryWarehousesMinimum: 2,
      workflowTasksMinimum: 180,
    },
  };
  const planDigest = visualizationDemoDigest(base);
  return Object.freeze({
    ...base,
    planDigest,
    expectedConfirmation: [
      APPLY_CONFIRM_PREFIX,
      PERSISTENT_SCENARIO_DATASET_TARGET,
      runIdentity.runId,
      planDigest,
    ].join(":"),
  });
}

async function rpcCall({
  backendURL,
  token,
  domain,
  method,
  params = {},
  fetchImpl,
}) {
  const data = await manualAcceptanceFactRPCCall({
    backendURL,
    domain,
    method,
    params,
    token,
    fetchImpl,
  });
  return data;
}

async function loginAdmin(plan, { environment, fetchImpl }) {
  const { adminPassword } = resolveLocalScenarioDemoCredentials(environment);
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username: "admin", password: adminPassword },
    fetchImpl,
  });
  if (data?.is_super_admin !== true || data?.disabled === true) {
    throw new VisualizationDemoError(
      "visualization data writer requires the enabled local super admin",
      2,
    );
  }
  const token = String(data.access_token || data.token || "").trim();
  if (!token) throw new VisualizationDemoError("admin login returned no token");
  return token;
}

function withCustomer(params = {}) {
  return { customer_key: CUSTOMER_KEY, ...params };
}

async function exactSourceOrder({
  plan,
  token,
  domain,
  listMethod,
  listKey,
  businessField,
  businessNo,
  fetchImpl,
}) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    token,
    domain,
    method: listMethod,
    params: withCustomer({ keyword: businessNo, limit: 50, offset: 0 }),
    fetchImpl,
  });
  const matches = (Array.isArray(data?.[listKey]) ? data[listKey] : []).filter(
    (item) => String(item?.[businessField] || "") === businessNo,
  );
  if (matches.length > 1) {
    throw new VisualizationDemoError(`${businessNo} has duplicate server rows`);
  }
  return matches[0] || null;
}

async function ensureSourceOrders({ plan, token, domain, specs, fetchImpl }) {
  const sales = domain === "sales_order";
  const listMethod = sales ? "list_sales_orders" : "list_purchase_orders";
  const listKey = sales ? "sales_orders" : "purchase_orders";
  const businessField = sales ? "order_no" : "purchase_order_no";
  const saveMethod = sales
    ? "save_sales_order_with_items"
    : "save_purchase_order_with_items";
  const itemMethod = sales
    ? "list_sales_order_items"
    : "list_purchase_order_items";
  const itemKey = sales ? "sales_order_items" : "purchase_order_items";
  const foreignKey = sales ? "sales_order_id" : "purchase_order_id";
  const results = [];
  for (const spec of specs) {
    let order = await exactSourceOrder({
      plan,
      token,
      domain,
      listMethod,
      listKey,
      businessField,
      businessNo: spec.orderNo,
      fetchImpl,
    });
    let action = "reuse";
    if (!order) {
      const created = await rpcCall({
        backendURL: plan.backendURL,
        token,
        domain,
        method: saveMethod,
        params: withCustomer(spec.params),
        fetchImpl,
      });
      order = created?.[sales ? "sales_order" : "purchase_order"];
      action = "create";
    }
    const id = requiredPositiveInt(order?.id, `${spec.orderNo}.id`);
    const status = String(order.lifecycle_status || "").toUpperCase();
    if (status !== "DRAFT") {
      throw new VisualizationDemoError(
        `${spec.orderNo} expected DRAFT, got ${status || "missing"}`,
      );
    }
    const itemData = await rpcCall({
      backendURL: plan.backendURL,
      token,
      domain,
      method: itemMethod,
      params: withCustomer({ [foreignKey]: id, limit: 50, offset: 0 }),
      fetchImpl,
    });
    const items = Array.isArray(itemData?.[itemKey]) ? itemData[itemKey] : [];
    if (items.length !== spec.params.items.length) {
      throw new VisualizationDemoError(
        `${spec.orderNo} item count drifted: ${items.length}`,
      );
    }
    results.push({ action, id, businessNo: spec.orderNo, status });
  }
  return results;
}

async function exactProductionOrder({ plan, token, orderNo, fetchImpl }) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    token,
    domain: "production_order",
    method: "list_production_orders",
    params: { keyword: orderNo, lifecycle_scope: "all", limit: 50, offset: 0 },
    fetchImpl,
  });
  const matches = (
    Array.isArray(data?.production_orders) ? data.production_orders : []
  ).filter((item) => String(item?.order_no || "") === orderNo);
  if (matches.length > 1) {
    throw new VisualizationDemoError(`${orderNo} has duplicate server rows`);
  }
  return matches[0] || null;
}

async function getProductionOrder({ plan, token, id, fetchImpl }) {
  return rpcCall({
    backendURL: plan.backendURL,
    token,
    domain: "production_order",
    method: "get_production_order",
    params: { production_order_id: id },
    fetchImpl,
  });
}

async function ensureProductionOrders({ plan, token, fetchImpl }) {
  const results = [];
  for (const spec of plan.records.productionOrders) {
    let order = await exactProductionOrder({
      plan,
      token,
      orderNo: spec.orderNo,
      fetchImpl,
    });
    let action = "reuse";
    if (!order) {
      const created = await rpcCall({
        backendURL: plan.backendURL,
        token,
        domain: "production_order",
        method: "create_production_order",
        params: spec.params,
        fetchImpl,
      });
      order = created?.production_order;
      action = "create";
    }
    let aggregate = await getProductionOrder({
      plan,
      token,
      id: requiredPositiveInt(order?.id, `${spec.orderNo}.id`),
      fetchImpl,
    });
    order = aggregate.production_order;
    if (spec.release && String(order?.status || "").toUpperCase() === "DRAFT") {
      aggregate = await rpcCall({
        backendURL: plan.backendURL,
        token,
        domain: "production_order",
        method: "release_production_order",
        params: {
          production_order_id: order.id,
          expected_version: requiredPositiveInt(
            order.version,
            `${spec.orderNo}.version`,
          ),
          idempotency_key: spec.releaseIdempotencyKey,
        },
        fetchImpl,
      });
      order = aggregate.production_order;
      action = action === "create" ? "create+release" : "release";
    }
    const status = String(order?.status || "").toUpperCase();
    if (status !== spec.expectedStatus) {
      throw new VisualizationDemoError(
        `${spec.orderNo} expected ${spec.expectedStatus}, got ${status || "missing"}`,
      );
    }
    const items = Array.isArray(aggregate?.production_order_items)
      ? aggregate.production_order_items
      : [];
    if (items.length !== spec.params.items.length) {
      throw new VisualizationDemoError(
        `${spec.orderNo} item count drifted: ${items.length}`,
      );
    }
    results.push({
      action,
      id: order.id,
      businessNo: spec.orderNo,
      status,
      routed: spec.routed,
    });
  }
  return results;
}

async function listAll({
  plan,
  token,
  domain,
  method,
  listKey,
  params = {},
  customerScoped = true,
  fetchImpl,
}) {
  const rows = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const data = await rpcCall({
      backendURL: plan.backendURL,
      token,
      domain,
      method,
      params: customerScoped
        ? withCustomer({ ...params, limit: 200, offset })
        : { ...params, limit: 200, offset },
      fetchImpl,
    });
    const pageRows = Array.isArray(data?.[listKey]) ? data[listKey] : [];
    rows.push(...pageRows);
    const total = Number(data?.total ?? rows.length);
    if (rows.length >= total) return rows;
    if (pageRows.length === 0) {
      throw new VisualizationDemoError(
        `${domain}.${method} pagination stalled`,
      );
    }
    offset += pageRows.length;
  }
  throw new VisualizationDemoError(`${domain}.${method} exceeded 100 pages`);
}

function dateKeyFromUnix(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function dayDistance(from, to) {
  if (!from || !to) return null;
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

function riskKey(dateValue, anchorDate) {
  const dateKey =
    typeof dateValue === "number" ? dateKeyFromUnix(dateValue) : dateValue;
  if (!dateKey) return "unscheduled";
  const days = dayDistance(anchorDate, dateKey);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "dueSoon";
  return "future";
}

function countBy(items, field) {
  return Object.fromEntries(
    [...new Set(items.map((item) => String(item?.[field] || "").toUpperCase()))]
      .filter(Boolean)
      .sort()
      .map((key) => [
        key,
        items.filter(
          (item) => String(item?.[field] || "").toUpperCase() === key,
        ).length,
      ]),
  );
}

async function buildReadback({ plan, token, applyResults, fetchImpl }) {
  const salesRows = await listAll({
    plan,
    token,
    domain: "sales_order",
    method: "list_sales_order_summary",
    listKey: "items",
    params: { keyword: plan.visiblePrefix },
    fetchImpl,
  });
  const purchaseRows = await listAll({
    plan,
    token,
    domain: "purchase_order",
    method: "list_purchase_orders",
    listKey: "purchase_orders",
    params: { keyword: plan.visiblePrefix, lifecycle_scope: "all" },
    fetchImpl,
  });
  const productionRows = await listAll({
    plan,
    token,
    domain: "production_order",
    method: "list_production_orders",
    listKey: "production_orders",
    params: { keyword: plan.visiblePrefix, lifecycle_scope: "all" },
    customerScoped: false,
    fetchImpl,
  });
  const financeFacts = await listAll({
    plan,
    token,
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    fetchImpl,
  });
  const inventoryBalances = await listAll({
    plan,
    token,
    domain: "inventory",
    method: "list_inventory_balances",
    listKey: "inventory_balances",
    fetchImpl,
  });
  const workflowTasks = await listAll({
    plan,
    token,
    domain: "workflow",
    method: "list_tasks",
    listKey: "tasks",
    customerScoped: false,
    fetchImpl,
  });
  const processResult = applyResults.production.find((item) => item.routed);
  if (!processResult) {
    throw new VisualizationDemoError(
      "process overview production order is missing",
    );
  }
  const wip = await rpcCall({
    backendURL: plan.backendURL,
    token,
    domain: "production_wip",
    method: "get_production_wip",
    params: { production_order_id: processResult.id },
    fetchImpl,
  });
  const exactSales = salesRows.filter((row) =>
    String(row?.order_no || "").startsWith(`${plan.visiblePrefix}-XS-`),
  );
  const exactPurchase = purchaseRows.filter((row) =>
    String(row?.purchase_order_no || "").startsWith(
      `${plan.visiblePrefix}-CG-`,
    ),
  );
  const exactProduction = productionRows.filter((row) =>
    String(row?.order_no || "").startsWith(`${plan.visiblePrefix}-SC-`),
  );
  const salesRisk = countBy(
    exactSales.map((row) => ({
      risk: riskKey(
        dateKeyFromUnix(row.planned_delivery_date),
        plan.anchorDate,
      ),
    })),
    "risk",
  );
  const purchaseRisk = countBy(
    exactPurchase.map((row) => ({
      risk: riskKey(
        dateKeyFromUnix(
          row.supplier_confirmed_arrival_date || row.expected_arrival_date,
        ),
        plan.anchorDate,
      ),
    })),
    "risk",
  );
  const releasedProduction = exactProduction.filter(
    (row) => String(row?.status || "").toUpperCase() === "RELEASED",
  );
  const productionRisk = countBy(
    releasedProduction.map((row) => ({
      risk: riskKey(row.planned_end_at, plan.anchorDate),
    })),
    "risk",
  );
  const wipItems = Array.isArray(wip?.production_order_items)
    ? wip.production_order_items
    : [];
  const wipOperations = Array.isArray(wip?.production_order_operations)
    ? wip.production_order_operations
    : [];
  const wipBatches = Array.isArray(wip?.production_wip_batches)
    ? wip.production_wip_batches
    : [];
  const warehouses = new Set(
    inventoryBalances
      .map((row) => Number(row?.warehouse_id || 0))
      .filter(Boolean),
  );
  const financeRelevant = financeFacts.filter((row) =>
    ["RECEIVABLE", "PAYABLE"].includes(
      String(row?.fact_type || "").toUpperCase(),
    ),
  );
  const schedulingTasks = workflowTasks.filter(
    (task) =>
      String(task?.source_type || "") === "production-orders" &&
      applyResults.production.some(
        (order) => Number(order.id) === Number(task?.source_id),
      ),
  );
  const report = {
    schemaVersion: VISUALIZATION_DEMO_SCHEMA_VERSION,
    mode: "apply+verify",
    generatedAt: new Date().toISOString(),
    target: plan.target,
    backendURL: plan.backendURL,
    anchorDate: plan.anchorDate,
    runId: plan.runId,
    visiblePrefix: plan.visiblePrefix,
    planDigest: plan.planDigest,
    simulatedOnly: true,
    directDatabaseWrite: false,
    frontendFixture: false,
    applyResults,
    coverage: {
      salesDelivery: {
        rows: exactSales.length,
        riskCounts: salesRisk,
      },
      purchaseArrival: {
        rows: exactPurchase.length,
        riskCounts: purchaseRisk,
        confirmedDates: exactPurchase.filter(
          (row) => Number(row?.supplier_confirmed_arrival_date || 0) > 0,
        ).length,
      },
      productionOverview: {
        rows: exactProduction.length,
        statusCounts: countBy(exactProduction, "status"),
        riskCounts: productionRisk,
      },
      productionProcess: {
        productionOrderId: processResult.id,
        productRows: wipItems.length,
        operations: wipOperations.length,
        batches: wipBatches.length,
        batchStatusCounts: countBy(wipBatches, "status"),
      },
      financeDue: {
        rows: financeRelevant.length,
        factTypeCounts: countBy(financeRelevant, "fact_type"),
        statusCounts: countBy(financeRelevant, "status"),
        withDueDate: financeRelevant.filter(
          (row) => Number(row?.due_at || 0) > 0,
        ).length,
        withoutDueDate: financeRelevant.filter(
          (row) => Number(row?.due_at || 0) <= 0,
        ).length,
      },
      inventoryDistribution: {
        rows: inventoryBalances.length,
        warehouses: warehouses.size,
        available: inventoryBalances.filter(
          (row) => Number(row?.available_quantity || 0) > 0,
        ).length,
        unavailable: inventoryBalances.filter(
          (row) => Number(row?.available_quantity || 0) <= 0,
        ).length,
      },
      taskProgress: {
        totalTasks: workflowTasks.length,
        createdSchedulingTasks: schedulingTasks.length,
        schedulingStatusCounts: countBy(schedulingTasks, "task_status_key"),
      },
    },
  };
  assertReadback(plan, report);
  return report;
}

export function assertReadback(plan, report) {
  const coverage = report?.coverage || {};
  for (const key of ["overdue", "today", "duesoon", "future", "unscheduled"]) {
    if (
      Number(coverage.salesDelivery?.riskCounts?.[key.toUpperCase()] || 0) < 1
    ) {
      throw new VisualizationDemoError(`sales delivery is missing ${key}`);
    }
    if (
      Number(coverage.purchaseArrival?.riskCounts?.[key.toUpperCase()] || 0) < 1
    ) {
      throw new VisualizationDemoError(`purchase arrival is missing ${key}`);
    }
  }
  for (const key of ["OVERDUE", "TODAY", "DUESOON", "FUTURE", "UNSCHEDULED"]) {
    if (Number(coverage.productionOverview?.riskCounts?.[key] || 0) < 1) {
      throw new VisualizationDemoError(`production overview is missing ${key}`);
    }
  }
  if (
    Number(coverage.productionOverview?.statusCounts?.RELEASED || 0) < 6 ||
    Number(coverage.productionOverview?.statusCounts?.DRAFT || 0) < 1
  ) {
    throw new VisualizationDemoError("production status matrix is incomplete");
  }
  if (
    coverage.productionProcess?.productRows !== 5 ||
    coverage.productionProcess?.operations !== 20 ||
    coverage.productionProcess?.batches !== 5 ||
    Number(coverage.productionProcess?.batchStatusCounts?.PLANNED || 0) !== 5
  ) {
    throw new VisualizationDemoError(
      "production process readback is incomplete",
    );
  }
  if (
    Number(coverage.financeDue?.rows || 0) <
      plan.retainedServerCoverage.financeFactsMinimum ||
    plan.retainedServerCoverage.financeRequiredTypes.some(
      (type) => Number(coverage.financeDue?.factTypeCounts?.[type] || 0) < 1,
    ) ||
    Number(coverage.financeDue?.withDueDate || 0) < 1
  ) {
    throw new VisualizationDemoError(
      "finance due source coverage is incomplete",
    );
  }
  if (
    Number(coverage.inventoryDistribution?.rows || 0) <
      plan.retainedServerCoverage.inventoryBalancesMinimum ||
    Number(coverage.inventoryDistribution?.warehouses || 0) <
      plan.retainedServerCoverage.inventoryWarehousesMinimum ||
    Number(coverage.inventoryDistribution?.available || 0) < 1 ||
    Number(coverage.inventoryDistribution?.unavailable || 0) < 1
  ) {
    throw new VisualizationDemoError(
      "inventory distribution source coverage is incomplete",
    );
  }
  if (
    Number(coverage.taskProgress?.totalTasks || 0) <
      plan.retainedServerCoverage.workflowTasksMinimum ||
    Number(coverage.taskProgress?.createdSchedulingTasks || 0) < 6
  ) {
    throw new VisualizationDemoError(
      "task progress source coverage is incomplete",
    );
  }
  return true;
}

async function assertScenarioRuntime({ environment, fetchImpl }) {
  const resolved = await runScenarioDemoCli([], { environment, fetchImpl });
  if (
    resolved?.plan?.targetAlias !== PERSISTENT_SCENARIO_DATASET_TARGET ||
    resolved?.plan?.backendURL !== SCENARIO_DEMO_ORIGIN ||
    resolved?.plan?.dataVersion !== CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION ||
    resolved?.plan?.runId !== CURRENT_MANUAL_ACCEPTANCE_RUN_ID
  ) {
    throw new VisualizationDemoError(
      "scenario-demo runtime identity is not the current canonical local dataset",
      2,
    );
  }
  return resolved.plan;
}

async function applyVisualizationDemoData(
  plan,
  { environment = process.env, fetchImpl = fetch } = {},
) {
  const runtime = await assertScenarioRuntime({ environment, fetchImpl });
  if (environment.VISUALIZATION_DEMO_CONFIRM !== plan.expectedConfirmation) {
    throw new VisualizationDemoError(
      "apply requires the exact VISUALIZATION_DEMO_CONFIRM printed by plan mode",
      2,
    );
  }
  const token = await loginAdmin(plan, { environment, fetchImpl });
  const sales = await ensureSourceOrders({
    plan,
    token,
    domain: "sales_order",
    specs: plan.records.salesOrders,
    fetchImpl,
  });
  const purchase = await ensureSourceOrders({
    plan,
    token,
    domain: "purchase_order",
    specs: plan.records.purchaseOrders,
    fetchImpl,
  });
  const production = await ensureProductionOrders({
    plan,
    token,
    fetchImpl,
  });
  return buildReadback({
    plan,
    token,
    applyResults: { sales, purchase, production },
    runtime,
    fetchImpl,
  });
}

export function parseVisualizationDemoArgs(argv = []) {
  const today = new Date().toISOString().slice(0, 10);
  const options = {
    apply: false,
    anchorDate: today,
    runId: "",
    sourceReport: DEFAULT_SOURCE_REPORT,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    expectedPlanDigest: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") options.apply = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--anchor-date")
      options.anchorDate = argv[++index] || "";
    else if (token === "--run-id") options.runId = argv[++index] || "";
    else if (token === "--source-report")
      options.sourceReport = argv[++index] || "";
    else if (token === "--output-root")
      options.outputRoot = argv[++index] || "";
    else if (token === "--expected-plan-digest")
      options.expectedPlanDigest = argv[++index] || "";
    else throw new VisualizationDemoError(`unknown option ${token}`, 2);
  }
  if (options.apply && !/^[0-9a-f]{64}$/u.test(options.expectedPlanDigest)) {
    throw new VisualizationDemoError(
      "--apply requires --expected-plan-digest <64 hex>",
      2,
    );
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/qa/visualization-demo-data.mjs [--anchor-date YYYY-MM-DD] [--run-id VIS-YYYYMMDD]
  VISUALIZATION_DEMO_CONFIRM='<printed confirmation>' \\
    node scripts/qa/visualization-demo-data.mjs --apply --anchor-date YYYY-MM-DD \\
      --run-id VIS-YYYYMMDD --expected-plan-digest <64-hex>

Plan mode is read-only. Apply is restricted to the registered local scenario-demo
runtime and writes simulated records through official JSON-RPC usecases only.`;
}

async function writeReport(root, runId, report) {
  const directory = path.resolve(root, runId);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, "apply-report.json");
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return target;
}

export async function runVisualizationDemoCli(
  argv = [],
  {
    projectRoot = path.resolve(import.meta.dirname, "..", ".."),
    environment = process.env,
    fetchImpl = fetch,
  } = {},
) {
  const options = parseVisualizationDemoArgs(argv);
  if (options.help) return { exitCode: 0, text: `${usage()}\n` };
  const sourcePath = path.resolve(projectRoot, options.sourceReport);
  const sourceReport = JSON.parse(await readFile(sourcePath, "utf8"));
  const plan = buildVisualizationDemoPlan(sourceReport, {
    anchorDate: options.anchorDate,
    runId: options.runId,
  });
  if (!options.apply) {
    await assertScenarioRuntime({ environment, fetchImpl });
    return { exitCode: 0, text: `${JSON.stringify(plan, null, 2)}\n`, plan };
  }
  if (options.expectedPlanDigest !== plan.planDigest) {
    throw new VisualizationDemoError(
      "expected plan digest does not match the current visualization plan",
      2,
    );
  }
  const report = await applyVisualizationDemoData(plan, {
    environment,
    fetchImpl,
  });
  const reportPath = await writeReport(
    path.resolve(projectRoot, options.outputRoot),
    plan.runId,
    report,
  );
  return {
    exitCode: 0,
    text: `${JSON.stringify({ ...report, reportPath }, null, 2)}\n`,
    plan,
    report,
    reportPath,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  runVisualizationDemoCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `[qa:visualization-demo-data] ${String(error?.message || error)}\n`,
      );
      process.exitCode =
        error instanceof VisualizationDemoError ? error.exitCode : 1;
    });
}
