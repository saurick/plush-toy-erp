#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  MANUAL_ACCEPTANCE_DATASET_KEY,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceTargetAttestation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

export const SOURCE_DRIVEN_FACT_DATA_VERSION = "2026.07.16-v5";
export const SOURCE_DRIVEN_FACT_RUN_ID = "20260716-V5";

const CUSTOMER_KEY = "yoyoosun";
const SIMULATED_NOTE = "按订单办理。";
const DECIMAL_SCALE = 6;
const DECIMAL_FACTOR = 10n ** BigInt(DECIMAL_SCALE);
const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u;
const SOURCE_FACTS_KEY = "sourceDrivenFacts";
const CORE_PHASES = Object.freeze(["production", "outsourcing", "sales"]);
const PHASES = Object.freeze([...CORE_PHASES, "purchase"]);
const INSTANCE_KEY_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,47}$/u;
const BUSINESS_DATA_VERSION_PATTERN =
  /^(\d{4})\.(\d{2})\.(\d{2})-v([1-9]\d*)$/iu;
const BUSINESS_NO_CODES = new Set([
  "PR",
  "RM",
  "TH",
  "TZ",
  "CP",
  "ZJ",
  "SC",
  "XF",
  "LL",
  "WG",
  "FG",
  "WWFL",
  "WWHG",
  "WWCP",
  "WWZJ",
  "WWYF",
  "WWDZ",
  "BL",
  "CK",
  "YS",
  "YSDZ",
  "FP",
  "FPDZ",
  "CGYF",
  "CGDZ",
]);

export const FORMAL_RPC_PARAM_ALLOWLIST = Object.freeze({
  "inventory.list_inventory_balances": Object.freeze([
    "customer_key",
    "subject_type",
    "subject_id",
    "product_sku_id",
    "warehouse_id",
    "lot_id",
    "limit",
    "offset",
  ]),
  "production_order.create_production_order": Object.freeze([
    "order_no",
    "note",
    "items",
    "idempotency_key",
  ]),
  "production_order.release_production_order": Object.freeze([
    "production_order_id",
    "expected_version",
    "idempotency_key",
  ]),
  "operational_fact.create_production_material_issue_from_order": Object.freeze(
    [
      "customer_key",
      "fact_no",
      "production_order_id",
      "production_order_item_id",
      "production_order_material_requirement_id",
      "warehouse_id",
      "lot_id",
      "quantity",
      "idempotency_key",
      "note",
    ],
  ),
  "operational_fact.create_production_completion_from_order": Object.freeze([
    "customer_key",
    "fact_no",
    "production_order_id",
    "production_order_item_id",
    "warehouse_id",
    "new_lot_no",
    "quantity",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.create_production_rework_from_completion": Object.freeze([
    "customer_key",
    "fact_no",
    "source_completion_fact_id",
    "quantity",
    "idempotency_key",
    "reason",
  ]),
  "operational_fact.post_production_fact": Object.freeze([
    "customer_key",
    "id",
  ]),
  "operational_fact.create_outsourcing_material_issue_from_order":
    Object.freeze([
      "customer_key",
      "fact_no",
      "outsourcing_order_id",
      "outsourcing_order_item_id",
      "warehouse_id",
      "lot_id",
      "quantity",
      "idempotency_key",
      "note",
    ]),
  "operational_fact.create_outsourcing_return_receipt_from_order":
    Object.freeze([
      "customer_key",
      "fact_no",
      "outsourcing_order_id",
      "outsourcing_order_item_id",
      "warehouse_id",
      "new_lot_no",
      "quantity",
      "idempotency_key",
      "note",
    ]),
  "operational_fact.post_outsourcing_fact": Object.freeze([
    "customer_key",
    "id",
  ]),
  "quality.list_outsourcing_return_quality_inspections": Object.freeze([
    "customer_key",
    "fact_id",
    "limit",
    "offset",
  ]),
  "quality.create_quality_inspection_from_outsourcing_return": Object.freeze([
    "customer_key",
    "fact_id",
    "inspection_no",
    "note",
  ]),
  "quality.submit_quality_inspection": Object.freeze(["customer_key", "id"]),
  "quality.pass_quality_inspection": Object.freeze([
    "customer_key",
    "id",
    "result",
    "decision_note",
  ]),
  "operational_fact.create_stock_reservation_from_sales_order": Object.freeze([
    "customer_key",
    "reservation_no",
    "sales_order_id",
    "sales_order_item_id",
    "warehouse_id",
    "lot_id",
    "quantity",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.create_shipment_with_items": Object.freeze([
    "customer_key",
    "shipment_no",
    "sales_order_id",
    "customer_id",
    "customer_snapshot",
    "idempotency_key",
    "note",
    "items",
  ]),
  "operational_fact.ship_shipment": Object.freeze(["customer_key", "id"]),
  "operational_fact.create_receivable_from_shipment": Object.freeze([
    "customer_key",
    "fact_no",
    "shipment_id",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.create_invoice_from_shipment": Object.freeze([
    "customer_key",
    "fact_no",
    "shipment_id",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.create_payable_from_outsourcing_return": Object.freeze([
    "customer_key",
    "fact_no",
    "outsourcing_fact_id",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.create_payable_from_purchase_receipt": Object.freeze([
    "customer_key",
    "fact_no",
    "purchase_receipt_id",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.create_reconciliation_from_finance_fact": Object.freeze([
    "customer_key",
    "fact_no",
    "finance_fact_id",
    "idempotency_key",
    "note",
  ]),
  "operational_fact.post_finance_fact": Object.freeze(["customer_key", "id"]),
});

export class SourceDrivenFactError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "SourceDrivenFactError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, name, max = 255) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    throw new SourceDrivenFactError(`${name} must be 1-${max} characters`);
  }
  return normalized;
}

