#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildPlan as buildOperationalPlan,
} from "./operational-fact-simulated-closure.mjs";
import {
  buildPlan as buildPurchaseQualityPlan,
} from "./purchase-quality-simulated-matrix.mjs";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/fact-data";
const APPLY_RETIRED_MESSAGE =
  "manual acceptance fact apply is retired; source-driven fact fixtures must replace the generic operational writer";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const PAYABLE_STATUSES = ["DRAFT", "POSTED", "SETTLED", "CANCELLED"];
const PRODUCTION_SAMPLE_TYPES = [
  "MATERIAL_ISSUE",
  "FINISHED_GOODS_RECEIPT",
  "REWORK",
];
const PAYMENT_TERMS = [
  ["CASH_ON_SHIPMENT", 0],
  ["EOM_30", 30],
  ["EOM_45", 45],
];
const INVOICE_CATEGORIES = [
  "NONE",
  "EXPORT_GENERAL",
  "VAT_GENERAL_1",
  "VAT_SPECIAL_3",
  "VAT_SPECIAL_13",
];

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function required(value, name) {
  const normalized = text(value);
  if (!normalized) throw new CliError(`${name} is required`);
  return normalized;
}

function positiveInt(value, name, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new CliError(`${name} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

function safeRunId(value) {
  const normalized = required(value, "runId")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!normalized || normalized.length > 24) {
    throw new CliError("runId must be 1-24 safe characters");
  }
  return normalized;
}

function normalizeBackendURL(value) {
  const url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain credentials");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new CliError(
      `refuse external backend ${url.origin}; fact bulk apply is local-only`,
      2,
    );
  }
  return url.toString().replace(/\/+$/u, "");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function validateSourceReport(report) {
  if (!report || report.mode !== "apply") {
    throw new CliError("source report must be a successful apply report");
  }
  if (!report.simulatedOnly || report.realCustomerImport !== false) {
    throw new CliError(
      "source report must remain simulatedOnly and realCustomerImport=false",
    );
  }
  const refs = report.referenceRecords;
  if (!refs?.unit?.id || !refs?.warehouse?.id) {
    throw new CliError(
      "source report is missing active unit or warehouse references",
    );
  }
  for (const key of [
    "customers",
    "suppliers",
    "materials",
    "products",
    "skus",
  ]) {
    if (!Array.isArray(refs[key]) || refs[key].length === 0) {
      throw new CliError(`source report is missing ${key} references`);
    }
  }
  return report;
}

export function buildManualAcceptanceFactPlan(sourceReport, options = {}) {
  const report = validateSourceReport(sourceReport);
  const runId = safeRunId(options.runId || `${report.runId}-FACTS`);
  const backendURL = normalizeBackendURL(
    options.backendURL || report.backendURL || DEFAULT_BACKEND_URL,
  );
  const operationalRuns = positiveInt(
    options.operationalRuns || 45,
    "operationalRuns",
    60,
  );
  const purchaseQualityRuns = positiveInt(
    options.purchaseQualityRuns || 9,
    "purchaseQualityRuns",
    20,
  );
  const refs = report.referenceRecords;
  const warehouses = Array.isArray(refs.warehouses) ? refs.warehouses : [];
  if (new Set(warehouses.map((item) => item.id)).size < 4) {
    throw new CliError(
      "source report must include at least four distinct active warehouses",
    );
  }
  const stockedMaterials = Array.from(
    { length: purchaseQualityRuns },
    (_, offset) => refs.materials[(offset * 5) % refs.materials.length],
  );
  if (refs.skus.length < operationalRuns) {
    throw new CliError(
      `source report has ${refs.skus.length} active SKUs, need ${operationalRuns}`,
    );
  }
  const salesOrders = Array.isArray(refs.salesOrders) ? refs.salesOrders : [];
  const richSalesOrder = salesOrders.reduce(
    (current, item) =>
      (item.items?.length || 0) > (current?.items?.length || 0)
        ? item
        : current,
    null,
  );
  if (
    !richSalesOrder?.id ||
    !Array.isArray(richSalesOrder.items) ||
    richSalesOrder.items.length < 25 ||
    richSalesOrder.items.some(
      (item) => !item.salesOrderItemId || !item.productId || !item.productSkuId,
    )
  ) {
    throw new CliError(
      "source report must include an active 25-line sales order with persisted line references",
    );
  }
  const skuById = new Map(refs.skus.map((item) => [item.id, item]));
  const selectedSkus = [];
  const selectedSkuIds = new Set();
  for (const item of [
    ...(richSalesOrder?.items || []).map((record) =>
      skuById.get(record.productSkuId),
    ),
    ...refs.skus,
  ]) {
    if (!item || selectedSkuIds.has(item.id)) continue;
    selectedSkuIds.add(item.id);
    selectedSkus.push(item);
    if (selectedSkus.length === operationalRuns) break;
  }
  if (selectedSkus.length < operationalRuns) {
    throw new CliError(
      `source report has ${selectedSkus.length} distinct active SKUs, need ${operationalRuns}`,
    );
  }
  const linkedLine = richSalesOrder.items[0];
  const linkedSkuIndex = selectedSkus.findIndex(
    (item) => item.id === linkedLine.productSkuId,
  );
  if (linkedSkuIndex < 0) {
    throw new CliError(
      "linked sales order SKU is missing from active SKU references",
    );
  }
  [selectedSkus[linkedSkuIndex], selectedSkus[operationalRuns - 1]] = [
    selectedSkus[operationalRuns - 1],
    selectedSkus[linkedSkuIndex],
  ];
  const selectedSkuOffset = new Map(
    selectedSkus.map((item, offset) => [item.id, offset]),
  );
  const warehouseForOperationalOffset = (offset) =>
    warehouses[(offset % stockedMaterials.length) % warehouses.length];
  const operational = Array.from({ length: operationalRuns }, (_, offset) => {
    const index = offset + 1;
    const sku = selectedSkus[offset];
    const linkedSalesOrder = index === operationalRuns ? richSalesOrder : null;
    const linkedSalesOrderItem = linkedSalesOrder?.items[0] || null;
    const customer = linkedSalesOrder
      ? refs.customers.find(
          (item) => item.id === linkedSalesOrder.customerId,
        ) || refs.customers[offset % refs.customers.length]
      : refs.customers[offset % refs.customers.length];
    const supplier = refs.suppliers[offset % refs.suppliers.length];
    const material = stockedMaterials[offset % stockedMaterials.length];
    const warehouse = warehouseForOperationalOffset(offset);
    const [paymentTerm, paymentTermDays] =
      PAYMENT_TERMS[offset % PAYMENT_TERMS.length];
    return buildOperationalPlan({
      backendURL,
      runId: `${runId}-OP-${pad(index)}`,
      customerId: customer.id,
      customerName: customer.name,
      salesOrderId: linkedSalesOrder?.id,
      salesOrderItemId: linkedSalesOrderItem?.salesOrderItemId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      productId: sku.productId,
      productSkuId: sku.id,
      materialId: material.id,
      unitId: refs.unit.id,
      warehouseId: warehouse.id,
      payableStatus: PAYABLE_STATUSES[offset % PAYABLE_STATUSES.length],
      reconciliationStatus:
        PAYABLE_STATUSES[(offset + 1) % PAYABLE_STATUSES.length],
      receivableStatus:
        PAYABLE_STATUSES[(offset + 2) % PAYABLE_STATUSES.length],
      invoiceStatus: PAYABLE_STATUSES[(offset + 3) % PAYABLE_STATUSES.length],
      productionSampleType:
        PRODUCTION_SAMPLE_TYPES[offset % PRODUCTION_SAMPLE_TYPES.length],
      collectionType:
        offset % 2 === 0 ? "ACCOUNTS_RECEIVABLE" : "ADVANCE_RECEIPT",
      paymentTerm,
      paymentTermDays,
      invoiceCategory: INVOICE_CATEGORIES[offset % INVOICE_CATEGORIES.length],
      reconciliationCounterpartyType:
        offset % 2 === 0 ? "CUSTOMER" : "SUPPLIER",
      reconciliationCounterpartyId:
        offset % 2 === 0 ? customer.id : supplier.id,
      shipmentItems:
        index === operationalRuns
          ? richSalesOrder.items.map((item, itemOffset) => {
              const productSkuId = item.productSkuId || item.id;
              const selectedOffset =
                selectedSkuOffset.get(productSkuId) ?? itemOffset;
              return {
                sales_order_item_id: item.salesOrderItemId,
                product_id: item.productId,
                product_sku_id: productSkuId,
                warehouse_id: warehouseForOperationalOffset(selectedOffset).id,
                unit_id: refs.unit.id,
                quantity: "1",
                note: `【试用】多规格出货明细 ${pad(itemOffset + 1)}。`,
              };
            })
          : undefined,
    });
  });
  const purchaseQuality = Array.from(
    { length: purchaseQualityRuns },
    (_, offset) => {
      const index = offset + 1;
      const supplier = refs.suppliers[(offset * 3) % refs.suppliers.length];
      const material = stockedMaterials[offset];
      const warehouse = warehouses[offset % warehouses.length];
      return buildPurchaseQualityPlan({
        backendURL,
        runId: `${runId}-PQ-${pad(index)}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        materialId: material.id,
        materialName: material.name,
        unitId: refs.unit.id,
        warehouseId: warehouse.id,
      });
    },
  );
  return {
    scope: "manual-acceptance-fact-data",
    customerKey: "yoyoosun",
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    applySupported: false,
    applyRetiredReason: APPLY_RETIRED_MESSAGE,
    requiredApplyInputs: [],
    sourceRunId: report.runId,
    sourcePrefix: report.prefix,
    runId,
    backendURL,
    operationalRuns,
    purchaseQualityRuns,
    operational,
    purchaseQuality,
    expectedMinimums: {
      production: operationalRuns,
      inventoryBalances: operationalRuns,
      stockReservations: operationalRuns,
      shipments: operationalRuns,
      payables: operationalRuns,
      receivables: operationalRuns,
      invoices: operationalRuns,
      reconciliation: operationalRuns,
      purchaseReceipts: purchaseQualityRuns * 6,
      qualityInspections: purchaseQualityRuns * 7,
    },
    rerunPolicy:
      "同一事实批次完成后不重复执行；需要追加数据时使用新的 runId。源数据入口仍可按原 runId 重复核验。",
    lifecycleCleanup:
      "保留的业务记录按取消、冲正、释放、结清等业务生命周期退出，不物理删除已过账记录。",
  };
}

