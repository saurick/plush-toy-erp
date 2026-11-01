import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertFulfillmentCase, assertFulfillmentChainEvidence, FULFILLMENT_CASES, FULFILLMENT_STEPS, exactMoneyCents } from './transaction-fulfillment-chains.mjs';
import { buildFulfillmentChainReport, fulfillmentBusinessReport, publishFulfillmentChainEvidence } from './fulfillment-chain-evidence.mjs';
import { buildManualAcceptanceBusinessChainContract } from './manual-acceptance-business-chain-contract.mjs';
import { DEV_FLOW_STATE_CATALOG } from '../../web/src/dev-workbench/config/devFlowStateCatalog.mjs';
import { transactionBrowserBudget, verifyTransactionRequestLogs } from './transaction-browser-isolated.mjs';
import { verifyGoTestJson } from './verify-go-test-json.mjs';
import { createDevBusinessChainAuditService } from '../../web/dev-server/devBusinessChainAuditPlugin.mjs';
import { FULFILLMENT_BRANCH_CASES, FULFILLMENT_REMAINING_STEPS, assertFulfillmentBranchFlow } from './transaction-fulfillment-branches.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
function flow(key, offset = 0) {
  const names = ['salesOrderID', 'salesItemID', 'materialRequestID', 'purchaseOrderID', 'receiptID', 'materialLotID', 'productionOrderID', 'productionItemID', 'finishedLotID', 'completionID', 'shipmentID', 'contractID', 'materialRequirementID', 'issueID', 'handworkBatchID'];
  const ids = Object.fromEntries(names.map((name, i) => [name, offset + i + 1]));
  const result = { key, passed: true, ids, orderNo: `SIM-E2E-${key}`,
    quality: Array.from({ length: 7 }, (_, i) => ({ id: offset + 100 + i, status: 'PASSED' })),
    readback: { orderQuantity: 2, shippedQuantity: 2, completedQuantity: 2, shipmentStatus: 'SHIPPED', receiptStatus: 'POSTED', completionStatus: 'POSTED', packagingStatus: 'ACCEPTED',
      materialBalance: 0, finishedBalance: 0, materialTransactions: 2, finishedTransactions: 2,
      shipmentOrderID: ids.salesOrderID, productionSalesItemID: ids.salesItemID, shipmentSalesItemID: ids.salesItemID, materialRequestOrderID: ids.salesOrderID,
      purchaseMaterialRequestID: ids.materialRequestID, receiptOrderID: ids.purchaseOrderID, shipmentLotID: ids.finishedLotID, completionOrderID: ids.productionOrderID,
      completionBatchID: ids.handworkBatchID, outsourcingOrderID: ids.contractID, issuedMaterialLotID: ids.materialLotID, issuedRequirementID: ids.materialRequirementID,
      issuedQuantity: 2, acceptedOutsourcingQuantity: 2 },
    guards: { earlyReceivableRejected: true, qualityDoesNotPostInventory: true, approvalDoesNotPostPayment: true, paymentReplayExact: true },
    finance: ['receivable', 'material_payable', 'processing_payable'].map((key, i) => ({ key, factID: offset + 200 + i, paymentID: offset + 210 + i,
      sourceID: [ids.shipmentID, ids.receiptID, ids.contractID][i], sourceType: ['SHIPMENT', 'PURCHASE_RECEIPT', 'OUTSOURCING_ORDER'][i], status: 'SETTLED', amountCents: [700, 250, 200][i], outstandingCents: 0, allocatedCents: [700, 250, 200][i],
      paymentStatus: 'POSTED', paymentAvailableCents: 0, allocationCount: 1, distinctApprover: true, reversed: false })),
    browserReadback: ['order', 'production', 'shipment', 'settled'].map(name => ({ sourceID: ids.salesOrderID, screenshot: `${key}-${name}.png`, key: name, role: 'sales' })), rework: null };
  if (key === 'quality_rework_to_settlement') {
    Object.assign(ids, { rejectedBatchID: offset + 50, rejectedInspectionID: offset + 51, exceptionID: offset + 52, reworkBatchID: offset + 53 });
    result.rework = { decisionType: 'REWORK_ORIGINAL', executionStatus: 'APPLIED', originalStatus: 'CANCELLED', originalInspectionStatus: 'REJECTED',
      childSourceID: ids.rejectedBatchID, childDecisionID: ids.exceptionID, childID: ids.reworkBatchID, childOrderID: ids.productionOrderID,
      childQuantity: 2, childFlow: 'REWORK', childStatus: 'ACCEPTED', reinspectionID: offset + 54, reinspectionStatus: 'PASSED', reinspectionBatchID: ids.reworkBatchID,
      executionReplayExact: true, blockedBeforeRework: true, rejectionRetained: true };
    result.rework.originalInspectionBefore = { id: ids.rejectedInspectionID, status: 'REJECTED', check_items: [{ result: 'FAIL', observation: 'original' }] };
    result.rework.originalInspectionAfter = structuredClone(result.rework.originalInspectionBefore);
  }
  return result;
}
function fixture() {
  const browser = { status: 'passed', runID: 'a123456789bc', simulatedOnly: true, generatedAt: '2026-10-31T00:00:00.000Z', pageErrors: [], browserRPC: [],
    fixtureRPC: FULFILLMENT_CASES.map((_, i) => ({ method: 'get_shipment', requestID: `request-${i}`, code: 0 })),
    flows: FULFILLMENT_CASES.map((key, i) => flow(key, i * 1000)),
    definitionSnapshot: buildManualAcceptanceBusinessChainContract({ catalog: DEV_FLOW_STATE_CATALOG }).definitionSnapshot, steps: [] };
  for (const [chainKey, keys] of Object.entries(FULFILLMENT_STEPS)) for (const [i, f] of browser.flows.entries()) {
    if (chainKey === 'production_exception' && i === 0) continue;
    for (const key of keys) browser.steps.push({ key, chainKey, caseKey: f.key, passed: true, requestIDs: [`request-${i}`], readback: { salesOrderID: f.ids.salesOrderID } });
  }
  const requestJSON = browser.fixtureRPC.map(call => JSON.stringify({ msg: 'request completed', request_id: call.requestID, 'rpc.method': call.method,
    code: 0, rpc_result_code: call.code, outcome: 'success', 'trace.id': 'a'.repeat(32), 'span.id': 'b'.repeat(16) })).join('\n') + '\n';
  const events = names => [...names.flatMap(Test => ['run', 'pass'].map(Action => ({ Package: 'server/internal/data', Test, Action }))), { Package: 'server/internal/data', Action: 'pass' }].map(row => JSON.stringify(row)).join('\n') + '\n';
  const postgresJSON = events(['TestInventoryPostgres', 'TestQualityInspectionPostgres', 'TestOperationalFactRepoFinance']);
  const observabilityJSON = events(['TestRequestLogging', 'TestRequestIDFilter', 'TestSafeServerTracing', 'TestBusinessTrace', 'TestPostgresSQL', 'TestNormalizeRuntimeAuditEventCreate']);
  const browserJSON = JSON.stringify(browser);
  const lifecycle = { status: 'passed', scope: 'fulfillment-chains', finishedAt: '2026-10-31T00:05:00.000Z', cleanup: { passed: true },
    source: { commit: 'a'.repeat(40), dirty: true, fingerprint: 'b'.repeat(64) },
    postgres: verifyGoTestJson(postgresJSON), observability: verifyGoTestJson(observabilityJSON), requestLogs: verifyTransactionRequestLogs(browser, requestJSON),
    fulfillmentEvidence: { browserDigest: hash(browserJSON), postgresDigest: hash(postgresJSON), observabilityDigest: hash(observabilityJSON), requestDigest: hash(requestJSON) } };
  return { lifecycle, browser, browserJSON, postgresJSON, observabilityJSON, requestJSON };
}

