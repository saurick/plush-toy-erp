import assert from "node:assert/strict";
import test from "node:test";

import {
  assertManualAcceptanceExceptionChainCoverage,
  ensureInventoryAdjustmentChain,
  ensurePurchaseDispositionChain,
} from "./manual-acceptance-exception-chain-data.mjs";
import { exceptionChainFixture } from "./test-fixtures/manual-acceptance-exception-chains.mjs";

test("exception chain evidence requires task, source, fact and reversal readbacks", () => {
  assert.equal(
    assertManualAcceptanceExceptionChainCoverage(exceptionChainFixture()),
    true,
  );
  const mutations = [
    (data) => {
      delete data.inventoryAdjustment;
    },
    (data) => {
      data.inventoryAdjustment.records[0].status = "APPROVED";
    },
    (data) => {
      data.inventoryAdjustment.txns[2].reversal_of_txn_id = 999;
    },
    (data) => {
      data.inventoryAdjustment.txns[0].lot_id = 999;
    },
    (data) => {
      data.inventoryAdjustment.processes[0].nodes.at(-1).status = "active";
    },
    (data) => {
      data.inventoryAdjustment.tasks[0].task_status_key = "ready";
    },
    (data) => {
      data.purchaseDisposition.sourceReceipts[0].status = "POSTED";
    },
    (data) => {
      data.purchaseDisposition.replacementInspections[0].status = "SUBMITTED";
    },
    (data) => {
      data.productionException.records[0].quality_inspection_id = 999;
    },
    (data) => {
      data.productionException.records[1].execution_status = "PENDING";
    },
    (data) => {
      data.productionException.batch.status = "CANCELLED";
    },
    (data) => {
      data.outsourcingDisposition.reworkBatch.source_batch_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.allocation.production_wip_batch_id = 999;
    },
    (data) => {
      data.outsourcingDisposition.txns.pop();
    },
  ];
  for (const mutate of mutations) {
    const data = exceptionChainFixture();
    mutate(data);
    assert.throws(() => assertManualAcceptanceExceptionChainCoverage(data));
  }
});

test("verify mode refuses missing specimens without calling a write endpoint", async () => {
  const calls = [];
  const rpc = async ({ method }) => {
    calls.push(method);
    assert.match(method, /^list_/u);
    return {
      inventory_operations: [],
      purchase_rejection_dispositions: [],
      total: 0,
    };
  };
  const plan = { dataVersion: "2026.09.27-v8" };
  const receipt = {
    id: 1,
    status: "POSTED",
    items: [{ id: 3, material_id: 4, unit_id: 5, warehouse_id: 2, lot_id: 6 }],
  };
  await assert.rejects(
    ensureInventoryAdjustmentChain({
      rpc,
      plan,
      purchase: { purchaseReceipts: [receipt] },
      apply: false,
    }),
    /is missing/u,
  );
  receipt.status = "DRAFT";
  const rejected = [1, 2, 3].map((id) => ({
    id,
    source_type: "PURCHASE_RECEIPT",
    status: "REJECTED",
    purchase_receipt_id: 1,
    purchase_receipt_item_id: 3,
  }));
  await assert.rejects(
    ensurePurchaseDispositionChain({
      rpc,
      plan,
      purchase: { purchaseReceipts: [receipt], qualityInspections: rejected },
      apply: false,
    }),
    /is missing/u,
  );
  assert.equal(calls.length, 2);
});
