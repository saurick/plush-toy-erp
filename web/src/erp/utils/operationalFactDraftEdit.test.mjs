import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS,
  buildOperationalFactDraftSavePayload,
  normalizeOutsourcingFactDraftSaveRequest,
  normalizeProductionFactDraftSaveRequest,
  operationalFactDraftFormValues,
  validateOperationalFactDraftSaveResult,
} from './operationalFactDraftEdit.mjs'

const original = Object.freeze({
  id: 18,
  version: 2,
  status: 'DRAFT',
  fact_type: 'FINISHED_GOODS_RECEIPT',
  source_type: 'PRODUCTION_ORDER',
  source_id: 31,
  source_line_id: 32,
  idempotency_key: 'completion:31:32',
  warehouse_id: 4,
  lot_id: 5,
  quantity: '2.5',
  occurred_at: 1_786_262_400,
  note: 'before',
})

test('production draft edit emits only CAS and operator-owned fields', () => {
  const request = buildOperationalFactDraftSavePayload(
    OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION,
    {
      warehouse_id: 7,
      lot_selection: 'NEW',
      new_lot_no: 'FG-NEW-01',
      quantity: '3.250000',
      occurred_at: '2026-08-09T09:30',
      note: ' corrected ',
    },
    original
  )
  assert.deepEqual(Object.keys(request).sort(), [
    'expected_version',
    'id',
    'new_lot_no',
    'note',
    'occurred_at',
    'quantity',
    'warehouse_id',
  ])
  assert.equal(request.quantity, '3.25')
  assert.equal(request.note, 'corrected')
  assert.equal(request.new_lot_no, 'FG-NEW-01')
})

test('rework draft edit preserves source identity outside the request', () => {
  const action = OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_INTAKE
  const request = normalizeProductionFactDraftSaveRequest(action, {
    id: 8,
    expected_version: 1,
    fact_no: 'RW-8',
    quantity: '1.125000',
    occurred_at: '2026-08-09T10:00:00.000Z',
    reason: '返修车缝',
  })
  assert.equal(request.quantity, '1.125')
  assert.equal(Object.hasOwn(request, 'source_id'), false)
  assert.throws(
    () =>
      normalizeProductionFactDraftSaveRequest(action, {
        ...request,
        source_id: 99,
      }),
    /草稿内容/u
  )
})

test('outsourcing return draft accepts exactly one inbound lot intent', () => {
  const action = OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_RETURN_RECEIPT
  assert.equal(
    normalizeOutsourcingFactDraftSaveRequest(action, {
      id: 3,
      expected_version: 4,
      warehouse_id: 2,
      new_lot_no: 'OUT-RR-01',
      quantity: '5',
      occurred_at: '2026-08-09T11:00:00Z',
    }).new_lot_no,
    'OUT-RR-01'
  )
  assert.throws(() =>
    normalizeOutsourcingFactDraftSaveRequest(action, {
      id: 3,
      expected_version: 4,
      warehouse_id: 2,
      lot_id: 6,
      new_lot_no: 'OUT-RR-01',
      quantity: '5',
      occurred_at: '2026-08-09T11:00:00Z',
    })
  )
})

test('draft save result requires exact identity and next content version', () => {
  const action = OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION
  const request = {
    id: 18,
    expected_version: 2,
    warehouse_id: 7,
    lot_id: 9,
    quantity: '3.25',
    occurred_at: '2026-08-09T09:30:00.000Z',
  }
  const result = {
    ...original,
    version: 3,
    warehouse_id: 7,
    lot_id: 9,
    quantity: '3.250000',
    occurred_at: Math.floor(new Date(request.occurred_at).getTime() / 1000),
  }
  assert.equal(
    validateOperationalFactDraftSaveResult(result, request, original, action),
    result
  )
  assert.throws(() =>
    validateOperationalFactDraftSaveResult(
      { ...result, source_line_id: 99 },
      request,
      original,
      action
    )
  )
})

test('form values restore existing lot and local operator fields', () => {
  const values = operationalFactDraftFormValues(original)
  assert.equal(values.lot_selection, 'EXISTING')
  assert.equal(values.lot_id, 5)
  assert.equal(values.quantity, '2.5')
  assert.equal(values.note, 'before')
})
