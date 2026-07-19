import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionMaterialIssuePayload,
  filterProductionMaterialIssueLots,
  findProductionMaterialIssueResult,
  isProductionMaterialIssueEligible,
  normalizeProductionMaterialIssueCreateRequest,
  normalizeProductionMaterialRequirementsListRequest,
  validateProductionMaterialIssueResult,
} from './productionMaterialIssueAction.mjs'

const order = { id: 7, order_no: 'MO-007', status: 'RELEASED' }
const requirement = {
  id: 31,
  production_order_id: 7,
  production_order_item_id: 11,
  material_id: 23,
  unit_id: 5,
  remaining_quantity: '6.000000',
}

test('production material issue is fail-closed outside a READY released requirement', () => {
  assert.equal(
    isProductionMaterialIssueEligible(order, 'READY', requirement),
    true
  )
  assert.equal(
    isProductionMaterialIssueEligible(order, 'NEEDS_REVIEW', requirement),
    false
  )
  assert.equal(
    isProductionMaterialIssueEligible(
      { ...order, status: 'DRAFT' },
      'READY',
      requirement
    ),
    false
  )
  assert.equal(
    isProductionMaterialIssueEligible(order, 'READY', {
      ...requirement,
      remaining_quantity: '0',
    }),
    false
  )
})

test('production material issue payload derives source identity and excludes forged truth fields', () => {
  const occurredAtInput = '2026-07-14T09:30'
  const payload = buildProductionMaterialIssuePayload(
    {
      warehouse_id: 2,
      lot_id: 41,
      quantity: '2.500000',
      occurred_at: occurredAtInput,
      note: '  首批领料  ',
      material_id: 999,
      unit_id: 999,
      source_type: 'FORGED',
      idempotency_key: 'FORGED',
    },
    order,
    'READY',
    requirement
  )
  assert.deepEqual(payload, {
    production_order_id: 7,
    production_order_item_id: 11,
    production_order_material_requirement_id: 31,
    warehouse_id: 2,
    lot_id: 41,
    quantity: '2.5',
    occurred_at: new Date(occurredAtInput).toISOString(),
    note: '首批领料',
  })
  for (const field of [
    'material_id',
    'unit_id',
    'source_type',
    'source_id',
    'subject_type',
    'subject_id',
    'idempotency_key',
  ]) {
    assert.equal(Object.hasOwn(payload, field), false, field)
  }
  assert.throws(
    () =>
      buildProductionMaterialIssuePayload(
        { warehouse_id: 2, lot_id: 41, quantity: '7' },
        order,
        'READY',
        requirement
      ),
    /不能超过/u
  )
})

test('production material issue request contracts reject unknown and derived fields', () => {
  assert.deepEqual(
    normalizeProductionMaterialRequirementsListRequest({
      customer_key: ' yoyoosun ',
      production_order_id: 7,
    }),
    { customer_key: 'yoyoosun', production_order_id: 7 }
  )
  assert.throws(() =>
    normalizeProductionMaterialRequirementsListRequest({
      production_order_id: 7,
      material_id: 23,
    })
  )

  const request = normalizeProductionMaterialIssueCreateRequest({
    customer_key: 'yoyoosun',
    fact_no: 'PROD-MI-007',
    production_order_id: 7,
    production_order_item_id: 11,
    production_order_material_requirement_id: 31,
    warehouse_id: 2,
    lot_id: 41,
    quantity: '2.500000',
    idempotency_key: 'request-007',
    occurred_at: '2026-07-14T01:30:00.000Z',
    note: '首批领料',
  })
  assert.equal(request.quantity, '2.5')
  assert.throws(() =>
    normalizeProductionMaterialIssueCreateRequest({
      ...request,
      material_id: 23,
    })
  )
  assert.throws(() =>
    normalizeProductionMaterialIssueCreateRequest({
      ...request,
      lot_id: undefined,
    })
  )
})

test('production material issue only accepts matching active material lots', () => {
  assert.deepEqual(
    filterProductionMaterialIssueLots(requirement, [
      { id: 1, subject_type: 'MATERIAL', subject_id: 23, status: 'ACTIVE' },
      { id: 2, subject_type: 'MATERIAL', subject_id: 24, status: 'ACTIVE' },
      { id: 3, subject_type: 'MATERIAL', subject_id: 23, status: 'HOLD' },
      { id: 4, subject_type: 'PRODUCT', subject_id: 23, status: 'ACTIVE' },
    ]).map((item) => item.id),
    [1]
  )
})

test('production material issue response and unknown-result reread bind source requirement', () => {
  const request = {
    production_order_id: 7,
    production_order_item_id: 11,
    production_order_material_requirement_id: 31,
    fact_no: 'PROD-MI-007',
    idempotency_key: 'request-007',
  }
  const fact = {
    id: 51,
    fact_no: 'PROD-MI-007',
    fact_type: 'MATERIAL_ISSUE',
    status: 'DRAFT',
    subject_type: 'MATERIAL',
    subject_id: 23,
    unit_id: 5,
    source_type: 'PRODUCTION_ORDER',
    source_id: 7,
    source_line_id: 31,
    idempotency_key: 'request-007',
  }
  assert.equal(
    validateProductionMaterialIssueResult(fact, request, requirement),
    fact
  )
  assert.equal(
    findProductionMaterialIssueResult([fact], request, requirement),
    fact
  )
  assert.throws(() =>
    validateProductionMaterialIssueResult(
      { ...fact, subject_id: 999 },
      request,
      requirement
    )
  )
})

test('production material issue preserves numeric(20,6) boundaries exactly', () => {
  const tinyRequirement = {
    ...requirement,
    remaining_quantity: '0.000001',
  }
  assert.equal(
    isProductionMaterialIssueEligible(order, 'READY', tinyRequirement),
    true
  )
  assert.equal(
    buildProductionMaterialIssuePayload(
      { warehouse_id: 2, lot_id: 41, quantity: '0.000001' },
      order,
      'READY',
      tinyRequirement
    ).quantity,
    '0.000001'
  )
  assert.equal(
    normalizeProductionMaterialIssueCreateRequest({
      fact_no: 'PROD-MI-MAX',
      production_order_id: 7,
      production_order_item_id: 11,
      production_order_material_requirement_id: 31,
      warehouse_id: 2,
      lot_id: 41,
      quantity: '99999999999999.999999',
      idempotency_key: 'request-max',
    }).quantity,
    '99999999999999.999999'
  )
  assert.equal(
    buildProductionMaterialIssuePayload(
      {
        warehouse_id: 2,
        lot_id: 41,
        quantity: '99999999999999.999999',
      },
      order,
      'READY',
      { ...requirement, remaining_quantity: '99999999999999.999999' }
    ).quantity,
    '99999999999999.999999'
  )
  assert.throws(
    () =>
      buildProductionMaterialIssuePayload(
        { warehouse_id: 2, lot_id: 41, quantity: '0.000002' },
        order,
        'READY',
        tinyRequirement
      ),
    /不能超过/u
  )
})
