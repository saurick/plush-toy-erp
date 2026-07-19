import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createProductionOrderAttemptStore,
  isProductionOrderResultUnknown,
  PRODUCTION_MATERIAL_REQUIREMENTS_STATE,
  validateProductionOrderAggregate,
  validateProductionMaterialRequirementsResponse,
  validateProductionOrderList,
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
        route_code: 'PLUSH_SEW_HAND_V1',
        customer_inspection_required: false,
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

  const invalidCustomerGate = aggregate()
  invalidCustomerGate.production_order_items[0].route_code = null
  invalidCustomerGate.production_order_items[0].customer_inspection_required = true
  assert.throws(() => validateProductionOrderAggregate(invalidCustomerGate))
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

test('production material requirement conservation is exact at numeric(20,6) boundaries', () => {
  const tiny = aggregate()
  tiny.production_material_requirements[0].planned_quantity = '0.000001'
  tiny.production_material_requirements[0].issued_quantity = '0'
  tiny.production_material_requirements[0].remaining_quantity = '0.000001'
  assert.equal(
    validateProductionMaterialRequirementsResponse({
      material_requirements: tiny.production_material_requirements,
    })[0].remaining_quantity,
    '0.000001'
  )

  const maximum = aggregate()
  maximum.production_material_requirements[0].planned_quantity =
    '99999999999999.999999'
  maximum.production_material_requirements[0].issued_quantity = '0.000001'
  maximum.production_material_requirements[0].remaining_quantity =
    '99999999999999.999998'
  assert.equal(
    validateProductionMaterialRequirementsResponse({
      material_requirements: maximum.production_material_requirements,
    })[0].planned_quantity,
    '99999999999999.999999'
  )

  maximum.production_material_requirements[0].remaining_quantity =
    '99999999999999.999997'
  assert.throws(() =>
    validateProductionMaterialRequirementsResponse({
      material_requirements: maximum.production_material_requirements,
    })
  )
})

test('production order option response never accepts missing readable labels', () => {
  const valid = {
    reference_type: 'product',
    total: 1,
    limit: 50,
    offset: 0,
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

test('production order option response requires an exact complete page contract', () => {
  const options = Array.from({ length: 50 }, (_, index) => ({
    value: index + 1,
    label: `选项 ${index + 1}`,
    selectable: true,
  }))
  const firstPage = {
    reference_type: 'product',
    total: 51,
    limit: 50,
    offset: 0,
    options,
  }
  assert.equal(
    validateProductionOrderOptions(firstPage, 'product', {
      limit: 50,
      offset: 0,
    }).options.length,
    50
  )
  assert.equal(
    validateProductionOrderOptions(
      { ...firstPage, offset: 50, options: [options[0]] },
      'product',
      { limit: 50, offset: 50 }
    ).options.length,
    1
  )
  for (const malformed of [
    { ...firstPage, limit: 0 },
    { ...firstPage, offset: -1 },
    { ...firstPage, options: options.slice(0, 49) },
    { ...firstPage, total: 49 },
    { ...firstPage, offset: 1 },
  ]) {
    assert.throws(() =>
      validateProductionOrderOptions(malformed, 'product', {
        limit: 50,
        offset: 0,
      })
    )
  }
})

test('production order list requires an exact non-negative safe item count', () => {
  const list = (itemCount) => ({
    production_orders: [
      {
        id: 7,
        version: 2,
        order_no: 'MO-20260713-001',
        status: 'RELEASED',
        item_count: itemCount,
      },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  })

  assert.equal(validateProductionOrderList(list(0)).production_orders[0].item_count, 0)
  assert.equal(validateProductionOrderList(list(22)).production_orders[0].item_count, 22)
  for (const malformed of [
    undefined,
    null,
    '1',
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => validateProductionOrderList(list(malformed)))
  }
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