function branchFlow(key) {
  const rows = {
    stock_reservation: { reservationID: 1, salesOrderID: 2, salesItemID: 3, reservationOrderID: 2, reservationLineID: 3, activeStatus: 'ACTIVE', finalStatus: 'RELEASED', reservedQuantity: 2, stockQuantity: 10, availableQuantity: 8, stockAfter: 10, transactionsBefore: 1, transactionsAfter: 1 },
    source_rejections: { sales: { id: 1, status: 'canceled', taskStatus: 'rejected', processResolution: 'rejected', noFacts: true }, purchase: { id: 2, status: 'canceled', taskStatus: 'rejected', processResolution: 'rejected', noFacts: true } },
    purchase_correction: { orderID: 1, receiptID: 2, receiptOrderID: 1, oldInspectionID: 3, newInspectionID: 4, orderStatus: 'approved', approvalTaskStatus: 'done', draftStatus: 'DRAFT', oldStatus: 'REJECTED', newStatus: 'PASSED', correctionOf: 3, originalDecisionRetained: true, oldSuperseded: true, stockBeforePost: 0, stockAfterPost: 10, transactionsAfterPost: 1, receiptStatus: 'POSTED' },
    outsourcing_return: { contractID: 1, issueID: 2, returnID: 3, qualityID: 4, payableID: 5, returnSourceID: 1, issueStatus: 'POSTED', returnStatus: 'POSTED', qualitySourceID: 3, qualityStatus: 'PASSED', beforeQuality: { quantity: 2, transactions: 1, lot: 'ACTIVE' }, waitingQuality: { quantity: 2, transactions: 1, lot: 'HOLD' }, afterQuality: { quantity: 2, transactions: 1, lot: 'ACTIVE' }, payableSourceID: 3, payableSourceType: 'OUTSOURCING_FACT', payableStatus: 'DRAFT', payableAmountCents: 200 },
    shipment_corrections: { rejectedShipmentID: 1, cancelledShipmentID: 2, rejectedStatus: 'DRAFT', releaseStatus: 'REJECTED', taskStatus: 'rejected', rejectedStock: 10, cancelledStatus: 'CANCELLED', shippedStock: 0, restoredStock: 10, transactions: 3, noFinanceFacts: true, replayExact: true },
    finance_adjustments: { advanceID: 1, refundID: 2, paymentID: 3, factID: 4, refundOf: 1, advanceStatus: 'POSTED', refundStatus: 'POSTED', advanceAvailableCents: 1500, advanceCreatesNoFact: true, refundCreatesNoFact: true, initialCents: 3500, afterPartialAllocationCents: 2000, afterUnallocateCents: 3500, afterReallocateCents: 2000, afterPaymentReversalCents: 3500, paymentStatus: 'REVERSED', netAllocatedCents: 0, afterPartialCreditCents: 3000, partialCreditFactStatus: 'POSTED', afterFullCreditCents: 0, fullCreditFactStatus: 'SETTLED', afterCreditReversalCents: 3000, reopenedFactStatus: 'POSTED', creditFactID: 4, fullCreditReversed: true },
    production_over_issue: { orderID: 1, requirementID: 2, decisionID: 3, extraIssueID: 4, decisionStatus: 'APPROVED', executionStatus: 'PENDING', planned: 2, baseIssued: 2, approvedQuota: 1, effectiveLimit: 3, approvalPostsNoFact: true, extraQuantity: 1, finalIssued: 3, remaining: 0, issueOrderID: 1, issueRequirementID: 2 },
    production_scrap: { orderID: 1, batchID: 2, inspectionID: 3, rejectedDecisionID: 4, cancelledDecisionID: 5, executedDecisionID: 6, rejectedStatus: 'REJECTED', cancelledStatus: 'CANCELLED', rejectedTaskStatus: 'rejected', executionStatus: 'APPLIED', batchStatus: 'CANCELLED', childCount: 0, finishedReceiptCount: 0, executionMovesNoInventory: true, originalInspectionRetained: true, inspectionBefore: { id: 3, result: 'REJECT' }, inspectionAfter: { id: 3, result: 'REJECT' } },
  };
  if (key === 'outsourcing_return') Object.assign(rows[key], { issueLineID: 10, issueContractLineID: 10, returnLineID: 11, returnContractLineID: 11, draftQualityStock: { quantity: 2, transactions: 1, lot: 'ACTIVE' } });
  if (key === 'finance_adjustments') Object.assign(rows[key], { originalCreditStatus: 'POSTED', creditReversalID: 12, fullCreditID: 11, creditReversalOf: 11 });
  return { key, passed: true, readback: structuredClone(rows[key]), browserReadback: [{ role: 'sales', sourceID: 1, screenshot: `branch-${key}.png` }] };
}
function fullFixture() {
  const x = fixture(); x.browser.includeBranches = true; x.browser.originalCasesUnchanged = true;
  x.browser.branchFlows = Object.keys(FULFILLMENT_BRANCH_CASES).map(branchFlow);
  for (const row of FULFILLMENT_REMAINING_STEPS) x.browser.steps.push({ ...row, passed: true, requestIDs: ['request-1'], readback: x.browser.branchFlows.find(flow => flow.key === row.caseKey).readback });
  x.browserJSON = JSON.stringify(x.browser); x.lifecycle.fulfillmentEvidence.browserDigest = hash(x.browserJSON); x.lifecycle.scope = 'fulfillment-branches';
  return x;
}

