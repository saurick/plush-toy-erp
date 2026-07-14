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
    'create_purchase_receipt_draft',
    'create_purchase_receipt_with_items',
    'create_purchase_receipt_from_purchase_order',
    'add_purchase_receipt_item',
    'get_purchase_receipt',
    'post_purchase_receipt',
    'cancel_purchase_receipt',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
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
  assert.doesNotMatch(source, /idempotency_payload_hash/u)
})
