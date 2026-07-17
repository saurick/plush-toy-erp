import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOutsourcingReturnQualityInspectionPayload,
  buildPurchaseReturnFromQualityInspectionPayload,
  canCreatePurchaseReturnFromRejectedInspection,
  groupOutsourcingReturnQualityInspections,
  isMatchingOutsourcingReturnQualityInspection,
  isPostedOutsourcingReturn,
  isRejectedIncomingInspection,
  OUTSOURCING_RETURN_QUALITY_GATE_STATES,
  resolveOutsourcingReturnQualityGate,
} from './qualityInspectionSourceAction.mjs'

test('outsourcing return quality payload keeps source grain server-derived', () => {
  const fact = {
    id: 41,
    fact_type: 'RETURN_RECEIPT',
    status: 'POSTED',
  }
  assert.equal(isPostedOutsourcingReturn(fact), true)
  assert.deepEqual(
    buildOutsourcingReturnQualityInspectionPayload(
      {
        inspection_no: ' QI-OUT-41 ',
        note: ' 回货抽检 ',
        fact_id: 999,
        inventory_lot_id: 998,
        subject_id: 997,
      },
      fact,
      ' yoyoosun '
    ),
    {
      customer_key: 'yoyoosun',
      fact_id: 41,
      inspection_no: 'QI-OUT-41',
      note: '回货抽检',
    }
  )
  assert.equal(isPostedOutsourcingReturn({ ...fact, status: 'DRAFT' }), false)
})

test('outsourcing return quality result and related-record grouping stay source-bound', () => {
  const facts = [
    { id: 41, fact_type: 'RETURN_RECEIPT', status: 'POSTED' },
    { id: 42, fact_type: 'RETURN_RECEIPT', status: 'CANCELLED' },
  ]
  const matching = {
    id: 71,
    source_type: 'OUTSOURCING_FACT',
    source_id: 41,
    inspection_type: 'OUTSOURCING_RETURN',
    subject_type: 'PRODUCT',
    status: 'DRAFT',
  }
  assert.equal(
    isMatchingOutsourcingReturnQualityInspection(matching, facts[0]),
    true
  )
  assert.equal(
    isMatchingOutsourcingReturnQualityInspection(
      { ...matching, source_id: 42 },
      facts[0]
    ),
    false
  )
  assert.deepEqual(
    groupOutsourcingReturnQualityInspections(
      [
        matching,
        { ...matching, id: 72, source_id: 42 },
        { ...matching, id: 73, source_type: 'PURCHASE_RECEIPT' },
      ],
      facts
    ),
    { 41: [matching] }
  )
})

test('outsourcing return payable quality gate matches the backend active inspection rule', () => {
  const pending = resolveOutsourcingReturnQualityGate([])
  assert.equal(pending.state, OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING)
  assert.equal(pending.label, '待发起质检')

  for (const [status, result, label] of [
    ['DRAFT', '', '质检草稿'],
    ['SUBMITTED', '', '质检中'],
  ]) {
    const gate = resolveOutsourcingReturnQualityGate([{ status, result }])
    assert.equal(gate.state, OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING)
    assert.equal(gate.label, label)
  }

  for (const [result, label] of [
    ['PASS', '质检合格'],
    ['CONCESSION', '让步接收'],
  ]) {
    const gate = resolveOutsourcingReturnQualityGate([
      { status: 'PASSED', result },
    ])
    assert.equal(gate.state, OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED)
    assert.equal(gate.label, label)
  }

  const rejected = resolveOutsourcingReturnQualityGate([
    { status: 'REJECTED', result: 'REJECT' },
  ])
  assert.equal(rejected.state, OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED)
  assert.equal(rejected.label, '质检不合格')

  const cancelledOnly = resolveOutsourcingReturnQualityGate([
    { status: 'CANCELLED', result: '' },
  ])
  assert.equal(
    cancelledOnly.state,
    OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING
  )
  const ambiguous = resolveOutsourcingReturnQualityGate([
    { status: 'PASSED', result: 'PASS' },
    { status: 'SUBMITTED', result: '' },
  ])
  assert.equal(ambiguous.state, OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING)
  assert.equal(ambiguous.label, '质检状态待核对')
})

test('quality rejection return payload keeps supplier and inventory grain server-derived', () => {
  const inspection = {
    id: 71,
    status: 'REJECTED',
    result: 'REJECT',
    source_type: 'PURCHASE_RECEIPT',
    inspection_type: 'INCOMING',
    purchase_receipt_id: 61,
    purchase_receipt_item_id: 62,
  }
  assert.equal(isRejectedIncomingInspection(inspection), true)
  const payload = buildPurchaseReturnFromQualityInspectionPayload(
    {
      return_no: ' RET-QI-71 ',
      quantity: '2.500000',
      returned_at: '2026-07-14T12:30',
      reason: ' 来料不合格 ',
      note: ' 退回供应商 ',
      material_id: 999,
      warehouse_id: 998,
      lot_id: 997,
      supplier_id: 996,
    },
    inspection,
    'yoyoosun'
  )
  assert.deepEqual(Object.keys(payload).sort(), [
    'customer_key',
    'note',
    'quality_inspection_id',
    'quantity',
    'reason',
    'return_no',
    'returned_at',
  ])
  assert.equal(payload.quality_inspection_id, 71)
  assert.equal(payload.quantity, '2.500000')
  assert.equal(payload.reason, '来料不合格')
  assert.equal(payload.returned_at, new Date('2026-07-14T12:30').toISOString())
})

test('quality rejection return eligibility and business fields are strict', () => {
  const base = {
    id: 71,
    status: 'REJECTED',
    result: 'REJECT',
    source_type: 'PURCHASE_RECEIPT',
    inspection_type: 'INCOMING',
    purchase_receipt_id: 61,
    purchase_receipt_item_id: 62,
  }
  assert.equal(isRejectedIncomingInspection({ ...base, result: 'PASS' }), false)
  assert.equal(
    isRejectedIncomingInspection({ ...base, source_type: 'OUTSOURCING_FACT' }),
    false
  )
  assert.equal(
    canCreatePurchaseReturnFromRejectedInspection(base, {
      id: 61,
      status: 'POSTED',
    }),
    true
  )
  assert.equal(
    canCreatePurchaseReturnFromRejectedInspection(base, {
      id: 61,
      status: 'DRAFT',
    }),
    false
  )
  assert.equal(
    canCreatePurchaseReturnFromRejectedInspection(base, {
      id: 999,
      status: 'POSTED',
    }),
    false
  )
  assert.throws(() =>
    buildPurchaseReturnFromQualityInspectionPayload(
      {
        return_no: 'RET-QI-71',
        quantity: '0',
        returned_at: '2026-07-14T12:30',
        reason: '来料不合格',
      },
      base
    )
  )
})