test('the 28 remaining handoffs exactly complete the same seven chain definitions', () => {
  const x = fullFixture();
  assert.doesNotThrow(() => assertFulfillmentChainEvidence(x.browser));
  const expected = x.browser.definitionSnapshot.chains.filter(row => Object.hasOwn(FULFILLMENT_STEPS, row.key))
    .flatMap(chain => chain.steps.filter(step => !FULFILLMENT_STEPS[chain.key].includes(step.key)).map(step => `${chain.key}/${step.key}`));
  assert.deepEqual(FULFILLMENT_REMAINING_STEPS.map(row => `${row.chainKey}/${row.key}`).sort(), expected.sort());
  const badPath = structuredClone(x.browser); badPath.branchFlows[0].browserReadback[0].screenshot = '../../private.png';
  assert.throws(() => assertFulfillmentChainEvidence(badPath));
  const report = buildFulfillmentChainReport(x);
  assert.equal(report.metrics.stepStates.passed, 68); assert.equal(report.metrics.stepStates.not_run, 0);
  assert.ok(report.chains.every(row => row.status === 'passed'));
  const text = fulfillmentBusinessReport({ ...x, report });
  assert.match(text, /部分核销/u); assert.doesNotMatch(text, /原未执行交接.*未执行，来源/u);
  for (const mutate of [
    b => { b.branchFlows.pop(); }, b => { b.steps.pop(); }, b => { b.originalCasesUnchanged = false; },
    b => { b.steps.at(-1).caseKey = 'order_to_settlement'; }, b => { b.steps.at(-1).requestIDs = ['unexecuted']; },
    b => { b.includeBranches = false; }, b => { b.steps.push({ ...b.steps.at(-1) }); },
  ]) { const b = structuredClone(x.browser); mutate(b); assert.throws(() => assertFulfillmentChainEvidence(b)); }
});

