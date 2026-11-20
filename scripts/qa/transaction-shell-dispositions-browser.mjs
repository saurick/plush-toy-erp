import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { login, navigate, businessURL, closePage, clickRPC, modal, pageAction, selectRow, selectOption, openDesktopTaskRow, settleRPCPage, dropRealResponse, faultEvidence } from './transaction-browser-ui.mjs';
import { BUSINESS_ROUTE_PATHS } from '../../web/src/erp/utils/masterDataOrderView.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { expect } = require('playwright/test');
const TYPES = Object.freeze([
  ['WIP_CONCESSION', '在制品让步'],
  ['SCRAP', '放弃本批（报废，不补做）'],
  ['REWORK_ORIGINAL', '原厂返工（使用原货）'],
  ['REWORK_SWITCH', '换厂返工（使用原货）'],
  ['REMAKE', '补料重做（重新发布料）'],
]);

async function verifyUnexplainedReadRecovery(browser, options, report, decision) {
  const negative = { browserRPC: [], pageErrors: [], flows: [] };
  const { page, context } = await login(browser, options, 'production', negative);
  const pattern = '**/rpc/operational_fact';
  let injected = false;
  const handler = async route => {
    if (!injected && route.request().postDataJSON()?.method === 'get_production_exception') {
      injected = true; await route.abort('aborted');
    } else await route.fallback();
  };
  try {
    await navigate(page, businessURL(options, 'production', `production/exceptions?production_exception_id=${decision.id}`));
    const detail = page.getByRole('dialog').filter({ has: page.getByText('生产异常详情', { exact: true }) });
    await expect(detail).toHaveCount(1);
    await detail.getByRole('button', { name: '返回列表', exact: true }).click();
    await expect(detail).toBeHidden();
    await settleRPCPage(page);
    const refresh = page.getByRole('button', { name: '刷新当前页', exact: true });
    await expect(refresh).toHaveCount(1);
    await page.route(pattern, handler);
    await refresh.click();
    await expect.poll(() => injected).toBe(true);
    await expect(page.locator('.ant-message-error')).toBeVisible();
    await settleRPCPage(page);
    assert.equal(negative.pageErrors.length, 1);
    assert.equal(negative.pageErrors[0].method, 'get_production_exception');
    assert.equal(negative.pageErrors[0].failure.errorText, 'net::ERR_ABORTED');
    assert.equal(negative.pageErrors[0].cancellationClassification, 'cancellation_without_lifecycle_evidence');
    await page.screenshot({ path: path.join(options.outputDir, 'shell-unexplained-read-error.png'), fullPage: true, animations: 'disabled' });
    await page.unroute(pattern, handler);
    await clickRPC(page, 'get_production_exception', () => refresh.click());
    await expect(page.locator(`tr[data-row-key="${decision.id}"]`)).toContainText(decision.decision_no);
    await settleRPCPage(page);
    assert.equal(negative.pageErrors.length, 1, 'the intentional negative must remain recorded after recovery');
    await page.screenshot({ path: path.join(options.outputDir, 'shell-unexplained-read-recovered.png'), fullPage: true, animations: 'disabled' });
  } finally { await closePage(page, context); }
  report.browserRPC.push(...negative.browserRPC);
  (report.expectedNegativeReads ??= []).push({ sourceID: decision.id, method: 'get_production_exception', expectedErrors: negative.pageErrors, networkPages: negative.networkPages, recovered: true });
}

