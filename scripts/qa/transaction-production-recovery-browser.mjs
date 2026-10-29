#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { RpcErrorCode as CODE } from '../../web/src/common/consts/errorCodes.generated.js';
import { BUSINESS_ROUTE_PATHS as ROUTES } from '../../web/src/erp/utils/masterDataOrderView.mjs';
import { PRODUCTION_WIP_ROUTE_CODE } from '../../web/src/erp/utils/productionWipModel.mjs';
import { createTransactionClient, prepareTransactionFixture, prepareTransactionProductionSource } from './transaction-real-backend-fixture.mjs';
import { qualityFlow } from './transaction-real-backend-browser.mjs';
import { productionShipmentFlow, searchReference } from './transaction-production-shipment-browser.mjs';
import { login, navigate, selectRow, pageAction, modal, selectOption, clickRPC, closePage, captureFailure, settleRPCPage } from './transaction-browser-ui.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('playwright');
const { expect } = require('playwright/test');
const QUOTA_MESSAGE = '普通领料与委外发料合计超过可领数量，请核对已发数量或先办理超领审批';

function draftParams(source, suffix, quantity) {
  return {
    order_no: `${source.prefix}-${suffix}`,
    items: [{ line_no: 1, product_id: source.salesItem.product_id,
      product_sku_id: source.salesItem.product_sku_id, unit_id: source.salesItem.unit_id,
      sales_order_item_id: source.salesItem.id, bom_header_id: source.bom.id,
      planned_quantity: String(quantity), route_code: PRODUCTION_WIP_ROUTE_CODE }],
    idempotency_key: `${source.prefix}:${suffix}`,
  };
}

async function createReleasedOrder(client, source) {
  const created = await client.rpc('pmc', 'production_order', 'create_production_order', draftParams(source, 'MO', 2));
  return client.rpc('pmc', 'production_order', 'release_production_order', {
    production_order_id: created.production_order.id,
    expected_version: created.production_order.version, idempotency_key: `${source.prefix}:release`,
  });
}

async function materialRequirement(client, orderID) {
  const data = await client.rpc('warehouse', 'operational_fact', 'list_production_order_material_requirements', { production_order_id: orderID });
  assert.equal(data.material_requirements.length, 1);
  return data.material_requirements[0];
}

async function openOrder(page, options, order) {
  await navigate(page, `${options.baseURL}${ROUTES.productionOrders}?production_order_id=${order.id}`);
  await selectRow(page, order.id);
}

async function createOrdinaryIssue(page, options, source, order, lotNo) {
  await openOrder(page, options, order);
  await pageAction(page, /^查看$/u);
  const view = page.getByRole('region', { name: '查看生产订单', exact: true });
  await expect(view).toBeVisible();
  await view.getByRole('button', { name: /^领\s*料$/u }).click();
  const form = await modal(page, '生产领料');
  await selectOption(page, form.getByLabel('领料仓库', { exact: true }), new RegExp(source.warehouse.name, 'u'));
  await selectOption(page, form.getByLabel('材料批次', { exact: true }), new RegExp(lotNo, 'u'));
  await form.getByLabel('本次领料数量', { exact: true }).fill('2');
  const data = await clickRPC(page, 'create_production_material_issue_from_order', () => form.getByRole('button', { name: '生成领料记录', exact: true }).click());
  await expect(form).toBeHidden();
  assert.equal(data.production_fact.status, 'DRAFT');
  return data.production_fact;
}

async function createOutsourcingIssue(page, options, source, lotNo) {
  await navigate(page, `${options.baseURL}${ROUTES.processingContracts}`);
  await selectRow(page, source.contract.id);
  await pageAction(page, '查看详情');
  const detail = page.locator('.ant-modal:visible').filter({ hasText: source.contract.outsourcing_order_no });
  await detail.getByRole('button', { name: '委外发料', exact: true }).click();
  const form = await modal(page, '委外发料');
  await selectOption(page, form.getByLabel('仓库', { exact: true }), new RegExp(source.warehouse.name, 'u'));
  await selectOption(page, form.getByLabel('材料批次', { exact: true }), new RegExp(lotNo, 'u'));
  await form.getByLabel('本次办理数量', { exact: true }).fill('2');
  const data = await clickRPC(page, 'create_outsourcing_material_issue_from_order', () => form.getByRole('button', { name: '确认委外发料', exact: true }).click());
  await expect(form).toBeHidden();
  assert.equal(data.outsourcing_fact.status, 'DRAFT');
  return data.outsourcing_fact;
}

