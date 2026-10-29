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
    'exceptions',
    { ...next, page: 2 },
    { supplierID: '8', keyword: '测试', orderID: '4' }
  )
  assert.deepEqual(params, {
    view: 'exceptions',
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
