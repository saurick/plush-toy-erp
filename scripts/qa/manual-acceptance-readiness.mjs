#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { expectedAccounts } from "./trial-account-rbac.mjs";
import { MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS } from "./manual-acceptance-account-scenarios.mjs";
import {
  MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT,
  MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT,
  MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
  MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS,
  buildManualAcceptanceCatalog,
} from "./manual-acceptance-catalog.mjs";
import {
  MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS,
  MANUAL_ACCEPTANCE_DESKTOP_DATASET_BY_PAGE,
  MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
  assertManualAcceptancePageDataContract,
  buildManualAcceptancePageDataContract,
} from "./manual-acceptance-page-data-contract.mjs";
import {
  TASK_COPY_REVISION,
  TASK_CATALOG_SCENARIO_DIGEST,
  TASK_SOURCE_TYPE,
  TASK_STATUS_KEYS,
  TASK_VISIBLE_CODE_PREFIX_BY_ROLE,
  getManualAcceptanceRoleTaskGroups,
  getManualAcceptanceTaskGroupCount,
  getManualAcceptanceTaskGroupScenarioCounts,
  getManualAcceptanceTaskGroupScenarios,
  getManualAcceptanceTaskGroupStatusCounts,
  getManualAcceptanceTaskStatusCounts,
  manualAcceptanceTaskBatchIdentity,
} from "./manual-acceptance-task-data.mjs";
import {
  CUSTOMER_TRIAL_133_TARGET,
  MANUAL_ACCEPTANCE_TARGET_PROFILES,
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceDatabaseIdentity,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  manualAcceptanceRuntimeCapabilitiesFromAttestation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

const CUSTOMER_KEY = "yoyoosun";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/readiness";
const MOBILE_TASK_TOTAL = 180;
const MOBILE_TASKS_PER_ROLE = 20;
const QUERY_LIMIT = 200;
const RUNTIME_PREFLIGHT_USERNAME = "admin";
const SOURCE_DRIVEN_FACT_REPORT_CONTRACT = "source-driven-operational-facts-v1";
const TASK_REQUIRED_STATUSES = Object.freeze(
  TASK_STATUS_KEYS.map((status) => status.toUpperCase()),
);
const TASK_ROLE_KEYS = Object.freeze(
  expectedAccounts
    .filter(([, , mobilePermission]) => Boolean(mobilePermission))
    .map(([, roleKey]) => roleKey),
);

export const MANUAL_ACCEPTANCE_ACCOUNT_STATE_EXPECTATIONS = Object.freeze([
  ...expectedAccounts.map(([username, roleKey]) =>
    Object.freeze({
      username,
      accountStatus: "active",
      roleKeys: Object.freeze([roleKey]),
    }),
  ),
  ...MANUAL_ACCEPTANCE_ACCOUNT_SCENARIOS.map((scenario) =>
    Object.freeze({
      username: scenario.username,
      accountStatus: scenario.disabled ? "suspended" : "active",
      roleKeys: Object.freeze([...scenario.roleKeys].sort()),
    }),
  ),
]);

function taskStatusCountsForRole(roleKey) {
  return Object.fromEntries(
    Object.entries(getManualAcceptanceTaskStatusCounts(roleKey))
      .filter(([, count]) => count > 0)
      .map(([status, count]) => [status.toUpperCase(), count]),
  );
}

function taskGroupStatusCountsForRole(roleKey, taskGroup) {
  return Object.fromEntries(
    Object.entries(
      getManualAcceptanceTaskGroupStatusCounts(roleKey, taskGroup),
    ).map(([status, count]) => [status.toUpperCase(), count]),
  );
}

function expectedTaskGroupTotals() {
  const totals = {};
  for (const roleKey of TASK_ROLE_KEYS) {
    for (const taskGroup of getManualAcceptanceRoleTaskGroups(roleKey)) {
      totals[taskGroup] =
        (totals[taskGroup] || 0) +
        getManualAcceptanceTaskGroupCount(roleKey, taskGroup);
    }
  }
  return totals;
}

function taskRequiredStatusesForRole(roleKey) {
  return Object.keys(taskStatusCountsForRole(roleKey));
}

function totalTaskStatusCounts() {
  const totals = Object.fromEntries(
    TASK_STATUS_KEYS.map((status) => [status, 0]),
  );
  for (const roleKey of TASK_ROLE_KEYS) {
    for (const [status, count] of Object.entries(
      getManualAcceptanceTaskStatusCounts(roleKey),
    )) {
      totals[status] += count;
    }
  }
  return totals;
}

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

const FACT_REFERENCE_DATASETS = Object.freeze({
  "production-orders": Object.freeze({ referenceKey: "productionOrders" }),
  "production-facts": Object.freeze({ referenceKey: "productionFacts" }),
  "purchase-receipts": Object.freeze({ referenceKey: "purchaseReceipts" }),
  "purchase-returns": Object.freeze({ referenceKey: "purchaseReturns" }),
  "purchase-receipt-adjustments": Object.freeze({
    referenceKey: "purchaseReceiptAdjustments",
  }),
  "quality-inspections": Object.freeze({ referenceKey: "qualityInspections" }),
  "inventory-lots": Object.freeze({ referenceKey: "inventoryLots" }),
  "inventory-balances": Object.freeze({ referenceKey: "inventoryBalances" }),
  "inventory-txns": Object.freeze({ referenceKey: "inventoryTxns" }),
  "stock-reservations": Object.freeze({ referenceKey: "stockReservations" }),
  shipments: Object.freeze({ referenceKey: "shipments" }),
  "finance-reconciliation": Object.freeze({
    referenceKey: "financeFacts",
    factType: "RECONCILIATION",
  }),
  "finance-payables": Object.freeze({
    referenceKey: "financeFacts",
    factType: "PAYABLE",
  }),
  "finance-receivables": Object.freeze({
    referenceKey: "financeFacts",
    factType: "RECEIVABLE",
  }),
  "finance-invoices": Object.freeze({
    referenceKey: "financeFacts",
    factType: "INVOICE",
  }),
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
  "production-orders": {
    roleKey: "production",
    domain: "production_order",
    method: "list_production_orders",
    includeCustomerKey: false,
    listKey: "production_orders",
    statusField: "status",
    requiredStatuses: ["DRAFT", "RELEASED", "CLOSED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "productionOrders",
  },
  "quality-inspections": {
    roleKey: "quality",
    domain: "quality",
    method: "list_quality_inspections",
    listKey: "quality_inspections",
    statusField: "status",
    requiredStatuses: ["DRAFT", "SUBMITTED", "PASSED", "REJECTED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "qualityInspections",
  },
  "purchase-receipts": {
    roleKey: "warehouse",
    domain: "purchase",
    method: "list_purchase_receipts",
    listKey: "purchase_receipts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "purchaseReceipts",
  },
  "purchase-returns": {
    roleKey: "warehouse",
    domain: "purchase",
    method: "list_purchase_returns",
    listKey: "purchase_returns",
    includeCustomerKey: false,
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "purchaseReturns",
  },
  "purchase-receipt-adjustments": {
    roleKey: "warehouse",
    domain: "purchase",
    method: "list_purchase_receipt_adjustments",
    listKey: "purchase_receipt_adjustments",
    includeCustomerKey: false,
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
    secondaryField: "items.adjust_type",
    requiredSecondaryKinds: ["QUANTITY_INCREASE", "QUANTITY_DECREASE"],
    batchReport: "fact",
    factReferenceKey: "purchaseReceiptAdjustments",
  },
  "inventory-balances": {
    roleKey: "warehouse",
    domain: "inventory",
    method: "list_inventory_balances",
    listKey: "inventory_balances",
    batchReport: "fact",
    factReferenceKey: "inventoryBalances",
  },
  "inventory-lots": {
    roleKey: "warehouse",
    domain: "inventory",
    method: "list_inventory_lots",
    listKey: "inventory_lots",
    statusField: "status",
    requiredStatuses: ["HOLD", "ACTIVE", "REJECTED"],
    batchReport: "fact",
    factReferenceKey: "inventoryLots",
  },
  "inventory-txns": {
    roleKey: "warehouse",
    domain: "inventory",
    method: "list_inventory_txns",
    listKey: "inventory_txns",
    statusField: "txn_type",
    requiredStatuses: ["IN", "OUT", "REVERSAL"],
    batchReport: "fact",
    factReferenceKey: "inventoryTxns",
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
    batchReport: "fact",
    factReferenceKey: "productionFacts",
  },
  "stock-reservations": {
    roleKey: "warehouse",
    domain: "operational_fact",
    method: "list_stock_reservations",
    listKey: "stock_reservations",
    statusField: "status",
    requiredStatuses: ["ACTIVE", "RELEASED"],
    batchReport: "fact",
    factReferenceKey: "stockReservations",
  },
  shipments: {
    roleKey: "warehouse",
    domain: "operational_fact",
    method: "list_shipments",
    listKey: "shipments",
    statusField: "status",
    requiredStatuses: ["DRAFT", "SHIPPED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "shipments",
  },
  "finance-reconciliation": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "financeFacts",
    params: { fact_type: "RECONCILIATION" },
  },
  "finance-payables": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "financeFacts",
    params: { fact_type: "PAYABLE" },
  },
  "finance-receivables": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "SETTLED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "financeFacts",
    params: { fact_type: "RECEIVABLE" },
  },
  "finance-invoices": {
    roleKey: "finance",
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    statusField: "status",
    requiredStatuses: ["DRAFT", "POSTED", "CANCELLED"],
    batchReport: "fact",
    factReferenceKey: "financeFacts",
    params: { fact_type: "INVOICE" },
  },
  "permission-accounts": {
    roleKey: "admin",
    domain: "admin",
    method: "list",
    listKey: "admins",
    statusField: "account_status",
    requiredStatuses: ["ACTIVE", "DISABLED"],
    expectedAccountStates: MANUAL_ACCEPTANCE_ACCOUNT_STATE_EXPECTATIONS,
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

function reportText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new CliError(`${name} 不能为空`, 2);
  return normalized;
}

function reportValue(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] != null && record[key] !== "") return record[key];
  }
  return undefined;
}

