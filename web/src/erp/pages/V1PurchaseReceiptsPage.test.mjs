import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./V1PurchaseReceiptsPage.jsx', import.meta.url),
  'utf8'
)
const exceptionRecordsSource = readFileSync(
  new URL(
    '../components/purchase-receipts/PurchaseReceiptExceptionRecordsModal.jsx',
    import.meta.url
  ),
  'utf8'
)

test('purchase receipt exception actions follow backend read and manage permission projections', () => {
  for (const permission of [
    'purchase.return.create',
    'purchase.return.post',
    'purchase.return.cancel',
    'purchase.return.read',
    'purchase.receipt.adjustment.read',
    'purchase.receipt.adjustment.create',
    'purchase.receipt.adjustment.post',
    'purchase.receipt.adjustment.cancel',
  ]) {
    assert.match(source, new RegExp(permission.replaceAll('.', '\\.'), 'u'))
  }
  assert.match(source, /canPostReturns=\{canPostReturn\}/u)
  assert.match(source, /canCancelReturns=\{canCancelReturn\}/u)
  assert.match(source, /canPostAdjustments=\{canPostAdjustment\}/u)
  assert.match(source, /canCancelAdjustments=\{canCancelAdjustment\}/u)
})

test('purchase receipt exception history reads every reversal page', () => {
  assert.match(exceptionRecordsSource, /listAllPurchaseReturns/u)
  assert.match(exceptionRecordsSource, /listAllPurchaseReceiptAdjustments/u)
  assert.doesNotMatch(exceptionRecordsSource, /limit:\s*100/u)
})

test('purchase receipt exception creation binds the customer and validates the returned draft', () => {
  assert.match(
    source,
    /adminProfile\?\.effective_session\?\.customer\?\.key \|\| ''/u
  )
  assert.match(source, /customer_key: activeCustomerKey \|\| undefined/u)
  assert.match(source, /Number\(createdRecord\?\.id \|\| 0\) <= 0/u)
  assert.match(source, /createdRecord\?\.purchase_receipt_id/u)
  assert.match(source, /createdRecord\?\.status \|\| ''/u)
  assert.match(source, /error\.isInvalidResponse = true/u)
  assert.match(source, /customerKey=\{activeCustomerKey\}/u)
})

test('purchase receipt exception creation only opens a records view the user may read', () => {
  assert.match(
    source,
    /\(mode === 'return' && canReadReturn\)[\s\S]*\(mode === 'adjustment' && canReadAdjustment\)/u
  )
  assert.match(source, /setReceiptExceptionRecordsOpen\(true\)/u)
})

test('posted purchase receipt payable uses the exact permission and source-bound request', () => {
  assert.match(source, /finance\.payable\.confirm/u)
  assert.match(source, /selectedRow\?\.status === 'POSTED'/u)
  assert.match(source, /生成应付/u)
  assert.match(source, /查看应付/u)
  assert.match(source, /buildPurchaseReceiptPayablePayload\(values, receipt\)/u)
  assert.match(source, /createPayableFromPurchaseReceipt\(attempt\.params\)/u)
  assert.match(source, /financeSourceAttemptsRef\.current\.settle/u)
  assert.match(source, /source_type: 'PURCHASE_RECEIPT'/u)
  assert.doesNotMatch(
    source,
    /warehouse\.inbound\.confirm[\s\S]{0,160}生成应付/u
  )
})

test('purchase receipt rows remain source-generated and cannot append manual lines', () => {
  assert.doesNotMatch(source, /addPurchaseReceiptItem/u)
  assert.doesNotMatch(source, /添加明细|添加入库明细/u)
  assert.match(source, /相关单据/u)
  assert.match(source, /采购订单/u)
})

test('purchase receipt drafts have a truthful no-inventory cancellation exit', () => {
  assert.match(
    source,
    /\['DRAFT', 'POSTED'\]\.includes\(selectedRow\.status\)/u
  )
  assert.match(source, /采购入库草稿已作废，未更新库存/u)
  assert.match(source, /草稿作废不更新库存/u)
  assert.match(source, /确认作废采购入库草稿/u)
})

test('purchase receipt quantity display and sorting use exact numeric helpers', () => {
  assert.match(source, /sumPurchaseReceiptQuantities\(receipt\.items\)/u)
  assert.match(source, /comparePurchaseReceiptQuantityTotals/u)
  assert.match(source, /formatQuantity\(item\?\.quantity\)/u)
  assert.doesNotMatch(source, /decimalNumber\(item\?\.quantity\)/u)
})