test('branch evidence rejects accounting drift, duplicated inbound, fabricated quota and lost rejection history', () => {
  for (const key of Object.keys(FULFILLMENT_BRANCH_CASES)) assert.doesNotThrow(() => assertFulfillmentBranchFlow(branchFlow(key)));
  for (const [key, mutate] of [
    ['stock_reservation', r => { r.reservationOrderID = 999; }], ['stock_reservation', r => { r.transactionsAfter += 1; }],
    ['source_rejections', r => { r.sales.noFacts = false; }], ['purchase_correction', r => { r.correctionOf = 999; }],
    ['purchase_correction', r => { r.originalDecisionRetained = false; }], ['outsourcing_return', r => { r.afterQuality.transactions = 2; }],
    ['outsourcing_return', r => { r.returnStatus = 'DRAFT'; }], ['outsourcing_return', r => { r.payableSourceID = 999; }],
    ['shipment_corrections', r => { r.restoredStock = 0; }], ['finance_adjustments', r => { r.refundOf = 999; }],
    ['finance_adjustments', r => { r.afterPartialAllocationCents = 0; }], ['finance_adjustments', r => { r.afterCreditReversalCents = 0; }],
    ['finance_adjustments', r => { r.netAllocatedCents = 1500; }], ['production_over_issue', r => { r.approvalPostsNoFact = false; }],
    ['finance_adjustments', r => { r.originalCreditStatus = 'REVERSED'; }], ['finance_adjustments', r => { r.creditReversalOf = 999; }],
    ['outsourcing_return', r => { r.returnLineID = r.issueLineID; }], ['outsourcing_return', r => { r.draftQualityStock.lot = 'HOLD'; }],
    ['production_over_issue', r => { r.extraQuantity = 0; }], ['production_scrap', r => { r.childCount = 1; }],
    ['production_scrap', r => { r.inspectionAfter.result = 'PASS'; }], ['production_scrap', r => { r.cancelledStatus = 'APPROVED'; }],
  ]) { const f = branchFlow(key); mutate(f.readback); assert.throws(() => assertFulfillmentBranchFlow(f)); }
});

