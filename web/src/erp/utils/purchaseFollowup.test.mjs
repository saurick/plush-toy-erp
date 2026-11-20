import assert from 'node:assert/strict'
import test from 'node:test'
import {
  purchaseFollowupPageChange,
  purchaseFollowupParams,
} from './purchaseFollowup.mjs'
import {
  purchaseMaterialMatchesSupplier,
  purchaseMaterialOption,
} from './purchaseMaterialSupplier.mjs'

test('supplier-bound identities cannot be selected for another factory; shared catalog entries remain available', () => {
  assert.equal(purchaseMaterialMatchesSupplier({ supplier_id: 3 }, 2), false)
  assert.equal(purchaseMaterialMatchesSupplier({ supplier_id: 3 }, '3'), true)
  assert.equal(purchaseMaterialMatchesSupplier({ supplier_id: null }, 2), true)
  const wrong = purchaseMaterialOption(
    { id: 1, name: '绒布', supplier_id: 3, supplier_item_no: 'A-1' },
    2
  )
  assert.equal(wrong.disabled, true)
  assert.match(wrong.label, /A-1.*其他厂商/)
})
test('filter changes reset paging while next page keeps the server filter', () => {
  const prior = { filter: 'overdue', page: 8, confirmation: 'confirmed' }
  const next = purchaseFollowupPageChange(prior, {
    filter: 'pending_inspection',
  })
  assert.equal(next.page, 1)
  const params = purchaseFollowupParams(
    { ...next, page: 2 },
    { supplierID: '8', keyword: '测试', orderID: '4' }
  )
  assert.deepEqual(params, {
    kind: 'pending_inspection',
    confirmation: 'all',
    start_date: '',
    selected_date: '',
    keyword: '测试',
    supplier_id: 8,
    order_id: 4,
    limit: 25,
    offset: 25,
  })
})

test('closing the calendar clears hidden date filters and keeps unrelated followups', () => {
  const dateState = {
    calendarOpen: true,
    filter: 'date',
    selectedDate: '2026-11-06',
    confirmation: 'confirmed',
    page: 4,
  }
  const closed = purchaseFollowupPageChange(dateState, { calendarOpen: false })
  assert.equal(closed.filter, 'all')
  assert.equal(closed.selectedDate, '')
  assert.equal(closed.confirmation, 'all')
  assert.equal(closed.page, 1)
  const rejected = purchaseFollowupPageChange(dateState, { filter: 'rejected' })
  assert.equal(rejected.confirmation, 'all')
  assert.equal(rejected.selectedDate, '')
  assert.equal(
    purchaseFollowupPageChange(rejected, { calendarOpen: false }).filter,
    'rejected'
  )
  assert.equal(
    purchaseFollowupParams({ confirmation: 'confirmed' }).confirmation,
    'all'
  )
  assert.equal(
    purchaseFollowupParams({ calendarOpen: true, confirmation: 'confirmed' })
      .confirmation,
    'confirmed'
  )
})
