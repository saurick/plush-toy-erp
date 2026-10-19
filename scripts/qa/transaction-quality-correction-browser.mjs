import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { clickRPC, dropRealResponse, faultEvidence, modal, pageAction } from './transaction-browser-ui.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { expect } = require('playwright/test');

export async function correctQualityThroughBrowser(page, options, report, { request, readState, key }) {
  const method = 'correct_quality_inspection_result';
  await pageAction(page, '发起纠正复检');
  const dialog = await modal(page, '发起纠正复检');
  const before = readState();
  const writes = () => report.browserRPC.filter((call) => call.method === method).length;
  const count = writes();
  await dialog.getByRole('button', { name: '发起复检', exact: true }).click();
  await expect(dialog.getByText('请填写纠正原因', { exact: true })).toBeVisible();
  assert.equal(writes(), count);
  assert.deepEqual(readState(), before, 'missing correction reason must not change business evidence');
  const number = dialog.getByLabel('复检单号', { exact: true });
  const reason = dialog.getByLabel('纠正原因', { exact: true });
  await expect(reason).toHaveAttribute('maxlength', '255');
  await number.fill(request.correction_inspection_no);
  await reason.fill(request.reason);
  const fault = await dropRealResponse(page, options, 'quality', method);
  await dialog.getByRole('button', { name: '发起复检', exact: true }).click();
  await expect.poll(() => Boolean(fault.state.captured)).toBe(true);
  await fault.remove();
  assert.equal(fault.state.backendCode, 0);
  for (const field of ['id', 'correction_inspection_no', 'reason']) assert.equal(fault.state.params[field], request[field]);
  assert.deepEqual(Object.keys(fault.state.params).sort(), [...Object.keys(request), ...(fault.state.params.customer_key ? ['customer_key'] : [])].sort());
  await expect(dialog.getByText('结果暂时无法确认，已保留原内容；请重试确认，避免重复发起。', { exact: true })).toBeVisible();
  await expect(number).toHaveValue(request.correction_inspection_no);
  await expect(reason).toHaveValue(request.reason);
  await expect(number).toBeDisabled();
  await expect(reason).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '返回办理', exact: true })).toBeDisabled();
  const committed = readState();
  if (options.mobile) {
    await page.goBack();
    await expect(page.getByText('请先确认本次复检结果，再离开办理。', { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(number).toHaveValue(request.correction_inspection_no);
    await expect(reason).toHaveValue(request.reason);
    assert.deepEqual(readState(), committed, 'back navigation cannot discard an unresolved correction or write another fact');
  }
  await page.screenshot({ path: path.join(options.outputDir, `${key}-correction-recovery.png`), fullPage: false });
  const { quality_inspection: inspection } = await clickRPC(page, method, () => dialog.getByRole('button', { name: '确认原复检结果', exact: true }).click());
  await expect(dialog).toBeHidden();
  assert.equal(inspection.correction_of_inspection_id, request.id);
  assert.equal(inspection.inspection_no, request.correction_inspection_no);
  assert.deepEqual(readState(), committed, 'correction recovery must reuse the committed inspection without touching evidence');
  if (options.mobile) {
    const form = page.getByTestId('mobile-task-fact-form');
    await expect(form).toHaveAttribute('data-source-type', 'quality_inspection');
    await expect(form).toHaveAttribute('data-source-id', String(inspection.id));
    assert.match(new URL(page.url()).pathname, /^\/m\/[a-z_]+\/tasks$/u);
  } else await page.waitForURL((url) => url.searchParams.get('quality_inspection_id') === String(inspection.id));
  return { inspection, transportFault: faultEvidence(fault.state), reasonRequired: true, replayExact: true };
}
