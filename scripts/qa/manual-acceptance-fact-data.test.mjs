import assert from "node:assert/strict";
import test from "node:test";

import {
  MANUAL_ACCEPTANCE_FACT_APPLY_RETIRED_MESSAGE,
  applyManualAcceptanceFactPlan,
  buildManualAcceptanceFactPlan,
  parseManualAcceptanceFactArgs,
} from "./manual-acceptance-fact-data.mjs";

function sourceReport({ skuCount = 54 } = {}) {
  const list = (count, prefix) =>
    Array.from({ length: count }, (_, offset) => ({
      code: `${prefix}-${offset + 1}`,
      id: offset + 1,
      name: `【试用】${prefix} ${offset + 1}`,
    }));
  const customers = list(55, "C");
  const skus = Array.from({ length: skuCount }, (_, offset) => ({
    code: `SKU-${offset + 1}`,
    id: 1000 + offset,
    productCode: `P-${(offset % 18) + 1}`,
    productId: (offset % 18) + 1,
  }));
  return {
    mode: "apply",
    simulatedOnly: true,
    realCustomerImport: false,
    runId: "LOCAL-UAT",
    prefix: "SIM-YOYOOSUN-UAT-LOCAL-UAT",
    backendURL: "http://127.0.0.1:8300",
    scale: {
      customers: 60,
      suppliers: 60,
      materials: 80,
      products: 20,
      skusPerProduct: 3,
      processes: 30,
      salesOrders: 45,
      purchaseOrders: 45,
      outsourcingOrders: 45,
      bomVersions: 45,
    },
    referenceRecords: {
      unit: { id: 101, code: "PCS", name: "个" },
      warehouse: { id: 201, code: "FG", name: "成品仓" },
      warehouses: [
        { id: 201, code: "FG", name: "成品仓" },
        { id: 202, code: "RM", name: "材料仓" },
        { id: 203, code: "WIP", name: "在制仓" },
        { id: 204, code: "SAMPLE", name: "样品仓" },
      ],
      customers,
      suppliers: list(55, "S"),
      materials: list(74, "M"),
      products: list(18, "P"),
      skus,
      processes: list(27, "PROC"),
      salesOrders: [
        {
          id: 501,
          orderNo: "SO-RICH",
          customerId: customers[0].id,
          customerName: customers[0].name,
          items: skus.slice(0, 25).map((item, offset) => ({
            salesOrderItemId: 5000 + offset,
            productId: item.productId,
            productSkuId: item.id,
            quantity: "1",
          })),
        },
      ],
    },
  };
}

test("fact plan creates enough linked data for every fact list page", () => {
  const plan = buildManualAcceptanceFactPlan(sourceReport(), {
    runId: "LOCAL-UAT-FACTS",
  });

  assert.equal(plan.simulatedOnly, true);
  assert.equal(plan.realCustomerImport, false);
  assert.equal(plan.directSQL, false);
  assert.equal(plan.applySupported, false);
  assert.equal(
    plan.applyRetiredReason,
    MANUAL_ACCEPTANCE_FACT_APPLY_RETIRED_MESSAGE,
  );
  assert.deepEqual(plan.requiredApplyInputs, []);
  assert.equal(plan.operational.length, 45);
  assert.equal(plan.purchaseQuality.length, 9);
  assert.equal(plan.expectedMinimums.production, 45);
  assert.equal(plan.expectedMinimums.inventoryBalances, 45);
  assert.equal(plan.expectedMinimums.payables, 45);
  assert.equal(plan.expectedMinimums.purchaseReceipts, 54);
  assert.equal(plan.expectedMinimums.qualityInspections, 63);

  assert.equal(
    new Set(plan.operational.map((item) => item.ids.productSkuId)).size,
    45,
  );
  assert.equal(
    new Set(plan.operational.map((item) => item.ids.warehouseId)).size,
    4,
  );
  assert.equal(plan.operational.at(-1).records.shipmentItems.length, 25);
  assert.equal(plan.operational.at(-1).records.shipment.sales_order_id, 501);
  assert.equal(
    plan.operational.at(-1).records.stockReservationRelease.sales_order_item_id,
    5000,
  );
  assert.equal(
    plan.operational.at(-1).records.shipmentItems[0].sales_order_item_id,
    5000,
  );
  assert.equal(
    plan.operational.at(-1).ids.productSkuId,
    plan.operational.at(-1).records.shipmentItems[0].product_sku_id,
  );
  assert.deepEqual(
    [
      ...new Set(
        plan.operational.map(
          (item) => item.records.financePayable.target_status,
        ),
      ),
    ].sort(),
    ["CANCELLED", "DRAFT", "POSTED", "SETTLED"],
  );
  for (const recordKey of [
    "financeReconciliation",
    "financeSettle",
    "financeCancel",
  ]) {
    assert.deepEqual(
      [
        ...new Set(
          plan.operational.map((item) => item.records[recordKey].target_status),
        ),
      ].sort(),
      ["CANCELLED", "DRAFT", "POSTED", "SETTLED"],
    );
  }
  assert.ok(
    plan.operational.every(
      (item) => item.records.financePayable.fact_type === "PAYABLE",
    ),
  );
  assert.match(
    plan.operational[0].records.shipment.customer_snapshot,
    /^【试用】C/u,
  );
  assert.match(
    plan.operational[0].records.outsourcingIssue.supplier_name,
    /^【试用】S/u,
  );
  assert.match(plan.purchaseQuality[0].names.material, /^【试用】M/u);
  const stockedMaterialIds = new Set(
    plan.purchaseQuality.map((item) => item.ids.materialId),
  );
  const stockedMaterialLocations = new Set(
    plan.purchaseQuality.map(
      (item) => `${item.ids.materialId}:${item.ids.warehouseId}`,
    ),
  );
  assert.ok(
    plan.operational.every((item) =>
      stockedMaterialIds.has(item.records.outsourcingIssue.subject_id),
    ),
  );
  assert.ok(
    plan.operational.every(
      (item) =>
        item.records.outsourcingIssue.subject_type === "MATERIAL" &&
        item.records.outsourcingIssue.product_sku_id === undefined &&
        stockedMaterialLocations.has(
          `${item.ids.materialId}:${item.ids.warehouseId}`,
        ),
    ),
  );
  const warehouseBySkuId = new Map(
    plan.operational.map((item) => [
      item.ids.productSkuId,
      item.ids.warehouseId,
    ]),
  );
  for (const shipmentItem of plan.operational.at(-1).records.shipmentItems) {
    assert.equal(
      shipmentItem.warehouse_id,
      warehouseBySkuId.get(shipmentItem.product_sku_id),
    );
  }
  for (const item of plan.operational) {
    const sample = item.records.productionDraftSample;
    if (sample.fact_type === "MATERIAL_ISSUE") {
      assert.equal(sample.subject_type, "MATERIAL");
      assert.equal(sample.product_sku_id, undefined);
    } else {
      assert.equal(sample.subject_type, "PRODUCT");
      assert.equal(sample.product_sku_id, item.ids.productSkuId);
    }
  }
  assert.deepEqual(
    [
      ...new Set(
        plan.operational.map(
          (item) => item.records.productionDraftSample.fact_type,
        ),
      ),
    ].sort(),
    ["FINISHED_GOODS_RECEIPT", "MATERIAL_ISSUE", "REWORK"],
  );
  assert.deepEqual(
    [
      ...new Set(
        plan.operational.map((item) => item.records.financeSettle.payment_term),
      ),
    ].sort(),
    ["CASH_ON_SHIPMENT", "EOM_30", "EOM_45"],
  );
  assert.equal(
    new Set(
      plan.operational.map(
        (item) => item.records.financeCancel.invoice_category,
      ),
    ).size,
    5,
  );
});