function reportPositiveID(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError(`${name} 必须是正整数`, 2);
  }
  return parsed;
}

function normalizedBackendURL(value) {
  const url = new URL(reportText(value, "backendURL"));
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

function normalizeFactReference(record, key, index) {
  const name = `referenceRecords.${key}[${index}]`;
  const id = reportPositiveID(record?.id, `${name}.id`);
  const normalized = { id };
  const textField = (outputKey, ...aliases) => {
    normalized[outputKey] = reportText(
      reportValue(record, ...aliases),
      `${name}.${aliases[0]}`,
    );
  };
  const optionalID = (outputKey, ...aliases) => {
    const value = reportValue(record, ...aliases);
    if (value != null) {
      normalized[outputKey] = reportPositiveID(value, `${name}.${aliases[0]}`);
    }
  };
  switch (key) {
    case "productionOrders":
      textField("order_no", "orderNo", "order_no");
      textField("status", "status");
      break;
    case "productionFacts":
      textField("fact_no", "factNo", "fact_no");
      textField("status", "status");
      textField("fact_type", "factType", "fact_type");
      textField("source_type", "sourceType", "source_type");
      normalized.source_id = reportPositiveID(
        reportValue(record, "sourceID", "sourceId", "source_id"),
        `${name}.sourceID`,
      );
      break;
    case "purchaseReceipts":
      textField("receipt_no", "receiptNo", "receipt_no");
      textField("status", "status");
      break;
    case "purchaseReturns":
      textField("return_no", "returnNo", "return_no");
      textField("status", "status");
      break;
    case "purchaseReceiptAdjustments":
      textField("adjustment_no", "adjustmentNo", "adjustment_no");
      textField("status", "status");
      textField("adjust_type", "adjustType", "adjust_type");
      break;
    case "qualityInspections":
      textField("inspection_no", "inspectionNo", "inspection_no");
      textField("status", "status");
      textField("source_type", "sourceType", "source_type");
      normalized.source_id = reportPositiveID(
        reportValue(record, "sourceID", "sourceId", "source_id"),
        `${name}.sourceID`,
      );
      break;
    case "inventoryLots":
      textField("lot_no", "lotNo", "lot_no");
      textField("status", "status");
      textField("subject_type", "subjectType", "subject_type");
      normalized.subject_id = reportPositiveID(
        reportValue(record, "subjectID", "subjectId", "subject_id"),
        `${name}.subjectID`,
      );
      optionalID(
        "product_sku_id",
        "productSkuID",
        "productSkuId",
        "product_sku_id",
      );
      break;
    case "inventoryBalances":
      textField("subject_type", "subjectType", "subject_type");
      normalized.subject_id = reportPositiveID(
        reportValue(record, "subjectID", "subjectId", "subject_id"),
        `${name}.subjectID`,
      );
      optionalID(
        "product_sku_id",
        "productSkuID",
        "productSkuId",
        "product_sku_id",
      );
      normalized.warehouse_id = reportPositiveID(
        reportValue(record, "warehouseID", "warehouseId", "warehouse_id"),
        `${name}.warehouseID`,
      );
      optionalID("lot_id", "lotID", "lotId", "lot_id");
      normalized.unit_id = reportPositiveID(
        reportValue(record, "unitID", "unitId", "unit_id"),
        `${name}.unitID`,
      );
      textField("quantity", "quantity");
      break;
    case "inventoryTxns":
      textField("txn_type", "txnType", "txn_type");
      textField("source_type", "sourceType", "source_type");
      normalized.source_id = reportPositiveID(
        reportValue(record, "sourceID", "sourceId", "source_id"),
        `${name}.sourceID`,
      );
      break;
    case "stockReservations":
      textField("reservation_no", "reservationNo", "reservation_no");
      textField("status", "status");
      textField("source_type", "sourceType", "source_type");
      normalized.source_id = reportPositiveID(
        reportValue(record, "sourceID", "sourceId", "source_id"),
        `${name}.sourceID`,
      );
      break;
    case "shipments":
      textField("shipment_no", "shipmentNo", "shipment_no");
      textField("status", "status");
      break;
    case "financeFacts":
      textField("fact_no", "factNo", "fact_no");
      textField("status", "status");
      textField("fact_type", "factType", "fact_type");
      textField("source_type", "sourceType", "source_type");
      normalized.source_id = reportPositiveID(
        reportValue(record, "sourceID", "sourceId", "source_id"),
        `${name}.sourceID`,
      );
      break;
    default:
      throw new CliError(`未知业务记录引用 ${key}`, 2);
  }
  return normalized;
}

function normalizeFactReferenceRecords(report) {
  const records = report?.referenceRecords;
  if (!records || typeof records !== "object" || Array.isArray(records)) {
    throw new CliError("业务记录报告缺少 referenceRecords", 2);
  }
  const normalized = {};
  const referenceKeys = [
    ...new Set(
      Object.values(FACT_REFERENCE_DATASETS).map((item) => item.referenceKey),
    ),
  ];
  for (const key of referenceKeys) {
    if (!Array.isArray(records[key]) || records[key].length === 0) {
      throw new CliError(`业务记录报告缺少 referenceRecords.${key}`, 2);
    }
    normalized[key] = records[key].map((item, index) =>
      normalizeFactReference(item, key, index),
    );
    if (
      new Set(normalized[key].map((item) => item.id)).size !==
      normalized[key].length
    ) {
      throw new CliError(`referenceRecords.${key} 包含重复 id`, 2);
    }
  }
  const owners = records.attachmentOwners;
  if (!owners || typeof owners !== "object" || Array.isArray(owners)) {
    throw new CliError("业务记录报告缺少 referenceRecords.attachmentOwners", 2);
  }
  const productionFactId = reportPositiveID(
    owners.productionFactId,
    "referenceRecords.attachmentOwners.productionFactId",
  );
  const financeFactId = reportPositiveID(
    owners.financeFactId,
    "referenceRecords.attachmentOwners.financeFactId",
  );
  if (
    !normalized.productionFacts.some(
      (item) => item.id === productionFactId && item.status === "POSTED",
    )
  ) {
    throw new CliError(
      "referenceRecords.attachmentOwners.productionFactId 必须指向本批已过账生产记录",
      2,
    );
  }
  if (
    !normalized.financeFacts.some(
      (item) => item.id === financeFactId && item.status === "POSTED",
    )
  ) {
    throw new CliError(
      "referenceRecords.attachmentOwners.financeFactId 必须指向本批已过账财务记录",
      2,
    );
  }
  normalized.attachmentOwners = { productionFactId, financeFactId };
  return normalized;
}

function validateSourceReport(report) {
  if (!report) return null;
  if (
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    !report.scale ||
    !String(report.datasetKey || "").trim() ||
    !String(report.dataVersion || "").trim() ||
    !String(report.runId || "").trim() ||
    !String(report.target || "").trim() ||
    !String(report.backendURL || "").trim() ||
    !String(report.databaseName || "").trim() ||
    !String(report.semanticDigest || "").trim() ||
    !String(report.prefix || "").trim()
  ) {
    throw new CliError("源数据报告不是有效的模拟试用写入报告", 2);
  }
  return report;
}

function validateFactReport(report) {
  if (!report) return null;
  if (
    report.reportContract !== SOURCE_DRIVEN_FACT_REPORT_CONTRACT ||
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    !String(report.datasetKey || "").trim() ||
    !String(report.dataVersion || "").trim() ||
    !String(report.runId || "").trim() ||
    !String(report.target || "").trim() ||
    !String(report.backendURL || "").trim() ||
    !String(report.databaseName || "").trim() ||
    !String(report.semanticDigest || "").trim() ||
    !report.runtime ||
    !String(report.runtime.environment || "").trim() ||
    report.runtime.customerKey !== CUSTOMER_KEY ||
    !String(report.runtime.configRevision || "").trim() ||
    report.runtime.source !== "active_customer_config_revision"
  ) {
    throw new CliError("业务记录报告不是有效的模拟试用写入报告", 2);
  }
  let policy;
  try {
    policy = resolveManualAcceptanceTarget(report);
  } catch (error) {
    throw new CliError(String(error?.message || error), 2);
  }
  if (normalizedBackendURL(report.backendURL) !== policy.backendURL) {
    throw new CliError("业务记录报告 backendURL 与登记目标不一致", 2);
  }
  if (
    policy.target === CUSTOMER_TRIAL_133_TARGET &&
    (report.runtime.environment !==
      MANUAL_ACCEPTANCE_TARGET_PROFILES[policy.target].runtimeEnvironment ||
      report.runtime.targetAttestation?.source !== "out-of-band" ||
      !String(report.runtime.targetAttestation?.release || "").trim() ||
      !String(report.runtime.targetAttestation?.migration || "").trim())
  ) {
    throw new CliError("业务记录报告缺少 customer-trial-133 运行态证明", 2);
  }
  const normalizedReferenceRecords = normalizeFactReferenceRecords(report);
  const shipments = report.referenceRecords.shipments;
  if (shipments.length !== MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT) {
    throw new CliError(
      `业务记录报告必须精确包含 ${MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT} 张出货单`,
      2,
    );
  }
  const longShipmentCount = shipments.filter(
    (shipment) =>
      Array.isArray(shipment?.items) &&
      shipment.items.length ===
        MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
  ).length;
  if (longShipmentCount !== MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT) {
    throw new CliError(
      `业务记录报告必须恰好包含 ${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT} 张 ${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT} 行出货单`,
      2,
    );
  }
  return {
    ...report,
    backendURL: policy.backendURL,
    normalizedReferenceRecords,
  };
}

function validateTaskReport(report) {
  if (!report) return null;
  const runId = String(report.runId || "").trim();
  const prefix = String(report.prefix || "").trim();
  const expectedIdentity = runId
    ? manualAcceptanceTaskBatchIdentity(runId)
    : null;
  const byRole = report.summary?.byRole || {};
  const byStatus = report.summary?.byStatus || {};
  const byTaskGroup = report.summary?.byTaskGroup || {};
  const expectedStatusTotals = totalTaskStatusCounts();
  const rolesAreExact =
    Object.keys(byRole).length === TASK_ROLE_KEYS.length &&
    TASK_ROLE_KEYS.every(
      (roleKey) => Number(byRole[roleKey]) === MOBILE_TASKS_PER_ROLE,
    );
  const statusesAreExact =
    Object.keys(byStatus).length === TASK_STATUS_KEYS.length &&
    TASK_STATUS_KEYS.every(
      (status) => Number(byStatus[status]) === expectedStatusTotals[status],
    );
  const expectedGroupTotals = expectedTaskGroupTotals();
  const groupsAreExact =
    Object.keys(byTaskGroup).length ===
      Object.keys(expectedGroupTotals).length &&
    Object.entries(expectedGroupTotals).every(
      ([taskGroup, count]) => Number(byTaskGroup[taskGroup]) === count,
    );
  const coverage = report.coverage;
  const coverageRoles = Object.keys(coverage?.taskGroupsByRole || {});
  const scenarioCoverageRoles = Object.keys(
    coverage?.scenariosByRoleTaskGroup || {},
  );
  const coverageIsExact =
    coverage?.catalogScenarioDigest === TASK_CATALOG_SCENARIO_DIGEST &&
    coverageRoles.length === TASK_ROLE_KEYS.length &&
    scenarioCoverageRoles.length === TASK_ROLE_KEYS.length &&
    TASK_ROLE_KEYS.every((roleKey) => {
      const expectedGroups = getManualAcceptanceRoleTaskGroups(roleKey);
      const groups = coverage.taskGroupsByRole[roleKey];
      const groupsCoverage = coverage.scenariosByRoleTaskGroup[roleKey];
      return (
        Array.isArray(groups) &&
        JSON.stringify(groups) === JSON.stringify(expectedGroups) &&
        groupsCoverage &&
        JSON.stringify(Object.keys(groupsCoverage)) ===
          JSON.stringify(expectedGroups) &&
        expectedGroups.every((taskGroup) => {
          const scenarioCounts = groupsCoverage[taskGroup];
          const expectedScenarioCounts =
            getManualAcceptanceTaskGroupScenarioCounts(roleKey, taskGroup);
          return (
            scenarioCounts &&
            JSON.stringify(scenarioCounts) ===
              JSON.stringify(expectedScenarioCounts)
          );
        }) &&
        expectedGroups.reduce(
          (total, taskGroup) =>
            total + getManualAcceptanceTaskGroupCount(roleKey, taskGroup),
          0,
        ) === MOBILE_TASKS_PER_ROLE
      );
    });
  if (
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    report.writesFacts !== false ||
    !String(report.datasetKey || "").trim() ||
    !String(report.dataVersion || "").trim() ||
    !String(report.target || "").trim() ||
    !String(report.backendURL || "").trim() ||
    !String(report.databaseName || "").trim() ||
    report.summary?.total !== MOBILE_TASK_TOTAL ||
    report.summary?.persisted !== MOBILE_TASK_TOTAL ||
    !rolesAreExact ||
    !statusesAreExact ||
    !groupsAreExact ||
    !coverageIsExact ||
    !runId ||
    report.copyRevision !== TASK_COPY_REVISION ||
    prefix !== expectedIdentity?.prefix ||
    report.sourceType !== TASK_SOURCE_TYPE ||
    Number(report.sourceID) !== expectedIdentity?.sourceID
  ) {
    throw new CliError("岗位任务报告不是有效的模拟试用写入报告", 2);
  }
  return report;
}

function validateReportBatch(sourceReport, factReport, taskReport) {
  const reports = [sourceReport, factReport, taskReport].filter(Boolean);
  for (const key of [
    "datasetKey",
    "dataVersion",
    "runId",
    "target",
    "backendURL",
    "databaseName",
  ]) {
    const values = reports.map((report) => String(report[key] || "").trim());
    if (new Set(values).size > 1) {
      throw new CliError("源数据、业务记录与岗位任务报告不是同一批次", 2);
    }
  }
}

function catalogMinimum(catalog, pageKey) {
  const item = catalog.technicalManifest.desktopPages.find(
    (candidate) => candidate.key === pageKey,
  );
  if (!item) throw new CliError(`验收目录缺少页面 ${pageKey}`);
  return item.minimumRecords;
}

function catalogTaskScenarios(catalog, pageKey) {
  const item = catalog.technicalManifest.desktopPages.find(
    (candidate) => candidate.key === pageKey,
  );
  if (!item) throw new CliError(`验收目录缺少页面 ${pageKey}`);
  return [...(item.requiredTaskScenarios || [])];
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
    for (const [datasetId, definition] of Object.entries(
      FACT_REFERENCE_DATASETS,
    )) {
      const records =
        factReport.normalizedReferenceRecords[definition.referenceKey];
      values[datasetId] = definition.factType
        ? records.filter((item) => item.fact_type === definition.factType)
            .length
        : records.length;
    }
  }
  return values;
}

