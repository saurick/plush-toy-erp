import { setTimeout as delay } from "node:timers/promises";
import { RpcErrorCode } from "../../web/src/common/consts/errorCodes.generated.js";
import { pressureRPC, pressureLogicFingerprint } from "./pressure-runtime.mjs";
import { ENGINEERING_RECIPES, engineeringDataFingerprint } from "./pressure-engineering-data.mjs";

export const ENGINEERING_API = Object.freeze({
  preview: { actor: "engineering", domain: "sales_order", method: "get_engineering_material_request" },
  submit: { actor: "engineering", domain: "sales_order", method: "submit_engineering_material_request" },
  boss: { actor: "boss", domain: "sales_order", method: "boss_review_engineering_material_request", action: "BOSS_APPROVE" },
  finance: { actor: "finance", domain: "sales_order", method: "finance_review_engineering_material_request", action: "FINANCE_APPROVE" },
  order: { actor: "sales", domain: "sales_order", method: "get_sales_order" },
  orders: { actor: "sales", domain: "sales_order", method: "list_sales_orders" },
  bom: { actor: "engineering", domain: "bom", method: "get_bom_version" },
  purchase: { actor: "purchase", domain: "purchase_order", method: "get_purchase_order" },
  purchaseItems: { actor: "purchase", domain: "purchase_order", method: "list_purchase_order_items" },
});
export const ENGINEERING_STATUS = Object.freeze({ salesOrderActive: "active", purchaseOrderApproved: "approved", bomActive: "ACTIVE" });
export const ENGINEERING_VERIFICATION_FILES = Object.freeze([
  "scripts/qa/pressure-engineering-scenario.mjs", "web/src/common/consts/errorCodes.generated.js",
  "server/internal/core/status/sales_order.go", "server/internal/core/status/purchase_order.go",
  "server/internal/service/jsonrpc_purchase_order_shared.go", "server/internal/service/jsonrpc_purchase_order_document.go",
  "server/internal/service/jsonrpc_purchase_order_item.go", "server/internal/service/jsonrpc_bom_shared.go",
]);
export function engineeringVerificationFingerprint() {
  return pressureLogicFingerprint(ENGINEERING_VERIFICATION_FILES);
}
const importedVerificationFingerprint = engineeringVerificationFingerprint();
export function assertEngineeringPressureReceipt(receipt, target) {
  if (receipt?.status !== "passed" || receipt.simulatedOnly !== true ||
      receipt.databaseName !== target.databaseName || receipt.databaseTargetFingerprint !== target.targetFingerprint ||
      !Array.isArray(receipt.orders) || receipt.orders.length < 10)
    throw new Error("engineering pressure receipt does not match its disposable target");
  if (receipt.dataLogicFingerprint !== engineeringDataFingerprint()) throw new Error("engineering data logic changed; reseed required");
  if (importedVerificationFingerprint !== engineeringVerificationFingerprint()) throw new Error("engineering verification changed after loading; restart required");
}