test("fact plan refuses missing source references and external targets", () => {
  assert.throws(
    () =>
      buildManualAcceptanceFactPlan(sourceReport({ skuCount: 20 }), {
        runId: "TOO-FEW",
        operationalRuns: 45,
      }),
    /active SKUs, need 45/u,
  );
  assert.throws(
    () =>
      buildManualAcceptanceFactPlan(sourceReport(), {
        runId: "EXTERNAL",
        backendURL: "https://example.invalid",
      }),
    /refuse external backend/u,
  );
  const singleWarehouse = sourceReport();
  singleWarehouse.referenceRecords.warehouses = [
    singleWarehouse.referenceRecords.warehouse,
  ];
  assert.throws(
    () =>
      buildManualAcceptanceFactPlan(singleWarehouse, {
        runId: "ONE-WAREHOUSE",
      }),
    /at least four distinct active warehouses/u,
  );
});

test("fact CLI parses explicit scale without enabling writes by default", () => {
  const parsed = parseManualAcceptanceFactArgs([
    "--source-report",
    "output/source.json",
    "--run-id",
    "LOCAL-UAT-FACTS",
    "--operational-runs",
    "45",
    "--purchase-quality-runs",
    "9",
    "--json",
  ]);
  assert.equal(parsed.apply, false);
  assert.equal(parsed.operationalRuns, 45);
  assert.equal(parsed.purchaseQualityRuns, 9);
  assert.equal(parsed.json, true);
});

test("fact apply is retired before reading plans, reports, credentials, or dependencies", async () => {
  const report = sourceReport();
  const plan = buildManualAcceptanceFactPlan(report, { runId: "RETIRED" });
  let dependencyCalls = 0;
  await assert.rejects(
    () =>
      applyManualAcceptanceFactPlan(
        new Proxy(plan, {
          get() {
            dependencyCalls += 1;
            throw new Error("plan must not be read");
          },
        }),
        new Proxy(report, {
          get() {
            dependencyCalls += 1;
            throw new Error("source report must not be read");
          },
        }),
        {
          fetchImpl: async () => {
            dependencyCalls += 1;
            throw new Error("network must not run");
          },
        },
      ),
    new RegExp(MANUAL_ACCEPTANCE_FACT_APPLY_RETIRED_MESSAGE, "u"),
  );
  assert.equal(dependencyCalls, 0);
});

test("fact CLI parser rejects apply before a source report can be read", () => {
  assert.throws(
    () =>
      parseManualAcceptanceFactArgs([
        "--apply",
        "--source-report",
        "/path/that/must/not/be/read.json",
      ]),
    new RegExp(MANUAL_ACCEPTANCE_FACT_APPLY_RETIRED_MESSAGE, "u"),
  );
});
