import { pressureLogicFingerprint, pressureRPC, verifyPressureRuntime, normalizePressureURL } from "./pressure-runtime.mjs";
import { prepareManualAcceptanceEngineering } from "./manual-acceptance-engineering-data.mjs";
import { advanceSalesOrderLifecycleThroughProcess } from "./manual-acceptance-source-data.mjs";
import { pressureDataScale, PRESSURE_HISTORY_STATES } from "../../web/src/dev-workbench/config/devPressureData.mjs";
import { readEngineeringPressureLedger } from "./pressure-engineering-ledger.mjs";
import { assertDisposableDatabaseTarget } from "./database-target.mjs";

export const ENGINEERING_DATA_VERSION = "engineering-pressure-v1";
// Register business data dependencies here; verification and load changes are
// fingerprinted separately by the scenario/runner and do not alter this recipe.
export const ENGINEERING_DATA_FILES = Object.freeze([
  "scripts/qa/pressure-engineering-data.mjs",
  "scripts/qa/pressure-engineering-scenario.mjs",
  "scripts/qa/pressure-engineering-ledger.mjs",
  "web/src/dev-workbench/config/devPressureData.mjs",
  "scripts/qa/manual-acceptance-engineering-data.mjs",
  "scripts/qa/manual-acceptance-attachment-data.mjs",
  "scripts/qa/manual-acceptance-source-data.mjs",
  "server/internal/unitpolicy/units.json",
  "server/internal/biz/unit_quantity.go",
  "server/internal/biz/masterdata.go",
  "server/internal/biz/sales_order_commercial.go",
  "server/internal/data/sales_order_repo.go",
  "server/internal/service/jsonrpc_masterdata_customer.go",
  "server/internal/service/jsonrpc_masterdata_supplier.go",
  "server/internal/service/jsonrpc_masterdata_material.go",
  "server/internal/service/jsonrpc_masterdata_product.go",
  "server/internal/biz/engineering_material_request.go",
  "server/internal/data/engineering_material_request_repo.go",
  "server/internal/service/jsonrpc_engineering_material_request.go",
  "server/internal/service/jsonrpc_sales_order_shared.go",
  "server/internal/service/jsonrpc_bom_shared.go",
]);
export function engineeringDataFingerprint() { return pressureLogicFingerprint(ENGINEERING_DATA_FILES); }
const importedDataFingerprint = engineeringDataFingerprint();

export const ENGINEERING_RECIPES = Object.freeze({
  ordinary: Object.freeze({
    lines: 1, ordered: "1000", samples: "12", sources: 4,
    // 1012 * (0.2*1.05 + 0.03*1.1), 1012*.08*1.02, 1012*.015.
    quantities: Object.freeze(["245.916", "82.5792", "15.18"]),
    parts: Object.freeze([
      { material: 0, quantity: "0.2", loss_rate: "0.05" },
      { material: 0, quantity: "0.03", loss_rate: "0.1" },
      { material: 1, quantity: "0.08", loss_rate: "0.02" },
      { material: 2, quantity: "0.015", loss_rate: "0" },
    ]),
  }),
  complex: Object.freeze({
    lines: 8, ordered: "123", samples: "7", sources: 192,
    // Per material: 64 positions * 130 * .012345 * 1.075 = 110.41368.
    // Sources display 1.725214; demand groups full coefficients, then ceilings
    // at the target unit precision. Position display rounding is not an input.
    quantities: Object.freeze(["110.41368", "110.41368", "110.41368"]),
    parts: Object.freeze(Array.from({ length: 24 }, (_, index) =>
      ({ material: index % 3, quantity: "0.012345", loss_rate: "0.075" }))),
  }),
});