export function quantity6(value) {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/u.test(value)) throw new Error("invalid six-decimal quantity");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
function requireResult(condition, check = "engineering_result") {
  if (!condition) {
    const error = new Error("engineering pressure business result mismatch: " + check);
    error.errorClass = "consistency_mismatch"; error.check = check; throw error;
  }
}
export function checkEngineeringDemand(request, order, receipt, status = request?.status) {
  const recipe = ENGINEERING_RECIPES[order.kind], refs = receipt.references.materials;
  requireResult(recipe && request.sales_order_id === order.id && request.order_no === order.orderNo &&
    request.status === status && /^[0-9a-f]{64}$/u.test(request.source_hash) && request.source_order_version > 0 &&
    Array.isArray(request.issues) && request.issues.length === 0 && Array.isArray(request.items) && request.items.length === 3 &&
    Array.isArray(request.sources) && request.sources.length === recipe.sources &&
    Array.isArray(request.purchase_orders) && request.purchase_orders.length === (status === "APPROVED" ? 2 : 0), "demand_structure");
  const seen = new Set();
  for (const item of request.items) {
    const index = refs.findIndex((ref) => ref.id === item.material_id && ref.unitId === item.unit_id && ref.supplierId === item.supplier_id);
    requireResult(index >= 0 && !seen.has(index) && quantity6(item.required_quantity) === quantity6(recipe.quantities[index]), "demand_material_unit_quantity");
    seen.add(index);
  }
  const lines = new Map(), positions = new Set(), lineIDs = new Map(), bomIDs = new Map(), product = receipt.products[order.kind];
  const ordinaryDisplayUsage = ["212.52", "33.396", "82.5792", "15.18"];
  for (const source of request.sources) {
    const key = source.sales_order_item_id + ":" + source.bom_item_id;
    const position = Number(/^模拟部位([1-9]\d*)$/u.exec(source.position)?.[1]) - 1, part = recipe.parts[position];
    requireResult(Number.isSafeInteger(source.sales_order_item_id) && source.sales_order_item_id > 0 &&
      Number.isSafeInteger(source.bom_item_id) && source.bom_item_id > 0 &&
      Number.isSafeInteger(source.line_no) && source.line_no >= 1 && source.line_no <= recipe.lines &&
      !positions.has(key) && source.bom_id === product.bomId && source.product_id === product.id &&
      (!lineIDs.has(source.line_no) || lineIDs.get(source.line_no) === source.sales_order_item_id) &&
      (!bomIDs.has(position) || bomIDs.get(position) === source.bom_item_id) &&
      quantity6(source.production_quantity) === quantity6(order.kind === "ordinary" ? "1012" : "130"), "demand_source_link");
    positions.add(key); lines.set(source.sales_order_item_id, (lines.get(source.sales_order_item_id) || 0) + 1);
    lineIDs.set(source.line_no, source.sales_order_item_id); bomIDs.set(position, source.bom_item_id);
    requireResult(part && source.material_id === refs[part.material].id && source.unit_id === refs[part.material].unitId &&
      source.product_sku_id === product.skuId && Number.isSafeInteger(source.sample_image_attachment_id) && source.sample_image_attachment_id > 0 &&
      quantity6(source.ordered_quantity) === quantity6(recipe.ordered) &&
      quantity6(source.pre_shipment_sample_quantity) === quantity6(recipe.samples) &&
      quantity6(source.unit_usage) === quantity6(part.quantity) && quantity6(source.loss_rate) === quantity6(part.loss_rate), "source_material_unit_inputs");
    requireResult(quantity6(source.total_usage) === quantity6(order.kind === "complex" ? "1.725214" : ordinaryDisplayUsage[position]), "source_display_quantity");
  }
  requireResult(lines.size === recipe.lines && [...lines.values()].every((count) => count === recipe.parts.length) &&
    lineIDs.size === recipe.lines && new Set(lineIDs.values()).size === recipe.lines &&
    bomIDs.size === recipe.parts.length && new Set(bomIDs.values()).size === recipe.parts.length, "source_line_coverage");
  return true;
}
export function checkEngineeringPurchases(request, purchases, order, receipt) {
  checkEngineeringDemand(request, order, receipt, "APPROVED");
  requireResult(purchases.length === 2 && new Set(request.purchase_orders.map((po) => po.id)).size === 2, "purchase_group_count");
  const seen = new Set(), suppliers = new Set();
  for (const { header, items, total } of purchases) {
    const reference = request.purchase_orders.find((po) => po.id === header?.id);
    requireResult(reference && header.purchase_order_no === reference.purchase_order_no && header.supplier_id === reference.supplier_id &&
      header.lifecycle_status === ENGINEERING_STATUS.purchaseOrderApproved && header.expected_arrival_date === null &&
      !suppliers.has(header.supplier_id) && Array.isArray(items) && total === items.length && items.length > 0, "purchase_header_and_pagination");
    suppliers.add(header.supplier_id);
    for (const line of items) {
      const demand = request.items.find((item) => item.material_id === line.material_id && item.unit_id === line.unit_id);
      const key = line.material_id + ":" + line.unit_id;
      requireResult(demand && !seen.has(key) && demand.supplier_id === header.supplier_id &&
        line.purchase_order_id === header.id && quantity6(line.purchased_quantity) === quantity6(demand.required_quantity) &&
        line.product_order_no_snapshot === order.orderNo &&
        line.unit_price === null && line.amount === null && line.expected_arrival_date === null, "purchase_line_quantity_source_pricing");
      seen.add(key);
    }
  }
  requireResult(seen.size === 3, "purchase_material_coverage");
  return true;
}

