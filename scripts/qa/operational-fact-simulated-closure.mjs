#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR =
  "output/customers/yoyoosun/operational-fact-simulated-closure";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-OPFACT";
const INPUT_TEMPLATE_SCOPE =
  "operational-fact-simulated-closure-input-template";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const APPLY_RETIRED_MESSAGE =
  "operational fact simulated apply is retired; use source-driven domain fixtures and browser flows";
const FORBIDDEN_ARG_PATTERN =
  /--(?:execute|import|real|real-import|customer-data)/u;

const ROLE_USERS = {
  pmc: "demo_pmc",
  purchase: "demo_purchase",
  warehouse: "demo_warehouse",
  finance: "demo_finance",
};

const USAGE = `Operational fact simulated closure

Usage:
  node scripts/qa/operational-fact-simulated-closure.mjs
  node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template

Report-only mode:
  node scripts/qa/operational-fact-simulated-closure.mjs \\
    --customer-id 1 --product-id 1 --material-id 1 --unit-id 1 --warehouse-id 1

Options:
  --print-input-template Print local input checklist only; no report/backend/database writes.
  --apply                Retired; exits before login, RPC, report, or database writes.
  --backend-url <url>    Backend base URL. Default ${DEFAULT_BACKEND_URL}.
  --out <dir>            Output report directory. Default ${DEFAULT_OUT_DIR}.
  --customer-id <id>     Active customer ID linked to shipment and receivable facts.
  --customer-name <text> Optional customer name snapshot shown on shipment pages.
  --sales-order-id <id>  Optional active sales order linked to reservations and shipments.
  --sales-order-item-id <id> Required matching line when --sales-order-id is set.
  --product-id <id>      Active product ID used for simulated fact lines.
  --product-sku-id <id>  Optional active SKU ID used for precise inventory grain.
  --material-id <id>     Active material ID used for material issue facts.
  --unit-id <id>         Active unit ID used for simulated quantities.
  --warehouse-id <id>    Active warehouse ID used for inventory-affecting facts.
  --supplier-id <id>     Optional active supplier ID used for payable samples.
  --supplier-name <text> Optional supplier name snapshot shown on outsourcing pages.
  --payable-status <key> Optional DRAFT / POSTED / SETTLED / CANCELLED. Default POSTED.
  --reconciliation-status <key> Optional status for reconciliation samples. Default POSTED.
  --receivable-status <key> Optional status for receivable samples. Default SETTLED.
  --invoice-status <key> Optional status for invoice samples. Default CANCELLED.
  --run-id <text>        Optional unique run suffix. Default timestamp.
  --help                 Print this help.

The report-only path never calls a backend, writes business records, imports real customer
data, creates schema or migrations, or turns customer acceptance into a completion blocker.`;

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

function asPositiveInt(value, pathName) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new CliError(`${pathName} must be a positive integer`);
  }
  return numberValue;
}

