import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBusinessLineItemOrderEntries,
  businessLineItemOrderChanged,
  moveBusinessLineItem,
  orderedBusinessLineItems,
  repositionBusinessLineItem,
} from './businessLineItemOrder.mjs'

test('line item order keeps saved and draft rows distinct while moving', () => {
  const saved = { id: 7, name: '已保存' }
  const draft = { name: '新增' }
  const entries = buildBusinessLineItemOrderEntries([saved, draft])

  assert.equal(entries[0].key, 'saved-7-0')
  assert.equal(entries[1].key, 'draft-1')
  const moved = moveBusinessLineItem(entries, entries[1].key, -1)

  assert.deepEqual(orderedBusinessLineItems(moved), [draft, saved])
  assert.equal(businessLineItemOrderChanged(moved), true)
  assert.deepEqual(orderedBusinessLineItems(entries), [saved, draft])
})

test('line item order clamps top and bottom moves without losing rows', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const entries = buildBusinessLineItemOrderEntries(items)

  const movedLast = repositionBusinessLineItem(entries, entries[0].key, 99)
  assert.deepEqual(orderedBusinessLineItems(movedLast), [
    items[1],
    items[2],
    items[0],
  ])

  const movedFirst = repositionBusinessLineItem(
    movedLast,
    movedLast[2].key,
    -99
  )
  assert.deepEqual(orderedBusinessLineItems(movedFirst), items)
  assert.equal(businessLineItemOrderChanged(movedFirst), false)
})
