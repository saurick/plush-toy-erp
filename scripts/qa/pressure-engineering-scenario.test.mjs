import assert from "node:assert/strict";
import { DEFAULT_PRESSURE_LIMITS } from "./pressure-runtime.mjs";
import test from "node:test";
import { ENGINEERING_RECIPES, engineeringDataFingerprint } from "./pressure-engineering-data.mjs";
import { checkEngineeringDemand, checkEngineeringPurchases, quantity6, assertEngineeringPressureReceipt,
  createEngineeringPressureClient, ENGINEERING_API, ENGINEERING_STATUS, checkSalesOrderExportSnapshot, createSalesOrderPageProbe, runEngineeringCompetition } from "./pressure-engineering-scenario.mjs";
import { RpcErrorCode } from "../../web/src/common/consts/errorCodes.generated.js";
import { SalesOrderExportPolicy } from "../../web/src/common/consts/policies.generated.mjs";
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

function pageFixture(total = 762) {
  const orders = Array.from({ length: total }, (_, index) => ({ id: index + 1, orderNo: `SIM-PAGE-${index}`, kind: index % 3 ? "ordinary" : "complex", orderDate: 1700000000 + index % 20 }));
  const receipt = { prefix: "SIM-PAGE", totalOrders: total, historyOrders: orders.slice(0, 500), orders: orders.slice(500) };
  const rows = [...orders].sort((a, b) => a.orderDate - b.orderDate || b.id - a.id).map((order) => ({
    id: order.id, order_no: order.orderNo, order_date: order.orderDate, lifecycle_status: "active", item_count: ENGINEERING_RECIPES[order.kind].lines,
  }));
  return { receipt, response: (params) => ({ sales_orders: rows.slice(params.offset, params.offset + params.limit), total, limit: params.limit, offset: params.offset }) };
}
test("pagination alternates full and tail pages independently of mixed read strides and records distinct latency", () => {
  const f = pageFixture(), probe = createSalesOrderPageProbe(f.receipt), offsets = [];
  for (let index = 1; index < 100; index += 6) {
    const page = probe.next(); offsets.push(page.params.offset);
    assert.equal(page.params.sort_by, "order_date"); assert.equal(page.params.keyword, f.receipt.prefix);
    assert.equal(page.validate(f.response(page.params)), true);
    page.observe({ ok: true, durationMs: page.params.offset === 0 ? 80 : 30 });
  }
  assert.deepEqual(offsets.slice(0, 4), [0, 500, 0, 500]);
  const result = probe.summarize(1000, DEFAULT_PRESSURE_LIMITS);
  assert.equal(result.accepted, true); assert.equal(result.minPageSamples, 8);
  assert.equal(result.full.successes, 9); assert.equal(result.tail.successes, 8);
  assert.equal(result.full.successfulLatencyMs.p99, 80); assert.equal(result.tail.successfulLatencyMs.p99, 30);
  assert.equal(JSON.stringify(result).includes("SIM-PAGE"), false);
});
test("paginated reads reject truncation, wrong totals or offsets, duplicate or misplaced rows and stale fields", () => {
  const f = pageFixture();
  for (const mutate of [
    (d) => d.sales_orders.pop(), (d) => d.sales_orders.splice(50), (d) => d.total--,
    (d) => d.limit = 50, (d) => d.offset = 500, (d) => d.sales_orders[1] = d.sales_orders[0],
    (d) => d.sales_orders.reverse(), (d) => d.sales_orders[0].id++, (d) => d.sales_orders[0].order_date++,
    (d) => d.sales_orders[0].item_count++, (d) => d.sales_orders[0].order_no = "OUTSIDE", (d) => d.sales_orders[0].lifecycle_status = "draft",
  ]) {
    const page = createSalesOrderPageProbe(f.receipt).next(), bad = structuredClone(f.response(page.params));
    mutate(bad);
    assert.throws(() => page.validate(bad), (error) => error.errorClass === "consistency_mismatch");
  }
  const probe = createSalesOrderPageProbe(f.receipt);
  const first = probe.next(), tail = probe.next();
  assert.throws(() => tail.validate(f.response(first.params)), /mismatch/u);
  first.observe({ ok: true, durationMs: 10 });
  tail.observe({ ok: false, durationMs: 10, errorClass: "invalid_result" });
  assert.equal(probe.summarize(1000, DEFAULT_PRESSURE_LIMITS).accepted, false);
  const small = pageFixture(362), short = createSalesOrderPageProbe(small.receipt);
  for (let i = 0; i < 5; i++) { const page = short.next(); page.validate(small.response(page.params)); page.observe({ ok: true, durationMs: 10 }); }
  assert.equal(short.summarize(1000, DEFAULT_PRESSURE_LIMITS).full.successes, 0);
  const missingDate = structuredClone(f.receipt); delete missingDate.orders[0].orderDate;
  assert.throws(() => createSalesOrderPageProbe(missingDate), /page_receipt/u);
});
test("pagination cannot pass when a page is undersampled or only full-page latency exceeds its limit", () => {
  const f = pageFixture(), probe = createSalesOrderPageProbe(f.receipt);
  for (let i = 0; i < 9; i++) probe.next().observe({ ok: true, durationMs: 10 });
  assert.equal(probe.summarize(1000, DEFAULT_PRESSURE_LIMITS).accepted, false);
  const slow = createSalesOrderPageProbe(f.receipt);
  for (let i = 0; i < 100; i++) slow.next().observe({ ok: true, durationMs: i % 2 ? 10 : 2100 });
  assert.equal(slow.summarize(1000, DEFAULT_PRESSURE_LIMITS).accepted, false);
});

