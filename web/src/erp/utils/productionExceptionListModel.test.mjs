import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionExceptionListQuery,
  reconcileProductionExceptionPage,
  requireProductionExceptionPage,
  requireProductionExceptionRecord,
} from './productionExceptionListModel.mjs'

test('production exception query sends filters, order context and page offset', () => {
  assert.deepEqual(
    buildProductionExceptionListQuery({
      decisionType: 'SCRAP',
      status: 'APPROVED',
      executionStatus: 'PENDING',
      productionOrderID: 42,
      pagination: { current: 3, pageSize: 20 },
    }),
    {
      limit: 20,
      offset: 40,
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
      total: 20,
      pagination: { current: 3, pageSize: 10 },
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
