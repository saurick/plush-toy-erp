#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  applyPlan as applyOperationalPlan,
  buildPlan as buildOperationalPlan,
  loginRoles as loginOperationalRoles,
} from "./operational-fact-simulated-closure.mjs";
import {
  applyPlan as applyPurchaseQualityPlan,
  buildPlan as buildPurchaseQualityPlan,
} from "./purchase-quality-simulated-matrix.mjs";
import {
  buildManualAcceptanceSourceDataPlan,
  verifyManualAcceptanceSourceData,
} from "./manual-acceptance-source-data.mjs";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/fact-data";
const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_FACTS";
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
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
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
  plan,
  sourceReport,
  { password, adminPassword, fetchImpl = fetch } = {},
) {
  const backendURL = normalizeBackendURL(plan?.backendURL);
  const sourceBackendURL = normalizeBackendURL(
    required(sourceReport?.backendURL, "sourceReport.backendURL"),
  );
  if (sourceBackendURL !== backendURL) {
    throw new CliError(
      "source report backend does not match the fact apply backend",
      2,
    );
  }
  const safePlan = { ...plan, backendURL };
  if (process.env.MANUAL_ACCEPTANCE_FACT_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(
      `apply requires MANUAL_ACCEPTANCE_FACT_CONFIRM=${CONFIRM_PHRASE}`,
      2,
    );
  }
  const effectivePassword = required(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  const effectiveAdminPassword = required(
    adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );

  const sourcePlan = buildManualAcceptanceSourceDataPlan({
    runId: sourceReport.runId,
    backendURL,
    scale: sourceReport.scale,
  });
  const sourceVerification = await verifyManualAcceptanceSourceData(
    sourcePlan,
    {
      password: effectivePassword,
      adminPassword: effectiveAdminPassword,
      fetchImpl,
    },
  );
  if (!sourceVerification.ok) {
    throw new CliError(
      "source data verification failed; fact writes were not started",
    );
  }

  const purchaseQualitySteps = [];
  const purchaseQualityAuthSession = {};
  const materialLotByLocation = new Map();
  for (const item of safePlan.purchaseQuality) {
    const steps = await applyPurchaseQualityPlan(item, effectivePassword, {
      adminPassword: effectiveAdminPassword,
      authSession: purchaseQualityAuthSession,
      fetchImpl,
    });
    purchaseQualitySteps.push({
      runId: item.runId,
      steps,
    });
    const posted = steps.find(
      (step) =>
        step.target === "purchase_receipt_quality" &&
        step.scenario === "PASSED_POSTED" &&
        step.receiptStatus === "POSTED" &&
        step.inspectionStatus === "PASSED",
    );
    if (!Number.isSafeInteger(posted?.lotId) || posted.lotId <= 0) {
      throw new CliError(
        `${item.runId}: posted purchase receipt did not return an active material lot`,
      );
    }
    materialLotByLocation.set(
      `${item.ids.materialId}:${item.ids.warehouseId}`,
      posted.lotId,
    );
  }

  const tokens = await loginOperationalRoles({
    backendURL,
    password: effectivePassword,
    fetchImpl,
  });
  const operationalSteps = [];
  const operationalAuthSession = {};
  for (const item of safePlan.operational) {
    const materialLotId = materialLotByLocation.get(
      `${item.ids.materialId}:${item.ids.warehouseId}`,
    );
    if (!Number.isSafeInteger(materialLotId) || materialLotId <= 0) {
      throw new CliError(
        `${item.runId}: no posted material lot matches its warehouse`,
      );
    }
    const linkedItem = {
      ...item,
      records: {
        ...item.records,
        outsourcingIssue: {
          ...item.records.outsourcingIssue,
          lot_id: materialLotId,
        },
      },
    };
    operationalSteps.push({
      runId: item.runId,
      steps: await applyOperationalPlan(linkedItem, tokens, {
        adminPassword: effectiveAdminPassword,
        authSession: operationalAuthSession,
        fetchImpl,
      }),
    });
  }

  return {
    mode: "apply",
    generatedAt: new Date().toISOString(),
    runId: safePlan.runId,
    sourceRunId: safePlan.sourceRunId,
    backendURL,
    simulatedOnly: true,
    realCustomerImport: false,
    sourceVerification,
    operationalSteps,
    purchaseQualitySteps,
    totals: {
      operationalRuns: operationalSteps.length,
      operationalActions: operationalSteps.reduce(
        (sum, item) => sum + item.steps.length,
        0,
      ),
      purchaseQualityRuns: purchaseQualitySteps.length,
      purchaseQualityActions: purchaseQualitySteps.reduce(
        (sum, item) => sum + item.steps.length,
        0,
      ),
    },
    expectedMinimums: safePlan.expectedMinimums,
  };
}

function markdown(report) {
  const lines = [
    "# 全页面事实数据写入报告 / Manual Acceptance Fact Data",
    "",
    `- 试用批次：${report.runId}`,
    `- 源数据批次：${report.sourceRunId}`,
    "- 数据性质：模拟试用数据，不是真实客户导入",
    "",
    "## 写入结果",
    "",
    `- 生产、库存、出货、财务批次：${report.totals.operationalRuns}`,
    `- 采购、入库、质检批次：${report.totals.purchaseQualityRuns}`,
    `- 业务动作总数：${report.totals.operationalActions + report.totals.purchaseQualityActions}`,
    "",
    "> 本报告只证明模拟业务记录已写入，不代表试用人员已经完成验收。",
    "",
  ];
  return lines.join("\n");
}

async function writeReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "apply-report.json");
  const markdownPath = path.join(outDir, "apply-report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function usage() {
  return `全页面事实数据 / Manual Acceptance Fact Data

只读计划：
  node scripts/qa/manual-acceptance-fact-data.mjs \\
    --source-report output/qa/manual-acceptance/source-data/apply-report.json \\
    --run-id LOCAL-UAT-FACTS --json

写入本地开发环境：
  MANUAL_ACCEPTANCE_FACT_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-fact-data.mjs --apply \\
      --source-report output/qa/manual-acceptance/source-data/apply-report.json \\
      --run-id LOCAL-UAT-FACTS

默认生成 45 组生产/库存/预留/出货及应付、应收、发票、对账记录，以及 9 组采购/入库/质检矩阵。
本入口只允许 localhost；同一事实 runId 完成后不要重复执行。`;
}

export async function runManualAcceptanceFactCli(argv, deps = {}) {
  const options = parseManualAcceptanceFactArgs(argv);
  if (options.help) return { text: `${usage()}\n`, exitCode: 0 };
  const sourceReport = await readSourceReport(options.sourceReport);
  const plan = buildManualAcceptanceFactPlan(sourceReport, options);
  if (!options.apply) {
    return {
      text: `${JSON.stringify(plan, null, options.json ? 2 : 0)}\n`,
      exitCode: 0,
      plan,
      sourceReport,
    };
  }
  const report = await applyManualAcceptanceFactPlan(plan, sourceReport, deps);
  const output = await writeReport(options.out, report);
  return {
    text: `[qa:manual-acceptance-fact-data] apply complete json=${output.jsonPath} md=${output.markdownPath}\n`,
    exitCode: 0,
    plan,
    report,
    output,
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

export { CONFIRM_PHRASE as MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE };
