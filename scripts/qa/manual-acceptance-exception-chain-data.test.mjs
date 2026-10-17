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
import {
  FORMAL_RPC_PARAM_ALLOWLIST,
  manualAcceptanceBusinessNo,
} from "./manual-acceptance-source-driven-facts.mjs";
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

function purchaseDispositionFixture({
  quantities = ["1", "2", "3.250000"],
  corruptDisposition,
  corruptReplacement,
  corruptInspection,
} = {}) {
  const plan = { dataVersion: "2026.09.27-v8" };
  const purchase = {
    purchaseReceipts: quantities.map((quantity, index) => ({
      id: 10 + index,
      supplier_id: 7,
      status: "DRAFT",
      items: [
        {
          id: 20 + index,
          purchase_order_item_id: 40 + index,
          quantity,
          declared_quantity: "999",
          unit_id: 1,
          warehouse_id: 2,
          material_id: 3,
        },
      ],
    })),
    qualityInspections: quantities.map((_, index) => ({
      id: 30 + index,
      source_type: "PURCHASE_RECEIPT",
      status: "REJECTED",
      purchase_receipt_id: 10 + index,
      purchase_receipt_item_id: 20 + index,
    })),
  };
  const calls = [],
    dispositions = new Map();
  let replacement, quality;
  const rpc = async (request) => {
    calls.push(structuredClone(request));
    const { actor, method, params } = request;
    const responseRecord = (record) =>
      corruptDisposition
        ? corruptDisposition(structuredClone(record))
        : structuredClone(record);
    switch (method) {
      case "list_purchase_rejection_dispositions": {
        assert.equal(actor, "purchase");
        const rows = [...dispositions.values()].filter(
          (row) => row.quality_inspection_id === params.quality_inspection_id,
        );
        return {
          purchase_rejection_dispositions: rows.map(responseRecord),
          total: rows.length,
        };
      }
      case "create_purchase_rejection_disposition": {
        assert.equal(actor, "purchase");
        const inspection = purchase.qualityInspections.find(
          (row) => row.id === params.quality_inspection_id,
        );
        const record = {
          id: dispositions.size + 100,
          ...params,
          status: "DRAFT",
          version: 1,
          purchase_receipt_id: inspection.purchase_receipt_id,
          purchase_receipt_item_id: inspection.purchase_receipt_item_id,
        };
        dispositions.set(record.id, record);
        return { purchase_rejection_disposition: responseRecord(record) };
      }
      case "post_purchase_rejection_disposition": {
        const record = dispositions.get(params.id);
        assert.equal(record.status, "DRAFT");
        assert.equal(params.expected_version, record.version);
        if (record.disposition_type === "REPLACE") {
          assert.equal(actor, "warehouse");
          assert.deepEqual(params, {
            id: record.id,
            expected_version: record.version,
            counted_quantity: quantities[2],
          });
          assert.notEqual(
            params.counted_quantity,
            purchase.purchaseReceipts[2].items[0].declared_quantity,
          );
          replacement = {
            id: 900,
            supplier_id: 7,
            status: "DRAFT",
            items: [
              {
                ...purchase.purchaseReceipts[2].items[0],
                id: 901,
                quantity: record.quantity,
              },
            ],
          };
          quality = {
            id: 902,
            status: "DRAFT",
            source_type: "PURCHASE_RECEIPT",
            inspection_type: "INCOMING",
            purchase_receipt_id: 900,
            purchase_receipt_item_id: 901,
          };
          record.replacement_receipt_id = replacement.id;
        } else {
          assert.equal(actor, "purchase");
          assert.deepEqual(params, {
            id: record.id,
            expected_version: record.version,
          });
        }
        record.status = "POSTED";
        record.version += 1;
        return { purchase_rejection_disposition: responseRecord(record) };
      }
      case "cancel_purchase_rejection_disposition": {
        assert.equal(actor, "purchase");
        const record = dispositions.get(params.id);
        assert.equal(params.expected_version, record.version);
        record.status = "CANCELLED";
        record.version += 1;
        return { purchase_rejection_disposition: responseRecord(record) };
      }
      case "get_purchase_receipt": {
        assert.equal(actor, "warehouse");
        const receipt = structuredClone(
          params.id === 900
            ? replacement
            : purchase.purchaseReceipts.find((row) => row.id === params.id),
        );
        return {
          purchase_receipt:
            params.id === 900 && corruptReplacement
              ? corruptReplacement(receipt)
              : receipt,
        };
      }
      case "list_quality_inspections":
        assert.equal(actor, "quality");
        assert.equal(params.purchase_receipt_id, replacement.id);
        return {
          quality_inspections: [
            corruptInspection
              ? corruptInspection(structuredClone(quality))
              : structuredClone(quality),
          ],
          total: 1,
        };
      case "submit_quality_inspection":
        assert.equal(actor, "quality");
        assert.equal(params.id, quality.id);
        quality.status = "SUBMITTED";
        return { quality_inspection: structuredClone(quality) };
      case "pass_quality_inspection":
        assert.equal(actor, "quality");
        assert.equal(params.id, quality.id);
        quality.status = "PASSED";
        return { quality_inspection: structuredClone(quality) };
      case "post_purchase_receipt":
        assert.equal(actor, "warehouse");
        assert.deepEqual(params, { id: replacement.id });
        replacement.status = "POSTED";
        return { purchase_receipt: structuredClone(replacement) };
      default:
        assert.fail(`unexpected purchase disposition RPC ${method}`);
    }
  };
  return { plan, purchase, rpc, calls };
}

