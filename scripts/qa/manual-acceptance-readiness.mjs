#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { expectedAccounts } from "./trial-account-rbac.mjs";
import { buildManualAcceptanceCatalog } from "./manual-acceptance-catalog.mjs";

const CUSTOMER_KEY = "yoyoosun";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/readiness";
const MOBILE_TASK_TOTAL = 180;
const MOBILE_TASKS_PER_ROLE = 20;
const QUERY_LIMIT = 200;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_ENVIRONMENTS = new Set(["local", "dev"]);
const RUNTIME_PREFLIGHT_USERNAME = "admin";
const TASK_SOURCE_TYPE = "simulated-manual-acceptance-task-batch";
const TASK_STATUS_COUNTS_PER_ROLE = Object.freeze({
  PENDING: 4,
  READY: 4,
  PROCESSING: 4,
  BLOCKED: 3,
  DONE: 3,
  REJECTED: 2,
});
const TASK_REQUIRED_STATUSES = Object.freeze(
  Object.keys(TASK_STATUS_COUNTS_PER_ROLE),
);
const TASK_ROLE_KEYS = Object.freeze(
  expectedAccounts
    .filter(([, , mobilePermission]) => Boolean(mobilePermission))
    .map(([, roleKey]) => roleKey),
);

const DESKTOP_DATASET_BY_PAGE = Object.freeze({
  customers: "customers",
  suppliers: "suppliers",
  products: "product-skus",
  materials: "materials",
  "sales-orders": "sales-orders",
  "material-bom": "bom-versions",
  processes: "processes",
  "accessories-purchase": "purchase-orders",
  "quality-inspections": "quality-inspections",
  inbound: "purchase-receipts",
  "processing-contracts": "outsourcing-orders",
  "production-progress": "production-facts",
  outbound: "stock-reservations",
  shipments: "shipments",
  reconciliation: "finance-reconciliation",
  payables: "finance-payables",
  receivables: "finance-receivables",
  invoices: "finance-invoices",
  "system-audit-logs": "audit-events",
});

const PRINT_SUPPORT_DATASET = Object.freeze({
  "material-purchase-contract": "purchase-orders",
  "processing-contract": "outsourcing-orders",
  "engineering-material-detail": "bom-versions",
  "engineering-color-card": "bom-versions",
  "engineering-work-instruction": "bom-versions",
});

const SOURCE_EXPECTATION_KEYS = Object.freeze({
  customers: "customers",
  suppliers: "suppliers",
  materials: "materials",
  "product-skus": "productSkus",
  processes: "processes",
  "sales-orders": "salesOrders",
  "purchase-orders": "purchaseOrders",
  "outsourcing-orders": "outsourcingOrders",
  "bom-versions": "bomVersions",
});

const FACT_EXPECTATION_KEYS = Object.freeze({
  "production-facts": "production",
  "inventory-balances": "inventoryBalances",
  "stock-reservations": "stockReservations",
  shipments: "shipments",
  "finance-reconciliation": "reconciliation",
  "finance-payables": "payables",
  "finance-receivables": "receivables",
  "finance-invoices": "invoices",
  "purchase-receipts": "purchaseReceipts",
  "quality-inspections": "qualityInspections",
});