export async function prepareEngineeringPressureData({
  baseURL, databaseName, databaseURL, tokens, runID, poolSize, runtimeIdentity, dataScale = "baseline", signal, onProgress = () => {},
}) {
  const target = assertDisposableDatabaseTarget({ databaseName, databaseURL, profile: "capacity" });
  if (!Number.isSafeInteger(poolSize) || poolSize < 10 || poolSize > 1000) throw new Error("engineering pressure pool must contain 10-1000 orders");
  const scale = pressureDataScale(dataScale);
  baseURL = normalizePressureURL(baseURL);
  const fingerprint = engineeringDataFingerprint();
  if (fingerprint !== importedDataFingerprint) throw new Error("engineering data module changed after loading; restart and reseed required");
  await verifyPressureRuntime({ baseURL, databaseName, commit: runtimeIdentity?.commit, migration: runtimeIdentity?.migration, signal });
  const prefix = "SIM-PS-" + runID.replaceAll("_", "").slice(-12).toUpperCase();
  const startedAt = new Date().toISOString();
  async function rpc({ actor, domain, method, params = {} }) {
    signal?.throwIfAborted();
    const result = await pressureRPC({ signal, baseURL, domain, method, params: { customer_key: "yoyoosun", ...params }, token: tokens[actor] });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  const refs = { products: [], bomVersions: [], materials: [] };
  const units = (await rpc({ actor: "engineering", domain: "masterdata", method: "list_units", params: { limit: 100 } })).units;
  const productUnit = units?.find((unit) => unit.code === "EA" && unit.precision === 0);
  const materialUnit = units?.find((unit) => unit.code === "YD" && unit.precision === 6);
  if (!productUnit?.id || !materialUnit?.id) throw new Error("pressure requires canonical EA and six-decimal YD seed units");
  const customer = (await rpc({ actor: "admin", domain: "masterdata", method: "save_customer_with_contacts", params: {
    code: prefix + "-C", name: "压测模拟客户", contacts: [{ name: "模拟联系人", is_primary: true }],
  } })).customer;
  const suppliers = [];
  for (let index = 0; index < 2; index++) suppliers.push((await rpc({
    actor: "admin", domain: "masterdata", method: "save_supplier_with_contacts",
    params: { code: prefix + "-S-" + index, name: "压测模拟厂商" + index, default_payment_term_days: 0,
      contacts: [{ name: "模拟厂商联系人", is_primary: true }] },
  })).supplier);
  for (let index = 0; index < 3; index++) {
    const material = (await rpc({ actor: "admin", domain: "masterdata", method: "create_material", params: {
      code: prefix + "-M-" + index, name: "压测模拟面料" + index, category: "面料", stock_category: "MAIN",
      supplier_id: suppliers[index % 2].id, default_unit_id: materialUnit.id, supplier_item_no: "SIM-" + index,
      spec: "模拟规格", color: "模拟颜色",
    } })).material;
    refs.materials.push({ id: material.id, code: material.code, unitId: materialUnit.id, supplierId: suppliers[index % 2].id });
  }
  const products = {};
  for (const [kind, recipe] of Object.entries(ENGINEERING_RECIPES)) {
    const product = (await rpc({ actor: "admin", domain: "masterdata", method: "create_product", params: {
      code: prefix + "-P-" + kind.toUpperCase(), name: "压测模拟" + (kind === "ordinary" ? "普通" : "复杂") + "产品",
      default_unit_id: productUnit.id,
    } })).product;
    const sku = (await rpc({ actor: "admin", domain: "masterdata", method: "create_product_sku", params: {
      product_id: product.id, sku_code: product.code + "-SKU", sku_name: "模拟规格",
    } })).product_sku;
    let bom = (await rpc({ actor: "engineering", domain: "bom", method: "save_bom_with_items", params: {
      product_id: product.id, version: product.code + "-BOM", note: "隔离压测模拟数据",
      items: recipe.parts.map((part, index) => ({ material_id: refs.materials[part.material].id, unit_id: materialUnit.id,
        quantity: part.quantity, loss_rate: part.loss_rate, position: "模拟部位" + (index + 1) })),
    } })).bom_version;
    bom = (await rpc({ actor: "engineering", domain: "bom", method: "activate_bom_version", params: { id: bom.id } })).bom_version;
    products[kind] = { ...product, skuId: sku.id, bomId: bom.id };
    refs.products.push({ id: product.id, code: product.code });
    refs.bomVersions.push({ id: bom.id, productId: product.id, version: bom.version, status: bom.status });
  }
  const allOrders = [], totalOrders = poolSize + scale.historyOrders;
  for (let index = 0; index < totalOrders; index++) {
    const historical = index < scale.historyOrders;
    const ordinal = historical ? index : index - scale.historyOrders;
    const kind = ordinal % 3 === 0 ? "complex" : "ordinary", recipe = ENGINEERING_RECIPES[kind], product = products[kind];
    const orderNo = prefix + (historical ? "-H-" : "-W-") + String(ordinal + 1).padStart(4, "0");
    const item = (await rpc({ actor: "sales", domain: "sales_order", method: "save_sales_order_with_items", params: {
      order_no: orderNo, customer_id: customer.id, customer_snapshot: { name: customer.name },
      currency: "CNY", payment_method: "银行转账", payment_term_days: 0, tax_mode: "INCLUSIVE", tax_rate: "13",
      freight_terms: "INCLUDED", price_condition_note: "模拟含税含运费", order_date: Math.floor(Date.now() / 86400000) * 86400 - (historical ? (1 + ordinal % 20) * 36 * 86400 : 0), note: "隔离压测模拟订单",
      items: Array.from({ length: recipe.lines }, (_, line) => ({
        line_no: line + 1, product_id: product.id, product_sku_id: product.skuId, unit_id: productUnit.id,
        requested_product_name: product.name, customer_product_no: "SIM-STYLE-" + kind,
        product_code_snapshot: product.code, product_name_snapshot: product.name,
        ordered_quantity: recipe.ordered, pre_shipment_sample_quantity: recipe.samples,
        unit_price: "1", order_category: "NEW",
      })),
    } })).sales_order;
    await advanceSalesOrderLifecycleThroughProcess({
      plan: { backendURL: baseURL, runId: runID }, record: { order_no: orderNo, targetStatus: "ACTIVE" },
      item, token: tokens.sales, roleTokens: tokens, fetchImpl: (url, options) => fetch(url, { ...options, signal: signal ? AbortSignal.any([signal, ...(options?.signal ? [options.signal] : [])]) : options?.signal }), report: { steps: [] },
    });
    allOrders.push({ id: item.id, orderNo, kind, ...(historical ? { status: PRESSURE_HISTORY_STATES[ordinal % PRESSURE_HISTORY_STATES.length] } : {}) });
    if ((index + 1) % 20 === 0) onProgress({ step: "orders", completed: index + 1, total: totalOrders });
  }
  let confirmed = 0;
  // Reuse the preparation helper in chunks; each product image and BOM remains
  // unique and existing sources are read back on subsequent chunks.
  for (let offset = 0; offset < allOrders.length; offset += 20) {
    signal?.throwIfAborted();
    const chunk = allOrders.slice(offset, offset + 20);
    await prepareManualAcceptanceEngineering({
      plan: { prefix, productionCandidates: chunk.map((order) => ({ salesOrder: { id: order.id, orderNo: order.orderNo } })) },
      sourceReport: { referenceRecords: refs }, rpc, materialMode: "preview",
    });
    confirmed += chunk.length; onProgress({ step: "samples", completed: confirmed, total: totalOrders });
  }
  const historyOrders = allOrders.slice(0, scale.historyOrders), orders = allOrders.slice(scale.historyOrders);
  // Use the same adapter and independent checker as the timed scenario. Data
  // preparation deliberately ends at each requested real business state.
  const { createEngineeringPressureClient, prepareEngineeringHistoryOrder } = await import("./pressure-engineering-scenario.mjs");
  const client = createEngineeringPressureClient({ baseURL, tokens });
  const context = { references: refs, products };
  for (const [index, order] of historyOrders.entries()) {
    await prepareEngineeringHistoryOrder({ client, order, receipt: context, signal });
    if ((index + 1) % 20 === 0) onProgress({ step: "history", completed: index + 1, total: historyOrders.length });
  }
  const historyLedger = await readEngineeringPressureLedger(databaseURL, historyOrders);
  const expectedApproved = historyOrders.filter((order) => order.status === "APPROVED").length;
  if (historyLedger.orders !== historyOrders.length || historyLedger.requests !== historyOrders.filter((order) => order.status !== "PREVIEW").length ||
      historyLedger.approvedRequests !== expectedApproved || historyLedger.purchaseOrders !== expectedApproved * 2 ||
      historyLedger.purchaseItems !== expectedApproved * 3 || historyLedger.partialSupplierResults || historyLedger.invalidPurchaseLines || historyLedger.duplicateSupplierResults)
    throw new Error("engineering background data readback failed");
  const countOrders = (items) => ({ orders: items.length, ordinaryOrders: items.filter((item) => item.kind === "ordinary").length,
    complexOrders: items.filter((item) => item.kind === "complex").length,
    orderItems: items.reduce((sum, item) => sum + ENGINEERING_RECIPES[item.kind].lines, 0),
    demandSources: items.reduce((sum, item) => sum + ENGINEERING_RECIPES[item.kind].sources, 0) });
  if (fingerprint !== engineeringDataFingerprint()) throw new Error("engineering data logic changed during preparation; reseed required");
  return {
    schemaVersion: "plush-pressure-engineering-data/v1", datasetVersion: ENGINEERING_DATA_VERSION,
    status: "passed", simulatedOnly: true, databaseName, databaseRunIdentity: target.databaseRunIdentity,
    databaseTargetFingerprint: target.targetFingerprint, runtimeIdentity, dataLogicFingerprint: fingerprint,
    prefix, orders, historyOrders, dataScale, references: refs, products, startedAt, completedAt: new Date().toISOString(),
    counts: { ...countOrders(orders), products: 2, materials: 3, suppliers: 2 },
    history: { ...countOrders(historyOrders), requests: historyLedger.requests, purchaseOrders: historyLedger.purchaseOrders,
      purchaseItems: historyLedger.purchaseItems, approvedRequests: historyLedger.approvedRequests,
      states: Object.fromEntries([...new Set(PRESSURE_HISTORY_STATES)].map((status) => [status, historyOrders.filter((order) => order.status === status).length])) },
    totalOrders, complexity: Object.fromEntries(Object.entries(ENGINEERING_RECIPES).map(([key, recipe]) =>
      [key, { lines: recipe.lines, bomParts: recipe.parts.length, sources: recipe.sources }])),
    cleanup: "dispose owned database and attachment storage",
  };
}