test('ordinary outsourcing posts stock before quality; submitting freezes and passing only releases the existing lot', () => {
  const chain = fixture().browser.definitionSnapshot.chains.find(row => row.key === 'outsourcing_to_inventory');
  const returned = chain.steps.find(row => row.key === 'outsourcing_issue:returns:outsourcing_return');
  const draft = chain.steps.find(row => row.key === 'outsourcing_return:creates_fact_draft:outsourcing_quality');
  const quality = chain.steps.find(row => row.key === 'outsourcing_quality:posts_fact:outsourcing_lot');
  assert.ok(returned.resultStateRefs.some(row => row.machineKey === 'fact.outsourcing' && row.stateKey === 'POSTED'));
  assert.ok(draft.preconditionStateRefs.some(row => row.machineKey === 'fact.outsourcing' && row.stateKey === 'POSTED'));
  assert.ok(draft.resultStateRefs.some(row => row.machineKey === 'fact.quality_inspection' && row.stateKey === 'DRAFT'));
  assert.equal(draft.resultStateRefs.some(row => row.machineKey === 'fact.inventory_lot' && row.stateKey === 'HOLD'), false);
  assert.ok(quality.stateTransitionRefs.some(row => row.machineKey === 'fact.quality_inspection' && row.from === 'DRAFT' && row.to === 'SUBMITTED'));
  assert.ok(quality.stateTransitionRefs.some(row => row.machineKey === 'fact.inventory_lot' && row.from === 'HOLD' && row.to === 'ACTIVE'));
  assert.equal(quality.stateTransitionRefs.some(row => row.machineKey === 'fact.outsourcing'), false);
});

test('continuous cases reject partial delivery, unrelated sources, unsettled facts and lost rework history', () => {
  for (const key of FULFILLMENT_CASES) assert.doesNotThrow(() => assertFulfillmentCase(flow(key)));
  for (const mutate of [
    f => { f.readback.shippedQuantity = 1; }, f => { f.readback.completedQuantity = 1; },
    f => { f.readback.shipmentOrderID += 1; }, f => { f.readback.productionSalesItemID += 1; },
    f => { f.readback.purchaseMaterialRequestID += 1; }, f => { f.readback.shipmentLotID += 1; },
    f => { f.readback.materialBalance = 2; }, f => { f.finance[0].status = 'POSTED'; },
    f => { f.finance[1].sourceID += 1; }, f => { f.finance[2].allocatedCents = 100; },
    f => { f.finance[1].sourceType = 'SHIPMENT'; },
    f => { f.finance[1].outstandingCents = 1; }, f => { f.finance[2].allocationCount = 2; },
    f => { f.finance[0].paymentAvailableCents = 1; }, f => { f.finance[0].distinctApprover = false; },
    f => { f.guards.paymentReplayExact = false; }, f => { f.rework.childSourceID += 1; },
    f => { f.rework.childOrderID += 1; }, f => { f.rework.reinspectionID = f.ids.rejectedInspectionID; },
    f => { f.rework.reinspectionBatchID = f.ids.rejectedBatchID; }, f => { f.rework.originalInspectionStatus = 'PASSED'; },
    f => { f.rework.executionReplayExact = false; }, f => { f.rework.childQuantity = 1; },
    f => { f.rework.originalInspectionAfter.check_items[0].observation = 'overwritten'; },
  ]) { const f = flow('quality_rework_to_settlement'); mutate(f); assert.throws(() => assertFulfillmentCase(f)); }
});

test('registered handoffs are current, each case has its own sources and no missing evidence', () => {
  const { browser } = fixture();
  assert.doesNotThrow(() => assertFulfillmentChainEvidence(browser));
  for (const mutate of [b => { b.flows.pop(); }, b => { b.steps.pop(); }, b => { b.pageErrors.push({ message: 'error' }); },
    b => { b.steps[0].requestIDs = ['missing-request']; }, b => { b.flows[1].ids.salesOrderID = b.flows[0].ids.salesOrderID; },
    b => { b.definitionSnapshot.chains[0].steps.pop(); }]) {
    const candidate = structuredClone(browser); mutate(candidate); assert.throws(() => assertFulfillmentChainEvidence(candidate));
  }
});

