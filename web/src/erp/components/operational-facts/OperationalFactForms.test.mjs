import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./OperationalFactForms.jsx', import.meta.url)),
  'utf8'
)

test('OperationalFactForms: finance currency is limited to USD CNY HKD and fee is submitted', () => {
  for (const label of ['美金 USD', '人民币 CNY', '港币 HKD']) {
    assert.match(source, new RegExp(label))
  }
  for (const label of [
    '应收 RECEIVABLE',
    '应付 PAYABLE',
    '发票 INVOICE',
    '收付款 PAYMENT',
    '对账 RECONCILIATION',
  ]) {
    assert.match(source, new RegExp(label))
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
  assert.match(source, /name="fee_amount"/)
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
  assert.match(source, /function CurrencyAmountInput/)
  assert.match(source, /suffix=\{/)
  assert.doesNotMatch(source, /addonAfter=/)
})
