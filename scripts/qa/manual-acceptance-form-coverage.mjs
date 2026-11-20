import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildManualAcceptanceProductAlbum, MANUAL_ACCEPTANCE_PRODUCT_STYLES } from "./manual-acceptance-product-images.mjs";
import { FORM_MEDIA_CASES, advanceOutsourcingOrderLifecycle, formMediaCodes } from "./manual-acceptance-source-data.mjs";
import { applyFinishedGoodsDeliveryProcess } from "./manual-acceptance-source-driven-facts.mjs";

function exact(items, key, value) {
  assert.ok(Array.isArray(items), `missing ${key} list for ${value}`);
  const matches = items.filter((row) => row[key] === value);
  assert.ok(matches.length <= 1, `ambiguous ${key} ${value}`);
  return matches[0];
}

function check(label, record, expected) {
  assert.ok(record?.id, `${label} is missing`);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(record[key] ?? null, value ?? null, `${label} ${key} differs`);
  }
  return record;
}

const optionalFields = {
  product: ["code", "name", "style_no", "customer_style_no", "english_name", "hs_code", "default_unit_id", "unit_net_weight_g"],
  product_sku: ["product_id", "sku_code", "sku_name", "barcode", "customer_sku", "color", "color_no", "size", "packaging_version", "default_unit_id", "unit_net_weight_g"],
  material: ["code", "name", "supplier_id", "supplier_item_no", "category", "stock_category", "spec", "color", "default_unit_id", "default_warehouse_id"],
  customer: ["code", "name", "short_name", "default_payment_method", "default_payment_term_days", "tax_no", "country_region", "default_delivery_recipient", "default_delivery_phone", "default_delivery_address", "note"],
};

async function fillOptionalMasterFields(rpc, apply, type, reference, key, fields, { preserveExisting = false } = {}) {
  const read = async () => (await rpc({ actor: "admin", domain: "masterdata", method: `get_${type}`, params: { id: reference.id } }))[type];
  let row = check(reference[key], await read(), { [key]: reference[key], is_active: true });
  if (preserveExisting) fields = Object.fromEntries(Object.entries(fields).map(([field, fallback]) => [field, row[field] == null || row[field] === "" ? fallback : row[field]]));
  for (const [field, value] of Object.entries(fields)) {
    assert.ok(row[field] == null || row[field] === "" || row[field] === value, `${reference[key]} ${field} has a different value`);
  }
  if (apply && Object.keys(fields).some((key) => row[key] !== fields[key])) {
    const original = Object.fromEntries(optionalFields[type].map((field) => [field, row[field]]));
    await rpc({ actor: "admin", domain: "masterdata", method: `update_${type}`, params: { ...original, ...fields, id: row.id } });
    row = await read();
  }
  check(reference[key], row, fields);
  return { id: row.id, [key]: reference[key], ...fields };
}

function currentMasterReferences(references, prefix, kind) {
  const marker = `${prefix}-${kind}-`;
  return references.map((ref) => {
    assert.ok(ref.code.startsWith(marker) && ref.id > 0, `invalid simulated master reference: ${ref.code}`);
    const number = Number(ref.code.slice(marker.length).split("-")[0]);
    assert.ok(Number.isSafeInteger(number) && number > 0, `invalid simulated master number: ${ref.code}`);
    return { ref, number };
  });
}

const deliveryCities = [
  ["广东省东莞市", "0769"], ["广东省深圳市龙岗区", "0755"], ["福建省厦门市集美区", "0592"], ["浙江省金华市义乌市", "0579"],
];

function sampleWeightGrams(number, unitKey) {
  return 125 + (number * 17) % 240 + (unitKey === "set" ? 40 : 0);
}

