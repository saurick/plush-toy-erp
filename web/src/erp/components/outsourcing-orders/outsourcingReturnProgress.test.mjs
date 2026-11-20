import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOutsourcingReturnProgress, outsourcingReturnProgressLines } from './outsourcingReturnProgress.mjs'

const order = { id: 1, lifecycle_status: 'confirmed' }
const line = {
  id: 11,
outsourcing_order_id: 1,
subject_type: 'PRODUCT',
  outsourcing_quantity: '1200',
line_status: 'open',
unit_id: 1,
unit_name_snapshot: '个',
}
const secondLine = {
  ...line, id: 12, outsourcing_quantity: '7.125', unit_id: 2, unit_name_snapshot: '套',
}
const receipt = {
  id: 21,
source_id: 1,
source_line_id: 11,
unit_id: 1,
quantity: '450',
  fact_type: 'RETURN_RECEIPT',
status: 'POSTED',
source_type: 'OUTSOURCING_ORDER',
  returned_to_vendor_quantity: '50',
}
const pending = { ...receipt, id: 22, quantity: '500', returned_to_vendor_quantity: '0' }
const otherUnit = { ...receipt, id: 23, source_line_id: 12, unit_id: 2, quantity: '1.125', returned_to_vendor_quantity: '0' }
const qualityByFactID = {
  21: [{ status: 'PASSED', result: 'PASS' }],
  22: [{ status: 'SUBMITTED' }],
  23: [{ status: 'PASSED', result: 'CONCESSION' }],
}

test('confirmed returns use net quantities and keep units and quality batches distinct', () => {
  const data = buildOutsourcingReturnProgress(order, [line, secondLine], [
    receipt, pending, otherUnit,
    { ...receipt, id: 31, status: 'DRAFT' },
    { ...receipt, id: 32, status: 'CANCELLED' },
    { ...receipt, id: 33, fact_type: 'MATERIAL_ISSUE' },
    { ...receipt, id: 34, source_id: 2 },
  ], { fullWarehouseScope: true, qualityByFactID })

  assert.deepEqual(data.batches.map(({ fact, effective }) => [fact.id, effective]), [[21, '400'], [22, '500'], [23, '1.125']])
  assert.equal(data.planned, '1200 个 / 7.125 套')
  assert.equal(data.returned, '900 个 / 1.125 套')
  assert.equal(data.remaining, '300 个 / 6 套')
  assert.equal(data.attention.fact.id, 22)
  assert.equal(data.attention.quality.label, '质检中')
})

test('restricted warehouse scope or an unmatched return cannot yield a whole-contract balance', () => {
  const scoped = buildOutsourcingReturnProgress(order, [line], [receipt], { fullWarehouseScope: false })
  assert.equal(scoped.returned, '400 个')
  assert.equal(scoped.remaining, '—')
  assert.equal(scoped.batches[0].quality, null)
  assert.equal(scoped.attention, null)

  const unmatched = buildOutsourcingReturnProgress(order, [line], [
    { ...receipt, source_line_id: null },
  ], { fullWarehouseScope: true, unitOptions: [{ value: 1, label: '个' }] })
  assert.equal(unmatched.returned, '400 个')
  assert.equal(unmatched.remaining, '—')
  assert.equal(unmatched.canReconcile, false)
})

test('ordinary progress excludes material, canceled and production-stage lines and retains terminal returns', () => {
  assert.deepEqual(outsourcingReturnProgressLines(order, [
    line, { ...line, id: 20, subject_type: 'MATERIAL' },
    { ...line, id: 21, line_status: 'canceled' },
    { ...line, id: 22, production_wip_batch_id: 6 },
  ]).map(({ id }) => id), [line.id])
  assert.deepEqual(outsourcingReturnProgressLines({ ...order, source_wip_batch_id: 6 }, [line]), [])

  const closed = buildOutsourcingReturnProgress({ ...order, lifecycle_status: 'closed' }, [line], [receipt], {
    fullWarehouseScope: true, qualityByFactID: {},
  })
  assert.equal(closed.returned, '400 个')
  assert.equal(closed.remaining, '—')
  assert.equal(closed.attention, null)
  assert.equal(closed.batches[0].quality.label, '待发起质检')
})

test('a fully returned-to-vendor batch stays traceable without being a current quality blocker', () => {
  const data = buildOutsourcingReturnProgress(order, [line], [
    { ...receipt, returned_to_vendor_quantity: receipt.quantity }, pending,
  ], {
    fullWarehouseScope: true,
    qualityByFactID: { ...qualityByFactID, 21: [{ status: 'REJECTED', result: 'REJECT' }] },
  })
  assert.equal(data.batches[0].quality.label, '质检不合格')
  assert.equal(data.batches[0].effective, '0')
  assert.equal(data.qualityIssueCount, 1)
  assert.equal(data.attention.fact.id, 22)
  assert.equal(data.remaining, '700 个')
})