test("replacement posting shares the exact server allowlist and preserves explicit counted quantity", () => {
  assert.deepEqual(
    FORMAL_RPC_PARAM_ALLOWLIST["purchase.post_purchase_rejection_disposition"],
    ["id", "expected_version", "counted_quantity"],
  );
  const params = { id: 1, expected_version: 2, counted_quantity: "3.250000" };
  assert.deepEqual(
    manualAcceptanceFactRPCParams(
      "purchase",
      "post_purchase_rejection_disposition",
      params,
    ),
    params,
  );
});

test("purchase replacement is explicitly counted by warehouse while returns stay with purchasing and resume does not repost", async () => {
  const fixture = purchaseDispositionFixture();
  const run = (apply) => ensurePurchaseDispositionChain({ ...fixture, apply });
  const result = await run(true);
  assert.deepEqual(
    result.records.map((row) => row.status),
    ["POSTED", "CANCELLED", "POSTED"],
  );
  assert.equal(result.replacementReceipts.length, 1);
  assert.equal(result.replacementReceipts[0].status, "POSTED");
  assert.equal(
    result.replacementInspections[0].purchase_receipt_id,
    result.replacementReceipts[0].id,
  );
  assert.equal(result.replacementInspections[0].status, "PASSED");
  assert.ok(result.sourceReceipts.every((row) => row.status === "DRAFT"));
  const mutations = () =>
    fixture.calls.filter((row) =>
      /^(?:create|post|cancel|submit|pass)_/u.test(row.method),
    ).length;
  const mutationCount = mutations();
  assert.deepEqual(await run(true), result);
  assert.equal(mutations(), mutationCount);
  assert.deepEqual(await run(false), result);
  assert.equal(mutations(), mutationCount);
});

test("purchase disposition rejects quantity drift, unknown types and invalid source decimals before posting", async () => {
  for (const patch of [{ quantity: "999" }, { disposition_type: "UNKNOWN" }]) {
    const fixture = purchaseDispositionFixture({
      corruptDisposition: (row) => ({ ...row, ...patch }),
    });
    await assert.rejects(
      () => ensurePurchaseDispositionChain({ ...fixture, apply: true }),
      /source or state drifted/u,
    );
    assert.equal(
      fixture.calls.filter((row) => row.method.startsWith("post_")).length,
      0,
    );
  }
  for (const quantity of ["0", "-1", "1.0000001", "not-a-quantity", 3]) {
    const fixture = purchaseDispositionFixture({
      quantities: [quantity, "2", "3"],
    });
    await assert.rejects(
      () => ensurePurchaseDispositionChain({ ...fixture, apply: true }),
      /positive exact decimal/u,
    );
    assert.equal(
      fixture.calls.filter((row) =>
        /^(?:create|post|cancel)_/u.test(row.method),
      ).length,
      0,
    );
  }
});

test("replacement receipt and IQC must retain their exact source grain before quality or inbound writes", async () => {
  for (const options of [
    { corruptReplacement: (row) => ({ ...row, supplier_id: 999 }) },
    {
      corruptReplacement: (row) => ({
        ...row,
        items: [{ ...row.items[0], purchase_order_item_id: 999 }],
      }),
    },
    {
      corruptReplacement: (row) => ({
        ...row,
        items: [{ ...row.items[0], quantity: "999" }],
      }),
    },
    { corruptInspection: (row) => ({ ...row, purchase_receipt_id: 999 }) },
    { corruptInspection: (row) => ({ ...row, purchase_receipt_item_id: 999 }) },
  ]) {
    const fixture = purchaseDispositionFixture(options);
    await assert.rejects(
      () => ensurePurchaseDispositionChain({ ...fixture, apply: true }),
      /source or state drifted/u,
    );
    assert.equal(
      fixture.calls.filter((row) =>
        [
          "submit_quality_inspection",
          "pass_quality_inspection",
          "post_purchase_receipt",
        ].includes(row.method),
      ).length,
      0,
    );
  }
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
    items: [
      {
        id: 3,
        material_id: 4,
        unit_id: 5,
        warehouse_id: 2,
        lot_id: 6,
        quantity: "1",
      },
    ],
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
