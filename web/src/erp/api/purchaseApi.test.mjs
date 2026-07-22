import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./purchaseApi.mjs', import.meta.url)),
  'utf8'
)

test('purchaseApi: uses dedicated purchase JSON-RPC domain and admin auth', () => {
  assert.match(source, /url:\s*'purchase'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('purchaseApi: exposes purchase receipt methods only', () => {
  for (const methodName of [
    'list_purchase_receipts',
    'create_purchase_receipt_from_purchase_order',
    'add_purchase_receipt_item',
    'get_purchase_receipt',
    'post_purchase_receipt',
    'cancel_purchase_receipt',
    'create_purchase_return_from_receipt',
    'create_purchase_return_from_quality_inspection',
    'get_purchase_return',
    'list_purchase_returns',
    'post_purchase_return',
    'cancel_purchase_return',
    'create_purchase_receipt_adjustment_from_receipt',
    'get_purchase_receipt_adjustment',
    'list_purchase_receipt_adjustments',
    'post_purchase_receipt_adjustment',
    'cancel_purchase_receipt_adjustment',
    'create_purchase_rejection_disposition',
    'post_purchase_rejection_disposition',
    'cancel_purchase_rejection_disposition',
    'get_purchase_rejection_disposition',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  for (const retiredMethodName of [
    'create_purchase_receipt_draft',
    'create_purchase_receipt_with_items',
  ]) {
    assert.doesNotMatch(source, new RegExp(retiredMethodName))
  }

  for (const forbiddenActionName of [
    'createQualityInspection',
    'postInventoryAdjustment',
    'generatePayable',
    'generateInvoice',
    'paySupplier',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbiddenActionName))
  }
})

test('purchaseApi: retry-safe writes require hidden keys and validate business results', () => {
  assert.match(
    source,
    /createPurchaseReceiptFromPurchaseOrder[\s\S]*?requirePurchaseReceiptIdempotencyKey\(params\.idempotency_key\)[\s\S]*?validatePurchaseReceiptDraft/u
  )
  assert.match(
    source,
    /addPurchaseReceiptItem[\s\S]*?requirePurchaseReceiptIdempotencyKey\(params\.idempotency_key\)[\s\S]*?validatePurchaseReceiptItem/u
  )
  assert.match(
    source,
    /createPurchaseReturnFromQualityInspection[\s\S]*?requirePurchaseReceiptIdempotencyKey\(params\.idempotency_key\)[\s\S]*?create_purchase_return_from_quality_inspection/u
  )
  assert.doesNotMatch(source, /idempotency_payload_hash/u)
})

test('purchaseApi: purchase-order inbound preview uses complete receipt pagination', () => {
  assert.match(
    source,
    /export async function listAllPurchaseReceipts[\s\S]*?listAllPaginatedRecords\(\s*listPurchaseReceipts,\s*params,\s*'purchase_receipts'/u
  )
})

test('purchaseApi: receipt reversal records use complete pagination', () => {
  assert.match(
    source,
    /export async function listAllPurchaseReturns[\s\S]*?listAllPaginatedRecords\(\s*listPurchaseReturns,\s*params,\s*'purchase_returns'/u
  )
  assert.match(
    source,
    /export async function listAllPurchaseReceiptAdjustments[\s\S]*?listAllPaginatedRecords\(\s*listPurchaseReceiptAdjustments,\s*params,\s*'purchase_receipt_adjustments'/u
  )
})
