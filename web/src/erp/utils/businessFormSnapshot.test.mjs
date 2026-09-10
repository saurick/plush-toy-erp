import test from 'node:test'
import assert from 'node:assert/strict'
import { businessFormSnapshot } from './businessFormSnapshot.mjs'

test('form snapshots ignore object key order but retain item order and cleared values', () => {
  const initial = {
    note: '订单',
    items: [
      { id: 1, quantity: '2' },
      { id: 2, quantity: '3' },
    ],
  }
  assert.equal(
    businessFormSnapshot(initial),
    businessFormSnapshot({
      items: [
        { quantity: '2', id: 1 },
        { quantity: '3', id: 2 },
      ],
      note: '订单',
    })
  )
  assert.notEqual(
    businessFormSnapshot(initial),
    businessFormSnapshot({ ...initial, items: [...initial.items].reverse() })
  )
  assert.notEqual(
    businessFormSnapshot(initial),
    businessFormSnapshot({ ...initial, note: '' })
  )
  assert.notEqual(
    businessFormSnapshot(initial),
    businessFormSnapshot({
      ...initial,
      items: [{ id: 1, quantity: '4' }, initial.items[1]],
    })
  )
  assert.equal(
    businessFormSnapshot({ note: undefined }),
    businessFormSnapshot({})
  )
  assert.equal(
    businessFormSnapshot({ note: '', items: [{ position: '' }] }),
    businessFormSnapshot({ items: [{}] }),
    'typing and clearing an initially blank field returns to the original form'
  )
})
