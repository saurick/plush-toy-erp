#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildSourceDrivenFactPlan,
  applySourceDrivenFactPlan,
  manualAcceptanceBusinessNo,
  sourceDrivenFactConfirmation,
} from "./manual-acceptance-source-driven-facts.mjs";
import {
  CUSTOMER_TRIAL_133_TARGET,
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import { MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES } from "./manual-acceptance-source-data.mjs";
import {
  MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT,
  MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT,
  MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
} from "./manual-acceptance-catalog.mjs";

const CUSTOMER_KEY = "yoyoosun";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/fact-data";
const APPLY_CONFIRMATION = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
const FACT_REPORT_CONTRACT = "source-driven-operational-facts-v1";
const RECEIPT_COUNT = 54;
const FACT_RUN_COUNT = 45;
const REQUIRED_MODULES = Object.freeze([
  "purchase_orders",
  "outsourcing_orders",
  "production_orders",
  "production",
  "inventory",
  "shipments",
  "finance",
  "purchase_receipts",
  "quality_inspections",
]);
export const MANUAL_ACCEPTANCE_FACT_REQUIRED_MODULES = REQUIRED_MODULES;
const RAW_RPC_ENDPOINTS = new Set([
  "purchase.list_purchase_returns",
  "purchase.list_purchase_receipt_adjustments",
  "operational_fact.cancel_finance_fact",
]);
const ROLE_USERS = Object.freeze({
  purchase: "demo_purchase",
  quality: "demo_quality",
  warehouse: "demo_warehouse",
  production: "demo_production",
  pmc: "demo_pmc",
  sales: "demo_sales",
  finance: "demo_finance",
});
const REFERENCE_KEYS = Object.freeze([
  "productionOrders",
  "productionFacts",
  "purchaseReceipts",
  "purchaseReturns",
  "purchaseReceiptAdjustments",
  "qualityInspections",
  "inventoryLots",
  "inventoryBalances",
  "inventoryTxns",
  "stockReservations",
  "shipments",
  "financeFacts",
]);

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, name, max = 8192) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) {
    throw new CliError(`${name} must be 1-${max} characters`, 2);
  }
  return normalized;
}

function positiveID(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError(`${name} must be a positive safe integer`, 2);
  }
  return parsed;
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

function shortBusinessNo(plan, code, sequence) {
  try {
    return manualAcceptanceBusinessNo({
      dataVersion: plan.dataVersion,
      code,
      sequence,
    });
  } catch (error) {
    throw new CliError(
      error?.message || "cannot build manual acceptance business number",
      2,
    );
  }
}

const LIFECYCLE_SEQUENCE = Object.freeze({
  DRAFT: 901,
  CANCEL: 902,
  ACTIVE: 901,
  RELEASE: 902,
});

const FINANCE_DRAFT_NUMBER = Object.freeze({
  "PAYABLE-DRAFT": Object.freeze({ code: "CGYF", sequence: 901 }),
  "RECEIVABLE-DRAFT": Object.freeze({ code: "YS", sequence: 901 }),
  "INVOICE-DRAFT": Object.freeze({ code: "FP", sequence: 901 }),
  "RECONCILIATION-DRAFT": Object.freeze({ code: "CGDZ", sequence: 901 }),
});

function decimal(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new CliError(`${name} must be positive`, 2);
  }
  return number.toFixed(6).replace(/\.?(?:0+)$/u, "");
}

function validateSourceReport(report) {
  if (
    !report ||
    report.mode !== "apply" ||
    report.simulatedOnly !== true ||
    report.realCustomerImport !== false ||
    !report.referenceRecords?.sourceDrivenFacts ||
    !report.datasetKey ||
    !report.dataVersion ||
    !report.runId ||
    !report.target ||
    !report.backendURL ||
    !report.databaseName ||
    !report.semanticDigest ||
    !report.prefix ||
    !report.runtime
  ) {
    throw new CliError(
      "source report is not a complete simulated apply report",
      2,
    );
  }
  const policy = resolveManualAcceptanceTarget(report);
  if (
    policy.datasetKey !== report.datasetKey ||
    policy.dataVersion !== report.dataVersion ||
    policy.runId !== report.runId ||
    policy.target !== report.target ||
    policy.backendURL !== report.backendURL ||
    policy.databaseName !== report.databaseName
  ) {
    throw new CliError("source report target identity is inconsistent", 2);
  }
  if (
    report.runtime.target !== report.target ||
    report.runtime.customerKey !== CUSTOMER_KEY ||
    !String(report.runtime.configRevision || "").trim()
  ) {
    throw new CliError(
      "source report runtime identity is incomplete or inconsistent",
      2,
    );
  }
  return { report, policy };
}

function assertSourceRuntimeIdentity(sourceReport, runtime) {
  for (const key of ["target", "customerKey", "configRevision"]) {
    if (
      String(runtime?.[key] || "") !== String(sourceReport.runtime?.[key] || "")
    ) {
      throw new CliError(
        `current runtime ${key} does not match the source report`,
        2,
      );
    }
  }
  const sourceAttestation = sourceReport.runtime?.targetAttestation;
  const currentAttestation = runtime?.targetAttestation;
  if (sourceReport.target === CUSTOMER_TRIAL_133_TARGET) {
    if (!sourceAttestation || !currentAttestation) {
      throw new CliError(
        "customer-trial-133 source and current runtime attestations are required",
        2,
      );
    }
    for (const key of ["release", "migration"]) {
      if (
        !String(sourceAttestation[key] || "").trim() ||
        String(currentAttestation[key] || "") !== String(sourceAttestation[key])
      ) {
        throw new CliError(
          `current runtime attestation ${key} does not match the source report`,
          2,
        );
      }
    }
  } else if (sourceAttestation || currentAttestation) {
    throw new CliError(
      "target attestation is forbidden for local runtime identity",
      2,
    );
  }
}

function candidateQuantity(record) {
  return Number(
    record?.item?.orderedQuantity ||
      record?.item?.quantity ||
      record?.item?.outsourcingQuantity ||
      0,
  );
}

function allocateCandidates(
  candidates,
  count,
  name,
  predicate = () => true,
  quantityPerRun = 1,
) {
  const usable = (candidates || []).filter(
    (item) => predicate(item) && candidateQuantity(item) >= 1,
  );
  if (usable.length === 0)
    throw new CliError(`source report has no ${name} candidates`, 2);
  const usage = new Map();
  return Array.from({ length: count }, (_, offset) => {
    for (let step = 0; step < usable.length; step += 1) {
      const candidate = usable[(offset + step) % usable.length];
      const key = positiveID(
        candidate.item.id || candidate.item.outsourcingOrderItemId,
        `${name}.item.id`,
      );
      const used = usage.get(key) || 0;
      if (used + quantityPerRun <= candidateQuantity(candidate)) {
        usage.set(key, used + quantityPerRun);
        return candidate;
      }
    }
    throw new CliError(
      `${name} candidate quantities cannot cover ${count} runs`,
      2,
    );
  });
}

function allocateOutsourcingPairs(candidates, count) {
  const grouped = new Map();
  for (const candidate of candidates || []) {
    if (candidateQuantity(candidate) < 1) continue;
    const orderID = positiveID(candidate?.order?.id, "outsourcing.order.id");
    const subjectType = String(
      candidate?.item?.subjectType || "",
    ).toUpperCase();
    if (!new Set(["MATERIAL", "PRODUCT"]).has(subjectType)) continue;
    const group = grouped.get(orderID) || { material: [], product: [] };
    group[subjectType.toLowerCase()].push(candidate);
    grouped.set(orderID, group);
  }
  const pairs = [];
  for (const group of grouped.values()) {
    for (const issue of group.material) {
      for (const returned of group.product) {
        pairs.push({ issue, return: returned });
      }
    }
  }
  if (pairs.length === 0) {
    throw new CliError(
      "source report has no confirmed outsourcing order with both a material issue line and a product return line",
      2,
    );
  }
  const usage = new Map();
  return Array.from({ length: count }, (_, offset) => {
    for (let step = 0; step < pairs.length; step += 1) {
      const pair = pairs[(offset + step) % pairs.length];
      const issueID = positiveID(
        pair.issue.item.id || pair.issue.item.outsourcingOrderItemId,
        "outsourcing.issue.item.id",
      );
      const returnID = positiveID(
        pair.return.item.id || pair.return.item.outsourcingOrderItemId,
        "outsourcing.return.item.id",
      );
      const issueUsed = usage.get(issueID) || 0;
      const returnUsed = usage.get(returnID) || 0;
      if (
        issueUsed + 1 <= candidateQuantity(pair.issue) &&
        returnUsed + 1 <= candidateQuantity(pair.return)
      ) {
        usage.set(issueID, issueUsed + 1);
        usage.set(returnID, returnUsed + 1);
        return pair;
      }
    }
    throw new CliError(
      `outsourcing candidate quantities cannot cover ${count} runs`,
      2,
    );
  });
}

function requireCoreWarehouse(warehouses, code, purpose) {
  const matches = warehouses.filter(
    (candidate) => String(candidate?.code || "").trim() === code,
  );
  if (matches.length !== 1 || !matches[0]?.id) {
    throw new CliError(
      `source report must contain exactly one ${purpose} warehouse ${code}`,
      2,
    );
  }
  return matches[0];
}

function selectShipmentLineSample(candidates) {
  const byOrder = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const orderID = positiveID(
      candidate?.order?.id,
      "shipment sample order.id",
    );
    const group = byOrder.get(orderID) || {
      order: candidate.order,
      items: [],
    };
    group.items.push(candidate.item);
    byOrder.set(orderID, group);
  }
  const sample = [...byOrder.values()]
    .filter((group) => group.items.length >= 25)
    .sort((left, right) =>
      String(left.order?.orderNo || "").localeCompare(
        String(right.order?.orderNo || ""),
        "zh-CN",
      ),
    )[0];
  if (!sample) {
    throw new CliError(
      "source report must include one ACTIVE sales order with at least 25 exact lines for shipment page acceptance",
      2,
    );
  }
  const items = sample.items
    .slice()
    .sort((left, right) => Number(left.id) - Number(right.id))
    .slice(0, 25);
  if (
    new Set(
      items.map((item) => positiveID(item?.id, "shipment sample item.id")),
    ).size !== 25
  ) {
    throw new CliError(
      "shipment 25-line sample contains duplicate sales order items",
      2,
    );
  }
  return Object.freeze({ order: sample.order, items: Object.freeze(items) });
}

function receiptStatus(index) {
  if (index < 24) return "POSTED";
  if (index < 36) return "CANCELLED";
  return "DRAFT";
}

function qualityTarget(index) {
  if (index < 36) return "PASSED";
  if (index < 42) return "SUBMITTED";
  if (index < 47) return "REJECTED";
  if (index < 51) return "CANCELLED";
  return "DRAFT";
}

function correctionStatus(index) {
  return ["DRAFT", "POSTED", "CANCELLED"][index % 3];
}

