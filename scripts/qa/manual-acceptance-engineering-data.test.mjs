import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildAttachmentFixtures, ATTACHMENT_NOTE } from "./manual-acceptance-attachment-data.mjs";
import { prepareManualAcceptanceEngineering } from "./manual-acceptance-engineering-data.mjs";

function fixture({ status = "PREPARING", requestStatus = "PREVIEW", missingBOM = false } = {}) {
  const calls = [];
  const line = { id: 11, product_id: 1, product_sku_id: 2, line_status: "OPEN", engineering_status: status, sample_bom_id: status === "PREPARING" ? null : 3, product_image_attachment_id: 7 };
  const order = { id: 4, order_no: "YS7-XD-003", lifecycle_status: "ACTIVE", version: 1 };
  let bom = { id: 3, product_id: 1, version: "YS7-BOM-001-2", status: "ACTIVE", edit_version: 123, items: [{ material_id: 9, unit_id: 8, quantity: "0.2", loss_rate: "0" }] };
  let request = { id: 5, sales_order_id: 4, version: 1, status: requestStatus, issues: [], items: [{}], source_order_version: 1, source_hash: "a".repeat(64) };
  const image = { id: 7, attachment_type: "product_image", slot_key: "primary", note: ATTACHMENT_NOTE, sha256: createHash("sha256").update(buildAttachmentFixtures({ includeNearLimit: false }).find((x) => x.mime_type === "image/png").content).digest("hex") };
  const plan = { prefix: "YS7", productionCandidates: [{ salesOrder: { id: 4, orderNo: order.order_no } }] };
  const sourceReport = { referenceRecords: { products: [{ id: 1, code: "YS7-CP-001" }], materials: [{ id: 9, unitId: 8 }], bomVersions: missingBOM ? [] : [{ id: 3, productId: 1, version: bom.version, status: "ACTIVE" }] } };
  const rpc = async (call) => {
    calls.push(call);
    const { method, params } = call;
    if (method === "get_sales_order") return structuredClone({ sales_order: order });
    if (method === "list_sales_order_items") return structuredClone({ total: 1, sales_order_items: [line] });
    if (method === "list_attachments") return { attachments: [image] };
    if (method === "get_bom_version") return { bom_version: bom };
    if (method === "list_bom_versions") return { total: 0, bom_versions: [] };
    if (method === "save_bom_with_items") { bom = { ...bom, ...params, status: "DRAFT" }; return { bom_version: bom }; }
    if (method === "activate_bom_version") { bom.status = "ACTIVE"; return { bom_version: bom }; }
    if (method === "save_sales_order_engineering") {
      assert.equal(params.expected_version, order.version);
      Object.assign(line, params.items[0]); order.version += 1; return {};
    }
    if (method === "get_engineering_material_request") return structuredClone(request);
    const statusByMethod = { submit_engineering_material_request: "SUBMITTED", boss_review_engineering_material_request: "BOSS_APPROVED", finance_review_engineering_material_request: "APPROVED" };
    if (statusByMethod[method]) { request = { ...request, status: statusByMethod[method], version: request.version + 1 }; return structuredClone(request); }
    throw new Error(`unexpected ${method}`);
  };
  return { plan, sourceReport, rpc, calls, image };
}

test("engineering preparation binds samples before role-owned material approvals and reuses the result", async () => {
  const f = fixture();
  const result = await prepareManualAcceptanceEngineering(f);
  assert.equal(result.materialRequests[0].confirmedLineCount, 1);
  assert.deepEqual(f.calls.filter((x) => x.method === "save_sales_order_engineering").map((x) => [x.actor, x.params.items[0].engineering_status]), [["engineering", "PREPARING"], ["engineering", "SAMPLING"], ["engineering", "CONFIRMED"]]);
  assert.deepEqual(f.calls.filter((x) => /^(submit|boss_review|finance_review)_engineering/.test(x.method)).map((x) => x.actor), ["engineering", "boss", "finance"]);
  f.calls.length = 0;
  await prepareManualAcceptanceEngineering({ ...f, apply: false });
  assert.equal(f.calls.some((x) => /save|upload|review|submit|activate/.test(x.method)), false);
});

test("each uncovered ordered product gets its own sample BOM without modifying another product", async () => {
  const f = fixture({ missingBOM: true });
  const result = await prepareManualAcceptanceEngineering(f);
  assert.equal(result.supplementalBOMs[0].productId, 1);
  assert.equal(f.calls.find((x) => x.method === "save_bom_with_items").params.version, "YS7-CP-001-SAMPLE");
});

test("a changed sample image or an unapproved read-only run cannot manufacture confirmation", async () => {
  const f = fixture(); f.image.sha256 = "edited";
  await assert.rejects(prepareManualAcceptanceEngineering(f), /sample image.*edited/);
  assert.equal(f.calls.some((x) => x.method.startsWith("save_")), false);
  await assert.rejects(prepareManualAcceptanceEngineering({ ...fixture(), apply: false }), /sample is not confirmed/);
  await assert.rejects(prepareManualAcceptanceEngineering(fixture({ status: "CONFIRMED", requestStatus: "REJECTED" })), /not approved/);
});