function positiveID(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new SourceDrivenFactError(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function quantityUnits(value, name, { allowZero = false } = {}) {
  if (typeof value !== "string" || !POSITIVE_DECIMAL.test(value)) {
    throw new SourceDrivenFactError(
      `${name} must be a decimal string with at most ${DECIMAL_SCALE} places`,
    );
  }
  const [integer, fraction = ""] = value.split(".");
  const units =
    BigInt(integer) * DECIMAL_FACTOR +
    BigInt(fraction.padEnd(DECIMAL_SCALE, "0"));
  if (allowZero ? units < 0n : units <= 0n) {
    throw new SourceDrivenFactError(`${name} must be positive`);
  }
  return units;
}

function quantity(value, name) {
  quantityUnits(value, name);
  return value;
}

function formatQuantity(units) {
  const integer = units / DECIMAL_FACTOR;
  const fraction = String(units % DECIMAL_FACTOR)
    .padStart(DECIMAL_SCALE, "0")
    .replace(/0+$/u, "");
  return fraction ? `${integer}.${fraction}` : String(integer);
}

function exactStatus(value, expected, name) {
  const normalized = requiredText(value, name, 32).toUpperCase();
  if (normalized !== expected) {
    throw new SourceDrivenFactError(`${name} must be ${expected}`);
  }
  return normalized;
}

function optionalProductSkuID(value, name) {
  if (value == null) return undefined;
  return positiveID(value, name);
}

function normalizeSubject(item, name) {
  const subjectType = requiredText(
    item?.subjectType,
    `${name}.subjectType`,
    16,
  ).toUpperCase();
  if (!new Set(["MATERIAL", "PRODUCT"]).has(subjectType)) {
    throw new SourceDrivenFactError(
      `${name}.subjectType must be MATERIAL or PRODUCT`,
    );
  }
  const productSkuId = optionalProductSkuID(
    item?.productSkuId,
    `${name}.productSkuId`,
  );
  if (subjectType === "MATERIAL" && productSkuId != null) {
    throw new SourceDrivenFactError(
      `${name}.productSkuId is forbidden for MATERIAL`,
    );
  }
  return {
    subjectType,
    subjectId: positiveID(item?.subjectId, `${name}.subjectId`),
    ...(productSkuId == null ? {} : { productSkuId }),
    unitId: positiveID(item?.unitId, `${name}.unitId`),
  };
}

function normalizeProduction(source) {
  const salesOrder = {
    id: positiveID(source?.salesOrder?.id, "production.salesOrder.id"),
    status: exactStatus(
      source?.salesOrder?.status,
      "ACTIVE",
      "production.salesOrder.status",
    ),
  };
  const item = {
    id: positiveID(source?.item?.id, "production.item.id"),
    productId: positiveID(source?.item?.productId, "production.item.productId"),
    productSkuId: optionalProductSkuID(
      source?.item?.productSkuId,
      "production.item.productSkuId",
    ),
    unitId: positiveID(source?.item?.unitId, "production.item.unitId"),
  };
  const bom = {
    id: positiveID(source?.bom?.id, "production.bom.id"),
    status: exactStatus(source?.bom?.status, "ACTIVE", "production.bom.status"),
  };
  const plannedQuantity = quantity(
    source?.plannedQuantity,
    "production.plannedQuantity",
  );
  const completion = {
    warehouseId: positiveID(
      source?.completion?.warehouseId,
      "production.completion.warehouseId",
    ),
    newLotNo: requiredText(
      source?.completion?.newLotNo,
      "production.completion.newLotNo",
      64,
    ),
    quantity: quantity(
      source?.completion?.quantity,
      "production.completion.quantity",
    ),
  };
  if (
    quantityUnits(completion.quantity, "production.completion.quantity") !==
    quantityUnits(plannedQuantity, "production.plannedQuantity")
  ) {
    throw new SourceDrivenFactError(
      "production completion quantity must equal planned quantity",
    );
  }
  if (
    !Array.isArray(source?.materialIssues) ||
    source.materialIssues.length < 1
  ) {
    throw new SourceDrivenFactError(
      "production.materialIssues must contain source BOM material budgets",
    );
  }
  const materialIssues = source.materialIssues.map((record, index) => ({
    materialId: positiveID(
      record?.materialId,
      `production.materialIssues[${index}].materialId`,
    ),
    unitId: positiveID(
      record?.unitId,
      `production.materialIssues[${index}].unitId`,
    ),
    warehouseId: positiveID(
      record?.warehouseId,
      `production.materialIssues[${index}].warehouseId`,
    ),
    lotId: positiveID(
      record?.lotId,
      `production.materialIssues[${index}].lotId`,
    ),
    quantity: quantity(
      record?.quantity,
      `production.materialIssues[${index}].quantity`,
    ),
  }));
  const materialKeys = materialIssues.map(
    (record) => `${record.materialId}:${record.unitId}`,
  );
  if (new Set(materialKeys).size !== materialKeys.length) {
    throw new SourceDrivenFactError(
      "production.materialIssues must be unique by materialId and unitId",
    );
  }
  let rework;
  if (source?.rework != null) {
    rework = {
      quantity: quantity(source.rework.quantity, "production.rework.quantity"),
      reason: requiredText(
        source.rework.reason,
        "production.rework.reason",
        255,
      ),
    };
    if (
      quantityUnits(rework.quantity, "production.rework.quantity") >
      quantityUnits(completion.quantity, "production.completion.quantity")
    ) {
      throw new SourceDrivenFactError(
        "production rework quantity exceeds completion quantity",
      );
    }
  }
  return {
    salesOrder,
    item,
    bom,
    plannedQuantity,
    completion,
    materialIssues,
    ...(rework ? { rework } : {}),
  };
}

function normalizeOutsourcing(source) {
  const normalizeLeg = (leg, name, expectedSubjectType) => {
    const item = {
      id: positiveID(leg?.item?.id, `outsourcing.${name}.item.id`),
      ...normalizeSubject(leg?.item, `outsourcing.${name}.item`),
    };
    if (item.subjectType !== expectedSubjectType) {
      throw new SourceDrivenFactError(
        `outsourcing.${name}.item.subjectType must be ${expectedSubjectType}`,
      );
    }
    return {
      order: {
        id: positiveID(leg?.order?.id, `outsourcing.${name}.order.id`),
        status: exactStatus(
          leg?.order?.status,
          "CONFIRMED",
          `outsourcing.${name}.order.status`,
        ),
      },
      item,
    };
  };
  const issue = normalizeLeg(source?.issue, "issue", "MATERIAL");
  const returned = normalizeLeg(source?.return, "return", "PRODUCT");
  if (issue.order.id !== returned.order.id) {
    throw new SourceDrivenFactError(
      "outsourcing issue and return must use different lines from the same confirmed order",
    );
  }
  return {
    issue: {
      ...issue,
      warehouseId: positiveID(
        source?.issue?.warehouseId,
        "outsourcing.issue.warehouseId",
      ),
      lotId: positiveID(source?.issue?.lotId, "outsourcing.issue.lotId"),
      quantity: quantity(source?.issue?.quantity, "outsourcing.issue.quantity"),
    },
    return: {
      ...returned,
      warehouseId: positiveID(
        source?.return?.warehouseId,
        "outsourcing.return.warehouseId",
      ),
      newLotNo: requiredText(
        source?.return?.newLotNo,
        "outsourcing.return.newLotNo",
        64,
      ),
      quantity: quantity(
        source?.return?.quantity,
        "outsourcing.return.quantity",
      ),
    },
  };
}

function normalizeSales(source) {
  const item = {
    id: positiveID(source?.item?.id, "sales.item.id"),
    productId: positiveID(source?.item?.productId, "sales.item.productId"),
    productSkuId: optionalProductSkuID(
      source?.item?.productSkuId,
      "sales.item.productSkuId",
    ),
    unitId: positiveID(source?.item?.unitId, "sales.item.unitId"),
  };
  const inventory = {
    warehouseId: positiveID(
      source?.inventory?.warehouseId,
      "sales.inventory.warehouseId",
    ),
    lotId: positiveID(source?.inventory?.lotId, "sales.inventory.lotId"),
    quantity: quantity(source?.inventory?.quantity, "sales.inventory.quantity"),
  };
  return {
    order: {
      id: positiveID(source?.order?.id, "sales.order.id"),
      status: exactStatus(
        source?.order?.status,
        "ACTIVE",
        "sales.order.status",
      ),
      customerId: positiveID(
        source?.order?.customerId,
        "sales.order.customerId",
      ),
      customerSnapshot: requiredText(
        source?.order?.customerSnapshot,
        "sales.order.customerSnapshot",
        255,
      ),
    },
    item,
    inventory,
  };
}

function normalizePurchase(source) {
  return {
    receipt: {
      id: positiveID(source?.receipt?.id, "purchase.receipt.id"),
      status: exactStatus(
        source?.receipt?.status,
        "POSTED",
        "purchase.receipt.status",
      ),
    },
  };
}

function phase(source, normalize, missingReason, { optional = false } = {}) {
  if (source == null) {
    return {
      status: optional ? "unsupported" : "blocked",
      reason: missingReason,
    };
  }
  try {
    return { status: "planned", source: normalize(source) };
  } catch (error) {
    if (!(error instanceof SourceDrivenFactError)) throw error;
    return { status: "blocked", reason: error.message };
  }
}

function stableHash(...values) {
  return createHash("sha256")
    .update(values.map((value) => String(value)).join("\u001f"))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

export function manualAcceptanceBusinessNo({ dataVersion, code, sequence }) {
  const version = requiredText(dataVersion, "dataVersion", 48);
  const match = version.match(BUSINESS_DATA_VERSION_PATTERN);
  if (!match) {
    throw new SourceDrivenFactError(
      "dataVersion must use YYYY.MM.DD-vN before a visible business number is generated",
    );
  }
  const normalizedCode = requiredText(code, "business number code", 8).toUpperCase();
  if (!BUSINESS_NO_CODES.has(normalizedCode)) {
    throw new SourceDrivenFactError(
      `business number code ${normalizedCode} is not registered`,
    );
  }
  const normalizedSequence = String(sequence ?? "").trim();
  if (!/^\d{1,6}$/u.test(normalizedSequence) || Number(normalizedSequence) <= 0) {
    throw new SourceDrivenFactError(
      "business number sequence must be a positive 1-6 digit value",
    );
  }
  const [, year, month, day, revision] = match;
  const versionToken = `${year.slice(-2)}${month}${day}V${revision}`;
  return `TEST-YS-${versionToken}-${normalizedCode}${normalizedSequence.padStart(3, "0")}`;
}

function operationBusinessCode(label) {
  const materialIssue = label.match(/^production-issue-(\d{1,2})$/u);
  if (materialIssue) {
    return { code: "LL", line: materialIssue[1].padStart(2, "0") };
  }
  const codeByLabel = {
    "production-order": "SC",
    "production-release": "XF",
    "production-completion": "WG",
    "production-rework": "FG",
    "outsourcing-issue": "WWFL",
    "outsourcing-return": "WWHG",
    "outsourcing-quality": "WWZJ",
    "outsourcing-payable": "WWYF",
    "outsourcing-reconciliation": "WWDZ",
    "sales-reservation": "BL",
    "sales-shipment": "CK",
    "sales-receivable": "YS",
    "sales-receivable-reconciliation": "YSDZ",
    "sales-invoice": "FP",
    "sales-invoice-reconciliation": "FPDZ",
    "purchase-payable": "CGYF",
    "purchase-reconciliation": "CGDZ",
  };
  const code = codeByLabel[label];
  if (!code) {
    throw new SourceDrivenFactError(
      `operation label ${label} has no registered visible business number`,
    );
  }
  return { code, line: "" };
}

function operationInstanceSequence(instanceKey) {
  const normalized = requiredText(instanceKey || "PRIMARY", "instanceKey", 48);
  if (normalized === "PRIMARY") return "001";
  const trailing = normalized.match(/(?:^|-)(\d{1,3})$/u)?.[1];
  if (trailing && Number(trailing) > 0) return trailing.padStart(3, "0");
  const derived = (Number.parseInt(stableHash(normalized).slice(0, 8), 16) % 999) + 1;
  return String(derived).padStart(3, "0");
}

function operationIdentity(planIdentity, label, ...sourceIDs) {
  const hash = stableHash(
    planIdentity.datasetKey,
    planIdentity.dataVersion,
    planIdentity.runId,
    planIdentity.instanceKey || "PRIMARY",
    label,
    ...sourceIDs,
  );
  const { code, line } = operationBusinessCode(label);
  const sequence = `${operationInstanceSequence(planIdentity.instanceKey)}${line}`;
  return Object.freeze({
    businessNo: manualAcceptanceBusinessNo({
      dataVersion: planIdentity.dataVersion,
      code,
      sequence,
    }),
    idempotencyKey:
      `manual-acceptance:${planIdentity.dataVersion}:${label}:${hash}`.slice(
        0,
        128,
      ),
  });
}

function buildIdentities(identity, phases) {
  const result = {};
  if (phases.production.status === "planned") {
    const source = phases.production.source;
    result.production = {
      order: operationIdentity(identity, "production-order", source.item.id),
      release: operationIdentity(
        identity,
        "production-release",
        source.item.id,
      ),
      materialIssues: source.materialIssues.map((record, index) =>
        operationIdentity(
          identity,
          `production-issue-${index + 1}`,
          source.item.id,
          record.materialId,
          record.lotId,
        ),
      ),
      completion: operationIdentity(
        identity,
        "production-completion",
        source.item.id,
      ),
      ...(source.rework
        ? {
            rework: operationIdentity(
              identity,
              "production-rework",
              source.item.id,
            ),
          }
        : {}),
    };
  }
  if (phases.outsourcing.status === "planned") {
    const source = phases.outsourcing.source;
    const sourceLines = [source.issue.item.id, source.return.item.id];
    result.outsourcing = {
      issue: operationIdentity(identity, "outsourcing-issue", ...sourceLines),
      return: operationIdentity(identity, "outsourcing-return", ...sourceLines),
      quality: operationIdentity(
        identity,
        "outsourcing-quality",
        ...sourceLines,
      ),
      payable: operationIdentity(
        identity,
        "outsourcing-payable",
        ...sourceLines,
      ),
      reconciliation: operationIdentity(
        identity,
        "outsourcing-reconciliation",
        ...sourceLines,
      ),
    };
  }
  if (phases.sales.status === "planned") {
    const source = phases.sales.source;
    result.sales = {
      reservation: operationIdentity(
        identity,
        "sales-reservation",
        source.item.id,
      ),
      shipment: operationIdentity(identity, "sales-shipment", source.item.id),
      receivable: operationIdentity(
        identity,
        "sales-receivable",
        source.item.id,
      ),
      receivableReconciliation: operationIdentity(
        identity,
        "sales-receivable-reconciliation",
        source.item.id,
      ),
      invoice: operationIdentity(identity, "sales-invoice", source.item.id),
      invoiceReconciliation: operationIdentity(
        identity,
        "sales-invoice-reconciliation",
        source.item.id,
      ),
    };
  }
  if (phases.purchase.status === "planned") {
    const source = phases.purchase.source;
    result.purchase = {
      payable: operationIdentity(
        identity,
        "purchase-payable",
        source.receipt.id,
      ),
      reconciliation: operationIdentity(
        identity,
        "purchase-reconciliation",
        source.receipt.id,
      ),
    };
  }
  return Object.freeze(result);
}

function validateSourceReport(report) {
  if (!report || report.mode !== "apply") {
    throw new SourceDrivenFactError(
      "source report must be a successful source-data apply report",
    );
  }
  if (report.simulatedOnly !== true || report.realCustomerImport !== false) {
    throw new SourceDrivenFactError(
      "source report must remain simulatedOnly and realCustomerImport=false",
    );
  }
  if (report.datasetKey !== MANUAL_ACCEPTANCE_DATASET_KEY) {
    throw new SourceDrivenFactError(
      `source report datasetKey must be ${MANUAL_ACCEPTANCE_DATASET_KEY}`,
    );
  }
  requiredText(report.dataVersion, "source report dataVersion", 64);
  requiredText(report.runId, "source report runId", 64);
  const policy = resolveManualAcceptanceTarget({
    backendURL: report.backendURL,
    target: report.target,
    datasetKey: report.datasetKey,
    dataVersion: report.dataVersion,
    runId: report.runId,
    databaseName: report.databaseName,
  });
  return { report, policy };
}

function normalizeInstanceKey(value = "PRIMARY") {
  const instanceKey = requiredText(value, "instanceKey", 48).toUpperCase();
  if (!INSTANCE_KEY_PATTERN.test(instanceKey)) {
    throw new SourceDrivenFactError(
      "instanceKey must use 1-48 uppercase letters, digits, underscore, or hyphen",
    );
  }
  return instanceKey;
}

function normalizeEnabledPhases(value) {
  if (value == null) return [...PHASES];
  if (!Array.isArray(value) || value.length === 0) {
    throw new SourceDrivenFactError("enabledPhases must be a non-empty array");
  }
  const normalized = value.map((item) =>
    requiredText(item, "enabledPhases item", 32).toLowerCase(),
  );
  if (
    new Set(normalized).size !== normalized.length ||
    normalized.some((item) => !PHASES.includes(item))
  ) {
    throw new SourceDrivenFactError(
      `enabledPhases must contain unique values from ${PHASES.join(", ")}`,
    );
  }
  return normalized;
}

export function sourceDrivenFactConfirmation(plan) {
  if (!plan || plan.mode !== "plan") {
    throw new SourceDrivenFactError("a source-driven Fact plan is required");
  }
  return [
    "APPLY_SOURCE_DRIVEN_FACT_DATA",
    requiredText(plan.target, "plan.target", 64),
    requiredText(plan.dataVersion, "plan.dataVersion", 64),
    requiredText(plan.runId, "plan.runId", 64),
    normalizeInstanceKey(plan.instanceKey),
    [...(plan.enabledPhases || [])].join("+"),
  ].join(":");
}

export const SOURCE_DRIVEN_FACT_CONFIRMATION =
  `APPLY_SOURCE_DRIVEN_FACT_DATA:local-dev:${SOURCE_DRIVEN_FACT_DATA_VERSION}:${SOURCE_DRIVEN_FACT_RUN_ID}:PRIMARY:production+outsourcing+sales+purchase`;

export function buildSourceDrivenFactPlan(sourceReport, options = {}) {
  const { report, policy } = validateSourceReport(sourceReport);
  const sourceFacts = report.referenceRecords?.[SOURCE_FACTS_KEY];
  const instanceKey = normalizeInstanceKey(options.instanceKey);
  const enabledPhases = normalizeEnabledPhases(options.enabledPhases);
  const identityMismatch =
    sourceFacts != null &&
    (sourceFacts.datasetKey !== report.datasetKey ||
      sourceFacts.dataVersion !== report.dataVersion ||
      sourceFacts.runId !== report.runId);
  const facts = identityMismatch ? undefined : sourceFacts;
  const missingIdentityReason = identityMismatch
    ? "referenceRecords.sourceDrivenFacts identity does not match the source report"
    : "referenceRecords.sourceDrivenFacts is missing";
  const plannedSource = (name) =>
    options[name] === undefined ? facts?.[name] : options[name];
  const phaseReadiness = (name) => facts?.phaseReadiness?.[name];
  const sourceCandidate = (name) => facts?.sourceCandidates?.[name];
  const plannedPhase = (name, normalize, missingReason, phaseOptions) => {
    const readiness = Object.prototype.hasOwnProperty.call(options, name)
      ? undefined
      : phaseReadiness(name);
    if (
      readiness &&
      readiness.status !== "planned" &&
      readiness.status !== "ready"
    ) {
      const status =
        readiness.status === "unsupported" ? "unsupported" : "blocked";
      return {
        status,
        reason: requiredText(
          readiness.reason,
          `sourceDrivenFacts.phaseReadiness.${name}.reason`,
        ),
        ...(sourceCandidate(name)
          ? { sourceCandidate: structuredClone(sourceCandidate(name)) }
          : {}),
      };
    }
    return phase(
      plannedSource(name),
      normalize,
      missingReason,
      phaseOptions,
    );
  };
  const phases = {
    production: plannedPhase(
      "production",
      normalizeProduction,
      facts ? "sourceDrivenFacts.production is missing" : missingIdentityReason,
    ),
    outsourcing: plannedPhase(
      "outsourcing",
      normalizeOutsourcing,
      facts
        ? "sourceDrivenFacts.outsourcing is missing"
        : missingIdentityReason,
    ),
    sales: plannedPhase(
      "sales",
      normalizeSales,
      facts ? "sourceDrivenFacts.sales is missing" : missingIdentityReason,
    ),
    purchase: plannedPhase(
      "purchase",
      normalizePurchase,
      "no posted purchase receipt source; outsourcing-return payable remains the required payable path",
      { optional: true },
    ),
  };
  for (const name of PHASES) {
    if (!enabledPhases.includes(name)) {
      phases[name] = {
        status: "disabled",
        reason: "phase is not enabled for this atomic apply",
      };
    }
  }
  const blocked = Object.entries(phases)
    .filter(
      ([name, value]) =>
        value.status === "blocked" &&
        enabledPhases.includes(name),
    )
    .map(([name, value]) => ({ phase: name, reason: value.reason }));
  const identity = Object.freeze({
    datasetKey: report.datasetKey,
    dataVersion: report.dataVersion,
    runId: report.runId,
    instanceKey,
  });
  return Object.freeze({
    mode: "plan",
    writes: false,
    applySupported: true,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    retiredGenericFactWriter: false,
    customerKey: CUSTOMER_KEY,
    ...identity,
    enabledPhases: Object.freeze([...enabledPhases]),
    lifecycleProfile:
      options.lifecycleProfile == null
        ? "posted"
        : requiredText(options.lifecycleProfile, "lifecycleProfile", 32),
    target: policy.target,
    backendURL: policy.backendURL,
    databaseName: policy.databaseName,
    phases,
    identities: buildIdentities(identity, phases),
    blocked,
    readyForPreflight:
      blocked.length === 0 &&
      enabledPhases.every(
        (name) =>
          phases[name].status === "planned" ||
          (name === "purchase" && phases[name].status === "unsupported"),
      ),
  });
}

function inventoryBudgetKey(record) {
  return [
    record.subjectType,
    record.subjectId,
    record.productSkuId || 0,
    record.warehouseId,
    record.lotId,
    record.unitId,
  ].join(":");
}

function aggregateInventoryBudgets(plan) {
  const budgets = [];
  if (plan.phases.production.status === "planned") {
    for (const record of plan.phases.production.source.materialIssues) {
      budgets.push({
        phase: "production",
        subjectType: "MATERIAL",
        subjectId: record.materialId,
        warehouseId: record.warehouseId,
        lotId: record.lotId,
        unitId: record.unitId,
        quantity: record.quantity,
      });
    }
  }
  if (plan.phases.outsourcing.status === "planned") {
    const source = plan.phases.outsourcing.source;
    budgets.push({
      phase: "outsourcing",
      subjectType: source.issue.item.subjectType,
      subjectId: source.issue.item.subjectId,
      ...(source.issue.item.productSkuId == null
        ? {}
        : { productSkuId: source.issue.item.productSkuId }),
      warehouseId: source.issue.warehouseId,
      lotId: source.issue.lotId,
      unitId: source.issue.item.unitId,
      quantity: source.issue.quantity,
    });
  }
  if (plan.phases.sales.status === "planned") {
    const source = plan.phases.sales.source;
    budgets.push({
      phase: "sales",
      subjectType: "PRODUCT",
      subjectId: source.item.productId,
      ...(source.item.productSkuId == null
        ? {}
        : { productSkuId: source.item.productSkuId }),
      warehouseId: source.inventory.warehouseId,
      lotId: source.inventory.lotId,
      unitId: source.item.unitId,
      quantity: source.inventory.quantity,
    });
  }
  const aggregated = new Map();
  for (const budget of budgets) {
    const key = inventoryBudgetKey(budget);
    const current = aggregated.get(key);
    const requiredUnits =
      (current?.requiredUnits || 0n) +
      quantityUnits(budget.quantity, `${budget.phase}.inventory.quantity`);
    aggregated.set(key, {
      ...budget,
      phases: [...(current?.phases || []), budget.phase],
      requiredUnits,
    });
  }
  return [...aggregated.values()].map(({ requiredUnits, ...budget }) => ({
    ...budget,
    requiredQuantity: formatQuantity(requiredUnits),
  }));
}

function assertAllowedParams(domain, method, params) {
  const key = `${domain}.${method}`;
  const allowed = FORMAL_RPC_PARAM_ALLOWLIST[key];
  if (!allowed) {
    throw new SourceDrivenFactError(
      `method is not formally allowlisted: ${key}`,
    );
  }
  const unexpected = Object.keys(params).filter(
    (param) => !allowed.includes(param),
  );
  if (unexpected.length > 0) {
    throw new SourceDrivenFactError(
      `${key} received non-allowlisted params: ${unexpected.join(", ")}`,
    );
  }
}

async function invoke(rpc, domain, method, params) {
  if (typeof rpc !== "function") {
    throw new SourceDrivenFactError("rpc dependency is required");
  }
  assertAllowedParams(domain, method, params);
  const raw = await rpc({ domain, method, params });
  const envelope = raw?.result ?? raw;
  if (
    envelope &&
    Object.hasOwn(envelope, "code") &&
    Number(envelope.code) !== 0
  ) {
    throw new SourceDrivenFactError(
      `${domain}.${method} code=${envelope.code} message=${envelope.message || "unknown"}`,
    );
  }
  return envelope?.data ?? envelope ?? {};
}

function exactInventoryRows(data, budget) {
  const rows = Array.isArray(data?.inventory_balances)
    ? data.inventory_balances
    : [];
  return rows.filter(
    (row) =>
      row?.subject_type === budget.subjectType &&
      Number(row?.subject_id) === budget.subjectId &&
      Number(row?.product_sku_id || 0) === (budget.productSkuId || 0) &&
      Number(row?.warehouse_id) === budget.warehouseId &&
      Number(row?.lot_id || 0) === budget.lotId &&
      Number(row?.unit_id) === budget.unitId,
  );
}

export async function preflightSourceDrivenFactPlan(plan, { rpc } = {}) {
  if (!plan?.readyForPreflight) {
    return {
      ok: false,
      writes: false,
      blocked: plan?.blocked || [
        { phase: "plan", reason: "plan is not ready for preflight" },
      ],
      inventory: [],
    };
  }
  const inventory = [];
  for (const budget of aggregateInventoryBudgets(plan)) {
    const params = {
      customer_key: CUSTOMER_KEY,
      subject_type: budget.subjectType,
      subject_id: budget.subjectId,
      ...(budget.productSkuId == null
        ? {}
        : { product_sku_id: budget.productSkuId }),
      warehouse_id: budget.warehouseId,
      lot_id: budget.lotId,
      limit: 2,
      offset: 0,
    };
    const data = await invoke(
      rpc,
      "inventory",
      "list_inventory_balances",
      params,
    );
    const matches = exactInventoryRows(data, budget);
    if (matches.length !== 1) {
      inventory.push({
        ...budget,
        ok: false,
        reason: `expected one exact inventory balance, got ${matches.length}`,
      });
      continue;
    }
    const availableUnits = quantityUnits(
      String(matches[0].available_quantity ?? ""),
      "inventory.available_quantity",
      { allowZero: true },
    );
    const requiredUnits = quantityUnits(
      budget.requiredQuantity,
      "inventory.required_quantity",
    );
    inventory.push({
      ...budget,
      availableQuantity: formatQuantity(availableUnits),
      ok: availableUnits >= requiredUnits,
      ...(availableUnits >= requiredUnits
        ? {}
        : {
            reason: "available inventory is below the aggregated write budget",
          }),
    });
  }
  return {
    ok: inventory.every((item) => item.ok),
    writes: false,
    blocked: inventory
      .filter((item) => !item.ok)
      .map((item) => ({ phase: item.phases.join("+"), reason: item.reason })),
    inventory,
  };
}

function customerParams(params = {}) {
  return { customer_key: CUSTOMER_KEY, ...params };
}

function requireResult(data, key, status, operation) {
  const item = data?.[key];
  if (!item || positiveID(item.id, `${operation}.${key}.id`) <= 0) {
    throw new SourceDrivenFactError(`${operation} response missing ${key}`);
  }
  if (status && String(item.status || "").toUpperCase() !== status) {
    throw new SourceDrivenFactError(
      `${operation} expected ${status}, got ${item.status || "missing"}`,
    );
  }
  return item;
}

async function createPostFact({
  rpc,
  createMethod,
  createParams,
  resultKey,
  postMethod,
}) {
  const created = requireResult(
    await invoke(rpc, "operational_fact", createMethod, createParams),
    resultKey,
    null,
    createMethod,
  );
  const createdStatus = String(created.status || "").toUpperCase();
  if (createdStatus === "POSTED") return created;
  if (createdStatus !== "DRAFT") {
    throw new SourceDrivenFactError(
      `${createMethod} expected DRAFT or POSTED, got ${created.status || "missing"}`,
    );
  }
  const posted = requireResult(
    await invoke(
      rpc,
      "operational_fact",
      postMethod,
      customerParams({ id: created.id }),
    ),
    resultKey,
    "POSTED",
    postMethod,
  );
  return posted;
}

function matchProductionRequirements(data, source) {
  const items = Array.isArray(data?.production_order_items)
    ? data.production_order_items
    : [];
  if (items.length !== 1 || !items[0]?.id) {
    throw new SourceDrivenFactError(
      "released production order must return exactly one persisted item",
    );
  }
  const requirements = Array.isArray(data?.production_material_requirements)
    ? data.production_material_requirements
    : [];
  if (
    data?.material_requirements_state !== "READY" ||
    requirements.length !== source.materialIssues.length
  ) {
    throw new SourceDrivenFactError(
      "released production order material requirements do not match the source budget",
    );
  }
  const byKey = new Map();
  for (const requirement of requirements) {
    const key = `${requirement.material_id}:${requirement.unit_id}`;
    if (byKey.has(key)) {
      throw new SourceDrivenFactError(
        `duplicate production material requirement ${key}`,
      );
    }
    byKey.set(key, requirement);
  }
  const matched = source.materialIssues.map((budget) => {
    const key = `${budget.materialId}:${budget.unitId}`;
    const requirement = byKey.get(key);
    if (!requirement?.id) {
      throw new SourceDrivenFactError(
        `production material requirement ${key} is missing`,
      );
    }
    if (
      quantityUnits(
        String(requirement.remaining_quantity ?? ""),
        `production requirement ${key}`,
      ) !== quantityUnits(budget.quantity, `production budget ${key}`)
    ) {
      throw new SourceDrivenFactError(
        `production material requirement ${key} quantity conflicts with source budget`,
      );
    }
    return { budget, requirement };
  });
  return { item: items[0], requirements: matched };
}

async function applyProduction(plan, rpc) {
  const source = plan.phases.production.source;
  const identity = plan.identities.production;
  const create = await invoke(
    rpc,
    "production_order",
    "create_production_order",
    {
      order_no: identity.order.businessNo,
      note: SIMULATED_NOTE,
      items: [
        {
          line_no: 1,
          product_id: source.item.productId,
          ...(source.item.productSkuId == null
            ? {}
            : { product_sku_id: source.item.productSkuId }),
          unit_id: source.item.unitId,
          planned_quantity: source.plannedQuantity,
          sales_order_item_id: source.item.id,
          bom_header_id: source.bom.id,
          note: SIMULATED_NOTE,
        },
      ],
      idempotency_key: identity.order.idempotencyKey,
    },
  );
  const order = requireResult(
    create,
    "production_order",
    "DRAFT",
    "create_production_order",
  );
  const release = await invoke(
    rpc,
    "production_order",
    "release_production_order",
    {
      production_order_id: order.id,
      expected_version: positiveID(
        order.version,
        "create_production_order.production_order.version",
      ),
      idempotency_key: identity.release.idempotencyKey,
    },
  );
  requireResult(
    release,
    "production_order",
    "RELEASED",
    "release_production_order",
  );
  const matched = matchProductionRequirements(release, source);
  const materialIssues = [];
  for (let index = 0; index < matched.requirements.length; index += 1) {
    const { budget, requirement } = matched.requirements[index];
    const operation = identity.materialIssues[index];
    materialIssues.push(
      await createPostFact({
        rpc,
        createMethod: "create_production_material_issue_from_order",
        createParams: customerParams({
          fact_no: operation.businessNo,
          production_order_id: order.id,
          production_order_item_id: matched.item.id,
          production_order_material_requirement_id: requirement.id,
          warehouse_id: budget.warehouseId,
          lot_id: budget.lotId,
          quantity: budget.quantity,
          idempotency_key: operation.idempotencyKey,
          note: SIMULATED_NOTE,
        }),
        resultKey: "production_fact",
        postMethod: "post_production_fact",
      }),
    );
  }
  const completion = await createPostFact({
    rpc,
    createMethod: "create_production_completion_from_order",
    createParams: customerParams({
      fact_no: identity.completion.businessNo,
      production_order_id: order.id,
      production_order_item_id: matched.item.id,
      warehouse_id: source.completion.warehouseId,
      new_lot_no: source.completion.newLotNo,
      quantity: source.completion.quantity,
      idempotency_key: identity.completion.idempotencyKey,
      note: SIMULATED_NOTE,
    }),
    resultKey: "production_fact",
    postMethod: "post_production_fact",
  });
  let rework;
  if (source.rework) {
    rework = await createPostFact({
      rpc,
      createMethod: "create_production_rework_from_completion",
      createParams: customerParams({
        fact_no: identity.rework.businessNo,
        source_completion_fact_id: completion.id,
        quantity: source.rework.quantity,
        idempotency_key: identity.rework.idempotencyKey,
        reason: source.rework.reason,
      }),
      resultKey: "production_fact",
      postMethod: "post_production_fact",
    });
  }
  return {
    order: requireResult(
      release,
      "production_order",
      "RELEASED",
      "release_production_order",
    ),
    item: matched.item,
    materialIssues,
    completion,
    ...(rework ? { rework } : {}),
  };
}

async function ensureOutsourcingQuality(plan, rpc, returnFactID) {
  const identity = plan.identities.outsourcing.quality;
  const existing = await invoke(
    rpc,
    "quality",
    "list_outsourcing_return_quality_inspections",
    customerParams({
      fact_id: returnFactID,
      limit: 2,
      offset: 0,
    }),
  );
  const inspections = Array.isArray(existing?.quality_inspections)
    ? existing.quality_inspections
    : [];
  if (inspections.length > 1) {
    throw new SourceDrivenFactError(
      "outsourcing return has conflicting active quality inspections",
    );
  }
  let inspection = inspections[0];
  if (!inspection) {
    inspection = requireResult(
      await invoke(
        rpc,
        "quality",
        "create_quality_inspection_from_outsourcing_return",
        customerParams({
          fact_id: returnFactID,
          inspection_no: identity.businessNo,
          note: SIMULATED_NOTE,
        }),
      ),
      "quality_inspection",
      "DRAFT",
      "create_quality_inspection_from_outsourcing_return",
    );
  }
  let status = String(inspection.status || "").toUpperCase();
  if (status === "DRAFT") {
    inspection = requireResult(
      await invoke(
        rpc,
        "quality",
        "submit_quality_inspection",
        customerParams({ id: inspection.id }),
      ),
      "quality_inspection",
      "SUBMITTED",
      "submit_quality_inspection",
    );
    status = "SUBMITTED";
  }
  if (status === "SUBMITTED") {
    inspection = requireResult(
      await invoke(
        rpc,
        "quality",
        "pass_quality_inspection",
        customerParams({
          id: inspection.id,
          result: "PASS",
          decision_note: SIMULATED_NOTE,
        }),
      ),
      "quality_inspection",
      "PASSED",
      "pass_quality_inspection",
    );
    status = "PASSED";
  }
  if (
    status !== "PASSED" ||
    !new Set(["PASS", "CONCESSION"]).has(
      String(inspection.result || "").toUpperCase(),
    )
  ) {
    throw new SourceDrivenFactError(
      `outsourcing quality is not accepted: status=${status || "missing"}`,
    );
  }
  return inspection;
}

async function createPostedFinanceWithReconciliation({
  plan,
  rpc,
  createMethod,
  sourceParam,
  sourceID,
  identity,
}) {
  const finance = await createPostFact({
    rpc,
    createMethod,
    createParams: customerParams({
      fact_no: identity.businessNo,
      [sourceParam]: sourceID,
      idempotency_key: identity.idempotencyKey,
      note: SIMULATED_NOTE,
    }),
    resultKey: "finance_fact",
    postMethod: "post_finance_fact",
  });
  const reconciliationIdentity =
    identity.reconciliation ||
    operationIdentity(
      plan,
      `${createMethod}-reconciliation`,
      sourceID,
      finance.id,
    );
  const reconciliation = await createPostFact({
    rpc,
    createMethod: "create_reconciliation_from_finance_fact",
    createParams: customerParams({
      fact_no: reconciliationIdentity.businessNo,
      finance_fact_id: finance.id,
      idempotency_key: reconciliationIdentity.idempotencyKey,
      note: SIMULATED_NOTE,
    }),
    resultKey: "finance_fact",
    postMethod: "post_finance_fact",
  });
  return { finance, reconciliation };
}

async function applyOutsourcing(plan, rpc) {
  const source = plan.phases.outsourcing.source;
  const identity = plan.identities.outsourcing;
  const issue = await createPostFact({
    rpc,
    createMethod: "create_outsourcing_material_issue_from_order",
    createParams: customerParams({
      fact_no: identity.issue.businessNo,
      outsourcing_order_id: source.issue.order.id,
      outsourcing_order_item_id: source.issue.item.id,
      warehouse_id: source.issue.warehouseId,
      lot_id: source.issue.lotId,
      quantity: source.issue.quantity,
      idempotency_key: identity.issue.idempotencyKey,
      note: SIMULATED_NOTE,
    }),
    resultKey: "outsourcing_fact",
    postMethod: "post_outsourcing_fact",
  });
  const returned = await createPostFact({
    rpc,
    createMethod: "create_outsourcing_return_receipt_from_order",
    createParams: customerParams({
      fact_no: identity.return.businessNo,
      outsourcing_order_id: source.return.order.id,
      outsourcing_order_item_id: source.return.item.id,
      warehouse_id: source.return.warehouseId,
      new_lot_no: source.return.newLotNo,
      quantity: source.return.quantity,
      idempotency_key: identity.return.idempotencyKey,
      note: SIMULATED_NOTE,
    }),
    resultKey: "outsourcing_fact",
    postMethod: "post_outsourcing_fact",
  });
  const inspection = await ensureOutsourcingQuality(plan, rpc, returned.id);
  const payable = await createPostedFinanceWithReconciliation({
    plan,
    rpc,
    createMethod: "create_payable_from_outsourcing_return",
    sourceParam: "outsourcing_fact_id",
    sourceID: returned.id,
    identity: {
      ...identity.payable,
      reconciliation: identity.reconciliation,
    },
  });
  return {
    issue,
    return: returned,
    qualityInspection: inspection,
    ...payable,
  };
}

async function applySales(plan, rpc) {
  const source = plan.phases.sales.source;
  const identity = plan.identities.sales;
  const reservation = requireResult(
    await invoke(
      rpc,
      "operational_fact",
      "create_stock_reservation_from_sales_order",
      customerParams({
        reservation_no: identity.reservation.businessNo,
        sales_order_id: source.order.id,
        sales_order_item_id: source.item.id,
        warehouse_id: source.inventory.warehouseId,
        lot_id: source.inventory.lotId,
        quantity: source.inventory.quantity,
        idempotency_key: identity.reservation.idempotencyKey,
        note: SIMULATED_NOTE,
      }),
    ),
    "stock_reservation",
    "ACTIVE",
    "create_stock_reservation_from_sales_order",
  );
  const shipmentDraft = requireResult(
    await invoke(
      rpc,
      "operational_fact",
      "create_shipment_with_items",
      customerParams({
        shipment_no: identity.shipment.businessNo,
        sales_order_id: source.order.id,
        customer_id: source.order.customerId,
        customer_snapshot: source.order.customerSnapshot,
        idempotency_key: identity.shipment.idempotencyKey,
        note: SIMULATED_NOTE,
        items: [
          {
            sales_order_item_id: source.item.id,
            product_id: source.item.productId,
            ...(source.item.productSkuId == null
              ? {}
              : { product_sku_id: source.item.productSkuId }),
            warehouse_id: source.inventory.warehouseId,
            unit_id: source.item.unitId,
            lot_id: source.inventory.lotId,
            quantity: source.inventory.quantity,
            note: SIMULATED_NOTE,
          },
        ],
      }),
    ),
    "shipment",
    "DRAFT",
    "create_shipment_with_items",
  );
  const shipment = requireResult(
    await invoke(
      rpc,
      "operational_fact",
      "ship_shipment",
      customerParams({ id: shipmentDraft.id }),
    ),
    "shipment",
    "SHIPPED",
    "ship_shipment",
  );
  const receivable = await createPostedFinanceWithReconciliation({
    plan,
    rpc,
    createMethod: "create_receivable_from_shipment",
    sourceParam: "shipment_id",
    sourceID: shipment.id,
    identity: {
      ...identity.receivable,
      reconciliation: identity.receivableReconciliation,
    },
  });
  const invoice = await createPostedFinanceWithReconciliation({
    plan,
    rpc,
    createMethod: "create_invoice_from_shipment",
    sourceParam: "shipment_id",
    sourceID: shipment.id,
    identity: {
      ...identity.invoice,
      reconciliation: identity.invoiceReconciliation,
    },
  });
  return {
    reservation,
    shipment,
    receivable,
    invoice,
  };
}

async function applyPurchase(plan, rpc) {
  if (plan.phases.purchase.status !== "planned") {
    return { status: "unsupported", reason: plan.phases.purchase.reason };
  }
  const identity = plan.identities.purchase;
  return createPostedFinanceWithReconciliation({
    plan,
    rpc,
    createMethod: "create_payable_from_purchase_receipt",
    sourceParam: "purchase_receipt_id",
    sourceID: plan.phases.purchase.source.receipt.id,
    identity: {
      ...identity.payable,
      reconciliation: identity.reconciliation,
    },
  });
}

export async function applySourceDrivenFactPlan(
  plan,
  { rpc, confirmation, targetConfirmation, targetAttestation } = {},
) {
  if (!plan || plan.mode !== "plan" || plan.applySupported !== true) {
    throw new SourceDrivenFactError("an executable source-driven Fact plan is required", 2);
  }
  if (confirmation !== sourceDrivenFactConfirmation(plan)) {
    throw new SourceDrivenFactError(
      "source-driven Fact confirmation does not match target, dataset, run, instance, and phases",
      2,
    );
  }
  const policy = {
    backendURL: plan.backendURL,
    target: plan.target,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    databaseName: plan.databaseName,
  };
  const mutationTarget = assertManualAcceptanceMutationTarget(policy, {
    confirmation: targetConfirmation,
  });
  let attestation;
  if (mutationTarget.external) {
    attestation = assertManualAcceptanceTargetAttestation({
      policy: mutationTarget,
      attestation: targetAttestation,
    });
  } else if (targetAttestation != null && targetAttestation !== "") {
    throw new SourceDrivenFactError(
      "out-of-band target attestation is forbidden for local source-driven Fact apply",
      2,
    );
  }
  const preflight = await preflightSourceDrivenFactPlan(plan, { rpc });
  if (!preflight.ok) {
    throw new SourceDrivenFactError(
      `source-driven Fact preflight failed: ${preflight.blocked
        .map((item) => `${item.phase}=${item.reason}`)
        .join("; ")}`,
    );
  }
  const results = {};
  for (const phaseName of plan.enabledPhases) {
    if (phaseName === "purchase") {
      results.purchase = await applyPurchase(plan, rpc);
    } else if (phaseName === "production") {
      results.production = await applyProduction(plan, rpc);
    } else if (phaseName === "outsourcing") {
      results.outsourcing = await applyOutsourcing(plan, rpc);
    } else if (phaseName === "sales") {
      results.sales = await applySales(plan, rpc);
    }
  }
  return {
    ok: true,
    mode: "apply",
    writes: true,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    customerKey: plan.customerKey,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    instanceKey: plan.instanceKey,
    target: plan.target,
    backendURL: plan.backendURL,
    targetAttestation: attestation,
    enabledPhases: [...plan.enabledPhases],
    lifecycleProfile: plan.lifecycleProfile,
    preflight,
    results,
  };
}

export function createSourceDrivenFactRPC(
  plan,
  { token, fetchImpl = fetch } = {},
) {
  const accessToken = requiredText(
    token || process.env.MANUAL_ACCEPTANCE_SOURCE_FACT_TOKEN,
    "MANUAL_ACCEPTANCE_SOURCE_FACT_TOKEN",
    8192,
  );
  let sequence = 0;
  return async ({ domain, method, params }) => {
    sequence += 1;
    const response = await fetchImpl(
      new URL(`/rpc/${domain}`, `${plan.backendURL}/`).toString(),
      {
        method: "POST",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `source-driven-facts-${sequence}`,
          method,
          params,
        }),
      },
    );
    if (!response.ok || response.redirected === true) {
      throw new SourceDrivenFactError(
        `${domain}.${method} HTTP ${response.status}`,
      );
    }
    return response.json();
  };
}

function parseArgs(argv) {
  const options = { apply: false, json: false, instanceKey: "PRIMARY" };
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
    if (token === "--instance-key") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new SourceDrivenFactError("--instance-key requires a value", 2);
      }
      options.instanceKey = normalizeInstanceKey(value);
      index += 1;
      continue;
    }
    if (token !== "--source-report") {
      throw new SourceDrivenFactError(`unknown option ${token}`, 2);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new SourceDrivenFactError("--source-report requires a path", 2);
    }
    options.sourceReport = value;
    index += 1;
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/qa/manual-acceptance-source-driven-facts.mjs --source-report <source-apply-report.json> [--instance-key <key>] [--apply] [--json]

