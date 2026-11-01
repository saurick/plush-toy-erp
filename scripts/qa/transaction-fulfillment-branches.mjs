import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepareTransactionSalesOrder, prepareTransactionReceivable, prepareTransactionProductionSource, postTransactionInventoryCount, assignTransactionWarehouseScopes } from './transaction-real-backend-fixture.mjs';
import { executeProductionWIPAction } from './manual-acceptance-source-driven-facts.mjs';
import { PRODUCTION_WIP_ROUTE_CODE } from '../../web/src/erp/utils/productionWipModel.mjs';
import { BUSINESS_ROUTE_PATHS as ROUTES } from '../../web/src/erp/utils/masterDataOrderView.mjs';
import { RpcErrorCode as CODE } from '../../web/src/common/consts/errorCodes.generated.js';
import { login, navigate, closePage, settleRPCPage } from './transaction-browser-ui.mjs';

const { expect } = createRequire(new URL('../../web/package.json', import.meta.url))('playwright/test');
const today = () => new Date().toISOString().slice(0, 10);
const customer = { customer_key: 'yoyoosun' };
export const FULFILLMENT_BRANCH_CASES = Object.freeze({
  stock_reservation: { label: '现有成品显式预留与释放', steps: { sales_to_production: ['sales_order:posts_fact:stock_reservation'] } },
  source_rejections: { label: '销售与采购审批拒绝', steps: {
    sales_to_production: ['sales_tasks:returns:sales_order'],
    purchase_to_inventory: ['purchase_task:returns:purchase_rejected'],
  } },
  purchase_correction: { label: '人工采购审批与质检纠正', steps: { purchase_to_inventory: [
    'purchase_order:starts_process:purchase_approval', 'purchase_approval:creates_task:purchase_task',
    'purchase_task:calls_domain_command:purchase_approval', 'purchase_approval:creates_fact_draft:purchase_receipt',
    'purchase_quality:creates_fact_draft:purchase_quality_correction', 'purchase_quality_correction:posts_fact:purchase_accepted',
  ] } },
  outsourcing_return: { label: '普通委外回货、质检与应付', steps: { outsourcing_to_inventory: [
    'outsourcing_issue:returns:outsourcing_return', 'outsourcing_return:creates_fact_draft:outsourcing_quality',
    'outsourcing_quality:posts_fact:outsourcing_lot', 'outsourcing_lot:creates_fact_draft:outsourcing_payable_draft',
  ] } },
  shipment_corrections: { label: '出货财务拒绝与已出货撤销', steps: { delivery_to_settlement: [
    'shipped:reverses:shipment_cancelled', 'shipment_release_task:returns:shipment_rejected',
  ] } },
  finance_adjustments: { label: '首款、退款、部分核销及财务纠正', steps: { finance_payment_and_reversal: [
    'payment_order:starts_process:finance_payment_process', 'finance_payment:starts_process:finance_payment_process',
    'finance_allocation:reverses:finance_payment', 'finance_payment:reverses:open_finance_fact',
    'open_finance_fact:posts_fact:finance_credit_note', 'finance_credit_note:posts_fact:settled_finance_fact',
    'finance_credit_note:reverses:open_finance_fact', 'finance_allocation:derives:open_finance_fact',
    'finance_credit_note:derives:open_finance_fact',
  ] } },
  production_over_issue: { label: '超领额度审批与实际领料', steps: { production_exception: [
    'production_exception_task:returns:production_exception_over_issue',
    'production_exception_over_issue:derives:affected_production_fact',
  ] } },
  production_scrap: { label: '生产异常拒绝、取消与报废执行', steps: { production_exception: [
    'production_exception_task:returns:production_exception_rejected', 'production_exception_execution:reworks:scrapped_wip',
  ] } },
});
export const FULFILLMENT_REMAINING_STEPS = Object.freeze(Object.entries(FULFILLMENT_BRANCH_CASES).flatMap(([caseKey, value]) =>
  Object.entries(value.steps).flatMap(([chainKey, keys]) => keys.map(key => ({ caseKey, chainKey, key })))));

const positive = value => { assert.ok(Number.isSafeInteger(value) && value > 0); return value; };
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));

