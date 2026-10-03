import assert from "node:assert/strict";
import test from "node:test";
import { ENGINEERING_RECIPES, engineeringDataFingerprint } from "./pressure-engineering-data.mjs";
import { checkEngineeringDemand, checkEngineeringPurchases, quantity6, assertEngineeringPressureReceipt,
  createEngineeringPressureClient, ENGINEERING_API, ENGINEERING_STATUS } from "./pressure-engineering-scenario.mjs";
import { engineeringPressurePoolSize } from "./engineering-pressure.mjs";
import { pressureLifecyclePlan } from "./pressure-isolated-lifecycle.mjs";

function fixture(kind = "ordinary") {
  const order = { id: 1, orderNo: "SIM-TEST-SO-1", kind };
  const references = { materials: [
    { id: 10, unitId: 6, supplierId: 7 }, { id: 11, unitId: 6, supplierId: 8 }, { id: 12, unitId: 6, supplierId: 7 },
  ] };
  const product = { id: 2, bomId: 3, skuId: 4 };
  const receipt = { products: { [kind]: product }, references };
  const recipe = ENGINEERING_RECIPES[kind];
  const request = { sales_order_id: 1, order_no: order.orderNo, source_hash: "a".repeat(64), source_order_version: 20,
    status: "APPROVED", issues: [], items: references.materials.map((item, index) => ({
      material_id: item.id, unit_id: item.unitId, supplier_id: item.supplierId, required_quantity: recipe.quantities[index],
    })),
    sources: Array.from({ length: recipe.lines }, (_, line) => recipe.parts.map((part, index) => ({
      sales_order_item_id: 100 + line, line_no: line + 1, bom_item_id: 200 + index, bom_id: 3, product_id: 2,
      material_id: references.materials[part.material].id, unit_id: 6, product_sku_id: 4, sample_image_attachment_id: 5,
      ordered_quantity: recipe.ordered, pre_shipment_sample_quantity: recipe.samples,
      unit_usage: part.quantity, loss_rate: part.loss_rate, position: "模拟部位" + (index + 1),
      production_quantity: kind === "ordinary" ? "1012" : "130", total_usage: kind === "ordinary" ? ["212.52", "33.396", "82.5792", "15.18"][index] : "1.725214",
    }))).flat(),
    purchase_orders: [
      { id: 21, supplier_id: 7, purchase_order_no: "PO-21" }, { id: 22, supplier_id: 8, purchase_order_no: "PO-22" },
    ],
  };
  const purchases = request.purchase_orders.map((po) => {
    const items = request.items.filter((item) => item.supplier_id === po.supplier_id).map((item) => ({
      purchase_order_id: po.id, material_id: item.material_id, unit_id: item.unit_id, purchased_quantity: item.required_quantity,
      product_order_no_snapshot: order.orderNo, unit_price: null, amount: null, expected_arrival_date: null,
    }));
    return { header: { id: po.id, purchase_order_no: po.purchase_order_no, supplier_id: po.supplier_id,
      lifecycle_status: ENGINEERING_STATUS.purchaseOrderApproved, expected_arrival_date: null }, items, total: items.length };
  });
  return { request, purchases, order, receipt };
}
test("ordinary and complex expected quantities use independent business examples", () => {
  for (const kind of ["ordinary", "complex"]) {
    const f = fixture(kind);
    assert.equal(checkEngineeringDemand(f.request, f.order, f.receipt), true);
    assert.equal(checkEngineeringPurchases(f.request, f.purchases, f.order, f.receipt), true);
  }
  assert.equal(quantity6("110.413680"), quantity6("110.41368"));
  for (const value of ["0.0000001", "NaN", "-1", 1, "1e2"]) assert.throws(() => quantity6(value));
});
test("missing, duplicate, wrong-unit, wrong-quantity and changed-BOM demand fails", () => {
  const mutations = [
    (f) => f.request.items.pop(), (f) => f.request.items[2] = f.request.items[0],
    (f) => f.request.items[0].unit_id++, (f) => f.request.items[0].required_quantity = "110.413696",
    (f) => f.request.sources[0].bom_id++, (f) => f.request.sources[1] = f.request.sources[0],
    (f) => f.request.issues.push("blocked"), (f) => f.request.sales_order_id++,
    (f) => f.request.sources[0].total_usage = "1.725213",
    (f) => f.request.sources[0].sales_order_item_id = null, (f) => f.request.sources[0].bom_item_id = null,
    (f) => f.request.sources[0].material_id++, (f) => f.request.sources[0].unit_id++,
    (f) => f.request.sources[0].line_no++, (f) => f.request.sources[0].unit_usage = "1",
    (f) => f.request.sources[0].loss_rate = "0", (f) => f.request.sources[0].pre_shipment_sample_quantity = "0",
    (f) => f.request.sources[0].product_sku_id++, (f) => f.request.sources[0].sample_image_attachment_id = null,
    (f) => f.request.sources[0].position = "模拟部位0",
  ];
  for (const mutate of mutations) {
    const f = fixture("complex"); mutate(f);
    assert.throws(() => checkEngineeringDemand(f.request, f.order, f.receipt));
  }
});
test("supplier grouping, frozen quantity, source, null pricing and complete pagination are checked", () => {
  const mutations = [
    (f) => f.purchases[0].header.supplier_id++, (f) => f.purchases[0].items[0].unit_price = "0",
    (f) => f.purchases[0].items[0].amount = "1", (f) => f.purchases[0].items[0].expected_arrival_date = 0,
    (f) => f.purchases[0].items[0].purchased_quantity = "1",
    (f) => f.purchases[0].items[0].product_order_no_snapshot = "SIM-OTHER",
    (f) => f.purchases[0].total++, (f) => f.purchases[0].items[1] = f.purchases[0].items[0],
    (f) => f.purchases[0].header.expected_arrival_date = 1, (f) => f.request.purchase_orders[1].id = 21,
    (f) => f.purchases[0].header.lifecycle_status = "APPROVED",
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.throws(() => checkEngineeringPurchases(f.request, f.purchases, f.order, f.receipt));
  }
});
test("API adapter centralizes actors/actions and never fabricates an unsupported idempotency key", async () => {
  const client = createEngineeringPressureClient({ baseURL: "http://127.0.0.1:1", tokens: { finance: "fixture-finance" } });
  const result = await client.call("finance", { id: 1, expected_version: 2 }, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.method, ENGINEERING_API.finance.method);
      assert.equal(body.params.action, "FINANCE_APPROVE");
      assert.equal(body.params.idempotency_key, undefined);
      assert.equal(options.headers.authorization, "Bearer fixture-finance");
      return new Response(JSON.stringify({ result: { code: 0, data: { status: "APPROVED" } } }));
    },
  });
  assert.equal(result.ok, true);
});
test("a logic mismatch or wrong target blocks reuse of old data", () => {
  const target = { databaseName: "plush_erp_capacity_test", targetFingerprint: "b".repeat(64) };
  const receipt = { status: "passed", simulatedOnly: true, databaseName: target.databaseName,
    databaseTargetFingerprint: target.targetFingerprint, dataLogicFingerprint: engineeringDataFingerprint(),
    orders: Array.from({ length: 10 }, (_, id) => ({ id })) };
  assert.doesNotThrow(() => assertEngineeringPressureReceipt(receipt, target));
  assert.throws(() => assertEngineeringPressureReceipt({ ...receipt, dataLogicFingerprint: "old" }, target), /reseed/u);
  assert.throws(() => assertEngineeringPressureReceipt({ ...receipt, databaseName: "plush_erp" }, target));
});
test("sustained load preparation reserves a distinct order for every possible flow", () => {
  assert.equal(engineeringPressurePoolSize("capacity"), 262);
  assert.equal(engineeringPressurePoolSize("quick"), 42);
  assert.equal(pressureLifecyclePlan().mainDurationMs, 600000);
  assert.equal(pressureLifecyclePlan("quick").poolSize, 42);
  assert.throws(() => pressureLifecyclePlan("production"));
});
