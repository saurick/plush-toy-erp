import test from "node:test";
import assert from "node:assert/strict";
import {
  createManualAcceptanceFinanceReadbackRPC,
  readIndexedManualAcceptanceFinanceFact,
} from "./manual-acceptance-finance-readback.mjs";

const version = "2026.11.07-v9",
  prefix = "TEST-YS-261107V9-";

function backend(records) {
  const calls = [];
  const rpc = async (request) => {
    calls.push(request);
    assert.equal(request.actor, "finance");
    const { method, params } = request;
    if (method === "list_finance_facts")
      return {
        finance_facts: structuredClone(
          records.slice(params.offset, params.offset + params.limit),
        ),
        total: records.length,
      };
    if (method === "get_finance_fact")
      return {
        finance_fact: structuredClone(
          records.find((record) => record.id === params.id),
        ),
      };
    if (method === "create_payable_from_purchase_receipt") {
      const record = {
        id: records.length + 1,
        fact_no: params.fact_no,
        status: "DRAFT",
      };
      records.push(record);
      return { finance_fact: structuredClone(record) };
    }
    throw new Error(`unexpected ${method}`);
  };
  return { rpc, calls, records };
}

test("finance readback indexes all batch identities and reads changing states by ID", async () => {
  const b = backend(
    Array.from({ length: 205 }, (_, i) => ({
      id: i + 1,
      fact_no: `${prefix}WWYF${String(i + 1).padStart(3, "0")}`,
      status: "POSTED",
    })),
  );
  const rpc = await createManualAcceptanceFinanceReadbackRPC(b.rpc, version);
  assert.deepEqual(
    b.calls.map((call) => call.params.offset),
    [0, 200],
  );
  assert.ok(b.calls.every((call) => call.params.keyword === prefix));
  const first = await readIndexedManualAcceptanceFinanceFact(
    rpc,
    `${prefix}WWYF001`,
  );
  assert.equal(first.record.status, "POSTED");
  b.records[0].status = "SETTLED";
  assert.equal(
    (await readIndexedManualAcceptanceFinanceFact(rpc, `${prefix}WWYF001`)).record
      .status,
    "SETTLED",
  );
  assert.ok(
    b.calls.slice(2).every((call) => call.method === "get_finance_fact"),
  );
  assert.equal(
    await readIndexedManualAcceptanceFinanceFact(rpc, "UNOWNED-1"),
    null,
  );
  assert.equal(
    (await readIndexedManualAcceptanceFinanceFact(rpc, `${prefix}YS999`))
      .record,
    undefined,
  );
});

test("new finance identities come only from committed RPC responses and remain target-local", async () => {
  const a = backend([]),
    b = backend([{ id: 99, fact_no: `${prefix}WWYF001`, status: "POSTED" }]);
  const left = await createManualAcceptanceFinanceReadbackRPC(a.rpc, version),
    right = await createManualAcceptanceFinanceReadbackRPC(b.rpc, version);
  await left({
    actor: "finance",
    domain: "operational_fact",
    method: "create_payable_from_purchase_receipt",
    params: { fact_no: `${prefix}WWYF001` },
  });
  assert.equal(
    (await readIndexedManualAcceptanceFinanceFact(left, `${prefix}WWYF001`))
      .record.id,
    1,
  );
  assert.equal(
    (await readIndexedManualAcceptanceFinanceFact(right, `${prefix}WWYF001`))
      .record.id,
    99,
  );
  b.records[0].fact_no = `${prefix}WWYF002`;
  await assert.rejects(
    () => readIndexedManualAcceptanceFinanceFact(right, `${prefix}WWYF001`),
    /number drifted/u,
  );
});

test("finance identity preparation refuses duplicated or truncated pages", async () => {
  const row = { id: 1, fact_no: `${prefix}WWYF001` };
  await assert.rejects(
    () =>
      createManualAcceptanceFinanceReadbackRPC(
        async () => ({ finance_facts: [row, row], total: 2 }),
        version,
      ),
    /repeats/u,
  );
  await assert.rejects(
    () =>
      createManualAcceptanceFinanceReadbackRPC(
        async () => ({ finance_facts: [], total: 1 }),
        version,
      ),
    /truncated/u,
  );
});
