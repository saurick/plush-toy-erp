import assert from 'node:assert/strict';
import { advanceSalesOrderLifecycleThroughProcess } from './manual-acceptance-source-data.mjs';
import { prepareManualAcceptanceEngineering } from './manual-acceptance-engineering-data.mjs';
import { warehouseOptionFromRecord } from '../../web/src/erp/utils/referenceSelectOptions.mjs';
import { materialWarehouseOptions } from '../../web/src/erp/utils/warehouseClassification.mjs';
import { assignTransactionWarehouseScopes } from './transaction-real-backend-fixture.mjs';
import { RpcErrorCode as CODE } from '../../web/src/common/consts/errorCodes.generated.js';
import { clickRPC, modal, pageAction, selectOption } from './transaction-browser-ui.mjs';

export const PARTIAL_RECEIVING_KEYS = Object.freeze(['desktop_partial_receiving', 'mobile_partial_receiving']);

export function assertPartialReceivingEvidence(flows) {
  assert.deepEqual(flows.map(({ key }) => key), PARTIAL_RECEIVING_KEYS);
  for (const flow of flows) {
    for (const field of ['sourceID', 'receiptID', 'payableID']) assert.ok(Number.isSafeInteger(flow[field]) && flow[field] > 0, `${flow.key}.${field}`);
    for (const field of ['passed', 'unpricedBlocked', 'partialPosted', 'rejectedUnposted', 'dispositionSettled', 'frozenSnapshotPreserved', 'priceReplayExact', 'forbiddenUnchanged', 'changedIntentRejected', 'payableVerified']) assert.equal(flow[field], true, `${flow.key}.${field}`);
    assert.equal(flow.payableAmount, 10);
    assert.equal(flow.dispositionSurface, 'desktop');
    assert.equal(flow.pricingSurface, 'desktop');
    assert.equal(flow.payableSurface, 'api');
    assert.equal(flow.priceEvents, 1);
    assert.equal(flow.transportFaults.length, 1);
    assert.equal(flow.transportFaults[0].injected, true);
    assert.equal(flow.transportFaults[0].backendCode, 0);
    assert.equal(flow.transportFaults[0].method, 'complete_purchase_order_terms');
    assert.ok(flow.transportFaults[0].requestID);
  }
}