function buildCanonicalMinimums(catalog) {
  const minimums = {};
  for (const [pageKey, datasetId] of Object.entries(
    MANUAL_ACCEPTANCE_DESKTOP_DATASET_BY_PAGE,
  )) {
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

const FACT_BUSINESS_FIELDS = Object.freeze({
  productionOrders: "order_no",
  productionFacts: "fact_no",
  purchaseReceipts: "receipt_no",
  purchaseReturns: "return_no",
  purchaseReceiptAdjustments: "adjustment_no",
  qualityInspections: "inspection_no",
  inventoryLots: "lot_no",
  stockReservations: "reservation_no",
  shipments: "shipment_no",
  financeFacts: "fact_no",
});

function factReferenceEvidence(datasetId, blueprint, factReport) {
  if (!factReport) {
    return {
      batchEvidence: "not_proven",
      batchPrefix: null,
      batchNotProvenReason:
        "未提供本次业务记录写入报告，不能用历史总数代替本批数据。",
      expectedReferences: [],
      referenceQueries: [],
    };
  }
  const definition = FACT_REFERENCE_DATASETS[datasetId];
  const referenceKey = blueprint.factReferenceKey || definition?.referenceKey;
  const businessField = FACT_BUSINESS_FIELDS[referenceKey];
  const records = factReport.normalizedReferenceRecords[referenceKey].filter(
    (item) => !definition?.factType || item.fact_type === definition.factType,
  );
  const expectedReferences = records.map((item) => {
    const businessNo = businessField ? item[businessField] : undefined;
    const expectedFields = Object.fromEntries(
      Object.entries(item).filter(
        ([key]) => key !== "id" && key !== businessField,
      ),
    );
    return {
      key: `${item.id}:${businessNo || referenceKey}`,
      id: item.id,
      ...(businessField ? { businessField, businessNo } : {}),
      expectedFields,
    };
  });
  const referenceQueries = records.map((item) => {
    let params;
    if (referenceKey === "inventoryBalances") {
      params = {
        subject_type: item.subject_type,
        subject_id: item.subject_id,
        ...(item.product_sku_id ? { product_sku_id: item.product_sku_id } : {}),
        warehouse_id: item.warehouse_id,
        ...(item.lot_id ? { lot_id: item.lot_id } : {}),
        limit: QUERY_LIMIT,
        offset: 0,
      };
    } else if (referenceKey === "inventoryTxns") {
      params = {
        source_type: item.source_type,
        source_id: item.source_id,
        limit: QUERY_LIMIT,
        offset: 0,
      };
    } else {
      params = {
        ...(blueprint.params || {}),
        keyword: item[businessField],
        limit: QUERY_LIMIT,
        offset: 0,
      };
    }
    return {
      referenceKey: `${item.id}:${item[businessField] || referenceKey}`,
      params,
    };
  });
  return {
    batchEvidence: "exact_references",
    batchPrefix: null,
    batchNotProvenReason: null,
    expectedReferences,
    referenceQueries,
  };
}

function resolveBatchEvidence(datasetId, blueprint, sourceReport, factReport) {
  if (!blueprint.batchReport) {
    return {
      batchEvidence: "not_applicable",
      batchPrefix: null,
      batchNotProvenReason: null,
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
  return factReferenceEvidence(datasetId, blueprint, factReport);
}

function buildDatasetProbes(catalog, sourceReport, factReport, taskReport) {
  const canonical = buildCanonicalMinimums(catalog);
  const declared = declaredExpectations(sourceReport, factReport);
  const probes = Object.entries(DATASET_BLUEPRINTS).map(([id, blueprint]) => {
    const batch = resolveBatchEvidence(id, blueprint, sourceReport, factReport);
    const params = {
      ...(blueprint.params ??
        (blueprint.domain === "admin"
          ? {}
          : blueprint.batchReport === "fact"
            ? { limit: QUERY_LIMIT, offset: 0 }
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
      ...(id === "shipments"
        ? { expectedExact: MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT }
        : {}),
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
    requiredStatuses: taskRequiredStatusesForRole("boss"),
    requiredStatusCounts: taskStatusCountsForRole("boss"),
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
    exactTaskCodePrefix: taskReport
      ? TASK_VISIBLE_CODE_PREFIX_BY_ROLE.boss
      : null,
    exactOwnerRoleKey: taskReport ? "boss" : null,
    exactTaskGroup: taskReport
      ? getManualAcceptanceRoleTaskGroups("boss")[0]
      : null,
    requiredTaskGroups: getManualAcceptanceRoleTaskGroups("boss"),
    requiredScenariosByTaskGroup: getManualAcceptanceTaskGroupScenarios("boss"),
    requiredScenarios: [...MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS.boss],
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
      requiredStatuses: taskRequiredStatusesForRole(roleKey),
      requiredStatusCounts: taskStatusCountsForRole(roleKey),
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
      exactTaskCodePrefix: taskReport
        ? TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey]
        : null,
      exactOwnerRoleKey: taskReport ? roleKey : null,
      exactTaskGroup: null,
      requiredTaskGroups: getManualAcceptanceRoleTaskGroups(roleKey),
      requiredScenariosByTaskGroup:
        getManualAcceptanceTaskGroupScenarios(roleKey),
      requiredScenarios: [...MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS[roleKey]],
      batchNotProvenReason: taskReport
        ? null
        : "未提供本次岗位任务写入报告，不能用历史任务数量代替本批任务。",
      readOnly: true,
    });
  }
  for (const [pageKey, roleKey, taskGroup] of [
    ["production-scheduling", "pmc", "production_scheduling"],
    ["production-exceptions", "production", "production_exception"],
    ["shipping-release", "warehouse", "shipment_release"],
  ]) {
    const expectedCount = getManualAcceptanceTaskGroupCount(roleKey, taskGroup);
    const requiredScenarios =
      getManualAcceptanceTaskGroupScenarios(roleKey)[taskGroup];
    const declaredScenarios = catalogTaskScenarios(catalog, pageKey);
    if (
      catalogMinimum(catalog, pageKey) !== expectedCount ||
      JSON.stringify(declaredScenarios) !== JSON.stringify(requiredScenarios)
    ) {
      throw new CliError(
        `验收目录页面 ${pageKey} 与 ${roleKey}/${taskGroup} 任务映射不一致`,
      );
    }
    probes.push({
      id: `workflow-tasks:${taskGroup}`,
      roleKey,
      username: `demo_${roleKey}`,
      domain: "workflow",
      method: "list_tasks",
      listKey: "tasks",
      statusField: "task_status_key",
      requiredStatuses: Object.keys(
        taskGroupStatusCountsForRole(roleKey, taskGroup),
      ),
      requiredStatusCounts: taskGroupStatusCountsForRole(roleKey, taskGroup),
      expectedMinimum: expectedCount,
      expectedExact: expectedCount,
      declaredMinimum: null,
      params: {
        owner_role_key: roleKey,
        task_group: taskGroup,
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
      exactTaskCodePrefix: taskReport
        ? TASK_VISIBLE_CODE_PREFIX_BY_ROLE[roleKey]
        : null,
      exactOwnerRoleKey: taskReport ? roleKey : null,
      exactTaskGroup: taskReport ? taskGroup : null,
      requiredTaskGroups: [taskGroup],
      requiredScenarios: [...requiredScenarios],
      requiredScenariosByTaskGroup: {
        [taskGroup]: [...requiredScenarios],
      },
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

export function buildManualAcceptanceReadinessPlan(options = {}) {
  const catalog = options.catalog || buildManualAcceptanceCatalog();
  const pageDataContract = buildManualAcceptancePageDataContract({ catalog });
  const sourceReport = validateSourceReport(options.sourceReport || null);
  const factReport = validateFactReport(options.factReport || null);
  const taskReport = validateTaskReport(options.taskReport || null);
  validateReportBatch(sourceReport, factReport, taskReport);
  const allTargets = pageDataContract.targets.map((item) => ({
    ...item,
    roleKeys: [...item.roleKeys],
    probeIds: [...item.probeIds],
    generatorStageKeys: [...item.generatorStageKeys],
  }));
  const { probes, inputWarnings } = buildDatasetProbes(
    catalog,
    sourceReport,
    factReport,
    taskReport,
  );
  assertManualAcceptancePageDataContract(pageDataContract, {
    catalog,
    knownProbeIds: [
      ...probes.map((probe) => probe.id),
      ...Object.values(MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS),
    ],
  });
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
      targets: MANUAL_ACCEPTANCE_PAGE_TARGET_COUNT,
      mobileRolePages: 9,
      mobileTasksPerRole: MOBILE_TASKS_PER_ROLE,
      mobileTaskTotal: MOBILE_TASK_TOTAL,
    },
    pageDataContract: {
      contract: pageDataContract.contract,
      targetCount: pageDataContract.targetCount,
      generatorStages: pageDataContract.generatorStages,
      boundary: pageDataContract.boundary,
    },
    reportInputs: {
      sourceReport: sourceReport
        ? {
            datasetKey: sourceReport.datasetKey,
            dataVersion: sourceReport.dataVersion,
            runId: sourceReport.runId,
            target: sourceReport.target,
            backendURL: sourceReport.backendURL,
            databaseName: sourceReport.databaseName,
            prefix: sourceReport.prefix,
          }
        : null,
      factReport: factReport
        ? {
            reportContract: factReport.reportContract,
            datasetKey: factReport.datasetKey,
            dataVersion: factReport.dataVersion,
            runId: factReport.runId,
            target: factReport.target,
            backendURL: factReport.backendURL,
            databaseName: factReport.databaseName,
            semanticDigest: factReport.semanticDigest,
            runtime: factReport.runtime,
          }
        : null,
      taskReport: taskReport
        ? {
            datasetKey: taskReport.datasetKey,
            dataVersion: taskReport.dataVersion,
            runId: taskReport.runId,
            target: taskReport.target,
            backendURL: taskReport.backendURL,
            databaseName: taskReport.databaseName,
            prefix: taskReport.prefix,
            sourceType: taskReport.sourceType,
            sourceID: taskReport.sourceID,
            taskGroupCoverageDigest: taskReport.coverage.catalogScenarioDigest,
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
  if (field === "account_status") {
    const status = String(value ?? "")
      .trim()
      .toLowerCase();
    if (status === "active") return "ACTIVE";
    if (status === "suspended") return "DISABLED";
    if (status === "revoked") return "REVOKED";
    return "INVALID";
  }
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function statusCounts(items, field) {
  const counts = {};
  for (const item of items) {
    const labels =
      field === "items.adjust_type"
        ? (Array.isArray(item?.items) ? item.items : []).map((entry) =>
            String(entry?.adjust_type ?? "")
              .trim()
              .toUpperCase(),
          )
        : [statusLabel(item, field)];
    for (const label of labels) {
      if (!label) continue;
      counts[label] = (counts[label] || 0) + 1;
    }
  }
  return counts;
}

function textValueCounts(items, valueAt) {
  const counts = {};
  for (const item of items) {
    const value = String(valueAt(item) ?? "").trim() || "__missing__";
    counts[value] = (counts[value] || 0) + 1;
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
  const requiredTaskGroups = [...(probe.requiredTaskGroups || [])];
  const requiredScenarios = [...(probe.requiredScenarios || [])];
  const requiredScenariosByTaskGroup = Object.fromEntries(
    requiredTaskGroups.map((taskGroup) => [
      taskGroup,
      [
        ...(probe.requiredScenariosByTaskGroup?.[taskGroup] ||
          (requiredTaskGroups.length === 1 ? requiredScenarios : [])),
      ],
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
      taskGroupCounts: {},
      requiredTaskGroups,
      missingTaskGroups: [...requiredTaskGroups],
      unknownTaskGroups: [],
      enoughTaskGroups: requiredTaskGroups.length === 0,
      scenarioCounts: {},
      scenarioCountsByTaskGroup: {},
      requiredScenarios,
      requiredScenariosByTaskGroup,
      missingScenarios: [...requiredScenarios],
      unknownScenarios: [],
      enoughScenarios: requiredScenarios.length === 0,
      batchEvidence: probe.batchEvidence,
      batchPrefix: null,
      missingReferences: [],
      referenceMismatches: [],
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
      taskGroupCounts: {},
      requiredTaskGroups,
      missingTaskGroups: [...requiredTaskGroups],
      unknownTaskGroups: [],
      enoughTaskGroups: requiredTaskGroups.length === 0,
      scenarioCounts: {},
      scenarioCountsByTaskGroup: {},
      requiredScenarios,
      requiredScenariosByTaskGroup,
      missingScenarios: [...requiredScenarios],
      unknownScenarios: [],
      enoughScenarios: requiredScenarios.length === 0,
      batchEvidence: probe.batchEvidence || "not_applicable",
      batchPrefix: probe.batchPrefix || null,
      missingReferences: [],
      referenceMismatches: [],
      error: `查询结果缺少 ${probe.listKey}`,
    };
  }
  const missingReferences = [];
  const referenceMismatches = [];
  let batchItems;
  let taskCoverageItems = null;
  if (probe.batchEvidence === "exact_references") {
    batchItems = [];
    for (const expected of probe.expectedReferences || []) {
      const item = items.find(
        (candidate) =>
          Number(candidate?.id) === Number(expected.id) &&
          (!expected.businessField ||
            String(candidate?.[expected.businessField] || "") ===
              expected.businessNo),
      );
      if (!item) {
        missingReferences.push(expected.key);
        continue;
      }
      const actualReferenceField = (field) => {
        if (probe.id === "stock-reservations") {
          if (field === "source_type") return "SALES_ORDER";
          if (field === "source_id") return item?.sales_order_id;
        }
        if (
          probe.id === "purchase-receipt-adjustments" &&
          field === "adjust_type"
        ) {
          const types = [
            ...new Set(
              (Array.isArray(item?.items) ? item.items : [])
                .map((entry) => String(entry?.adjust_type ?? "").trim())
                .filter(Boolean),
            ),
          ].sort();
          return types.length === 1 ? types[0] : types.join(",");
        }
        return item?.[field];
      };
      const fields = Object.fromEntries(
        Object.entries(expected.expectedFields || {})
          .filter(
            ([field, value]) =>
              String(actualReferenceField(field) ?? "") !== String(value ?? ""),
          )
          .map(([field, value]) => [
            field,
            { expected: value, actual: actualReferenceField(field) ?? null },
          ]),
      );
      if (Object.keys(fields).length > 0) {
        referenceMismatches.push({ key: expected.key, fields });
      }
      batchItems.push(item);
    }
  } else {
    if (probe.batchEvidence === "exact_source") {
      taskCoverageItems = items.filter(
        (item) =>
          item?.source_type === probe.exactSourceType &&
          Number(item?.source_id) === Number(probe.exactSourceID) &&
          (!probe.exactTaskCodePrefix ||
            String(item?.task_code || "").startsWith(
              `${probe.exactTaskCodePrefix}-`,
            )) &&
          (!probe.exactOwnerRoleKey ||
            item?.owner_role_key === probe.exactOwnerRoleKey),
      );
      batchItems = taskCoverageItems.filter(
        (item) =>
          !probe.exactTaskGroup || item?.task_group === probe.exactTaskGroup,
      );
    } else {
      batchItems = probe.batchPrefix
        ? items.filter((item) =>
            String(item?.[probe.batchMatchField] || "").startsWith(
              probe.batchPrefix,
            ),
          )
        : items;
    }
  }
  taskCoverageItems = probe.exactTaskGroup
    ? batchItems
    : (taskCoverageItems ?? batchItems);
  const responseTotal = positiveInteger(data.total);
  const batchScoped =
    probe.batchEvidence === "exact_source" ||
    probe.batchEvidence === "exact_references" ||
    Boolean(probe.batchPrefix);
  const actual = batchScoped
    ? batchItems.length
    : (responseTotal ?? batchItems.length);
  const accountStateMismatches = [];
  if (Array.isArray(probe.expectedAccountStates)) {
    const byUsername = new Map(
      batchItems.map((item) => [String(item?.username ?? "").trim(), item]),
    );
    for (const expected of probe.expectedAccountStates) {
      const item = byUsername.get(expected.username);
      if (!item) {
        accountStateMismatches.push({
          username: expected.username,
          reason: "missing",
        });
        continue;
      }
      const accountStatus = String(item.account_status ?? "")
        .trim()
        .toLowerCase();
      const roleKeys = Array.isArray(item.roles)
        ? [
            ...new Set(
              item.roles
                .map((role) => String(role?.role_key ?? "").trim())
                .filter(Boolean),
            ),
          ].sort()
        : [];
      if (
        accountStatus !== expected.accountStatus ||
        JSON.stringify(roleKeys) !== JSON.stringify(expected.roleKeys)
      ) {
        accountStateMismatches.push({
          username: expected.username,
          reason: "state_mismatch",
          expected: {
            accountStatus: expected.accountStatus,
            roleKeys: expected.roleKeys,
          },
          actual: { accountStatus, roleKeys },
        });
      }
    }
  }
  const counts = statusCounts(batchItems, probe.statusField);
  const kinds = Object.keys(counts).length;
  const secondaryCounts = statusCounts(batchItems, probe.secondaryField);
  const secondaryKinds = Object.keys(secondaryCounts).length;
  const enoughRecords =
    missingReferences.length === 0 &&
    referenceMismatches.length === 0 &&
    accountStateMismatches.length === 0 &&
    (probe.expectedExact == null
      ? actual >= probe.expectedMinimum
      : actual === probe.expectedExact);
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
    Object.keys(mismatchedStatusCounts).length === 0 &&
    !(probe.statusField === "account_status" && counts.INVALID);
  const enoughSecondaryKinds = missingSecondaryKinds.length === 0;
  const taskGroupCounts =
    requiredTaskGroups.length > 0
      ? textValueCounts(taskCoverageItems, (item) => item?.task_group)
      : {};
  const missingTaskGroups = requiredTaskGroups.filter(
    (taskGroup) => !taskGroupCounts[taskGroup],
  );
  const unknownTaskGroups = Object.keys(taskGroupCounts).filter(
    (taskGroup) => !requiredTaskGroups.includes(taskGroup),
  );
  const enoughTaskGroups =
    missingTaskGroups.length === 0 && unknownTaskGroups.length === 0;
  const scenarioCounts =
    requiredScenarios.length > 0
      ? textValueCounts(
          taskCoverageItems,
          (item) => item?.payload?.acceptance_scenario_key,
        )
      : {};
  const missingScenarios = requiredScenarios.filter(
    (scenarioKey) => !scenarioCounts[scenarioKey],
  );
  const unknownScenarios = Object.keys(scenarioCounts).filter(
    (scenarioKey) => !requiredScenarios.includes(scenarioKey),
  );
  const scenarioCountsByTaskGroup = Object.fromEntries(
    requiredTaskGroups.map((taskGroup) => [
      taskGroup,
      textValueCounts(
        taskCoverageItems.filter((item) => item?.task_group === taskGroup),
        (item) => item?.payload?.acceptance_scenario_key,
      ),
    ]),
  );
  const groupScenarioMismatches = requiredTaskGroups.filter((taskGroup) => {
    const expected = requiredScenariosByTaskGroup[taskGroup] || [];
    const actual = scenarioCountsByTaskGroup[taskGroup] || {};
    return (
      expected.some((scenarioKey) => !actual[scenarioKey]) ||
      Object.keys(actual).some((scenarioKey) => !expected.includes(scenarioKey))
    );
  });
  const enoughScenarios =
    missingScenarios.length === 0 &&
    unknownScenarios.length === 0 &&
    groupScenarioMismatches.length === 0;
  return {
    id: probe.id,
    status:
      enoughRecords &&
      enoughStatuses &&
      enoughSecondaryKinds &&
      enoughTaskGroups &&
      enoughScenarios
        ? "pass"
        : "fail",
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
    taskGroupCounts,
    requiredTaskGroups,
    missingTaskGroups,
    unknownTaskGroups,
    enoughTaskGroups,
    scenarioCounts,
    scenarioCountsByTaskGroup,
    requiredScenarios,
    requiredScenariosByTaskGroup,
    groupScenarioMismatches,
    missingScenarios,
    unknownScenarios,
    enoughScenarios,
    batchEvidence: probe.batchEvidence || "not_applicable",
    batchPrefix: probe.batchPrefix || null,
    missingReferences,
    referenceMismatches,
    accountStateMismatches,
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
  includeCustomerKey = true,
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
        domain === "auth" || domain === "admin" || !includeCustomerKey
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

async function readProbeData({ backendURL, probe, token, fetchImpl }) {
  if (probe.batchEvidence !== "exact_references") {
    return rpcCall({
      backendURL,
      domain: probe.domain,
      method: probe.method,
      params: probe.params,
      includeCustomerKey: probe.includeCustomerKey !== false,
      token,
      fetchImpl,
    });
  }
  const queries = [
    ...new Map(
      (probe.referenceQueries || []).map((query) => [
        JSON.stringify(query.params),
        query,
      ]),
    ).values(),
  ];
  const byID = new Map();
  for (const query of queries) {
    const data = await rpcCall({
      backendURL,
      domain: probe.domain,
      method: probe.method,
      params: query.params,
      includeCustomerKey: probe.includeCustomerKey !== false,
      token,
      fetchImpl,
    });
    const items = data?.[probe.listKey];
    if (!Array.isArray(items)) {
      throw new Error(
        `${probe.domain}.${probe.method} 查询 ${query.referenceKey} 缺少 ${probe.listKey}`,
      );
    }
    for (const item of items) {
      if (Number.isSafeInteger(Number(item?.id)) && Number(item.id) > 0) {
        byID.set(Number(item.id), item);
      }
    }
  }
  return {
    [probe.listKey]: [...byID.values()],
    total: byID.size,
  };
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

const READINESS_REQUIRED_MODULES = Object.freeze([
  "production_orders",
  "production",
  "inventory",
  "shipments",
  "finance",
  "purchase_receipts",
  "quality_inspections",
]);

async function assertSafeReadRuntime({
  policy,
  adminPassword,
  sessionToken,
  attestation,
  factRuntime,
  fetchImpl,
}) {
  let token = sessionToken;
  let capabilities;
  if (attestation) {
    capabilities = manualAcceptanceRuntimeCapabilitiesFromAttestation({
      policy,
      attestation,
    });
  } else {
    token = await loginAccount({
      backendURL: policy.backendURL,
      username: RUNTIME_PREFLIGHT_USERNAME,
      password: adminPassword,
      fetchImpl,
    });
    capabilities = await rpcCall({
      backendURL: policy.backendURL,
      domain: "debug",
      method: "capabilities",
      token,
      fetchImpl,
    });
  }
  try {
    assertManualAcceptanceCapabilitiesPolicy({ policy, capabilities });
    assertManualAcceptanceDatabaseIdentity({ policy, capabilities });
  } catch (error) {
    throw new CliError(String(error?.message || error), 2);
  }
  const sessionData = await rpcCall({
    backendURL: policy.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token,
    fetchImpl,
  });
  const session = sessionData.session || {};
  let runtime;
  try {
    runtime = assertManualAcceptanceRuntimePolicy({
      policy,
      capabilities,
      session,
      requiredModules: READINESS_REQUIRED_MODULES,
      customerKey: CUSTOMER_KEY,
    });
  } catch (error) {
    throw new CliError(String(error?.message || error), 2);
  }
  if (
    factRuntime &&
    (runtime.environment !== factRuntime.environment ||
      runtime.customerKey !== factRuntime.customerKey ||
      runtime.configRevision !== factRuntime.configRevision ||
      runtime.source !== factRuntime.source)
  ) {
    throw new CliError("当前运行时与业务记录报告绑定的运行态不一致", 2);
  }
  if (
    attestation &&
    (attestation.release !== factRuntime?.targetAttestation?.release ||
      attestation.migration !== factRuntime?.targetAttestation?.migration)
  ) {
    throw new CliError(
      "customer-trial-133 attestation 与业务记录报告不一致",
      2,
    );
  }
  return {
    ...runtime,
    ...(attestation
      ? {
          targetAttestation: {
            source: "out-of-band",
            release: attestation.release,
            migration: attestation.migration,
          },
        }
      : { username: RUNTIME_PREFLIGHT_USERNAME }),
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
    id: MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.validAccountLogins,
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
  const requiredStatuses = [...TASK_REQUIRED_STATUSES];
  const missingStatuses = requiredStatuses.filter((item) => !counts[item]);
  const allRolesPass = mobileResults.every((item) => item.status === "pass");
  return {
    id: MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.mobileTaskTotal,
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

function taskGroupCoverageSummary(mobileResults, catalogScenarioDigest) {
  const byRole = {};
  for (const result of mobileResults) {
    const roleKey = String(result?.id || "").replace("mobile-tasks:", "");
    if (!TASK_ROLE_KEYS.includes(roleKey)) continue;
    const taskGroups = [...(result.requiredTaskGroups || [])];
    const groups = {};
    for (const taskGroup of taskGroups) {
      const requiredScenarios = [
        ...(result.requiredScenariosByTaskGroup?.[taskGroup] || []),
      ];
      const scenarioCounts = {
        ...(result.scenarioCountsByTaskGroup?.[taskGroup] || {}),
      };
      const scenarioTotal = Object.values(scenarioCounts).reduce(
        (total, count) => total + Number(count || 0),
        0,
      );
      const missingScenarios = requiredScenarios.filter(
        (scenarioKey) => !scenarioCounts[scenarioKey],
      );
      const unknownScenarios = Object.keys(scenarioCounts).filter(
        (scenarioKey) => !requiredScenarios.includes(scenarioKey),
      );
      const enoughScenarios =
        result.enoughScenarios === true &&
        result.enoughTaskGroups === true &&
        Number(result.taskGroupCounts?.[taskGroup] || 0) === scenarioTotal &&
        missingScenarios.length === 0 &&
        unknownScenarios.length === 0;
      groups[taskGroup] = {
        requiredScenarios,
        scenarioCounts,
        missingScenarios,
        unknownScenarios,
        enoughScenarios,
      };
    }
    byRole[roleKey] = { taskGroups, groups };
  }
  const complete =
    catalogScenarioDigest === TASK_CATALOG_SCENARIO_DIGEST &&
    Object.keys(byRole).length === TASK_ROLE_KEYS.length &&
    TASK_ROLE_KEYS.every((roleKey) => {
      const expectedGroups = getManualAcceptanceRoleTaskGroups(roleKey);
      const roleCoverage = byRole[roleKey];
      return (
        JSON.stringify(roleCoverage?.taskGroups) ===
          JSON.stringify(expectedGroups) &&
        JSON.stringify(Object.keys(roleCoverage?.groups || {})) ===
          JSON.stringify(expectedGroups) &&
        expectedGroups.every((taskGroup) => {
          const groupCoverage = roleCoverage.groups[taskGroup];
          return (
            groupCoverage?.enoughScenarios === true &&
            groupCoverage.missingScenarios.length === 0 &&
            groupCoverage.unknownScenarios.length === 0
          );
        })
      );
    });
  return {
    catalogScenarioDigest,
    complete,
    byRole,
  };
}

function bossDashboardActiveResult(bossResult) {
  const terminalStatuses = new Set(["DONE", "REJECTED"]);
  const expectedCounts = taskStatusCountsForRole("boss");
  const expectedMinimum = Object.entries(expectedCounts).reduce(
    (sum, [status, count]) =>
      terminalStatuses.has(status) ? sum : sum + Number(count || 0),
    0,
  );
  const statusCounts = Object.fromEntries(
    Object.entries(bossResult?.statusCounts || {}).filter(
      ([status]) => !terminalStatuses.has(status),
    ),
  );
  const actual = Object.values(statusCounts).reduce(
    (sum, count) => sum + Number(count || 0),
    0,
  );
  const sourceProven = bossResult?.batchEvidence === "exact_source";
  const passed =
    bossResult?.status === "pass" && sourceProven && actual === expectedMinimum;
  return {
    id: MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.bossDashboardActiveTasks,
    status: passed ? "pass" : sourceProven ? "fail" : "not_proven",
    expectedMinimum,
    expectedExact: expectedMinimum,
    actual: sourceProven ? actual : null,
    returned: bossResult?.returned ?? 0,
    statusField: "task_status_key",
    statusCounts,
    statusKinds: Object.keys(statusCounts).length,
    requiredStatuses: Object.keys(expectedCounts).filter(
      (status) => !terminalStatuses.has(status),
    ),
    missingStatuses: [],
    enoughRecords: passed,
    enoughStatuses: passed,
    enoughSecondaryKinds: true,
    batchEvidence: sourceProven ? "exact_source" : "not_proven",
    notProvenReason: sourceProven
      ? null
      : "未提供老板岗位本批任务，不能证明工作台当前事项。",
    error: null,
  };
}

function catalogPrintTemplateResult(plan) {
  const actual = plan.targets.filter(
    (item) => item.catalogGroup === "printPreviewPages",
  ).length;
  return {
    id: MANUAL_ACCEPTANCE_DERIVED_PROBE_IDS.catalogPrintTemplates,
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
    includeCustomerKey: probe.includeCustomerKey !== false,
    batchEvidence: probe.batchEvidence,
    batchPrefix: probe.batchPrefix ?? null,
    exactSourceType: probe.exactSourceType ?? null,
    exactSourceID: probe.exactSourceID ?? null,
    exactTaskCodePrefix: probe.exactTaskCodePrefix ?? null,
    exactOwnerRoleKey: probe.exactOwnerRoleKey ?? null,
    exactTaskGroup: probe.exactTaskGroup ?? null,
    declaredMinimum: probe.declaredMinimum ?? null,
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
      requiredStatusCounts: item.requiredStatusCounts ?? {},
      mismatchedStatusCounts: item.mismatchedStatusCounts ?? {},
      requiredSecondaryKinds: item.requiredSecondaryKinds ?? [],
      missingSecondaryKinds: item.missingSecondaryKinds ?? [],
      batchEvidence: item.batchEvidence,
      batchPrefix: item.batchPrefix ?? null,
      notProvenReason: item.notProvenReason ?? null,
    })),
    pageStatus: "not_run",
    complete: false,
  };
}

function resolveReadinessTarget({
  plan,
  backendURL,
  databaseName,
  targetConfirmation,
  targetAttestation,
}) {
  const factInput = plan.reportInputs?.factReport;
  const identity = factInput || {
    datasetKey: "yoyoosun-manual-acceptance",
    target: "local-dev",
  };
  let policy;
  try {
    policy = resolveManualAcceptanceTarget({
      backendURL,
      target: identity.target,
      datasetKey: identity.datasetKey,
      dataVersion: identity.dataVersion,
      runId: identity.runId,
      databaseName: databaseName || identity.databaseName,
    });
    if (
      factInput &&
      (policy.backendURL !== factInput.backendURL ||
        policy.databaseName !== factInput.databaseName)
    ) {
      throw new Error(
        "--backend-url 和 --database-name 必须与业务记录报告完全一致",
      );
    }
    assertManualAcceptanceMutationTarget(policy, {
      confirmation:
        targetConfirmation || process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    });
    const parsed = parseManualAcceptanceTargetAttestation(
      targetAttestation ??
        process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    );
    if (policy.target === CUSTOMER_TRIAL_133_TARGET) {
      return {
        policy,
        attestation: assertManualAcceptanceTargetAttestation({
          policy,
          attestation: parsed,
        }),
      };
    }
    if (parsed) {
      throw new Error(
        "target attestation is only valid for customer-trial-133",
      );
    }
    return { policy, attestation: undefined };
  } catch (error) {
    throw new CliError(String(error?.message || error), 2);
  }
}

export async function verifyManualAcceptanceReadiness(
  plan,
  {
    backendURL,
    databaseName,
    password,
    adminPassword,
    targetConfirmation,
    targetAttestation,
    fetchImpl = fetch,
    now = () => new Date(),
  } = {},
) {
  const { policy, attestation } = resolveReadinessTarget({
    plan,
    backendURL,
    databaseName,
    targetConfirmation,
    targetAttestation,
  });
  const normalizedBackendURL = policy.backendURL;
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy,
    attestation,
    fetchImpl,
  });
  const effectiveAdminPassword = attestation
    ? undefined
    : requiredText(
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
  let accounts;
  let runtimePreflight;
  if (attestation) {
    accounts = await loginAccounts({
      backendURL: normalizedBackendURL,
      password: effectivePassword,
      fetchImpl,
    });
    if (!accounts.tokens.admin) {
      throw new CliError("demo_admin 未能登录，不能核对客户试用运行时", 2);
    }
    runtimePreflight = await assertSafeReadRuntime({
      policy,
      sessionToken: accounts.tokens.admin,
      attestation,
      factRuntime: plan.reportInputs?.factReport?.runtime,
      fetchImpl,
    });
  } else {
    runtimePreflight = await assertSafeReadRuntime({
      policy,
      adminPassword: effectiveAdminPassword,
      factRuntime: plan.reportInputs?.factReport?.runtime,
      fetchImpl,
    });
    accounts = await loginAccounts({
      backendURL: normalizedBackendURL,
      password: effectivePassword,
      fetchImpl,
    });
  }
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
          taskGroupCounts: {},
          requiredTaskGroups: [...(probe.requiredTaskGroups || [])],
          missingTaskGroups: [...(probe.requiredTaskGroups || [])],
          unknownTaskGroups: [],
          enoughTaskGroups: !(probe.requiredTaskGroups || []).length,
          scenarioCounts: {},
          requiredScenarios: [...(probe.requiredScenarios || [])],
          missingScenarios: [...(probe.requiredScenarios || [])],
          unknownScenarios: [],
          enoughScenarios: !(probe.requiredScenarios || []).length,
          batchEvidence: probe.batchEvidence || "not_applicable",
          batchPrefix: probe.batchPrefix || null,
          error: `岗位 ${probe.roleKey} 未能登录，未执行查询`,
        },
      });
      continue;
    }
    try {
      const data = await readProbeData({
        backendURL: normalizedBackendURL,
        probe,
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
  const taskGroupCoverage = taskGroupCoverageSummary(
    mobileResults,
    plan.reportInputs.taskReport?.taskGroupCoverageDigest || null,
  );
  const totalResult = mobileTotalResult(mobileResults);
  resultById.set(totalResult.id, totalResult);
  const activeBossResult = bossDashboardActiveResult(
    resultById.get("boss-dashboard-tasks"),
  );
  resultById.set(activeBossResult.id, activeBossResult);
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
    activeBossResult,
    totalResult,
    printCatalogResult,
  ];
  return {
    mode: "verify",
    scope: plan.scope,
    generatedAt: now().toISOString(),
    customerKey: plan.customerKey,
    datasetKey: policy.datasetKey,
    dataVersion: policy.dataVersion,
    runId: policy.runId,
    target: policy.target,
    backendURL: normalizedBackendURL,
    databaseName: policy.databaseName,
    readOnly: true,
    writesBusinessData: false,
    authenticationMayAppendAudit: true,
    directSQL: false,
    runtimePreflight: {
      target: runtimePreflight.target,
      environment: runtimePreflight.environment,
      customerKey: runtimePreflight.customerKey,
      configRevision: runtimePreflight.configRevision,
      source: runtimePreflight.source,
      ...(runtimePreflight.targetAttestation
        ? { targetAttestation: runtimePreflight.targetAttestation }
        : {}),
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
      taskGroupCoverage,
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
    databaseName: "",
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
      case "--database-name":
        options.databaseName = value;
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
  if (options.verify && (!options.backendURL || !options.databaseName)) {
    throw new CliError(
      "--verify 必须同时提供 --backend-url 和 --database-name",
      2,
    );
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
      --backend-url http://127.0.0.1:8310 \\
      --database-name plush_erp_acceptance_20260716_v5_dev \\
      --source-report output/qa/manual-acceptance/source-data/apply-report.json \\
      --fact-report output/qa/manual-acceptance/fact-data/apply-report.json \\
      --task-report output/qa/manual-acceptance/task-data/apply-report.json \\
      --out ${DEFAULT_OUT_DIR}

  说明：默认模式不会连接系统；只有同时提供 --verify、--backend-url 和 --database-name 才执行只读核对。本地超级管理员 admin 只用于运行时安全前置，demo_admin 仍按试用账号权限核对。`;
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
    databaseName: options.databaseName,
    password: deps.password,
    adminPassword: deps.adminPassword,
    targetConfirmation: deps.targetConfirmation,
    targetAttestation: deps.targetAttestation,
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