export function createEngineeringPressureClient({ baseURL, tokens }) {
  const call = async (operation, params, options = {}) => {
    const spec = ENGINEERING_API[operation];
    if (!spec) throw new Error("unknown engineering pressure operation");
    return pressureRPC({ baseURL, ...spec, params: { customer_key: "yoyoosun", ...params, ...(spec.action ? { action: spec.action } : {}) },
      token: tokens[options.actor || spec.actor], ...options });
  };
  const requireCall = async (operation, params, options = {}) => {
    const result = await call(operation, params, options);
    if (!result.ok) {
      const error = new Error(result.error);
      Object.assign(error, { errorClass: result.errorClass, method: result.method, code: result.code, check: result.check }); throw error;
    }
    return result.data;
  };
  return { call, requireCall };
}
const submitParams = (order, preview) => ({ sales_order_id: order.id, expected_version: preview.source_order_version, expected_source_hash: preview.source_hash });
const reviewParams = (request) => ({ id: request.id, expected_version: request.version, note: "隔离压测模拟审批" });

export async function readEngineeringPurchaseResult({ client, order, receipt, options = {} }) {
  const request = await client.requireCall("preview", { sales_order_id: order.id }, {
    ...options, validate: (data) => checkEngineeringDemand(data, order, receipt, "APPROVED"),
  });
  const purchases = [];
  for (const po of request.purchase_orders) {
    const header = (await client.requireCall("purchase", { id: po.id }, options)).purchase_order;
    const detail = await client.requireCall("purchaseItems", { purchase_order_id: po.id, limit: 200 }, options);
    purchases.push({ header, items: detail.purchase_order_items, total: detail.total });
  }
  checkEngineeringPurchases(request, purchases, order, receipt);
  return { request, purchases };
}
export async function runEngineeringBusinessFlow({ client, order, receipt, observe, signal }) {
  const options = { observe, signal };
  let request = await client.requireCall("preview", { sales_order_id: order.id }, {
    ...options, validate: (data) => checkEngineeringDemand(data, order, receipt, "PREVIEW"),
  });
  request = await client.requireCall("submit", submitParams(order, request), {
    ...options, validate: (data) => checkEngineeringDemand(data, order, receipt, "SUBMITTED"),
  });
  request = await client.requireCall("boss", reviewParams(request), {
    ...options, validate: (data) => checkEngineeringDemand(data, order, receipt, "BOSS_APPROVED"),
  });
  await client.requireCall("finance", reviewParams(request), {
    ...options, validate: (data) => checkEngineeringDemand(data, order, receipt, "APPROVED"),
  });
  const verified = await readEngineeringPurchaseResult({ client, order, receipt, options });
  return { ok: true, businessFlow: true, requestID: verified.request.id, method: "engineering.business_flow" };
}