async function postIssue(page, options, source, kind, fact, code = 0) {
  if (kind === 'outsourcing') {
    await navigate(page, `${options.baseURL}${ROUTES.processingContracts}`);
    await selectRow(page, source.contract.id);
    await pageAction(page, '委外记录');
    const records = await modal(page, `委外记录 · ${source.contract.outsourcing_order_no}`);
    await records.locator(`tr[data-row-key="${fact.id}"]`).getByRole('radio').check();
    return clickRPC(page, 'post_outsourcing_fact', () => records.getByRole('button', { name: '过账', exact: true }).click(), code);
  }
  await navigate(page, `${options.baseURL}${ROUTES.productionProgress}`);
  await selectRow(page, fact.id);
  await pageAction(page, /^过账$/u);
  const popup = page.locator('.ant-popover:visible');
  return clickRPC(page, 'post_production_fact', () => popup.getByRole('button', { name: '确认', exact: true }).click(), code);
}

async function crossChainFlow(browser, options, client, fixture, report, firstKind) {
  const key = `cross_chain_${firstKind}_first`;
  const source = await prepareTransactionProductionSource(client, options, { ...fixture, prefix: `${fixture.prefix}-${firstKind}` });
  const aggregate = await createReleasedOrder(client, source);
  const order = aggregate.production_order;
  const requirement = await materialRequirement(client, order.id);
  const state = await client.rpc('production', 'production_wip', 'get_production_wip', { production_order_id: order.id });
  assert.equal(state.production_wip_batches.length, 1);
  const batch = state.production_wip_batches[0];
  await client.rpc('production', 'production_wip', 'execute_production_wip_action', {
    action: 'ASSIGN_EXECUTION', production_order_id: order.id, production_wip_batch_id: batch.id,
    expected_version: batch.version, execution_mode: 'OUTSOURCED', idempotency_key: `${source.prefix}:bind`,
    outsourcing_allocations: [{ outsourcing_order_item_id: source.contractItem.id, production_order_material_requirement_id: requirement.id }],
  });
  const lotID = fixture.receipt.items[0].lot_id;
  const lotNo = client.query(`SELECT to_json(lot_no) FROM inventory_lots WHERE id=${lotID}`);
  const balance = () => client.query(`SELECT to_json(COALESCE(sum(quantity),0)) FROM inventory_balances WHERE lot_id=${lotID}`);
  const before = balance();
  const session = await login(browser, options, 'warehouse', report);
  const { page } = session;
  try {
    const facts = {
      production: await createOrdinaryIssue(page, options, source, order, lotNo),
      outsourcing: await createOutsourcingIssue(page, options, source, lotNo),
    };
    assert.equal(balance(), before, 'drafts must not consume inventory');
    const secondKind = firstKind === 'production' ? 'outsourcing' : 'production';
    const first = (await postIssue(page, options, source, firstKind, facts[firstKind]))[`${firstKind}_fact`];
    assert.equal(first.status, 'POSTED');
    assert.equal(balance(), before - 2);
    const beforeRejected = await materialRequirement(client, order.id);
    assert.equal(Number(beforeRejected.issued_quantity), 2);
    assert.equal(Number(beforeRejected.remaining_quantity), 0);
    await postIssue(page, options, source, secondKind, facts[secondKind], CODE.BUSINESS_RULE_VIOLATION);
    await expect(page.getByText(QUOTA_MESSAGE, { exact: true })).toBeVisible();
    const screenshot = path.join(options.outputDir, `${key}-blocked.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    assert.equal(balance(), before - 2, 'rejected cross-chain post must not write inventory');
    assert.deepEqual(await materialRequirement(client, order.id), beforeRejected);
    const rejectedRows = await client.rpc('warehouse', 'operational_fact', `list_${secondKind}_facts`, {
      source_type: secondKind === 'production' ? 'PRODUCTION_ORDER' : 'OUTSOURCING_ORDER',
      source_id: secondKind === 'production' ? order.id : source.contract.id, limit: 100,
    });
    const rejected = rejectedRows[`${secondKind}_facts`].find(row => row.id === facts[secondKind].id);
    assert.ok(rejected);
    assert.equal(rejected.status, 'DRAFT');
    assert.equal(rejected.version, facts[secondKind].version);
    const reversed = (await client.rpc('warehouse', 'operational_fact', `cancel_${firstKind}_fact`, {
      customer_key: 'yoyoosun', id: first.id, expected_version: first.version, reason: '模拟验收冲正，复核跨链可领额度恢复',
    }))[`${firstKind}_fact`];
    assert.equal(reversed.status, 'CANCELLED');
    assert.equal(balance(), before);
    const retried = (await postIssue(page, options, source, secondKind, facts[secondKind]))[`${secondKind}_fact`];
    assert.equal(retried.status, 'POSTED');
    assert.equal(balance(), before - 2);
    const after = await materialRequirement(client, order.id);
    assert.equal(Number(after.issued_quantity), 2);
    assert.equal(Number(after.remaining_quantity), 0);
    await openOrder(page, options, order);
    await pageAction(page, /^查看$/u);
    const view = page.getByRole('region', { name: '查看生产订单', exact: true });
    await expect(view.getByRole('button', { name: /^领\s*料$/u })).toHaveCount(0);
    await expect(view.getByText('已领完', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(options.outputDir, `${key}-recovered.png`), fullPage: false });
    report.flows.push({ key, passed: true, role: 'warehouse', productionOrderID: order.id, requirementID: requirement.id,
      firstKind, rejectedKind: secondKind, facts: { firstID: first.id, secondID: retried.id },
      issued: 2, remaining: 0, rejectedWithoutWrites: true, reversalViaAPI: true, browserRetryPassed: true, screenshot });
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  } finally { await closePage(page, session.context); }
}

async function planningOption(client, source) {
  const data = await client.rpc('pmc', 'production_order', 'list_production_order_reference_options', {
    reference_type: 'sales_order_item', selected_ids: [source.salesItem.id], limit: 20,
  });
  assert.equal(data.options.length, 1);
  return data.options[0];
}

async function completeScheduling(client, order, prefix) {
  const { tasks } = await client.rpc('pmc', 'workflow', 'list_tasks', { source_type: 'production-orders', source_id: order.id, limit: 100 });
  const task = tasks.find(row => row.task_group === 'production_scheduling');
  assert.ok(task, 'released production order must have its scheduling task');
  if (task.task_status_key !== 'done') await client.rpc('pmc', 'workflow', 'complete_task_action', {
    task_id: task.id, expected_version: task.version, action_key: 'complete', idempotency_key: `${prefix}:scheduled`,
    payload: { feedback: '模拟生产安排已核对，剩余需求转新单补排' },
  });
  const { task: completed } = await client.rpc('pmc', 'workflow', 'get_task', { task_id: task.id });
  assert.equal(completed.task_status_key, 'done');
}

async function shortCloseFlow(browser, options, client, report, source, order, completed, transportFault) {
  const key = completed ? 'short_close_partial' : 'short_close_zero';
  // Reserve the other eight units so this order's short close is the sole
  // source of new capacity in the ten-unit sales demand.
  await client.rpc('pmc', 'production_order', 'create_production_order', draftParams(source, 'RESERVED', 8));
  await completeScheduling(client, order, source.prefix);
  const before = await planningOption(client, source);
  assert.equal(Number(before.planned_production_quantity), 10);
  assert.equal(Number(before.remaining_plannable_quantity), 0);
  const session = await login(browser, options, 'pmc', report);
  const { page } = session;
  const remaining = 2 - completed;
  try {
    await openOrder(page, options, order);
    await pageAction(page, /^关闭$/u);
    const close = await modal(page, '关闭生产订单');
    await close.getByLabel('短关闭原因（未完成时必填）', { exact: true }).fill('模拟验收：未完数量转新生产单补排');
    const closed = await clickRPC(page, 'close_production_order', () => close.getByRole('button', { name: '确认关闭', exact: true }).click());
    assert.equal(closed.production_order.status, 'CLOSED');
    await expect(close).toBeHidden();
    const available = await planningOption(client, source);
    assert.equal(Number(available.planned_production_quantity), 8 + completed);
    assert.equal(Number(available.remaining_plannable_quantity), remaining);
    await pageAction(page, /^新建生产订单$/u);
    const form = page.getByRole('region', { name: '新建生产订单', exact: true });
    await expect(form).toBeVisible();
    const submitPlan = async () => {
      const submit = form.getByRole('button', { name: /创建草稿$/u });
      await expect(submit).toHaveCount(1);
      await expect(submit).toBeEnabled();
      await expect(submit).not.toHaveClass(/ant-btn-loading/u);
      await submit.click({ timeout: 10000 });
      await settleRPCPage(page);
      (report.planSubmitAttempts ??= []).push({
        key,
        notices: await page.locator('.ant-message-notice-content').allTextContents(),
        validationErrors: await form.locator('.ant-form-item-explain-error').allTextContents(),
      });
    };
    await form.getByLabel('生产单号', { exact: true }).fill(`${source.prefix}-SUPPLEMENT`);
    await searchReference(page, form.getByLabel('销售订单行（可选）', { exact: true }), source.salesOrder.order_no, 'sales_order_item');
    await searchReference(page, form.getByLabel('BOM 版本（可选）', { exact: true }), source.bom.version, 'active_bom');
    await form.getByLabel('计划数量', { exact: true }).fill(String(remaining + 1));
    await settleRPCPage(page);
    await expect(form.locator('.ant-form-item-is-validating')).toHaveCount(0);
    await expect(form.locator('.ant-form-item-explain-error')).toHaveCount(0);
    await clickRPC(page, 'create_production_order', submitPlan, CODE.BUSINESS_RULE_VIOLATION);
    await expect(page.getByText(/累计生产计划数量超过生产需求数量/u)).toBeVisible();
    await expect(form).toBeVisible();
    await page.screenshot({ path: path.join(options.outputDir, `${key}-excess-blocked.png`), fullPage: false });
    assert.equal(client.query(`SELECT to_json(count(*)) FROM production_orders WHERE order_no='${source.prefix}-SUPPLEMENT'`), 0);
    assert.equal(Number((await planningOption(client, source)).remaining_plannable_quantity), remaining);
    await form.getByLabel('计划数量', { exact: true }).fill(String(remaining));
    await settleRPCPage(page);
    const created = await clickRPC(page, 'create_production_order', submitPlan);
    await expect(form).toBeHidden();
    assert.equal(created.production_order.status, 'DRAFT');
    assert.equal(Number(created.production_order_items[0].planned_quantity), remaining);
    assert.equal(created.production_order_items[0].sales_order_item_id, source.salesItem.id);
    assert.equal(Number((await planningOption(client, source)).remaining_plannable_quantity), 0);
    await openOrder(page, options, created.production_order);
    await pageAction(page, /^发布$/u);
    const release = await modal(page, '确认发布生产订单？');
    const released = await clickRPC(page, 'release_production_order', () => release.getByRole('button', { name: '确认发布', exact: true }).click());
    assert.equal(released.production_order.status, 'RELEASED');
    await expect(release).toBeHidden();
    assert.equal(Number((await planningOption(client, source)).remaining_plannable_quantity), 0);
    const wip = await client.rpc('production', 'production_wip', 'get_production_wip', { production_order_id: released.production_order.id });
    assert.equal(wip.production_wip_batches.length, 1);
    assert.equal(Number(wip.production_wip_batches[0].quantity), remaining);
    await pageAction(page, /^查看$/u);
    const screenshot = path.join(options.outputDir, `${key}-supplement.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    report.flows.push({ key, passed: true, role: 'pmc', productionOrderID: order.id,
      salesItemID: source.salesItem.id, completed, releasedForReplanning: remaining,
      supplementID: created.production_order.id, supplementStatus: released.production_order.status,
      excessRejectedWithoutWrites: true,
      sourceAndQuantityReadback: true, screenshot, ...(transportFault ? { transportFault } : {}) });
  } catch (error) {
    await captureFailure(page, options, report, error);
    throw error;
  } finally { await closePage(page, session.context); }
}

export async function runProductionRecoveryBrowser(input) {
  const options = { ...input, mobile: false, fourK: true, outputDir: path.join(input.outputDir, 'production-recovery') };
  await fs.mkdir(options.outputDir, { recursive: true, mode: 0o700 });
  const client = createTransactionClient(options);
  const report = { status: 'running', simulatedOnly: true, scope: 'production-material-replan', flows: [], browserRPC: [], pageErrors: [] };
  let browser;
  try {
    report.identity = await client.verify();
    const fixture = await prepareTransactionFixture(client, options);
    report.frontendIdentity = await client.verifyFrontend();
    browser = await chromium.launch({ headless: true });
    await qualityFlow(browser, options, client, fixture, report);
    const inbound = await client.rpc('warehouse', 'purchase', 'post_purchase_receipt', { id: fixture.receipt.id });
    assert.equal(inbound.purchase_receipt.status, 'POSTED');
    await crossChainFlow(browser, options, client, fixture, report, 'production');
    await crossChainFlow(browser, options, client, fixture, report, 'outsourcing');
    const zero = await prepareTransactionProductionSource(client, options, { ...fixture, prefix: `${fixture.prefix}-ZERO` });
    const zeroOrder = (await createReleasedOrder(client, zero)).production_order;
    const zeroWip = await client.rpc('production', 'production_wip', 'get_production_wip', { production_order_id: zeroOrder.id });
    const batch = zeroWip.production_wip_batches[0];
    await client.rpc('production', 'production_wip', 'execute_production_wip_action', {
      action: 'CANCEL_BATCH', production_order_id: zeroOrder.id, production_wip_batch_id: batch.id,
      expected_version: batch.version, idempotency_key: `${zero.prefix}:cancel`, reason: '模拟验收：未开工批次停止，转新单补排',
    });
    await shortCloseFlow(browser, options, client, report, zero, zeroOrder, 0);
    await productionShipmentFlow(browser, options, client, fixture, report, {
      key: 'PARTIAL', inboundQuantity: 1,
      afterInbound: async ({ source, production, receipt, readWip, batchFor, passStage, transportFault }) => {
        const handwork = batchFor(await readWip(), 'HANDWORK').batch;
        for (let i = 0; i < 3; i++) await passStage(handwork.id);
        assert.equal(batchFor(await readWip(), 'HANDWORK').batch.status, 'ACCEPTED');
        assert.equal(Number(receipt.quantity), 1);
        await shortCloseFlow(browser, options, client, report, source, production, 1, transportFault);
      },
    });
    assert.deepEqual(report.flows.map(row => row.key), ['quality', 'cross_chain_production_first', 'cross_chain_outsourcing_first', 'short_close_zero', 'short_close_partial']);
    assert.ok(report.flows.every(row => row.passed));
    assert.deepEqual(report.pageErrors, []);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = error.stack;
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(options.outputDir, 'failure.png'), fullPage: false }).catch(() => {});
      report.visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 16000);
    }
  } finally {
    await browser?.close(); report.fixtureRPC = client.calls;
    await fs.writeFile(path.join(options.outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && pathToFileURL(await fs.realpath(process.argv[1])).href === import.meta.url) {
  assert.deepEqual(process.argv.slice(2, 3), ['--environment']);
  assert.equal(process.argv.length, 4);
  const report = await runProductionRecoveryBrowser(JSON.parse(await fs.readFile(process.argv[3], 'utf8')));
  process.stdout.write(`production material/replan browser: ${report.status}, ${report.flows.length} flows\n`);
  if (report.status !== 'passed') process.exitCode = 1;
}