function normalizeBaseURL(raw) {
  const url = new URL(String(raw || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain username or password", 2);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new CliError("backend URL must use http or https", 2);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function assertLocalBackendURL(raw) {
  const backendURL = normalizeBaseURL(raw);
  const url = new URL(backendURL);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new CliError(
      `refuse simulated operational fact writes to external backend ${url.origin}`,
      2,
    );
  }
  return backendURL;
}

function normalizeFinanceStatus(value, pathName) {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  if (!["DRAFT", "POSTED", "SETTLED", "CANCELLED"].includes(status)) {
    throw new CliError(
      `${pathName} must be DRAFT, POSTED, SETTLED, or CANCELLED`,
      2,
    );
  }
  return status;
}

function parseCliArgs(argv) {
  const options = {
    apply: false,
    help: false,
    printInputTemplate: false,
    out: DEFAULT_OUT_DIR,
    backendURL:
      process.env.OPERATIONAL_FACT_SIM_BACKEND_URL || DEFAULT_BACKEND_URL,
    runId: process.env.OPERATIONAL_FACT_SIM_RUN_ID || buildTimestampRunId(),
    payableStatus: "POSTED",
    reconciliationStatus: "POSTED",
    receivableStatus: "SETTLED",
    invoiceStatus: "CANCELLED",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (FORBIDDEN_ARG_PATTERN.test(token)) {
      throw new CliError(
        `Operational fact simulated closure refuses real import style flag: ${token}`,
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
    if (token === "--apply") throw new CliError(APPLY_RETIRED_MESSAGE, 2);
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
      case "product-id":
        options.productId = asPositiveInt(value, "--product-id");
        break;
      case "product-sku-id":
        options.productSkuId = asPositiveInt(value, "--product-sku-id");
        break;
      case "material-id":
        options.materialId = asPositiveInt(value, "--material-id");
        break;
      case "customer-id":
        options.customerId = asPositiveInt(value, "--customer-id");
        break;
      case "customer-name":
        options.customerName = requiredText(value, "--customer-name");
        break;
      case "sales-order-id":
        options.salesOrderId = asPositiveInt(value, "--sales-order-id");
        break;
      case "sales-order-item-id":
        options.salesOrderItemId = asPositiveInt(
          value,
          "--sales-order-item-id",
        );
        break;
      case "unit-id":
        options.unitId = asPositiveInt(value, "--unit-id");
        break;
      case "warehouse-id":
        options.warehouseId = asPositiveInt(value, "--warehouse-id");
        break;
      case "supplier-id":
        options.supplierId = asPositiveInt(value, "--supplier-id");
        break;
      case "supplier-name":
        options.supplierName = requiredText(value, "--supplier-name");
        break;
      case "payable-status":
        options.payableStatus = normalizeFinanceStatus(
          value,
          "--payable-status",
        );
        break;
      case "reconciliation-status":
        options.reconciliationStatus = normalizeFinanceStatus(
          value,
          "--reconciliation-status",
        );
        break;
      case "receivable-status":
        options.receivableStatus = normalizeFinanceStatus(
          value,
          "--receivable-status",
        );
        break;
      case "invoice-status":
        options.invoiceStatus = normalizeFinanceStatus(
          value,
          "--invoice-status",
        );
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
    scenario: "operational-fact-simulated-closure",
    simulatedOnly: true,
    realCustomerImport: false,
    customerAcceptanceRequiredForClosure: false,
    applySupported: false,
    applyRetiredReason: APPLY_RETIRED_MESSAGE,
    writesReports: false,
    writesDatabase: false,
    callsBackend: false,
    importsRealCustomerData: false,
    createsBusinessRecords: false,
    downstreamReportOnlyWritesReports: true,
    downstreamApplyWritesDatabase: false,
    defaultBackendURL: DEFAULT_BACKEND_URL,
    backendURL,
    defaultOut: DEFAULT_OUT_DIR,
    out,
    runId,
    requiredReportInputs: [
      "--customer-id <active_customer_id>",
      "--product-id <active_product_id>",
      "--material-id <active_material_id>",
      "--unit-id <active_unit_id>",
      "--warehouse-id <active_warehouse_id>",
    ],
    requiredApplyInputs: [],
    optionalInputs: [
      "--product-sku-id <active_product_sku_id>",
      "--supplier-id <active_supplier_id>",
      "--sales-order-id <active_sales_order_id>",
      "--sales-order-item-id <matching_sales_order_item_id>",
      "--customer-name <customer_name_snapshot>",
      "--supplier-name <supplier_name_snapshot>",
      "--payable-status <DRAFT|POSTED|SETTLED|CANCELLED>",
      "--reconciliation-status <DRAFT|POSTED|SETTLED|CANCELLED>",
      "--receivable-status <DRAFT|POSTED|SETTLED|CANCELLED>",
      "--invoice-status <DRAFT|POSTED|SETTLED|CANCELLED>",
    ],
    roleAccounts: ROLE_USERS,
    commands: {
      printInputTemplate:
        "PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template",
      reportOnly: `PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --customer-id <active_customer_id> --product-id <active_product_id> --material-id <active_material_id> --unit-id <active_unit_id> --warehouse-id <active_warehouse_id> --run-id ${runId} --out ${out}`,
      seedCoreDemo:
        "PATH=/usr/local/bin:$PATH bash scripts/seed-core-demo-data.sh",
    },
    boundary:
      "This template only prints prerequisites and commands. It does not write reports, call backend, login, import real customer data, write business_records, or create operational facts.",
  };
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
  if (!text || text.length > 48) {
    throw new CliError("runId must be 1-48 safe characters");
  }
  return text;
}

function ensureIDs(options) {
  const ids = {
    customerId: asPositiveInt(options.customerId, "customerId"),
    productId: asPositiveInt(options.productId, "productId"),
    unitId: asPositiveInt(options.unitId, "unitId"),
    warehouseId: asPositiveInt(options.warehouseId, "warehouseId"),
    materialId: asPositiveInt(options.materialId, "materialId"),
  };
  if (options.productSkuId != null) {
    ids.productSkuId = asPositiveInt(options.productSkuId, "productSkuId");
  }
  if (options.supplierId != null) {
    ids.supplierId = asPositiveInt(options.supplierId, "supplierId");
  }
  if ((options.salesOrderId == null) !== (options.salesOrderItemId == null)) {
    throw new CliError(
      "salesOrderId and salesOrderItemId must be provided together",
    );
  }
  if (options.salesOrderId != null) {
    ids.salesOrderId = asPositiveInt(options.salesOrderId, "salesOrderId");
    ids.salesOrderItemId = asPositiveInt(
      options.salesOrderItemId,
      "salesOrderItemId",
    );
  }
  return ids;
}

function normalizeShipmentItems(rawItems, fallback, salesOrderId) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [fallback];
  if (rawItems.length > 25) {
    throw new CliError("shipmentItems supports at most 25 lines");
  }
  return rawItems.map((item, index) => {
    const salesOrderItemId = item.sales_order_item_id ?? item.salesOrderItemId;
    if ((salesOrderId == null) !== (salesOrderItemId == null)) {
      throw new CliError(
        `shipmentItems[${index}].sales_order_item_id must match the parent sales order linkage`,
      );
    }
    return {
      sales_order_item_id:
        salesOrderItemId == null
          ? undefined
          : asPositiveInt(
              salesOrderItemId,
              `shipmentItems[${index}].sales_order_item_id`,
            ),
      product_id: asPositiveInt(
        item.product_id,
        `shipmentItems[${index}].product_id`,
      ),
      product_sku_id: asPositiveInt(
        item.product_sku_id,
        `shipmentItems[${index}].product_sku_id`,
      ),
      warehouse_id: asPositiveInt(
        item.warehouse_id,
        `shipmentItems[${index}].warehouse_id`,
      ),
      unit_id: asPositiveInt(item.unit_id, `shipmentItems[${index}].unit_id`),
      quantity: requiredText(
        item.quantity || "1",
        `shipmentItems[${index}].quantity`,
      ),
      note:
        optionalText(item.note) ||
        `【试用】多明细出货第 ${String(index + 1).padStart(2, "0")} 行。`,
    };
  });
}

function buildPlan(options) {
  const ids = ensureIDs(options);
  const prefix = `${SIMULATION_PREFIX}-${options.runId}`;
  const productionSampleType = options.productionSampleType || "REWORK";
  const productionSampleUsesMaterial =
    productionSampleType === "MATERIAL_ISSUE";
  const shipmentItem = {
    sales_order_item_id: ids.salesOrderItemId,
    product_id: ids.productId,
    product_sku_id: ids.productSkuId,
    warehouse_id: ids.warehouseId,
    unit_id: ids.unitId,
    quantity: "3",
    note: "【试用】出货明细：3 件成品。",
  };
  const shipmentItems = normalizeShipmentItems(
    options.shipmentItems,
    shipmentItem,
    ids.salesOrderId,
  );
  return {
    customerKey: "yoyoosun",
    scope: "Operational Facts",
    simulatedOnly: true,
    realCustomerImport: false,
    customerAcceptanceRequiredForClosure: false,
    applySupported: false,
    applyRetiredReason: APPLY_RETIRED_MESSAGE,
    requiredApplyInputs: [],
    simulationPrefix: SIMULATION_PREFIX,
    runId: options.runId,
    backendURL: options.backendURL,
    ids,
    records: {
      productionReceipt: {
        fact_no: `${prefix}-PROD-IN`,
        fact_type: "FINISHED_GOODS_RECEIPT",
        subject_type: "PRODUCT",
        subject_id: ids.productId,
        product_sku_id: ids.productSkuId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "20",
        source_type: ids.salesOrderId ? "SALES_ORDER" : undefined,
        source_id: ids.salesOrderId,
        idempotency_key: `${prefix}:PRODUCTION:RECEIPT`,
        note: "【试用】生产完工入库：查看草稿、过账、取消和库存恢复。",
      },
      productionDraftSample: {
        fact_no: `${prefix}-PROD-SAMPLE`,
        fact_type: productionSampleType,
        subject_type: productionSampleUsesMaterial ? "MATERIAL" : "PRODUCT",
        subject_id: productionSampleUsesMaterial
          ? ids.materialId
          : ids.productId,
        product_sku_id: productionSampleUsesMaterial
          ? undefined
          : ids.productSkuId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "1",
        source_type: ids.salesOrderId ? "SALES_ORDER" : undefined,
        source_id: ids.salesOrderId,
        idempotency_key: `${prefix}:PRODUCTION:SAMPLE`,
        note: "【试用】生产进度草稿：查看生产类型、产品、数量和当前状态。",
      },
      outsourcingIssue: {
        fact_no: `${prefix}-OUT-MAT`,
        fact_type: "MATERIAL_ISSUE",
        subject_type: "MATERIAL",
        subject_id: ids.materialId,
        product_sku_id: undefined,
        supplier_id: ids.supplierId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "2",
        supplier_name:
          optionalText(options.supplierName) || "【试用】模拟委外供应商",
        source_type: ids.salesOrderId ? "SALES_ORDER" : undefined,
        source_id: ids.salesOrderId,
        idempotency_key: `${prefix}:OUTSOURCING:ISSUE`,
        note: "【试用】委外发料：查看过账后取消和库存冲回。",
      },
      stockReservationRelease: {
        reservation_no: `${prefix}-RSV-REL`,
        sales_order_id: ids.salesOrderId,
        sales_order_item_id: ids.salesOrderItemId,
        warehouse_id: ids.warehouseId,
        quantity: "1",
        idempotency_key: `${prefix}:RESERVATION:RELEASE`,
        note: "【试用】库存预留：创建后主动释放，不占用后续可用库存。",
      },
      shipment: {
        shipment_no: `${prefix}-SHP`,
        sales_order_id: ids.salesOrderId,
        customer_id: ids.customerId,
        customer_snapshot:
          optionalText(options.customerName) ||
          "【试用】成品出货与应收联动客户",
        idempotency_key: `${prefix}:SHIPMENT`,
        note: "【试用】出货单：已出货后查看应收和发票，取消后核对库存冲回。",
      },
      shipmentItem,
      shipmentItems,
      financeSettle: {
        fact_no: `${prefix}-FIN-SET`,
        fact_type: "RECEIVABLE",
        counterparty_type: "CUSTOMER",
        counterparty_id: ids.customerId,
        amount: "128.50",
        fee_amount: "2.50",
        currency: "CNY",
        collection_type: options.collectionType || "ACCOUNTS_RECEIVABLE",
        payment_term: options.paymentTerm || "EOM_30",
        payment_term_days: options.paymentTermDays ?? 30,
        invoice_category: options.invoiceCategory || "VAT_GENERAL_1",
        source_type: undefined,
        idempotency_key: `${prefix}:FINANCE:SETTLE`,
        note: "【试用】应收款：由已出货单产生，查看金额、来源和当前状态。",
        target_status: options.receivableStatus || "SETTLED",
      },
      financeCancel: {
        fact_no: `${prefix}-FIN-CAN`,
        fact_type: "INVOICE",
        counterparty_type: "CUSTOMER",
        counterparty_id: ids.customerId,
        amount: "36.80",
        fee_amount: "0.00",
        currency: "CNY",
        collection_type: options.collectionType || "ACCOUNTS_RECEIVABLE",
        payment_term: options.paymentTerm || "EOM_30",
        payment_term_days: options.paymentTermDays ?? 30,
        invoice_category: options.invoiceCategory || "VAT_GENERAL_1",
        source_type: undefined,
        idempotency_key: `${prefix}:FINANCE:CANCEL`,
        note: "【试用】发票：由已出货单产生，查看金额、来源和当前状态。",
        target_status: options.invoiceStatus || "CANCELLED",
      },
      financeReconciliation: {
        fact_no: `${prefix}-FIN-REC`,
        fact_type: "RECONCILIATION",
        counterparty_type: options.reconciliationCounterpartyType || "CUSTOMER",
        counterparty_id: options.reconciliationCounterpartyId || ids.customerId,
        amount: "88.60",
        fee_amount: "1.20",
        currency: "CNY",
        payment_term: options.paymentTerm || "EOM_30",
        payment_term_days: options.paymentTermDays ?? 30,
        invoice_category: options.invoiceCategory || "VAT_GENERAL_1",
        source_type: undefined,
        idempotency_key: `${prefix}:FINANCE:RECONCILIATION`,
        note: "【试用】对账记录：查看金额、往来说明和当前状态。",
        target_status: options.reconciliationStatus || "POSTED",
      },
      financePayable: ids.supplierId
        ? {
            fact_no: `${prefix}-FIN-PAYABLE`,
            fact_type: "PAYABLE",
            counterparty_type: "SUPPLIER",
            counterparty_id: ids.supplierId,
            amount: "268.80",
            fee_amount: "1.80",
            currency: "CNY",
            payment_term: options.paymentTerm || "EOM_30",
            payment_term_days: options.paymentTermDays ?? 30,
            invoice_category: options.invoiceCategory || "VAT_GENERAL_1",
            source_type: undefined,
            idempotency_key: `${prefix}:FINANCE:PAYABLE`,
            note: "【试用】供应商应付款：核对供应商、金额、账期、来源和当前状态。",
            target_status: options.payableStatus || "POSTED",
          }
        : null,
    },
  };
}

async function applyPlan() {
  throw new CliError(APPLY_RETIRED_MESSAGE, 2);
}

function buildMarkdownReport(report) {
  const lines = [
    "# Operational Fact Simulated Closure Report",
    "",
    `- mode: ${report.mode}`,
    `- backend: ${report.plan.backendURL}`,
    `- runId: ${report.plan.runId}`,
    `- simulatedOnly: ${report.plan.simulatedOnly}`,
    `- realCustomerImport: ${report.plan.realCustomerImport}`,
    `- customerAcceptanceRequiredForClosure: ${report.plan.customerAcceptanceRequiredForClosure}`,
    "",
    "## IDs",
    "",
    `- customer_id: ${report.plan.ids.customerId}`,
    `- product_id: ${report.plan.ids.productId}`,
    `- unit_id: ${report.plan.ids.unitId}`,
    `- warehouse_id: ${report.plan.ids.warehouseId}`,
    "",
    "## Steps",
    "",
  ];
  if (report.steps.length === 0) {
    lines.push("- report-only: no JSON-RPC writes executed");
  } else {
    for (const step of report.steps) {
      lines.push(
        `- ${step.label}: ${step.status}${step.id ? ` id=${step.id}` : ""}`,
      );
    }
  }
  lines.push(
    "",
    "## Boundary",
    "",
    "- This report is simulated operational fact evidence only.",
    "- It is not real customer data import and not customer sign-off.",
  );
  return `${lines.join("\n")}\n`;
}

async function writeReports(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(
    outDir,
    "operational-fact-simulated-closure-report.json",
  );
  const markdownPath = path.join(
    outDir,
    "operational-fact-simulated-closure-report.md",
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
    mode: "report-only",
    generatedAt: new Date().toISOString(),
    plan,
    steps: [],
  };

  const output = await writeReports(options.out, report);
  process.stdout.write(
    `[qa:operational-fact-simulated-closure] ${report.mode} complete. json=${output.jsonPath} md=${output.markdownPath}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[qa:operational-fact-simulated-closure][fatal] ${error?.stack || error?.message || error}\n`,
    );
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  });
}

export {
  APPLY_RETIRED_MESSAGE,
  applyPlan,
  assertLocalBackendURL,
  buildInputTemplate,
  buildPlan,
  buildTimestampRunId,
  INPUT_TEMPLATE_SCOPE,
  parseCliArgs,
  sanitizeRunId,
};