async function prepareFormCoverageDefaults({ plan, reference, rpc, apply }) {
  const { prefix, materialWarehouse } = plan;
  const preserved = { preserveExisting: true };
  const counts = { productWeights: 0, productEnglishNames: 0, skuWeightOverrides: 0, skuBarcodes: 0, materialWarehouses: 0, customerDelivery: 0, customerContacts: 0, supplierContacts: 0 };
  const englishNames = new Map(MANUAL_ACCEPTANCE_PRODUCT_STYLES.map(({ name, key }) => [name, key.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")]));
  for (const { ref, number } of currentMasterReferences(reference.products, prefix, "CP")) {
    const englishName = englishNames.get(ref.name);
    assert.ok(englishName, `${ref.code} product style is not registered`);
    await fillOptionalMasterFields(rpc, apply, "product", ref, "code", {
      english_name: englishName,
      ...(number === 17 ? {} : { unit_net_weight_g: String(sampleWeightGrams(number, ref.unitKey)) }),
    }, preserved);
    counts.productEnglishNames += 1;
    if (number !== 17) counts.productWeights += 1;
  }
  for (const { ref, number } of currentMasterReferences(reference.skus, prefix, "GG")) {
    const override = number !== 17 && ref.code.endsWith("-02");
    await fillOptionalMasterFields(rpc, apply, "product_sku", { ...ref, sku_code: ref.code }, "sku_code", {
      barcode: ref.code,
      ...(override ? { unit_net_weight_g: String(sampleWeightGrams(number, ref.unitKey) + 55) } : {}),
    }, preserved);
    counts.skuBarcodes += 1;
    if (override) counts.skuWeightOverrides += 1;
  }
  for (const { ref, number } of currentMasterReferences(reference.materials, prefix, "WL")) {
    if (number % 25 === 0) continue;
    await fillOptionalMasterFields(rpc, apply, "material", ref, "code", { default_warehouse_id: materialWarehouse.id }, preserved);
    counts.materialWarehouses += 1;
  }
  for (const { ref, number } of currentMasterReferences(reference.customers, prefix, "KH")) {
    if (number % 12 === 0) continue;
    const [city, area] = deliveryCities[(number - 1) % deliveryCities.length];
    await fillOptionalMasterFields(rpc, apply, "customer", ref, "code", {
      country_region: "中国", default_delivery_recipient: `样品收货岗${number}`,
      default_delivery_phone: `${area}-0000${String(number).padStart(4, "0")}`,
      default_delivery_address: `${city}试用园区样品收货台${number}号`,
    }, preserved);
    counts.customerDelivery += 1;
  }
  for (const [kind, list, marker] of [["CUSTOMER", reference.customers, "KH"], ["SUPPLIER", reference.suppliers, "GYS"]]) {
    for (const { ref, number } of currentMasterReferences(list, prefix, marker)) {
      if (number % 3 === 0) continue;
      const call = (method, params) => rpc({ actor: "admin", domain: "masterdata", method, params });
      const data = await call("list_contacts_by_owner", { owner_type: kind, owner_id: ref.id, limit: 50 });
      assert.equal(data.contacts.length, data.total, `${ref.code} contact list is incomplete`);
      const primary = data.contacts.find((row) => row.is_primary && row.is_active);
      if (!primary) continue;
      const values = {
        phone: primary.phone || `0769-0000${String(number).padStart(4, "0")}`,
        email: primary.email || `${ref.code.toLowerCase()}@example.invalid`,
        ...(number % 2 === 0 ? { mobile: primary.mobile || `+1 202-555-01${String(number % 100).padStart(2, "0")}` } : {}),
      };
      let saved = primary;
      if (apply && Object.entries(values).some(([field, value]) => primary[field] !== value)) {
        const { id, owner_type, owner_id, name, phone, mobile, email, title, is_primary, note } = primary;
        saved = (await call("update_contact", { id, owner_type, owner_id, name, phone, mobile, email, title, is_primary, note, ...values })).contact;
      }
      check(ref.code, saved, { owner_type: kind, owner_id: ref.id, is_primary: true, ...values });
      counts[kind === "CUSTOMER" ? "customerContacts" : "supplierContacts"] += 1;
    }
  }
  return counts;
}

async function ensureMaster(rpc, apply, type, spec, { method, key = "code", listKey = `${type}s` } = {}) {
  const read = async () => exact((await rpc({
    actor: "admin", domain: "masterdata", method: `list_${listKey}`,
    params: { keyword: spec[key], limit: 20, offset: 0, ...(type === "product_sku" ? { product_id: spec.product_id } : {}) },
  }))[listKey], key, spec[key]);
  let row = await read();
  if (!row && apply) {
    await rpc({ actor: "admin", domain: "masterdata", method: method ?? `create_${type}`, params: spec });
    row = await read();
  }
  const { contacts, ...header } = spec;
  check(spec[key], row, { ...header, is_active: true });
  if (contacts) {
    const data = await rpc({ actor: "admin", domain: "masterdata", method: "list_contacts_by_owner", params: { owner_type: type.toUpperCase(), owner_id: row.id, limit: 20 } });
    assert.equal(data.total, contacts.length, `${spec[key]} contact count changed`);
    for (const contact of contacts) check(spec[key], exact(data.contacts, "name", contact.name), { ...contact, owner_id: row.id, is_active: true });
  }
  return row;
}

function attachmentHash(attachment) {
  return createHash("sha256").update(Buffer.from(attachment?.content_base64 ?? "", "base64")).digest("hex");
}

async function ensureMediaAlbum({ rpc, apply, product, photoCase }) {
  const owner = { owner_type: "product", owner_id: product.id };
  const list = async () => (await rpc({ actor: "admin", domain: "attachment", method: "list_attachments", params: owner })).attachments
    .filter((item) => item.attachment_type === "product_image" && !item.withdrawn_at);
  let images = await list();
  if (photoCase === "none") {
    assert.equal(images.length, 0, `${product.code} should be waiting for a photo`);
    return null;
  }
  const fixture = buildManualAcceptanceProductAlbum(product).find((view) => view.slot === "secondary");
  if (images.length === 0 && apply) {
    await rpc({ actor: "admin", domain: "attachment", method: "upload_attachment", params: {
      ...owner, attachment_type: "product_image", slot_key: fixture.slot, file_name: fixture.file_name,
      mime_type: fixture.mime_type, content_base64: fixture.content.toString("base64"),
    } });
    images = await list();
  }
  assert.equal(images.length, 1, `${product.code} should have exactly one secondary image`);
  const image = check(product.code, images[0], { ...owner, slot_key: fixture.slot, file_name: fixture.file_name, sha256: fixture.sha256 });
  const { attachment } = await rpc({ actor: "admin", domain: "attachment", method: "download_attachment", params: { id: image.id } });
  assert.equal(attachmentHash(attachment), fixture.sha256, `${product.code} photo download differs`);
  return { id: image.id, sha256: fixture.sha256 };
}

export async function prepareFormCoverageMasterData({ plan, sourceReport, rpc, apply }) {
  const { prefix, materialWarehouse } = plan;
  const reference = sourceReport.referenceRecords;
  const customers = [];
  const suppliers = [];
  for (const [index, market] of ["南门", "西门", "东门"].entries()) {
    const number = index + 1;
    const contact = (type, title) => ({
      name: `${market}${title}`, title, is_primary: true, phone: `0769-0000010${number}`,
      mobile: `+1 202-555-01${type === "customer" ? `0${number}` : `1${number}`}`,
      email: `${type}-${number}@example.invalid`, note: "演练联络资料",
    });
    const delivery = {
      country_region: "中国", default_delivery_recipient: `${market}收货岗`,
      default_delivery_phone: `0769-0000020${number}`, default_delivery_address: `试用园区${market}样品收货台`,
    };
    const customer = await ensureMaster(rpc, apply, "customer", {
      code: `${prefix}-FM-KH-${number}`, name: `${market}样品贸易`, short_name: `${market}样品`,
      ...delivery, contacts: [contact("customer", "签收岗")],
    }, { method: "save_customer_with_contacts" });
    const supplier = await ensureMaster(rpc, apply, "supplier", {
      code: `${prefix}-FM-GYS-${number}`, name: `${market}样品辅料`, short_name: `${market}辅料`,
      supplier_type: "material", address: `试用园区${market}样品送货台`,
      default_payment_method: "银行转账", default_payment_term_days: [0, 15, 30][index],
      default_invoice_required: true, default_invoice_category: "VAT_GENERAL_1",
      contacts: [contact("supplier", "送货岗")],
    }, { method: "save_supplier_with_contacts" });
    customers.push({ id: customer.id, code: customer.code });
    suppliers.push({ id: supplier.id, code: supplier.code });
  }
  const productFields = [];
  for (const [index, english] of ["Long Tail Kitten", "Scarf Fox", "Bell Deer"].entries()) {
    const code = `${prefix}-CP-${String(4 + index).padStart(3, "0")}`;
    const product = exact(reference.products, "code", code);
    assert.ok(product?.id, `${code} weight fixture has no source`);
    productFields.push(await fillOptionalMasterFields(rpc, apply, "product", product, "code", {
      english_name: english, unit_net_weight_g: ["155.5", "210", "315"][index],
    }));
  }
  const weightSKUCode = `${prefix}-GG-005-02`;
  const sku = exact(reference.skus, "code", weightSKUCode);
  assert.ok(sku?.id, `${weightSKUCode} weight fixture has no source`);
  const skuFields = await fillOptionalMasterFields(rpc, apply, "product_sku", { ...sku, sku_code: sku.code }, "sku_code", { unit_net_weight_g: "265.25" });
  const materialFields = [];
  for (const material of reference.materials.slice(0, 6)) {
    assert.ok(material.code.startsWith(`${prefix}-WL-`), "default warehouse requires a current simulated material");
    materialFields.push(await fillOptionalMasterFields(rpc, apply, "material", material, "code", { default_warehouse_id: materialWarehouse.id }));
  }
  const media = [];
  const unit = reference.units.find((item) => item.key === "piece");
  assert.ok(unit?.id, "photo case has no piece unit");
  for (const entry of FORM_MEDIA_CASES) {
    const { code, skuCode } = formMediaCodes(prefix, entry.key);
    const product = await ensureMaster(rpc, apply, "product", {
      code, name: entry.name, style_no: entry.style, default_unit_id: unit.id,
      ...(entry.key === "secondary" ? { english_name: "Cloud Bear", hs_code: "9503002100", unit_net_weight_g: "168" } : {}),
    });
    const sku = await ensureMaster(rpc, apply, "product_sku", {
      sku_code: skuCode, sku_name: entry.skuName, product_id: product.id, default_unit_id: unit.id,
      color: "米白", size: "小号", barcode: `${skuCode}-01`,
    }, { key: "sku_code", listKey: "product_skus" });
    const image = await ensureMediaAlbum({ rpc, apply, product, photoCase: entry.key });
    media.push({ ...entry, code, skuCode, productId: product.id, skuId: sku.id, image });
  }
  const defaults = await prepareFormCoverageDefaults({ plan, reference, rpc, apply });
  return { customers, suppliers, productFields, skuFields, materialFields, media, defaults };
}

export async function prepareFormCoverageTaskPhotos({ plan, rpc, apply, sources, media }) {
  const evidence = [];
  const dueAt = Date.parse(`${plan.anchorDate}T17:00:00+08:00`) / 1000 + 10 * 86400;
  for (const source of sources.filter((item) => item.mediaCase)) {
    const photo = exact(media, "key", source.mediaCase);
    assert.ok(photo && source.lines.some((line) => line.productId === photo.productId), "photo task must have the exact sales order product");
    const orderNo = source.salesOrder.orderNo;
    const owner = { source_type: "sales_order", source_id: source.salesOrder.id };
    const read = async () => {
      const board = await rpc({ actor: "engineering", domain: "workflow", method: "get_task_board", params: { owner_role_key: "engineering", keyword: orderNo, limit: 30, offset: 0 } });
      const tasks = board.lanes.flatMap((lane) => lane.tasks || []).filter((task) => task.source_id === owner.source_id && task.source_type === owner.source_type);
      return exact(tasks, "task_name", photo.task);
    };
    let task = await read();
    if (!task && apply) {
      await rpc({ actor: "pmc", domain: "workflow", method: "create_followup_task", params: {
        ...owner, task_name: photo.task, description: "按订单上的产品资料办理。", owner_role_key: "engineering",
        due_at: dueAt, priority: 0, idempotency_key: `manual-acceptance:${plan.runId}:form-photo:${photo.key}`,
      } });
      task = await read();
    }
    check(orderNo, task, { source_no: orderNo, ...owner });
    assert.equal(task.display_context?.available, true, `${orderNo} task has no display context`);
    const product = task.display_context.items.find((entry) => entry.kind === "product" && entry.product_id === photo.productId);
    assert.ok(product, `${orderNo} task has no product context`);
    assert.equal(product.image_attachment_id || null, null, `${orderNo} should not have a primary image`);
    assert.equal(product.has_product_images, Boolean(photo.image), `${orderNo} task photo availability does not match its actual album`);
    if (photo.image) {
      const { attachment } = await rpc({ actor: "engineering", domain: "attachment", method: "download_attachment", params: { id: photo.image.id } });
      assert.equal(attachmentHash(attachment), photo.image.sha256, `${orderNo} engineering cannot download its side photo`);
    }
    evidence.push({ taskCode: task.task_code, orderNo, productCode: photo.code, photo: photo.key, imageId: photo.image?.id ?? null });
  }
  return evidence;
}

// One small, inspectable bank receipt with synthetic values and no customer material.
function receiptPDF(payment, correction = false) {
  const title = correction ? "SAMPLE RECEIPT - SUPERSEDED" : "SAMPLE RECEIPT - TRAINING ONLY";
  const content = `BT /F1 16 Tf 44 750 Td (${title}) Tj /F1 11 Tf 0 -36 Td (Reference: ${payment.payment_no}) Tj 0 -20 Td (Amount: ${payment.currency} ${payment.amount}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  return Buffer.from(`${pdf}xref\n0 6\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${Buffer.byteLength(pdf)}\n%%EOF\n`);
}

async function ensurePaymentEvidence({ rpc, apply, payment, corrected }) {
  const owner = { owner_type: "finance_payment", owner_id: payment.id };
  const call = (method, params) => rpc({ actor: "finance", domain: "attachment", method, params });
  const read = async (filename) => exact((await call("list_attachments", owner)).attachments, "file_name", filename);
  const results = [];
  for (const withdrawn of corrected ? [true, false] : [false]) {
    const content = receiptPDF(payment, withdrawn);
    const filename = `${payment.payment_no}-${withdrawn ? "原回单" : "银行回单"}.pdf`;
    const sha256 = createHash("sha256").update(content).digest("hex");
    const reason = "原回单登记有误，换用更正凭据";
    let attachment = await read(filename);
    if (!attachment && apply) {
      await call("upload_attachment", { ...owner, attachment_type: "evidence", file_name: filename, mime_type: "application/pdf", content_base64: content.toString("base64") });
      attachment = await read(filename);
    }
    check(filename, attachment, { ...owner, sha256, mime_type: "application/pdf" });
    if (withdrawn && !attachment.withdrawn_at && apply) {
      await call("withdraw_attachment", { id: attachment.id, reason });
      attachment = await read(filename);
    }
    assert.equal(Boolean(attachment?.withdrawn_at), withdrawn, `${filename} withdrawal differs`);
    if (withdrawn) {
      assert.equal(attachment.withdrawal_reason, reason);
      assert.ok(attachment.withdrawn_by > 0, `${filename} withdrawal actor is missing`);
    } else {
      const downloaded = (await call("download_attachment", { id: attachment.id })).attachment;
      assert.equal(attachmentHash(downloaded), sha256, `${filename} downloaded bytes differ`);
    }
    results.push({ id: attachment.id, filename, withdrawn, sha256 });
  }
  return results;
}

export async function prepareFormCoverageFinance({
  plan, sourceReport, purchase, orders, receivables, rpc, apply, businessNo, transitionPayment,
}) {
  const call = (method, params) => rpc({ actor: "finance", domain: "operational_fact", method, params });
  const findFact = async (factNo) => exact((await call("list_finance_facts", { keyword: factNo, limit: 20, offset: 0 })).finance_facts, "fact_no", factNo);
  const cases = [];
  for (const [index, fact] of receivables.entries()) {
    const { shipment } = await rpc({ actor: "sales", domain: "operational_fact", method: "get_shipment", params: { id: fact.source_id } });
    const order = sourceReport.referenceRecords.salesOrders.find((order) => order.id === shipment?.sales_order_id);
    assert.ok(order?.orderNo?.startsWith(`${plan.prefix}-`) && shipment.status === "SHIPPED" && shipment.customer_id === fact.counterparty_id, `${fact.fact_no} has no exact simulated sales order`);
    cases.push({ fact, source: order, type: "sales_order", direction: "RECEIPT", partyType: "CUSTOMER", code: "SK", corrected: index === 1 });
  }
  const purchaseOrders = new Map(sourceReport.referenceRecords.purchaseOrders.map((order) => [order.id, order]));
  const usedPurchaseOrders = new Set();
  for (const receipt of purchase.purchaseReceipts) {
    const source = purchaseOrders.get(receipt.purchase_order_id);
    if (!source || usedPurchaseOrders.has(source.id) || receipt.status !== "POSTED" || !receipt.items?.length) continue;
    const allowedLines = new Set(source.items.map((item) => item.purchaseOrderItemId));
    if (!receipt.items.every((item) => allowedLines.has(item.purchase_order_item_id))) continue;
    usedPurchaseOrders.add(source.id);
    const factNo = businessNo(plan, "CGYF", 840 + usedPurchaseOrders.size);
    let fact = await findFact(factNo);
    if (!fact && apply) {
      fact = (await call("create_payable_from_purchase_receipt", {
        fact_no: factNo, purchase_receipt_id: receipt.id,
        idempotency_key: `manual-acceptance:${plan.runId}:form-payable:${receipt.receipt_no}`, note: "按已入库采购单登记应付。",
      })).finance_fact;
    }
    check(factNo, fact, { fact_type: "PAYABLE", source_type: "PURCHASE_RECEIPT", source_id: receipt.id, counterparty_id: source.supplierId });
    if (fact.status === "DRAFT" && apply) await call("post_finance_fact", { id: fact.id, expected_version: fact.version });
    fact = check(factNo, (await call("get_finance_fact", { id: fact.id })).finance_fact, { status: "POSTED" });
    cases.push({ fact, source, type: "purchase_order", direction: "DISBURSEMENT", partyType: "SUPPLIER", code: "FK", corrected: usedPurchaseOrders.size === 2 });
    if (usedPurchaseOrders.size === 2) break;
  }
  assert.equal(usedPurchaseOrders.size, 2, "two exact approved purchase receipts are required for prepaid allocation");
  for (const currency of ["USD", "HKD"]) {
    const source = orders.find((order) => order.currency === currency);
    assert.ok(source?.id, `${currency} sales order is missing`);
    cases.push({ source, currency, type: "sales_order", direction: "RECEIPT", partyType: "CUSTOMER", code: "SK" });
  }
  const evidence = [];
  for (const [index, { fact, source, type, direction, partyType, code, corrected, currency }] of cases.entries()) {
    const paymentNo = businessNo(plan, code, 841 + index);
    const expected = {
      payment_no: paymentNo, kind: "ADVANCE", direction, counterparty_type: partyType,
      counterparty_id: source.customerId ?? source.supplierId, currency: fact?.currency ?? currency,
      source_type: type, source_id: source.id, amount: "5",
    };
    let payment = exact((await call("list_finance_payments", { keyword: paymentNo, limit: 20 })).payments, "payment_no", paymentNo);
    if (!payment && apply) payment = (await call("create_finance_payment", {
      ...expected, account_ref: "演练结算户", evidence_ref: `${paymentNo}-银行回单`,
      purpose_note: "按订单登记首款，到账后按往来单核销。", idempotency_key: `manual-acceptance:${plan.runId}:form-payment:${paymentNo}`,
    })).payment;
    check(paymentNo, payment, expected);
    if (apply && payment.status !== "POSTED") payment = await transitionPayment({ rpc, payment, desiredStatus: "POSTED" });
    payment = check(paymentNo, (await call("get_finance_payment", { id: payment.id })).payment, { ...expected, status: "POSTED" });
    const readCandidates = async () => (await call("list_finance_payment_allocation_candidates", { id: payment.id })).facts;
    let correction;
    if (corrected) {
      assert.ok(fact, `${paymentNo} correction needs an exact fact`);
      let allocations = payment.allocations.filter((item) => item.finance_fact_id === fact.id);
      if (!allocations.length && apply) {
        assert.ok((await readCandidates()).some((item) => item.id === fact.id && Number(item.outstanding_amount) >= 2), `${paymentNo} has insufficient allocatable balance`);
        payment = (await call("allocate_finance_payment", {
          id: payment.id, expected_version: payment.version, allocations: [{ finance_fact_id: fact.id, amount: "2" }],
          idempotency_key: `manual-acceptance:${plan.runId}:form-allocation:${paymentNo}`,
        })).payment;
        allocations = payment.allocations.filter((item) => item.finance_fact_id === fact.id);
      }
      const original = check(paymentNo, exact(allocations, "reversal_of_allocation_id", null), { status: "POSTED", amount: "2" });
      const reason = "核销分配录入有误，撤销后重新核对";
      let reversal = exact(allocations, "reversal_of_allocation_id", original.id);
      if (!reversal && apply) {
        await call("reverse_finance_allocation", { id: payment.id, expected_version: payment.version, allocation_id: original.id, reason });
        payment = (await call("get_finance_payment", { id: payment.id })).payment;
        reversal = exact(payment.allocations, "reversal_of_allocation_id", original.id);
      }
      check(paymentNo, reversal, { status: "REVERSED", finance_fact_id: fact.id, currency: payment.currency, amount: original.amount, reason });
      correction = { allocationId: original.id, reversalId: reversal.id };
    }
    assert.equal(payment.available_amount, "5", `${paymentNo} has no available advance`);
    const candidates = await readCandidates();
    if (fact) assert.ok(candidates.some((item) => item.id === fact.id && Number(item.outstanding_amount) > 0), `${paymentNo} does not offer ${fact.fact_no} for allocation`);
    else assert.equal(candidates.length, 0, `${paymentNo} should await shipment`);
    const attachments = await ensurePaymentEvidence({ rpc, apply, payment, corrected });
    evidence.push({ paymentNo, id: payment.id, currency: payment.currency, direction, orderNo: source.orderNo,
      availableAmount: payment.available_amount, candidateFactNos: candidates.map((row) => row.fact_no),
      corrected: Boolean(corrected), correction, attachments });
  }
  return evidence;
}

export async function prepareFormCoverageShipment({ plan, orders, rpc, apply, businessNo }) {
  const order = orders.find((item) => item.stock.filter((line) => line.checkpoint === "ready").length >= 3);
  assert.ok(order?.id && order.deliverySnapshot?.address, "rich shipment has no sales order with a delivery snapshot");
  const shipmentNo = businessNo(plan, "CK", 841);
  const expected = {
    shipment_no: shipmentNo, sales_order_id: order.id, customer_id: order.customerId,
    delivery_snapshot: { ...order.deliverySnapshot, address: `广东省东莞市${order.deliverySnapshot.address}` },
    planned_ship_at: Date.parse(`${plan.anchorDate}T09:00:00+08:00`) / 1000 + 7 * 86400,
    transport_method: "公路零担", carrier_name: "演练园区配送", tracking_no: `${plan.prefix}-FM-WL-01`,
    package_count: 6, gross_weight_kg: "18.4", volume_m3: "0.32", shipping_mark: `${plan.prefix}-FM-A`,
    freight_amount: "38.5", freight_currency: "CNY", note: "到货时按箱号核对规格和数量。",
  };
  const items = shipmentFormItems(order.stock);
  const shipment = await ensureFormShipmentDraft({ plan, rpc, apply, expected, items });
  return shipmentEvidence(shipment, order.orderNo);
}

function shipmentFormItems(lines) {
  return lines.map((line, index) => ({
    sales_order_item_id: line.salesOrderItemId, product_id: line.productId, product_sku_id: line.productSkuId,
    warehouse_id: line.warehouseId, unit_id: line.unitId, lot_id: line.lotId, quantity: line.quantity,
    package_description: "每个规格独立装箱，外箱贴款号和数量标签", case_no: `A${index + 1}-01 / A${index + 1}-02`,
  }));
}

async function ensureFormShipmentDraft({ plan, rpc, apply, expected, items }) {
  const shipmentNo = expected.shipment_no;
  const call = (method, params) => rpc({ actor: "sales", domain: "operational_fact", method, params });
  const listed = await call("list_shipments", { keyword: shipmentNo, limit: 20 });
  let shipment = exact(listed.shipments, "shipment_no", shipmentNo);
  if (!shipment && apply) shipment = (await call("create_shipment_with_items", {
    ...expected, items, idempotency_key: `manual-acceptance:${plan.runId}:form-shipment:${shipmentNo}`,
  })).shipment;
  check(shipmentNo, shipment, { shipment_no: shipmentNo });
  shipment = check(shipmentNo, (await call("get_shipment", { id: shipment.id })).shipment, expected);
  assert.ok(["DRAFT", "SHIPPED"].includes(shipment.status), `${shipmentNo} was cancelled or lost its source`);
  assert.equal(shipment.items.length, items.length);
  for (const item of items) check(shipmentNo, exact(shipment.items, "sales_order_item_id", item.sales_order_item_id), item);
  return shipment;
}

function shipmentEvidence(shipment, orderNo) {
  return { id: shipment.id, shipmentNo: shipment.shipment_no, orderNo, status: shipment.status,
    lineCount: shipment.items.length, warehouseIds: [...new Set(shipment.items.map((item) => item.warehouse_id))], trackingNo: shipment.tracking_no,
    netWeightGrams: shipment.total_net_weight_g };
}

function detailedShipmentHeader(plan, order, address, items, sequence, businessNo) {
  const total = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const transport = ["公路零担", "快递", "客户自提"][sequence % 3];
  return {
    shipment_no: businessNo(plan, "CK", sequence), sales_order_id: order.id, customer_id: order.customerId,
    delivery_snapshot: address, planned_ship_at: Date.parse(`${plan.anchorDate}T09:00:00+08:00`) / 1000 + (8 + sequence % 9) * 86400,
    transport_method: transport, carrier_name: transport === "客户自提" ? "演练自提车队" : "演练园区配送",
    tracking_no: `${plan.prefix}-FM-WL-${sequence}`, package_count: items.length + 1,
    gross_weight_kg: String(Math.ceil(total * 0.62 + 2)), volume_m3: ((items.length * 10 + 12) / 100).toFixed(2),
    shipping_mark: `${plan.prefix}-FM-${sequence}`, freight_amount: transport === "客户自提" ? "0" : String(25 + sequence % 12),
    freight_currency: "CNY", note: "按本次出货数量分装，点数后按箱号核对。",
  };
}

export async function prepareFormCoverageShipmentDetails({ plan, orders, sources, readyShipments, rpc, apply, businessNo }) {
  const records = [];
  const regular = readyShipments.filter((order) => order.kind === "ready").slice(1, 4);
  assert.equal(regular.length, 3, "rich shipment drafts require the three ready source orders");
  for (const [index, source] of regular.entries()) {
    const { sales_order: sales } = await rpc({ actor: "sales", domain: "sales_order", method: "get_sales_order", params: { id: source.salesOrderId } });
    const { customer } = await rpc({ actor: "sales", domain: "masterdata", method: "get_customer", params: { id: sales.customer_id } });
    assert.equal(sales.order_no, source.orderNo);
    const order = { id: sales.id, customerId: customer.id, orderNo: sales.order_no };
    const address = { country_region: customer.country_region, recipient: customer.default_delivery_recipient,
      phone: customer.default_delivery_phone, address: customer.default_delivery_address };
    assert.ok(address.recipient && address.phone && address.address, `${order.orderNo} needs populated delivery defaults`);
    for (const half of [0, 1]) {
      const items = shipmentFormItems(source.lines.map((line) => {
        const quantity = Number(line.quantity);
        assert.ok(Number.isSafeInteger(quantity) && quantity >= 2 && line.lotId > 0, `${order.orderNo} has no exact stock to split`);
        const first = Math.floor(quantity / 2);
        return { ...line, quantity: String(half ? quantity - first : first) };
      }));
      const expected = detailedShipmentHeader(plan, order, address, items, 850 + index * 2 + half, businessNo);
      records.push(shipmentEvidence(await ensureFormShipmentDraft({ plan, rpc, apply, expected, items }), order.orderNo));
    }
  }
  const postedSources = sources.filter((item) => item.postShipment);
  assert.ok(postedSources.length > 0, "posted shipment samples have no source orders");
  for (const [index, source] of postedSources.entries()) {
    const order = exact(orders, "id", source.salesOrder.id);
    assert.equal(order.stock.length, 1, "posted shipment sample requires one independent stock lot");
    const [line] = order.stock;
    const items = shipmentFormItems(order.stock);
    const sequence = 864 + index;
    const address = { ...order.deliverySnapshot, address: `广东省东莞市${order.deliverySnapshot.address}` };
    const expected = detailedShipmentHeader(plan, order, address, items, sequence, businessNo);
    let shipment = await ensureFormShipmentDraft({ plan, rpc, apply, expected, items });
    const factNo = businessNo(plan, "YS", sequence);
    const amount = order.lines[0].amount;
    const key = `manual-acceptance:${plan.runId}:form-shipment:${sequence}`;
    if (shipment.status === "DRAFT" && apply) {
      ({ shipment } = await applyFinishedGoodsDeliveryProcess({ rpc, shipment,
        productId: line.productId, finishedGoodsLotId: line.lotId, warehouseId: line.warehouseId,
        inspectionNo: businessNo(plan, "CKZJ", sequence), expectedAmount: amount, receivableSourceNo: factNo,
        processIdempotencyKey: `${key}:process`, approvalIdempotencyKey: `${key}:approval`, receivableIdempotencyKey: `${key}:receivable` }));
    }
    assert.equal(shipment.status, "SHIPPED", `${shipment.shipment_no} is not shipped`);
    const [shipped] = shipment.items;
    assert.ok(Number(shipped.unit_net_weight_g_snapshot) > 0 && Number(shipment.total_net_weight_g) === Number(shipped.unit_net_weight_g_snapshot) * Number(shipped.quantity), `${shipment.shipment_no} has no exact net weight snapshot`);
    const finance = (method, params) => rpc({ actor: "finance", domain: "operational_fact", method, params });
    const read = async () => exact((await finance("list_finance_facts", { keyword: factNo, limit: 20 })).finance_facts, "fact_no", factNo);
    let receivable = await read();
    if (!receivable && apply) {
      receivable = (await finance("create_receivable_from_shipment", { fact_no: factNo, shipment_id: shipment.id, idempotency_key: `${key}:receivable` })).finance_fact;
    }
    if (receivable?.status === "DRAFT" && apply) {
      receivable = (await finance("post_finance_fact", { id: receivable.id, expected_version: receivable.version })).finance_fact;
    }
    check(factNo, receivable, { source_id: shipment.id, source_type: "SHIPMENT", amount, status: "POSTED" });
    const { inventory_txns: txns } = await rpc({ actor: "warehouse", domain: "inventory", method: "list_inventory_txns", params: { lot_id: line.lotId, limit: 20 } });
    const issued = txns.find((row) => row.source_type === "SHIPMENT" && row.source_id === shipment.id && row.txn_type === "OUT");
    check(shipment.shipment_no, issued, { lot_id: line.lotId, warehouse_id: line.warehouseId, quantity: line.quantity });
    line.shipped = true;
    line.readyToShip = "0";
    records.push({ ...shipmentEvidence(shipment, order.orderNo), receivableNo: factNo, issueTxnId: issued.id });
  }
  return records;
}

export async function verifyFormCoveragePlanning({ rpc, orders }) {
  const result = [];
  for (const order of orders.filter(({ stock, mediaCase, materialPreview }) => stock.length === 0 && !mediaCase && !materialPreview)) {
    const { options, total } = await rpc({ actor: "pmc", domain: "production_order", method: "list_production_order_reference_options", params: {
      reference_type: "sales_order_item", keyword: order.orderNo, limit: 20, offset: 0,
    } });
    assert.equal(total, order.lines.length, `${order.orderNo} planning list is incomplete`);
    for (const line of order.lines) {
      const option = exact(options, "value", line.salesOrderItemId);
      assert.ok(option?.selectable && Number(option.remaining_plannable_quantity) > 0, `${order.orderNo} line ${line.lineNo} is not selectable`);
      assert.equal(option.sales_order_no, order.orderNo);
      assert.equal(option.sku_value, line.productSkuId);
      assert.equal(option.unit_value, line.unitId);
    }
    result.push({ orderNo: order.orderNo, eligibleLines: options.length });
  }
  return result;
}

export async function verifyFormCoveragePurchases({ engineering, materialPreview, rpc }) {
  const arrivals = [];
  const approvals = [];
  for (const source of materialPreview.materialRequests) {
    const request = await rpc({ actor: "engineering", domain: "sales_order", method: "get_engineering_material_request",
      params: { sales_order_id: source.salesOrderId } });
    assert.equal(request.status, "SUBMITTED", `${source.orderNo} must await material review`);
    const { tasks } = await rpc({ actor: "boss", domain: "workflow", method: "list_tasks",
      params: { source_type: "engineering_material_request", source_id: request.id, limit: 20 } });
    const task = exact(tasks, "task_status_key", "ready");
    assert.ok(task?.display_context?.available && task.display_context.items.some((item) => item.kind === "product" && item.image_attachment_id > 0), `${source.orderNo} has no material review with a product photo`);
    approvals.push({ sourceOrderNo: source.orderNo, requestId: request.id, taskCode: task.task_code });
  }
  for (const source of engineering.materialRequests) {
    const request = await rpc({ actor: "engineering", domain: "sales_order", method: "get_engineering_material_request",
      params: { sales_order_id: source.salesOrderId, request_id: source.id } });
    assert.equal(request.status, "APPROVED", `${source.orderNo} procurement source is not approved`);
    assert.equal(request.id, source.id, `${source.orderNo} procurement source changed`);
    const generated = [...request.purchase_orders].sort((a, b) => a.supplier_id - b.supplier_id);
    assert.ok(generated.length >= 2, `${source.orderNo} needs purchase samples from two suppliers`);
    for (const ref of generated.slice(0, 3)) {
      const params = { id: ref.id };
      const { purchase_order: order } = await rpc({ actor: "purchase", domain: "purchase_order", method: "get_purchase_order", params });
      check(ref.purchase_order_no, order, { purchase_order_no: ref.purchase_order_no, supplier_id: ref.supplier_id });
      assert.equal(String(order.lifecycle_status).toUpperCase(), "APPROVED", `${ref.purchase_order_no} must come from an approved material request`);
      const { tasks } = await rpc({ actor: "warehouse", domain: "workflow", method: "list_tasks",
        params: { source_type: "purchase_order", source_id: order.id, task_group: "handoff_purchase_arrival", limit: 20 } });
      const task = exact(tasks, "task_status_key", "ready");
      assert.ok(task?.display_context?.available, `${ref.purchase_order_no} has no ready task with source`);
      const productIds = [...new Set(task.display_context.items.filter((item) => item.kind === "product" && item.image_attachment_id > 0).map((item) => item.product_id))];
      assert.ok(productIds.length && productIds.every((id) => request.sources.some((line) => line.product_id === id)), `${ref.purchase_order_no} task must show products from its own approval`);
      const { purchase_order_receipt_progress: progress } = await rpc({ actor: "warehouse", domain: "purchase_order", method: "get_purchase_order_receipt_progress", params });
      const receivableLines = progress.items.filter((line) => line.can_generate && Number(line.remaining_generatable_quantity) > 0).length;
      assert.ok(receivableLines, `${ref.purchase_order_no} has no receiving lines`);
      arrivals.push({ orderNo: order.purchase_order_no, orderId: order.id, sourceOrderNo: source.orderNo,
        taskCode: task.task_code, productIds, receivableLines });
    }
  }
  return { approvals, arrivals };
}

export async function verifyFormCoverageWarehouseWork({ rpc, orders, sourceReport }) {
  const stages = {
    "pending-return": { kind: "RETURN", stage: "AWAITING_RETURN" },
    "draft-receipt": { kind: "RECEIPT", stage: "AWAITING_INBOUND" },
    "pending-inspection": { kind: "RECEIPT", stage: "AWAITING_QUALITY" },
    "pending-packaging": { kind: "RECEIPT", stage: "AWAITING_PACKAGING" },
  };
  const evidence = [];
  for (const line of orders.flatMap((order) => order.stock)) {
    const filter = stages[line.checkpoint];
    if (!filter) continue;
    const product = exact(sourceReport.referenceRecords.products, "id", line.productId);
    const sku = exact(sourceReport.referenceRecords.skus, "id", line.productSkuId);
    const { items } = await rpc({ actor: "warehouse", domain: "production_wip", method: "list_warehouse_production_work", params: {
      ...filter, keyword: line.productionOrderNo, limit: 20, offset: 0,
    } });
    const work = check(line.productionOrderNo, exact(items, "order_no", line.productionOrderNo), {
      ...filter, product_id: product.id, product_code: product.code, product_name: product.name,
      sku_code: sku.code, quantity: line.quantity, ...(line.receiptId ? { fact_id: line.receiptId, warehouse_id: line.warehouseId } : {}),
    });
    const { images } = await rpc({ actor: "warehouse", domain: "attachment", method: "list_product_image_references", params: { product_ids: [line.productId] } });
    const image = exact(images, "product_id", line.productId);
    assert.ok(image?.image_attachment_id > 0, `${line.productionOrderNo} has no product thumbnail`);
    let taskCode;
    if (line.checkpoint === "pending-packaging") {
      const route = await rpc({ actor: "production", domain: "production_wip", method: "get_production_wip", params: { production_order_id: work.production_order_id } });
      const confirmation = exact(route.packaging_confirmations, "production_order_item_id", work.production_order_item_id);
      assert.equal(confirmation?.status, "PENDING", `${work.order_no} has no packaging confirmation to handle`);
      taskCode = await readFormSourceTaskPhoto(rpc, "sales", "production_packaging_confirmation", confirmation.id, "handoff_production_packaging", product.id, image.image_attachment_id);
    }
    evidence.push({ ...filter, orderNo: work.order_no, receiptNo: work.fact_no || null, workId: work.id,
      productCode: product.code, skuCode: sku.code, imageId: image.image_attachment_id, taskCode });
  }
  return evidence;
}

async function readFormSourceTaskPhoto(rpc, role, sourceType, sourceId, group, productId, attachmentId) {
  const { tasks } = await rpc({ actor: role, domain: "workflow", method: "list_tasks", params: { source_type: sourceType, source_id: sourceId, task_group: group, limit: 20 } });
  const task = exact(tasks, "task_status_key", "ready");
  assert.ok(task?.display_context?.available && task.display_context.items.some((item) => item.kind === "product" && item.product_id === productId && item.image_attachment_id === attachmentId), `${sourceType} ${sourceId} has no ready task with its product photo`);
  return task.task_code;
}

export async function prepareFormCoverageOutsourcingReturns({ plan, sourceReport, original, orders, rpc, tokens, fetchImpl, apply, businessNo }) {
  const call = (method, params) => rpc({ actor: "warehouse", domain: "operational_fact", method, params });
  const read = async (factNo) => exact((await call("list_outsourcing_facts", { fact_type: "RETURN_RECEIPT", keyword: factNo, limit: 20 })).outsourcing_facts, "fact_no", factNo);
  const candidate = sourceReport.referenceRecords.sourceDrivenFacts.sourceCandidates.outsourcingCandidates.find(({ order, item }) =>
    order.id === original.source_id && item.outsourcingOrderItemId === original.source_line_id);
  assert.ok(candidate?.order.orderNo.startsWith(`${plan.prefix}-`), "outsourcing receipt must use a current independent contract line");
  const skuOrder = orders.find((order) => order.stock.some((line) => line.checkpoint === "ready"));
  const skuLine = skuOrder.lines[0];
  const contract = async (method, params) => rpc({ actor: "admin", domain: "outsourcing_order", method, params });
  const template = (await contract("get_outsourcing_order", { id: original.source_id })).outsourcing_order;
  const orderNo = `${plan.prefix}-FM-WW-001`;
  const header = { outsourcing_order_no: orderNo, supplier_id: template.supplier_id, source_order_no: skuOrder.orderNo };
  const item = { line_no: 1, subject_type: "PRODUCT", product_id: skuLine.productId, product_sku_id: skuLine.productSkuId,
    unit_id: skuLine.unitId, process_id: candidate.item.processId, processing_item: "按产品规格加工", outsourcing_quantity: "12", unit_price: "4", amount: "48" };
  const readContract = async () => exact((await contract("list_outsourcing_orders", { keyword: orderNo, limit: 20 })).outsourcing_orders, "outsourcing_order_no", orderNo);
  let order = await readContract();
  if (!order && apply) {
    await contract("save_outsourcing_order_with_items", {
      ...header, currency: template.currency, order_date: template.order_date, expected_return_date: template.expected_return_date,
      supplier_snapshot: template.supplier_snapshot, contract_party_snapshot: template.contract_party_snapshot,
      note: "按指定规格加工，分批回货。", items: [item],
    });
    order = await readContract();
  }
  check(orderNo, order, header);
  const { outsourcing_order_items: lines } = await contract("list_outsourcing_order_items", { outsourcing_order_id: order.id, limit: 2 });
  assert.equal(lines.length, 1, `${orderNo} must contain the specified SKU`);
  const line = check(orderNo, lines[0], item);
  const status = apply ? await advanceOutsourcingOrderLifecycle({
    plan, token: tokens.admin, fetchImpl, item: order, current: order.lifecycle_status, target: "CONFIRMED",
    lifecycleActions: { CONFIRMED: [
      { method: "submit_outsourcing_order", resultStatus: "SUBMITTED" },
      { method: "confirm_outsourcing_order", resultStatus: "CONFIRMED" },
    ] },
  }) : String(order.lifecycle_status).toUpperCase();
  assert.equal(status, "CONFIRMED", `${orderNo} contract is not confirmed`);

  const cases = [
    { ...original, orderNo: candidate.order.orderNo },
    { orderNo, source_id: order.id, source_line_id: line.id, subject_id: line.product_id, product_sku_id: line.product_sku_id, unit_id: line.unit_id },
  ];
  const result = [];
  for (const [index, source] of cases.entries()) {
    const sequence = 841 + index;
    const factNo = businessNo(plan, "WWHG", sequence);
    let draft = await read(factNo);
    if (!draft && apply) {
      await call("create_outsourcing_return_receipt_from_order", {
        fact_no: factNo, outsourcing_order_id: source.source_id, outsourcing_order_item_id: source.source_line_id,
        warehouse_id: plan.productWarehouse.id, new_lot_no: businessNo(plan, "WWCP", sequence), quantity: "2",
        idempotency_key: `manual-acceptance:${plan.runId}:form-outsourcing-return${index ? `:${sequence}` : ""}`, note: "核对两件加工样品回货，等待仓库确认。",
      });
      draft = await read(factNo);
    }
    check(factNo, draft, {
      status: "DRAFT", fact_type: "RETURN_RECEIPT", source_type: "OUTSOURCING_ORDER", source_id: source.source_id, source_line_id: source.source_line_id,
      subject_type: "PRODUCT", subject_id: source.subject_id, product_sku_id: source.product_sku_id, unit_id: source.unit_id,
      warehouse_id: plan.productWarehouse.id, quantity: "2",
    });
    const { images } = await rpc({ actor: "warehouse", domain: "attachment", method: "list_product_image_references", params: { product_ids: [draft.subject_id] } });
    const image = exact(images, "product_id", draft.subject_id);
    assert.ok(image?.image_attachment_id > 0, `${factNo} has no product thumbnail`);
    const taskCode = await readFormSourceTaskPhoto(rpc, "warehouse", "outsourcing_fact", draft.id, "handoff_outsourcing_inbound", draft.subject_id, image.image_attachment_id);
    result.push({ id: draft.id, factNo, orderNo: source.orderNo, productId: draft.subject_id, skuCode: draft.sku_code_snapshot, imageId: image.image_attachment_id, taskCode });
  }
  return result;
}

export async function prepareFormCoverageInventoryCount({ plan, purchase, orders, rpc, apply, businessNo }) {
  const product = orders.flatMap((item) => item.stock).find((row) => row.checkpoint === "pending-packaging");
  const material = [...purchase.materialStock.values()].find((row) => row.warehouseId === plan.materialWarehouse.id && Number(row.availableQuantity) >= 5 && Number.isInteger(Number(row.availableQuantity)));
  assert.ok(product && material, "inventory count requires posted product and material lots");
  const operationNo = businessNo(plan, "KCTZ", 841);
  const call = (method, params) => rpc({ actor: "warehouse", domain: "inventory", method, params });
  const read = async () => {
    for (let offset = 0; offset < 10_000; offset += 100) {
      const result = await call("list_inventory_operations", { operation_type: "CYCLE_COUNT", limit: 100, offset });
      const match = exact(result.inventory_operations, "operation_no", operationNo);
      if (match) return (await call("get_inventory_operation", { id: match.id })).inventory_operation;
      if (offset + result.inventory_operations.length >= result.total) return undefined;
      assert.ok(result.inventory_operations.length > 0, "inventory operation listing was truncated");
    }
    throw new Error("inventory count search exceeded its page budget");
  };
  let operation = await read();
  const expectedGrain = [
    { line_no: "1", subject_type: "PRODUCT", subject_id: product.productId, product_sku_id: product.productSkuId, unit_id: product.unitId,
      from_warehouse_id: product.warehouseId, from_lot_id: product.lotId },
    { line_no: "2", subject_type: "MATERIAL", subject_id: material.materialId, unit_id: material.unitId,
      from_warehouse_id: material.warehouseId, from_lot_id: material.lotId },
  ];
  if (!operation && apply) {
    const items = [];
    for (const grain of expectedGrain) {
      const { inventory_balances: balances } = await call("list_inventory_balances", { lot_id: grain.from_lot_id, warehouse_id: grain.from_warehouse_id, limit: 20 });
      const current = balances.find((row) => row.subject_id === grain.subject_id && row.unit_id === grain.unit_id && (row.product_sku_id ?? null) === (grain.product_sku_id ?? null));
      assert.ok(Number.isSafeInteger(Number(current?.quantity)) && Number(current.quantity) > 1, "cycle count specimen requires an integer posted balance");
      items.push({ ...grain, expected_quantity: current.quantity, counted_quantity: String(Number(current.quantity) - (grain.subject_type === "MATERIAL" ? 1 : 0)) });
    }
    await call("create_inventory_operation", {
      operation_no: operationNo, operation_type: "CYCLE_COUNT", reason: "实盘核对成品与材料；材料少一单位，待复核。",
      idempotency_key: `manual-acceptance:${plan.runId}:form-count`, items,
    });
    operation = await read();
  }
  check(operationNo, operation, { operation_type: "CYCLE_COUNT", status: "DRAFT" });
  assert.equal(operation.items.length, 2);
  for (const grain of expectedGrain) check(operationNo, exact(operation.items, "line_no", grain.line_no), {
    ...grain, adjustment_quantity: grain.subject_type === "MATERIAL" ? "-1" : "0",
  });
  return { id: operation.id, operationNo, status: operation.status, productId: product.productId, materialId: material.materialId };
}
