import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveOperationalFactRouteRecord } from './operationalFactRelatedNavigation.mjs'

test('production exact navigation resolves only the requested fact id', () => {
  const rows = [
    { id: 7, fact_no: 'PF-007' },
    { id: 8, fact_no: 'PF-008' },
  ]
  assert.equal(
    resolveOperationalFactRouteRecord(rows, {
      activeKey: 'production',
      factID: 8,
    })?.fact_no,
    'PF-008'
  )
})

test('finance source navigation prefers the unique non-cancelled record', () => {
  const rows = [
    {
      id: 91,
      fact_no: 'INV-CANCELLED',
      status: 'CANCELLED',
      source_type: 'SHIPMENT',
      source_id: 1,
    },
    {
      id: 92,
      fact_no: 'INV-ACTIVE',
      status: 'POSTED',
      source_type: 'SHIPMENT',
      source_id: 1,
    },
    {
      id: 93,
      fact_no: 'INV-OTHER',
      status: 'POSTED',
      source_type: 'SHIPMENT',
      source_id: 2,
    },
  ]
  assert.equal(
    resolveOperationalFactRouteRecord(rows, {
      activeKey: 'finance',
      sourceType: 'shipment',
      sourceID: '1',
    })?.fact_no,
    'INV-ACTIVE'
  )
})

test('finance source navigation fails closed when related history is ambiguous', () => {
  const cancelledRows = [
    {
      id: 91,
      status: 'CANCELLED',
      source_type: 'SHIPMENT',
      source_id: 1,
    },
    {
      id: 92,
      status: 'CANCELLED',
      source_type: 'SHIPMENT',
      source_id: 1,
    },
  ]
  assert.equal(
    resolveOperationalFactRouteRecord(cancelledRows, {
      activeKey: 'finance',
      sourceType: 'SHIPMENT',
      sourceID: 1,
    }),
    null
  )
  assert.equal(
    resolveOperationalFactRouteRecord([cancelledRows[0]], {
      activeKey: 'finance',
      sourceType: 'SHIPMENT',
      sourceID: 1,
      total: 2,
    }),
    null
  )
})
