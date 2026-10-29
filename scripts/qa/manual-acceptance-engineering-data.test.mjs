import test from "node:test";
import assert from "node:assert/strict";
import { prepareManualAcceptanceEngineering } from "./manual-acceptance-engineering-data.mjs";

function fixture({
  complete = false,
  requestStatus = "PREVIEW",
  missingBOM = false,
} = {}) {
  const calls = [];
  const line = {
    id: 11,
    product_id: 1,
    product_sku_id: 2,
    line_status: "OPEN",
    bom_id: complete ? 3 : null,
  };
  const order = {
    id: 4,
    order_no: "YS8-XD-003",
    lifecycle_status: "ACTIVE",
    version: 1,
  };
  let bom = {
    id: 3,
    product_id: 1,
    version: "YS8-BOM-001-2",
    status: "ACTIVE",
    edit_version: 123,
    items: [{ material_id: 9, unit_id: 8, quantity: "0.2", loss_rate: "0" }],
  };
  let request = {
    id: 5,
    sales_order_id: 4,
    version: 1,
    status: requestStatus,
    issues: [],
    items: [{}],
    source_order_version: 1,
    source_hash: "a".repeat(64),
  };
  const plan = {
    prefix: "YS8",
    productionCandidates: [{ salesOrder: { id: 4, orderNo: order.order_no } }],
  };
  const sourceReport = {
    referenceRecords: {
      products: [{ id: 1, code: "YS8-CP-001" }],
      materials: [{ id: 9, unitId: 8 }],
      bomVersions: missingBOM
        ? []
        : [{ id: 3, productId: 1, version: bom.version, status: "ACTIVE" }],
    },
  };
  const rpc = async (call) => {
    calls.push(call);
    const { method, params } = call;
    if (method === "get_sales_order")
      return structuredClone({ sales_order: order });
    if (method === "list_sales_order_items")
      return structuredClone({ total: 1, sales_order_items: [line] });
    if (method === "get_bom_version") return { bom_version: bom };
    if (method === "list_bom_versions") return { total: 0, bom_versions: [] };
    if (method === "save_bom_with_items") {
      bom = { ...bom, ...params, status: "DRAFT" };
      return { bom_version: bom };
    }
    if (method === "activate_bom_version") {
      bom.status = "ACTIVE";
      return { bom_version: bom };
    }
    if (method === "save_sales_order_engineering") {
      assert.equal(params.expected_version, order.version);
      assert.equal(params.complete, true);
      Object.assign(line, params.items[0]);
      request.status = "SUBMITTED";
      order.version += 1;
      return {};
    }
    if (method === "get_engineering_material_request")
      return structuredClone(request);
    const statusByMethod = {
      submit_engineering_material_request: "SUBMITTED",
      boss_review_engineering_material_request: "BOSS_APPROVED",
      finance_review_engineering_material_request: "APPROVED",
    };
    if (statusByMethod[method]) {
      request = {
        ...request,
        status: statusByMethod[method],
        version: request.version + 1,
      };
      return structuredClone(request);
    }
    throw new Error(`unexpected ${method}`);
  };
  return { plan, sourceReport, rpc, calls };
}

test("engineering preparation completes engineering before role-owned material approvals and reuses the result", async () => {
  const f = fixture();
  const result = await prepareManualAcceptanceEngineering(f);
  assert.equal(result.materialRequests[0].completedLineCount, 1);
  assert.deepEqual(
    f.calls
      .filter((x) => x.method === "save_sales_order_engineering")
      .map((x) => [x.actor, x.params.complete]),
    [
      ["engineering", true],
    ],
  );
  assert.deepEqual(
    f.calls
      .filter((x) =>
        /^(submit|boss_review|finance_review)_engineering/.test(x.method),
      )
      .map((x) => x.actor),
    ["boss", "finance"],
  );
  f.calls.length = 0;
  await prepareManualAcceptanceEngineering({ ...f, apply: false });
  assert.equal(
    f.calls.some((x) => /save|upload|review|submit|activate/.test(x.method)),
    false,
  );
});

test("each uncovered ordered product gets its own engineering BOM without modifying another product", async () => {
  const f = fixture({ missingBOM: true });
  const result = await prepareManualAcceptanceEngineering(f);
  assert.equal(result.supplementalBOMs[0].productId, 1);
  assert.equal(
    f.calls.find((x) => x.method === "save_bom_with_items").params.version,
    "YS8-CP-001-ENG",
  );
});

test("an unapproved read-only run cannot complete engineering", async () => {
  const f = fixture();
  await assert.rejects(prepareManualAcceptanceEngineering({ ...f, apply: false }), /engineering is not complete/);
  assert.equal(f.calls.some((x) => /save|upload|review|submit|activate/.test(x.method)), false);
});

test("pressure preparation completes engineering and stops before material review", async () => {
  const f = fixture();
  const result = await prepareManualAcceptanceEngineering({ ...f, materialMode: "preview" });
  assert.equal(result.materialRequests[0].status, "SUBMITTED");
  assert.equal(result.materialRequests[0].completedLineCount, 1);
  assert.equal(f.calls.filter((call) => /submit_|review_/u.test(call.method)).length, 0);
  await assert.rejects(prepareManualAcceptanceEngineering({ ...f, materialMode: "skip" }), /unsupported/u);
});