export function assertFulfillmentBranchFlow(flow) {
  assert.ok(Object.hasOwn(FULFILLMENT_BRANCH_CASES, flow.key));
  assert.equal(flow.passed, true);
  assert.equal(flow.browserReadback?.length, 1);
  positive(flow.browserReadback[0].sourceID);
  assert.equal(flow.browserReadback[0].screenshot, `branch-${flow.key}.png`, 'only the owned case screenshot may be published');
  const r = flow.readback;
  assert.ok(r && Object.keys(r).length > 0);
  switch (flow.key) {
    case 'stock_reservation':
      positive(r.reservationID); positive(r.salesOrderID); positive(r.salesItemID);
      assert.equal(r.reservationOrderID, r.salesOrderID); assert.equal(r.reservationLineID, r.salesItemID);
      assert.equal(r.activeStatus, 'ACTIVE'); assert.equal(r.finalStatus, 'RELEASED');
      assert.equal(r.reservedQuantity, 2); assert.equal(r.stockQuantity, 10); assert.equal(r.availableQuantity, 8);
      assert.equal(r.stockAfter, 10); assert.equal(r.transactionsBefore, r.transactionsAfter); break;
    case 'source_rejections':
      for (const item of [r.sales, r.purchase]) {
        positive(item.id); assert.equal(item.status, 'canceled'); assert.equal(item.taskStatus, 'rejected');
        assert.equal(item.processResolution, 'rejected'); assert.equal(item.noFacts, true);
      } break;
    case 'purchase_correction':
      positive(r.orderID); positive(r.receiptID); positive(r.oldInspectionID); positive(r.newInspectionID);
      assert.equal(r.receiptOrderID, r.orderID); assert.equal(r.orderStatus, 'approved'); assert.equal(r.approvalTaskStatus, 'done');
      assert.equal(r.draftStatus, 'DRAFT'); assert.equal(r.oldStatus, 'REJECTED'); assert.equal(r.newStatus, 'PASSED');
      assert.notEqual(r.oldInspectionID, r.newInspectionID); assert.equal(r.correctionOf, r.oldInspectionID);
      assert.equal(r.originalDecisionRetained, true); assert.equal(r.oldSuperseded, true);
      assert.equal(r.stockBeforePost, 0); assert.equal(r.stockAfterPost, 10); assert.equal(r.transactionsAfterPost, 1);
      assert.equal(r.receiptStatus, 'POSTED'); break;
    case 'outsourcing_return':
      positive(r.contractID); positive(r.issueID); positive(r.returnID); positive(r.qualityID); positive(r.payableID);
      assert.equal(r.returnSourceID, r.contractID); assert.equal(r.issueStatus, 'POSTED'); assert.equal(r.returnStatus, 'POSTED');
      assert.equal(r.issueLineID, r.issueContractLineID); assert.equal(r.returnLineID, r.returnContractLineID);
      positive(r.issueLineID); positive(r.returnLineID); assert.notEqual(r.issueLineID, r.returnLineID);
      assert.equal(r.qualitySourceID, r.returnID); assert.equal(r.qualityStatus, 'PASSED');
      assert.deepEqual(r.beforeQuality, { quantity: 2, transactions: 1, lot: 'ACTIVE' });
      assert.deepEqual(r.draftQualityStock, r.beforeQuality);
      assert.deepEqual(r.waitingQuality, { quantity: 2, transactions: 1, lot: 'HOLD' });
      assert.deepEqual(r.afterQuality, r.beforeQuality);
      assert.equal(r.payableSourceID, r.returnID); assert.equal(r.payableSourceType, 'OUTSOURCING_FACT');
      assert.equal(r.payableStatus, 'DRAFT'); assert.equal(r.payableAmountCents, 200); break;
    case 'shipment_corrections':
      positive(r.rejectedShipmentID); positive(r.cancelledShipmentID);
      assert.notEqual(r.rejectedShipmentID, r.cancelledShipmentID);
      assert.equal(r.rejectedStatus, 'DRAFT'); assert.equal(r.releaseStatus, 'REJECTED'); assert.equal(r.taskStatus, 'rejected');
      assert.equal(r.rejectedStock, 10); assert.equal(r.cancelledStatus, 'CANCELLED');
      assert.equal(r.shippedStock, 0); assert.equal(r.restoredStock, 10); assert.equal(r.transactions, 3);
      assert.equal(r.noFinanceFacts, true); assert.equal(r.replayExact, true); break;
    case 'finance_adjustments':
      for (const key of ['advanceID', 'refundID', 'paymentID', 'factID']) positive(r[key]);
      assert.equal(r.refundOf, r.advanceID); assert.equal(r.advanceStatus, 'POSTED'); assert.equal(r.refundStatus, 'POSTED');
      assert.equal(r.advanceAvailableCents, 1500); assert.equal(r.advanceCreatesNoFact, true); assert.equal(r.refundCreatesNoFact, true);
      assert.equal(r.initialCents, 3500); assert.equal(r.afterPartialAllocationCents, 2000);
      assert.equal(r.afterUnallocateCents, 3500); assert.equal(r.afterReallocateCents, 2000);
      assert.equal(r.afterPaymentReversalCents, 3500); assert.equal(r.paymentStatus, 'REVERSED'); assert.equal(r.netAllocatedCents, 0);
      assert.equal(r.afterPartialCreditCents, 3000); assert.equal(r.partialCreditFactStatus, 'POSTED');
      assert.equal(r.afterFullCreditCents, 0); assert.equal(r.fullCreditFactStatus, 'SETTLED');
      assert.equal(r.afterCreditReversalCents, 3000); assert.equal(r.reopenedFactStatus, 'POSTED');
      assert.equal(r.creditFactID, r.factID); assert.equal(r.fullCreditReversed, true);
      assert.equal(r.originalCreditStatus, 'POSTED'); positive(r.creditReversalID); positive(r.fullCreditID);
      assert.equal(r.creditReversalOf, r.fullCreditID); assert.notEqual(r.creditReversalID, r.fullCreditID); break;
    case 'production_over_issue':
      positive(r.orderID); positive(r.requirementID); positive(r.decisionID); positive(r.extraIssueID);
      assert.equal(r.decisionStatus, 'APPROVED'); assert.equal(r.executionStatus, 'PENDING');
      assert.equal(r.planned, 2); assert.equal(r.baseIssued, 2); assert.equal(r.approvedQuota, 1); assert.equal(r.effectiveLimit, 3);
      assert.equal(r.approvalPostsNoFact, true); assert.equal(r.extraQuantity, 1); assert.equal(r.finalIssued, 3); assert.equal(r.remaining, 0);
      assert.equal(r.issueOrderID, r.orderID); assert.equal(r.issueRequirementID, r.requirementID); break;
    case 'production_scrap':
      for (const key of ['orderID', 'batchID', 'inspectionID', 'rejectedDecisionID', 'cancelledDecisionID', 'executedDecisionID']) positive(r[key]);
      assert.equal(r.rejectedStatus, 'REJECTED'); assert.equal(r.cancelledStatus, 'CANCELLED'); assert.equal(r.rejectedTaskStatus, 'rejected');
      assert.equal(r.executionStatus, 'APPLIED'); assert.equal(r.batchStatus, 'CANCELLED');
      assert.equal(r.childCount, 0); assert.equal(r.finishedReceiptCount, 0); assert.equal(r.executionMovesNoInventory, true);
      assert.equal(r.originalInspectionRetained, true); assert.deepEqual(r.inspectionBefore, r.inspectionAfter); break;
  }
}

export function assertFulfillmentBranchEvidence(report) {
  assert.equal(report.includeBranches, true);
  assert.equal(report.originalCasesUnchanged, true);
  assert.deepEqual(report.branchFlows.map(row => row.key), Object.keys(FULFILLMENT_BRANCH_CASES));
  report.branchFlows.forEach(assertFulfillmentBranchFlow);
  assert.equal(FULFILLMENT_REMAINING_STEPS.length, 28);
  const calls = [...report.fixtureRPC, ...report.browserRPC];
  for (const required of FULFILLMENT_REMAINING_STEPS) {
    const definition = report.definitionSnapshot.chains.find(row => row.key === required.chainKey);
    assert.ok(definition?.steps.some(row => row.key === required.key));
    const matches = report.steps.filter(row => row.chainKey === required.chainKey && row.key === required.key);
    assert.equal(matches.length, 1, `missing or duplicate handoff ${required.key}`);
    const [proof] = matches;
    assert.equal(proof.caseKey, required.caseKey); assert.equal(proof.passed, true); assert.ok(proof.requestIDs.length > 0);
    assert.ok(proof.requestIDs.every(id => calls.some(call => call.requestID === id)));
    assert.deepEqual(proof.readback, report.branchFlows.find(row => row.key === required.caseKey).readback);
  }
}

