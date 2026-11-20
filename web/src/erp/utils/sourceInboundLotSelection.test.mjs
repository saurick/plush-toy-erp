import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SOURCE_INBOUND_LOT_SELECTION,
  buildSourceInboundLotFields,
  normalizeSourceInboundLotRequestFields,
  sourceInboundLotSelectionForOptions,
} from './sourceInboundLotSelection.mjs'

test('source inbound lot selection defaults to an existing option or a new number', () => {
  assert.equal(
    sourceInboundLotSelectionForOptions([{ value: 1 }]),
    SOURCE_INBOUND_LOT_SELECTION.EXISTING
  )
  assert.equal(
    sourceInboundLotSelectionForOptions([]),
    SOURCE_INBOUND_LOT_SELECTION.NEW
  )
})

test('source inbound lot fields submit exactly one operator choice', () => {
  assert.deepEqual(
    buildSourceInboundLotFields({
      lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
      lot_id: 7,
    }),
    { lot_id: 7 }
  )
  assert.deepEqual(
    buildSourceInboundLotFields({
      lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
      new_lot_no: '  PROD-LOT-001  ',
    }),
    { new_lot_no: 'PROD-LOT-001' }
  )
})

test('source inbound lot fields reject missing, mixed and forbidden new lots', () => {
  assert.throws(() =>
    buildSourceInboundLotFields({
      lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
    })
  )
  assert.throws(() =>
    buildSourceInboundLotFields({
      lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
      lot_id: 7,
      new_lot_no: 'PROD-LOT-001',
    })
  )
  assert.throws(() =>
    buildSourceInboundLotFields(
      {
        lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
        new_lot_no: 'PROD-LOT-001',
      },
      { allowNew: false }
    )
  )
})

test('source inbound API fields are mutually exclusive and bounded', () => {
  assert.deepEqual(normalizeSourceInboundLotRequestFields({ lot_id: 8 }), {
    lot_id: 8,
  })
  assert.deepEqual(
    normalizeSourceInboundLotRequestFields({ new_lot_no: ' NEW-LOT-008 ' }),
    { new_lot_no: 'NEW-LOT-008' }
  )
  assert.throws(() =>
    normalizeSourceInboundLotRequestFields({
      lot_id: 8,
      new_lot_no: 'NEW-LOT-008',
    })
  )
  assert.throws(() =>
    normalizeSourceInboundLotRequestFields(
      { new_lot_no: 'NEW-LOT-008' },
      { allowNew: false }
    )
  )
  assert.throws(() => normalizeSourceInboundLotRequestFields({}))
})
