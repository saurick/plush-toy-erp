import assert from "node:assert/strict";
import { manualAcceptanceBusinessNo } from "./manual-acceptance-source-driven-facts.mjs";

const contexts = new WeakMap();

// 只索引本批单号与 ID；状态、余额和快照始终从正式单据接口实时读取。
export async function createManualAcceptanceFinanceReadbackRPC(
  rpc,
  dataVersion,
) {
  const exemplar = manualAcceptanceBusinessNo({
    dataVersion,
    code: "YS",
    sequence: 1,
  });
  assert.ok(exemplar.endsWith("YS001"));
  const context = { prefix: exemplar.slice(0, -5), ids: new Map() };
  const remember = (record) => {
    assert.ok(typeof record?.fact_no === "string" && Number.isSafeInteger(record.id) && record.id > 0, "finance identity listing is missing a business number or ID");
    if (!record?.fact_no?.startsWith(context.prefix)) return;
    assert.ok(
      Number.isSafeInteger(record.id) && record.id > 0,
      "finance identity is missing a persisted ID",
    );
    const previous = context.ids.get(record.fact_no);
    assert.ok(
      previous == null || previous === record.id,
      `${record.fact_no} has conflicting finance identities`,
    );
    context.ids.set(record.fact_no, record.id);
  };
  const seen = new Set();
  for (let offset = 0; offset < 40_000; offset += 200) {
    const data = await rpc({
      actor: "finance",
      domain: "operational_fact",
      method: "list_finance_facts",
      params: { keyword: context.prefix, limit: 200, offset },
    });
    assert.ok(
      Array.isArray(data.finance_facts),
      "finance identity listing is missing",
    );
    for (const record of data.finance_facts) {
      assert.ok(
        !seen.has(record.id),
        "finance identity listing repeats a record across pages",
      );
      seen.add(record.id);
      remember(record);
    }
    if (seen.size >= Number(data.total ?? seen.size)) break;
    assert.ok(
      data.finance_facts.length > 0 && offset + 200 < 40_000,
      "finance identity listing is truncated or exceeds its budget",
    );
  }
  const tracked = async (request) => {
    const data = await rpc(request);
    if (data.finance_fact) remember(data.finance_fact);
    return data;
  };
  contexts.set(tracked, context);
  return tracked;
}

export async function readIndexedManualAcceptanceFinanceFact(rpc, businessNo) {
  const context = contexts.get(rpc);
  if (!context || !businessNo.startsWith(context.prefix)) return null;
  const id = context.ids.get(businessNo);
  if (!id) return { record: undefined };
  const data = await rpc({
    actor: "finance",
    domain: "operational_fact",
    method: "get_finance_fact",
    params: { id },
  });
  assert.equal(data.finance_fact?.id, id, `${businessNo} finance ID drifted`);
  assert.equal(
    data.finance_fact.fact_no,
    businessNo,
    `${businessNo} finance number drifted`,
  );
  return { record: data.finance_fact };
}