function factCounts(client) {
  return client.query("SELECT json_build_object('inventory',(SELECT count(*) FROM inventory_txns),'production',(SELECT count(*) FROM production_facts),'outsourcing',(SELECT count(*) FROM outsourcing_facts),'shipments',(SELECT count(*) FROM shipments),'finance',(SELECT count(*) FROM finance_facts),'payments',(SELECT count(*) FROM finance_payments))");
}
async function rejectTask(client, role, sourceType, sourceID, key) {
  const { tasks } = await client.rpc(role, 'workflow', 'list_tasks', { source_type: sourceType, source_id: sourceID, limit: 100 });
  const active = tasks.filter(row => row.owner_role_key === role && row.task_status_key === 'ready'); assert.equal(active.length, 1);
  return (await client.rpc(role, 'workflow', 'reject_task_action', { task_id: active[0].id, expected_version: active[0].version,
    action_key: 'reject', reason: '隔离模拟：来源条件不满足，拒绝本次办理', idempotency_key: key, payload: { surface_key: 'workflow_business_module' } })).task;
}
async function submitDocument(client, kind, order, prefix) {
  const purchase = kind === 'purchase_order', actor = purchase ? 'purchase' : 'sales';
  const field = purchase ? 'purchase_order_id' : 'sales_order_id';
  const process = await client.rpc(actor, 'customer_config', purchase ? 'start_material_supply_purchase_order_process' : 'start_sales_order_acceptance_process',
    { ...customer, [field]: order.id, idempotency_key: `${prefix}:process` });
  const node = process.nodes.find(row => row.node_key === (purchase ? 'submit_purchase_order' : 'submit_sales_order')); assert.ok(node);
  await client.rpc(actor, 'customer_config', purchase ? 'execute_material_supply_purchase_order_submit' : 'execute_sales_order_acceptance_submit', {
    ...customer, process_instance_id: process.process_instance.id, process_node_instance_id: node.id, expected_version: node.version,
    [field]: order.id, idempotency_key: `${prefix}:submit`,
  });
  const submitted = (await client.rpc(actor, kind, `get_${kind}`, { id: order.id }))[kind]; assert.equal(submitted.lifecycle_status, 'submitted');
  return process;
}
async function createPurchase(client, fixture, prefix) {
  return (await client.rpc('purchase', 'purchase_order', 'save_purchase_order_with_items', {
    purchase_order_no: `${prefix}-PO`, purchase_date: today(), supplier_id: fixture.supplier.id, currency: 'CNY',
    supplier_snapshot: { name: fixture.supplier.name }, contract_party_snapshot: { buyerCompany: '隔离模拟工厂' },
    items: [{ line_no: 1, material_id: fixture.material.id, unit_id: fixture.material.default_unit_id, purchased_quantity: '10', unit_price: '3.5', amount: '35' }],
  })).purchase_order;
}
async function openingStock(client, options, fixture, suffix) {
  const prefix = `${fixture.prefix}-${suffix}`;
  const salesOrder = await prepareTransactionSalesOrder(client, options, { ...fixture, prefix });
  const { sales_order_items: items } = await client.rpc('sales', 'sales_order', 'list_sales_order_items', { sales_order_id: salesOrder.id, limit: 100 }); assert.equal(items.length, 1);
  const { warehouses } = await client.rpc('admin', 'masterdata', 'list_warehouses', { limit: 100 });
  const warehouse = warehouses.find(row => row.is_active && row.type === 'FINISHED_GOODS'); assert.ok(warehouse);
  await assignTransactionWarehouseScopes(client, [fixture.warehouse.id, warehouse.id], ['warehouse', 'quality', 'sales', 'production', 'pmc']);
  const item = items[0];
  let operation = (await client.rpc('warehouse', 'inventory', 'create_inventory_operation', {
    operation_no: `${prefix}-OPEN`, operation_type: 'MANUAL_ADJUSTMENT', reason: '隔离补充分支的合成期初成品，不证明生产完工', idempotency_key: `${prefix}:opening`,
    items: [{ line_no: '1', subject_type: 'PRODUCT', subject_id: item.product_id, product_sku_id: item.product_sku_id, unit_id: item.unit_id,
      from_warehouse_id: warehouse.id, adjustment_quantity: '10' }],
  })).inventory_operation;
  operation = await postTransactionInventoryCount(client, operation, prefix); assert.equal(operation.status, 'POSTED');
  const stock = () => client.query(`SELECT json_build_object('quantity',(SELECT COALESCE(sum(quantity),0) FROM inventory_balances WHERE product_sku_id=${positive(item.product_sku_id)} AND warehouse_id=${warehouse.id}),'transactions',(SELECT count(*) FROM inventory_txns WHERE product_sku_id=${item.product_sku_id} AND warehouse_id=${warehouse.id}))`);
  return { ...fixture, prefix, salesOrder, item, warehouse, operation, stock };
}
async function shipmentDraft(client, source) {
  return (await client.rpc('sales', 'operational_fact', 'create_shipment_with_items', { shipment_no: `${source.prefix}-SHIP`,
    sales_order_id: source.salesOrder.id, customer_id: source.customer.id, idempotency_key: `${source.prefix}:shipment`,
    items: [{ sales_order_item_id: source.item.id, product_id: source.item.product_id, product_sku_id: source.item.product_sku_id,
      unit_id: source.item.unit_id, warehouse_id: source.warehouse.id, quantity: '10' }],
  })).shipment;
}
async function startShipment(client, source, shipment) {
  return client.rpc('sales', 'customer_config', 'start_finished_goods_delivery_process', { ...customer, shipment_id: shipment.id, idempotency_key: `${source.prefix}:delivery` });
}
async function captureBranch(browser, options, report, flow, { role, route, id, number }) {
  const { page, context } = await login(browser, options, role, report);
  try {
    await navigate(page, `${options.baseURL}${route}`); await settleRPCPage(page);
    const row = page.locator(`tr[data-row-key="${positive(id)}"]`); await expect(row).toHaveCount(1); await expect(row).toContainText(number);
    const screenshot = `branch-${flow.key}.png`;
    const visibleRow = await row.innerText();
    await page.screenshot({ path: path.join(options.outputDir, screenshot), fullPage: false, animations: 'disabled' });
    flow.browserReadback.push({ role, sourceID: id, screenshot, visibleRow, viewport: { width: 1920, height: 1080 }, pixelSize: { width: 3840, height: 2160 } });
  } catch (error) {
    await page.screenshot({ path: path.join(options.outputDir, `branch-${flow.key}-failure.png`), fullPage: false }).catch(() => {});
    report.visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 16000); throw error;
  } finally { await closePage(page, context); }
}