test("complete exports reconcile every historical and working order with stable date ordering", () => {
  const orders = Array.from({ length: 401 }, (_, index) => ({ id: index + 1, orderNo: `SO-EXPORT-${index + 1}`, kind: index % 2 ? "ordinary" : "complex" }));
  const receipt = { historyOrders: orders.slice(0, 300), orders: orders.slice(300) };
  const rows = [...orders].reverse().map((order) => ({ id: order.id, order_no: order.orderNo, item_count: ENGINEERING_RECIPES[order.kind].lines,
    lifecycle_status: ENGINEERING_STATUS.salesOrderActive, order_date: 1700000000 }));
  const data = { sales_orders: rows, total: rows.length };
  assert.equal(checkSalesOrderExportSnapshot(data, receipt), true);
  for (const mutate of [
    (d) => d.sales_orders.pop(), (d) => d.total--,
    (d) => { d.sales_orders[1] = d.sales_orders[0]; },
    (d) => { d.sales_orders[0].id = 9000; },
    (d) => { d.sales_orders[0].order_no = "OTHER-SCOPE"; },
    (d) => { d.sales_orders[0].item_count++; },
    (d) => { d.sales_orders[0].lifecycle_status = "draft"; },
    (d) => { d.sales_orders.reverse(); },
    (d) => { d.sales_orders[0].order_date++; },
    (d) => { d.sales_orders[0].note = "中".repeat(SalesOrderExportPolicy.maxBytes / 3 + 1); },
  ]) {
    const bad = structuredClone(data); mutate(bad);
    assert.throws(() => checkSalesOrderExportSnapshot(bad, receipt), (error) => error.errorClass === "consistency_mismatch");
  }
  assert.equal(checkSalesOrderExportSnapshot({ sales_orders: [], total: 0 }, { orders: [], historyOrders: [] }), true);
});

test("export pressure calls preserve the strict parameter contract and sales identity", async () => {
  const requests = [];
  const client = createEngineeringPressureClient({ baseURL: "http://127.0.0.1:8300", tokens: { sales: "synthetic-sales-token" } });
  const result = await client.call("export", { keyword: "SCOPE", lifecycle_scope: "all", sort_by: "order_date", sort_direction: "asc" }, {
    fetchImpl: async (_url, options) => {
      requests.push({ ...JSON.parse(options.body), authorization: options.headers.authorization });
      return new Response(JSON.stringify({ result: { code: 0, data: { sales_orders: [], total: 0 } } }));
    },
  });
  assert.equal(result.ok, true);
  assert.equal(requests[0].method, "export_sales_orders");
  assert.equal(requests[0].authorization, "Bearer synthetic-sales-token");
  assert.deepEqual(requests[0].params, { keyword: "SCOPE", lifecycle_scope: "all", sort_by: "order_date", sort_direction: "asc" });
});

