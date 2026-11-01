#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createTransactionClient, prepareTransactionFixture, prepareTransactionProductionSource } from './transaction-real-backend-fixture.mjs';
import { executeProductionWIPAction, applyFinishedGoodsDeliveryProcess } from './manual-acceptance-source-driven-facts.mjs';
import { manualAcceptanceFactRole } from './manual-acceptance-fact-data.mjs';
import { buildManualAcceptanceBusinessChainContract, validateBusinessChainDefinitionSnapshot } from './manual-acceptance-business-chain-contract.mjs';
import { DEV_FLOW_STATE_CATALOG } from '../../web/src/dev-workbench/config/devFlowStateCatalog.mjs';
import { BUSINESS_ROUTE_PATHS as ROUTES } from '../../web/src/erp/utils/masterDataOrderView.mjs';
import { PRODUCTION_WIP_ROUTE_CODE } from '../../web/src/erp/utils/productionWipModel.mjs';
import { RpcErrorCode as CODE } from '../../web/src/common/consts/errorCodes.generated.js';
import { login, navigate, selectRow, pageAction, closePage, settleRPCPage } from './transaction-browser-ui.mjs';
import { runFulfillmentBranches, assertFulfillmentBranchEvidence } from './transaction-fulfillment-branches.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const today = () => new Date().toISOString().slice(0, 10);
const customer = { customer_key: 'yoyoosun' };
const quantity = 2;
export const FULFILLMENT_CASES = Object.freeze(['order_to_settlement', 'quality_rework_to_settlement']);
export const FULFILLMENT_STEPS = Object.freeze({
  sales_to_production: [
    'sales_order:starts_process:sales_acceptance',
    'sales_acceptance:creates_task:sales_tasks',
    'sales_tasks:calls_domain_command:sales_acceptance',
    'sales_acceptance:requires:effective_bom',
    'effective_bom:calls_domain_command:material_request',
    'material_request:creates_source:generated_purchase_order',
    'material_request:requires:production_order',
    'effective_bom:creates_source:production_order',
  ],
  purchase_to_inventory: [
    'purchase_order:creates_fact_draft:purchase_receipt',
    'purchase_receipt:creates_fact_draft:purchase_quality',
    'purchase_quality:posts_fact:purchase_accepted',
    'purchase_accepted:posts_fact:purchase_lot',
    'purchase_lot:creates_fact_draft:purchase_payable_draft',
    'purchase_payable_draft:posts_fact:purchase_payable',
  ],
  production_to_inventory: [
    'released_production_order:posts_fact:wip_batch',
    'wip_batch:posts_fact:production_completion',
    'production_completion:posts_fact:finished_goods_lot',
    'finished_goods_lot:requires:finished_quality',
    'finished_quality:requires:packaging_confirmation',
    'packaging_confirmation:posts_fact:packaging_execution',
  ],
  outsourcing_to_inventory: [
    'outsourcing_order:posts_fact:outsourcing_issue',
    'outsourcing_order:posts_fact:outsourcing_stage',
    'outsourcing_stage:creates_fact_draft:outsourcing_payable_draft',
    'outsourcing_payable_draft:posts_fact:outsourcing_payable',
  ],
  delivery_to_settlement: [
    'shipment_draft:starts_process:shipment_release_process',
    'shipment_release_process:creates_task:shipment_release_task',
    'shipment_release_task:calls_domain_command:shipment_release',
    'shipment_release:posts_fact:shipped',
    'shipped:creates_fact_draft:receivable_draft',
    'receivable_draft:posts_fact:receivable',
  ],
  finance_payment_and_reversal: [
    'open_finance_fact:starts_process:finance_payment_process',
    'finance_payment_process:calls_domain_command:finance_payment',
    'finance_payment:posts_fact:finance_allocation',
    'finance_allocation:derives:settled_finance_fact',
  ],
  production_exception: [
    'production_exception_decision:starts_process:production_exception_process',
    'production_exception_process:creates_task:production_exception_task',
    'production_exception_task:creates_task:production_exception_execution_task',
    'production_exception_execution_task:calls_domain_command:production_exception_execution',
    'production_exception_execution:reworks:affected_wip',
    'affected_wip:derives:affected_production_fact',
  ],
});

export function exactMoneyCents(value) {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/u.exec(String(value));
  assert.ok(match, 'money must be a nonnegative fixed decimal');
  const fraction = (match[2] || '').padEnd(2, '0');
  assert.ok(!/[1-9]/u.test(fraction.slice(2)), 'this scenario requires exact cents');
  const cents = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2));
  assert.ok(cents <= BigInt(Number.MAX_SAFE_INTEGER));
  return Number(cents);
}

function positiveID(id) {
  assert.ok(Number.isSafeInteger(id) && id > 0, 'readback requires an exact positive source ID');
  return id;
}

