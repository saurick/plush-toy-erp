import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createPurchaseReceiptMutationAttemptStore,
  isPurchaseReceiptMutationResultUnknown,
  purchaseReceiptMutationSignature,
  purchaseReceiptMutationUUID,
  requirePurchaseReceiptIdempotencyKey,
  validatePurchaseReceiptDraft,
  validatePurchaseReceiptItem,
} from './purchaseReceiptMutation.mjs'

function receiptItem(overrides = {}) {
  return {
    id: 21,
    receipt_id: 11,
    material_id: 3,
    warehouse_id: 4,
    unit_id: 5,
    lot_id: 6,
    quantity: '12.5000',
    ...overrides,
  }
}

test('purchase receipt mutation UUID uses secure browser crypto only', () => {
  assert.equal(
    purchaseReceiptMutationUUID({ randomUUID: () => 'secure-request-id' }),
    'secure-request-id'
  )
  assert.equal(
    purchaseReceiptMutationUUID({
      getRandomValues(bytes) {
        bytes.fill(1)
        return bytes
      },
    }),
    '01010101-0101-4101-8101-010101010101'
  )
  assert.throws(() => purchaseReceiptMutationUUID({}), /安全请求标识/u)
  const source = readFileSync(
    new URL('./purchaseReceiptMutation.mjs', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(source, /Math\.random/u)
})

test('purchase receipt mutation signature follows wire semantics and ignores key order', () => {
  const left = {
    receipt_id: 11,
    note: undefined,
    item: { quantity: '2.0000', material_id: 3 },
  }
  const right = {
    item: { material_id: 3, quantity: '2.0000' },
    receipt_id: 11,
  }
  assert.equal(
    purchaseReceiptMutationSignature(left),
    purchaseReceiptMutationSignature(right)
  )
  assert.notEqual(
    purchaseReceiptMutationSignature(left),
    purchaseReceiptMutationSignature({ ...right, receipt_id: 12 })
  )
})

test('purchase receipt idempotency key stays non-empty and bounded', () => {
  assert.equal(
    requirePurchaseReceiptIdempotencyKey('  secure-request-id  '),
    'secure-request-id'
  )
  assert.throws(() => requirePurchaseReceiptIdempotencyKey('   '))
  assert.throws(() => requirePurchaseReceiptIdempotencyKey('界'.repeat(129)))
})

test('purchase receipt attempts retain one frozen key for the same intent', () => {
  let sequence = 0
  const store = createPurchaseReceiptMutationAttemptStore({
    cryptoProvider: { randomUUID: () => `secure-${++sequence}` },
  })
  const first = store.prepare('add:11', {
    receipt_id: 11,
    quantity: '2',
  })
  const replay = store.prepare('add:11', {
    quantity: '2',
    receipt_id: 11,
  })
  assert.equal(replay, first)
  assert.equal(first.params.idempotency_key, 'secure-1')
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.params), true)

  const changed = store.prepare('add:11', {
    receipt_id: 11,
    quantity: '3',
  })
  assert.notEqual(changed, first)
  assert.equal(changed.params.idempotency_key, 'secure-2')
  store.settle('add:11', first)
  assert.equal(store.peek('add:11'), changed)
})

test('purchase receipt attempts clear on success or known failure and retain unknown results', () => {
  let sequence = 0
  const store = createPurchaseReceiptMutationAttemptStore({
    cryptoProvider: { randomUUID: () => `secure-${++sequence}` },
  })

  const success = store.prepare('create:7', { purchase_order_id: 7 })
  assert.equal(store.settle('create:7', success), false)
  assert.equal(store.peek('create:7'), null)

  const conflict = store.prepare('create:7', { purchase_order_id: 7 })
  assert.equal(store.settle('create:7', conflict, { code: 40920 }), false)
  assert.equal(store.peek('create:7'), null)

  for (const error of [
    { isNetworkError: true },
    { isAbortError: true },
    { isInvalidResponse: true },
    { httpStatus: 408 },
    { httpStatus: 503 },
    { code: 50000 },
  ]) {
    const attempt = store.prepare('create:7', { purchase_order_id: 7 })
    assert.equal(store.settle('create:7', attempt, error), true)
    assert.equal(store.peek('create:7'), attempt)
  }
  assert.equal(isPurchaseReceiptMutationResultUnknown({ code: 40010 }), false)
})

test('purchase receipt response validation binds returned business objects', () => {
  const item = receiptItem()
  assert.equal(
    validatePurchaseReceiptItem(item, {
      receiptID: 11,
      materialID: 3,
      warehouseID: 4,
      unitID: 5,
    }),
    item
  )
  const receipt = {
    id: 11,
    receipt_no: 'IN-PO-7',
    status: 'DRAFT',
    items: [item],
  }
  assert.equal(
    validatePurchaseReceiptDraft(receipt, { receiptNo: 'IN-PO-7' }),
    receipt
  )

  for (const malformed of [
    receiptItem({ id: 0 }),
    receiptItem({ receipt_id: 12 }),
    receiptItem({ lot_id: null }),
    receiptItem({ quantity: '' }),
  ]) {
    assert.throws(
      () => validatePurchaseReceiptItem(malformed, { receiptID: 11 }),
      (error) => error.isInvalidResponse === true
    )
  }
  assert.throws(
    () =>
      validatePurchaseReceiptDraft(
        { ...receipt, items: [], receipt_no: 'IN-PO-7' },
        { receiptNo: 'IN-PO-7' }
      ),
    (error) => error.isInvalidResponse === true
  )
})