export function parseManualAcceptanceFactArgs(argv) {
  const options = {
    apply: false,
    help: false,
    json: false,
    sourceReport: "",
    backendURL: "",
    runId: "",
    operationalRuns: 45,
    purchaseQualityRuns: 9,
    out: DEFAULT_OUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") throw new CliError(APPLY_RETIRED_MESSAGE, 2);
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--"))
      throw new CliError(`unexpected argument ${token}`, 2);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new CliError(`missing value for ${token}`, 2);
    index += 1;
    switch (key) {
      case "source-report":
        options.sourceReport = value;
        break;
      case "backend-url":
        options.backendURL = value;
        break;
      case "run-id":
        options.runId = value;
        break;
      case "operational-runs":
        options.operationalRuns = positiveInt(value, token, 60);
        break;
      case "purchase-quality-runs":
        options.purchaseQualityRuns = positiveInt(value, token, 20);
        break;
      case "out":
        options.out = value;
        break;
      default:
        throw new CliError(`unknown option ${token}`, 2);
    }
  }
  return options;
}

async function readSourceReport(filePath) {
  const raw = await readFile(required(filePath, "--source-report"), "utf8");
  return validateSourceReport(JSON.parse(raw));
}

export async function applyManualAcceptanceFactPlan(
  _plan,
  _sourceReport,
  _deps = {},
) {
  throw new CliError(APPLY_RETIRED_MESSAGE, 2);
}