function checkCompetitionResults(results, allowedCode, operation) {
  requireResult(results.some((result) => result.ok), operation + "_competition_no_success");
  requireResult(results.every((result) => result.ok || result.code === allowedCode), operation + "_competition_unexpected_error");
}
export async function runEngineeringCompetition({ client, receipt, signal }) {
  const order = receipt.orders[0], options = { signal }, invalid = RpcErrorCode.INVALID_PARAM;
  const preview = await client.requireCall("preview", { sales_order_id: order.id }, {
    ...options, validate: (data) => checkEngineeringDemand(data, order, receipt, "PREVIEW"),
  });
  const submits = await Promise.all(Array.from({ length: 20 }, () => client.call("submit", submitParams(order, preview), options)));
  checkCompetitionResults(submits, invalid, "submit");
  let request = await client.requireCall("preview", { sales_order_id: order.id }, options);
  checkEngineeringDemand(request, order, receipt, "SUBMITTED");
  requireResult(new Set(submits.filter((item) => item.ok).map((item) => item.data.id)).size === 1 && request.version === 1, "submit_single_result");
  const before = JSON.stringify(request);
  const mismatched = await client.call("boss", { ...reviewParams(request), expected_version: request.version + 1 }, options);
  const wrongStage = await client.call("finance", reviewParams(request), options);
  const denied = await client.call("finance", reviewParams(request), { ...options, actor: "engineering" });
  requireResult(!mismatched.ok && mismatched.code === invalid && !wrongStage.ok && wrongStage.code === invalid &&
    !denied.ok && denied.code === RpcErrorCode.PERMISSION_DENIED, "version_stage_permission_rejection");
  requireResult(JSON.stringify(await client.requireCall("preview", { sales_order_id: order.id }, options)) === before, "rejected_action_no_mutation");
  const bosses = await Promise.all(Array.from({ length: 20 }, () => client.call("boss", reviewParams(request), options)));
  checkCompetitionResults(bosses, invalid, "boss");
  request = await client.requireCall("preview", { sales_order_id: order.id }, options);
  checkEngineeringDemand(request, order, receipt, "BOSS_APPROVED");
  requireResult(request.version === 2 && bosses.filter((item) => item.ok).length === 1, "boss_single_transition");
  const finances = await Promise.all(Array.from({ length: 20 }, () => client.call("finance", reviewParams(request), options)));
  checkCompetitionResults(finances, invalid, "finance");
  for (const result of finances.filter((item) => !item.ok)) {
    const replay = await client.call("finance", reviewParams(request), options);
    requireResult(replay.ok, "finance_replay_failed");
  }
  const final = await readEngineeringPurchaseResult({ client, order, receipt, options });
  requireResult(final.request.version === 3, "finance_single_transition");
  const stale = await client.call("boss", { ...reviewParams(final.request), expected_version: final.request.version - 1 }, options);
  requireResult(!stale.ok && stale.code === invalid &&
    JSON.stringify(await client.requireCall("preview", { sales_order_id: order.id }, options)) === JSON.stringify(final.request), "stale_version_no_mutation");
  const ids = final.request.purchase_orders.map((item) => item.id).sort((a, b) => a - b);
  for (const result of finances.filter((item) => item.ok))
    requireResult(JSON.stringify(result.data.purchase_orders.map((item) => item.id).sort((a, b) => a - b)) === JSON.stringify(ids), "finance_same_purchase_result");

  const retryOrder = receipt.orders[1];
  let retryRequest = await client.requireCall("preview", { sales_order_id: retryOrder.id }, options);
  retryRequest = await client.requireCall("submit", submitParams(retryOrder, retryRequest), options);
  retryRequest = await client.requireCall("boss", reviewParams(retryRequest), options);
  // The backend really commits; only the received reply is withheld until the
  // client's timeout. This exercises unknown-outcome recovery, not server delay.
  const lostReply = await client.call("finance", reviewParams(retryRequest), {
    ...options, timeoutMs: 500,
    fetchImpl: async (url, fetchOptions) => {
      const response = await fetch(url, fetchOptions); await response.arrayBuffer();
      await delay(1000, undefined, { signal: fetchOptions.signal }); return response;
    },
  });
  requireResult(!lostReply.ok && lostReply.errorClass === "timeout", "lost_reply_client_timeout");
  const committed = await readEngineeringPurchaseResult({ client, order: retryOrder, receipt, options });
  const replay = await client.requireCall("finance", reviewParams(retryRequest), options);
  requireResult(replay.version === committed.request.version &&
    JSON.stringify(replay.purchase_orders) === JSON.stringify(committed.request.purchase_orders), "lost_reply_replay_same_result");
  await readEngineeringPurchaseResult({ client, order: retryOrder, receipt, options });
  return { passed: true, concurrency: 20, submitSuccesses: submits.filter((item) => item.ok).length,
    bossSuccesses: bosses.filter((item) => item.ok).length, financeSuccesses: finances.filter((item) => item.ok).length,
    versionMismatchRejected: true, staleVersionRejected: true, wrongStageRolledBack: true, unauthorizedRejected: true,
    singleDemandVersion: true, purchaseOrderIDs: ids, singleSupplierResult: true,
    unknownOutcome: { mode: "server_reply_withheld_until_client_timeout", clientError: lostReply.errorClass, replaySameVersionAndPurchases: true },
    completedBusinessFlows: 2 };
}
