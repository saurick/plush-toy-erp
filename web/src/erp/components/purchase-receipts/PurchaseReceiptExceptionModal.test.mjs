import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./PurchaseReceiptExceptionModal.jsx', import.meta.url),
  'utf8'
)

test('purchase exception create modal keeps source fields derived and operator fields explicit', () => {
  for (const label of [
    '退货时间',
    '调整时间',
    '调整原因',
    '来源明细',
    '退货数量',
    '调整数量',
    '整单备注',
  ]) {
    assert.match(source, new RegExp(label, 'u'))
  }
  for (const forbiddenLabel of [
    'purchase_receipt_id',
    'material_id',
    'unit_id',
    'idempotency_key',
    'correction_group',
  ]) {
    assert.equal(source.includes(`label="${forbiddenLabel}"`), false)
  }
})

test('purchase exception create modal freezes editing and closing while its request is pending', () => {
  assert.match(source, /confirmLoading=\{loading\}/u)
  assert.match(source, /disabled=\{loading\}/u)
  assert.match(source, /closable=\{!loading\}/u)
  assert.match(source, /keyboard=\{!loading\}/u)
  assert.match(source, /maskClosable=\{!loading\}/u)
  assert.match(source, /if \(!loading\) onCancel\?\.\(\)/u)
})

test('purchase exception quantity uses the exact numeric(20,6) contract', () => {
  assert.match(source, /numeric20Scale6Units\(value\)/u)
  assert.match(source, /isPositiveNumeric20Scale6Units/u)
  assert.doesNotMatch(source, /Number\(value\) > 0/u)
})
