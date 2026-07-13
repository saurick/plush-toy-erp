import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProductionOrderAttemptStore,
  isProductionOrderResultUnknown,
  validateProductionOrderAggregate,
  validateProductionOrderOptions,
} from './productionOrderModel.mjs'

function aggregate() {
  return {
    production_order: {
      id: 7,
      version: 2,
      order_no: 'MO-20260713-001',
      status: 'RELEASED',
    },
    production_order_items: [
      {
        id: 11,
        production_order_id: 7,
        line_no: 1,
        product_id: 3,
        unit_id: 5,
        planned_quantity: '20.0000',
      },
    ],
  }
}

test('production order aggregate response binds order, status and every item', () => {
  assert.equal(
    validateProductionOrderAggregate(aggregate(), {
      id: 7,
      status: 'RELEASED',
    }).order.version,
    2
  )
  assert.throws(() => validateProductionOrderAggregate(aggregate(), { id: 8 }))
  const malformed = aggregate()
  malformed.production_order_items[0].production_order_id = 8
  assert.throws(() => validateProductionOrderAggregate(malformed))
})

test('production order option response never accepts missing readable labels', () => {
  const valid = {
    reference_type: 'product',
    total: 1,
    options: [{ value: 3, label: 'P-003 · 毛绒小熊', selectable: true }],
  }
  assert.equal(validateProductionOrderOptions(valid, 'product').total, 1)
  assert.throws(() =>
    validateProductionOrderOptions(
      { ...valid, options: [{ value: 3, label: '', selectable: true }] },
      'product'
    )
  )
})

test('production order attempts replay exact intent and do not delete a newer intent', () => {
  const originalCrypto = globalThis.crypto
  let sequence = 0
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: () => `request-${++sequence}` },
  })
  try {
    const store = createProductionOrderAttemptStore()
    const first = store.prepare('create', { order_no: 'MO-1' })
    assert.equal(store.prepare('create', { order_no: 'MO-1' }), first)
    const second = store.prepare('create', { order_no: 'MO-2' })
    assert.notEqual(second.params.idempotency_key, first.params.idempotency_key)
    store.finish('create', first)
    assert.equal(store.peek('create'), second)
    store.finish('create', second)
    assert.equal(store.peek('create'), null)
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    })
  }
})

test('production order unknown result includes network, invalid response, 408 and server errors', () => {
  for (const error of [
    { isNetworkError: true },
    { isInvalidResponse: true },
    { httpStatus: 408 },
    { httpStatus: 503 },
    { code: 50000 },
  ]) {
    assert.equal(isProductionOrderResultUnknown(error), true)
  }
  assert.equal(isProductionOrderResultUnknown({ code: 40922 }), false)
})
