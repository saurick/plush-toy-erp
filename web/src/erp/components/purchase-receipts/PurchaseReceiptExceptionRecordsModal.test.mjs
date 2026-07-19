import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./PurchaseReceiptExceptionRecordsModal.jsx', import.meta.url),
  'utf8'
)

test('purchase exception records modal loads complete paginated records and completes reversal actions', () => {
  for (const operation of [
    'listAllPurchaseReturns',
    'listAllPurchaseReceiptAdjustments',
    'postPurchaseReturn',
    'cancelPurchaseReturn',
    'postPurchaseReceiptAdjustment',
    'cancelPurchaseReceiptAdjustment',
  ]) {
    assert.match(source, new RegExp(operation, 'u'))
  }
  assert.doesNotMatch(source, /\blistPurchaseReturns\(/u)
  assert.doesNotMatch(source, /\blistPurchaseReceiptAdjustments\(/u)
  assert.doesNotMatch(source, /\b(?:limit|offset):\s*\d+/u)
  assert.match(
    source,
    /listAllPurchaseReturns\(\s*\{\s*purchase_receipt_id: receipt\.id,?\s*\},\s*\{ signal: request\.signal \}\s*\)/u
  )
  assert.match(
    source,
    /listAllPurchaseReceiptAdjustments\(\s*\{\s*purchase_receipt_id: receipt\.id,?\s*\},\s*\{ signal: request\.signal \}\s*\)/u
  )
  assert.match(source, /record\?\.status === 'DRAFT'/u)
  assert.match(source, /record\?\.status === 'POSTED'/u)
  assert.match(
    source,
    /expectedStatus = action === 'post' \? 'POSTED' : 'CANCELLED'/u
  )
  assert.match(
    source,
    /Number\(nextRecord\?\.id \|\| 0\) !== Number\(record\.id\)/u
  )
  assert.match(source, /草稿可直接作废且不更新库存/u)
  assert.match(source, /record\?\.status === 'DRAFT'/u)
  assert.match(source, /采购退货草稿已作废，未更新库存/u)
  assert.match(source, /入库调整草稿已作废，未更新库存/u)
  assert.match(source, /取消已确认记录时会保留原记录，并将库存恢复到操作前/u)
})

test('purchase exception records modal guards stale reads and reconciles unknown writes', () => {
  assert.match(source, /useLatestRequestCoordinator/u)
  assert.match(source, /beginLatestRequest\('purchase-exception-records'\)/u)
  assert.match(source, /\{ signal: request\.signal \}/u)
  assert.match(source, /isRpcAbortError\(error\) \|\| !request\.isCurrent\(\)/u)
  assert.match(source, /setReturns\(\[\]\)/u)
  assert.match(source, /setAdjustments\(\[\]\)/u)
  assert.match(source, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(source, /await loadRecords\(\)[\s\S]*await onChanged\?\.\(\)/u)
})

test('purchase exception records modal uses the current customer and locks modal controls while writing', () => {
  assert.match(source, /customer_key: customerKey \|\| undefined/u)
  assert.match(source, /actionInFlightRef\.current/u)
  assert.match(source, /disabled=\{Boolean\(savingKey\)\}/u)
  assert.match(source, /closable=\{!savingKey\}/u)
  assert.match(source, /keyboard=\{!savingKey\}/u)
  assert.match(source, /maskClosable=\{!savingKey\}/u)
})

test('purchase exception records modal presents business labels without technical control fields', () => {
  for (const label of [
    '采购退货',
    '入库调整',
    '退货单号',
    '调整单号',
    '调整原因',
    '作废草稿',
    '取消并恢复库存',
  ]) {
    assert.match(source, new RegExp(label, 'u'))
  }
  for (const forbiddenLabel of [
    'idempotency_key',
    'correction_group',
    'purchase_receipt_id',
    'purchase_receipt_item_id',
    'source_type',
  ]) {
    assert.equal(source.includes(`>${forbiddenLabel}<`), false)
    assert.equal(source.includes(`title: '${forbiddenLabel}'`), false)
  }
  assert.doesNotMatch(source, /写库存|库存流水|库存冲正|反向库存流水/u)
})

test('purchase exception quantity summaries use exact numeric(20,6) formatting', () => {
  assert.match(source, /formatPurchaseReceiptQuantityTotal\(items\)/u)
  assert.doesNotMatch(source, /Number\(item\?\.quantity\)/u)
})