test("document reads do not inherit engineering command parameters", async () => {
  const seen = [];
  const client = createEngineeringPressureClient({ baseURL: "http://127.0.0.1:8300", tokens: { sales: "fixture", engineering: "fixture", purchase: "fixture" } });
  const inputs = { order: { id: 7 }, orders: { limit: 50 }, bom: { id: 7 }, purchase: { id: 7 }, purchaseItems: { purchase_order_id: 7, limit: 200 } };
  for (const [operation, params] of Object.entries(inputs)) {
    await client.call(operation, params, { fetchImpl: async (_url, options) => {
      seen.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ result: { code: 0, data: {} } }));
    } });
  }
  assert.equal(seen.length, 5);
  assert.deepEqual(seen.map((call) => call.params), Object.values(inputs));
});
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
test("competition distinguishes version conflicts, wrong stages and permission denials without accepting stale or successful rejections", async () => {
  const reachedBossCompetition = new Error("preflight completed");
  const rejected = (code) => ({ ok: false, code });
  const run = (overrides = {}) => {
    const f = fixture(), submitted = { ...f.request, id: 1, version: 1, status: "SUBMITTED", purchase_orders: [] };
    let reads = 0, submits = 0;
    const client = {
      async requireCall(operation, _params, options = {}) {
        assert.equal(operation, "preview");
        const data = { ...submitted, status: reads++ === 0 ? "PREVIEW" : "SUBMITTED" };
        if (options.validate) assert.equal(options.validate(data), true);
        return structuredClone(data);
      },
      async call(operation, params, options = {}) {
        if (operation === "submit") return submits++ === 0 ? { ok: true, data: { id: 1 } }
          : rejected(overrides.submitCode ?? RpcErrorCode.RESOURCE_CONFLICT);
        if (operation === "boss" && params.expected_version === 2)
          return overrides.version ?? rejected(RpcErrorCode.RESOURCE_CONFLICT);
        if (operation === "finance") return options.actor === "engineering"
          ? overrides.permission ?? rejected(RpcErrorCode.PERMISSION_DENIED)
          : overrides.stage ?? rejected(RpcErrorCode.INVALID_PARAM);
        assert.equal(operation, "boss");
        throw reachedBossCompetition;
      },
    };
    return runEngineeringCompetition({ client, receipt: { ...f.receipt, orders: [f.order] } });
  };
  await assert.rejects(run(), (error) => error === reachedBossCompetition);
  for (const [overrides, check] of [
    [{ submitCode: RpcErrorCode.INVALID_PARAM }, "submit_competition_unexpected_error"],
    [{ version: rejected(RpcErrorCode.INVALID_PARAM) }, "version_mismatch_rejection"],
    [{ version: { ok: true, code: 0 } }, "version_mismatch_rejection"],
    [{ stage: rejected(RpcErrorCode.RESOURCE_CONFLICT) }, "wrong_stage_rejection"],
    [{ stage: { ok: true, code: 0 } }, "wrong_stage_rejection"],
    [{ permission: rejected(RpcErrorCode.INVALID_PARAM) }, "permission_rejection"],
    [{ permission: { ok: true, code: 0 } }, "permission_rejection"],
  ]) await assert.rejects(run(overrides), (error) => error.check === check);
});
test("a logic mismatch or wrong target blocks reuse of old data", () => {
  const target = { databaseName: "plush_erp_capacity_test", targetFingerprint: "b".repeat(64) };
  const receipt = { status: "passed", simulatedOnly: true, databaseName: target.databaseName,
    databaseTargetFingerprint: target.targetFingerprint, dataLogicFingerprint: engineeringDataFingerprint(),
    dataScale: "baseline", totalOrders: 30, historyOrders: Array.from({ length: 20 }, (_, i) => ({ id: 100 + i })),
    orders: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })) };
  assert.doesNotThrow(() => assertEngineeringPressureReceipt(receipt, target));
  assert.throws(() => assertEngineeringPressureReceipt({ ...receipt, historyOrders: [...receipt.historyOrders.slice(0, 19), receipt.orders[0]] }, target), /overlap/u);
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