Without --apply this command is read-only. Apply requires the exact
MANUAL_ACCEPTANCE_SOURCE_FACT_CONFIRM value printed by sourceDrivenFactConfirmation,
plus MANUAL_ACCEPTANCE_SOURCE_FACT_TOKEN for the already-guarded target runtime.

The source report must bind datasetKey=${MANUAL_ACCEPTANCE_DATASET_KEY} and an exact
matching referenceRecords.${SOURCE_FACTS_KEY} identity. Current dataset example:
dataVersion=${SOURCE_DRIVEN_FACT_DATA_VERSION}, runId=${SOURCE_DRIVEN_FACT_RUN_ID}.`;
}

export async function runSourceDrivenFactCli(argv) {
  const options = parseArgs(argv);
  if (options.help) return { exitCode: 0, text: `${usage()}\n` };
  if (!options.sourceReport) {
    throw new SourceDrivenFactError("--source-report is required", 2);
  }
  const sourceReport = JSON.parse(
    await readFile(path.resolve(options.sourceReport), "utf8"),
  );
  const plan = buildSourceDrivenFactPlan(sourceReport, {
    instanceKey: options.instanceKey,
  });
  if (options.apply) {
    const report = await applySourceDrivenFactPlan(plan, {
      rpc: createSourceDrivenFactRPC(plan),
      confirmation: process.env.MANUAL_ACCEPTANCE_SOURCE_FACT_CONFIRM,
      targetConfirmation: process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
      targetAttestation: parseManualAcceptanceTargetAttestation(
        process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
      ),
    });
    return {
      exitCode: 0,
      text: `${JSON.stringify(report, null, options.json ? 2 : 0)}\n`,
      plan,
      report,
    };
  }
  return {
    exitCode: plan.readyForPreflight ? 0 : 1,
    text: `${JSON.stringify(plan, null, options.json ? 2 : 0)}\n`,
    plan,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  runSourceDrivenFactCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error?.message || error}\n`);
      process.exitCode =
        error instanceof SourceDrivenFactError ? error.exitCode : 1;
    });
}