function usage() {
  return `全页面事实数据 / Manual Acceptance Fact Data

只读计划：
  node scripts/qa/manual-acceptance-fact-data.mjs \\
    --source-report output/qa/manual-acceptance/source-data/apply-report.json \\
    --run-id LOCAL-UAT-FACTS --json

默认计划描述 45 组生产/库存/预留/出货及应付、应收、发票、对账候选，以及 9 组采购/入库/质检候选；不会写入这些记录。
当前只保留计划生成；apply 已退役，调用会在读取报告、登录、RPC 和任何写入前失败。`;
}

export async function runManualAcceptanceFactCli(argv) {
  const options = parseManualAcceptanceFactArgs(argv);
  if (options.help) return { text: `${usage()}\n`, exitCode: 0 };
  const sourceReport = await readSourceReport(options.sourceReport);
  const plan = buildManualAcceptanceFactPlan(sourceReport, options);
  return {
    text: `${JSON.stringify(plan, null, options.json ? 2 : 0)}\n`,
    exitCode: 0,
    plan,
    sourceReport,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  runManualAcceptanceFactCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error?.message || error}\n`);
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    });
}

export { APPLY_RETIRED_MESSAGE as MANUAL_ACCEPTANCE_FACT_APPLY_RETIRED_MESSAGE };