export function assertFulfillmentCase(flow) {
  assert.ok(FULFILLMENT_CASES.includes(flow.key));
  assert.equal(flow.passed, true);
  for (const id of Object.values(flow.ids)) positiveID(id);
  const { ids, readback: r } = flow;
  assert.equal(r.orderQuantity, quantity);
  assert.equal(r.shippedQuantity, r.orderQuantity, 'partial shipment cannot prove full-order fulfillment');
  assert.equal(r.completedQuantity, r.orderQuantity);
  assert.equal(r.shipmentStatus, 'SHIPPED');
  assert.equal(r.receiptStatus, 'POSTED');
  assert.equal(r.completionStatus, 'POSTED');
  assert.equal(r.packagingStatus, 'ACCEPTED');
  assert.equal(r.materialBalance, 0);
  assert.equal(r.finishedBalance, 0);
  assert.equal(r.materialTransactions, 2);
  assert.equal(r.finishedTransactions, 2);
  assert.equal(r.shipmentOrderID, ids.salesOrderID);
  assert.equal(r.productionSalesItemID, ids.salesItemID);
  assert.equal(r.shipmentSalesItemID, ids.salesItemID);
  assert.equal(r.materialRequestOrderID, ids.salesOrderID);
  assert.equal(r.purchaseMaterialRequestID, ids.materialRequestID);
  assert.equal(r.receiptOrderID, ids.purchaseOrderID);
  assert.equal(r.shipmentLotID, ids.finishedLotID);
  assert.equal(r.completionOrderID, ids.productionOrderID);
  assert.equal(r.completionBatchID, ids.handworkBatchID);
  assert.equal(r.outsourcingOrderID, ids.contractID);
  assert.equal(r.issuedMaterialLotID, ids.materialLotID);
  assert.equal(r.issuedRequirementID, ids.materialRequirementID);
  assert.equal(r.issuedQuantity, quantity);
  assert.equal(r.acceptedOutsourcingQuantity, quantity);
  assert.equal(flow.quality.length, 7, 'incoming, fabric, shell, three finished gates and shipment inspection need real evidence');
  assert.ok(flow.quality.every(row => row.status === 'PASSED' && row.id > 0));
  assert.deepEqual(flow.guards, { earlyReceivableRejected: true, qualityDoesNotPostInventory: true, approvalDoesNotPostPayment: true, paymentReplayExact: true });
  assert.deepEqual(flow.finance.map(row => row.key), ['receivable', 'material_payable', 'processing_payable']);
  const amounts = { receivable: 700, material_payable: 250, processing_payable: 200 };
  const sourceIDs = { receivable: ids.shipmentID, material_payable: ids.receiptID, processing_payable: ids.contractID };
  const sourceTypes = { receivable: 'SHIPMENT', material_payable: 'PURCHASE_RECEIPT', processing_payable: 'OUTSOURCING_ORDER' };
  for (const fact of flow.finance) {
    positiveID(fact.factID); positiveID(fact.paymentID);
    assert.equal(fact.sourceID, sourceIDs[fact.key]);
    assert.equal(fact.sourceType, sourceTypes[fact.key]);
    assert.equal(fact.status, 'SETTLED');
    assert.equal(fact.outstandingCents, 0);
    assert.equal(fact.amountCents, amounts[fact.key]);
    assert.equal(fact.allocatedCents, fact.amountCents);
    assert.equal(fact.paymentStatus, 'POSTED');
    assert.equal(fact.paymentAvailableCents, 0);
    assert.equal(fact.allocationCount, 1);
    assert.equal(fact.distinctApprover, true);
    assert.equal(fact.reversed, false);
  }
  if (flow.key === 'quality_rework_to_settlement') {
    const x = flow.rework;
    assert.equal(x.decisionType, 'REWORK_ORIGINAL');
    assert.equal(x.executionStatus, 'APPLIED');
    assert.equal(x.originalStatus, 'CANCELLED');
    assert.equal(x.originalInspectionStatus, 'REJECTED');
    assert.equal(x.childSourceID, ids.rejectedBatchID);
    assert.equal(x.childDecisionID, ids.exceptionID);
    assert.equal(x.childID, ids.reworkBatchID);
    assert.equal(x.childOrderID, ids.productionOrderID);
    assert.equal(x.childQuantity, quantity);
    assert.equal(x.childFlow, 'REWORK');
    assert.equal(x.childStatus, 'ACCEPTED');
    assert.notEqual(x.reinspectionID, ids.rejectedInspectionID);
    assert.equal(x.reinspectionStatus, 'PASSED');
    assert.equal(x.reinspectionBatchID, ids.reworkBatchID);
    assert.equal(x.executionReplayExact, true);
    assert.equal(x.blockedBeforeRework, true);
    assert.equal(x.rejectionRetained, true);
    assert.equal(x.originalInspectionBefore.id, ids.rejectedInspectionID);
    assert.equal(x.originalInspectionBefore.status, 'REJECTED');
    assert.deepEqual(x.originalInspectionAfter, x.originalInspectionBefore, 'stored failed inspection must remain intact');
  } else assert.equal(flow.rework, null);
  assert.ok(flow.browserReadback.length >= 4);
  assert.ok(flow.browserReadback.every(row => row.sourceID > 0 && /^[a-z0-9_-]+\.png$/u.test(row.screenshot)));
}

export function assertFulfillmentChainEvidence(report) {
  assert.equal(report.status, 'passed');
  assert.match(report.runID, /^[a-f0-9]{12}$/u);
  assert.equal(report.simulatedOnly, true);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.flows.map(row => row.key), FULFILLMENT_CASES);
  report.flows.forEach(assertFulfillmentCase);
  for (const key of ['salesOrderID', 'salesItemID', 'purchaseOrderID', 'receiptID', 'materialLotID', 'productionOrderID', 'finishedLotID', 'shipmentID'])
    assert.equal(new Set(report.flows.map(row => row.ids[key])).size, 2, `${key} must be isolated per case`);
  validateBusinessChainDefinitionSnapshot(report.definitionSnapshot);
  const baselineProofCount = Object.entries(FULFILLMENT_STEPS).reduce((sum, [key, steps]) => sum + steps.length * (key === 'production_exception' ? 1 : 2), 0);
  assert.equal(report.steps.length, baselineProofCount + (report.includeBranches ? 28 : 0), 'unregistered proof cannot mark a handoff passed');
  if (!report.includeBranches) assert.deepEqual(report.branchFlows ?? [], []);
  const requests = [...report.fixtureRPC, ...report.browserRPC];
  for (const [chainKey, keys] of Object.entries(FULFILLMENT_STEPS)) {
    const chain = report.definitionSnapshot.chains.find(row => row.key === chainKey);
    assert.ok(chain);
    for (const stepKey of keys) {
      assert.ok(chain.steps.some(row => row.key === stepKey), `missing current chain definition ${stepKey}`);
      const proofs = report.steps.filter(row => row.chainKey === chainKey && row.key === stepKey);
      assert.equal(proofs.length, chainKey === 'production_exception' ? 1 : 2);
      for (const proof of proofs) {
        assert.ok(FULFILLMENT_CASES.includes(proof.caseKey));
        assert.equal(proof.passed, true);
        assert.ok(proof.requestIDs.length > 0);
        assert.ok(proof.requestIDs.every(id => requests.some(call => call.requestID === id)));
      }
    }
  }
  if (report.includeBranches) assertFulfillmentBranchEvidence(report);
}