export function buildManualAcceptanceFactPlan(sourceReport) {
  const { report, policy } = validateSourceReport(sourceReport);
  const refs = report.referenceRecords;
  const sourceCandidates = refs.sourceDrivenFacts.sourceCandidates || {};
  const warehouses = Array.isArray(sourceCandidates.warehouses)
    ? sourceCandidates.warehouses
    : refs.warehouses;
  if (!Array.isArray(warehouses) || warehouses.length < 2) {
    throw new CliError("source report must include at least two warehouses", 2);
  }
  const productionCandidates = allocateCandidates(
    sourceCandidates.productionCandidates,
    FACT_RUN_COUNT,
    "production",
    (item) => Array.isArray(item?.bom?.items) && item.bom.items.length > 0,
    3,
  );
  const outsourcingCandidates = allocateOutsourcingPairs(
    sourceCandidates.outsourcingCandidates,
    FACT_RUN_COUNT,
  );
  const materialById = new Map(
    (refs.materials || []).map((item) => [
      positiveID(item.id, "material.id"),
      item,
    ]),
  );
  const requiredMaterialGrains = new Map();
  for (const candidate of productionCandidates) {
    for (const item of candidate.bom.items) {
      requiredMaterialGrains.set(`${item.materialId}:${item.unitId}`, {
        materialId: positiveID(item.materialId, "bom.materialId"),
        unitId: positiveID(item.unitId, "bom.unitId"),
      });
    }
  }
  for (const candidate of outsourcingCandidates) {
    requiredMaterialGrains.set(
      `${candidate.issue.item.subjectId}:${candidate.issue.item.unitId}`,
      {
        materialId: positiveID(
          candidate.issue.item.subjectId,
          "outsourcing.materialId",
        ),
        unitId: positiveID(candidate.issue.item.unitId, "outsourcing.unitId"),
      },
    );
  }
  const materialWarehouse = requireCoreWarehouse(
    warehouses,
    MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.material,
    "material",
  );
  const productWarehouse = requireCoreWarehouse(
    warehouses,
    MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES.product,
    "finished-goods",
  );
  const shipmentLineSample = selectShipmentLineSample(
    sourceCandidates.salesCandidates,
  );
  const linkedOrders = (refs.purchaseOrders || []).filter(
    (item) => String(item.status || "").toUpperCase() === "APPROVED",
  );
  if (linkedOrders.length < 9) {
    throw new CliError(
      "source report must include at least nine APPROVED purchase orders",
      2,
    );
  }
  const materialGrains = [...requiredMaterialGrains.values()];
  const manualPostedSlots = 15;
  const postedItems = Array.from({ length: manualPostedSlots }, () => []);
  for (const [offset, grain] of materialGrains.entries()) {
    postedItems[offset % manualPostedSlots].push(grain);
  }
  const fallbackGrain = materialGrains[0];
  if (!fallbackGrain)
    throw new CliError("source report has no required material grain", 2);
  const receipts = Array.from({ length: RECEIPT_COUNT }, (_, offset) => {
    const index = offset + 1;
    const linked = offset < 9;
    const status = receiptStatus(offset);
    const quality = qualityTarget(offset);
    const grains = linked
      ? []
      : status === "POSTED" && offset < 24
        ? postedItems[offset - 9]?.length
          ? postedItems[offset - 9]
          : [fallbackGrain]
        : [fallbackGrain];
    return {
      index,
      receiptNo: shortBusinessNo(report, "PR", index),
      status,
      qualityTarget: quality,
      qualityDraftNo:
        quality === "DRAFT"
          ? shortBusinessNo(report, "ZJ", 900 + index)
          : undefined,
      linkedPurchaseOrder: linked ? linkedOrders[offset] : undefined,
      supplierName: linked
        ? linkedOrders[offset].supplierName
        : (refs.suppliers || [])[offset % refs.suppliers.length]?.name,
      warehouseId: positiveID(materialWarehouse.id, "materialWarehouse.id"),
      items: grains.map((grain, itemOffset) => ({
        ...grain,
        materialName: materialById.get(grain.materialId)?.name,
        lotNo: shortBusinessNo(
          report,
          "RM",
          `${pad(index, 3)}${pad(itemOffset + 1)}`,
        ),
        quantity: "500",
      })),
    };
  });
  const corrections = Array.from({ length: 12 }, (_, offset) => ({
    index: offset + 1,
    receiptIndex: offset + 9,
    returnNo: shortBusinessNo(report, "TH", offset + 1),
    adjustmentNo: shortBusinessNo(report, "TZ", offset + 1),
    returnStatus: correctionStatus(offset),
    adjustmentStatus: correctionStatus(offset + 1),
    adjustType: offset % 2 === 0 ? "QUANTITY_INCREASE" : "QUANTITY_DECREASE",
  }));
  return Object.freeze({
    scope: "manual-acceptance-fact-data",
    reportContract: FACT_REPORT_CONTRACT,
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    retiredGenericFactWriter: false,
    datasetKey: report.datasetKey,
    dataVersion: report.dataVersion,
    runId: report.runId,
    target: policy.target,
    backendURL: policy.backendURL,
    databaseName: policy.databaseName,
    semanticDigest: report.semanticDigest,
    prefix: report.prefix,
    anchorDate: report.anchorDate || "2026-07-15",
    materialWarehouse,
    productWarehouse,
    receipts,
    corrections,
    productionCandidates,
    outsourcingCandidates,
    shipmentLineSample,
    expectedMinimums: Object.freeze({
      purchaseReceipts: RECEIPT_COUNT,
      qualityInspections: RECEIPT_COUNT,
      productionOrders: FACT_RUN_COUNT,
      productionFacts: FACT_RUN_COUNT,
      stockReservations: FACT_RUN_COUNT,
      shipments: MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT,
      payables: FACT_RUN_COUNT,
      receivables: FACT_RUN_COUNT,
      invoices: FACT_RUN_COUNT,
      reconciliation: FACT_RUN_COUNT,
    }),
    boundary: "全部为模拟试用数据，不代表真实客户业务记录。",
  });
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

export async function manualAcceptanceFactRPCCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const request = {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `manual-acceptance-facts-${domain}-${method}`,
      method,
      params,
    }),
  };
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetchImpl(rpcURL(backendURL, domain), request);
    if (response.status !== 429 || attempt === 5) break;
    const retryAfterSeconds = Number(response.headers?.get?.("retry-after"));
    const fallbackMilliseconds = Math.min(2000, 250 * 2 ** attempt);
    const retryMilliseconds =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(5000, Math.max(100, retryAfterSeconds * 1000))
        : fallbackMilliseconds;
    await sleep(retryMilliseconds);
  }
  if (!response?.ok || response.redirected) {
    throw new CliError(
      `${domain}.${method} HTTP ${response?.status || "unavailable"}`,
    );
  }
  const payload = await response.json();
  if (payload?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${payload?.result?.code} message=${payload?.result?.message}`,
    );
  }
  return payload.result.data || {};
}

const rpcCall = manualAcceptanceFactRPCCall;

async function login({ backendURL, username, password, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  return requiredText(
    data.access_token || data.token,
    `${username} access token`,
  );
}

export function manualAcceptanceFactRole(domain, method) {
  if (domain === "purchase") {
    return /purchase_return|receipt_adjustment/u.test(method)
      ? "admin"
      : "purchase";
  }
  if (domain === "quality") return "quality";
  if (domain === "inventory") return "warehouse";
  // This runner prepares one cross-domain acceptance dataset. Production orders
  // and Facts use the independently verified super admin so an existing editable
  // business-role selection is never overwritten just to manufacture fixtures.
  // Role-facing access remains a separate browser/readiness assertion.
  if (domain === "production_order" || domain === "operational_fact")
    return "admin";
  return "sales";
}

export function manualAcceptanceFactRPCParams(domain, method, params = {}) {
  if (
    domain === "auth" ||
    domain === "production_order" ||
    RAW_RPC_ENDPOINTS.has(`${domain}.${method}`)
  ) {
    return { ...params };
  }
  return { customer_key: CUSTOMER_KEY, ...params };
}

export function assertManualAcceptanceAdminProfile(profile) {
  if (
    String(profile?.username || "") !== "admin" ||
    profile?.is_super_admin !== true ||
    profile?.disabled === true
  ) {
    throw new CliError(
      "manual acceptance admin credential is not an enabled local super admin",
      2,
    );
  }
  return profile;
}

async function createExecutionContext(plan, options = {}) {
  if (options.rpc && options.runtime)
    return { rpc: options.rpc, runtime: options.runtime };
  const fetchImpl = options.fetchImpl || fetch;
  const attestation = parseManualAcceptanceTargetAttestation(
    options.targetAttestation ||
      process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
  );
  let attested;
  if (plan.target === CUSTOMER_TRIAL_133_TARGET) {
    attested = assertManualAcceptanceTargetAttestation({
      policy: plan,
      attestation,
    });
  } else if (attestation) {
    throw new CliError(
      "target attestation is forbidden for local fact runtime",
      2,
    );
  }
  const rolePassword = requiredText(
    options.password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD",
  );
  const adminPassword = requiredText(
    options.adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  const tokens = {};
  for (const [role, username] of Object.entries(ROLE_USERS)) {
    tokens[role] = await login({
      backendURL: plan.backendURL,
      username,
      password: rolePassword,
      fetchImpl,
    });
  }
  const adminToken = await login({
    backendURL: plan.backendURL,
    username: "admin",
    password: adminPassword,
    fetchImpl,
  });
  const adminMe = await rpcCall({
    backendURL: plan.backendURL,
    domain: "auth",
    method: "me",
    token: adminToken,
    fetchImpl,
  });
  assertManualAcceptanceAdminProfile(adminMe);
  tokens.admin = adminToken;
  const capabilities = await rpcCall({
    backendURL: plan.backendURL,
    domain: "debug",
    method: "capabilities",
    params: { customer_key: CUSTOMER_KEY },
    token: adminToken,
    fetchImpl,
  });
  assertManualAcceptanceCapabilitiesPolicy({ policy: plan, capabilities });
  const sessionData = await rpcCall({
    backendURL: plan.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    params: { customer_key: CUSTOMER_KEY },
    token: tokens.sales,
    fetchImpl,
  });
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy: plan,
    capabilities,
    session: sessionData.session || {},
    requiredModules: REQUIRED_MODULES,
    customerKey: CUSTOMER_KEY,
  });
  const rpc = ({ domain, method, params }) =>
    rpcCall({
      backendURL: plan.backendURL,
      domain,
      method,
      params: manualAcceptanceFactRPCParams(domain, method, params),
      token: tokens[manualAcceptanceFactRole(domain, method)],
      fetchImpl,
    });
  return {
    rpc,
    targetConfirmation:
      options.targetConfirmation ||
      process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation:
      plan.target === CUSTOMER_TRIAL_133_TARGET ? attestation : undefined,
    runtime: attested
      ? {
          ...runtime,
          targetAttestation: {
            source: "out-of-band",
            release: attested.release,
            migration: attested.migration,
          },
        }
      : runtime,
  };
}

function resultItem(data, key, operation) {
  const item = data?.[key];
  if (!item?.id) throw new CliError(`${operation} response is missing ${key}`);
  return item;
}

async function exactByBusinessNo({
  rpc,
  domain,
  method,
  listKey,
  businessField,
  businessNo,
  params = {},
}) {
  const data = await rpc({
    domain,
    method,
    params: { ...params, keyword: businessNo, limit: 20, offset: 0 },
  });
  const matches = (data?.[listKey] || []).filter(
    (item) => String(item?.[businessField] || "") === businessNo,
  );
  if (matches.length > 1) {
    throw new CliError(
      `${businessNo} has ${matches.length} conflicting records`,
    );
  }
  return matches[0];
}

async function getReceipt(rpc, id) {
  return resultItem(
    await rpc({
      domain: "purchase",
      method: "get_purchase_receipt",
      params: { id },
    }),
    "purchase_receipt",
    "get_purchase_receipt",
  );
}

export async function readPurchaseReceiptQualities(rpc, receipt) {
  const receiptID = positiveID(receipt?.id, "purchaseReceipt.id");
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  if (items.length === 0) {
    throw new CliError(`purchase receipt ${receiptID} has no items`);
  }
  const itemIDs = new Set(
    items.map((item) => positiveID(item?.id, "purchaseReceiptItem.id")),
  );
  const data = await rpc({
    domain: "quality",
    method: "list_quality_inspections",
    params: {
      purchase_receipt_id: receiptID,
      source_type: "PURCHASE_RECEIPT",
      inspection_type: "INCOMING",
      limit: 200,
      offset: 0,
    },
  });
  const inspections = Array.isArray(data?.quality_inspections)
    ? data.quality_inspections
    : [];
  const total = Number(data?.total ?? inspections.length);
  if (!Number.isSafeInteger(total) || total !== inspections.length) {
    throw new CliError(
      `purchase receipt ${receiptID} quality inspection readback is incomplete`,
    );
  }
  const generated = [];
  for (const itemID of itemIDs) {
    const inspectionNo = `IQC-PR-${receiptID}-ITEM-${itemID}`;
    const matches = inspections.filter(
      (inspection) =>
        String(inspection?.inspection_no || "") === inspectionNo &&
        Number(inspection?.purchase_receipt_id) === receiptID &&
        Number(inspection?.purchase_receipt_item_id) === itemID &&
        String(inspection?.source_type || "").toUpperCase() ===
          "PURCHASE_RECEIPT" &&
        String(inspection?.inspection_type || "").toUpperCase() === "INCOMING",
    );
    if (matches.length !== 1) {
      throw new CliError(
        `purchase receipt ${receiptID} item ${itemID} must have one generated incoming inspection`,
      );
    }
    generated.push(matches[0]);
  }
  const unknown = inspections.filter((inspection) => {
    const linkedReceiptID = Number(inspection?.purchase_receipt_id);
    const linkedItemID = Number(inspection?.purchase_receipt_item_id);
    return linkedReceiptID !== receiptID || !itemIDs.has(linkedItemID);
  });
  if (unknown.length > 0) {
    throw new CliError(
      `purchase receipt ${receiptID} quality inspection linkage is inconsistent`,
    );
  }
  return { generated, inspections };
}

async function advanceQuality(rpc, inspection, target, plan) {
  let item = inspection;
  let status = String(item.status || "").toUpperCase();
  if (target === "DRAFT") return item;
  if (status === "DRAFT") {
    item = resultItem(
      await rpc({
        domain: "quality",
        method: "submit_quality_inspection",
        params: { id: item.id },
      }),
      "quality_inspection",
      "submit_quality_inspection",
    );
    status = String(item.status || "").toUpperCase();
  }
  if (target === "SUBMITTED" && status === "SUBMITTED") return item;
  const transitions = {
    PASSED: {
      method: "pass_quality_inspection",
      params: {
        result: "PASS",
        inspected_at: plan.anchorDate,
        decision_note: "到货先检验",
      },
    },
    REJECTED: {
      method: "reject_quality_inspection",
      params: {
        result: "REJECT",
        inspected_at: plan.anchorDate,
        decision_note: "颜色不符，先退回",
      },
    },
    CANCELLED: {
      method: "cancel_quality_inspection",
      params: { decision_note: "本次不检" },
    },
  };
  if (status === target) return item;
  const transition = transitions[target];
  if (!transition || status !== "SUBMITTED") {
    throw new CliError(
      `quality inspection ${item.id} cannot move ${status} -> ${target}`,
    );
  }
  item = resultItem(
    await rpc({
      domain: "quality",
      method: transition.method,
      params: { id: item.id, ...transition.params },
    }),
    "quality_inspection",
    transition.method,
  );
  if (String(item.status || "").toUpperCase() !== target) {
    throw new CliError(`${transition.method} did not reach ${target}`);
  }
  return item;
}

export async function ensureReceiptQualities(rpc, receipt, receiptPlan, plan) {
  const target =
    receiptPlan.status === "DRAFT" ? receiptPlan.qualityTarget : "PASSED";
  const { generated, inspections } = await readPurchaseReceiptQualities(
    rpc,
    receipt,
  );
  if (target === "DRAFT") {
    if (receipt.items.length !== 1 || generated.length !== 1) {
      throw new CliError(
        `${receiptPlan.receiptNo} DRAFT sample must have exactly one line`,
      );
    }
    const generatedStatus = String(generated[0]?.status || "").toUpperCase();
    if (generatedStatus === "SUBMITTED") {
      await rpc({
        domain: "quality",
        method: "cancel_quality_inspection",
        params: { id: generated[0].id, decision_note: "改为稍后检验" },
      });
    } else if (generatedStatus !== "CANCELLED") {
      throw new CliError(
        `${receiptPlan.receiptNo} generated inspection cannot move ${generatedStatus} -> DRAFT replacement`,
      );
    }
    const inspectionNo = requiredText(
      receiptPlan.qualityDraftNo,
      "receiptPlan.qualityDraftNo",
      64,
    );
    const existing = await exactByBusinessNo({
      rpc,
      domain: "quality",
      method: "list_quality_inspections",
      listKey: "quality_inspections",
      businessField: "inspection_no",
      businessNo: inspectionNo,
    });
    if (!existing) {
      const sourceItem = receipt.items[0];
      await rpc({
        domain: "quality",
        method: "create_quality_inspection_draft",
        params: {
          inspection_no: inspectionNo,
          purchase_receipt_id: receipt.id,
          purchase_receipt_item_id: sourceItem.id,
          decision_note: "待检",
        },
      });
    } else if (
      String(existing.status || "").toUpperCase() !== "DRAFT" ||
      Number(existing.purchase_receipt_id) !== Number(receipt.id) ||
      Number(existing.purchase_receipt_item_id) !== Number(receipt.items[0].id)
    ) {
      throw new CliError(
        `${inspectionNo} conflicts with the required DRAFT quality state`,
      );
    }
    const reread = await readPurchaseReceiptQualities(rpc, receipt);
    const replacement = reread.inspections.find(
      (inspection) => String(inspection?.inspection_no || "") === inspectionNo,
    );
    if (
      !replacement ||
      String(replacement.status || "").toUpperCase() !== "DRAFT"
    ) {
      throw new CliError(`${inspectionNo} was not persisted as DRAFT`);
    }
    return reread.inspections;
  }
  const advanced = [];
  for (const inspection of generated) {
    advanced.push(await advanceQuality(rpc, inspection, target, plan));
  }
  return advanced;
}

export async function verifyReceiptQualities(rpc, receipt, receiptPlan) {
  const target =
    receiptPlan.status === "DRAFT" ? receiptPlan.qualityTarget : "PASSED";
  const { generated, inspections } = await readPurchaseReceiptQualities(
    rpc,
    receipt,
  );
  if (target === "DRAFT") {
    const replacementNo = requiredText(
      receiptPlan.qualityDraftNo,
      "receiptPlan.qualityDraftNo",
      64,
    );
    const replacement = inspections.find(
      (inspection) => String(inspection?.inspection_no || "") === replacementNo,
    );
    if (
      receipt.items.length !== 1 ||
      generated.length !== 1 ||
      String(generated[0]?.status || "").toUpperCase() !== "CANCELLED" ||
      !replacement ||
      String(replacement.status || "").toUpperCase() !== "DRAFT" ||
      Number(replacement.purchase_receipt_id) !== Number(receipt.id) ||
      Number(replacement.purchase_receipt_item_id) !==
        Number(receipt.items[0].id)
    ) {
      throw new CliError(
        `${receiptPlan.receiptNo} DRAFT quality specimen is incomplete`,
      );
    }
    return inspections;
  }
  if (
    generated.some(
      (inspection) => String(inspection?.status || "").toUpperCase() !== target,
    )
  ) {
    throw new CliError(
      `${receiptPlan.receiptNo} quality inspections did not reach ${target}`,
    );
  }
  return generated;
}

function manualReceiptParams(receipt, plan) {
  return {
    receipt_no: receipt.receiptNo,
    supplier_name: requiredText(
      receipt.supplierName || "嘉顺布行",
      "supplierName",
      255,
    ),
    received_at: plan.anchorDate,
    note: "到货先检验",
    items: receipt.items.map((item, offset) => ({
      material_id: item.materialId,
      warehouse_id: receipt.warehouseId,
      unit_id: item.unitId,
      lot_no: item.lotNo,
      quantity: item.quantity,
      source_line_no: String(offset + 1),
      note: "到货先检验",
    })),
  };
}

async function createOrReadReceipt(rpc, receiptPlan, plan) {
  let receipt = await exactByBusinessNo({
    rpc,
    domain: "purchase",
    method: "list_purchase_receipts",
    listKey: "purchase_receipts",
    businessField: "receipt_no",
    businessNo: receiptPlan.receiptNo,
  });
  if (!receipt) {
    const linked = receiptPlan.linkedPurchaseOrder;
    const method = linked
      ? "create_purchase_receipt_from_purchase_order"
      : "create_purchase_receipt_with_items";
    const params = linked
      ? {
          purchase_order_id: positiveID(linked.id, "purchaseOrder.id"),
          receipt_no: receiptPlan.receiptNo,
          warehouse_id: receiptPlan.warehouseId,
          received_at: plan.anchorDate,
          idempotency_key: `manual-acceptance:${plan.dataVersion}:receipt:${receiptPlan.index}`,
          note: "到货先检验",
        }
      : manualReceiptParams(receiptPlan, plan);
    try {
      receipt = resultItem(
        await rpc({ domain: "purchase", method, params }),
        "purchase_receipt",
        method,
      );
    } catch (error) {
      receipt = await exactByBusinessNo({
        rpc,
        domain: "purchase",
        method: "list_purchase_receipts",
        listKey: "purchase_receipts",
        businessField: "receipt_no",
        businessNo: receiptPlan.receiptNo,
      });
      if (!receipt) throw error;
    }
  }
  receipt = await getReceipt(rpc, receipt.id);
  let status = String(receipt.status || "").toUpperCase();
  if (status === "CANCELLED" && receiptPlan.status !== "CANCELLED") {
    throw new CliError(
      `${receiptPlan.receiptNo} is terminal but plan requires ${receiptPlan.status}`,
    );
  }
  if (status === "POSTED" && receiptPlan.status === "DRAFT") {
    throw new CliError(
      `${receiptPlan.receiptNo} is POSTED but plan requires DRAFT`,
    );
  }
  if (status === "DRAFT") {
    receipt.quality_inspections = await ensureReceiptQualities(
      rpc,
      receipt,
      receiptPlan,
      plan,
    );
    receipt = await getReceipt(rpc, receipt.id);
    if (receiptPlan.status !== "DRAFT") {
      receipt = resultItem(
        await rpc({
          domain: "purchase",
          method: "post_purchase_receipt",
          params: { id: receipt.id },
        }),
        "purchase_receipt",
        "post_purchase_receipt",
      );
      status = String(receipt.status || "").toUpperCase();
    }
  }
  if (receiptPlan.status === "CANCELLED" && status === "POSTED") {
    receipt = resultItem(
      await rpc({
        domain: "purchase",
        method: "cancel_purchase_receipt",
        params: { id: receipt.id },
      }),
      "purchase_receipt",
      "cancel_purchase_receipt",
    );
  }
  receipt = await getReceipt(rpc, receipt.id);
  if (String(receipt.status || "").toUpperCase() !== receiptPlan.status) {
    throw new CliError(
      `${receiptPlan.receiptNo} did not reach ${receiptPlan.status}`,
    );
  }
  receipt.quality_inspections = await ensureReceiptQualities(
    rpc,
    receipt,
    receiptPlan,
    plan,
  );
  return receipt;
}

async function advanceCorrection(rpc, item, target, type) {
  const methods =
    type === "return"
      ? {
          post: "post_purchase_return",
          cancel: "cancel_purchase_return",
          key: "purchase_return",
        }
      : {
          post: "post_purchase_receipt_adjustment",
          cancel: "cancel_purchase_receipt_adjustment",
          key: "purchase_receipt_adjustment",
        };
  let record = item;
  let status = String(record.status || "").toUpperCase();
  if (status === target) return record;
  if (status === "DRAFT" && target !== "DRAFT") {
    record = resultItem(
      await rpc({
        domain: "purchase",
        method: methods.post,
        params: { id: record.id },
      }),
      methods.key,
      methods.post,
    );
    status = String(record.status || "").toUpperCase();
  }
  if (status === "POSTED" && target === "CANCELLED") {
    record = resultItem(
      await rpc({
        domain: "purchase",
        method: methods.cancel,
        params: { id: record.id },
      }),
      methods.key,
      methods.cancel,
    );
    status = String(record.status || "").toUpperCase();
  }
  if (status !== target)
    throw new CliError(`${type} ${record.id} cannot move to ${target}`);
  return record;
}

export function validatePurchaseCorrectionRecord(
  type,
  record,
  receipt,
  receiptItem,
  correction,
) {
  const isReturn = type === "return";
  const items = Array.isArray(record?.items) ? record.items : [];
  if (items.length !== 1) {
    throw new CliError(
      `${type} ${record?.id || "missing"} must have one line`,
      2,
    );
  }
  assertRecordGrain(`${type} ${record.id}`, record, {
    purchase_receipt_id: Number(receipt.id),
  });
  assertRecordGrain(
    `${type} ${record.id} item`,
    items[0],
    {
      purchase_receipt_item_id: Number(receiptItem.id),
      quantity: "1",
      ...(isReturn ? {} : { adjust_type: correction.adjustType }),
    },
    new Set(["quantity"]),
  );
}

async function ensureCorrections(rpc, plan, receipts) {
  const returns = [];
  const adjustments = [];
  for (const correction of plan.corrections) {
    const receipt = receipts[correction.receiptIndex];
    const item = receipt?.items?.[0];
    if (
      !receipt?.id ||
      !item?.id ||
      String(receipt.status).toUpperCase() !== "POSTED"
    ) {
      throw new CliError(
        `correction source receipt ${correction.receiptIndex + 1} is not POSTED`,
      );
    }
    let returned = await exactByBusinessNo({
      rpc,
      domain: "purchase",
      method: "list_purchase_returns",
      listKey: "purchase_returns",
      businessField: "return_no",
      businessNo: correction.returnNo,
    });
    if (!returned) {
      returned = resultItem(
        await rpc({
          domain: "purchase",
          method: "create_purchase_return_from_receipt",
          params: {
            return_no: correction.returnNo,
            purchase_receipt_id: receipt.id,
            returned_at: plan.anchorDate,
            idempotency_key: `manual-acceptance:${plan.dataVersion}:return:${correction.index}`,
            note: "退回一件",
            items: [{ purchase_receipt_item_id: item.id, quantity: "1" }],
          },
        }),
        "purchase_return",
        "create_purchase_return_from_receipt",
      );
    }
    validatePurchaseCorrectionRecord(
      "return",
      returned,
      receipt,
      item,
      correction,
    );
    returns.push(
      await advanceCorrection(rpc, returned, correction.returnStatus, "return"),
    );

    let adjustment = await exactByBusinessNo({
      rpc,
      domain: "purchase",
      method: "list_purchase_receipt_adjustments",
      listKey: "purchase_receipt_adjustments",
      businessField: "adjustment_no",
      businessNo: correction.adjustmentNo,
    });
    if (!adjustment) {
      adjustment = resultItem(
        await rpc({
          domain: "purchase",
          method: "create_purchase_receipt_adjustment_from_receipt",
          params: {
            adjustment_no: correction.adjustmentNo,
            purchase_receipt_id: receipt.id,
            adjusted_at: plan.anchorDate,
            idempotency_key: `manual-acceptance:${plan.dataVersion}:adjustment:${correction.index}`,
            reason:
              correction.adjustType === "QUANTITY_INCREASE"
                ? "补记一件"
                : "少记一件",
            items: [
              {
                purchase_receipt_item_id: item.id,
                adjust_type: correction.adjustType,
                quantity: "1",
              },
            ],
          },
        }),
        "purchase_receipt_adjustment",
        "create_purchase_receipt_adjustment_from_receipt",
      );
    }
    validatePurchaseCorrectionRecord(
      "adjustment",
      adjustment,
      receipt,
      item,
      correction,
    );
    adjustments.push(
      await advanceCorrection(
        rpc,
        adjustment,
        correction.adjustmentStatus,
        "adjustment",
      ),
    );
  }
  return { returns, adjustments };
}

function dedupeByID(items) {
  return [
    ...new Map(
      (items || []).filter((item) => item?.id).map((item) => [item.id, item]),
    ).values(),
  ];
}

export function mergeManualAcceptanceFactReferences(existing, authoritative) {
  return dedupeByID([...(existing || []), ...(authoritative || [])]);
}

async function inventoryReferences(rpc, receipts) {
  const lots = [];
  const balances = [];
  const txns = [];
  const materialStock = new Map();
  for (const receipt of receipts) {
    for (const item of receipt.items || []) {
      const lotId = Number(item.inventory_lot_id || item.lot_id || 0);
      if (!Number.isSafeInteger(lotId) || lotId <= 0) continue;
      const lotData = await rpc({
        domain: "inventory",
        method: "list_inventory_lots",
        params: { keyword: item.lot_no || "", limit: 20, offset: 0 },
      });
      const lot = (lotData.inventory_lots || []).find(
        (record) => record.id === lotId,
      );
      if (lot) lots.push(lot);
      const balanceData = await rpc({
        domain: "inventory",
        method: "list_inventory_balances",
        params: { lot_id: lotId, limit: 20, offset: 0 },
      });
      for (const balance of balanceData.inventory_balances || []) {
        balances.push(balance);
        if (
          String(receipt.status).toUpperCase() === "POSTED" &&
          Number(balance.available_quantity) > 0
        ) {
          materialStock.set(`${balance.subject_id}:${balance.unit_id}`, {
            materialId: balance.subject_id,
            unitId: balance.unit_id,
            warehouseId: balance.warehouse_id,
            lotId,
            availableQuantity: balance.available_quantity,
          });
        }
      }
      const txnData = await rpc({
        domain: "inventory",
        method: "list_inventory_txns",
        params: { lot_id: lotId, limit: 200, offset: 0 },
      });
      txns.push(...(txnData.inventory_txns || []));
    }
  }
  return {
    lots: dedupeByID(lots),
    balances: dedupeByID(balances),
    txns: dedupeByID(txns),
    materialStock,
  };
}

export async function readManualAcceptanceFinalInventoryReferences(rpc, lots) {
  const inventoryLots = dedupeByID(lots);
  const inventoryBalances = [];
  const inventoryTxns = [];
  for (const lot of inventoryLots) {
    const lotID = positiveID(lot.id, "inventory_lot.id");
    const balanceData = await rpc({
      domain: "inventory",
      method: "list_inventory_balances",
      params: { lot_id: lotID, limit: 200, offset: 0 },
    });
    const balances = balanceData.inventory_balances || [];
    if (Number(balanceData.total || balances.length) > balances.length) {
      throw new CliError(
        `inventory lot ${lotID} balance readback was truncated`,
      );
    }
    inventoryBalances.push(...balances);
    const txnData = await rpc({
      domain: "inventory",
      method: "list_inventory_txns",
      params: { lot_id: lotID, limit: 200, offset: 0 },
    });
    const txns = txnData.inventory_txns || [];
    if (Number(txnData.total || txns.length) > txns.length) {
      throw new CliError(
        `inventory lot ${lotID} transaction readback was truncated`,
      );
    }
    inventoryTxns.push(...txns);
  }
  return {
    inventoryLots,
    inventoryBalances: dedupeByID(inventoryBalances),
    inventoryTxns: dedupeByID(inventoryTxns),
  };
}

export async function applyPurchaseQualityStage(plan, { rpc }) {
  const receipts = [];
  for (const receiptPlan of plan.receipts) {
    receipts.push(await createOrReadReceipt(rpc, receiptPlan, plan));
  }
  const corrections = await ensureCorrections(rpc, plan, receipts);
  const inventory = await inventoryReferences(rpc, receipts);
  const qualities = dedupeByID(
    receipts.flatMap((receipt) => receipt.quality_inspections || []),
  );
  for (const receiptPlan of plan.receipts.filter(
    (item) => item.qualityTarget === "DRAFT",
  )) {
    const inspectionNo = requiredText(
      receiptPlan.qualityDraftNo,
      "receiptPlan.qualityDraftNo",
      64,
    );
    const draft = await exactByBusinessNo({
      rpc,
      domain: "quality",
      method: "list_quality_inspections",
      listKey: "quality_inspections",
      businessField: "inspection_no",
      businessNo: inspectionNo,
    });
    if (draft) qualities.push(draft);
  }
  if (receipts.length < RECEIPT_COUNT || qualities.length < RECEIPT_COUNT) {
    throw new CliError(
      "purchase/quality stage did not meet its minimum record counts",
    );
  }
  return {
    purchaseReceipts: dedupeByID(receipts),
    purchaseReturns: dedupeByID(corrections.returns),
    purchaseReceiptAdjustments: dedupeByID(corrections.adjustments),
    qualityInspections: dedupeByID(qualities),
    inventoryLots: inventory.lots,
    inventoryBalances: inventory.balances,
    inventoryTxns: inventory.txns,
    materialStock: inventory.materialStock,
  };
}

async function verifyPurchaseQualityStage(plan, { rpc }) {
  const receipts = [];
  for (const expected of plan.receipts) {
    const record = await exactByBusinessNo({
      rpc,
      domain: "purchase",
      method: "list_purchase_receipts",
      listKey: "purchase_receipts",
      businessField: "receipt_no",
      businessNo: expected.receiptNo,
    });
    if (
      !record ||
      String(record.status || "").toUpperCase() !== expected.status
    ) {
      throw new CliError(
        `${expected.receiptNo} is missing or has the wrong status`,
      );
    }
    const receipt = await getReceipt(rpc, record.id);
    receipt.quality_inspections = await verifyReceiptQualities(
      rpc,
      receipt,
      expected,
    );
    receipts.push(receipt);
  }
  const returns = [];
  const adjustments = [];
  for (const expected of plan.corrections) {
    const returned = await exactByBusinessNo({
      rpc,
      domain: "purchase",
      method: "list_purchase_returns",
      listKey: "purchase_returns",
      businessField: "return_no",
      businessNo: expected.returnNo,
    });
    const adjustment = await exactByBusinessNo({
      rpc,
      domain: "purchase",
      method: "list_purchase_receipt_adjustments",
      listKey: "purchase_receipt_adjustments",
      businessField: "adjustment_no",
      businessNo: expected.adjustmentNo,
    });
    if (
      !returned ||
      String(returned.status || "").toUpperCase() !== expected.returnStatus ||
      !adjustment ||
      String(adjustment.status || "").toUpperCase() !==
        expected.adjustmentStatus
    ) {
      throw new CliError(
        `correction ${expected.index} is incomplete or conflicting`,
      );
    }
    returns.push(returned);
    adjustments.push(adjustment);
  }
  const inventory = await inventoryReferences(rpc, receipts);
  const qualities = receipts.flatMap(
    (receipt) => receipt.quality_inspections || [],
  );
  return {
    purchaseReceipts: dedupeByID(receipts),
    purchaseReturns: dedupeByID(returns),
    purchaseReceiptAdjustments: dedupeByID(adjustments),
    qualityInspections: dedupeByID(qualities),
    inventoryLots: inventory.lots,
    inventoryBalances: inventory.balances,
    inventoryTxns: inventory.txns,
    materialStock: inventory.materialStock,
  };
}

function overrideReadyReport(sourceReport, enabledPhases) {
  const copy = structuredClone(sourceReport);
  const sourceFacts = copy.referenceRecords.sourceDrivenFacts;
  sourceFacts.phaseReadiness ||= {};
  for (const phase of enabledPhases) {
    sourceFacts.phaseReadiness[phase] = {
      status: "ready",
      reason: "runtime grain supplied by fact runner",
    };
  }
  return copy;
}

function productionMaterialQuantity(item, plannedQuantity) {
  const lossRate = Number(item.lossRate || 0);
  if (!Number.isFinite(lossRate) || lossRate < 0) {
    throw new CliError("BOM lossRate must be a non-negative decimal", 2);
  }
  return decimal(
    Number(item.quantity) * Number(plannedQuantity) * (1 + lossRate),
    "production material quantity",
  );
}

async function exactRequired(options) {
  const item = await exactByBusinessNo(options);
  if (!item)
    throw new CliError(
      `${options.businessNo} is missing after source-driven stage`,
    );
  return item;
}

async function readProductionPlan(rpc, sourcePlan, completionLotNo) {
  const order = await exactRequired({
    rpc,
    domain: "production_order",
    method: "list_production_orders",
    listKey: "production_orders",
    businessField: "order_no",
    businessNo: sourcePlan.identities.production.order.businessNo,
  });
  const facts = [];
  const identities = [
    ...sourcePlan.identities.production.materialIssues,
    sourcePlan.identities.production.completion,
    ...(sourcePlan.identities.production.rework
      ? [sourcePlan.identities.production.rework]
      : []),
  ];
  for (const identity of identities) {
    facts.push(
      await exactRequired({
        rpc,
        domain: "operational_fact",
        method: "list_production_facts",
        listKey: "production_facts",
        businessField: "fact_no",
        businessNo: identity.businessNo,
      }),
    );
  }
  const lot = await exactRequired({
    rpc,
    domain: "inventory",
    method: "list_inventory_lots",
    listKey: "inventory_lots",
    businessField: "lot_no",
    businessNo: completionLotNo,
  });
  const balances = await rpc({
    domain: "inventory",
    method: "list_inventory_balances",
    params: { lot_id: lot.id, limit: 20, offset: 0 },
  });
  const txns = await rpc({
    domain: "inventory",
    method: "list_inventory_txns",
    params: { lot_id: lot.id, limit: 200, offset: 0 },
  });
  const completion = facts.find(
    (item) =>
      String(item.fact_no || "") ===
      sourcePlan.identities.production.completion.businessNo,
  );
  return {
    order,
    facts,
    completion,
    lot,
    balances: balances.inventory_balances || [],
    txns: txns.inventory_txns || [],
  };
}

async function readOutsourcingPlan(rpc, sourcePlan) {
  const identities = sourcePlan.identities.outsourcing;
  const issue = await exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_outsourcing_facts",
    listKey: "outsourcing_facts",
    businessField: "fact_no",
    businessNo: identities.issue.businessNo,
  });
  const returned = await exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_outsourcing_facts",
    listKey: "outsourcing_facts",
    businessField: "fact_no",
    businessNo: identities.return.businessNo,
  });
  const inspection = await exactRequired({
    rpc,
    domain: "quality",
    method: "list_quality_inspections",
    listKey: "quality_inspections",
    businessField: "inspection_no",
    businessNo: identities.quality.businessNo,
  });
  const finance = [];
  for (const identity of [identities.payable, identities.reconciliation]) {
    finance.push(
      await exactRequired({
        rpc,
        domain: "operational_fact",
        method: "list_finance_facts",
        listKey: "finance_facts",
        businessField: "fact_no",
        businessNo: identity.businessNo,
      }),
    );
  }
  return { facts: [issue, returned], inspection, finance };
}

async function readSalesPlan(rpc, sourcePlan) {
  const identities = sourcePlan.identities.sales;
  const reservation = await exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_stock_reservations",
    listKey: "stock_reservations",
    businessField: "reservation_no",
    businessNo: identities.reservation.businessNo,
  });
  const shipment = await exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_shipments",
    listKey: "shipments",
    businessField: "shipment_no",
    businessNo: identities.shipment.businessNo,
  });
  const finance = [];
  for (const identity of [
    identities.receivable,
    identities.receivableReconciliation,
    identities.invoice,
    identities.invoiceReconciliation,
  ]) {
    finance.push(
      await exactRequired({
        rpc,
        domain: "operational_fact",
        method: "list_finance_facts",
        listKey: "finance_facts",
        businessField: "fact_no",
        businessNo: identity.businessNo,
      }),
    );
  }
  return { reservation, shipment, finance };
}

function phaseIdentitySpec({
  domain,
  method,
  listKey,
  businessField,
  identity,
  statuses,
}) {
  return {
    domain,
    method,
    listKey,
    businessField,
    businessNo: requiredText(identity?.businessNo, `${method}.businessNo`, 64),
    statuses: new Set(statuses),
  };
}

export function sourceDrivenPhaseIdentitySpecs(sourcePlan, phase) {
  const financeStatuses = ["POSTED", "SETTLED", "CANCELLED"];
  if (phase === "production") {
    const identity = sourcePlan.identities.production;
    return [
      phaseIdentitySpec({
        domain: "production_order",
        method: "list_production_orders",
        listKey: "production_orders",
        businessField: "order_no",
        identity: identity.order,
        statuses: ["RELEASED", "CLOSED"],
      }),
      ...identity.materialIssues.map((item) =>
        phaseIdentitySpec({
          domain: "operational_fact",
          method: "list_production_facts",
          listKey: "production_facts",
          businessField: "fact_no",
          identity: item,
          statuses: ["POSTED"],
        }),
      ),
      phaseIdentitySpec({
        domain: "operational_fact",
        method: "list_production_facts",
        listKey: "production_facts",
        businessField: "fact_no",
        identity: identity.completion,
        statuses: ["POSTED"],
      }),
      ...(identity.rework
        ? [
            phaseIdentitySpec({
              domain: "operational_fact",
              method: "list_production_facts",
              listKey: "production_facts",
              businessField: "fact_no",
              identity: identity.rework,
              statuses: ["POSTED"],
            }),
          ]
        : []),
    ];
  }
  if (phase === "outsourcing") {
    const identity = sourcePlan.identities.outsourcing;
    return [
      ...[identity.issue, identity.return].map((item) =>
        phaseIdentitySpec({
          domain: "operational_fact",
          method: "list_outsourcing_facts",
          listKey: "outsourcing_facts",
          businessField: "fact_no",
          identity: item,
          statuses: ["POSTED"],
        }),
      ),
      phaseIdentitySpec({
        domain: "quality",
        method: "list_quality_inspections",
        listKey: "quality_inspections",
        businessField: "inspection_no",
        identity: identity.quality,
        statuses: ["PASSED"],
      }),
      ...[identity.payable, identity.reconciliation].map((item) =>
        phaseIdentitySpec({
          domain: "operational_fact",
          method: "list_finance_facts",
          listKey: "finance_facts",
          businessField: "fact_no",
          identity: item,
          statuses: financeStatuses,
        }),
      ),
    ];
  }
  if (phase === "sales") {
    const identity = sourcePlan.identities.sales;
    return [
      phaseIdentitySpec({
        domain: "operational_fact",
        method: "list_stock_reservations",
        listKey: "stock_reservations",
        businessField: "reservation_no",
        identity: identity.reservation,
        statuses: ["ACTIVE", "RELEASED", "CONSUMED"],
      }),
      phaseIdentitySpec({
        domain: "operational_fact",
        method: "list_shipments",
        listKey: "shipments",
        businessField: "shipment_no",
        identity: identity.shipment,
        statuses: ["SHIPPED"],
      }),
      ...[
        identity.receivable,
        identity.receivableReconciliation,
        identity.invoice,
        identity.invoiceReconciliation,
      ].map((item) =>
        phaseIdentitySpec({
          domain: "operational_fact",
          method: "list_finance_facts",
          listKey: "finance_facts",
          businessField: "fact_no",
          identity: item,
          statuses: financeStatuses,
        }),
      ),
    ];
  }
  throw new CliError(`unsupported source-driven phase ${phase}`, 2);
}

function assertRecordGrain(name, record, expected, decimalFields = new Set()) {
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = record?.[field];
    let matches;
    if (decimalFields.has(field)) {
      matches =
        Number.isFinite(Number(actualValue)) &&
        Number(actualValue) === Number(expectedValue);
    } else if (expectedValue == null) {
      matches = actualValue == null;
    } else if (typeof expectedValue === "number") {
      matches = Number(actualValue) === expectedValue;
    } else {
      matches = String(actualValue ?? "") === String(expectedValue);
    }
    if (!matches) {
      throw new CliError(
        `${name} has conflicting ${field}: expected ${expectedValue ?? "empty"}, got ${actualValue ?? "empty"}`,
        2,
      );
    }
  }
}

export async function validateProductionPhasePartialRecords(
  rpc,
  sourcePlan,
  records,
) {
  const source = sourcePlan.phases.production.source;
  const identity = sourcePlan.identities.production;
  const expectedCount =
    2 + source.materialIssues.length + (identity.rework ? 1 : 0);
  if (
    !Array.isArray(records) ||
    records.length < 1 ||
    records.length > expectedCount ||
    records.some((record) => !record)
  ) {
    throw new CliError(
      `production partial phase must contain a 1-${expectedCount} record prefix`,
      2,
    );
  }
  const order = records[0];
  const detail = await rpc({
    domain: "production_order",
    method: "get_production_order",
    params: { production_order_id: order.id },
  });
  const items = Array.isArray(detail?.production_order_items)
    ? detail.production_order_items
    : [];
  const requirements = Array.isArray(detail?.production_material_requirements)
    ? detail.production_material_requirements
    : [];
  if (
    items.length !== 1 ||
    requirements.length !== source.materialIssues.length
  ) {
    throw new CliError(
      `${identity.order.businessNo} has conflicting production lines`,
      2,
    );
  }
  const orderItem = items[0];
  assertRecordGrain(
    `${identity.order.businessNo} item`,
    orderItem,
    {
      production_order_id: Number(order.id),
      line_no: 1,
      product_id: source.item.productId,
      product_sku_id: source.item.productSkuId ?? null,
      unit_id: source.item.unitId,
      planned_quantity: source.plannedQuantity,
      sales_order_item_id: source.item.id,
      bom_header_id: source.bom.id,
    },
    new Set(["planned_quantity"]),
  );
  const issueRecords = records.slice(
    1,
    Math.min(records.length, 1 + source.materialIssues.length),
  );
  for (let index = 0; index < issueRecords.length; index += 1) {
    const budget = source.materialIssues[index];
    const requirement = requirements.find(
      (item) =>
        Number(item.material_id) === Number(budget.materialId) &&
        Number(item.unit_id) === Number(budget.unitId),
    );
    if (!requirement) {
      throw new CliError(
        `${identity.materialIssues[index].businessNo} source requirement is missing`,
        2,
      );
    }
    assertRecordGrain(
      identity.materialIssues[index].businessNo,
      issueRecords[index],
      {
        fact_type: "MATERIAL_ISSUE",
        subject_type: "MATERIAL",
        subject_id: budget.materialId,
        warehouse_id: budget.warehouseId,
        unit_id: budget.unitId,
        lot_id: budget.lotId,
        quantity: budget.quantity,
        source_type: "PRODUCTION_ORDER",
        source_id: Number(order.id),
        source_line_id: Number(requirement.id),
        idempotency_key: identity.materialIssues[index].idempotencyKey,
      },
      new Set(["quantity"]),
    );
  }
  const completion = records[1 + source.materialIssues.length];
  if (completion) {
    assertRecordGrain(
      identity.completion.businessNo,
      completion,
      {
        fact_type: "FINISHED_GOODS_RECEIPT",
        subject_type: "PRODUCT",
        subject_id: source.item.productId,
        product_sku_id: source.item.productSkuId ?? null,
        warehouse_id: source.completion.warehouseId,
        unit_id: source.item.unitId,
        quantity: source.completion.quantity,
        source_type: "PRODUCTION_ORDER",
        source_id: Number(order.id),
        source_line_id: Number(orderItem.id),
        idempotency_key: identity.completion.idempotencyKey,
      },
      new Set(["quantity"]),
    );
  }
  if (identity.rework && records.length === expectedCount) {
    assertRecordGrain(
      identity.rework.businessNo,
      records.at(-1),
      {
        fact_type: "REWORK",
        quantity: source.rework.quantity,
        source_type: "PRODUCTION_FACT",
        source_id: Number(completion.id),
        idempotency_key: identity.rework.idempotencyKey,
      },
      new Set(["quantity"]),
    );
  }
}

export async function validateProductionPhaseRecords(rpc, sourcePlan, records) {
  const source = sourcePlan.phases.production.source;
  const identity = sourcePlan.identities.production;
  const expectedCount =
    2 + source.materialIssues.length + (identity.rework ? 1 : 0);
  if (!Array.isArray(records) || records.length !== expectedCount) {
    throw new CliError(
      `production phase must contain ${expectedCount} exact records`,
      2,
    );
  }
  await validateProductionPhasePartialRecords(rpc, sourcePlan, records);
}

function validateOutsourcingPhaseRecord(sourcePlan, records, index) {
  const source = sourcePlan.phases.outsourcing.source;
  const identity = sourcePlan.identities.outsourcing;
  const [issue, returned, inspection, payable, reconciliation] = records;
  if (index === 0) {
    assertRecordGrain(
      identity.issue.businessNo,
      issue,
      {
        fact_type: "MATERIAL_ISSUE",
        subject_type: source.issue.item.subjectType,
        subject_id: source.issue.item.subjectId,
        product_sku_id: source.issue.item.productSkuId ?? null,
        unit_id: source.issue.item.unitId,
        source_type: "OUTSOURCING_ORDER",
        source_id: source.issue.order.id,
        source_line_id: source.issue.item.id,
        warehouse_id: source.issue.warehouseId,
        lot_id: source.issue.lotId,
        quantity: source.issue.quantity,
        idempotency_key: identity.issue.idempotencyKey,
      },
      new Set(["quantity"]),
    );
  } else if (index === 1) {
    assertRecordGrain(
      identity.return.businessNo,
      returned,
      {
        fact_type: "RETURN_RECEIPT",
        subject_type: source.return.item.subjectType,
        subject_id: source.return.item.subjectId,
        product_sku_id: source.return.item.productSkuId ?? null,
        unit_id: source.return.item.unitId,
        source_type: "OUTSOURCING_ORDER",
        source_id: source.return.order.id,
        source_line_id: source.return.item.id,
        warehouse_id: source.return.warehouseId,
        quantity: source.return.quantity,
        idempotency_key: identity.return.idempotencyKey,
      },
      new Set(["quantity"]),
    );
  } else if (index === 2) {
    assertRecordGrain(identity.quality.businessNo, inspection, {
      purchase_receipt_id: null,
      inventory_lot_id: Number(returned.lot_id),
      warehouse_id: source.return.warehouseId,
      source_type: "OUTSOURCING_FACT",
      source_id: Number(returned.id),
      inspection_type: "OUTSOURCING_RETURN",
      subject_type: source.return.item.subjectType,
      subject_id: source.return.item.subjectId,
    });
  } else if (index === 3) {
    assertRecordGrain(identity.payable.businessNo, payable, {
      fact_type: "PAYABLE",
      source_type: "OUTSOURCING_FACT",
      source_id: Number(returned.id),
      idempotency_key: identity.payable.idempotencyKey,
    });
  } else if (index === 4) {
    assertRecordGrain(identity.reconciliation.businessNo, reconciliation, {
      fact_type: "RECONCILIATION",
      source_type: "FINANCE_FACT",
      source_id: Number(payable.id),
      idempotency_key: identity.reconciliation.idempotencyKey,
    });
  }
}

export function validateOutsourcingPhasePartialRecords(sourcePlan, records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 5) {
    throw new CliError(
      "outsourcing partial phase must contain a 1-5 record prefix",
      2,
    );
  }
  records.forEach((record, index) => {
    if (!record)
      throw new CliError("outsourcing partial phase cannot contain a gap", 2);
    validateOutsourcingPhaseRecord(sourcePlan, records, index);
  });
}

export function validateOutsourcingPhaseRecords(sourcePlan, records) {
  if (
    !Array.isArray(records) ||
    records.length !== 5 ||
    records.some((record) => !record)
  ) {
    throw new CliError("outsourcing phase must contain five exact records", 2);
  }
  validateOutsourcingPhasePartialRecords(sourcePlan, records);
}

export function validateSalesPhasePartialRecords(sourcePlan, records) {
  const source = sourcePlan.phases.sales.source;
  const identity = sourcePlan.identities.sales;
  if (
    !Array.isArray(records) ||
    records.length < 1 ||
    records.length > 6 ||
    records.some((record) => !record)
  ) {
    throw new CliError(
      "sales partial phase must contain a 1-6 record prefix",
      2,
    );
  }
  const [
    reservation,
    shipment,
    receivable,
    receivableReconciliation,
    invoice,
    invoiceReconciliation,
  ] = records;
  assertRecordGrain(
    identity.reservation.businessNo,
    reservation,
    {
      sales_order_id: source.order.id,
      sales_order_item_id: source.item.id,
      product_id: source.item.productId,
      product_sku_id: source.item.productSkuId ?? null,
      warehouse_id: source.inventory.warehouseId,
      unit_id: source.item.unitId,
      lot_id: source.inventory.lotId,
      quantity: source.inventory.quantity,
      idempotency_key: identity.reservation.idempotencyKey,
    },
    new Set(["quantity"]),
  );
  if (shipment) {
    const shipmentItems = Array.isArray(shipment.items) ? shipment.items : [];
    if (shipmentItems.length !== 1) {
      throw new CliError(
        `${identity.shipment.businessNo} must have one shipment line`,
        2,
      );
    }
    assertRecordGrain(identity.shipment.businessNo, shipment, {
      sales_order_id: source.order.id,
      customer_id: source.order.customerId,
      customer_snapshot: source.order.customerSnapshot,
      idempotency_key: identity.shipment.idempotencyKey,
    });
    assertRecordGrain(
      `${identity.shipment.businessNo} item`,
      shipmentItems[0],
      {
        sales_order_item_id: source.item.id,
        product_id: source.item.productId,
        product_sku_id: source.item.productSkuId ?? null,
        warehouse_id: source.inventory.warehouseId,
        unit_id: source.item.unitId,
        lot_id: source.inventory.lotId,
        quantity: source.inventory.quantity,
      },
      new Set(["quantity"]),
    );
  }
  for (const [record, expectedIdentity, factType, sourceRecord] of [
    [receivable, identity.receivable, "RECEIVABLE", shipment],
    [
      receivableReconciliation,
      identity.receivableReconciliation,
      "RECONCILIATION",
      receivable,
    ],
    [invoice, identity.invoice, "INVOICE", shipment],
    [
      invoiceReconciliation,
      identity.invoiceReconciliation,
      "RECONCILIATION",
      invoice,
    ],
  ]) {
    if (!record) continue;
    assertRecordGrain(expectedIdentity.businessNo, record, {
      fact_type: factType,
      source_type: factType === "RECONCILIATION" ? "FINANCE_FACT" : "SHIPMENT",
      source_id: Number(sourceRecord.id),
      idempotency_key: expectedIdentity.idempotencyKey,
    });
  }
}

export function validateSalesPhaseRecords(sourcePlan, records) {
  if (!Array.isArray(records) || records.length !== 6) {
    throw new CliError("sales phase must contain six exact records", 2);
  }
  validateSalesPhasePartialRecords(sourcePlan, records);
}

export async function reuseOrApplyManualAcceptanceFactPhase({
  phase,
  apply,
  rpc,
  specs,
  mutate,
  readComplete,
  validateRecords,
  allowVerifiedPartialResume = false,
  validatePartialRecords,
}) {
  if (!apply) return readComplete();
  const readRecords = async () => {
    const values = [];
    for (const spec of specs) {
      values.push(await exactByBusinessNo({ rpc, ...spec }));
    }
    return values;
  };
  let records = await readRecords();
  let present = records.filter(Boolean);
  if (present.length > 0 && present.length < specs.length) {
    if (!allowVerifiedPartialResume || !validatePartialRecords) {
      throw new CliError(
        `${phase} phase is partial (${present.length}/${specs.length}); stop and verify the exact batch before replay`,
        2,
      );
    }
    const firstMissing = records.findIndex((record) => !record);
    if (records.slice(firstMissing).some(Boolean)) {
      throw new CliError(
        `${phase} phase is non-contiguous; automatic recovery is forbidden`,
        2,
      );
    }
    for (let index = 0; index < firstMissing; index += 1) {
      const status = String(records[index].status || "").toUpperCase();
      if (!specs[index].statuses.has(status)) {
        throw new CliError(
          `${phase} phase record ${specs[index].businessNo} has conflicting status ${status || "missing"}`,
          2,
        );
      }
    }
    await validatePartialRecords(records.slice(0, firstMissing));
    await mutate();
    records = await readRecords();
    present = records.filter(Boolean);
  }
  if (present.length === 0) {
    await mutate();
    records = await readRecords();
    present = records.filter(Boolean);
  }
  if (present.length !== specs.length) {
    throw new CliError(
      `${phase} phase is partial (${present.length}/${specs.length}); stop and verify the exact batch before replay`,
      2,
    );
  }
  for (let index = 0; index < records.length; index += 1) {
    const status = String(records[index].status || "").toUpperCase();
    if (!specs[index].statuses.has(status)) {
      throw new CliError(
        `${phase} phase record ${specs[index].businessNo} has conflicting status ${status || "missing"}`,
        2,
      );
    }
  }
  if (validateRecords) await validateRecords(records);
  return readComplete();
}

async function ensureProductionOrderSpecimen(
  rpc,
  plan,
  sourcePlan,
  suffix,
  target,
  apply,
) {
  const source = sourcePlan.phases.production.source;
  const orderNo = shortBusinessNo(plan, "SC", LIFECYCLE_SEQUENCE[suffix]);
  let order = await exactByBusinessNo({
    rpc,
    domain: "production_order",
    method: "list_production_orders",
    listKey: "production_orders",
    businessField: "order_no",
    businessNo: orderNo,
  });
  if (!order && apply) {
    order = resultItem(
      await rpc({
        domain: "production_order",
        method: "create_production_order",
        params: {
          order_no: orderNo,
          note: "按订单生产",
          items: [
            {
              line_no: 1,
              product_id: source.item.productId,
              ...(source.item.productSkuId == null
                ? {}
                : { product_sku_id: source.item.productSkuId }),
              unit_id: source.item.unitId,
              planned_quantity: "1",
              sales_order_item_id: source.item.id,
              bom_header_id: source.bom.id,
              note: "按订单生产",
            },
          ],
          idempotency_key: `manual-acceptance:${plan.dataVersion}:production-order:${suffix}`,
        },
      }),
      "production_order",
      "create_production_order",
    );
  }
  if (!order) throw new CliError(`${orderNo} is missing`);
  if (
    target === "CANCELLED" &&
    String(order.status).toUpperCase() === "DRAFT" &&
    apply
  ) {
    order = resultItem(
      await rpc({
        domain: "production_order",
        method: "cancel_production_order",
        params: {
          production_order_id: order.id,
          expected_version: order.version,
          idempotency_key: `manual-acceptance:${plan.dataVersion}:production-order:${suffix}:cancel`,
          reason: "本批不做",
        },
      }),
      "production_order",
      "cancel_production_order",
    );
  }
  if (String(order.status || "").toUpperCase() !== target) {
    throw new CliError(
      `${orderNo} expected ${target}, got ${order.status || "missing"}`,
    );
  }
  return order;
}

async function ensureProductionFactSpecimen(
  rpc,
  plan,
  completion,
  suffix,
  target,
  apply,
) {
  const factNo = shortBusinessNo(plan, "FG", LIFECYCLE_SEQUENCE[suffix]);
  let fact = await exactByBusinessNo({
    rpc,
    domain: "operational_fact",
    method: "list_production_facts",
    listKey: "production_facts",
    businessField: "fact_no",
    businessNo: factNo,
  });
  if (!fact && apply) {
    fact = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "create_production_rework_from_completion",
        params: {
          fact_no: factNo,
          source_completion_fact_id: completion.id,
          quantity: "1",
          idempotency_key: `manual-acceptance:${plan.dataVersion}:production-fact:${suffix}`,
          reason: "补做一件",
        },
      }),
      "production_fact",
      "create_production_rework_from_completion",
    );
  }
  if (!fact) throw new CliError(`${factNo} is missing`);
  if (
    target === "CANCELLED" &&
    String(fact.status).toUpperCase() === "DRAFT" &&
    apply
  ) {
    fact = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "post_production_fact",
        params: { id: fact.id },
      }),
      "production_fact",
      "post_production_fact",
    );
  }
  if (
    target === "CANCELLED" &&
    String(fact.status).toUpperCase() === "POSTED" &&
    apply
  ) {
    fact = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "cancel_production_fact",
        params: { id: fact.id },
      }),
      "production_fact",
      "cancel_production_fact",
    );
  }
  if (String(fact.status || "").toUpperCase() !== target) {
    throw new CliError(
      `${factNo} expected ${target}, got ${fact.status || "missing"}`,
    );
  }
  return exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_production_facts",
    listKey: "production_facts",
    businessField: "fact_no",
    businessNo: factNo,
  });
}

async function ensureReservationSpecimen(
  rpc,
  plan,
  salesPlan,
  lot,
  suffix,
  target,
  apply,
) {
  const source = salesPlan.phases.sales.source;
  const reservationNo = shortBusinessNo(plan, "BL", LIFECYCLE_SEQUENCE[suffix]);
  let reservation = await exactByBusinessNo({
    rpc,
    domain: "operational_fact",
    method: "list_stock_reservations",
    listKey: "stock_reservations",
    businessField: "reservation_no",
    businessNo: reservationNo,
  });
  if (!reservation && apply) {
    reservation = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "create_stock_reservation_from_sales_order",
        params: {
          reservation_no: reservationNo,
          sales_order_id: source.order.id,
          sales_order_item_id: source.item.id,
          warehouse_id: lot.warehouseId,
          lot_id: lot.lotId,
          quantity: "1",
          idempotency_key: `manual-acceptance:${plan.dataVersion}:reservation:${suffix}`,
          note: "先留一件",
        },
      }),
      "stock_reservation",
      "create_stock_reservation_from_sales_order",
    );
  }
  if (!reservation) throw new CliError(`${reservationNo} is missing`);
  if (
    target === "RELEASED" &&
    String(reservation.status).toUpperCase() === "ACTIVE" &&
    apply
  ) {
    reservation = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "release_stock_reservation",
        params: { id: reservation.id },
      }),
      "stock_reservation",
      "release_stock_reservation",
    );
  }
  if (String(reservation.status || "").toUpperCase() !== target) {
    throw new CliError(
      `${reservationNo} expected ${target}, got ${reservation.status || "missing"}`,
    );
  }
  return reservation;
}

async function ensureShipmentSpecimen(
  rpc,
  plan,
  salesPlan,
  lot,
  suffix,
  target,
  apply,
  lineSample,
) {
  const source = lineSample
    ? {
        order: lineSample.order,
        items: lineSample.items,
      }
    : salesPlan.phases.sales.source;
  const shipmentNo = shortBusinessNo(plan, "CK", LIFECYCLE_SEQUENCE[suffix]);
  let shipment = await exactByBusinessNo({
    rpc,
    domain: "operational_fact",
    method: "list_shipments",
    listKey: "shipments",
    businessField: "shipment_no",
    businessNo: shipmentNo,
  });
  if (!shipment && apply) {
    shipment = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "create_shipment_with_items",
        params: {
          shipment_no: shipmentNo,
          sales_order_id: source.order.id,
          customer_id: source.order.customerId,
          customer_snapshot: source.order.customerSnapshot,
          idempotency_key: `manual-acceptance:${plan.dataVersion}:shipment:${suffix}`,
          note: "分批出货",
          items: lineSample
            ? source.items.map((item) => ({
                sales_order_item_id: item.id,
                product_id: item.productId,
                ...(item.productSkuId == null
                  ? {}
                  : { product_sku_id: item.productSkuId }),
                warehouse_id: lot.warehouseId,
                unit_id: item.unitId,
                quantity: "1",
                note: "逐项核对",
              }))
            : [
                {
                  sales_order_item_id: source.item.id,
                  product_id: source.item.productId,
                  ...(source.item.productSkuId == null
                    ? {}
                    : { product_sku_id: source.item.productSkuId }),
                  warehouse_id: lot.warehouseId,
                  unit_id: source.item.unitId,
                  lot_id: lot.lotId,
                  quantity: "1",
                  note: "分批出货",
                },
              ],
        },
      }),
      "shipment",
      "create_shipment_with_items",
    );
  }
  if (!shipment) throw new CliError(`${shipmentNo} is missing`);
  if (
    target === "CANCELLED" &&
    String(shipment.status).toUpperCase() === "DRAFT" &&
    apply
  ) {
    shipment = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "ship_shipment",
        params: { id: shipment.id },
      }),
      "shipment",
      "ship_shipment",
    );
  }
  if (
    target === "CANCELLED" &&
    String(shipment.status).toUpperCase() === "SHIPPED" &&
    apply
  ) {
    shipment = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "cancel_shipment",
        params: { id: shipment.id },
      }),
      "shipment",
      "cancel_shipment",
    );
  }
  if (String(shipment.status || "").toUpperCase() !== target) {
    throw new CliError(
      `${shipmentNo} expected ${target}, got ${shipment.status || "missing"}`,
    );
  }
  if (lineSample) {
    const actualItemIDs = (shipment.items || [])
      .map((item) => Number(item.sales_order_item_id))
      .sort((left, right) => left - right);
    const expectedItemIDs = lineSample.items
      .map((item) => Number(item.id))
      .sort((left, right) => left - right);
    if (
      actualItemIDs.length !== 25 ||
      actualItemIDs.some((itemID, index) => itemID !== expectedItemIDs[index])
    ) {
      throw new CliError(
        `${shipmentNo} does not match the exact 25-line shipment sample`,
        2,
      );
    }
  }
  return shipment;
}

function replaceByID(items, value) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index >= 0) items[index] = value;
  else items.push(value);
}

async function financeTransition(rpc, record, target, apply) {
  let item = record;
  const status = String(item.status || "").toUpperCase();
  if (status === target) {
    return exactRequired({
      rpc,
      domain: "operational_fact",
      method: "list_finance_facts",
      listKey: "finance_facts",
      businessField: "fact_no",
      businessNo: item.fact_no,
    });
  }
  if (!apply)
    throw new CliError(`${item.fact_no} expected ${target}, got ${status}`);
  let transitioned;
  if (target === "SETTLED" && status === "POSTED") {
    transitioned = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "settle_finance_fact",
        params: { id: item.id },
      }),
      "finance_fact",
      "settle_finance_fact",
    );
  } else if (target === "CANCELLED" && status === "POSTED") {
    transitioned = resultItem(
      await rpc({
        domain: "operational_fact",
        method: "cancel_finance_fact",
        params: { id: item.id, reason: "本笔取消" },
      }),
      "finance_fact",
      "cancel_finance_fact",
    );
  } else {
    throw new CliError(`${item.fact_no} cannot move ${status} -> ${target}`);
  }
  if (String(transitioned.status || "").toUpperCase() !== target) {
    throw new CliError(`${item.fact_no} transition did not reach ${target}`);
  }
  return exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    businessField: "fact_no",
    businessNo: item.fact_no,
  });
}

async function createFinanceDraft(rpc, plan, source, suffix, apply) {
  const number = FINANCE_DRAFT_NUMBER[suffix];
  if (!number)
    throw new CliError(`finance draft suffix ${suffix} is not registered`, 2);
  const factNo = shortBusinessNo(plan, number.code, number.sequence);
  const expectedSourceType =
    source.fact_type === "RECONCILIATION" ? "FINANCE_FACT" : source.source_type;
  const expectedSourceID = source.source_id;
  const expectedIdempotencyKey = `manual-acceptance:${plan.dataVersion}:finance:${suffix}`;
  let draft = await exactByBusinessNo({
    rpc,
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    businessField: "fact_no",
    businessNo: factNo,
  });
  if (!draft && apply) {
    const methodByType = {
      PAYABLE:
        source.source_type === "PURCHASE_RECEIPT"
          ? ["create_payable_from_purchase_receipt", "purchase_receipt_id"]
          : ["create_payable_from_outsourcing_return", "outsourcing_fact_id"],
      RECEIVABLE: ["create_receivable_from_shipment", "shipment_id"],
      INVOICE: ["create_invoice_from_shipment", "shipment_id"],
      RECONCILIATION: [
        "create_reconciliation_from_finance_fact",
        "finance_fact_id",
      ],
    };
    const [method, sourceKey] = methodByType[source.fact_type] || [];
    if (!method)
      throw new CliError(`cannot recreate finance type ${source.fact_type}`);
    draft = resultItem(
      await rpc({
        domain: "operational_fact",
        method,
        params: {
          fact_no: factNo,
          [sourceKey]: source.source_id,
          idempotency_key: expectedIdempotencyKey,
          note: "按单核对",
        },
      }),
      "finance_fact",
      method,
    );
  }
  if (!draft) {
    throw new CliError(`${factNo} is missing or is not DRAFT`);
  }
  assertRecordGrain(factNo, draft, {
    fact_type: source.fact_type,
    status: "DRAFT",
    source_type: expectedSourceType,
    source_id: Number(expectedSourceID),
    idempotency_key: expectedIdempotencyKey,
  });
  return exactRequired({
    rpc,
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    businessField: "fact_no",
    businessNo: factNo,
  });
}

function stableFinanceRecords(finance, factType) {
  const records = finance
    .filter((item) => String(item.fact_type || "").toUpperCase() === factType)
    .sort((left, right) => {
      const leftNo = String(left.fact_no || "");
      const rightNo = String(right.fact_no || "");
      if (leftNo !== rightNo) return leftNo < rightNo ? -1 : 1;
      return Number(left.id || 0) - Number(right.id || 0);
    });
  const businessNumbers = records.map((item) =>
    requiredText(item.fact_no, `${factType}.fact_no`, 64),
  );
  if (new Set(businessNumbers).size !== businessNumbers.length) {
    throw new CliError(
      `${factType} finance facts contain duplicate fact_no values`,
    );
  }
  return records;
}

export async function applyManualAcceptanceFinanceLifecycle({
  rpc,
  plan,
  financeFacts,
  apply,
}) {
  const finance = dedupeByID(financeFacts);
  if (!apply) {
    for (const [type, suffix] of [
      ["PAYABLE", "PAYABLE-DRAFT"],
      ["RECEIVABLE", "RECEIVABLE-DRAFT"],
      ["INVOICE", "INVOICE-DRAFT"],
    ]) {
      const records = stableFinanceRecords(financeFacts, type);
      if (records.length < 4) {
        throw new CliError(
          `not enough ${type} records to verify the DRAFT specimen`,
        );
      }
      finance.push(
        await createFinanceDraft(rpc, plan, records[3], suffix, false),
      );
    }
    const parentByID = new Map(
      financeFacts
        .filter(
          (item) =>
            String(item.fact_type || "").toUpperCase() !== "RECONCILIATION",
        )
        .map((item) => [Number(item.id), item]),
    );
    const reconciliationDraftSources = stableFinanceRecords(
      financeFacts,
      "RECONCILIATION",
    ).filter(
      (item) =>
        String(item.status || "").toUpperCase() === "CANCELLED" &&
        String(item.source_type || "").toUpperCase() === "FINANCE_FACT" &&
        String(
          parentByID.get(Number(item.source_id))?.status || "",
        ).toUpperCase() === "POSTED",
    );
    if (reconciliationDraftSources.length !== 1) {
      throw new CliError(
        `expected one stable reconciliation source for the DRAFT specimen, got ${reconciliationDraftSources.length}`,
      );
    }
    finance.push(
      await createFinanceDraft(
        rpc,
        plan,
        reconciliationDraftSources[0],
        "RECONCILIATION-DRAFT",
        false,
      ),
    );
    return dedupeByID(finance);
  }

  const reconciliationDependencies = stableFinanceRecords(
    finance,
    "RECONCILIATION",
  );
  const cancelledDependencyIDs = new Set();
  const cancelDependency = async (record) => {
    const dependencies = reconciliationDependencies.filter(
      (item) =>
        String(item.source_type || "").toUpperCase() === "FINANCE_FACT" &&
        Number(item.source_id) === Number(record.id),
    );
    if (dependencies.length !== 1) {
      throw new CliError(
        `${record.fact_no} expected one reconciliation dependency, got ${dependencies.length}`,
      );
    }
    const dependency = dependencies[0];
    cancelledDependencyIDs.add(dependency.id);
    const cancelled = await financeTransition(
      rpc,
      dependency,
      "CANCELLED",
      true,
    );
    replaceByID(finance, cancelled);
  };

  for (const type of ["PAYABLE", "RECEIVABLE", "INVOICE"]) {
    const records = stableFinanceRecords(financeFacts, type);
    if (records.length < 4) {
      throw new CliError(
        `not enough ${type} records for stable lifecycle specimens`,
      );
    }
    if (type !== "INVOICE") {
      replaceByID(
        finance,
        await financeTransition(rpc, records[1], "SETTLED", true),
      );
    }
    await cancelDependency(records[2]);
    replaceByID(
      finance,
      await financeTransition(rpc, records[2], "CANCELLED", true),
    );
    await cancelDependency(records[3]);
    replaceByID(
      finance,
      await financeTransition(rpc, records[3], "CANCELLED", true),
    );
    finance.push(
      await createFinanceDraft(rpc, plan, records[3], `${type}-DRAFT`, true),
    );
  }

  const reconciliationCandidates = stableFinanceRecords(
    financeFacts,
    "RECONCILIATION",
  ).filter((item) => !cancelledDependencyIDs.has(item.id));
  if (reconciliationCandidates.length < 2) {
    throw new CliError(
      "not enough stable reconciliation records for lifecycle specimens",
    );
  }
  const reconciliationDraftNo = shortBusinessNo(
    plan,
    FINANCE_DRAFT_NUMBER["RECONCILIATION-DRAFT"].code,
    FINANCE_DRAFT_NUMBER["RECONCILIATION-DRAFT"].sequence,
  );
  const existingReconciliationDraft = await exactByBusinessNo({
    rpc,
    domain: "operational_fact",
    method: "list_finance_facts",
    listKey: "finance_facts",
    businessField: "fact_no",
    businessNo: reconciliationDraftNo,
  });
  const parentByID = new Map(
    finance
      .filter(
        (item) =>
          String(item.fact_type || "").toUpperCase() !== "RECONCILIATION",
      )
      .map((item) => [Number(item.id), item]),
  );
  let draftSource;
  if (existingReconciliationDraft) {
    if (
      String(existingReconciliationDraft.fact_type || "").toUpperCase() !==
        "RECONCILIATION" ||
      String(existingReconciliationDraft.status || "").toUpperCase() !==
        "DRAFT" ||
      String(existingReconciliationDraft.source_type || "").toUpperCase() !==
        "FINANCE_FACT"
    ) {
      throw new CliError(
        `${reconciliationDraftNo} conflicts with the required DRAFT specimen`,
      );
    }
    draftSource = reconciliationCandidates.find(
      (item) =>
        Number(item.source_id) ===
          Number(existingReconciliationDraft.source_id) &&
        String(item.status || "").toUpperCase() === "CANCELLED",
    );
  } else {
    draftSource = reconciliationCandidates.find((item) => {
      const parent = parentByID.get(Number(item.source_id));
      return (
        String(item.status || "").toUpperCase() === "POSTED" &&
        String(parent?.status || "").toUpperCase() === "POSTED"
      );
    });
  }
  const draftParent = parentByID.get(Number(draftSource?.source_id));
  if (
    !draftSource ||
    String(draftParent?.status || "").toUpperCase() !== "POSTED"
  ) {
    throw new CliError(
      "reconciliation DRAFT specimen requires one stable POSTED parent finance fact",
    );
  }
  const alreadySettled = reconciliationCandidates.filter(
    (item) =>
      item.id !== draftSource.id &&
      String(item.status || "").toUpperCase() === "SETTLED",
  );
  if (alreadySettled.length > 1) {
    throw new CliError(
      "multiple reconciliation SETTLED specimens conflict with stable replay",
    );
  }
  const settleSource =
    alreadySettled[0] ||
    reconciliationCandidates.find(
      (item) =>
        item.id !== draftSource.id &&
        String(item.status || "").toUpperCase() === "POSTED",
    );
  if (!settleSource) {
    throw new CliError("reconciliation SETTLED specimen has no stable source");
  }
  replaceByID(
    finance,
    await financeTransition(rpc, settleSource, "SETTLED", true),
  );
  replaceByID(
    finance,
    await financeTransition(rpc, draftSource, "CANCELLED", true),
  );
  finance.push(
    await createFinanceDraft(
      rpc,
      plan,
      draftSource,
      "RECONCILIATION-DRAFT",
      true,
    ),
  );
  return dedupeByID(finance);
}

async function applyLifecycleSpecimens({
  rpc,
  plan,
  productionPlans,
  productionReadback,
  salesPlans,
  financeFacts,
  apply,
}) {
  const productionOrders = [];
  const productionFacts = [];
  const reservations = [];
  const shipments = [];

  const closeCandidate = productionReadback[0].order;
  let closed = closeCandidate;
  if (String(closed.status).toUpperCase() === "RELEASED" && apply) {
    closed = resultItem(
      await rpc({
        domain: "production_order",
        method: "close_production_order",
        params: {
          production_order_id: closed.id,
          expected_version: closed.version,
          idempotency_key: `manual-acceptance:${plan.dataVersion}:production-order:close`,
          reason: "本批完成",
        },
      }),
      "production_order",
      "close_production_order",
    );
  }
  if (String(closed.status).toUpperCase() !== "CLOSED") {
    throw new CliError("production order CLOSED specimen is missing");
  }
  productionOrders.push(closed);
  productionOrders.push(
    await ensureProductionOrderSpecimen(
      rpc,
      plan,
      productionPlans[1],
      "DRAFT",
      "DRAFT",
      apply,
    ),
    await ensureProductionOrderSpecimen(
      rpc,
      plan,
      productionPlans[2],
      "CANCEL",
      "CANCELLED",
      apply,
    ),
  );
  productionFacts.push(
    await ensureProductionFactSpecimen(
      rpc,
      plan,
      productionReadback[3].completion,
      "DRAFT",
      "DRAFT",
      apply,
    ),
    await ensureProductionFactSpecimen(
      rpc,
      plan,
      productionReadback[4].completion,
      "CANCEL",
      "CANCELLED",
      apply,
    ),
  );
  const lotAt = (offset) => ({
    warehouseId: productionReadback[offset].balances[0].warehouse_id,
    lotId: productionReadback[offset].lot.id,
  });
  reservations.push(
    await ensureReservationSpecimen(
      rpc,
      plan,
      salesPlans[5],
      lotAt(5),
      "ACTIVE",
      "ACTIVE",
      apply,
    ),
    await ensureReservationSpecimen(
      rpc,
      plan,
      salesPlans[6],
      lotAt(6),
      "RELEASE",
      "RELEASED",
      apply,
    ),
  );
  shipments.push(
    await ensureShipmentSpecimen(
      rpc,
      plan,
      salesPlans[7],
      { warehouseId: plan.productWarehouse.id },
      "DRAFT",
      "DRAFT",
      apply,
      plan.shipmentLineSample,
    ),
    await ensureShipmentSpecimen(
      rpc,
      plan,
      salesPlans[8],
      lotAt(8),
      "CANCEL",
      "CANCELLED",
      apply,
    ),
  );
  return {
    productionOrders,
    productionFacts,
    reservations,
    shipments,
    financeFacts: await applyManualAcceptanceFinanceLifecycle({
      rpc,
      plan,
      financeFacts,
      apply,
    }),
  };
}

export async function runSourceDrivenFactStage(
  plan,
  sourceReport,
  purchaseStage,
  {
    rpc,
    apply = true,
    buildPlan = buildSourceDrivenFactPlan,
    applyPlan = applySourceDrivenFactPlan,
    targetConfirmation,
    targetAttestation,
  } = {},
) {
  const materialStock = purchaseStage.materialStock;
  if (!(materialStock instanceof Map)) {
    throw new CliError(
      "purchase stage is missing exact posted material stock grains",
    );
  }
  const productionPlans = [];
  const productionReadback = [];
  for (let offset = 0; offset < FACT_RUN_COUNT; offset += 1) {
    const candidate = plan.productionCandidates[offset];
    const completionLotNo = shortBusinessNo(plan, "CP", offset + 1);
    const plannedQuantity = "3";
    const production = {
      salesOrder: candidate.salesOrder,
      item: candidate.item,
      bom: { id: candidate.bom.id, status: candidate.bom.status },
      plannedQuantity,
      completion: {
        warehouseId: plan.productWarehouse.id,
        newLotNo: completionLotNo,
        quantity: plannedQuantity,
      },
      materialIssues: candidate.bom.items.map((item) => {
        const stock = materialStock.get(`${item.materialId}:${item.unitId}`);
        if (!stock)
          throw new CliError(
            `no posted material lot for ${item.materialId}:${item.unitId}`,
          );
        return {
          materialId: item.materialId,
          unitId: item.unitId,
          warehouseId: stock.warehouseId,
          lotId: stock.lotId,
          quantity: productionMaterialQuantity(item, plannedQuantity),
        };
      }),
    };
    const sourcePlan = buildPlan(
      overrideReadyReport(sourceReport, ["production"]),
      {
        instanceKey: `PROD-${pad(offset + 1, 3)}`,
        enabledPhases: ["production"],
        production,
      },
    );
    productionPlans.push(sourcePlan);
    productionReadback.push(
      await reuseOrApplyManualAcceptanceFactPhase({
        phase: `production ${sourcePlan.instanceKey}`,
        apply,
        rpc,
        specs: sourceDrivenPhaseIdentitySpecs(sourcePlan, "production"),
        mutate: () =>
          applyPlan(sourcePlan, {
            rpc,
            confirmation: sourceDrivenFactConfirmation(sourcePlan),
            targetConfirmation,
            targetAttestation,
          }),
        validateRecords: (records) =>
          validateProductionPhaseRecords(rpc, sourcePlan, records),
        allowVerifiedPartialResume: true,
        validatePartialRecords: (records) =>
          validateProductionPhasePartialRecords(rpc, sourcePlan, records),
        readComplete: () =>
          readProductionPlan(rpc, sourcePlan, completionLotNo),
      }),
    );
  }

  const outsourcingPlans = [];
  const outsourcingReadback = [];
  for (let offset = 0; offset < FACT_RUN_COUNT; offset += 1) {
    const candidate = plan.outsourcingCandidates[offset];
    const stock = materialStock.get(
      `${candidate.issue.item.subjectId}:${candidate.issue.item.unitId}`,
    );
    if (!stock) {
      throw new CliError(
        `no posted material lot for outsourcing item ${candidate.issue.item.outsourcingOrderItemId}`,
      );
    }
    const outsourcing = {
      issue: {
        order: candidate.issue.order,
        item: {
          ...candidate.issue.item,
          id: positiveID(
            candidate.issue.item.id ||
              candidate.issue.item.outsourcingOrderItemId,
            "outsourcing.issue.item.id",
          ),
        },
        warehouseId: stock.warehouseId,
        lotId: stock.lotId,
        quantity: "1",
      },
      return: {
        order: candidate.return.order,
        item: {
          ...candidate.return.item,
          id: positiveID(
            candidate.return.item.id ||
              candidate.return.item.outsourcingOrderItemId,
            "outsourcing.return.item.id",
          ),
        },
        warehouseId: plan.productWarehouse.id,
        newLotNo: shortBusinessNo(plan, "WWCP", offset + 1),
        quantity: "1",
      },
    };
    const sourcePlan = buildPlan(
      overrideReadyReport(sourceReport, ["outsourcing"]),
      {
        instanceKey: `OUT-${pad(offset + 1, 3)}`,
        enabledPhases: ["outsourcing"],
        outsourcing,
      },
    );
    outsourcingPlans.push(sourcePlan);
    outsourcingReadback.push(
      await reuseOrApplyManualAcceptanceFactPhase({
        phase: `outsourcing ${sourcePlan.instanceKey}`,
        apply,
        rpc,
        specs: sourceDrivenPhaseIdentitySpecs(sourcePlan, "outsourcing"),
        mutate: () =>
          applyPlan(sourcePlan, {
            rpc,
            confirmation: sourceDrivenFactConfirmation(sourcePlan),
            targetConfirmation,
            targetAttestation,
          }),
        validateRecords: (records) =>
          validateOutsourcingPhaseRecords(sourcePlan, records),
        allowVerifiedPartialResume: true,
        validatePartialRecords: (records) =>
          validateOutsourcingPhasePartialRecords(sourcePlan, records),
        readComplete: () => readOutsourcingPlan(rpc, sourcePlan),
      }),
    );
  }

  const salesPlans = [];
  const salesReadback = [];
  for (let offset = 0; offset < FACT_RUN_COUNT; offset += 1) {
    const candidate = plan.productionCandidates[offset];
    const produced = productionReadback[offset];
    const balance = produced.balances.find(
      (item) => item.lot_id === produced.lot.id,
    );
    if (!balance || Number(balance.available_quantity) < 1) {
      throw new CliError(
        `completion lot ${produced.lot.lot_no} has no available quantity`,
      );
    }
    const sales = {
      order: candidate.salesOrder,
      item: candidate.item,
      inventory: {
        warehouseId: balance.warehouse_id,
        lotId: produced.lot.id,
        quantity: "1",
      },
    };
    const sourcePlan = buildPlan(overrideReadyReport(sourceReport, ["sales"]), {
      instanceKey: `SALE-${pad(offset + 1, 3)}`,
      enabledPhases: ["sales"],
      sales,
    });
    salesPlans.push(sourcePlan);
    salesReadback.push(
      await reuseOrApplyManualAcceptanceFactPhase({
        phase: `sales ${sourcePlan.instanceKey}`,
        apply,
        rpc,
        specs: sourceDrivenPhaseIdentitySpecs(sourcePlan, "sales"),
        mutate: () =>
          applyPlan(sourcePlan, {
            rpc,
            confirmation: sourceDrivenFactConfirmation(sourcePlan),
            targetConfirmation,
            targetAttestation,
          }),
        validateRecords: (records) =>
          validateSalesPhaseRecords(sourcePlan, records),
        allowVerifiedPartialResume: true,
        validatePartialRecords: (records) =>
          validateSalesPhasePartialRecords(sourcePlan, records),
        readComplete: () => readSalesPlan(rpc, sourcePlan),
      }),
    );
  }
  const baseFinanceFacts = dedupeByID([
    ...outsourcingReadback.flatMap((item) => item.finance),
    ...salesReadback.flatMap((item) => item.finance),
  ]);
  const lifecycle = await applyLifecycleSpecimens({
    rpc,
    plan,
    productionPlans,
    productionReadback,
    salesPlans,
    financeFacts: baseFinanceFacts,
    apply,
  });
  return {
    plans: {
      production: productionPlans,
      outsourcing: outsourcingPlans,
      sales: salesPlans,
    },
    productionOrders: mergeManualAcceptanceFactReferences(
      productionReadback.map((item) => item.order),
      lifecycle.productionOrders,
    ),
    productionFacts: dedupeByID([
      ...productionReadback.flatMap((item) => item.facts),
      ...lifecycle.productionFacts,
    ]),
    outsourcingFacts: dedupeByID(
      outsourcingReadback.flatMap((item) => item.facts),
    ),
    qualityInspections: dedupeByID(
      outsourcingReadback.map((item) => item.inspection),
    ),
    inventoryLots: dedupeByID(productionReadback.map((item) => item.lot)),
    inventoryBalances: dedupeByID(
      productionReadback.flatMap((item) => item.balances),
    ),
    inventoryTxns: dedupeByID(productionReadback.flatMap((item) => item.txns)),
    stockReservations: dedupeByID([
      ...salesReadback.map((item) => item.reservation),
      ...lifecycle.reservations,
    ]),
    shipments: dedupeByID([
      ...salesReadback.map((item) => item.shipment),
      ...lifecycle.shipments,
    ]),
    financeFacts: dedupeByID(lifecycle.financeFacts),
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items || []) {
    const value = String(item?.[key] ?? "UNKNOWN").toUpperCase();
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function normalizeStockReservationReference(item) {
  const sourceType = String(item?.source_type || "SALES_ORDER").toUpperCase();
  if (sourceType !== "SALES_ORDER") {
    throw new CliError(
      `stock reservation ${item?.reservation_no || item?.id || "unknown"} has conflicting source_type ${sourceType}`,
      2,
    );
  }
  return {
    ...item,
    source_type: sourceType,
    source_id: positiveID(
      item?.source_id || item?.sales_order_id,
      "stock_reservation.source_id",
    ),
  };
}

function assertReferenceRecords(plan, records) {
  for (const key of REFERENCE_KEYS) {
    if (!Array.isArray(records[key]) || records[key].length === 0) {
      throw new CliError(`fact report is missing referenceRecords.${key}`);
    }
    if (
      new Set(records[key].map((item) => item.id)).size !== records[key].length
    ) {
      throw new CliError(
        `fact report referenceRecords.${key} contains duplicate ids`,
      );
    }
  }
  const minimums = {
    purchaseReceipts: plan.expectedMinimums.purchaseReceipts,
    qualityInspections: plan.expectedMinimums.qualityInspections,
    productionOrders: plan.expectedMinimums.productionOrders,
    productionFacts: plan.expectedMinimums.productionFacts,
    inventoryLots: 45,
    inventoryBalances: 45,
    inventoryTxns: 45,
    stockReservations: plan.expectedMinimums.stockReservations,
    shipments: plan.expectedMinimums.shipments,
  };
  for (const [key, minimum] of Object.entries(minimums)) {
    if (records[key].length < minimum) {
      throw new CliError(
        `${key} has ${records[key].length} exact references; need ${minimum}`,
      );
    }
  }
  if (records.shipments.length !== MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT) {
    throw new CliError(
      `shipments has ${records.shipments.length} exact references; need exactly ${MANUAL_ACCEPTANCE_SHIPMENT_FACT_COUNT}`,
    );
  }
  const requireStatuses = (key, required) => {
    const actual = new Set(
      records[key].map((item) => String(item.status || "").toUpperCase()),
    );
    const missing = required.filter((status) => !actual.has(status));
    if (missing.length > 0) {
      throw new CliError(
        `${key} is missing lifecycle states: ${missing.join(", ")}`,
      );
    }
  };
  requireStatuses("purchaseReceipts", ["DRAFT", "POSTED", "CANCELLED"]);
  requireStatuses("purchaseReturns", ["DRAFT", "POSTED", "CANCELLED"]);
  requireStatuses("purchaseReceiptAdjustments", [
    "DRAFT",
    "POSTED",
    "CANCELLED",
  ]);
  requireStatuses("qualityInspections", [
    "DRAFT",
    "SUBMITTED",
    "PASSED",
    "REJECTED",
    "CANCELLED",
  ]);
  requireStatuses("productionOrders", [
    "DRAFT",
    "RELEASED",
    "CLOSED",
    "CANCELLED",
  ]);
  requireStatuses("productionFacts", ["DRAFT", "POSTED", "CANCELLED"]);
  requireStatuses("stockReservations", ["ACTIVE", "RELEASED"]);
  requireStatuses("shipments", ["DRAFT", "SHIPPED", "CANCELLED"]);
  const longShipments = records.shipments.filter(
    (shipment) =>
      Array.isArray(shipment.items) &&
      shipment.items.length ===
        MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT,
  );
  if (longShipments.length !== MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT) {
    throw new CliError(
      `shipments must contain exactly ${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_COUNT} record with ${MANUAL_ACCEPTANCE_SHIPMENT_LONG_RECORD_LINE_COUNT} lines; got ${longShipments.length}`,
    );
  }
  requireStatuses("inventoryLots", ["HOLD", "ACTIVE", "REJECTED"]);
  const productionTypes = new Set(
    records.productionFacts.map((item) =>
      String(item.fact_type || "").toUpperCase(),
    ),
  );
  for (const type of ["MATERIAL_ISSUE", "FINISHED_GOODS_RECEIPT", "REWORK"]) {
    if (!productionTypes.has(type))
      throw new CliError(`productionFacts is missing ${type}`);
  }
  const txnTypes = new Set(
    records.inventoryTxns.map((item) =>
      String(item.txn_type || "").toUpperCase(),
    ),
  );
  for (const type of ["IN", "OUT", "REVERSAL"]) {
    if (!txnTypes.has(type))
      throw new CliError(`inventoryTxns is missing ${type}`);
  }
  const adjustTypes = new Set(
    records.purchaseReceiptAdjustments.flatMap((item) =>
      (item.items || [item]).map((line) =>
        String(line.adjust_type || item.adjust_type || "").toUpperCase(),
      ),
    ),
  );
  for (const type of ["QUANTITY_INCREASE", "QUANTITY_DECREASE"]) {
    if (!adjustTypes.has(type))
      throw new CliError(`purchaseReceiptAdjustments is missing ${type}`);
  }
  const financeTypes = countBy(records.financeFacts, "fact_type");
  for (const [type, minimum] of Object.entries({
    PAYABLE: plan.expectedMinimums.payables,
    RECEIVABLE: plan.expectedMinimums.receivables,
    INVOICE: plan.expectedMinimums.invoices,
    RECONCILIATION: plan.expectedMinimums.reconciliation,
  })) {
    if ((financeTypes[type] || 0) < minimum) {
      throw new CliError(
        `finance ${type} has ${financeTypes[type] || 0} exact references; need ${minimum}`,
      );
    }
  }
  for (const type of ["PAYABLE", "RECEIVABLE", "RECONCILIATION"]) {
    const typeRecords = records.financeFacts.filter(
      (item) => item.fact_type === type,
    );
    const statuses = new Set(typeRecords.map((item) => item.status));
    const missing = ["DRAFT", "POSTED", "SETTLED", "CANCELLED"].filter(
      (status) => !statuses.has(status),
    );
    if (missing.length > 0) {
      throw new CliError(
        `finance ${type} is missing lifecycle states: ${missing.join(", ")}`,
      );
    }
  }
  const invoiceStatuses = new Set(
    records.financeFacts
      .filter((item) => item.fact_type === "INVOICE")
      .map((item) => item.status),
  );
  for (const status of ["DRAFT", "POSTED", "CANCELLED"]) {
    if (!invoiceStatuses.has(status))
      throw new CliError(`finance INVOICE is missing ${status}`);
  }
  const productionOwner = records.productionFacts.find(
    (item) => String(item.status || "").toUpperCase() === "POSTED",
  );
  const financeOwner = records.financeFacts.find(
    (item) => String(item.status || "").toUpperCase() === "POSTED",
  );
  if (!productionOwner || !financeOwner) {
    throw new CliError(
      "attachment owners require POSTED production and finance facts",
    );
  }
  records.attachmentOwners = {
    productionFactId: productionOwner.id,
    financeFactId: financeOwner.id,
  };
  return records;
}

function buildFactReport({
  mode,
  plan,
  runtime,
  purchase,
  facts,
  finalInventory,
}) {
  const referenceRecords = assertReferenceRecords(plan, {
    productionOrders: dedupeByID(facts.productionOrders),
    productionFacts: dedupeByID(facts.productionFacts),
    purchaseReceipts: dedupeByID(purchase.purchaseReceipts),
    purchaseReturns: dedupeByID(purchase.purchaseReturns),
    purchaseReceiptAdjustments: dedupeByID(
      purchase.purchaseReceiptAdjustments,
    ).map((adjustment) => ({
      ...adjustment,
      adjust_type:
        adjustment.adjust_type ||
        adjustment.adjustType ||
        adjustment.items?.[0]?.adjust_type ||
        adjustment.items?.[0]?.adjustType,
    })),
    qualityInspections: dedupeByID([
      ...purchase.qualityInspections,
      ...facts.qualityInspections,
    ]),
    inventoryLots: finalInventory
      ? dedupeByID(finalInventory.inventoryLots)
      : dedupeByID([...purchase.inventoryLots, ...facts.inventoryLots]),
    inventoryBalances: finalInventory
      ? dedupeByID(finalInventory.inventoryBalances)
      : dedupeByID([...purchase.inventoryBalances, ...facts.inventoryBalances]),
    inventoryTxns: finalInventory
      ? dedupeByID(finalInventory.inventoryTxns)
      : dedupeByID([...purchase.inventoryTxns, ...facts.inventoryTxns]),
    stockReservations: dedupeByID(facts.stockReservations).map(
      normalizeStockReservationReference,
    ),
    shipments: dedupeByID(facts.shipments),
    financeFacts: dedupeByID(facts.financeFacts),
    outsourcingFacts: dedupeByID(facts.outsourcingFacts),
  });
  return {
    reportContract: FACT_REPORT_CONTRACT,
    mode,
    generatedAt: new Date().toISOString(),
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    retiredGenericFactWriter: false,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    target: plan.target,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
    prefix: plan.prefix,
    semanticDigest: plan.semanticDigest,
    runtime,
    expectedMinimums: plan.expectedMinimums,
    summary: Object.fromEntries(
      Object.entries(referenceRecords)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, value.length]),
    ),
    statusCounts: {
      purchaseReceipts: countBy(referenceRecords.purchaseReceipts, "status"),
      purchaseReturns: countBy(referenceRecords.purchaseReturns, "status"),
      purchaseReceiptAdjustments: countBy(
        referenceRecords.purchaseReceiptAdjustments,
        "status",
      ),
      qualityInspections: countBy(
        referenceRecords.qualityInspections,
        "status",
      ),
      productionOrders: countBy(referenceRecords.productionOrders, "status"),
      productionFacts: countBy(referenceRecords.productionFacts, "status"),
      stockReservations: countBy(referenceRecords.stockReservations, "status"),
      shipments: countBy(referenceRecords.shipments, "status"),
      financeFacts: countBy(referenceRecords.financeFacts, "status"),
    },
    typeCounts: {
      productionFacts: countBy(referenceRecords.productionFacts, "fact_type"),
      financeFacts: countBy(referenceRecords.financeFacts, "fact_type"),
      inventoryTxns: countBy(referenceRecords.inventoryTxns, "txn_type"),
    },
    referenceRecords,
    replay: {
      policy:
        "同一 dataset/version/run 使用稳定业务号与幂等键；完整批次按精确记录复用，部分批次或状态冲突立即失败并要求人工核对。",
      cleanup: "业务记录通过取消、冲正、释放或结清退出，不物理删除已过账记录。",
    },
  };
}

function buildPurchaseStageReport({ mode, plan, runtime, purchase }) {
  return {
    reportContract: "manual-acceptance-purchase-quality-stage-v1",
    mode,
    generatedAt: new Date().toISOString(),
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    target: plan.target,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
    prefix: plan.prefix,
    semanticDigest: plan.semanticDigest,
    runtime,
    referenceRecords: Object.fromEntries(
      Object.entries(purchase).filter(([, value]) => Array.isArray(value)),
    ),
  };
}

export async function applyManualAcceptanceFactPlan(
  plan,
  sourceReport,
  options = {},
) {
  const mutationTarget = assertManualAcceptanceMutationTarget(plan, {
    confirmation:
      options.targetConfirmation ||
      process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
  });
  const targetAttestation = parseManualAcceptanceTargetAttestation(
    options.targetAttestation ||
      process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
  );
  if (mutationTarget.external) {
    assertManualAcceptanceTargetAttestation({
      policy: mutationTarget,
      attestation: targetAttestation,
    });
  } else if (targetAttestation) {
    throw new CliError(
      "target attestation is forbidden for local fact apply",
      2,
    );
  }
  if (
    (options.confirmPhrase || process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM) !==
    APPLY_CONFIRMATION
  ) {
    throw new CliError(
      `apply requires MANUAL_ACCEPTANCE_SIM_CONFIRM=${APPLY_CONFIRMATION}`,
      2,
    );
  }
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy: plan,
    attestation: targetAttestation,
    fetchImpl: options.fetchImpl || fetch,
  });
  const baseContext =
    options.executionContext || (await createExecutionContext(plan, options));
  const context = {
    ...baseContext,
    targetConfirmation:
      options.targetConfirmation ||
      process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation: mutationTarget.external ? targetAttestation : undefined,
  };
  assertSourceRuntimeIdentity(sourceReport, context.runtime);
  const purchase =
    options.phase === "facts"
      ? options.verifyPurchaseStage
        ? await options.verifyPurchaseStage(plan, context)
        : await verifyPurchaseQualityStage(plan, context)
      : options.purchaseStage
        ? await options.purchaseStage(plan, context)
        : await applyPurchaseQualityStage(plan, context);
  if (options.phase === "purchase-quality") {
    return buildPurchaseStageReport({
      mode: "apply",
      plan,
      runtime: context.runtime,
      purchase,
    });
  }
  const facts = options.factStage
    ? await options.factStage(plan, sourceReport, purchase, {
        ...context,
        apply: true,
      })
    : await runSourceDrivenFactStage(plan, sourceReport, purchase, {
        ...context,
        apply: true,
      });
  const finalInventory = options.finalInventoryStage
    ? await options.finalInventoryStage(context.rpc, purchase, facts)
    : options.factStage
      ? null
      : await readManualAcceptanceFinalInventoryReferences(context.rpc, [
          ...purchase.inventoryLots,
          ...facts.inventoryLots,
        ]);
  return buildFactReport({
    mode: "apply",
    plan,
    runtime: context.runtime,
    purchase,
    facts,
    finalInventory,
  });
}

export async function verifyManualAcceptanceFactPlan(
  plan,
  sourceReport,
  options = {},
) {
  const context =
    options.executionContext || (await createExecutionContext(plan, options));
  assertSourceRuntimeIdentity(sourceReport, context.runtime);
  const purchase = options.verifyPurchaseStage
    ? await options.verifyPurchaseStage(plan, context)
    : await verifyPurchaseQualityStage(plan, context);
  if (options.phase === "purchase-quality") {
    return buildPurchaseStageReport({
      mode: "verify",
      plan,
      runtime: context.runtime,
      purchase,
    });
  }
  const facts = options.factStage
    ? await options.factStage(plan, sourceReport, purchase, {
        ...context,
        apply: false,
      })
    : await runSourceDrivenFactStage(plan, sourceReport, purchase, {
        ...context,
        apply: false,
      });
  const finalInventory = options.finalInventoryStage
    ? await options.finalInventoryStage(context.rpc, purchase, facts)
    : options.factStage
      ? null
      : await readManualAcceptanceFinalInventoryReferences(context.rpc, [
          ...purchase.inventoryLots,
          ...facts.inventoryLots,
        ]);
  return buildFactReport({
    mode: "verify",
    plan,
    runtime: context.runtime,
    purchase,
    facts,
    finalInventory,
  });
}

export function parseManualAcceptanceFactArgs(argv = []) {
  const options = {
    apply: false,
    verify: false,
    help: false,
    json: false,
    phase: "all",
    sourceReport: "",
    out: DEFAULT_OUT_DIR,
    backendURL: process.env.MANUAL_ACCEPTANCE_BACKEND_URL || "",
    target: process.env.MANUAL_ACCEPTANCE_TARGET || "",
    dataVersion: process.env.MANUAL_ACCEPTANCE_DATA_VERSION || "",
    runId: process.env.MANUAL_ACCEPTANCE_RUN_ID || "",
    databaseName: process.env.MANUAL_ACCEPTANCE_DATABASE_NAME || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (token === "--verify") {
      options.verify = true;
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
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new CliError(`missing value for ${token}`, 2);
    index += 1;
    const key = token.slice(2);
    if (key === "source-report") options.sourceReport = value;
    else if (key === "backend-url") options.backendURL = value;
    else if (key === "target") options.target = value;
    else if (key === "data-version") options.dataVersion = value;
    else if (key === "run-id") options.runId = value;
    else if (key === "database-name") options.databaseName = value;
    else if (key === "out") options.out = value;
    else if (key === "phase") options.phase = value;
    else throw new CliError(`unknown option ${token}`, 2);
  }
  if (options.apply && options.verify)
    throw new CliError("--apply and --verify are mutually exclusive", 2);
  if (!new Set(["all", "purchase-quality", "facts"]).has(options.phase)) {
    throw new CliError("--phase must be all, purchase-quality, or facts", 2);
  }
  return options;
}

function usage() {
  return `全页面模拟验收业务数据 / Manual Acceptance Fact Data

计划：
  node scripts/qa/manual-acceptance-fact-data.mjs --source-report <apply-report.json> --json

完整写入：
  MANUAL_ACCEPTANCE_SIM_CONFIRM=${APPLY_CONFIRMATION} \\
  MANUAL_ACCEPTANCE_PASSWORD='<role-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<admin-password>' \\
    node scripts/qa/manual-acceptance-fact-data.mjs --apply --source-report <apply-report.json>

只读精确核验：
  node scripts/qa/manual-acceptance-fact-data.mjs --verify --source-report <apply-report.json>

可用 --phase purchase-quality 或 --phase facts 分段执行。customer-trial-133 还必须提供绑定 target/version/run 的确认串与严格运行态 attestation。`;
}

async function writeReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${report.mode}-report.json`);
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

