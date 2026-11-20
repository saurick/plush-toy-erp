import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionExceptionListQuery,
  reconcileProductionExceptionPage,
  requireProductionExceptionPage,
  requireProductionExceptionRecord,
  productionExceptionHandlingKey,
  productionExceptionApprovalCounts,
  PRODUCTION_EXCEPTION_HANDLING_OPTIONS,
} from './productionExceptionListModel.mjs'

test('exception quick filters group approval without treating approval as execution', () => {
  const expected = ['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED']
  assert.deepEqual(
    PRODUCTION_EXCEPTION_HANDLING_OPTIONS.map(({ value }) => value),
    expected
  )
  for (const key of [
    'SUBMITTED',
    'APPROVED:PENDING',
    'APPROVED:APPLIED',
    'APPROVED:REVERSED',
    'REJECTED',
    'CANCELLED',
  ]) {
    const [status, execution_status = 'PENDING'] = key.split(':')
    assert.equal(
      productionExceptionHandlingKey({ status, execution_status }),
      key
    )
  }
  assert.deepEqual(
    buildProductionExceptionListQuery({
      handlingStatus: 'APPROVED:PENDING',
      status: 'APPROVED',
      executionStatus: 'PENDING',
      decisionType: 'OVER_ISSUE',
      productionOrderID: 42,
      pagination: { current: 2, pageSize: 50 },
    }),
    {
      handling_status: 'APPROVED:PENDING',
      status: 'APPROVED',
      execution_status: 'PENDING',
      decision_type: 'OVER_ISSUE',
      production_order_id: 42,
      limit: 50,
      offset: 50,
    }
  )
  const cleared = buildProductionExceptionListQuery({
    handlingStatus: '',
    status: 'APPROVED',
    productionOrderID: 42,
  })
  assert.equal(Object.hasOwn(cleared, 'handling_status'), false)
  assert.equal(cleared.status, 'APPROVED')
  assert.equal(cleared.production_order_id, 42)
  assert.equal(productionExceptionHandlingKey(null), '')
  assert.deepEqual(
    productionExceptionApprovalCounts({
      SUBMITTED: 2,
      'APPROVED:PENDING': 3,
      'APPROVED:APPLIED': 5,
      'APPROVED:REVERSED': 7,
      REJECTED: 1,
    }),
    { SUBMITTED: 2, APPROVED: 15, REJECTED: 1 }
  )
  assert.equal(productionExceptionApprovalCounts(null), null)
  assert.deepEqual(productionExceptionApprovalCounts({}), {})
})

test('exception keyword is trimmed before server pagination and omitted when cleared', () => {
  assert.deepEqual(
    buildProductionExceptionListQuery({
      keyword: '  PE-SEARCH  ',
      handlingStatus: 'APPROVED',
      executionStatus: 'PENDING',
      pagination: { current: 3, pageSize: 50 },
    }),
    {
      keyword: 'PE-SEARCH',
      handling_status: 'APPROVED',
      execution_status: 'PENDING',
      limit: 50,
      offset: 100,
    }
  )
  assert.equal(
    Object.hasOwn(
      buildProductionExceptionListQuery({ keyword: '  ' }),
      'keyword'
    ),
    false
  )
})

test('production exception query sends filters, order context and page offset', () => {
  assert.deepEqual(
    buildProductionExceptionListQuery({
      decisionType: 'SCRAP',
      status: 'APPROVED',
      executionStatus: 'PENDING',
      productionOrderID: 42,
      pagination: { current: 3, pageSize: 300 },
    }),
    {
      limit: 300,
      offset: 600,
      decision_type: 'SCRAP',
      status: 'APPROVED',
      execution_status: 'PENDING',
      production_order_id: 42,
    }
  )
})

test('production exception page validates server totals and order ownership', () => {
  const record = { id: 7, version: 2, production_order_id: 42 }
  assert.deepEqual(
    requireProductionExceptionPage(
      { production_exceptions: [record], total: 21 },
      { limit: 20, productionOrderID: 42 }
    ),
    { records: [record], total: 21 }
  )
  assert.throws(
    () =>
      requireProductionExceptionPage(
        { production_exceptions: [record], total: 1 },
        { limit: 20, productionOrderID: 99 }
      ),
    (error) => error?.isInvalidResponse === true
  )
})

test('exact production exception deep link rejects another production order', () => {
  assert.throws(
    () =>
      requireProductionExceptionRecord(
        { id: 7, version: 2, production_order_id: 42 },
        { id: 7, productionOrderID: 99 }
      ),
    (error) => error?.isInvalidResponse === true
  )
})

test('production exception page retreats from an emptied tail page', () => {
  assert.deepEqual(
    reconcileProductionExceptionPage({
      records: [],
      total: 1000,
      pagination: { current: 3, pageSize: 500 },
      selectedID: 30,
    }),
    {
      current: 2,
      shouldRetreat: true,
      records: [],
      selectedID: null,
    }
  )
})