async function purchaseCorrection(c) {
  const { client, fixture, actions: a } = c, order = fixture.order;
  assert.equal(order.lifecycle_status, 'draft');
  await submitDocument(client, 'purchase_order', order, `${fixture.prefix}-MANUAL`);
  const task = await a.completeTask(client, 'boss', 'purchase_order', order.id, `${fixture.prefix}:manual-approved`);
  const approved = (await client.rpc('purchase', 'purchase_order', 'get_purchase_order', { id: order.id })).purchase_order;
  assert.equal(approved.lifecycle_status, 'approved');
  let receipt = (await client.rpc('warehouse', 'purchase', 'create_purchase_receipt_from_purchase_order', { purchase_order_id: order.id, all_remaining: true,
    receipt_no: `${fixture.prefix}-CORR-PR`, warehouse_id: fixture.warehouse.id, received_at: today(), idempotency_key: `${fixture.prefix}:correction-receipt` })).purchase_receipt;
  const draftStatus = receipt.status;
  const { quality_inspections } = await client.rpc('quality', 'quality', 'list_quality_inspections', { purchase_receipt_id: receipt.id, limit: 100 }); assert.equal(quality_inspections.length, 1);
  const rejected = await a.decideQuality(client, quality_inspections[0], true);
  const fields = ['result', 'check_items', 'inspected_at', 'decision_note', 'defect_rate_percent'];
  const before = pick(rejected, fields);
  const correction = (await client.rpc('quality', 'quality', 'correct_quality_inspection_result', { id: rejected.id,
    correction_inspection_no: `${fixture.prefix}-CORR-IQC`, reason: '隔离模拟：原抽样信息有误，保留原判定另行复检' })).quality_inspection;
  assert.equal(correction.status, 'SUBMITTED'); assert.equal(correction.correction_of_inspection_id, rejected.id);
  const qualified = await a.decideQuality(client, correction);
  const retained = (await client.rpc('quality', 'quality', 'get_quality_inspection', { id: rejected.id })).quality_inspection;
  assert.deepEqual(pick(retained, fields), before);
  const lotID = receipt.items[0].lot_id, stockBeforePost = a.inventory(client, lotID);
  assert.equal(stockBeforePost.quantity, 0); assert.equal(stockBeforePost.transactions, 0);
  receipt = (await client.rpc('warehouse', 'purchase', 'post_purchase_receipt', { id: receipt.id })).purchase_receipt;
  const stockAfter = a.inventory(client, lotID);
  const receiptOrderID = client.query(`SELECT to_json(p.purchase_order_id) FROM purchase_receipt_items r JOIN purchase_order_items p ON p.id=r.purchase_order_item_id WHERE r.receipt_id=${receipt.id}`);
  c.materialLotID = lotID;
  return { readback: { orderID: order.id, receiptID: receipt.id, receiptOrderID, orderStatus: approved.lifecycle_status, approvalTaskStatus: task.task_status_key,
    draftStatus, oldInspectionID: rejected.id, newInspectionID: qualified.id, oldStatus: retained.status, newStatus: qualified.status,
    correctionOf: qualified.correction_of_inspection_id, originalDecisionRetained: true, oldSuperseded: Boolean(retained.superseded_at),
    stockBeforePost: stockBeforePost.quantity, stockAfterPost: stockAfter.quantity, transactionsAfterPost: stockAfter.transactions, receiptStatus: receipt.status },
    page: { role: 'quality', route: `${ROUTES.qualityInspections}?quality_inspection_id=${qualified.id}`, id: qualified.id, number: qualified.inspection_no } };
}
async function reservation(c) {
  const { client, fixture, options } = c;
  const source = await openingStock(client, options, fixture, 'RES'); c.stockSource = source;
  const before = source.stock();
  const params = { reservation_no: `${source.prefix}-RESERVE`, sales_order_id: source.salesOrder.id, sales_order_item_id: source.item.id,
    warehouse_id: source.warehouse.id, quantity: '2', idempotency_key: `${source.prefix}:reserve` };
  const active = (await client.rpc('sales', 'operational_fact', 'create_stock_reservation_from_sales_order', params)).stock_reservation;
  const during = source.stock(); assert.deepEqual(during, before);
  const stored = client.query(`SELECT to_jsonb(r) FROM stock_reservations r WHERE id=${positive(active.id)}`);
  const released = (await client.rpc('sales', 'operational_fact', 'release_stock_reservation', { id: active.id })).stock_reservation;
  const after = source.stock(); assert.deepEqual(after, before);
  return { readback: { reservationID: active.id, salesOrderID: source.salesOrder.id, salesItemID: source.item.id,
    reservationOrderID: stored.sales_order_id, reservationLineID: stored.sales_order_item_id, activeStatus: active.status, finalStatus: released.status,
    reservedQuantity: Number(stored.quantity), stockQuantity: during.quantity, availableQuantity: during.quantity - Number(stored.quantity),
    stockAfter: after.quantity, transactionsBefore: before.transactions, transactionsAfter: after.transactions },
    page: { role: 'sales', route: `${ROUTES.salesOrders}?sales_order_id=${source.salesOrder.id}`, id: source.salesOrder.id, number: source.salesOrder.order_no } };
}
async function sourceRejections(c) {
  const { client, fixture, actions: a } = c, item = c.stockSource.item;
  const sales = (await client.rpc('sales', 'sales_order', 'save_sales_order_with_items', { order_no: `${fixture.prefix}-REJECT-SO`, customer_id: fixture.customer.id,
    order_date: today(), currency: 'CNY', payment_method: '银行转账', payment_term_days: 0, tax_mode: 'INCLUSIVE', tax_rate: '13', freight_terms: 'INCLUDED',
    items: [{ line_no: 1, product_id: item.product_id, product_sku_id: item.product_sku_id, unit_id: item.unit_id, ordered_quantity: '2', unit_price: '3.5', amount: '7' }],
  })).sales_order;
  const purchase = await createPurchase(client, fixture, `${fixture.prefix}-REJECT`);
  const readback = {};
  for (const [key, domain, order] of [['sales', 'sales_order', sales], ['purchase', 'purchase_order', purchase]]) {
    const before = factCounts(client); await submitDocument(client, domain, order, `${fixture.prefix}-${key}-REJECT`);
    const task = await rejectTask(client, 'boss', domain, order.id, `${fixture.prefix}:${key}:reject`);
    const result = (await client.rpc(key === 'sales' ? 'sales' : 'purchase', domain, `get_${domain}`, { id: order.id }))[domain];
    assert.deepEqual(factCounts(client), before);
    const resolution = client.query(`SELECT to_json(resolution_kind) FROM process_instances WHERE business_ref_type='${domain}' AND business_ref_id=${order.id}`);
    readback[key] = { id: order.id, status: result.lifecycle_status, taskStatus: task.task_status_key, processResolution: resolution, noFacts: true };
  }
  return { readback, page: { role: 'sales', route: `${ROUTES.salesOrders}?sales_order_id=${sales.id}`, id: sales.id, number: sales.order_no } };
}
async function returnContract(c, prefix) {
  const { client, fixture } = c;
  const { processes } = await client.rpc('admin', 'masterdata', 'list_processes', { limit: 100 });
  const process = processes.find(row => row.is_active && row.production_route_operation_code === 'FABRIC_PROCESSING'); assert.ok(process);
  const productProcess = processes.find(row => row.is_active && row.production_route_operation_code === 'SEWING'); assert.ok(productProcess);
  const product = c.stockSource.item;
  const { product_sku: sku } = await client.rpc('admin', 'masterdata', 'create_product_sku', {
    product_id: product.product_id, sku_code: `${prefix}-RET-SKU`, sku_name: '隔离普通委外回货规格', default_unit_id: product.unit_id, color: '白色',
  });
  const created = await client.rpc('purchase', 'outsourcing_order', 'save_outsourcing_order_with_items', {
    outsourcing_order_no: `${prefix}-OUT`, supplier_id: fixture.supplier.id, currency: 'CNY', order_date: today(),
    expected_return_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    supplier_snapshot: { name: fixture.supplier.name, contact_name: '模拟加工联系人', contact_phone: '0769-00000000', address: '模拟加工地址' },
    contract_party_snapshot: { buyerCompany: '隔离模拟工厂', buyerContact: '模拟采购', buyerPhone: '0769-00000000', buyerAddress: '模拟收货地址' },
    items: [{ line_no: 1, subject_type: 'MATERIAL', material_id: fixture.material.id, process_id: process.id, unit_id: fixture.material.default_unit_id,
      outsourcing_quantity: '2', processing_item: '隔离委外材料发放', unit_price: '1', amount: '2' },
    { line_no: 2, subject_type: 'PRODUCT', product_id: product.product_id, product_sku_id: sku.id, process_id: productProcess.id, unit_id: product.unit_id,
      outsourcing_quantity: '2', processing_item: '隔离委外产品回货', unit_price: '1', amount: '2' }],
  });
  let order = created.outsourcing_order;
  for (const method of ['submit_outsourcing_order', 'confirm_outsourcing_order']) order = (await client.rpc('purchase', 'outsourcing_order', method,
    { id: order.id, expected_version: order.version, idempotency_key: `${prefix}:${method}` })).outsourcing_order;
  return { order, issueItem: created.outsourcing_order_items.find(row => row.line_no === 1), returnItem: created.outsourcing_order_items.find(row => row.line_no === 2) };
}
async function outsourcing(c) {
  const { client, fixture, actions: a } = c, prefix = `${fixture.prefix}-GEN`;
  const { order, issueItem, returnItem } = await returnContract(c, prefix);
  let issue = (await client.rpc('warehouse', 'operational_fact', 'create_outsourcing_material_issue_from_order', { fact_no: `${prefix}-ISSUE`, outsourcing_order_id: order.id,
    outsourcing_order_item_id: issueItem.id, warehouse_id: fixture.warehouse.id, lot_id: c.materialLotID, quantity: '2', idempotency_key: `${prefix}:issue` })).outsourcing_fact;
  issue = (await client.rpc('warehouse', 'operational_fact', 'post_outsourcing_fact', { id: issue.id, expected_version: issue.version })).outsourcing_fact;
  let returned = (await client.rpc('warehouse', 'operational_fact', 'create_outsourcing_return_receipt_from_order', { fact_no: `${prefix}-RETURN`, outsourcing_order_id: order.id,
    outsourcing_order_item_id: returnItem.id, warehouse_id: c.stockSource.warehouse.id, new_lot_no: `${prefix}-LOT`, quantity: '2', idempotency_key: `${prefix}:return` })).outsourcing_fact;
  const early = await client.raw('quality', 'quality', 'create_quality_inspection_from_outsourcing_return', { fact_id: returned.id, inspection_no: `${prefix}-EARLY` });
  assert.equal(early.code, CODE.BUSINESS_RULE_VIOLATION);
  returned = (await client.rpc('warehouse', 'operational_fact', 'post_outsourcing_fact', { id: returned.id, expected_version: returned.version })).outsourcing_fact;
  const stock = () => ({ ...a.inventory(client, returned.lot_id), lot: client.query(`SELECT to_json(status) FROM inventory_lots WHERE id=${positive(returned.lot_id)}`) });
  const beforeQuality = stock();
  let inspection = (await client.rpc('quality', 'quality', 'create_quality_inspection_from_outsourcing_return', { fact_id: returned.id, inspection_no: `${prefix}-OQC` })).quality_inspection;
  assert.equal(inspection.status, 'DRAFT'); const draftQualityStock = stock(); assert.deepEqual(draftQualityStock, beforeQuality);
  inspection = (await client.rpc('quality', 'quality', 'submit_quality_inspection', { id: inspection.id })).quality_inspection;
  assert.equal(inspection.status, 'SUBMITTED');
  const waitingQuality = stock(); inspection = await a.decideQuality(client, inspection); const afterQuality = stock();
  const payable = (await client.rpc('finance', 'operational_fact', 'create_payable_from_outsourcing_return', { outsourcing_fact_id: returned.id,
    fact_no: `${prefix}-AP`, idempotency_key: `${prefix}:payable` })).finance_fact;
  return { readback: { contractID: order.id, issueID: issue.id, issueStatus: issue.status, issueLineID: issue.source_line_id, issueContractLineID: issueItem.id,
    returnID: returned.id, returnSourceID: returned.source_id, returnStatus: returned.status, returnLineID: returned.source_line_id, returnContractLineID: returnItem.id,
    qualityID: inspection.id, qualitySourceID: inspection.source_id, qualityStatus: inspection.status, beforeQuality, draftQualityStock, waitingQuality, afterQuality,
    payableID: payable.id, payableSourceID: payable.source_id, payableSourceType: payable.source_type, payableStatus: payable.status, payableAmountCents: a.exactMoneyCents(payable.amount) },
    page: { role: 'quality', route: `${ROUTES.qualityInspections}?quality_inspection_id=${inspection.id}`, id: inspection.id, number: inspection.inspection_no } };
}
async function shipmentCorrections(c) {
  const { client, fixture, options, actions: a } = c;
  const rejectedSource = await openingStock(client, options, fixture, 'SHIPREJ');
  let rejected = await shipmentDraft(client, rejectedSource); await startShipment(client, rejectedSource, rejected);
  const task = await rejectTask(client, 'finance', 'shipment', rejected.id, `${rejectedSource.prefix}:reject`);
  rejected = (await client.rpc('sales', 'operational_fact', 'get_shipment', { id: rejected.id })).shipment;
  const source = await openingStock(client, options, fixture, 'SHIPCANCEL');
  let shipment = await shipmentDraft(client, source); await startShipment(client, source, shipment);
  await a.completeTask(client, 'finance', 'shipment', shipment.id, `${source.prefix}:approve`);
  shipment = (await client.rpc('sales', 'operational_fact', 'ship_shipment', { id: shipment.id })).shipment;
  assert.equal(shipment.status, 'SHIPPED'); const shippedStock = source.stock().quantity;
  shipment = (await client.rpc('sales', 'operational_fact', 'cancel_shipment', { id: shipment.id })).shipment;
  const restored = source.stock();
  await client.rpc('sales', 'operational_fact', 'cancel_shipment', { id: shipment.id }); assert.deepEqual(source.stock(), restored);
  const noFinanceFacts = client.query(`SELECT to_json(count(*)) FROM finance_facts WHERE source_type='SHIPMENT' AND source_id IN (${shipment.id},${rejected.id})`) === 0;
  return { readback: { rejectedShipmentID: rejected.id, cancelledShipmentID: shipment.id, rejectedStatus: rejected.status, releaseStatus: rejected.finance_release_status,
    taskStatus: task.task_status_key, rejectedStock: rejectedSource.stock().quantity, cancelledStatus: shipment.status, shippedStock,
    restoredStock: restored.quantity, transactions: restored.transactions, noFinanceFacts, replayExact: true },
    page: { role: 'sales', route: `${ROUTES.shipments}?shipment_id=${shipment.id}`, id: shipment.id, number: shipment.shipment_no } };
}
async function payment(c, prefix, params, allocations = []) {
  const { client, actions: a } = c;
  const created = (await client.rpc('finance', 'operational_fact', 'create_finance_payment', { payment_no: `${prefix}-PAY`, currency: 'CNY',
    account_ref: '隔离模拟账户', evidence_ref: '隔离模拟凭据', idempotency_key: `${prefix}:payment`, ...params })).payment;
  await client.rpc('finance', 'customer_config', 'start_finance_payment_approval_process', { ...customer, finance_payment_id: created.id, idempotency_key: `${prefix}:approval` });
  await a.completeTask(client, 'boss', 'finance_payment', created.id, `${prefix}:boss`);
  await a.completeTask(client, 'finance', 'finance_payment', created.id, `${prefix}:finance`);
  const approved = (await client.rpc('finance', 'operational_fact', 'get_finance_payment', { id: created.id })).payment;
  assert.equal(approved.status, 'APPROVED');
  assert.equal(client.query(`SELECT to_json(count(*)) FROM finance_allocations WHERE payment_id=${positive(created.id)}`), 0);
  await a.executeNode(client, 'finance', 'get_finance_payment_approval_process', 'execute_finance_payment_post', 'finance_payment_id', created.id,
    { idempotency_key: `${prefix}:post`, allocations, ...(allocations.length ? {} : { cash_only: true }) });
  return (await client.rpc('finance', 'operational_fact', 'get_finance_payment', { id: created.id })).payment;
}
async function finance(c) {
  const { client, fixture, options, actions: a } = c;
  const prefix = `${fixture.prefix}-FIN`;
  const salesOrder = await prepareTransactionSalesOrder(client, options, { ...fixture, prefix });
  const source = await prepareTransactionReceivable(client, { ...fixture, prefix, salesOrder });
  const factID = source.fact.id;
  const readFact = () => client.rpc('finance', 'operational_fact', 'get_finance_fact', { id: factID }).then(row => row.finance_fact);
  const readPayment = id => client.rpc('finance', 'operational_fact', 'get_finance_payment', { id }).then(row => row.payment);
  const advanceOrder = await prepareTransactionSalesOrder(client, options, { ...fixture, prefix: `${fixture.prefix}-ADV` });
  const beforeAdvance = client.query('SELECT to_json(count(*)) FROM finance_facts');
  let advance = await payment(c, `${fixture.prefix}-ADV`, { kind: 'ADVANCE', direction: 'RECEIPT', counterparty_type: 'CUSTOMER', counterparty_id: fixture.customer.id,
    source_type: 'sales_order', source_id: advanceOrder.id, amount: '20' });
  assert.equal(client.query('SELECT to_json(count(*)) FROM finance_facts'), beforeAdvance);
  const refund = await payment(c, `${fixture.prefix}-REFUND`, { kind: 'REFUND', direction: 'DISBURSEMENT', counterparty_type: 'CUSTOMER', counterparty_id: fixture.customer.id,
    refund_of_payment_id: advance.id, purpose_note: '隔离模拟：退回部分订单首款', amount: '5' });
  assert.equal(client.query('SELECT to_json(count(*)) FROM finance_facts'), beforeAdvance); advance = await readPayment(advance.id);
  const initialCents = a.exactMoneyCents((await readFact()).outstanding_amount);
  let paid = await payment(c, `${prefix}-PARTIAL`, { kind: 'SETTLEMENT', direction: 'RECEIPT', counterparty_type: 'CUSTOMER', counterparty_id: fixture.customer.id, amount: '15' }, [{ finance_fact_id: factID, amount: '15' }]);
  const afterPartialAllocationCents = a.exactMoneyCents((await readFact()).outstanding_amount);
  const allocation = paid.allocations.find(row => row.status === 'POSTED' && !row.reversal_of_allocation_id); assert.ok(allocation);
  paid = (await client.rpc('finance', 'operational_fact', 'reverse_finance_allocation', { id: paid.id, expected_version: paid.version, allocation_id: allocation.id, reason: '隔离模拟：撤销抵扣，不移动现金' })).payment;
  const afterUnallocateCents = a.exactMoneyCents((await readFact()).outstanding_amount);
  paid = (await client.rpc('finance', 'operational_fact', 'allocate_finance_payment', { id: paid.id, expected_version: paid.version,
    allocations: [{ finance_fact_id: factID, amount: '15' }], idempotency_key: `${prefix}:reallocate` })).payment;
  const afterReallocateCents = a.exactMoneyCents((await readFact()).outstanding_amount);
  paid = (await client.rpc('finance', 'operational_fact', 'reverse_finance_payment', { id: paid.id, expected_version: paid.version, reason: '隔离模拟：整笔冲正并恢复应收未结' })).payment;
  const afterPaymentReversalCents = a.exactMoneyCents((await readFact()).outstanding_amount);
  const partial = (await client.rpc('finance', 'operational_fact', 'create_finance_credit_note', { credit_note_no: `${prefix}-CR5`, finance_fact_id: factID,
    amount: '5', reason: '隔离模拟：部分红冲', idempotency_key: `${prefix}:credit5` })).credit_note;
  assert.equal(partial.status, 'POSTED'); const partialFact = await readFact();
  const full = (await client.rpc('finance', 'operational_fact', 'create_finance_credit_note', { credit_note_no: `${prefix}-CR30`, finance_fact_id: factID,
    amount: '30', reason: '隔离模拟：红冲剩余未结', idempotency_key: `${prefix}:credit30` })).credit_note;
  const settled = await readFact();
  const creditReversal = (await client.rpc('finance', 'operational_fact', 'reverse_finance_credit_note', { credit_note_id: full.id, credit_note_no: `${prefix}-CR30-REV`,
    reason: '隔离模拟：反向红冲恢复未结', idempotency_key: `${prefix}:reverse-credit` })).credit_note;
  const reopened = await readFact(), originalCredit = (await client.rpc('finance', 'operational_fact', 'get_finance_credit_note', { id: full.id })).credit_note;
  assert.equal(originalCredit.status, 'POSTED');
  assert.equal(creditReversal.status, 'REVERSED'); assert.equal(creditReversal.reversal_of_credit_note_id, full.id);
  const net = client.query(`SELECT to_json(COALESCE(sum(CASE WHEN reversal_of_allocation_id IS NULL THEN amount ELSE -amount END),0)) FROM finance_allocations WHERE payment_id=${paid.id}`);
  return { readback: { advanceID: advance.id, advanceOrderID: advanceOrder.id, refundID: refund.id, refundOf: refund.refund_of_payment_id, advanceStatus: advance.status,
    refundStatus: refund.status, advanceAvailableCents: a.exactMoneyCents(advance.available_amount), advanceCreatesNoFact: true, refundCreatesNoFact: true,
    factID, paymentID: paid.id, initialCents, afterPartialAllocationCents, afterUnallocateCents, afterReallocateCents, afterPaymentReversalCents,
    paymentStatus: paid.status, netAllocatedCents: a.exactMoneyCents(net), afterPartialCreditCents: a.exactMoneyCents(partialFact.outstanding_amount), partialCreditFactStatus: partialFact.status,
    afterFullCreditCents: a.exactMoneyCents(settled.outstanding_amount), fullCreditFactStatus: settled.status, afterCreditReversalCents: a.exactMoneyCents(reopened.outstanding_amount),
    reopenedFactStatus: reopened.status, creditFactID: full.finance_fact_id, fullCreditReversed: true,
    originalCreditStatus: originalCredit.status, creditReversalID: creditReversal.id, creditReversalOf: creditReversal.reversal_of_credit_note_id, fullCreditID: full.id },
    page: { role: 'finance', route: ROUTES.receivables, id: factID, number: reopened.fact_no } };
}
async function releasedSource(c, suffix) {
  const { client, fixture, options, actions: a } = c;
  const source = await prepareTransactionProductionSource(client, options, { ...fixture, prefix: `${fixture.prefix}-${suffix}`, orderedQuantity: 2 });
  let created = await client.rpc('pmc', 'production_order', 'create_production_order', { order_no: `${source.prefix}-MO`, idempotency_key: `${source.prefix}:production`,
    items: [{ line_no: 1, product_id: source.salesItem.product_id, product_sku_id: source.salesItem.product_sku_id, unit_id: source.salesItem.unit_id,
      sales_order_item_id: source.salesItem.id, bom_header_id: source.bom.id, planned_quantity: '2', route_code: PRODUCTION_WIP_ROUTE_CODE }] });
  created = await client.rpc('pmc', 'production_order', 'release_production_order', { production_order_id: created.production_order.id,
    expected_version: created.production_order.version, idempotency_key: `${source.prefix}:release` });
  await a.completeTask(client, 'pmc', 'production-orders', created.production_order.id, `${source.prefix}:scheduled`);
  const { material_requirements } = await client.rpc('warehouse', 'operational_fact', 'list_production_order_material_requirements', { production_order_id: created.production_order.id }); assert.equal(material_requirements.length, 1);
  return { ...source, production: created.production_order, productionItem: created.production_order_items[0], requirement: material_requirements[0] };
}
async function normalIssue(c, source, suffix, quantity) {
  const { client } = c;
  let fact = (await client.rpc('warehouse', 'operational_fact', 'create_production_material_issue_from_order', { fact_no: `${source.prefix}-${suffix}`,
    production_order_id: source.production.id, production_order_item_id: source.productionItem.id,
    production_order_material_requirement_id: source.requirement.id, warehouse_id: source.warehouse.id,
    lot_id: c.materialLotID, quantity: String(quantity), idempotency_key: `${source.prefix}:${suffix}` })).production_fact;
  assert.equal(fact.status, 'DRAFT');
  return (await client.rpc('warehouse', 'operational_fact', 'post_production_fact', { id: fact.id, expected_version: fact.version })).production_fact;
}
async function productionQuota(c) {
  const { client, actions: a } = c, source = await releasedSource(c, 'QUOTA');
  await normalIssue(c, source, 'BASE', 2);
  const read = async () => (await client.rpc('warehouse', 'operational_fact', 'list_production_order_material_requirements', { production_order_id: source.production.id })).material_requirements[0];
  const base = await read(), before = { stock: a.inventory(client, c.materialLotID), facts: factCounts(client) };
  let decision = (await client.rpc('production', 'operational_fact', 'submit_production_exception', { decision_no: `${source.prefix}-OVER`, decision_type: 'OVER_ISSUE',
    production_order_id: source.production.id, production_order_item_id: source.productionItem.id, production_material_requirement_id: source.requirement.id,
    requested_quantity: '1', reason: '隔离模拟：生产损耗需追加领料一件', idempotency_key: `${source.prefix}:over-issue` })).production_exception;
  await client.rpc('production', 'customer_config', 'start_production_exception_approval_process', { ...customer, production_exception_id: decision.id, idempotency_key: `${source.prefix}:approval` });
  await a.completeTask(client, 'boss', 'production_exception_decision', decision.id, `${source.prefix}:approve-over-issue`, { approvedQuantity: '1' });
  decision = (await client.rpc('production', 'operational_fact', 'get_production_exception', { id: decision.id })).production_exception;
  const approved = await read(); assert.deepEqual({ stock: a.inventory(client, c.materialLotID), facts: factCounts(client) }, before);
  const extra = await normalIssue(c, source, 'EXTRA', 1), final = await read();
  return { readback: { orderID: source.production.id, requirementID: source.requirement.id, decisionID: decision.id, extraIssueID: extra.id,
    decisionStatus: decision.status, executionStatus: decision.execution_status, planned: Number(base.planned_quantity), baseIssued: Number(base.issued_quantity),
    approvedQuota: Number(approved.approved_over_issue_quantity), effectiveLimit: Number(approved.effective_limit_quantity), approvalPostsNoFact: true,
    extraQuantity: Number(extra.quantity), finalIssued: Number(final.issued_quantity), remaining: Number(final.remaining_quantity),
    issueOrderID: extra.source_id, issueRequirementID: extra.source_line_id },
    page: { role: 'production', route: `${ROUTES.productionExceptions}?production_exception_id=${decision.id}`, id: decision.id, number: decision.decision_no } };
}
async function productionScrap(c) {
  const { client, actions: a } = c, source = await releasedSource(c, 'SCRAP');
  const read = () => client.rpc('production', 'production_wip', 'get_production_wip', { production_order_id: source.production.id });
  const rpc = ({ actor, domain, method, params }) => client.rpc(actor, domain, method, params);
  let state = await read();
  const operation = code => { const value = state.production_order_operations.find(row => row.operation_code === code); assert.ok(value); return value; };
  const batchFor = op => { const values = state.production_wip_batches.filter(row => row.production_order_operation_id === op.id && row.status !== 'CANCELLED'); assert.equal(values.length, 1); return values[0]; };
  const act = async (op, batch, action, extra = {}) => {
    await executeProductionWIPAction(rpc, { action, production_order_id: source.production.id, production_wip_batch_id: batch.id,
      expected_version: batch.version, idempotency_key: `${source.prefix}:${batch.id}:${action}`, ...extra }, op.operation_code);
    state = await read(); return batchFor(op);
  };
  const fabric = operation('FABRIC_PROCESSING'), shell = operation('SEWING');
  let batch = await act(fabric, batchFor(fabric), 'ASSIGN_EXECUTION', { execution_mode: 'OUTSOURCED', outsourcing_allocations: [{ outsourcing_order_item_id: source.contractItem.id, production_order_material_requirement_id: source.requirement.id }] });
  let issue = (await client.rpc('warehouse', 'operational_fact', 'create_outsourcing_material_issue_from_order', { fact_no: `${source.prefix}-ISSUE`, outsourcing_order_id: source.contract.id,
    outsourcing_order_item_id: source.contractItem.id, warehouse_id: source.warehouse.id, lot_id: c.materialLotID, quantity: '2', idempotency_key: `${source.prefix}:issue` })).outsourcing_fact;
  issue = (await client.rpc('warehouse', 'operational_fact', 'post_outsourcing_fact', { id: issue.id, expected_version: issue.version })).outsourcing_fact; assert.equal(issue.status, 'POSTED');
  batch = await act(fabric, batch, 'START_OPERATION'); batch = await act(fabric, batch, 'RECEIVE_OUTSOURCING_RETURN', { quantity: '2' });
  const fabricInspections = await client.rpc('quality', 'quality', 'list_production_stage_quality_inspections', { production_wip_batch_id: batch.id, limit: 100 });
  await a.decideQuality(client, fabricInspections.quality_inspections[0]); state = await read(); batch = batchFor(fabric);
  await executeProductionWIPAction(rpc, { action: 'TRANSFER_TO_NEXT_OPERATION', production_order_id: source.production.id, production_wip_batch_id: batch.id,
    expected_version: batch.version, target_operation_id: shell.id, quantity: '2', idempotency_key: `${source.prefix}:to-shell` }, fabric.operation_code);
  state = await read(); batch = await act(shell, batchFor(shell), 'ASSIGN_EXECUTION', { execution_mode: 'IN_HOUSE' });
  batch = await act(shell, batch, 'START_OPERATION'); batch = await act(shell, batch, 'COMPLETE_OPERATION');
  const inspections = await client.rpc('quality', 'quality', 'list_production_stage_quality_inspections', { production_wip_batch_id: batch.id, limit: 100 });
  const rejected = await a.decideQuality(client, inspections.quality_inspections[0], true);
  const inspectionBefore = client.query(`SELECT to_jsonb(q) FROM quality_inspections q WHERE id=${positive(rejected.id)}`);
  const before = { stock: a.inventory(client, c.materialLotID), facts: factCounts(client) };
  const submit = async suffix => (await client.rpc('sales', 'operational_fact', 'submit_production_exception', { decision_no: `${source.prefix}-${suffix}`, decision_type: 'SCRAP',
    production_order_id: source.production.id, production_order_item_id: source.productionItem.id, production_wip_batch_id: batch.id, quality_inspection_id: rejected.id,
    requested_quantity: '2', reason: '隔离模拟：整批皮套损坏不能修复', idempotency_key: `${source.prefix}:${suffix}` })).production_exception;
  const start = decision => client.rpc('sales', 'customer_config', 'start_production_exception_approval_process', { ...customer, production_exception_id: decision.id, idempotency_key: `${source.prefix}:${decision.id}:approval` });
  let rejectedDecision = await submit('REJECT'); await start(rejectedDecision);
  const rejectedTask = await rejectTask(client, 'boss', 'production_exception_decision', rejectedDecision.id, `${source.prefix}:reject`);
  rejectedDecision = (await client.rpc('production', 'operational_fact', 'get_production_exception', { id: rejectedDecision.id })).production_exception;
  let cancelled = await submit('CANCEL');
  cancelled = (await client.rpc('sales', 'operational_fact', 'cancel_production_exception', { id: cancelled.id, expected_version: cancelled.version, reason: '隔离模拟：撤回尚未批准的方案' })).production_exception;
  assert.deepEqual({ stock: a.inventory(client, c.materialLotID), facts: factCounts(client) }, before);
  let decision = await submit('APPLY'); await start(decision);
  await a.completeTask(client, 'boss', 'production_exception_decision', decision.id, `${source.prefix}:approve`);
  await a.completeTask(client, 'production', 'production_exception_decision', decision.id, `${source.prefix}:handled`);
  await a.executeNode(client, 'production', 'get_production_exception_approval_process', 'execute_production_exception_process', 'production_exception_id', decision.id,
    { idempotency_key: `${source.prefix}:execute`, reason: '隔离模拟：执行批准的皮套报废，原批终止' });
  state = await read(); decision = (await client.rpc('production', 'operational_fact', 'get_production_exception', { id: decision.id })).production_exception;
  assert.deepEqual(a.inventory(client, c.materialLotID), before.stock);
  const inspectionAfter = client.query(`SELECT to_jsonb(q) FROM quality_inspections q WHERE id=${rejected.id}`); assert.deepEqual(inspectionAfter, inspectionBefore);
  return { readback: { orderID: source.production.id, batchID: batch.id, inspectionID: rejected.id, rejectedDecisionID: rejectedDecision.id, rejectedStatus: rejectedDecision.status,
    cancelledDecisionID: cancelled.id, cancelledStatus: cancelled.status, rejectedTaskStatus: rejectedTask.task_status_key, executedDecisionID: decision.id,
    executionStatus: decision.execution_status, batchStatus: state.production_wip_batches.find(row => row.id === batch.id).status,
    childCount: state.production_wip_batches.filter(row => row.origin_exception_decision_id === decision.id).length,
    finishedReceiptCount: client.query(`SELECT to_json(count(*)) FROM production_facts WHERE source_id=${source.production.id} AND fact_type='FINISHED_GOODS_RECEIPT'`),
    executionMovesNoInventory: true, originalInspectionRetained: true, inspectionBefore, inspectionAfter },
    page: { role: 'production', route: `${ROUTES.productionExceptions}?production_exception_id=${decision.id}`, id: decision.id, number: decision.decision_no } };
}

