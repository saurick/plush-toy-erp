import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ShipmentsPage.jsx', import.meta.url),
  'utf8'
)

test('shipped shipment finance actions require their exact confirm projections', () => {
  assert.match(
    source,
    /canConfirmFinanceFact\(\s*adminProfile,\s*'RECEIVABLE'\s*\)/u
  )
  assert.match(source, /canConfirmFinanceFact\(adminProfile, 'INVOICE'\)/u)
  assert.match(source, /canCreateReceivable \|\| canCreateInvoice/u)
  assert.match(source, /action === 'receivable' \? canCreateReceivable/u)
  assert.match(source, />\s*生成应收\s*</u)
  assert.match(source, />\s*生成开票记录\s*</u)
  assert.match(source, /disabled=\{saving \|\| financeSourceLoading\}/u)
})

test('shipment finance submit uses source-owned APIs without frontend money fields', () => {
  assert.match(
    source,
    /buildShipmentFinanceSourcePayload\(values, selectedRow\)/u
  )
  assert.match(source, /createReceivableFromShipment/u)
  assert.match(source, /createInvoiceFromShipment/u)
  assert.match(source, /customer_key: activeCustomerKey \|\| undefined/u)
  assert.match(source, /sourceBusinessActionNo/u)
  assert.match(source, /result\.status !== 'DRAFT'/u)
  assert.match(source, /result\.fact_type !== config\.factType/u)
  assert.doesNotMatch(source, /postFinanceFact|settleFinanceFact/u)
})

test('shipment finance unknown results retain the request and success refreshes', () => {
  assert.match(source, /createSourceBusinessActionAttemptStore/u)
  assert.match(source, /financeSourceAttemptsRef\.current\.settle/u)
  assert.match(
    source,
    /暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录/u
  )
  assert.match(source, /setFinanceSourceAction\(null\)[\s\S]*message\.success/u)
  assert.match(
    source,
    /message\.success\(config\.successMessage\)[\s\S]*await loadRows\(\)/u
  )
})

test('shipment page mounts one reusable source finance modal', () => {
  assert.match(source, /<ShipmentFinanceSourceModal/u)
  assert.match(source, /action=\{financeSourceAction\}/u)
  assert.match(source, /shipment=\{selectedRow\}/u)
  assert.match(source, /onSubmit=\{submitShipmentFinanceSource\}/u)
})
