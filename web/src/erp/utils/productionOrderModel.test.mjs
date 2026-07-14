import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProductionOrderAttemptStore,
  isProductionOrderResultUnknown,
  PRODUCTION_MATERIAL_REQUIREMENTS_STATE,
  validateProductionOrderAggregate,
  validateProductionMaterialRequirementsResponse,
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
    production_material_requirements: [
      {
        id: 31,
        production_order_id: 7,
        production_order_item_id: 11,
        bom_header_id: 21,
        bom_item_id: 22,
        material_id: 23,
        unit_id: 5,
        unit_quantity_snapshot: '0.500000',
        loss_rate_snapshot: '0.020000',
        planned_quantity: '10.200000',
        issued_quantity: '4.200000',
        remaining_quantity: '6.000000',
        material_code_snapshot: 'MAT-023',
        material_name_snapshot: '短毛绒布',
        unit_code_snapshot: 'M',
        unit_name_snapshot: '米',
      },
    ],
    material_requirements_state: 'READY',
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
  assert.equal(
    validateProductionOrderAggregate(aggregate()).materialRequirementsState,
    PRODUCTION_MATERIAL_REQUIREMENTS_STATE.READY
  )
  assert.throws(() => validateProductionOrderAggregate(aggregate(), { id: 8 }))
  const malformed = aggregate()
  malformed.production_order_items[0].production_order_id = 8
  assert.throws(() => validateProductionOrderAggregate(malformed))
})

test('production material requirement response binds order and quantity projection', () => {
  const data = {
    material_requirements: aggregate().production_material_requirements,
  }
  assert.equal(
    validateProductionMaterialRequirementsResponse(data, {
      productionOrderID: 7,
    })[0].remaining_quantity,
    '6.000000'
  )
  const forged = structuredClone(data)
  forged.material_requirements[0].production_order_id = 8
  assert.throws(() =>
    validateProductionMaterialRequirementsResponse(forged, {
      productionOrderID: 7,
    })
  )
  const inconsistent = structuredClone(data)
  inconsistent.material_requirements[0].remaining_quantity = '7.000000'
  assert.throws(() =>
    validateProductionMaterialRequirementsResponse(inconsistent)
  )
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