// Engineering approval is fixture preparation. Counting, quality decisions,
// partial inbound, rejection disposition and late pricing use real product UI.
export async function runPartialReceiving({ client, fixture, options, report, open, snapshot, stock, rejected, lost, decide, popup, screenshot, expect, auditForm }) {
  report.partialReceiving = [];
  for (const mobile of [false, true]) {
    const prefix = `${fixture.prefix}-${mobile ? 'MPART' : 'DPART'}`;
    const flow = { key: `${mobile ? 'mobile' : 'desktop'}_partial_receiving`, transportFaults: [], dispositionSurface: 'desktop', pricingSurface: 'desktop', payableSurface: 'api' };
    report.partialReceiving.push(flow);
    const { material } = await client.rpc('admin', 'masterdata', 'create_material', { code: `${prefix}-MAT`, name: '模拟分包质检材料', stock_category: 'MAIN', default_unit_id: fixture.material.default_unit_id, supplier_id: fixture.supplier.id });
    assert.equal(material.stock_category, 'MAIN');
    const { warehouses } = await client.rpc('admin', 'masterdata', 'list_warehouses', { limit: 100 });
    const [warehouse] = materialWarehouseOptions(warehouses, material);
    assert.ok(warehouse, 'the new material needs a compatible material warehouse');
    await assignTransactionWarehouseScopes(client, [fixture.warehouse.id, warehouse.id]);
    const { product } = await client.rpc('admin', 'masterdata', 'create_product', { code: `${prefix}-PROD`, name: '模拟分包补价产品', default_unit_id: material.default_unit_id });
    let { bom_version: bom } = await client.rpc('engineering', 'bom', 'save_bom_with_items', { product_id: product.id, version: `${prefix}-BOM`, items: [{ material_id: material.id, unit_id: material.default_unit_id, quantity: '1', loss_rate: '0', position: '模拟用料' }] });
    ({ bom_version: bom } = await client.rpc('engineering', 'bom', 'activate_bom_version', { id: bom.id }));
    const { sales_order: salesOrder } = await client.rpc('sales', 'sales_order', 'save_sales_order_with_items', { order_no: `${prefix}-SO`, order_date: new Date().toISOString().slice(0, 10), customer_id: fixture.customer.id, currency: 'CNY', payment_method: '银行转账', payment_term_days: 0, tax_mode: 'NONE', freight_terms: 'INCLUDED', items: [{ line_no: 1, product_id: product.id, unit_id: material.default_unit_id, ordered_quantity: '10', unit_price: '3.5', amount: '35' }] });
    await advanceSalesOrderLifecycleThroughProcess({ plan: { backendURL: options.backendURL, runId: options.runID }, record: { order_no: salesOrder.order_no, targetStatus: 'ACTIVE' }, item: salesOrder, token: client.roleTokens().admin, roleTokens: client.roleTokens(), fetchImpl: fetch, report: { steps: [] } });
    await prepareManualAcceptanceEngineering({ plan: { prefix: 'SIM-E2E', productionCandidates: [{ salesOrder: { id: salesOrder.id, orderNo: salesOrder.order_no } }] }, sourceReport: { referenceRecords: { products: [product], bomVersions: [{ id: bom.id, version: bom.version, productId: product.id, status: 'ACTIVE' }] } }, rpc: ({ actor, domain, method, params }) => client.rpc(actor, domain, method, params) });
    const request = await client.rpc('engineering', 'sales_order', 'get_engineering_material_request', { sales_order_id: salesOrder.id });
    assert.equal(request.purchase_orders.length, 1);
    const orderID = request.purchase_orders[0].id;
    const orderItems = snapshot('purchase_order_items', `purchase_order_id=${orderID}`);
    assert.equal(orderItems.length, 1);
    assert.equal(orderItems[0].unit_price, null);
    let page = await open('warehouse', mobile, 'purchase/orders', orderID, true);
    await pageAction(page, '登记到货');
    const count = await modal(page, '登记采购到货');
    await count.getByLabel('入库单号', { exact: true }).fill(`${prefix}-IN`);
    await selectOption(page, count.getByRole('combobox', { name: '第1条入库仓库', exact: true }), warehouseOptionFromRecord(warehouse).label);
    for (const [index, quantity, declared] of [[1, '4', '5'], [2, '6', '7']]) {
      if (index === 2) await count.getByRole('button', { name: /增加一卷 \/ 包/u }).click();
      await count.getByRole('spinbutton', { name: `第${index}条实点数量`, exact: true }).fill(quantity);
      await count.getByRole('spinbutton', { name: `第${index}条标示数量`, exact: true }).fill(declared);
      await count.getByRole('textbox', { name: `第${index}条批次号`, exact: true }).fill(`${prefix}-ROLL${index}`);
    }
    const { purchase_receipt: receipt } = await clickRPC(page, 'create_purchase_receipt_from_purchase_order', () => count.getByRole('button', { name: '保存到货并送检', exact: true }).click());
    await expect(count).toBeHidden();
    const frozen = snapshot('purchase_receipt_items', `receipt_id=${receipt.id}`);
    assert.deepEqual(frozen.map((row) => [Number(row.quantity), Number(row.declared_quantity), row.unit_price]), [[4, 5, null], [6, 7, null]]);
    const inspections = snapshot('quality_inspections', `purchase_receipt_id=${receipt.id}`);
    assert.equal(inspections.length, 2);
    const inspectionFor = (item) => inspections.find((row) => row.purchase_receipt_item_id === item.id);
    await decide(inspectionFor(frozen[0]).id, mobile);
    await decide(inspectionFor(frozen[1]).id, mobile, true);
    page = await open('warehouse', mobile, 'warehouse/inbound', receipt.id);
    await pageAction(page, '确认材料入库');
    await popup(page, 'post_purchase_receipt');
    assert.deepEqual(stock(frozen[0].lot_id), { balance: 4, net: 4, txns: 1, lot: 'ACTIVE' });
    assert.deepEqual(stock(frozen[1].lot_id), { balance: 0, net: 0, txns: 0, lot: 'REJECTED' });
    flow.partialPosted = flow.rejectedUnposted = true;
    const payableParams = { purchase_receipt_id: receipt.id, fact_no: `${prefix}-AP`, idempotency_key: `${prefix}:ap` };
    await rejected('finance', 'operational_fact', 'create_payable_from_purchase_receipt', payableParams, CODE.BUSINESS_RULE_VIOLATION);
    const rejectedInspection = inspectionFor(frozen[1]);
    page = await open('purchase', false, 'production/quality-inspections', rejectedInspection.id);
    await pageAction(page, '不合格处置');
    const disposition = await modal(page, '首次来料不合格退厂处置');
    await disposition.getByLabel('处置单号', { exact: true }).fill(`${prefix}-REJECT`);
    await disposition.getByLabel('处置数量', { exact: true }).fill('6');
    await disposition.getByLabel('处置原因', { exact: true }).fill('模拟不合格卷退厂，未曾入库');
    await auditForm(disposition, flow, 'purchase-rejection-disposition');
    const { purchase_rejection_disposition: draft } = await clickRPC(page, 'create_purchase_rejection_disposition', () => disposition.getByRole('button', { name: '生成处置草稿', exact: true }).click());
    await disposition.getByRole('button', { name: '确认处置', exact: true }).click();
    await popup(page, 'post_purchase_rejection_disposition', '确认处置');
    assert.equal(snapshot('purchase_rejection_dispositions', `id=${draft.id}`)[0].status, 'POSTED');
    assert.deepEqual(stock(frozen[1].lot_id), { balance: 0, net: 0, txns: 0, lot: 'REJECTED' });
    flow.dispositionSettled = true;
    await rejected('finance', 'operational_fact', 'create_payable_from_purchase_receipt', payableParams, CODE.BUSINESS_RULE_VIOLATION);
    assert.deepEqual(snapshot('finance_facts', `source_type='purchase_receipt' AND source_id=${receipt.id}`), []);
    flow.unpricedBlocked = true;
    page = await open('purchase', false, 'purchase/orders', orderID, true);
    await pageAction(page, '补齐价格与交期');
    const terms = await modal(page, /补齐价格与交期/u);
    await terms.getByLabel('第1行单价', { exact: true }).fill('2.5');
    const params = await lost(page, 'purchase_order', 'complete_purchase_order_terms', () => terms.getByRole('button', { name: '保存', exact: true }).click(), flow);
    await expect(terms.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    const priced = snapshot('purchase_order_items', `purchase_order_id=${orderID}`);
    assert.equal(Number(priced[0].unit_price), 2.5);
    assert.deepEqual(snapshot('purchase_receipt_items', `receipt_id=${receipt.id}`), frozen);
    await rejected('warehouse', 'purchase_order', 'complete_purchase_order_terms', params, CODE.PERMISSION_DENIED);
    flow.forbiddenUnchanged = true;
    await rejected('purchase', 'purchase_order', 'complete_purchase_order_terms', { ...params, items: params.items.map((row) => ({ ...row, unit_price: '9' })) }, CODE.IDEMPOTENCY_CONFLICT);
    flow.changedIntentRejected = true;
    await clickRPC(page, 'complete_purchase_order_terms', () => terms.getByRole('button', { name: '保存', exact: true }).click());
    await expect(terms).toBeHidden();
    assert.deepEqual(snapshot('purchase_order_items', `purchase_order_id=${orderID}`), priced);
    assert.deepEqual(snapshot('purchase_receipt_items', `receipt_id=${receipt.id}`), frozen);
    flow.frozenSnapshotPreserved = flow.priceReplayExact = true;
    flow.priceEvents = client.query(`SELECT to_json(count(*)) FROM source_order_lifecycle_events WHERE source_type='purchase_order' AND source_id=${orderID} AND action_key='complete_terms'`);
    assert.equal(flow.priceEvents, 1);
    const { finance_fact: payable } = await client.rpc('finance', 'operational_fact', 'create_payable_from_purchase_receipt', payableParams);
    assert.equal(Number(payable.amount), 10);
    assert.deepEqual((await client.rpc('finance', 'operational_fact', 'create_payable_from_purchase_receipt', payableParams)).finance_fact, payable);
    flow.payableAmount = Number(payable.amount);
    flow.payableVerified = flow.passed = true;
    flow.sourceID = orderID;
    flow.receiptID = receipt.id;
    flow.frozen = frozen;
    flow.payableID = payable.id;
    await screenshot(page, flow.key);
  }
  assertPartialReceivingEvidence(report.partialReceiving);
}
