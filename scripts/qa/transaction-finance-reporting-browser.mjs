import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { login, navigate, selectOption, selectRow, pageAction, modal, clickRPC, closePage } from './transaction-browser-ui.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { expect } = require('playwright/test');

async function filters(page) {
  await page.locator('.erp-business-operation-panel').getByRole('button', { name: /^(filter )?筛选( · 已应用)?$/u }).click();
  const panel = page.getByRole('dialog', { name: '筛选条件', exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

// Extends the existing supplier-advance browser case; all writes remain in its
// owned disposable database and attachment store.
export async function financeReportingEvidenceFlow(browser, options, client, fixture, report) {
  const { page, context } = await login(browser, options, 'finance', report);
  try {
    await navigate(page, `${options.baseURL}/erp/finance/payments`);
    const filterPanel = await filters(page);
    await clickRPC(page, 'list_finance_payments', () => filterPanel.getByRole('group', { name: '收付款币种', exact: true }).getByRole('button', { name: '人民币（CNY）', exact: true }).click());
    const listed = await clickRPC(page, 'list_finance_payments', () => filterPanel.getByRole('group', { name: '款项用途筛选', exact: true }).getByRole('button', { name: '预收 / 预付', exact: true }).click());
    assert.ok(listed.payments.length >= 2);
    assert.ok(listed.payments.every(row => row.currency === 'CNY' && row.kind === 'ADVANCE'));
    assert.equal(listed.totals.reduce((sum, row) => sum + row.count, 0), listed.total);
    await filterPanel.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.getByLabel('收付款筛选汇总')).toContainText('含全部分页');

    const paymentID = report.flows.find(row => row.key === 'desktop_purchase_advance').paymentID;
    await selectRow(page, paymentID);
    await pageAction(page, '查看详情');
    const detail = await modal(page, '收付款详情');
    const evidence = detail.getByRole('region', { name: '收付款凭据', exact: true });
    await expect(evidence).toBeVisible();
    await evidence.locator('input[type="file"]').first().setInputFiles({
      name: '模拟财务回单.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vbIAAAAASUVORK5CYII=', 'base64'),
    });
    const uploaded = await clickRPC(page, 'upload_attachment', () => evidence.getByRole('button', { name: '上传 1 个文件', exact: true }).click());
    assert.equal(uploaded.attachment.owner_type, 'finance_payment');
    assert.equal(uploaded.attachment.owner_id, paymentID);
    await expect(evidence.getByText('模拟财务回单.png', { exact: true })).toBeVisible();
    await evidence.getByRole('button', { name: '撤销附件', exact: true }).click();
    const withdraw = await modal(page, '撤销附件');
    await withdraw.getByLabel('撤销原因', { exact: true }).fill('模拟验收：保留撤销审计');
    await clickRPC(page, 'withdraw_attachment', () => withdraw.getByRole('button', { name: '确认撤销', exact: true }).click());
    await expect(withdraw).toBeHidden();
    const stored = client.query(`SELECT json_build_object('owner',owner_type,'withdrawn',withdrawn_at IS NOT NULL,'reason',withdrawal_reason) FROM business_attachments WHERE id=${uploaded.attachment.id}`);
    assert.deepEqual(stored, { owner: 'finance_payment', withdrawn: true, reason: '模拟验收：保留撤销审计' });
    await detail.getByRole('button', { name: '关闭', exact: true }).last().click();

    await page.getByRole('tab', { name: '期间对账', exact: true }).click();
    const statementFilters = await filters(page);
    await statementFilters.getByRole('group', { name: '对账往来类型', exact: true }).getByRole('button', { name: '供应商', exact: true }).click();
    await selectOption(page, statementFilters.getByRole('combobox', { name: '对账往来方', exact: true }), new RegExp(fixture.supplier.name, 'u'));
    await statementFilters.getByRole('button', { name: '完成', exact: true }).click();
    const { statement } = await clickRPC(page, 'get_finance_statement', () => page.getByRole('button', { name: '查询对账', exact: true }).click());
    assert.equal(statement.counterparty_id, fixture.supplier.id);
    assert.equal(statement.currency, 'CNY');
    assert.equal(Number(statement.closing), 0, 'posted and reversed advances/refunds must net to zero');
    assert.ok(statement.total >= 4, 'reversed payments must remain visible in their historical period');
    assert.ok(statement.entries.every(row => /^\d{4}-\d{2}-\d{2}$/u.test(row.date)), 'dates must follow the China business calendar without raw timestamp syntax');
    await expect(page.getByText(`${fixture.supplier.name} · CNY · ${statement.date_from} 至 ${statement.date_to}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel('期间对账汇总')).toContainText('期末 0 CNY');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出对账单', exact: true }).click();
    const download = await downloadPromise;
    const csvPath = path.join(options.outputDir, 'finance-statement.csv');
    await download.saveAs(csvPath);
    const csv = await fs.readFile(csvPath, 'utf8');
    for (const label of ['期初余额', '本期增加', '本期减少', '期末余额']) assert.ok(csv.includes(label));
    await page.screenshot({ path: path.join(options.outputDir, 'finance-statement.png'), fullPage: true });

    const evidenceRef = `${fixture.prefix}-duplicate-evidence`;
    const draft = (await client.rpc('finance', 'operational_fact', 'create_finance_payment', {
      payment_no: `${fixture.prefix}-DUP-CHECK`, kind: 'SETTLEMENT', direction: 'DISBURSEMENT', counterparty_type: 'SUPPLIER', counterparty_id: fixture.supplier.id,
      currency: 'CNY', amount: '1', account_ref: '模拟凭据核对账户', evidence_ref: evidenceRef, occurred_at: new Date().toISOString(), idempotency_key: `${fixture.prefix}:dup-check`,
    })).payment;
    await page.getByRole('tab', { name: '收付款记录', exact: true }).click();
    await page.getByRole('button', { name: '登记收付款', exact: true }).click();
    const editor = page.getByRole('region', { name: '登记收付款', exact: true });
    await editor.getByLabel('收付款账户摘要', { exact: true }).fill('模拟凭据核对账户');
    await editor.getByLabel('业务凭据', { exact: true }).fill(evidenceRef);
    await expect(editor.getByRole('alert')).toContainText(draft.payment_no);
    await editor.getByLabel('业务凭据', { exact: true }).fill(`${evidenceRef}-different`);
    await expect(editor.getByText(/相同凭据已用于/u)).toHaveCount(0);
    report.flows.push({ key: 'desktop_finance_reporting_evidence', passed: true, paymentID, attachmentID: uploaded.attachment.id, statementEntries: statement.total, snapshotAt: statement.snapshot_at, duplicateWarning: true });
  } finally {
    await closePage(page, context);
  }
}
