import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./PurchaseReceiptExceptionRecordsModal.jsx', import.meta.url),
  'utf8'
)

test('purchase exception records modal completes the draft post and posted cancellation paths', () => {
  for (const operation of [
    'listPurchaseReturns',
    'listPurchaseReceiptAdjustments',
    'postPurchaseReturn',
    'cancelPurchaseReturn',
    'postPurchaseReceiptAdjustment',
    'cancelPurchaseReceiptAdjustment',
  ]) {
    assert.match(source, new RegExp(operation, 'u'))
  }
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
  assert.match(source, /草稿过账后才影响库存/u)
  assert.match(source, /取消时保留原记录，并生成反向库存流水/u)
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
    '取消并冲正',
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
})