const DATASET_BLUEPRINTS = Object.freeze({
  customers: {
    roleKey: "sales",
    domain: "masterdata",
    method: "list_customers",
    listKey: "customers",
    statusField: "is_active",
    requiredStatuses: ["ACTIVE", "INACTIVE"],
    batchReport: "source",
    batchMatchField: "code",
  },
  suppliers: {
    roleKey: "purchase",
    domain: "masterdata",
    method: "list_suppliers",
    listKey: "suppliers",
    statusField: "is_active",
    requiredStatuses: ["ACTIVE", "INACTIVE"],
    batchReport: "source",
    batchMatchField: "code",
  },
  "product-skus": {
    roleKey: "engineering",
    domain: "masterdata",
    method: "list_product_skus",
    listKey: "product_skus",
    statusField: "is_active",
    requiredStatuses: ["ACTIVE", "INACTIVE"],
    batchReport: "source",
    batchMatchField: "sku_code",
  },
  materials: {
    roleKey: "engineering",
    domain: "masterdata",
    method: "list_materials",
    listKey: "materials",
    statusField: "is_active",
    requiredStatuses: ["ACTIVE", "INACTIVE"],
    batchReport: "source",
    batchMatchField: "code",
  },
  "sales-orders": {
    roleKey: "sales",
    domain: "sales_order",
    method: "list_sales_orders",
    listKey: "sales_orders",
    statusField: "lifecycle_status",
    requiredStatuses: ["DRAFT", "SUBMITTED", "ACTIVE", "CLOSED", "CANCELED"],
    batchReport: "source",
    batchMatchField: "order_no",
  },
  "bom-versions": {
    roleKey: "engineering",
    domain: "bom",
    method: "list_bom_versions",
    listKey: "bom_versions",
    statusField: "status",
    requiredStatuses: ["DRAFT", "ACTIVE", "ARCHIVED"],
    batchReport: "source",
    batchMatchField: "version",
  },
  processes: {
    roleKey: "engineering",
    domain: "masterdata",
    method: "list_processes",
    listKey: "processes",
    statusField: "is_active",
    requiredStatuses: ["ACTIVE", "INACTIVE"],
    batchReport: "source",
    batchMatchField: "code",
  },
  "purchase-orders": {
    roleKey: "purchase",
    domain: "purchase_order",
    method: "list_purchase_orders",
    listKey: "purchase_orders",
    statusField: "lifecycle_status",
    requiredStatuses: ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELED"],
    batchReport: "source",
    batchMatchField: "purchase_order_no",
  },
  "quality-inspections": {
    roleKey: "quality",
    domain: "quality",
    method: "list_quality_inspections",
    listKey: "quality_inspections",
    statusField: "status",
    requiredStatuses: ["DRAFT", "SUBMITTED", "PASSED", "REJECTED", "CANCELLED"],
    batchReport: "fact-unfilterable",
    batchNotProvenReason:
      "当前质检查询只支持检验单号和关联记录筛选，不能按本次试用批次前缀可靠核对。",
  },
  "purchase-receipts": {
    roleKey: "warehouse",
    domain: "purchase",
    method: "list_purchase_receipts",
    listKey: "purchase_receipts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
    batchReport: "fact-purchase-quality",
    batchMatchField: "receipt_no",
  },
  "inventory-balances": {
    roleKey: "warehouse",
    domain: "inventory",
    method: "list_inventory_balances",
    listKey: "inventory_balances",
    batchReport: "fact-unfilterable",
    batchNotProvenReason:
      "库存余额查询只支持对象编号等条件，不能按本次试用批次前缀可靠核对。",
  },
  "inventory-lots": {
    roleKey: "warehouse",
    domain: "inventory",
    method: "list_inventory_lots",
    listKey: "inventory_lots",
    statusField: "status",
    requiredStatuses: ["HOLD", "ACTIVE", "REJECTED"],
    batchReport: "fact-unfilterable",
    batchNotProvenReason:
      "采购入库生成的内部批次号不保留试用批次前缀，当前批次查询也不能按报告中的批次编号集合过滤。",
  },
  "inventory-txns": {
    roleKey: "warehouse",
    domain: "inventory",
    method: "list_inventory_txns",
    listKey: "inventory_txns",
    statusField: "txn_type",
    requiredStatuses: ["IN", "OUT", "REVERSAL"],
    batchReport: "fact-unfilterable",
    batchNotProvenReason:
      "库存流水的去重键只保留业务对象类型和编号，不能按本次试用批次前缀可靠核对。",
  },
  "outsourcing-orders": {
    roleKey: "production",
    domain: "outsourcing_order",
    method: "list_outsourcing_orders",
    listKey: "outsourcing_orders",
    statusField: "lifecycle_status",
    requiredStatuses: ["DRAFT", "SUBMITTED", "CONFIRMED", "CLOSED", "CANCELED"],
    batchReport: "source",
    batchMatchField: "outsourcing_order_no",
  },
  "production-facts": {
    roleKey: "pmc",
    domain: "operational_fact",
    method: "list_production_facts",
    listKey: "production_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
    secondaryField: "fact_type",
    requiredSecondaryKinds: [
      "MATERIAL_ISSUE",
      "FINISHED_GOODS_RECEIPT",
      "REWORK",
    ],
    batchReport: "fact-operational",
    batchMatchField: "fact_no",
  },
  "stock-reservations": {
    roleKey: "warehouse",
    domain: "operational_fact",
    method: "list_stock_reservations",
    listKey: "stock_reservations",
    statusField: "status",
    requiredStatuses: ["ACTIVE", "RELEASED"],
    batchReport: "fact-operational",
    batchMatchField: "reservation_no",
  },
  shipments: {
    roleKey: "warehouse",
    domain: "operational_fact",
    method: "list_shipments",
    listKey: "shipments",
    statusField: "status",
    requiredStatuses: ["DRAFT", "SHIPPED", "CANCELLED"],
    batchReport: "fact-operational",
    batchMatchField: "shipment_no",
  },
  "finance-reconciliation": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact-operational",
    batchMatchField: "fact_no",
    params: { fact_type: "RECONCILIATION" },
  },
  "finance-payables": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact-operational",
    batchMatchField: "fact_no",
    params: { fact_type: "PAYABLE" },
  },
  "finance-receivables": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact-operational",
    batchMatchField: "fact_no",
    params: { fact_type: "RECEIVABLE" },
  },
  "finance-invoices": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact-operational",
    batchMatchField: "fact_no",
    params: { fact_type: "INVOICE" },
  },
  "permission-accounts": {
    roleKey: "admin",
    domain: "admin",
    method: "list",
    listKey: "admins",
    statusField: "disabled",
    requiredStatuses: ["ACTIVE", "DISABLED"],
    params: {},
  },
  "permission-roles": {
    roleKey: "admin",
    domain: "admin",
    method: "rbac_options",
    listKey: "roles",
    params: {},
  },
  "audit-events": {
    roleKey: "admin",
    domain: "admin",
    method: "audit_logs",
    listKey: "events",
    statusField: "source",
    params: { limit: QUERY_LIMIT, offset: 0 },
  },
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
  if (!text) throw new CliError(`${name} 不能为空`, 2);
  return text;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeBackendURL(value) {
  const url = new URL(requiredText(value, "--backend-url"));
  if (url.username || url.password) {
    throw new CliError("后端地址不能包含账号或密码", 2);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new CliError("后端地址必须使用 http 或 https", 2);
  }
  const hostname = url.hostname
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new CliError("只允许核对本机 loopback 后端", 2);
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

function validateSourceReport(report) {
  if (!report) return null;
  if (
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    !report.scale ||
    !String(report.runId || "").trim() ||
    !String(report.prefix || "").trim()
  ) {
    throw new CliError("源数据报告不是有效的模拟试用写入报告", 2);
  }
  return report;
}

function validateFactReport(report) {
  if (!report) return null;
  if (
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    !report.expectedMinimums ||
    !String(report.runId || "").trim() ||
    !String(report.sourceRunId || "").trim()
  ) {
    throw new CliError("业务记录报告不是有效的模拟试用写入报告", 2);
  }
  return report;
}

function validateTaskReport(report) {
  if (!report) return null;
  const runId = String(report.runId || "").trim();
  const prefix = String(report.prefix || "").trim();
  const byRole = report.summary?.byRole || {};
  const byStatus = report.summary?.byStatus || {};
  const rolesAreExact =
    Object.keys(byRole).length === TASK_ROLE_KEYS.length &&
    TASK_ROLE_KEYS.every(
      (roleKey) => Number(byRole[roleKey]) === MOBILE_TASKS_PER_ROLE,
    );
  const statusesAreExact =
    Object.keys(byStatus).length === TASK_REQUIRED_STATUSES.length &&
    TASK_REQUIRED_STATUSES.every(
      (status) =>
        Number(byStatus[status.toLowerCase()]) ===
        TASK_STATUS_COUNTS_PER_ROLE[status] * TASK_ROLE_KEYS.length,
    );
  if (
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    report.writesFacts !== false ||
    report.summary?.total !== MOBILE_TASK_TOTAL ||
    report.summary?.persisted !== MOBILE_TASK_TOTAL ||
    !rolesAreExact ||
    !statusesAreExact ||
    !runId ||
    prefix !== `SIM-YOYOOSUN-UAT-TASK-${runId}` ||
    report.sourceType !== TASK_SOURCE_TYPE ||
    !Number.isSafeInteger(Number(report.sourceID)) ||
    Number(report.sourceID) <= 0
  ) {
    throw new CliError("岗位任务报告不是有效的模拟试用写入报告", 2);
  }
  return report;
}

function validateReportBatch(sourceReport, factReport, taskReport) {
  const sourceRunId = String(sourceReport?.runId || "").trim();
  const factSourceRunId = String(factReport?.sourceRunId || "").trim();
  const taskRunId = String(taskReport?.runId || "").trim();
  const batchRunIds = [sourceRunId, factSourceRunId, taskRunId].filter(Boolean);
  if (new Set(batchRunIds).size > 1) {
    throw new CliError("源数据、业务记录与岗位任务报告不是同一批次", 2);
  }
  if (sourceReport && factReport) {
    const sourcePrefix = String(sourceReport.prefix || "").trim();
    const factSourcePrefix = String(factReport.sourcePrefix || "").trim();
    if (factSourcePrefix && sourcePrefix !== factSourcePrefix) {
      throw new CliError("源数据报告与业务记录报告不是同一批次", 2);
    }
  }
}

function flattenCatalog(catalog) {
  return [
    ...catalog.technicalManifest.entries.map((item) => ({
      ...item,
      catalogGroup: "entries",
    })),
    ...catalog.technicalManifest.desktopPages.map((item) => ({
      ...item,
      catalogGroup: "desktopPages",
    })),
    ...catalog.technicalManifest.mobileRolePages.map((item) => ({
      ...item,
      catalogGroup: "mobileRolePages",
    })),
    ...catalog.technicalManifest.printPreviewPages.map((item) => ({
      ...item,
      catalogGroup: "printPreviewPages",
    })),
    ...catalog.technicalManifest.printWorkspacePages.map((item) => ({
      ...item,
      catalogGroup: "printWorkspacePages",
    })),
  ];
}

function targetId(item) {
  return `${item.catalogGroup}:${item.key}`;
}

function catalogMinimum(catalog, pageKey) {
  const item = catalog.technicalManifest.desktopPages.find(
    (candidate) => candidate.key === pageKey,
  );
  if (!item) throw new CliError(`验收目录缺少页面 ${pageKey}`);
  return item.minimumRecords;
}

function declaredExpectations(sourceReport, factReport) {
  const values = {};
  if (sourceReport) {
    for (const [datasetId, reportKey] of Object.entries(
      SOURCE_EXPECTATION_KEYS,
    )) {
      const value =
        reportKey === "productSkus"
          ? Number(sourceReport.scale.products) *
            Number(sourceReport.scale.skusPerProduct)
          : Number(sourceReport.scale[reportKey]);
      if (Number.isInteger(value) && value >= 0) values[datasetId] = value;
    }
  }
  if (factReport) {
    for (const [datasetId, reportKey] of Object.entries(
      FACT_EXPECTATION_KEYS,
    )) {
      const value = positiveInteger(factReport.expectedMinimums[reportKey]);
      if (value !== null) values[datasetId] = value;
    }
  }
  return values;
}

function buildCanonicalMinimums(catalog) {
  const minimums = {};
  for (const [pageKey, datasetId] of Object.entries(DESKTOP_DATASET_BY_PAGE)) {
    minimums[datasetId] = catalogMinimum(catalog, pageKey);
  }
  const inventoryMinimum = catalogMinimum(catalog, "inventory");
  minimums["inventory-balances"] = inventoryMinimum;
  minimums["inventory-lots"] = inventoryMinimum;
  minimums["inventory-txns"] = inventoryMinimum;
  minimums["permission-accounts"] = catalogMinimum(
    catalog,
    "permission-center",
  );
  minimums["permission-roles"] = 10;
  minimums["audit-events"] = catalogMinimum(catalog, "system-audit-logs");
  return minimums;
}

function buildInputWarnings(canonical, declared) {
  return Object.entries(declared)
    .filter(
      ([datasetId, minimum]) =>
        canonical[datasetId] != null && minimum < canonical[datasetId],
    )
    .map(([datasetId, minimum]) => ({
      datasetId,
      declaredMinimum: minimum,
      requiredMinimum: canonical[datasetId],
      message: "写入报告声明的数量低于当前验收目录要求",
    }));
}

function resolveBatchEvidence(blueprint, sourceReport, factReport) {
  if (!blueprint.batchReport) {
    return {
      batchEvidence: "not_applicable",
      batchPrefix: null,
      batchNotProvenReason: null,
    };
  }
  if (blueprint.batchReport === "fact-unfilterable") {
    return {
      batchEvidence: "not_proven",
      batchPrefix: null,
      batchNotProvenReason: blueprint.batchNotProvenReason,
    };
  }
  if (blueprint.batchReport === "source") {
    const prefix = String(sourceReport?.prefix || "").trim();
    return prefix
      ? {
          batchEvidence: "prefix_filtered",
          batchPrefix: prefix,
          batchNotProvenReason: null,
        }
      : {
          batchEvidence: "not_proven",
          batchPrefix: null,
          batchNotProvenReason:
            "未提供本次源数据写入报告，不能用历史总数代替本批数据。",
        };
  }
  const factRunId = String(factReport?.runId || "").trim();
  if (!factRunId) {
    return {
      batchEvidence: "not_proven",
      batchPrefix: null,
      batchNotProvenReason:
        "未提供本次业务记录写入报告，不能用历史总数代替本批数据。",
    };
  }
  const familyPrefix =
    blueprint.batchReport === "fact-purchase-quality"
      ? `SIM-YOYOOSUN-PQ-${factRunId}`
      : `SIM-YOYOOSUN-OPFACT-${factRunId}`;
  return {
    batchEvidence: "prefix_filtered",
    batchPrefix: familyPrefix,
    batchNotProvenReason: null,
  };
}

function buildDatasetProbes(catalog, sourceReport, factReport, taskReport) {
  const canonical = buildCanonicalMinimums(catalog);
  const declared = declaredExpectations(sourceReport, factReport);
  const probes = Object.entries(DATASET_BLUEPRINTS).map(([id, blueprint]) => {
    const batch = resolveBatchEvidence(blueprint, sourceReport, factReport);
    const params = {
      ...(blueprint.params ??
        (blueprint.domain === "admin"
          ? {}
          : { active_only: false, limit: QUERY_LIMIT, offset: 0 })),
      ...(batch.batchEvidence === "prefix_filtered"
        ? { keyword: batch.batchPrefix }
        : {}),
    };
    return {
      id,
      ...blueprint,
      ...batch,
      params,
      expectedMinimum: Math.max(canonical[id] ?? 0, declared[id] ?? 0),
      declaredMinimum: declared[id] ?? null,
      readOnly: true,
    };
  });
  probes.push({
    id: "boss-dashboard-tasks",
    roleKey: "boss",
    username: "demo_boss",
    domain: "workflow",
    method: "list_tasks",
    listKey: "tasks",
    statusField: "task_status_key",
    requiredStatuses: [...TASK_REQUIRED_STATUSES],
    requiredStatusCounts: { ...TASK_STATUS_COUNTS_PER_ROLE },
    expectedMinimum: MOBILE_TASKS_PER_ROLE,
    expectedExact: MOBILE_TASKS_PER_ROLE,
    declaredMinimum: null,
    params: {
      ...(taskReport
        ? {
            source_type: taskReport.sourceType,
            source_id: taskReport.sourceID,
            owner_role_key: "boss",
          }
        : {}),
      limit: QUERY_LIMIT,
      offset: 0,
    },
    batchEvidence: taskReport ? "exact_source" : "not_proven",
    exactSourceType: taskReport?.sourceType || null,
    exactSourceID: taskReport?.sourceID || null,
    exactTaskPrefix: taskReport?.prefix || null,
    exactOwnerRoleKey: taskReport ? "boss" : null,
    batchNotProvenReason: taskReport
      ? null
      : "未提供本次岗位任务写入报告，不能用历史任务数量代替本批任务。",
    readOnly: true,
  });
  for (const account of expectedAccounts.filter((item) => item[2])) {
    const [username, roleKey] = account;
    probes.push({
      id: `mobile-tasks:${roleKey}`,
      roleKey,
      username,
      domain: "workflow",
      method: "list_tasks",
      listKey: "tasks",
      statusField: "task_status_key",
      requiredStatuses: [...TASK_REQUIRED_STATUSES],
      requiredStatusCounts: { ...TASK_STATUS_COUNTS_PER_ROLE },
      expectedMinimum: MOBILE_TASKS_PER_ROLE,
      expectedExact: MOBILE_TASKS_PER_ROLE,
      declaredMinimum: null,
      params: {
        owner_role_key: roleKey,
        ...(taskReport
          ? {
              source_type: taskReport.sourceType,
              source_id: taskReport.sourceID,
            }
          : {}),
        limit: QUERY_LIMIT,
        offset: 0,
      },
      batchEvidence: taskReport ? "exact_source" : "not_proven",
      exactSourceType: taskReport?.sourceType || null,
      exactSourceID: taskReport?.sourceID || null,
      exactTaskPrefix: taskReport?.prefix || null,
      exactOwnerRoleKey: taskReport ? roleKey : null,
      batchNotProvenReason: taskReport
        ? null
        : "未提供本次岗位任务写入报告，不能用历史任务数量代替本批任务。",
      readOnly: true,
    });
  }
  return {
    probes,
    inputWarnings: buildInputWarnings(canonical, declared),
  };
}

function targetEvidence(item) {
  if (item.catalogGroup === "entries") {
    return {
      probeIds: ["permission-accounts", "valid-account-logins"],
      actualProbeId: "permission-accounts",
      browserRequired: true,
      reason:
        "账号数量和正常登录可由系统查询核对；错误密码、停用账号提示及入口切换仍需页面操作确认。",
    };
  }
  if (item.catalogGroup === "mobileRolePages") {
    return {
      probeIds: [`mobile-tasks:${item.key}`],
      browserRequired: true,
      reason: "任务数量和状态可核对，页面操作与恢复状态仍需页面确认。",
    };
  }
  if (
    item.catalogGroup === "printPreviewPages" ||
    item.catalogGroup === "printWorkspacePages"
  ) {
    return {
      probeIds: [PRINT_SUPPORT_DATASET[item.key]].filter(Boolean),
      browserRequired: true,
      quantityNotProven: true,
      reason:
        "业务来源记录可以核对，但纸面明细行数、分页和编辑恢复不能由清单查询证明。",
    };
  }
  if (item.key === "global-dashboard" || item.key === "task-board") {
    return {
      probeIds: ["mobile-task-total", "boss-dashboard-tasks"],
      actualProbeId: "mobile-task-total",
      browserRequired: true,
      reason:
        "九个岗位合计数量与老板账号实际可见任务分别核对；不把跨岗位总数冒充老板可见数量，卡片跳转和页面显示仍需页面确认。",
    };
  }
  const workflowRoleByPage = {
    "production-scheduling": "pmc",
    "production-exceptions": "production",
  };
  const workflowRoleKey = workflowRoleByPage[item.key];
  if (workflowRoleKey) {
    return {
      probeIds: [`mobile-tasks:${workflowRoleKey}`],
      actualProbeId: `mobile-tasks:${workflowRoleKey}`,
      browserRequired: true,
      reason:
        "本批岗位任务数量和状态可核对；排程或异常页面的筛选、详情和处理动作仍需页面确认。",
    };
  }
  if (item.key === "inventory") {
    return {
      probeIds: ["inventory-balances", "inventory-lots", "inventory-txns"],
      combine: "minimum",
      browserRequired: true,
      reason: "余额、批次和流水分别核对，页面切换与相互对照仍需页面确认。",
    };
  }
  if (item.key === "print-center") {
    return {
      probeIds: ["catalog-print-templates"],
      browserRequired: true,
      reason: "模板数量来自当前正式目录，模板打开和纸面内容仍需页面确认。",
    };
  }
  if (item.key === "permission-center") {
    return {
      probeIds: ["permission-accounts", "permission-roles"],
      actualProbeId: "permission-accounts",
      browserRequired: true,
      reason: "账号和岗位模板数量可核对，筛选及权限调整仍需页面确认。",
    };
  }
  const datasetId = DESKTOP_DATASET_BY_PAGE[item.key];
  if (!datasetId) {
    throw new CliError(`页面 ${item.key} 没有只读数据核验口径`);
  }
  return {
    probeIds: [datasetId],
    browserRequired: true,
    reason: "数量和状态分布可核对，筛选、详情及业务操作仍需页面确认。",
  };
}

export function buildManualAcceptanceReadinessPlan(options = {}) {
  const catalog = options.catalog || buildManualAcceptanceCatalog();
  const sourceReport = validateSourceReport(options.sourceReport || null);
  const factReport = validateFactReport(options.factReport || null);
  const taskReport = validateTaskReport(options.taskReport || null);
  validateReportBatch(sourceReport, factReport, taskReport);
  const allTargets = flattenCatalog(catalog).map((item) => ({
    id: targetId(item),
    key: item.key,
    title: item.title,
    route: item.route,
    catalogGroup: item.catalogGroup,
    roleKeys: [...item.roleKeys],
    expectedMinimum: item.minimumRecords,
    expectedUnit: item.minimumRecordUnit,
    ...targetEvidence(item),
  }));
  if (allTargets.length !== 47) {
    throw new CliError(
      `当前验收目标应为 47 个，实际为 ${allTargets.length} 个`,
    );
  }
  const { probes, inputWarnings } = buildDatasetProbes(
    catalog,
    sourceReport,
    factReport,
    taskReport,
  );
  return {
    mode: "plan",
    scope: "manual-acceptance-readiness",
    customerKey: CUSTOMER_KEY,
    readOnly: true,
    writesBackend: false,
    writesBusinessData: false,
    authenticationMayAppendAudit: false,
    directSQL: false,
    callsBackend: false,
    expected: {
      targets: 45,
      mobileRolePages: 9,
      mobileTasksPerRole: MOBILE_TASKS_PER_ROLE,
      mobileTaskTotal: MOBILE_TASK_TOTAL,
    },
    reportInputs: {
      sourceReport: sourceReport
        ? { runId: sourceReport.runId, prefix: sourceReport.prefix }
        : null,
      factReport: factReport
        ? {
            runId: factReport.runId,
            sourceRunId: factReport.sourceRunId,
            sourcePrefix: factReport.sourcePrefix || null,
          }
        : null,
      taskReport: taskReport
        ? {
            runId: taskReport.runId,
            prefix: taskReport.prefix,
            sourceType: taskReport.sourceType,
            sourceID: taskReport.sourceID,
          }
        : null,
    },
    inputWarnings,
    accountProjections: expectedAccounts.map(
      ([username, roleKey, mobilePermission]) => ({
        username,
        roleKey,
        mobilePermission: mobilePermission || null,
      }),
    ),
    probes,
    targets: allTargets,
    boundary:
      "默认只生成核验计划。系统查询只证明数据数量与状态分布；页面显示、交互、打印分页和人工验收结论必须另行确认。",
  };
}

function statusLabel(item, field) {
  if (!field) return "";
  const value = item?.[field];
  if (field === "is_active") return value === false ? "INACTIVE" : "ACTIVE";
  if (field === "disabled") return value === true ? "DISABLED" : "ACTIVE";
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function statusCounts(items, field) {
  const counts = {};
  for (const item of items) {
    const label = statusLabel(item, field);
    if (!label) continue;
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

export function evaluateManualAcceptanceDataset(probe, data) {
  const requiredStatuses = (probe.requiredStatuses || []).map((item) =>
    String(item).toUpperCase(),
  );
  const requiredSecondaryKinds = (probe.requiredSecondaryKinds || []).map(
    (item) => String(item).toUpperCase(),
  );
  const requiredStatusCounts = Object.fromEntries(
    Object.entries(probe.requiredStatusCounts || {}).map(([key, value]) => [
      String(key).toUpperCase(),
      Number(value),
    ]),
  );
  if (probe.batchEvidence === "not_proven") {
    return {
      id: probe.id,
      status: "not_proven",
      expectedMinimum: probe.expectedMinimum,
      expectedExact: probe.expectedExact ?? null,
      actual: null,
      returned: 0,
      statusCounts: {},
      statusKinds: 0,
      requiredStatuses,
      missingStatuses: [...requiredStatuses],
      requiredStatusCounts,
      mismatchedStatusCounts: Object.fromEntries(
        Object.entries(requiredStatusCounts).map(([status, expected]) => [
          status,
          { expected, actual: 0 },
        ]),
      ),
      secondaryCounts: {},
      secondaryKinds: 0,
      requiredSecondaryKinds,
      missingSecondaryKinds: [...requiredSecondaryKinds],
      enoughRecords: false,
      enoughStatuses: false,
      enoughSecondaryKinds: false,
      batchEvidence: probe.batchEvidence,
      batchPrefix: null,
      error: null,
      notProvenReason: probe.batchNotProvenReason,
    };
  }
  const items = Array.isArray(data?.[probe.listKey])
    ? data[probe.listKey]
    : null;
  if (!items) {
    return {
      id: probe.id,
      status: "error",
      expectedMinimum: probe.expectedMinimum,
      expectedExact: probe.expectedExact ?? null,
      actual: null,
      statusCounts: {},
      statusKinds: 0,
      requiredStatuses,
      missingStatuses: [...requiredStatuses],
      requiredStatusCounts,
      mismatchedStatusCounts: Object.fromEntries(
        Object.entries(requiredStatusCounts).map(([status, expected]) => [
          status,
          { expected, actual: 0 },
        ]),
      ),
      secondaryCounts: {},
      secondaryKinds: 0,
      requiredSecondaryKinds,
      missingSecondaryKinds: [...requiredSecondaryKinds],
      batchEvidence: probe.batchEvidence || "not_applicable",
      batchPrefix: probe.batchPrefix || null,
      error: `查询结果缺少 ${probe.listKey}`,
    };
  }
  const batchItems =
    probe.batchEvidence === "exact_source"
      ? items.filter(
          (item) =>
            item?.source_type === probe.exactSourceType &&
            Number(item?.source_id) === Number(probe.exactSourceID) &&
            (!probe.exactTaskPrefix ||
              String(item?.task_code || "").startsWith(
                `${probe.exactTaskPrefix}-`,
              )) &&
            (!probe.exactOwnerRoleKey ||
              item?.owner_role_key === probe.exactOwnerRoleKey),
        )
      : probe.batchPrefix
        ? items.filter((item) =>
            String(item?.[probe.batchMatchField] || "").startsWith(
              probe.batchPrefix,
            ),
          )
        : items;
  const responseTotal = positiveInteger(data.total);
  const batchScoped =
    probe.batchEvidence === "exact_source" || Boolean(probe.batchPrefix);
  const actual = batchScoped
    ? batchItems.length
    : (responseTotal ?? batchItems.length);
  const counts = statusCounts(batchItems, probe.statusField);
  const kinds = Object.keys(counts).length;
  const secondaryCounts = statusCounts(batchItems, probe.secondaryField);
  const secondaryKinds = Object.keys(secondaryCounts).length;
  const enoughRecords =
    probe.expectedExact == null
      ? actual >= probe.expectedMinimum
      : actual === probe.expectedExact;
  const missingStatuses = requiredStatuses.filter((item) => !counts[item]);
  const mismatchedStatusCounts = Object.fromEntries(
    Object.entries(requiredStatusCounts)
      .filter(([status, expected]) => Number(counts[status] || 0) !== expected)
      .map(([status, expected]) => [
        status,
        { expected, actual: Number(counts[status] || 0) },
      ]),
  );
  const missingSecondaryKinds = requiredSecondaryKinds.filter(
    (item) => !secondaryCounts[item],
  );
  const enoughStatuses =
    missingStatuses.length === 0 &&
    Object.keys(mismatchedStatusCounts).length === 0;
  const enoughSecondaryKinds = missingSecondaryKinds.length === 0;
  return {
    id: probe.id,
    status:
      enoughRecords && enoughStatuses && enoughSecondaryKinds ? "pass" : "fail",
    expectedMinimum: probe.expectedMinimum,
    expectedExact: probe.expectedExact ?? null,
    actual,
    returned: batchItems.length,
    responseReturned: items.length,
    responseTotal,
    statusField: probe.statusField || null,
    statusCounts: counts,
    statusKinds: kinds,
    requiredStatuses,
    missingStatuses,
    requiredStatusCounts,
    mismatchedStatusCounts,
    secondaryField: probe.secondaryField || null,
    secondaryCounts,
    secondaryKinds,
    requiredSecondaryKinds,
    missingSecondaryKinds,
    enoughRecords,
    enoughStatuses,
    enoughSecondaryKinds,
    batchEvidence: probe.batchEvidence || "not_applicable",
    batchPrefix: probe.batchPrefix || null,
    error: null,
    notProvenReason: null,
  };
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

let requestSequence = 0;

async function rpcCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl,
}) {
  requestSequence += 1;
  const response = await fetchImpl(rpcURL(backendURL, domain), {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `manual-acceptance-readiness-${requestSequence}`,
      method,
      params:
        domain === "auth" || domain === "admin"
          ? params
          : { customer_key: CUSTOMER_KEY, ...params },
    }),
  });
  if (response.redirected === true) {
    throw new Error(`${domain}.${method} 拒绝重定向响应`);
  }
  if (!response.ok)
    throw new Error(`${domain}.${method} HTTP ${response.status}`);
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new Error(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

async function loginAccount({ backendURL, username, password, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  const token = data.access_token || data.token;
  if (!token) throw new Error(`${username} 登录结果缺少访问凭据`);
  return token;
}

async function assertSafeReadRuntime({ backendURL, adminPassword, fetchImpl }) {
  const token = await loginAccount({
    backendURL,
    username: RUNTIME_PREFLIGHT_USERNAME,
    password: adminPassword,
    fetchImpl,
  });
  const capabilities = await rpcCall({
    backendURL,
    domain: "debug",
    method: "capabilities",
    token,
    fetchImpl,
  });
  if (!SAFE_ENVIRONMENTS.has(capabilities.environment)) {
    throw new CliError(
      `拒绝核对 environment=${capabilities.environment || "unknown"} 的运行时`,
      2,
    );
  }
  const sessionData = await rpcCall({
    backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token,
    fetchImpl,
  });
  const session = sessionData.session || {};
  const configRevision = String(
    session.configRevision || session.config_revision || "",
  ).trim();
  if (
    session?.customer?.key !== CUSTOMER_KEY ||
    session.source !== "active_customer_config_revision" ||
    !configRevision
  ) {
    throw new CliError(
      "拒绝核对：yoyoosun 当前运行时没有非空的已激活配置版本",
      2,
    );
  }
  return {
    username: RUNTIME_PREFLIGHT_USERNAME,
    environment: capabilities.environment,
    customerKey: session.customer.key,
    configRevision,
    source: session.source,
  };
}

async function loginAccounts({ backendURL, password, fetchImpl }) {
  const tokens = {};
  const results = [];
  for (const [username, roleKey] of expectedAccounts) {
    try {
      const token = await loginAccount({
        backendURL,
        username,
        password,
        fetchImpl,
      });
      tokens[roleKey] = token;
      results.push({ username, roleKey, status: "pass", error: null });
    } catch (error) {
      results.push({
        username,
        roleKey,
        status: "error",
        error: String(error?.message || error),
      });
    }
  }
  return { tokens, results };
}

function loginProbeResult(accountResults) {
  const actual = accountResults.filter((item) => item.status === "pass").length;
  return {
    id: "valid-account-logins",
    status: actual === expectedAccounts.length ? "pass" : "fail",
    expectedMinimum: expectedAccounts.length,
    actual,
    returned: actual,
    statusField: null,
    statusCounts: {},
    statusKinds: 0,
    requiredStatuses: [],
    missingStatuses: [],
    enoughRecords: actual === expectedAccounts.length,
    enoughStatuses: true,
    enoughSecondaryKinds: true,
    batchEvidence: "not_applicable",
    error: null,
  };
}

function mergeStatusCounts(results) {
  const counts = {};
  for (const result of results) {
    for (const [key, value] of Object.entries(result.statusCounts || {})) {
      counts[key] = (counts[key] || 0) + Number(value || 0);
    }
  }
  return counts;
}

function mobileTotalResult(mobileResults) {
  const unproven = mobileResults.some((item) => item?.status === "not_proven");
  const actual = mobileResults.reduce(
    (sum, item) => sum + Number(item.actual || 0),
    0,
  );
  const counts = mergeStatusCounts(mobileResults);
  const requiredStatuses = [
    "PENDING",
    "READY",
    "PROCESSING",
    "BLOCKED",
    "DONE",
    "REJECTED",
  ];
  const missingStatuses = requiredStatuses.filter((item) => !counts[item]);
  const allRolesPass = mobileResults.every((item) => item.status === "pass");
  return {
    id: "mobile-task-total",
    status: unproven
      ? "not_proven"
      : allRolesPass && actual >= MOBILE_TASK_TOTAL
        ? "pass"
        : "fail",
    expectedMinimum: MOBILE_TASK_TOTAL,
    actual: unproven ? null : actual,
    returned: mobileResults.reduce(
      (sum, item) => sum + Number(item.returned || 0),
      0,
    ),
    statusField: "task_status_key",
    statusCounts: counts,
    statusKinds: Object.keys(counts).length,
    requiredStatuses,
    missingStatuses,
    enoughRecords: !unproven && actual >= MOBILE_TASK_TOTAL,
    enoughStatuses: !unproven && missingStatuses.length === 0,
    enoughSecondaryKinds: true,
    allRolesPass,
    batchEvidence: unproven ? "not_proven" : "exact_source",
    notProvenReason: unproven
      ? "未提供本次岗位任务写入报告，不能证明九个岗位的本批任务。"
      : null,
    error: null,
  };
}

function catalogPrintTemplateResult(plan) {
  const actual = plan.targets.filter(
    (item) => item.catalogGroup === "printPreviewPages",
  ).length;
  return {
    id: "catalog-print-templates",
    status: actual >= 5 ? "pass" : "fail",
    expectedMinimum: 5,
    actual,
    returned: actual,
    statusField: null,
    statusCounts: {},
    statusKinds: 0,
    requiredStatuses: [],
    missingStatuses: [],
    enoughRecords: actual >= 5,
    enoughStatuses: true,
    enoughSecondaryKinds: true,
    batchEvidence: "not_applicable",
    error: null,
  };
}

function sanitizeProbe(probe, result) {
  return {
    id: probe.id,
    roleKey: probe.roleKey,
    domain: probe.domain,
    method: probe.method,
    listKey: probe.listKey,
    params: probe.params,
    batchEvidence: probe.batchEvidence,
    batchPrefix: probe.batchPrefix,
    exactSourceType: probe.exactSourceType,
    exactSourceID: probe.exactSourceID,
    exactTaskPrefix: probe.exactTaskPrefix,
    exactOwnerRoleKey: probe.exactOwnerRoleKey,
    declaredMinimum: probe.declaredMinimum,
    ...result,
  };
}

function combineTargetResult(target, resultById) {
  const supporting = target.probeIds
    .map((id) => resultById.get(id))
    .filter(Boolean);
  if (target.quantityNotProven) {
    return {
      ...target,
      dataStatus: "not_proven",
      actual: null,
      statusCounts: {},
      supporting: supporting.map((item) => ({
        id: item.id,
        status: item.status,
        actual: item.actual,
      })),
      pageStatus: "not_run",
      complete: false,
    };
  }
  if (supporting.length !== target.probeIds.length) {
    return {
      ...target,
      dataStatus: "error",
      actual: null,
      statusCounts: {},
      supporting: [],
      pageStatus: "not_run",
      complete: false,
    };
  }
  const failed = supporting.find(
    (item) => item.status === "fail" || item.status === "error",
  );
  const unproven = supporting.find((item) => item.status === "not_proven");
  const allPass = !failed && !unproven;
  const actualProbe = target.actualProbeId
    ? supporting.find((item) => item.id === target.actualProbeId)
    : null;
  const actual = actualProbe
    ? actualProbe.actual
    : target.combine === "minimum"
      ? Math.min(...supporting.map((item) => Number(item.actual || 0)))
      : supporting[0].actual;
  return {
    ...target,
    reason: unproven?.notProvenReason || target.reason,
    dataStatus: failed
      ? failed.status
      : unproven
        ? "not_proven"
        : allPass
          ? "pass"
          : "error",
    actual: unproven ? null : actual,
    statusCounts: mergeStatusCounts(supporting),
    supporting: supporting.map((item) => ({
      id: item.id,
      status: item.status,
      expectedMinimum: item.expectedMinimum,
      actual: item.actual,
      statusCounts: item.statusCounts,
      requiredStatuses: item.requiredStatuses,
      missingStatuses: item.missingStatuses,
      requiredStatusCounts: item.requiredStatusCounts,
      mismatchedStatusCounts: item.mismatchedStatusCounts,
      requiredSecondaryKinds: item.requiredSecondaryKinds,
      missingSecondaryKinds: item.missingSecondaryKinds,
      batchEvidence: item.batchEvidence,
      batchPrefix: item.batchPrefix,
      notProvenReason: item.notProvenReason,
    })),
    pageStatus: "not_run",
    complete: false,
  };
}

export async function verifyManualAcceptanceReadiness(
  plan,
  {
    backendURL,
    password,
    adminPassword,
    fetchImpl = fetch,
    now = () => new Date(),
  } = {},
) {
  const normalizedBackendURL = normalizeBackendURL(backendURL);
  const effectiveAdminPassword = requiredText(
    adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "试用账号密码环境变量",
  );
  const runtimePreflight = await assertSafeReadRuntime({
    backendURL: normalizedBackendURL,
    adminPassword: effectiveAdminPassword,
    fetchImpl,
  });
  const accounts = await loginAccounts({
    backendURL: normalizedBackendURL,
    password: effectivePassword,
    fetchImpl,
  });
  const rawResults = [];
  for (const probe of plan.probes) {
    if (probe.batchEvidence === "not_proven") {
      rawResults.push({
        probe,
        result: evaluateManualAcceptanceDataset(probe, null),
      });
      continue;
    }
    const token = accounts.tokens[probe.roleKey];
    if (!token) {
      rawResults.push({
        probe,
        result: {
          id: probe.id,
          status: "error",
          expectedMinimum: probe.expectedMinimum,
          expectedExact: probe.expectedExact ?? null,
          actual: null,
          statusCounts: {},
          statusKinds: 0,
          requiredStatuses: [...(probe.requiredStatuses || [])],
          missingStatuses: [...(probe.requiredStatuses || [])],
          requiredStatusCounts: { ...(probe.requiredStatusCounts || {}) },
          secondaryCounts: {},
          secondaryKinds: 0,
          requiredSecondaryKinds: [...(probe.requiredSecondaryKinds || [])],
          missingSecondaryKinds: [...(probe.requiredSecondaryKinds || [])],
          batchEvidence: probe.batchEvidence || "not_applicable",
          batchPrefix: probe.batchPrefix || null,
          error: `岗位 ${probe.roleKey} 未能登录，未执行查询`,
        },
      });
      continue;
    }
    try {
      const data = await rpcCall({
        backendURL: normalizedBackendURL,
        domain: probe.domain,
        method: probe.method,
        params: probe.params,
        token,
        fetchImpl,
      });
      rawResults.push({
        probe,
        result: evaluateManualAcceptanceDataset(probe, data),
      });
    } catch (error) {
      rawResults.push({
        probe,
        result: {
          id: probe.id,
          status: "error",
          expectedMinimum: probe.expectedMinimum,
          expectedExact: probe.expectedExact ?? null,
          actual: null,
          statusCounts: {},
          statusKinds: 0,
          requiredStatuses: [...(probe.requiredStatuses || [])],
          missingStatuses: [...(probe.requiredStatuses || [])],
          requiredStatusCounts: { ...(probe.requiredStatusCounts || {}) },
          secondaryCounts: {},
          secondaryKinds: 0,
          requiredSecondaryKinds: [...(probe.requiredSecondaryKinds || [])],
          missingSecondaryKinds: [...(probe.requiredSecondaryKinds || [])],
          batchEvidence: probe.batchEvidence || "not_applicable",
          batchPrefix: probe.batchPrefix || null,
          error: String(error?.message || error),
        },
      });
    }
  }
  const resultById = new Map(
    rawResults.map(({ probe, result }) => [probe.id, result]),
  );
  const loginResult = loginProbeResult(accounts.results);
  resultById.set(loginResult.id, loginResult);
  const mobileResults = plan.probes
    .filter((probe) => probe.id.startsWith("mobile-tasks:"))
    .map((probe) => resultById.get(probe.id));
  const totalResult = mobileTotalResult(mobileResults);
  resultById.set(totalResult.id, totalResult);
  const printCatalogResult = catalogPrintTemplateResult(plan);
  resultById.set(printCatalogResult.id, printCatalogResult);

  const targets = plan.targets.map((target) =>
    combineTargetResult(target, resultById),
  );
  const failedTargetData = targets.filter(
    (item) => item.dataStatus === "fail" || item.dataStatus === "error",
  ).length;
  const notProvenTargetData = targets.filter(
    (item) => item.dataStatus === "not_proven",
  ).length;
  const passedTargetData = targets.filter(
    (item) => item.dataStatus === "pass",
  ).length;
  const queryableTargetsReady = failedTargetData === 0;
  const allTargetDataProven =
    queryableTargetsReady && notProvenTargetData === 0;
  const mobileActualByRole = Object.fromEntries(
    mobileResults.map((item) => [
      item.id.replace("mobile-tasks:", ""),
      item.actual,
    ]),
  );
  const probes = [
    ...rawResults.map(({ probe, result }) => sanitizeProbe(probe, result)),
    loginResult,
    totalResult,
    printCatalogResult,
  ];
  return {
    mode: "verify",
    scope: plan.scope,
    generatedAt: now().toISOString(),
    customerKey: plan.customerKey,
    backendURL: normalizedBackendURL,
    readOnly: true,
    writesBusinessData: false,
    authenticationMayAppendAudit: true,
    directSQL: false,
    runtimePreflight: {
      environment: runtimePreflight.environment,
      customerKey: runtimePreflight.customerKey,
      configRevision: runtimePreflight.configRevision,
      source: runtimePreflight.source,
    },
    reportInputs: plan.reportInputs,
    inputWarnings: plan.inputWarnings,
    summary: {
      totalTargets: targets.length,
      passedTargetData,
      failedTargetData,
      notProvenTargetData,
      queryChecksPassed: queryableTargetsReady,
      queryEvidenceComplete: allTargetDataProven,
      browserChecksPending: targets.filter((item) => item.browserRequired)
        .length,
      browserChecksCompleted: 0,
      manualAcceptanceCompleted: false,
      mobileRolePages: mobileResults.length,
      mobileTasksPerRoleExpected: MOBILE_TASKS_PER_ROLE,
      mobileActualByRole,
      mobileTaskTotalExpected: MOBILE_TASK_TOTAL,
      mobileTaskTotalActual: totalResult.actual,
    },
    accountChecks: accounts.results,
    probes,
    targets,
    readyForManualAcceptance: false,
    boundary:
      "这份报告只核对本地系统可查询的本批数据数量与必需状态。无法按本批可靠筛选的项目保持“尚未证明”；登录核对可能留下系统操作记录，页面操作、错误提示、打印分页和人工验收均未执行。",
  };
}

function escapeCell(value) {
  return String(value ?? "-")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

export function renderManualAcceptanceReadinessMarkdown(report) {
  const lines = [
    "# 全页面手动验收就绪核验",
    "",
    `- 核验目标：${report.summary.totalTargets} 个`,
    `- 已通过数据核对：${report.summary.passedTargetData} 个`,
    `- 数据不足或查询失败：${report.summary.failedTargetData} 个`,
    `- 当前查询不能证明：${report.summary.notProvenTargetData} 个`,
    `- 九个岗位任务合计：${report.summary.mobileTaskTotalActual} / ${report.summary.mobileTaskTotalExpected}`,
    `- 页面操作已完成：${report.summary.browserChecksCompleted} / ${report.summary.browserChecksPending}`,
    "- 人工验收：未完成",
    "",
    "| 页面 | 最少数据 | 当前数据 | 状态 | 说明 |",
    "| --- | ---: | ---: | --- | --- |",
  ];
  for (const target of report.targets) {
    const status = {
      pass: "数据已准备",
      fail: "数据不足",
      error: "查询失败",
      not_proven: "尚未证明",
    }[target.dataStatus];
    lines.push(
      `| ${escapeCell(target.title)} | ${target.expectedMinimum} ${escapeCell(target.expectedUnit)} | ${escapeCell(target.actual)} | ${status} | ${escapeCell(target.reason)} |`,
    );
  }
  lines.push(
    "",
    "> 本报告不代替页面操作和人工验收。打印分页、长文字、错误提示、筛选恢复和岗位操作必须继续按验收清单确认。",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export function parseManualAcceptanceReadinessArgs(argv = []) {
  const options = {
    verify: false,
    backendURL: "",
    sourceReport: "",
    factReport: "",
    taskReport: "",
    out: "",
    format: "json",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--verify") {
      options.verify = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`无法识别参数 ${token}`, 2);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliError(`${token} 缺少值`, 2);
    }
    index += 1;
    switch (token) {
      case "--backend-url":
        options.backendURL = value;
        break;
      case "--source-report":
        options.sourceReport = value;
        break;
      case "--fact-report":
        options.factReport = value;
        break;
      case "--task-report":
        options.taskReport = value;
        break;
      case "--out":
        options.out = value;
        break;
      case "--format":
        if (!new Set(["json", "markdown"]).has(value)) {
          throw new CliError("--format 只支持 json 或 markdown", 2);
        }
        options.format = value;
        break;
      default:
        throw new CliError(`无法识别参数 ${token}`, 2);
    }
  }
  if (options.verify && !options.backendURL) {
    throw new CliError("--verify 必须同时提供 --backend-url", 2);
  }
  return options;
}

async function readOptionalReport(filePath) {
  if (!filePath) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeReports(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${report.mode}-report.json`);
  const markdownPath = path.join(outDir, `${report.mode}-report.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const markdownReport =
    report.mode === "verify"
      ? renderManualAcceptanceReadinessMarkdown(report)
      : "# 全页面手动验收就绪核验计划\n\n默认不连接系统、不写业务数据。\n";
  await writeFile(markdownPath, markdownReport, "utf8");
  return { jsonPath, markdownPath };
}

function helpText() {
  return `全页面手动验收就绪核验

只生成计划，不连接系统：
  node scripts/qa/manual-acceptance-readiness.mjs

读取写入报告并核对本地数据：
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-super-admin-password>' \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
    node scripts/qa/manual-acceptance-readiness.mjs --verify \\
      --backend-url http://127.0.0.1:8300 \\
      --source-report output/qa/manual-acceptance/source-data/apply-report.json \\
      --fact-report output/qa/manual-acceptance/fact-data/apply-report.json \\
      --task-report output/qa/manual-acceptance/task-data/apply-report.json \\
      --out ${DEFAULT_OUT_DIR}

说明：默认模式不会连接系统；只有同时提供 --verify 和 --backend-url 才执行只读核对。本地超级管理员 admin 只用于运行时安全前置，demo_admin 仍按试用账号权限核对。`;
}

export async function runManualAcceptanceReadinessCli(argv = [], deps = {}) {
  const options = parseManualAcceptanceReadinessArgs(argv);
  if (options.help) {
    return { text: `${helpText()}\n`, exitCode: 0, plan: null, report: null };
  }
  const sourceReport =
    deps.sourceReport ?? (await readOptionalReport(options.sourceReport));
  const factReport =
    deps.factReport ?? (await readOptionalReport(options.factReport));
  const taskReport =
    deps.taskReport ?? (await readOptionalReport(options.taskReport));
  const plan = buildManualAcceptanceReadinessPlan({
    catalog: deps.catalog,
    sourceReport,
    factReport,
    taskReport,
  });
  if (!options.verify) {
    const output = options.out ? await writeReports(options.out, plan) : null;
    const text =
      options.format === "markdown"
        ? "# 全页面手动验收就绪核验计划\n\n默认不连接系统、不写业务数据。\n"
        : `${JSON.stringify(plan, null, 2)}\n`;
    return { text, exitCode: 0, plan, report: null, output };
  }
  const report = await verifyManualAcceptanceReadiness(plan, {
    backendURL: options.backendURL,
    password: deps.password,
    adminPassword: deps.adminPassword,
    fetchImpl: deps.fetchImpl,
    now: deps.now,
  });
  const output = options.out ? await writeReports(options.out, report) : null;
  const text =
    options.format === "markdown"
      ? renderManualAcceptanceReadinessMarkdown(report)
      : `${JSON.stringify(report, null, 2)}\n`;
  return {
    text,
    exitCode: report.summary.queryEvidenceComplete ? 0 : 1,
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
  runManualAcceptanceReadinessCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.message || error}\n`);
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    });
}
