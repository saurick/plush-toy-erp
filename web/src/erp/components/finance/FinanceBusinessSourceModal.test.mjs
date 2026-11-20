import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./FinanceBusinessSourceModal.jsx', import.meta.url),
  'utf8'
)

test('finance source summary never fabricates CNY when source currency is missing', () => {
  assert.match(source, /currency \|\| '币种未记录'/u)
  assert.doesNotMatch(source, /record\.currency \|\| 'CNY'/u)
})

test('finance source modal exposes only operator-owned business fields', () => {
  for (const fieldName of ['fact_no', 'occurred_at', 'note']) {
    assert.match(source, new RegExp(`name="${fieldName}"`, 'u'))
  }
  for (const forbiddenFieldName of [
    'source_type',
    'source_id',
    'counterparty_id',
    'amount',
    'currency',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${forbiddenFieldName}"`, 'u'))
  }
  assert.match(source, /来源、供应商、金额和币种由系统核算/u)
  assert.match(source, /不是多单据核销/u)
  assert.match(source, /label: '产品规格'/u)
  assert.match(source, /outsourcingFactProductSKUText\(record\)/u)
  assert.doesNotMatch(source, /productSKUOption/u)
  assert.doesNotMatch(source, /productSKUs/u)
})

test('finance source modal resets on open and after close', () => {
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange/u)
  assert.match(source, /preserve=\{false\}/u)
})

test('source changes expose occurrence only for reconciliation and clear retained payable dates', async (t) => {
  const { createElement } = await import('react')
  const { businessFormHarness } = await import('../../../../scripts/test/businessFormHarness.mjs')
  const ui = await businessFormHarness(t)
  const { default: Modal } = await import('./FinanceBusinessSourceModal.jsx')
  const dateLabels = () => [...document.querySelectorAll('label')]
    .filter((node) => node.textContent === '发生时间')
  const retainedDate = '2026-07-14T10:30'
  let submitted
  const render = (action, id) => ui.render(createElement(Modal, {
    action,
    open: true,
    source: { id, receipt_no: `PR-${id}`, fact_no: `FACT-${id}` },
    initialValues: { fact_no: `ENTRY-${id}`, occurred_at: retainedDate },
    onSubmit: (values) => { submitted = values },
  }))
  await render('single-fact-reconciliation', 1)
  assert.equal(dateLabels().length, 1)
  assert.equal(ui.field('发生时间').value, '2026/07/14 10:30')
  for (const [action, id] of [['purchase-receipt-payable', 2], ['outsourcing-return-payable', 3], ['outsourcing-order-payable', 4]]) {
    await render(action, id)
    assert.equal(dateLabels().length, 0)
    await ui.fill('业务编号', `AP-${id}`)
    await ui.click(ui.button('生成应付草稿'))
    assert.equal(submitted.fact_no, `AP-${id}`)
    assert.equal(submitted.occurred_at, undefined)
  }
})
