import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./OperationalFactForms.jsx', import.meta.url)),
  'utf8'
)

test('OperationalFactForms keeps read-model labels without a generic create payload builder', () => {
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
  assert.match(source, /FINANCE_COLLECTION_TYPE_LABELS/u)
  assert.match(source, /FINANCE_PAYMENT_TERM_LABELS/u)
  assert.match(source, /FINANCE_INVOICE_CATEGORY_LABELS/u)
  assert.doesNotMatch(source, /STATUS_LABELS\[key\]\s*\|\|\s*key/u)

  for (const deadHelper of [
    'idempotencyKey',
    'buildFactParams',
    'buildReservationParams',
    'buildFinanceParams',
    'businessModalTitle',
  ]) {
    assert.doesNotMatch(source, new RegExp(`(?:function|const) ${deadHelper}`))
  }
  assert.doesNotMatch(source, /idempotency_key/u)
  assert.doesNotMatch(source, /compactParams|trimOptional/u)
})

test('OperationalFactForms preserves existing business source navigation', () => {
  assert.match(source, /businessSourceNavigation\.mjs/u)
  assert.match(source, /businessSourceRouteFor/u)
  assert.match(source, /sourceRouteFor/u)
  assert.doesNotMatch(source, /return\s+record\.(?:source_id|counterparty_id)/u)
})

test('OperationalFactForms keeps outsourcing fact permissions exact', () => {
  for (const permission of [
    'outsourcing.fact.read',
    'outsourcing.fact.post',
    'outsourcing.fact.cancel',
  ]) {
    assert.match(source, new RegExp(`'${permission.replace('.', '\\.')}'`, 'u'))
  }
  assert.doesNotMatch(
    source,
    /outsourcingWrite:\s*\['purchase\.order\.update',\s*'warehouse\.adjustment\.create'\]/u
  )
})
