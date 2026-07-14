import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./operationalFactPageConfig.mjs', import.meta.url)),
  'utf8'
)

function financeColumnKeys(factType) {
  const match = source.match(
    new RegExp(`${factType}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`)
  )
  assert.ok(match, `missing finance column projection for ${factType}`)
  return Array.from(match[1].matchAll(/'([^']+)'/gu), (item) => item[1])
}

test('finance pages project only fields that belong to their fact type', () => {
  assert.deepEqual(financeColumnKeys('RECEIVABLE'), [
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
    'collection_type',
    'payment_term',
    'invoice_category',
  ])
  assert.deepEqual(financeColumnKeys('PAYABLE'), [
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
    'payment_term',
  ])
  assert.deepEqual(financeColumnKeys('INVOICE'), [
    'counterparty',
    'amount',
    'currency',
    'invoice_category',
  ])
  assert.deepEqual(financeColumnKeys('RECONCILIATION'), [
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
  ])
  assert.match(source, /RECEIVABLE: '客户'/u)
  assert.match(source, /PAYABLE: '供应商'/u)
  assert.match(source, /INVOICE: '客户'/u)
  assert.doesNotMatch(
    source,
    /dataIndex:\s*'(?:source_type|source_id|source_line_id|idempotency_key)'/u
  )
})

test('finance settlement actions match current business semantics', () => {
  const match = source.match(
    /const FINANCE_SETTLEMENT_ACTIONS = Object\.freeze\(\{([\s\S]*?)\n\}\)/u
  )
  assert.ok(match, 'missing finance settlement action map')
  const actionSource = match[1]

  assert.match(actionSource, /RECEIVABLE/u)
  assert.match(actionSource, /PAYABLE/u)
  assert.match(actionSource, /RECONCILIATION/u)
  assert.match(actionSource, /label: '完成核对'/u)
  assert.doesNotMatch(actionSource, /INVOICE|PAYMENT/u)
})

test('operational fact view config does not advertise a generic create form', () => {
  for (const deadConfig of [
    'createLabel',
    'createPrefix',
    'draftNumberField',
    'draftNumberPrefix',
    'hideCreateAction',
    'buildParams',
    'initialValues',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${deadConfig}\\b`))
  }
  assert.doesNotMatch(
    source,
    /create(?:Production|Outsourcing|StockReservation|Finance)Fact/u
  )
  assert.match(source, /postFinanceFact/u)
  assert.match(source, /businessSourceRouteFor/u)
  assert.match(source, /buildOperationalFactRelatedMenuItems/u)
})

test('outsourcing fact list, post and cancel use their exact permissions', () => {
  assert.match(
    source,
    /outsourcing:[\s\S]*readPermissions: ACTION_PERMISSIONS\.outsourcingRead[\s\S]*postPermissions: ACTION_PERMISSIONS\.outsourcingPost[\s\S]*cancelPermissions: ACTION_PERMISSIONS\.outsourcingCancel/u
  )
  assert.doesNotMatch(source, /ACTION_PERMISSIONS\.outsourcingWrite/u)
})