export async function shellDispositionsThroughBrowser({ browser, options, client, report, open, readWip, batch, source, production, inventory }) {
  const list = await client.rpc('quality', 'quality', 'list_production_stage_quality_inspections', { production_wip_batch_id: batch.id, limit: 100 });
  assert.equal(list.quality_inspections.length, 1);
  let inspection = list.quality_inspections[0];
  assert.equal(inspection.gate_code, 'SHELL');
  let page = await open('quality', `${BUSINESS_ROUTE_PATHS.qualityInspections}?quality_inspection_id=${inspection.id}`);
  await selectRow(page, inspection.id);
  if (inspection.status === 'DRAFT') {
    await pageAction(page, '提交质检');
    await clickRPC(page, 'submit_quality_inspection', () => page.locator('.ant-popover:visible').getByRole('button', { name: '确认', exact: true }).click());
  }
  await pageAction(page, '判定不合格');
  const reject = await modal(page, '判定不合格');
  await selectOption(page, reject.getByLabel('检查结果', { exact: true }), '异常');
  await selectOption(page, reject.getByLabel('检查范围', { exact: true }), '全检');
  await reject.getByLabel('实际情况', { exact: true }).fill('模拟皮套颜色和尺寸不符');
  await expect(reject.getByLabel('判定结果', { exact: true })).toHaveCount(0);
  await reject.getByLabel('检验日期', { exact: true }).click();
  await page.locator(`.ant-picker-dropdown:visible td[title="${new Date().toISOString().slice(0, 10)}"]`).click();
  await reject.getByLabel('判定备注', { exact: true }).fill('模拟皮套颜色和尺寸不符，保留原检验证据');
  await reject.getByRole('radio', { name: '自定义', exact: true }).check();
  await reject.getByRole('spinbutton', { name: '自定义不良比例', exact: true }).fill('25');
  inspection = (await clickRPC(page, 'reject_quality_inspection', () => reject.getByRole('button', { name: '确认不合格', exact: true }).click())).quality_inspection;
  assert.equal(inspection.status, 'REJECTED');
  assert.equal(inspection.result, 'REJECT');
  assert.equal(Number(inspection.defect_rate_percent), 25);
  assert.ok(inspection.inspected_at > 0);
  const originalStock = inventory();
  assert.deepEqual(originalStock, { quantity: 0, net: 0, txns: 0 });
  const { supplier: alternate } = await client.rpc('admin', 'masterdata', 'create_supplier', {
    code: `${source.prefix}-ALT`, name: `${source.prefix} 模拟接手加工厂`, supplier_type: 'outsourcing',
    default_payment_term_days: 30, default_payment_method: 'BANK_TRANSFER',
  });
  assert.ok(alternate.is_active && alternate.id !== source.supplier.id);
  const results = [];
  const readDecision = async id => (await client.rpc('production', 'operational_fact', 'get_production_exception', { id })).production_exception;
  const completeTask = async (role, decision) => {
    const { tasks } = await client.rpc(role, 'workflow', 'list_tasks', { source_type: 'production_exception_decision', source_id: decision.id, limit: 100 });
    const matches = tasks.filter(t => t.owner_role_key === role && t.task_status_key === 'ready');
    assert.equal(matches.length, 1);
    const task = matches[0];
    const p = await open(role, '/erp/task-board');
    const search = p.getByPlaceholder('订单 / 产品 / 物料 / 款号', { exact: true });
    await search.fill(decision.decision_no); await search.press('Enter');
    await openDesktopTaskRow(p, task, decision.decision_no);
    const drawer = p.locator('.erp-task-action-drawer:visible');
    await drawer.getByRole('button', { name: '选择处理方式', exact: true }).click();
    await drawer.getByRole('radio').filter({ hasText: role === 'boss' ? '审批通过' : '处理完成' }).click();
    if (role === 'boss') {
      await expect(drawer.getByRole('button', { name: '核对并确认', exact: true })).toBeDisabled();
      await drawer.locator('textarea').fill('模拟核对皮套异常来源、整批数量及处理边界');
    } else await expect(drawer.locator('textarea')).toHaveCount(0);
    await drawer.getByRole('button', { name: '核对并确认', exact: true }).click();
    const button = drawer.locator('button:visible').filter({ hasText: role === 'boss' ? /^确认通过$/u : /^确认完成$/u });
    await expect(button).toHaveCount(1);
    await clickRPC(p, 'complete_task_action', () => button.click());
    assert.equal((await client.rpc(role, 'workflow', 'get_task', { task_id: task.id })).task.task_status_key, 'done');
  };
  for (const [type, label] of TYPES) {
    const before = await readWip();
    assert.equal(before.production_wip_batches.find(b => b.id === batch.id).status, 'REJECTED');
    page = await open('sales', `${BUSINESS_ROUTE_PATHS.qualityInspections}?quality_inspection_id=${inspection.id}`);
    await selectRow(page, inspection.id);
    await pageAction(page, '不合格处置');
    const form = await modal(page, '决定质量异常处理方案');
    const number = `${source.prefix}-${type}`;
    await form.getByLabel('异常单号', { exact: true }).fill(number);
    await selectOption(page, form.getByLabel('处理方案', { exact: true }), label);
    if (['REWORK_SWITCH', 'REMAKE'].includes(type)) await selectOption(page, form.getByLabel(type === 'REMAKE' ? '重新加工的厂商' : '接手返工的厂商', { exact: true }), new RegExp(alternate.name, 'u'));
    await form.getByLabel('申请原因', { exact: true }).fill('');
    const requestCount = report.browserRPC.filter(r => r.method === 'submit_production_exception').length;
    await form.getByRole('button', { name: '提交方案审批', exact: true }).click();
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(1);
    assert.equal(report.browserRPC.filter(r => r.method === 'submit_production_exception').length, requestCount);
    await form.getByLabel('申请原因', { exact: true }).fill('模拟皮套异常方案，禁止改变原检验或提前转序');
    let decision = (await clickRPC(page, 'submit_production_exception', () => form.getByRole('button', { name: '提交方案审批', exact: true }).click())).production_exception;
    assert.equal(decision.decision_type, type);
    assert.equal(decision.production_wip_batch_id, batch.id);
    assert.equal(decision.quality_inspection_id, inspection.id);
    await expect(form).toBeHidden();
    await settleRPCPage(page);
    const beforeDenied = await readDecision(decision.id);
    const denied = await client.raw('finance', 'operational_fact', 'reverse_production_exception', { id: decision.id, expected_version: decision.version, reason: '越权处置' });
    assert.equal(denied.code, 40304);
    assert.deepEqual(await readDecision(decision.id), beforeDenied);
    await completeTask('boss', decision);
    decision = await readDecision(decision.id);
    assert.equal(decision.status, 'APPROVED');
    assert.notEqual(decision.execution_status, 'APPLIED');
    assert.equal((await readWip()).production_wip_batches.find(b => b.id === batch.id).status, 'REJECTED');
    await completeTask('production', decision);
    assert.notEqual((await readDecision(decision.id)).execution_status, 'APPLIED');
    if (type === 'WIP_CONCESSION') await verifyUnexplainedReadRecovery(browser, options, report, decision);
    page = await open('production', `${BUSINESS_ROUTE_PATHS.productionExceptions}?production_exception_id=${decision.id}`);
    const detail = page.getByRole('dialog').filter({ has: page.getByText('生产异常详情', { exact: true }) });
    await expect(detail).toHaveCount(1);
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(decision.decision_no);
    const execute = detail.getByRole('button', { name: '确认执行', exact: true });
    await expect(execute).toHaveCount(1);
    await expect(execute).toBeEnabled();
    await execute.click();
    const confirmation = await modal(page, '确认生产异常处置');
    await confirmation.getByRole('textbox', { name: '执行原因', exact: true }).fill('模拟按已批准方案执行整批皮套处置');
    const lost = await dropRealResponse(page, options, 'customer_config', 'execute_production_exception_process');
    await confirmation.getByRole('button', { name: '确认办理', exact: true }).click();
    await expect(page.getByText('已重新读取生产异常处置结果', { exact: true })).toBeVisible();
    await lost.remove(); assert.equal(lost.state.backendCode, 0);
    decision = await readDecision(decision.id);
    assert.equal(decision.execution_status, 'APPLIED');
    let state = await readWip();
    assert.equal(state.production_wip_batches.find(b => b.id === batch.id).status, type === 'WIP_CONCESSION' ? 'ACCEPTED' : 'CANCELLED');
    const children = state.production_wip_batches.filter(b => b.origin_exception_decision_id === decision.id);
    assert.equal(children.length, ['REWORK_ORIGINAL', 'REWORK_SWITCH', 'REMAKE'].includes(type) ? 1 : 0);
    for (const child of children) {
      assert.equal(child.source_batch_id, batch.id);
      assert.equal(Number(child.quantity), source.quantity);
      assert.equal(decision.target_supplier_id, type === 'REWORK_ORIGINAL' ? source.supplier.id : alternate.id);
    }
    await client.rpc('production', 'customer_config', 'execute_production_exception_process', lost.state.params);
    assert.deepEqual(await readWip(), state);
    assert.deepEqual(inventory(), originalStock);
    await settleRPCPage(page);
    await page.screenshot({ path: path.join(options.outputDir, `shell-${type}-applied.png`), fullPage: true, animations: 'disabled' });
    await pageAction(page, '确认冲正');
    const reverse = await modal(page, '确认生产异常处置');
    await reverse.getByRole('textbox', { name: '冲正或撤销原因', exact: true }).fill('模拟撤回尚未继续生产的处置，恢复原不合格批次');
    const reversed = (await clickRPC(page, 'reverse_production_exception', () => reverse.getByRole('button', { name: '确认办理', exact: true }).click())).production_exception;
    assert.equal(reversed.execution_status, 'REVERSED');
    state = await readWip();
    assert.equal(state.production_wip_batches.find(b => b.id === batch.id).status, 'REJECTED');
    assert.ok(state.production_wip_batches.filter(b => b.origin_exception_decision_id === decision.id).every(b => b.status === 'CANCELLED'));
    const original = (await client.rpc('quality', 'quality', 'get_quality_inspection', { id: inspection.id })).quality_inspection;
    assert.equal(original.status, 'REJECTED'); assert.equal(original.result, 'REJECT');
    for (const field of ['id', 'inspection_type', 'production_wip_batch_id', 'gate_code', 'defect_rate_percent', 'inspected_at', 'inspected_by', 'decision_note']) assert.deepEqual(original[field], inspection[field], `exception must preserve original quality evidence: ${field}`);
    assert.deepEqual(inventory(), originalStock);
    results.push({ type, decisionID: decision.id, appliedAndReversed: true, originalInspectionPreserved: true, exactReplay: true, forbiddenUnchanged: true, reasonRequired: true, transportFault: faultEvidence(lost.state) });
    await page.screenshot({ path: path.join(options.outputDir, `shell-${type}-reversed.png`), fullPage: true, animations: 'disabled' });
  }
  report.flows.push({ key: 'desktop_shell_dispositions', passed: true, productionOrderID: production.id, batchID: batch.id, inspectionID: inspection.id, decisions: results, transportFaults: results.map(r => r.transportFault), stock: inventory() });
}
