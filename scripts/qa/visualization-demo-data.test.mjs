import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  VISUALIZATION_DEMO_RPC_METHODS,
  buildVisualizationDemoPlan,
} from "./visualization-demo-data.mjs";

function sourceReport() {
  const products = Array.from({ length: 5 }, (_, offset) => ({
    id: 100 + offset,
    code: `YS7-CP-${offset + 1}`,
    name: `模拟产品 ${offset + 1}`,
    unitId: 200 + offset,
  }));
  const skus = products.map((product, offset) => ({
    id: 300 + offset,
    code: `YS7-GG-${offset + 1}`,
    name: `规格 ${offset + 1}`,
    productId: product.id,
  }));
  const materials = Array.from({ length: 5 }, (_, offset) => ({
    id: 400 + offset,
    code: `YS7-WL-${offset + 1}`,
    name: `模拟材料 ${offset + 1}`,
    unitId: 500 + offset,
  }));
  return {
    datasetKey: "yoyoosun-manual-acceptance",
    dataVersion: "2026.09.16-v7",
    runId: "20260916-V7",
    target: "scenario-demo",
    mode: "apply",
    referenceRecords: {
      customers: [{ id: 1, code: "YS7-KH-1", name: "模拟客户" }],
      suppliers: [{ id: 2, code: "YS7-GYS-1", name: "模拟供应商" }],
      products,
      skus,
      materials,
      sourceDrivenFacts: {
        sourceCandidates: {
          productionCandidates: products.map((product, offset) => ({
            item: {
              productId: product.id,
              productSkuId: skus[offset].id,
              unitId: product.unitId,
            },
            bom: { id: 600 + offset, status: "ACTIVE", items: [{}] },
          })),
        },
      },
    },
  };
}

test("visualization plan provides compact risk matrices and a five-line routed order", () => {
  const plan = buildVisualizationDemoPlan(sourceReport(), {
    anchorDate: "2026-09-22",
  });
  assert.equal(plan.runId, "VIS-20260922");
  assert.equal(plan.visiblePrefix, "VIS-260922");
  assert.equal(plan.records.salesOrders.length, 5);
  assert.equal(plan.records.purchaseOrders.length, 5);
  assert.equal(plan.records.productionOrders.length, 7);
  assert.deepEqual(
    plan.records.salesOrders.map((item) => item.key),
    ["overdue", "today", "dueSoon", "future", "unscheduled"],
  );
  assert.deepEqual(
    plan.records.purchaseOrders.map((item) => item.key),
    ["overdue", "today", "dueSoonConfirmed", "future", "unscheduled"],
  );
  const routed = plan.records.productionOrders.find((item) => item.routed);
  assert.equal(routed.params.items.length, 5);
  assert(
    routed.params.items.every(
      (item) => item.route_code === "PLUSH_SEW_HAND_V1",
    ),
  );
  assert(routed.params.items.every((item) => item.bom_header_id > 0));
  assert.equal(plan.directDatabaseWrite, false);
  assert.equal(plan.frontendFixture, false);
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/u);
  assert.equal(
    plan.expectedConfirmation,
    `APPLY_VISUALIZATION_DEMO:scenario-demo:VIS-20260922:${plan.planDigest}`,
  );
});

test("visualization writer stays on the declared formal server API surface", async () => {
  assert(
    VISUALIZATION_DEMO_RPC_METHODS.includes(
      "sales_order.save_sales_order_with_items",
    ),
  );
  assert(
    VISUALIZATION_DEMO_RPC_METHODS.includes(
      "production_order.create_production_order",
    ),
  );
  assert(
    VISUALIZATION_DEMO_RPC_METHODS.includes(
      "production_wip.get_production_wip",
    ),
  );
  const source = await readFile(
    new URL("./visualization-demo-data.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+(?:FROM|INTO|[a-z_])/iu,
  );
  assert.doesNotMatch(source, /web\/src|frontendFixture:\s*true/u);
});