async function completeTask(client, role, sourceType, sourceID, key, { approvedQuantity } = {}) {
  const { tasks } = await client.rpc(role, 'workflow', 'list_tasks', { source_type: sourceType, source_id: sourceID, limit: 100 });
  const ready = tasks.filter(row => row.owner_role_key === role && row.task_status_key === 'ready');
  assert.equal(ready.length, 1, `${role} needs exactly one ready source task`);
  const reason = '隔离模拟：核对来源、数量与责任后确认';
  const processDecision = role === 'boss' && ['finance_payment', 'production_exception_decision', 'inventory_operation'].includes(sourceType);
  const task = (await client.rpc(role, 'workflow', 'complete_task_action', {
    task_id: ready[0].id, expected_version: ready[0].version, action_key: 'complete', idempotency_key: key, reason,
    payload: { feedback: reason, surface_key: 'workflow_business_module', ...(processDecision ? { process_decision: { reason, ...(approvedQuantity ? { approved_quantity: approvedQuantity } : {}) } } : {}) },
  })).task;
  assert.equal(task.task_status_key, 'done');
  return task;
}

async function executeNode(client, role, processMethod, executeMethod, sourceField, sourceID, params) {
  const { process_context: process } = await client.rpc(role, 'customer_config', processMethod, { ...customer, [sourceField]: sourceID });
  assert.ok(process, 'source must have its formal approval process');
  assert.equal(process.process_instance.business_ref_id, sourceID);
  assert.equal(process.process_instance.process_key, sourceField === 'finance_payment_id' ? 'finance_payment_approval' : 'production_exception_approval');
  const nodes = process.nodes;
  assert.ok(Array.isArray(nodes));
  const nodeKey = executeMethod === 'execute_finance_payment_post' ? 'post_finance_payment' : 'execute_production_exception';
  const node = nodes.find(row => row.node_key === nodeKey);
  assert.ok(node, 'formal process must expose its execution node');
  const request = { ...customer, process_instance_id: process.process_instance.id, process_node_instance_id: node.id, expected_version: node.version, [sourceField]: sourceID, ...params };
  const result = await client.rpc(role, 'customer_config', executeMethod, request);
  return { result, request };
}

function inventory(client, lotID) {
  positiveID(lotID);
  return client.query(`SELECT json_build_object('quantity',(SELECT COALESCE(sum(quantity),0) FROM inventory_balances WHERE lot_id=${lotID}),'transactions',(SELECT count(*) FROM inventory_txns WHERE lot_id=${lotID}))`);
}

async function decideQuality(client, inspection, reject = false) {
  if (inspection.status === 'DRAFT') inspection = (await client.rpc('quality', 'quality', 'submit_quality_inspection', { id: inspection.id })).quality_inspection;
  assert.equal(inspection.status, 'SUBMITTED');
  const result = (await client.rpc('quality', 'quality', reject ? 'reject_quality_inspection' : 'pass_quality_inspection', {
    id: inspection.id, result: reject ? 'REJECT' : 'PASS', inspected_at: today(),
    check_items: [{ name: '隔离模拟尺寸与缝制检查', requirement: '符合模拟规格', observation: reject ? '模拟缝制尺寸偏差，需整批返工' : '模拟检查符合要求', result: reject ? 'FAIL' : 'PASS', scope: 'FULL', note: '仅隔离测试' }],
    defect_rate_operator: 'APPROX', defect_rate_percent: reject ? '25' : '0', decision_note: reject ? '模拟皮套不合格，保留原始记录' : '隔离模拟合格',
  })).quality_inspection;
  assert.equal(result.status, reject ? 'REJECTED' : 'PASSED');
  return result;
}

async function settle(client, source, key, fact) {
  assert.equal(fact.status, 'DRAFT');
  fact = (await client.rpc('finance', 'operational_fact', 'post_finance_fact', { id: fact.id, expected_version: fact.version })).finance_fact;
  assert.equal(fact.status, 'POSTED');
  const receipt = key === 'receivable';
  let payment = (await client.rpc('finance', 'operational_fact', 'create_finance_payment', {
    payment_no: `${source.prefix}-${key === 'receivable' ? 'AR' : key === 'material_payable' ? 'APM' : 'APC'}-PAY`,
    direction: receipt ? 'RECEIPT' : 'DISBURSEMENT', kind: 'SETTLEMENT',
    counterparty_type: receipt ? 'CUSTOMER' : 'SUPPLIER', counterparty_id: receipt ? source.customer.id : source.supplier.id,
    currency: 'CNY', amount: fact.amount, account_ref: '隔离模拟账户', evidence_ref: '隔离模拟结算凭据', idempotency_key: `${source.prefix}:${key}:payment`,
  })).payment;
  assert.equal(payment.status, 'DRAFT');
  await client.rpc('finance', 'customer_config', 'start_finance_payment_approval_process', { ...customer, finance_payment_id: payment.id, idempotency_key: `${source.prefix}:${key}:approval-process` });
  await completeTask(client, 'boss', 'finance_payment', payment.id, `${source.prefix}:${key}:approve`);
  await completeTask(client, 'finance', 'finance_payment', payment.id, `${source.prefix}:${key}:handled`);
  payment = (await client.rpc('finance', 'operational_fact', 'get_finance_payment', { id: payment.id })).payment;
  assert.equal(payment.status, 'APPROVED', 'workflow completion must not post a payment');
  assert.equal(client.query(`SELECT to_json(count(*)) FROM finance_allocations WHERE payment_id=${positiveID(payment.id)}`), 0);
  const execution = await executeNode(client, 'finance', 'get_finance_payment_approval_process', 'execute_finance_payment_post', 'finance_payment_id', payment.id, {
    idempotency_key: `${source.prefix}:${key}:post-payment`, allocations: [{ finance_fact_id: fact.id, amount: fact.amount }],
  });
  const read = async () => ({
    payment: (await client.rpc('finance', 'operational_fact', 'get_finance_payment', { id: payment.id })).payment,
    fact: (await client.rpc('finance', 'operational_fact', 'get_finance_fact', { id: fact.id })).finance_fact,
    ledger: client.query(`SELECT json_build_object('count',count(*),'amount',COALESCE(sum(CASE WHEN reversal_of_allocation_id IS NULL THEN amount ELSE -amount END),0)) FROM finance_allocations WHERE payment_id=${payment.id} AND finance_fact_id=${positiveID(fact.id)}`),
    row: client.query(`SELECT json_build_object('status',status,'amount',amount,'sourceID',source_id,'distinctApprover',approved_by<>created_by,'reversed',reversed_at IS NOT NULL) FROM finance_payments WHERE id=${payment.id}`),
    factRow: client.query(`SELECT json_build_object('status',status,'amount',amount,'sourceID',source_id,'sourceType',source_type) FROM finance_facts WHERE id=${fact.id}`),
  });
  const after = await read();
  await client.rpc('finance', 'customer_config', 'execute_finance_payment_post', execution.request);
  assert.deepEqual(await read(), after, 'payment replay must not allocate twice');
  assert.equal(after.fact.status, 'SETTLED');
  assert.equal(after.payment.status, 'POSTED');
  assert.equal(after.row.status, 'POSTED');
  assert.equal(after.factRow.status, after.fact.status);
  assert.equal(after.factRow.sourceID, after.fact.source_id);
  assert.equal(after.factRow.sourceType, after.fact.source_type);
  assert.equal(exactMoneyCents(after.factRow.amount), exactMoneyCents(after.fact.amount));
  assert.equal(exactMoneyCents(after.row.amount), exactMoneyCents(after.fact.amount));
  return { key, factID: fact.id, paymentID: payment.id, sourceID: after.factRow.sourceID, sourceType: after.factRow.sourceType,
    status: after.fact.status, amountCents: exactMoneyCents(after.fact.amount), outstandingCents: exactMoneyCents(after.fact.outstanding_amount),
    allocatedCents: exactMoneyCents(after.ledger.amount), allocationCount: after.ledger.count,
    paymentStatus: after.payment.status, paymentAvailableCents: exactMoneyCents(after.payment.available_amount),
    distinctApprover: after.row.distinctApprover, reversed: after.row.reversed };
}

