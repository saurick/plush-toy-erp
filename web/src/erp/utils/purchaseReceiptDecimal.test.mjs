import assert from 'node:assert/strict'
import test from 'node:test'

import {
  comparePurchaseReceiptQuantityTotals,
  formatPurchaseReceiptQuantityTotal,
  sumPurchaseReceiptQuantities,
} from './purchaseReceiptDecimal.mjs'

test('purchase receipt quantity summaries preserve numeric(20,6) boundary values', () => {
  assert.equal(
    sumPurchaseReceiptQuantities([
      { quantity: '0.000001' },
      { quantity: '1.000001' },
    ]),
    '1.000002'
  )
  assert.equal(
    formatPurchaseReceiptQuantityTotal([
      { quantity: '99999999999999.999999' },
    ]),
    '99999999999999.999999'
  )
})

test('purchase receipt quantity sorting distinguishes adjacent maximum values', () => {
  const lower = [{ quantity: '99999999999999.999998' }]
  const higher = [{ quantity: '99999999999999.999999' }]
  assert.equal(comparePurchaseReceiptQuantityTotals(lower, higher), -1)
  assert.equal(comparePurchaseReceiptQuantityTotals(higher, lower), 1)
  assert.equal(comparePurchaseReceiptQuantityTotals(higher, higher), 0)
})
