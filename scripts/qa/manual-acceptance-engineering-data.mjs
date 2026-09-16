import { createHash } from "node:crypto";
import { ATTACHMENT_NOTE, buildAttachmentFixtures } from "./manual-acceptance-attachment-data.mjs";

const SAMPLE_NOTE = "模拟样品已核对，仅用于试用流程演示。";

function requireValue(condition, message) {
  if (!condition) throw new Error(`engineering preparation: ${message}`);
}

// Production depends on confirmed samples for every open sales line, including
// lines that are not themselves selected as production quantity specimens.
export async function prepareManualAcceptanceEngineering({ plan, sourceReport, rpc, apply = true }) {
  const refs = sourceReport.referenceRecords;
  const products = new Map(refs.products.map((item) => [Number(item.id), item]));
  const activeBOMs = new Map(refs.bomVersions.filter((item) => item.status === "ACTIVE").map((item) => [Number(item.productId), item]));
  const orderRefs = new Map(plan.productionCandidates.map((item) => [Number(item.salesOrder.id), item.salesOrder]));
  const imageFixture = buildAttachmentFixtures({ includeNearLimit: false }).find((item) => item.mime_type === "image/png");
  const imageHash = createHash("sha256").update(imageFixture.content).digest("hex");
  const imageCache = new Map();
  const bomCache = new Map();
  const call = (actor, domain, method, params) => rpc({ actor, domain, method, params });
  const getOrder = async (id) => {
    const header = await call("engineering", "sales_order", "get_sales_order", { id });
    const lines = await call("engineering", "sales_order", "list_sales_order_items", { sales_order_id: id, limit: 200, offset: 0 });
    requireValue(Number(lines.total || 0) <= (lines.sales_order_items || []).length, `sales order ${id} lines are incomplete`);
    return { ...header, sales_order_items: lines.sales_order_items || [] };
  };
  const getBOM = async (id) => (await call("engineering", "bom", "get_bom_version", { id })).bom_version;
  const sampleBOMs = [];
  const requests = [];

  async function prepareProduct(productID) {
    const product = products.get(productID);
    requireValue(product?.code?.startsWith(`${plan.prefix}-`), `product ${productID} is outside the current simulated batch`);
    if (!imageCache.has(productID)) {
      const images = (await call("engineering", "attachment", "list_attachments", { owner_type: "product", owner_id: productID })).attachments || [];
      const primary = images.filter((item) => item.attachment_type === "product_image" && item.slot_key === "primary" && !item.withdrawn_at);
      requireValue(primary.length <= 1, `${product.code} has ambiguous sample images`);
      let image = primary[0];
      if (!image && apply) {
        image = (await call("engineering", "attachment", "upload_attachment", {
          owner_type: "product", owner_id: productID, attachment_type: "product_image", slot_key: "primary",
          file_name: `${product.code}-样品示意.png`, mime_type: imageFixture.mime_type,
          content_base64: imageFixture.content.toString("base64"), note: ATTACHMENT_NOTE,
        })).attachment;
      }
      requireValue(image?.id && image.sha256 === imageHash && image.note === ATTACHMENT_NOTE, `${product.code} sample image is missing or has been edited`);
      imageCache.set(productID, image.id);
    }
    if (bomCache.has(productID)) return bomCache.get(productID);
    const sourceBOM = activeBOMs.get(productID);
    let bom;
    if (sourceBOM) {
      bom = await getBOM(sourceBOM.id);
      requireValue(bom?.version === sourceBOM.version && Number(bom.product_id) === productID, `${product.code} BOM source changed`);
    } else {
      // Keep the existing 45 BOM lifecycle specimens; additional ordered products
      // need their own small sample BOM before the whole order can be approved.
      const version = `${product.code}-SAMPLE`;
      const result = await call("engineering", "bom", "list_bom_versions", { product_id: productID, limit: 200, offset: 0 });
      requireValue(Number(result.total || 0) <= (result.bom_versions || []).length, `${product.code} BOM listing is incomplete`);
      const matches = (result.bom_versions || []).filter((item) => item.version === version);
      requireValue(matches.length <= 1, `${version} is ambiguous`);
      const material = refs.materials[0];
      requireValue(material?.id && material.unitId, "sample material reference is missing");
      if (matches[0]) bom = await getBOM(matches[0].id);
      else if (apply) {
        bom = (await call("engineering", "bom", "save_bom_with_items", {
          product_id: productID, version, note: SAMPLE_NOTE,
          items: [{ material_id: material.id, unit_id: material.unitId, quantity: "0.2", loss_rate: "0", position: "面料", note: SAMPLE_NOTE }],
        })).bom_version;
      }
      requireValue(bom?.id && Number(bom.product_id) === productID && bom.note === SAMPLE_NOTE && bom.items?.length === 1 && Number(bom.items[0].material_id) === Number(material.id) && Number(bom.items[0].unit_id) === Number(material.unitId) && Number(bom.items[0].quantity) === 0.2 && Number(bom.items[0].loss_rate) === 0, `${version} sample BOM is missing or has been edited`);
      if (bom.status === "DRAFT" && apply) bom = (await call("engineering", "bom", "activate_bom_version", { id: bom.id })).bom_version;
      sampleBOMs.push({ id: bom.id, version, productId: productID });
    }
    requireValue(bom?.status === "ACTIVE" && Number(bom.edit_version) > 0, `${product.code} sample BOM is not active`);
    bomCache.set(productID, bom);
    return bom;
  }

  for (const [orderID, source] of orderRefs) {
    let detail = await getOrder(orderID);
    requireValue(detail.sales_order?.order_no === source.orderNo && source.orderNo.startsWith(`${plan.prefix}-`) && String(detail.sales_order.lifecycle_status).toUpperCase() === "ACTIVE", `sales order ${orderID} source changed`);
    const lines = detail.sales_order_items.filter((item) => String(item.line_status).toUpperCase() === "OPEN");
    requireValue(lines.length > 0, `${source.orderNo} has no open lines`);
    for (const line of lines) {
      const bom = await prepareProduct(Number(line.product_id));
      let current = detail.sales_order_items.find((item) => item.id === line.id);
      if (current.engineering_status === "CONFIRMED") {
        requireValue(Number(current.sample_bom_id) === Number(bom.id) && Number(current.product_image_attachment_id) === Number(imageCache.get(Number(line.product_id))), `${source.orderNo} confirmed sample source changed`);
        continue;
      }
      requireValue(apply, `${source.orderNo} sample is not confirmed`);
      requireValue(["PREPARING", "SAMPLING"].includes(current.engineering_status), `${source.orderNo} has an unsupported engineering status`);
      requireValue(!current.sample_bom_id || Number(current.sample_bom_id) === Number(bom.id), `${source.orderNo} sample BOM was changed`);
      const base = { id: current.id, product_id: current.product_id, product_sku_id: current.product_sku_id || undefined, sample_bom_id: bom.id, expected_bom_version: bom.edit_version, sample_note: SAMPLE_NOTE };
      const statuses = current.engineering_status === "SAMPLING" ? ["CONFIRMED"] : current.sample_bom_id ? ["SAMPLING", "CONFIRMED"] : ["PREPARING", "SAMPLING", "CONFIRMED"];
      for (const engineering_status of statuses) {
        await call("engineering", "sales_order", "save_sales_order_engineering", { id: orderID, expected_version: detail.sales_order.version, items: [{ ...base, engineering_status }] });
        detail = await getOrder(orderID);
        current = detail.sales_order_items.find((item) => item.id === line.id);
        requireValue(current?.engineering_status === engineering_status && Number(current.sample_bom_id) === Number(bom.id), `${source.orderNo} engineering transition did not persist`);
      }
    }
    let request = await call("engineering", "sales_order", "get_engineering_material_request", { sales_order_id: orderID });
    requireValue(Number(request.sales_order_id) === orderID, `${source.orderNo} material request points to another order`);
    if (request.status === "PREVIEW") {
      requireValue(apply && request.issues?.length === 0 && request.items?.length > 0, `${source.orderNo} material request is not ready: ${(request.issues || []).join("; ")}`);
      request = await call("engineering", "sales_order", "submit_engineering_material_request", { sales_order_id: orderID, expected_version: request.source_order_version, expected_source_hash: request.source_hash });
    }
    if (request.status === "SUBMITTED" && apply) request = await call("boss", "sales_order", "boss_review_engineering_material_request", { id: request.id, expected_version: request.version, action: "BOSS_APPROVE", note: SAMPLE_NOTE });
    if (request.status === "BOSS_APPROVED" && apply) request = await call("finance", "sales_order", "finance_review_engineering_material_request", { id: request.id, expected_version: request.version, action: "FINANCE_APPROVE", note: SAMPLE_NOTE });
    requireValue(request.status === "APPROVED" && Number(request.sales_order_id) === orderID, `${source.orderNo} material request is not approved`);
    requests.push({ id: request.id, salesOrderId: orderID, orderNo: source.orderNo, status: request.status, confirmedLineCount: lines.length });
  }
  return { simulatedOnly: true, sampleImageCount: imageCache.size, supplementalBOMs: sampleBOMs, materialRequests: requests };
}
