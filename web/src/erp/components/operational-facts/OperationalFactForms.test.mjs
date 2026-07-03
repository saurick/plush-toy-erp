import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./OperationalFactForms.jsx', import.meta.url)),
  'utf8'
)

test('OperationalFactForms: finance fact params keep fee, term, invoice and readable labels', () => {
  for (const label of ['应收', '应付', '发票', '收付款', '对账']) {
    assert.match(source, new RegExp(label))
  }
  for (const value of [
    'RECEIVABLE',
    'PAYABLE',
    'INVOICE',
    'PAYMENT',
    'RECONCILIATION',
  ]) {
    assert.match(source, new RegExp(value))
  }
  for (const label of [
    '预收款',
    '应收款',
    '出货即收',
    '月结 30 天',
    '月结 45 天',
    '不开票',
    '出口普票',
    '1% 普票',
    '3% 专票',
    '13% 专票',
  ]) {
    assert.match(source, new RegExp(label))
  }
  assert.match(source, /fee_amount:\s*trimOptional\(values\.fee_amount\)/)
  assert.match(
    source,
    /collection_type:\s*trimOptional\(values\.collection_type\)/
  )
  assert.match(
    source,
    /payment_term_days:\s*nonNegativeInt\(values\.payment_term_days\)/
  )
  assert.match(
    source,
    /invoice_category:\s*trimOptional\(values\.invoice_category\)/
  )
  assert.match(source, /FINANCE_COLLECTION_TYPE_LABELS/u)
  assert.match(source, /FINANCE_PAYMENT_TERM_LABELS/u)
  assert.match(source, /FINANCE_INVOICE_CATEGORY_LABELS/u)
  assert.doesNotMatch(source, /STATUS_LABELS\[key\]\s*\|\|\s*key/u)
})