test('only executed handoffs become passed; cleanup, bound artifacts and non-skipped gates are mandatory', () => {
  const input = fixture();
  const report = buildFulfillmentChainReport(input);
  assert.equal(report.chains.length, 7);
  assert.ok(report.metrics.stepStates.passed > 0 && report.metrics.stepStates.not_run > 0);
  assert.ok(report.chains.some(row => row.status === 'not_run'));
  assert.match(report.verdict, /2\/2/u);
  assert.match(fulfillmentBusinessReport({ ...input, report }), /不代表逐按钮/u);
  for (const mutate of [
    x => { x.lifecycle.cleanup.passed = false; }, x => { x.lifecycle.status = 'failed'; },
    x => { x.lifecycle.source.fingerprint = 'bad'; }, x => { x.browserJSON += ' '; },
    x => { x.requestJSON = x.requestJSON.replace('request-0', 'wrong-id'); },
    x => { x.postgresJSON = x.postgresJSON.replace('"pass"', '"skip"'); x.lifecycle.fulfillmentEvidence.postgresDigest = hash(x.postgresJSON); },
  ]) { const x = structuredClone(input); mutate(x); assert.throws(() => buildFulfillmentChainReport(x)); }
});

test('publisher fixes a readable existing-workbench batch and refuses overwrite', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plush-fulfillment-report-test-'));
  try {
    for (const build of [fixture, fullFixture]) {
      const x = build(), directory = path.join(root, 'output/qa', x.browser.includeBranches ? 'full' : 'main');
      await fs.mkdir(path.join(directory, 'browser/fulfillment-chains'), { recursive: true });
      await fs.writeFile(path.join(directory, 'lifecycle.json'), JSON.stringify(x.lifecycle));
      for (const [file, text] of [['postgres.jsonl', x.postgresJSON], ['observability.jsonl', x.observabilityJSON], ['requests.jsonl', x.requestJSON]]) await fs.writeFile(path.join(directory, file), text);
      await fs.writeFile(path.join(directory, 'browser/fulfillment-chains/report.json'), x.browserJSON);
      for (const f of [...x.browser.flows, ...(x.browser.branchFlows || [])]) for (const row of f.browserReadback) await fs.writeFile(path.join(directory, 'browser/fulfillment-chains', row.screenshot), 'synthetic-test-bytes');
      const published = await publishFulfillmentChainEvidence({ root, directory });
      const manifest = JSON.parse(await fs.readFile(path.join(published.directory, 'artifact-manifest.json')));
      for (const file of manifest.files) assert.equal(hash(await fs.readFile(path.join(published.directory, file.path))), file.sha256);
      const service = createDevBusinessChainAuditService({ projectRoot: root, readIdentity: async () => x.lifecycle.source });
      const loaded = await service.report(published.batch);
      assert.equal(loaded.report.chains.length, 7);
      for (const file of ['report.md', 'requests.log', 'postgres.log', 'observability.log']) assert.ok((await service.artifact(published.batch, file)).bytes.length > 0);
      await assert.rejects(publishFulfillmentChainEvidence({ root, directory }));
      const markdown = await fs.readFile(path.join(published.directory, 'report.md'), 'utf8');
      assert.ok(markdown.includes(loaded.report.verdict), 'downloaded Markdown must carry the published structured verdict');
      if (x.browser.includeBranches) for (const value of Object.values(FULFILLMENT_BRANCH_CASES)) assert.ok(markdown.includes(value.label));
      assert.deepEqual((await fs.readdir(path.dirname(published.directory))).filter(file => file.startsWith('.fulfillment-publishing-')), []);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('fulfillment scope uses bounded isolated lifecycle and exact fixed-decimal amounts', () => {
  assert.deepEqual(transactionBrowserBudget({ fulfillmentChainsOnly: true }), { browserTimeoutMS: 480000, runTimeoutMS: 900000 });
  assert.throws(() => transactionBrowserBudget({ fulfillmentChainsOnly: true, purchaseChainOnly: true }));
  assert.throws(() => transactionBrowserBudget({ fulfillmentChainsOnly: 'true' }));
  assert.deepEqual(transactionBrowserBudget({ fulfillmentBranchesOnly: true }), { browserTimeoutMS: 480000, runTimeoutMS: 900000 });
  assert.throws(() => transactionBrowserBudget({ fulfillmentBranchesOnly: true, fulfillmentChainsOnly: true }));
  assert.throws(() => transactionBrowserBudget({ fulfillmentBranchesOnly: 'true' }));
  for (const [value, expected] of [['7', 700], ['2.50', 250], ['0.000000', 0]]) assert.equal(exactMoneyCents(value), expected);
  for (const value of ['0.001', '-1', 'NaN', '1e2', '9999999999999999999']) assert.throws(() => exactMoneyCents(value));
});
