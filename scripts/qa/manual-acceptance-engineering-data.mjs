const ENGINEERING_NOTE = "工程资料已核对，请按本轮资料办理。";

function requireValue(condition, message) {
  if (!condition) throw new Error(`engineering preparation: ${message}`);
}

// Prepare every open product through the same completion action as the task.
export async function prepareManualAcceptanceEngineering({ plan, sourceReport, rpc, apply = true, materialMode = "approved" }) {
  requireValue(["approved", "preview"].includes(materialMode), "unsupported material preparation mode");
  const refs = sourceReport.referenceRecords;
  const products = new Map(refs.products.map((item) => [Number(item.id), item]));
  const activeBOMs = new Map(refs.bomVersions.filter((item) => item.status === "ACTIVE").map((item) => [Number(item.productId), item]));
  const orderRefs = new Map(plan.productionCandidates.map((item) => [Number(item.salesOrder.id), item.salesOrder]));
  const bomCache = new Map();
  const call = (actor, domain, method, params) => rpc({ actor, domain, method, params });
  const getOrder = async (id) => {
    const header = await call("engineering", "sales_order", "get_sales_order", { id });
    const lines = await call("engineering", "sales_order", "list_sales_order_items", { sales_order_id: id, limit: 200, offset: 0 });
    requireValue(Number(lines.total || 0) <= (lines.sales_order_items || []).length, `sales order ${id} lines are incomplete`);
    return { ...header, sales_order_items: lines.sales_order_items || [] };
  };
  const getBOM = async (id) => (await call("engineering", "bom", "get_bom_version", { id })).bom_version;
  const supplementalBOMs = [];
  const requests = [];

  async function prepareProduct(productID) {
    const product = products.get(productID);
    requireValue(product?.code?.startsWith(`${plan.prefix}-`), `product ${productID} is outside the current simulated batch`);
    if (bomCache.has(productID)) return bomCache.get(productID);
    const sourceBOM = activeBOMs.get(productID);
    let bom;
    if (sourceBOM) {
      bom = await getBOM(sourceBOM.id);
      requireValue(bom?.version === sourceBOM.version && Number(bom.product_id) === productID, `${product.code} BOM source changed`);
    } else {
      // Keep the existing 45 BOM lifecycle specimens; additional ordered products
      // need their own small engineering BOM before the whole order can be approved.
      const version = `${product.code}-ENG`;
      const result = await call("engineering", "bom", "list_bom_versions", { product_id: productID, limit: 200, offset: 0 });
      requireValue(Number(result.total || 0) <= (result.bom_versions || []).length, `${product.code} BOM listing is incomplete`);
      const matches = (result.bom_versions || []).filter((item) => item.version === version);
      requireValue(matches.length <= 1, `${version} is ambiguous`);
      const material = refs.materials[0];
      requireValue(material?.id && material.unitId, "engineering material reference is missing");
      if (matches[0]) bom = await getBOM(matches[0].id);
      else if (apply) {
        bom = (await call("engineering", "bom", "save_bom_with_items", {
          product_id: productID, version, note: ENGINEERING_NOTE,
          items: [{ material_id: material.id, unit_id: material.unitId, quantity: "0.2", loss_rate: "0", position: "面料", note: ENGINEERING_NOTE }],
        })).bom_version;
      }
      requireValue(bom?.id && Number(bom.product_id) === productID && bom.note === ENGINEERING_NOTE && bom.items?.length === 1 && Number(bom.items[0].material_id) === Number(material.id) && Number(bom.items[0].unit_id) === Number(material.unitId) && Number(bom.items[0].quantity) === 0.2 && Number(bom.items[0].loss_rate) === 0, `${version} engineering BOM is missing or has been edited`);
      if (bom.status === "DRAFT" && apply) bom = (await call("engineering", "bom", "activate_bom_version", { id: bom.id })).bom_version;
      supplementalBOMs.push({ id: bom.id, version, productId: productID });
    }
    requireValue(bom?.status === "ACTIVE" && Number(bom.edit_version) > 0, `${product.code} engineering BOM is not active`);
    bomCache.set(productID, bom);
    return bom;
  }

  for (const [orderID, source] of orderRefs) {
    let detail = await getOrder(orderID);
    requireValue(detail.sales_order?.order_no === source.orderNo && source.orderNo.startsWith(`${plan.prefix}-`) && String(detail.sales_order.lifecycle_status).toUpperCase() === "ACTIVE", `sales order ${orderID} source changed`);
    const lines = detail.sales_order_items.filter((item) => String(item.line_status).toUpperCase() === "OPEN");
    requireValue(lines.length > 0, `${source.orderNo} has no open lines`);
    const items = [];
    for (const line of lines) {
      const bom = await prepareProduct(Number(line.product_id));
      requireValue(!line.bom_id || Number(line.bom_id) === Number(bom.id), `${source.orderNo} engineering BOM was changed`);
      items.push({ id: line.id, product_id: line.product_id, product_sku_id: line.product_sku_id || undefined, bom_id: bom.id, expected_bom_version: bom.edit_version });
    }
    let request = await call("engineering", "sales_order", "get_engineering_material_request", { sales_order_id: orderID });
    requireValue(Number(request.sales_order_id) === orderID, `${source.orderNo} material request points to another order`);
    if (request.status === "PREVIEW" || request.status === "REJECTED") {
      requireValue(apply, `${source.orderNo} engineering is not complete`);
      await call("engineering", "sales_order", "save_sales_order_engineering", { id: orderID, expected_version: detail.sales_order.version, complete: true, items });
      detail = await getOrder(orderID);
      requireValue(items.every((item) => Number(detail.sales_order_items.find((line) => line.id === item.id)?.bom_id) === Number(item.bom_id)), `${source.orderNo} engineering BOM did not persist`);
      request = await call("engineering", "sales_order", "get_engineering_material_request", { sales_order_id: orderID });
    }
    if (materialMode === "preview") {
      requireValue(request.status === "SUBMITTED" && request.issues?.length === 0 && request.items?.length > 0, `${source.orderNo} is not awaiting material review`);
      requests.push({ salesOrderId: orderID, orderNo: source.orderNo, status: request.status, completedLineCount: lines.length,
        sourceOrderVersion: request.source_order_version, sourceHash: request.source_hash });
      continue;
    }
    if (request.status === "SUBMITTED" && apply) request = await call("boss", "sales_order", "boss_review_engineering_material_request", { id: request.id, expected_version: request.version, action: "BOSS_APPROVE", note: ENGINEERING_NOTE });
    if (request.status === "BOSS_APPROVED" && apply) request = await call("finance", "sales_order", "finance_review_engineering_material_request", { id: request.id, expected_version: request.version, action: "FINANCE_APPROVE", note: ENGINEERING_NOTE });
    requireValue(request.status === "APPROVED" && Number(request.sales_order_id) === orderID, `${source.orderNo} material request is not approved`);
    requests.push({ id: request.id, salesOrderId: orderID, orderNo: source.orderNo, status: request.status, completedLineCount: lines.length });
  }
  return { simulatedOnly: true, supplementalBOMs: supplementalBOMs, materialRequests: requests };
}
