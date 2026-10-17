import assert from "node:assert/strict";
import test from "node:test";

import {
  assertManualAcceptanceExceptionChainCoverage,
  ensureInventoryAdjustmentChain,
  ensurePurchaseDispositionChain,
  ensureOutsourcingDispositionChain,
} from "./manual-acceptance-exception-chain-data.mjs";
import {
  manualAcceptanceFactRPCCall,
  manualAcceptanceFactRPCParams,
} from "./manual-acceptance-fact-data.mjs";
import { manualAcceptanceBusinessNo } from "./manual-acceptance-source-driven-facts.mjs";
import { exceptionChainFixture } from "./test-fixtures/manual-acceptance-exception-chains.mjs";

test("exception outsourcing readbacks use the fact transport strict document params", async () => {
  const plan = {
    dataVersion: "2026.09.27-v8",
    anchorDate: "2026-10-18T00:00:00Z",
    outsourcingCandidates: [{ issue: { order: { id: 501 } } }],
  };
  const requests = [];
  const stopAfterReadback = new Error("second outsourcing readback captured");
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const domain = new URL(url).pathname.split("/").at(-1);
    const { method, params } = body;
    requests.push({ domain, method, params });
    let data;
    switch (method) {
      case "list_production_facts":
        data = {
          production_facts: [{
            id: 44,
            fact_no: manualAcceptanceBusinessNo({
              dataVersion: plan.dataVersion,
              code: "FG",
              sequence: 982,
            }),
            fact_type: "REWORK",
            source_type: "PRODUCTION_FACT",
            source_id: 90,
            quantity: "1",
            status: "POSTED",
          }],
          total: 1,
        };
        break;
      case "get_production_order":
        data = {
          production_order: { id: 101, order_no: "MO-101", status: "RELEASED" },
          production_order_items: [{ id: 201 }],
        };
        break;
      case "get_production_wip":
        data = {
          production_wip_batches: [{
            id: 401,
            origin_rework_fact_id: 44,
            production_order_item_id: 201,
            version: 1,
            quantity: "1",
          }],
        };
        break;
      case "get_outsourcing_order":
        assert.deepEqual(params, {
          id: requests.filter((request) => request.method === method).length === 1
            ? 501
            : 502,
        });
        if (params.id === 502) throw stopAfterReadback;
        data = { outsourcing_order: { id: 501, supplier_id: 9 } };
        break;
      case "list_outsourcing_orders":
        data = { outsourcing_orders: [], total: 0 };
        break;
      case "prepare_production_outsourcing_order":
        assert.equal(Object.hasOwn(params, "customer_key"), false);
        data = { outsourcing_order_id: 502 };
        break;
      default:
        throw new Error(`unexpected ${domain}.${method}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: { code: 0, data } }),
    };
  };
  const rpc = ({ domain, method, params }) =>
    manualAcceptanceFactRPCCall({
      backendURL: "http://127.0.0.1:8310",
      domain,
      method,
      params: manualAcceptanceFactRPCParams(domain, method, params),
      fetchImpl,
    });
  await assert.rejects(
    ensureOutsourcingDispositionChain({
      rpc,
      plan,
      production: [null, null, null, { order: { id: 101 }, completion: { id: 90 } }],
      apply: true,
    }),
    (error) => error === stopAfterReadback,
  );
  assert.deepEqual(
    requests.filter((request) => request.method === "get_outsourcing_order")
      .map((request) => request.params),
    [{ id: 501 }, { id: 502 }],
  );
});

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
