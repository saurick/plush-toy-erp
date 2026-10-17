import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

import {
  buildOutsourcingReturnQualityInspectionPayload,
  buildPurchaseReturnFromQualityInspectionPayload,
  canCreatePurchaseReturnFromRejectedInspection,
  canCreatePurchaseRejectionDispositionFromInspection,
  groupOutsourcingReturnQualityInspections,
  isMatchingOutsourcingReturnQualityInspection,
  isPostedOutsourcingReturn,
  isQualityInspectionRouteSourceCompatible,
  isRejectedIncomingInspection,
  OUTSOURCING_RETURN_QUALITY_GATE_STATES,
  qualityInspectionRouteSourceParams,
  resolveOutsourcingReturnQualityGate,
} from './qualityInspectionSourceAction.mjs'

test('quality source checks keep receipt, inspection and fact status contracts independent', async (t) => {
  const file = new URL('./qualityInspectionSourceAction.mjs?independent-statuses', import.meta.url)
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === file.href && specifier.endsWith('/statuses.generated.mjs')) {
        return { url: new URL('../../../scripts/test/statusOwnershipFixture.mjs', import.meta.url).href, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
  t.after(() => hook.deregister())
  const consumer = await import(file.href)
  const inspection = {
    id: 1,
    status: 'QUALITY_REJECTED',
    result: 'REJECT',
    source_type: 'PURCHASE_RECEIPT',
    inspection_type: 'INCOMING',
    purchase_receipt_id: 2,
    purchase_receipt_item_id: 3,
  }
  assert.equal(consumer.isRejectedIncomingInspection(inspection), true)
  assert.equal(consumer.canCreatePurchaseReturnFromRejectedInspection(inspection, { id: 2, status: 'RECEIPT_POSTED', items: [{ id: 3, posted: true }] }), true)
  assert.equal(consumer.canCreatePurchaseReturnFromRejectedInspection(inspection, { id: 2, status: 'FACT_POSTED' }), false)
  assert.equal(consumer.isPostedOutsourcingReturn({ id: 4, fact_type: 'RETURN_RECEIPT', status: 'FACT_POSTED' }), true)
  assert.equal(consumer.isPostedOutsourcingReturn({ id: 4, fact_type: 'RETURN_RECEIPT', status: 'RECEIPT_POSTED' }), false)
})

test('quality inspection route source compatibility follows inspection grain', () => {
  for (const [inspectionType, sourceType, expected] of [
    ['', 'SHIPMENT', true],
    ['', 'UNKNOWN_SOURCE', true],
    ['INCOMING', 'PURCHASE_RECEIPT', true],
    ['INCOMING', 'SHIPMENT', false],
    ['FINISHED_GOODS', 'SHIPMENT', true],
    ['FINISHED_GOODS', 'PURCHASE_RECEIPT', false],
    ['OUTSOURCING_RETURN', 'OUTSOURCING_FACT', true],
    ['OUTSOURCING_RETURN', 'SHIPMENT', false],
    ['PRODUCTION_STAGE', 'PRODUCTION_WIP', false],
    ['UNKNOWN_TYPE', 'SHIPMENT', false],
  ]) {
    assert.equal(
      isQualityInspectionRouteSourceCompatible(inspectionType, sourceType),
      expected,
      `${inspectionType || 'blank'} should ${expected ? '' : 'not '}accept ${sourceType}`
    )
  }
})

test('quality inspection route source params preserve exact grain and translate outsourcing fact', () => {
  assert.deepEqual(
    qualityInspectionRouteSourceParams({
      inspectionType: '',
      sourceType: 'shipment',
      sourceID: '41',
    }),
    { source_type: 'SHIPMENT', source_id: 41 }
  )
  assert.deepEqual(
    qualityInspectionRouteSourceParams({
      inspectionType: 'OUTSOURCING_RETURN',
      sourceType: 'OUTSOURCING_FACT',
      sourceID: '42',
    }),
    { fact_id: 42 }
  )
  assert.deepEqual(
    qualityInspectionRouteSourceParams({
      inspectionType: 'OUTSOURCING_RETURN',
      sourceType: 'SHIPMENT',
      sourceID: 43,
    }),
    {}
  )
  assert.deepEqual(
    qualityInspectionRouteSourceParams({
      inspectionType: 'PRODUCTION_STAGE',
      sourceType: 'PRODUCTION_WIP',
      sourceID: 44,
    }),
    {}
  )
})

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
      items: [{ id: 62, posted: true }],
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

test('corrected outsourcing inspection replaces the superseded rejection', () => {
  const previous = {
    status: 'REJECTED',
    result: 'REJECT',
    superseded_at: 1720000000,
  }
  const replacement = { status: 'PASSED', result: 'PASS' }
  assert.equal(
    resolveOutsourcingReturnQualityGate([previous, replacement]).state,
    'ACCEPTED'
  )
  assert.equal(
    resolveOutsourcingReturnQualityGate([previous, { status: 'CANCELLED' }])
      .state,
    'PENDING'
  )
})

test('mixed incoming quality uses the exact receipt line to choose disposition', () => {
 const inspection = { id: 1, status: 'REJECTED', result: 'REJECT', source_type: 'PURCHASE_RECEIPT', inspection_type: 'INCOMING', purchase_receipt_id: 2, purchase_receipt_item_id: 3 }
 const receipt = { id: 2, status: 'POSTED', items: [{ id: 3, posted: false }, { id: 4, posted: true }] }
 assert.equal(canCreatePurchaseReturnFromRejectedInspection(inspection, receipt), false)
 assert.equal(canCreatePurchaseRejectionDispositionFromInspection(inspection, receipt), true)
 const posted = { ...receipt, items: [{ id: 3, posted: true }] }
 assert.equal(canCreatePurchaseReturnFromRejectedInspection(inspection, posted), true)
 assert.equal(canCreatePurchaseRejectionDispositionFromInspection(inspection, posted), false)
 assert.equal(canCreatePurchaseRejectionDispositionFromInspection(inspection, { ...receipt, status: 'CANCELLED' }), false)
})