export async function runManualAcceptanceFactCli(argv = [], deps = {}) {
  const options = parseManualAcceptanceFactArgs(argv);
  if (options.help) return { exitCode: 0, text: `${usage()}\n` };
  const sourceReport = JSON.parse(
    await readFile(
      requiredText(options.sourceReport, "--source-report"),
      "utf8",
    ),
  );
  for (const [optionKey, reportKey] of Object.entries({
    backendURL: "backendURL",
    target: "target",
    dataVersion: "dataVersion",
    runId: "runId",
    databaseName: "databaseName",
  })) {
    if (options[optionKey] && options[optionKey] !== sourceReport[reportKey]) {
      throw new CliError(`${optionKey} does not match the source report`, 2);
    }
  }
  const plan = buildManualAcceptanceFactPlan(sourceReport);
  if (!options.apply && !options.verify) {
    return {
      exitCode: 0,
      text: `${JSON.stringify(plan, null, options.json ? 2 : 0)}\n`,
      plan,
      sourceReport,
    };
  }
  const runOptions = { ...deps, phase: options.phase };
  const report = options.apply
    ? await applyManualAcceptanceFactPlan(plan, sourceReport, runOptions)
    : await verifyManualAcceptanceFactPlan(plan, sourceReport, runOptions);
  const filePath = await writeReport(options.out, report);
  return {
    exitCode: 0,
    text: `[qa:manual-acceptance-fact-data] ${report.mode} complete report=${filePath}\n`,
    plan,
    report,
    filePath,
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

export {
  APPLY_CONFIRMATION as MANUAL_ACCEPTANCE_FACT_CONFIRM_PHRASE,
  FACT_REPORT_CONTRACT as SOURCE_DRIVEN_FACT_REPORT_CONTRACT,
};