export async function runFulfillmentBranches(context) {
  const { client, report, browser, options } = context;
  const executors = { stock_reservation: reservation, source_rejections: sourceRejections, purchase_correction: purchaseCorrection,
    outsourcing_return: outsourcing, shipment_corrections: shipmentCorrections, finance_adjustments: finance, production_over_issue: productionQuota, production_scrap: productionScrap };
  report.branchFlows = [];
  // The correction creates the material lot consumed by the ordinary return,
  // allowance and scrap cases. Display order remains the stable case order.
  for (const key of ['purchase_correction', 'stock_reservation', 'source_rejections', 'outsourcing_return', 'shipment_corrections', 'finance_adjustments', 'production_over_issue', 'production_scrap']) {
    const flow = { key, passed: false, browserReadback: [] }; report.branchFlows.push(flow);
    const start = client.calls.length;
    const result = await executors[key](context); flow.readback = result.readback;
    await captureBranch(browser, options, report, flow, result.page);
    try { flow.passed = true; assertFulfillmentBranchFlow(flow); } catch (error) { flow.passed = false; throw error; }
    for (const entry of FULFILLMENT_REMAINING_STEPS.filter(row => row.caseKey === key)) report.steps.push({ ...entry, passed: true,
      requestIDs: client.calls.slice(start).map(row => row.requestID), readback: flow.readback });
  }
  report.branchFlows.sort((a, b) => Object.keys(FULFILLMENT_BRANCH_CASES).indexOf(a.key) - Object.keys(FULFILLMENT_BRANCH_CASES).indexOf(b.key));
  for (const flow of report.flows) {
    for (const fact of flow.finance) {
      const actual = (await client.rpc('finance', 'operational_fact', 'get_finance_fact', { id: fact.factID })).finance_fact;
      assert.equal(actual.status, 'SETTLED'); assert.equal(context.actions.exactMoneyCents(actual.outstanding_amount), 0);
    }
    assert.equal(context.actions.inventory(client, flow.ids.materialLotID).quantity, 0);
    assert.equal(context.actions.inventory(client, flow.ids.finishedLotID).quantity, 0);
  }
  report.originalCasesUnchanged = true;
}
