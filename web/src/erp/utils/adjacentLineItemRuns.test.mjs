import assert from 'node:assert/strict'
import test from 'node:test'
import { adjacentLineItemRuns } from './adjacentLineItemRuns.mjs'

test('adjacent identities group without sorting, merging quantities or losing original indices', () => {
  const items = [
    { product: 1, sku: 2, unit: '个', quantity: 40 },
    { product: 1, sku: 3, unit: '个', quantity: 30 },
    { product: 1, sku: 3, unit: '箱', quantity: 5 },
    { product: 2, quantity: 20 },
    { product: 1, quantity: 10 },
    {}, {},
  ]
  const before = structuredClone(items)
  assert.deepEqual(adjacentLineItemRuns(items, (item) => item.product), [
    { key: 1, start: 0, count: 3 },
    { key: 2, start: 3, count: 1 },
    { key: 1, start: 4, count: 1 },
    { key: undefined, start: 5, count: 1 },
    { key: undefined, start: 6, count: 1 },
  ])
  assert.deepEqual(items, before)
})

test('changing or clearing a line recalculates its runs without changing the row order', () => {
  const items = [{ product: 1 }, { product: 2 }, { product: 1 }]
  items[1].product = 1
  assert.deepEqual(adjacentLineItemRuns(items, (item) => item.product), [{ key: 1, start: 0, count: 3 }])
  items[1].product = undefined
  assert.deepEqual(adjacentLineItemRuns(items, (item) => item.product).map((run) => run.start), [0, 1, 2])
  assert.deepEqual(adjacentLineItemRuns([], (item) => item.product), [])
})