async function captureReadback(browser, options, client, report, flow) {
  const entries = [
    { role: 'sales', route: `${ROUTES.salesOrders}?sales_order_id=${flow.ids.salesOrderID}`, sourceID: flow.ids.salesOrderID, text: flow.orderNo, key: 'order', detailAction: '查看详情' },
    { role: 'pmc', route: `${ROUTES.productionOrders}?production_order_id=${flow.ids.productionOrderID}`, sourceID: flow.ids.productionOrderID, text: flow.productionNo, key: 'production', detailAction: /^查\s*看$/u },
    { role: 'sales', route: `${ROUTES.shipments}?shipment_id=${flow.ids.shipmentID}`, sourceID: flow.ids.shipmentID, text: flow.shipmentNo, key: 'shipment', status: '已出货' },
    { role: 'finance', route: ROUTES.receivables, sourceID: flow.finance[0].factID, text: flow.receivableNo, key: 'settled', status: '已结清' },
    ...(flow.rework ? [{ role: 'production', route: `${ROUTES.productionExceptions}?production_exception_id=${flow.ids.exceptionID}`, sourceID: flow.ids.exceptionID, text: flow.exceptionNo, key: 'rework' }] : []),
  ];
  for (const entry of entries) {
    assert.ok(entry.route.startsWith('/erp/'), `missing canonical ${entry.key} route`);
    const { page, context } = await login(browser, options, entry.role, report);
    try {
      await navigate(page, `${options.baseURL}${entry.route}`);
      await settleRPCPage(page);
      const row = page.locator(`tr[data-row-key="${entry.sourceID}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(entry.text);
      if (entry.status) await expect(row).toContainText(entry.status);
      if (entry.detailAction) { await selectRow(page, entry.sourceID); await pageAction(page, entry.detailAction); await settleRPCPage(page); }
      const screenshot = `${flow.key}-${entry.key}.png`;
      await page.screenshot({ path: path.join(options.outputDir, screenshot), fullPage: false, animations: 'disabled' });
      flow.browserReadback.push({ key: entry.key, role: entry.role, sourceID: entry.sourceID, screenshot, viewport: { width: 1920, height: 1080 }, pixelSize: { width: 3840, height: 2160 } });
    } catch (error) {
      await page.screenshot({ path: path.join(options.outputDir, 'failure.png'), fullPage: false }).catch(() => {});
      report.visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 16000);
      throw error;
    } finally { await closePage(page, context); }
  }
}

async function runCase(browser, options, client, fixture, report, key) {
  const rework = key === 'quality_rework_to_settlement';
  const beforeSource = client.calls.length;
  const source = await prepareTransactionProductionSource(client, options, { ...fixture, prefix: `${fixture.prefix}-${rework ? 'RW' : 'OK'}`, orderedQuantity: quantity });
  const flow = { key, passed: false, ids: {}, quality: [], finance: [], rework: null, guards: {}, browserReadback: [], orderNo: source.salesOrder.order_no };
  report.flows.push(flow);
  const mark = (chainKey, start, readback) => {
    for (const stepKey of FULFILLMENT_STEPS[chainKey]) report.steps.push({ chainKey, key: stepKey, caseKey: key, passed: true,
      requestIDs: client.calls.slice(start).map(row => row.requestID), readback });
  };
  const materialRequest = await client.rpc('engineering', 'sales_order', 'get_engineering_material_request', { sales_order_id: source.salesOrder.id });
  assert.equal(materialRequest.status, 'APPROVED');
  assert.equal(materialRequest.purchase_orders.length, 1);
  let purchaseOrder = (await client.rpc('purchase', 'purchase_order', 'get_purchase_order', { id: materialRequest.purchase_orders[0].id })).purchase_order;
  assert.equal(client.query(`SELECT to_json(engineering_material_request_id) FROM purchase_orders WHERE id=${positiveID(purchaseOrder.id)}`), materialRequest.id);
  const { purchase_order_items: purchaseItems } = await client.rpc('purchase', 'purchase_order', 'list_purchase_order_items', { purchase_order_id: purchaseOrder.id, limit: 100 });
  assert.equal(purchaseItems.length, 1);
  assert.equal(Number(purchaseItems[0].purchased_quantity), quantity);
  purchaseOrder = (await client.rpc('purchase', 'purchase_order', 'complete_purchase_order_terms', { id: purchaseOrder.id, expected_version: purchaseOrder.version,
    idempotency_key: `${source.prefix}:purchase-terms`, expected_arrival_date: null, supplier_confirmed_arrival_date: null,
    items: [{ id: purchaseItems[0].id, unit_price: '1.25', expected_arrival_date: null }],
  })).purchase_order;
  const purchaseStart = client.calls.length;
  let receipt = (await client.rpc('warehouse', 'purchase', 'create_purchase_receipt_from_purchase_order', {
    purchase_order_id: purchaseOrder.id, all_remaining: true, receipt_no: `${source.prefix}-PR`, warehouse_id: source.warehouse.id,
    received_at: today(), idempotency_key: `${source.prefix}:receipt`, note: '同一订单需料单采购到货，仅隔离模拟',
  })).purchase_receipt;
  assert.equal(receipt.status, 'DRAFT');
  const { quality_inspections: incoming } = await client.rpc('quality', 'quality', 'list_quality_inspections', { purchase_receipt_id: receipt.id, limit: 100 });
  assert.equal(incoming.length, 1);
  const materialLotID = receipt.items[0].lot_id;
  const heldStock = inventory(client, materialLotID);
  flow.quality.push(await decideQuality(client, incoming[0]));
  assert.deepEqual(inventory(client, materialLotID), heldStock, 'quality pass is not an inventory posting');
  receipt = (await client.rpc('warehouse', 'purchase', 'post_purchase_receipt', { id: receipt.id })).purchase_receipt;
  assert.equal(receipt.status, 'POSTED');
  assert.equal(inventory(client, materialLotID).quantity, quantity);

  let aggregate = await client.rpc('pmc', 'production_order', 'create_production_order', { order_no: `${source.prefix}-MO`, idempotency_key: `${source.prefix}:production`,
    items: [{ line_no: 1, product_id: source.salesItem.product_id, product_sku_id: source.salesItem.product_sku_id,
      unit_id: source.salesItem.unit_id, sales_order_item_id: source.salesItem.id, bom_header_id: source.bom.id, planned_quantity: String(quantity), route_code: PRODUCTION_WIP_ROUTE_CODE }],
  });
  aggregate = await client.rpc('pmc', 'production_order', 'release_production_order', { production_order_id: aggregate.production_order.id,
    expected_version: aggregate.production_order.version, idempotency_key: `${source.prefix}:release` });
  const production = aggregate.production_order;
  const productionItem = aggregate.production_order_items[0];
  flow.productionNo = production.order_no;
  await completeTask(client, 'pmc', 'production-orders', production.id, `${source.prefix}:scheduled`);
  const { material_requirements: requirements } = await client.rpc('warehouse', 'operational_fact', 'list_production_order_material_requirements', { production_order_id: production.id });
  assert.equal(requirements.length, 1);
  assert.equal(Number(requirements[0].planned_quantity), quantity);
  mark('sales_to_production', beforeSource, { salesOrderID: source.salesOrder.id, materialRequestID: materialRequest.id, purchaseOrderID: purchaseOrder.id, productionOrderID: production.id });

  const productionStart = client.calls.length;
  const rpc = ({ actor, domain, method, params }) => client.rpc(actor || (domain === 'operational_fact' && /finance|receivable/u.test(method) ? 'finance' : manualAcceptanceFactRole(domain, method, params)), domain, method,
    domain === 'quality' && /^(pass|reject)_quality_inspection$/u.test(method) ? { ...params, inspected_at: today() } : params);
  const readWip = () => client.rpc('production', 'production_wip', 'get_production_wip', { production_order_id: production.id });
  let state = await readWip();
  const operations = ['FABRIC_PROCESSING', 'SEWING', 'HANDWORK', 'PACKAGING'].map(code => {
    const matches = state.production_order_operations.filter(row => row.operation_code === code && row.production_order_item_id === productionItem.id);
    assert.equal(matches.length, 1); return matches[0];
  });
  const batchFor = (wip, operation) => {
    const batches = wip.production_wip_batches.filter(row => row.production_order_operation_id === operation.id && row.status !== 'CANCELLED');
    assert.equal(batches.length, 1, `one live batch required for ${operation.operation_code}`); return batches[0];
  };
  const act = async (operation, batch, action, more = {}) => {
    await executeProductionWIPAction(rpc, { action, production_order_id: production.id, production_wip_batch_id: batch.id,
      expected_version: batch.version, idempotency_key: `${source.prefix}:${batch.id}:${action}`, ...more }, operation.operation_code);
    state = await readWip(); return batchFor(state, operation);
  };
  const passStage = async (batch) => {
    const { quality_inspections } = await client.rpc('quality', 'quality', 'list_production_stage_quality_inspections', { production_wip_batch_id: batch.id, limit: 100 });
    const active = quality_inspections.filter(row => ['DRAFT', 'SUBMITTED'].includes(row.status));
    assert.equal(active.length, 1, 'one actionable stage gate at a time');
    const result = await decideQuality(client, active[0]);
    flow.quality.push(result); return result;
  };
  let completion;
  let issue;
  let rejectedInspection;
  let originalBatch;
  for (const [index, operation] of operations.entries()) {
    if (index > 0) {
      const previous = operations[index - 1];
      const batch = batchFor(await readWip(), previous);
      assert.equal(batch.status, 'ACCEPTED');
      await executeProductionWIPAction(rpc, { action: 'TRANSFER_TO_NEXT_OPERATION', production_order_id: production.id, production_wip_batch_id: batch.id,
        expected_version: batch.version, target_operation_id: operation.id, quantity: batch.quantity, idempotency_key: `${source.prefix}:${previous.id}:transfer`,
        ...(completion && operation.operation_code === 'PACKAGING' ? { finished_goods_receipt_id: completion.id } : {}),
      }, previous.operation_code);
    }
    state = await readWip();
    let batch = batchFor(state, operation);
    if (operation.operation_code === 'PACKAGING') {
      const confirmations = state.packaging_confirmations.filter(row => row.production_order_item_id === productionItem.id);
      assert.equal(confirmations.length, 1);
      await executeProductionWIPAction(rpc, { action: 'CONFIRM_PACKAGING_MATERIAL', production_order_id: production.id, production_order_item_id: productionItem.id,
        expected_version: confirmations[0].version, idempotency_key: `${source.prefix}:packaging-confirm`, packaging_version_snapshot: `${source.prefix}-PACK`, note: '隔离模拟包装材料确认' }, operation.operation_code);
    }
    batch = await act(operation, batch, 'ASSIGN_EXECUTION', { execution_mode: index === 0 ? 'OUTSOURCED' : 'IN_HOUSE',
      ...(index === 0 ? { outsourcing_allocations: [{ outsourcing_order_item_id: source.contractItem.id, production_order_material_requirement_id: requirements[0].id }] } : {}) });
    if (index === 0) {
      issue = (await client.rpc('warehouse', 'operational_fact', 'create_outsourcing_material_issue_from_order', {
        fact_no: `${source.prefix}-ISSUE`, outsourcing_order_id: source.contract.id, outsourcing_order_item_id: source.contractItem.id,
        warehouse_id: source.warehouse.id, lot_id: materialLotID, quantity: String(quantity), idempotency_key: `${source.prefix}:issue`,
      })).outsourcing_fact;
      assert.equal(inventory(client, materialLotID).quantity, quantity);
      issue = (await client.rpc('warehouse', 'operational_fact', 'post_outsourcing_fact', { id: issue.id, expected_version: issue.version })).outsourcing_fact;
      assert.equal(issue.status, 'POSTED');
      assert.equal(inventory(client, materialLotID).quantity, 0);
    }
    batch = await act(operation, batch, 'START_OPERATION');
    batch = await act(operation, batch, index === 0 ? 'RECEIVE_OUTSOURCING_RETURN' : 'COMPLETE_OPERATION', index === 0 ? { quantity: String(quantity) } : {});
    if (index === 1 && rework) {
      originalBatch = batch;
      const current = await client.rpc('quality', 'quality', 'list_production_stage_quality_inspections', { production_wip_batch_id: batch.id, limit: 100 });
      assert.equal(current.quality_inspections.length, 1);
      rejectedInspection = await decideQuality(client, current.quality_inspections[0], true);
      assert.equal(rejectedInspection.gate_code, 'SHELL');
      const originalInspectionBefore = client.query(`SELECT to_jsonb(q) FROM quality_inspections q WHERE id=${positiveID(rejectedInspection.id)}`);
      const beforeBlocked = await readWip();
      const blocked = await client.raw('production', 'production_wip', 'execute_production_wip_action', {
        action: 'TRANSFER_TO_NEXT_OPERATION', production_order_id: production.id, production_wip_batch_id: batch.id, target_operation_id: operations[2].id,
        expected_version: (await readWip()).production_wip_batches.find(row => row.id === batch.id).version, quantity: String(quantity), idempotency_key: `${source.prefix}:reject-transfer`,
      });
      assert.equal(blocked.code, CODE.BUSINESS_RULE_VIOLATION);
      assert.deepEqual(await readWip(), beforeBlocked);
      const exceptionStart = client.calls.length;
      let decision = (await client.rpc('sales', 'operational_fact', 'submit_production_exception', {
        decision_no: `${source.prefix}-REWORK`, decision_type: 'REWORK_ORIGINAL', production_order_id: production.id, production_order_item_id: productionItem.id,
        production_wip_batch_id: batch.id, quality_inspection_id: rejectedInspection.id, target_operation_id: operation.id,
        requested_quantity: String(quantity), reason: '隔离模拟：整批皮套尺寸偏差，原岗位返工后重新检验', idempotency_key: `${source.prefix}:rework`,
      })).production_exception;
      flow.exceptionNo = decision.decision_no;
      await client.rpc('sales', 'customer_config', 'start_production_exception_approval_process', { ...customer, production_exception_id: decision.id, idempotency_key: `${source.prefix}:rework-process` });
      await completeTask(client, 'boss', 'production_exception_decision', decision.id, `${source.prefix}:rework-approve`);
      await completeTask(client, 'production', 'production_exception_decision', decision.id, `${source.prefix}:rework-handled`);
      assert.equal((await readWip()).production_wip_batches.find(row => row.id === batch.id).status, 'REJECTED');
      const execution = await executeNode(client, 'production', 'get_production_exception_approval_process', 'execute_production_exception_process', 'production_exception_id', decision.id, {
        idempotency_key: `${source.prefix}:rework-execute`, reason: '隔离模拟：执行已批准原岗位返工，保留原不合格检验',
      });
      const afterExecute = await readWip();
      await client.rpc('production', 'customer_config', 'execute_production_exception_process', execution.request);
      assert.deepEqual(await readWip(), afterExecute, 'rework execution replay must not create duplicate children');
      decision = (await client.rpc('production', 'operational_fact', 'get_production_exception', { id: decision.id })).production_exception;
      const children = afterExecute.production_wip_batches.filter(row => row.origin_exception_decision_id === decision.id);
      assert.equal(children.length, 1);
      batch = children[0];
      Object.assign(flow.ids, { rejectedBatchID: originalBatch.id, rejectedInspectionID: rejectedInspection.id, exceptionID: decision.id, reworkBatchID: batch.id });
      flow.rework = { decisionType: decision.decision_type, executionStatus: decision.execution_status, executionReplayExact: true, blockedBeforeRework: true };
      batch = await act(operation, batch, 'ASSIGN_EXECUTION', { execution_mode: 'IN_HOUSE' });
      batch = await act(operation, batch, 'START_OPERATION');
      batch = await act(operation, batch, 'COMPLETE_OPERATION');
      const reinspection = await passStage(batch);
      const final = await readWip();
      const child = final.production_wip_batches.find(row => row.id === batch.id);
      const original = final.production_wip_batches.find(row => row.id === originalBatch.id);
      const retained = (await client.rpc('quality', 'quality', 'get_quality_inspection', { id: rejectedInspection.id })).quality_inspection;
      const originalInspectionAfter = client.query(`SELECT to_jsonb(q) FROM quality_inspections q WHERE id=${rejectedInspection.id}`);
      assert.deepEqual(originalInspectionAfter, originalInspectionBefore, 'stored failed inspection must remain unchanged');
      assert.equal(retained.status, 'REJECTED');
      assert.deepEqual(retained.check_items, rejectedInspection.check_items);
      Object.assign(flow.rework, { originalStatus: original.status, originalInspectionStatus: retained.status, rejectionRetained: true,
        originalInspectionBefore, originalInspectionAfter,
        childID: child.id, childSourceID: child.source_batch_id, childDecisionID: child.origin_exception_decision_id, childOrderID: child.production_order_id,
        childQuantity: Number(child.quantity), childFlow: child.flow_type, childStatus: child.status,
        reinspectionID: reinspection.id, reinspectionStatus: reinspection.status, reinspectionBatchID: reinspection.production_wip_batch_id });
      mark('production_exception', exceptionStart, { exceptionID: decision.id, rejectedBatchID: original.id, reworkBatchID: child.id, reinspectionID: reinspection.id });
    } else if (index === 2) {
      completion = (await client.rpc('warehouse', 'operational_fact', 'create_production_completion_from_order', {
        fact_no: `${source.prefix}-FG`, production_order_id: production.id, production_order_item_id: productionItem.id, production_wip_batch_id: batch.id,
        warehouse_id: source.finishedWarehouse.id, new_lot_no: `${source.prefix}-FG-LOT`, quantity: String(quantity), idempotency_key: `${source.prefix}:finished`,
      })).production_fact;
      assert.equal(completion.status, 'DRAFT');
      completion = (await client.rpc('warehouse', 'operational_fact', 'post_production_fact', { id: completion.id, expected_version: completion.version })).production_fact;
      assert.equal(completion.status, 'POSTED');
      const stockBeforeQuality = inventory(client, completion.lot_id);
      for (let gate = 0; gate < 3; gate++) await passStage(batch);
      assert.deepEqual(inventory(client, completion.lot_id), stockBeforeQuality);
      flow.ids.handworkBatchID = batch.id;
    } else if (index < 3) await passStage(batch);
    const finished = batchFor(await readWip(), operation);
    assert.equal(finished.status, 'ACCEPTED');
  }
  mark('production_to_inventory', productionStart, { productionOrderID: production.id, completionID: completion.id, finishedLotID: completion.lot_id });

  const deliveryStart = client.calls.length;
  let shipment = (await client.rpc('sales', 'operational_fact', 'create_shipment_with_items', {
    shipment_no: `${source.prefix}-SHIP`, sales_order_id: source.salesOrder.id, customer_id: source.customer.id, idempotency_key: `${source.prefix}:shipment`,
    items: [{ sales_order_item_id: source.salesItem.id, product_id: source.salesItem.product_id, product_sku_id: source.salesItem.product_sku_id,
      warehouse_id: source.finishedWarehouse.id, unit_id: source.salesItem.unit_id, lot_id: completion.lot_id, quantity: String(quantity) }],
  })).shipment;
  const beforeShip = inventory(client, completion.lot_id);
  const early = await client.raw('finance', 'operational_fact', 'create_receivable_from_shipment', { shipment_id: shipment.id, fact_no: `${source.prefix}-EARLY`, idempotency_key: `${source.prefix}:early-ar` });
  assert.equal(early.code, CODE.INVALID_PARAM);
  assert.deepEqual(inventory(client, completion.lot_id), beforeShip);
  assert.equal(client.query(`SELECT to_json(count(*)) FROM finance_facts WHERE source_id=${positiveID(shipment.id)} AND source_type='SHIPMENT'`), 0);
  const delivery = await applyFinishedGoodsDeliveryProcess({ rpc, shipment, productId: source.salesItem.product_id, finishedGoodsLotId: completion.lot_id,
    warehouseId: source.finishedWarehouse.id, inspectionNo: `${source.prefix}-OQC`, expectedAmount: '7', receivableSourceNo: `${source.prefix}-AR`,
    processIdempotencyKey: `${source.prefix}:delivery`, approvalIdempotencyKey: `${source.prefix}:finance-release`, receivableIdempotencyKey: `${source.prefix}:receivable` });
  shipment = delivery.shipment;
  flow.quality.push(delivery.qualityInspection);
  flow.shipmentNo = shipment.shipment_no;
  flow.receivableNo = delivery.receivable.fact_no;
  const financeStart = client.calls.length;
  flow.finance.push(await settle(client, source, 'receivable', delivery.receivable));
  mark('delivery_to_settlement', deliveryStart, { shipmentID: shipment.id, shipmentStatus: shipment.status, receivableID: delivery.receivable.id });
  const materialPayable = (await client.rpc('finance', 'operational_fact', 'create_payable_from_purchase_receipt', {
    purchase_receipt_id: receipt.id, fact_no: `${source.prefix}-APM`, idempotency_key: `${source.prefix}:material-ap`,
  })).finance_fact;
  flow.finance.push(await settle(client, source, 'material_payable', materialPayable));
  mark('purchase_to_inventory', purchaseStart, { purchaseOrderID: purchaseOrder.id, receiptID: receipt.id, payableID: materialPayable.id });
  const processingPayable = (await client.rpc('finance', 'operational_fact', 'create_payable_from_outsourcing_order', {
    outsourcing_order_id: source.contract.id, fact_no: `${source.prefix}-APC`, idempotency_key: `${source.prefix}:processing-ap`,
  })).finance_fact;
  flow.finance.push(await settle(client, source, 'processing_payable', processingPayable));
  mark('outsourcing_to_inventory', productionStart, { outsourcingOrderID: source.contract.id, materialIssueID: issue.id, payableID: processingPayable.id });
  mark('finance_payment_and_reversal', financeStart, { facts: flow.finance });
  Object.assign(flow.ids, { salesOrderID: source.salesOrder.id, salesItemID: source.salesItem.id, materialRequestID: materialRequest.id, purchaseOrderID: purchaseOrder.id,
    receiptID: receipt.id, materialLotID, productionOrderID: production.id, productionItemID: productionItem.id, finishedLotID: completion.lot_id,
    completionID: completion.id, shipmentID: shipment.id, contractID: source.contract.id, materialRequirementID: requirements[0].id, issueID: issue.id });
  Object.values(flow.ids).forEach(positiveID);
  const materialStock = inventory(client, materialLotID), finishedStock = inventory(client, completion.lot_id);
  const lineage = client.query(`SELECT json_build_object(
    'orderQuantity',(SELECT ordered_quantity FROM sales_order_items WHERE id=${source.salesItem.id}),
    'shippedQuantity',(SELECT COALESCE(sum(si.quantity),0) FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE s.status='SHIPPED' AND si.sales_order_item_id=${source.salesItem.id}),
    'completedQuantity',(SELECT COALESCE(sum(quantity),0) FROM production_facts WHERE status='POSTED' AND fact_type='FINISHED_GOODS_RECEIPT' AND source_id=${production.id}),
    'shipmentStatus',(SELECT status FROM shipments WHERE id=${shipment.id}),
    'receiptStatus',(SELECT status FROM purchase_receipts WHERE id=${receipt.id}),
    'completionStatus',(SELECT status FROM production_facts WHERE id=${completion.id}),
    'shipmentOrderID',(SELECT sales_order_id FROM shipments WHERE id=${shipment.id}),
    'productionSalesItemID',(SELECT sales_order_item_id FROM production_order_items WHERE id=${productionItem.id}),
    'shipmentSalesItemID',(SELECT sales_order_item_id FROM shipment_items WHERE shipment_id=${shipment.id}),
    'materialRequestOrderID',(SELECT sales_order_id FROM engineering_material_requests WHERE id=${materialRequest.id}),
    'purchaseMaterialRequestID',(SELECT engineering_material_request_id FROM purchase_orders WHERE id=${purchaseOrder.id}),
    'receiptOrderID',(SELECT poi.purchase_order_id FROM purchase_receipt_items pri JOIN purchase_order_items poi ON poi.id=pri.purchase_order_item_id WHERE pri.receipt_id=${receipt.id}),
    'shipmentLotID',(SELECT lot_id FROM shipment_items WHERE shipment_id=${shipment.id}),
    'completionOrderID',(SELECT source_id FROM production_facts WHERE id=${completion.id}),
    'completionBatchID',(SELECT production_wip_batch_id FROM production_facts WHERE id=${completion.id}),
    'outsourcingOrderID',(SELECT source_id FROM outsourcing_facts WHERE id=${issue.id}),
    'issuedMaterialLotID',(SELECT lot_id FROM outsourcing_facts WHERE id=${issue.id}),
    'issuedRequirementID',(SELECT production_order_material_requirement_id FROM production_wip_outsourcing_allocations WHERE outsourcing_order_item_id=${source.contractItem.id}),
    'issuedQuantity',(SELECT quantity FROM outsourcing_facts WHERE id=${issue.id}))`);
  state = await readWip();
  const fabric = batchFor(state, operations[0]), packaging = batchFor(state, operations[3]);
  flow.readback = { ...lineage, packagingStatus: packaging.status, acceptedOutsourcingQuantity: Number(fabric.quantity),
    materialBalance: materialStock.quantity, materialTransactions: materialStock.transactions,
    finishedBalance: finishedStock.quantity, finishedTransactions: finishedStock.transactions };
  flow.guards = { earlyReceivableRejected: true, qualityDoesNotPostInventory: true, approvalDoesNotPostPayment: true, paymentReplayExact: true };
  await captureReadback(browser, options, client, report, flow);
  flow.passed = true;
  assertFulfillmentCase(flow);
}

export async function runFulfillmentChains(input) {
  assert.equal(typeof (input.includeBranches ?? false), 'boolean');
  const options = { ...input, mobile: false, fourK: true, purchaseDraftOnly: true, outputDir: path.join(input.outputDir, 'fulfillment-chains') };
  await fs.mkdir(options.outputDir, { recursive: true, mode: 0o700 });
  const client = createTransactionClient(options);
  const report = { status: 'running', runID: input.runID, simulatedOnly: true, generatedAt: new Date().toISOString(),
    scope: 'role-api-postgres-browser-readback', includeBranches: input.includeBranches ?? false, flows: [], steps: [], browserRPC: [], pageErrors: [],
    definitionSnapshot: buildManualAcceptanceBusinessChainContract({ catalog: DEV_FLOW_STATE_CATALOG }).definitionSnapshot };
  let browser;
  try {
    report.identity = await client.verify();
    const fixture = await prepareTransactionFixture(client, options);
    report.frontendIdentity = await client.verifyFrontend();
    browser = await chromium.launch({ headless: true });
    for (const key of FULFILLMENT_CASES) await runCase(browser, options, client, fixture, report, key);
    if (report.includeBranches) await runFulfillmentBranches({ client, fixture, browser, options, report,
      actions: { completeTask, executeNode, decideQuality, inventory, exactMoneyCents } });
    report.fixtureRPC = client.calls;
    report.status = 'passed';
    assertFulfillmentChainEvidence(report);
  } catch (error) {
    report.status = 'failed';
    report.error = String(error.stack).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted database URL]');
    for (const secret of [options.adminPassword, options.rolePassword]) if (secret) report.error = report.error.split(secret).join('[redacted]');
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(options.outputDir, 'failure.png'), fullPage: false }).catch(() => {});
      report.visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 16000);
    }
  } finally {
    await browser?.close(); report.fixtureRPC = client.calls; report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(options.outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url) {
  assert.deepEqual(process.argv.slice(2, 3), ['--environment']); assert.equal(process.argv.length, 4);
  const report = await runFulfillmentChains(JSON.parse(await fs.readFile(process.argv[3], 'utf8')));
  process.stdout.write(`continuous fulfillment chains: ${report.status}, ${report.flows.length} cases\n`);
  if (report.status !== 'passed') process.exitCode = 1;
}
