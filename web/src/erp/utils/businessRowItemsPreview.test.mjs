import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE,
  BUSINESS_ROW_ITEMS_PREVIEW_LIMIT,
  businessRowItemsCacheKey,
  businessRowEmbeddedItemsSnapshot,
  businessRowItemsModalPage,
  isBusinessRowItemsResultComplete,
  normalizeBusinessRowItemsResult,
} from './businessRowItemsPreview.mjs'

test('business row item preview uses a stable id and version cache boundary', () => {
  assert.equal(BUSINESS_ROW_ITEMS_PREVIEW_LIMIT, 5)
  assert.equal(businessRowItemsCacheKey({ id: 17, version: 3 }), '17:3')
  assert.equal(
    businessRowItemsCacheKey({ id: 17, version: 4, updated_at: 99 }),
    '17:4'
  )
  assert.equal(businessRowItemsCacheKey({ id: 17, updated_at: 99 }), '17:99')
  assert.equal(
    businessRowItemsCacheKey(
      { id: 17, version: 'B-02', preview_epoch: 6 },
      { versionFields: ['preview_epoch', 'version'] }
    ),
    '17:6'
  )
})

test('business row item preview rejects records without a usable identity', () => {
  for (const record of [null, {}, { id: null }, { id: '' }]) {
    assert.throws(() => businessRowItemsCacheKey(record), /明细数据不完整/)
  }
})

test('business row item preview normalizes complete and truncated results', () => {
  const complete = normalizeBusinessRowItemsResult([{ id: 1 }, { id: 2 }])
  assert.deepEqual(complete, {
    items: [{ id: 1 }, { id: 2 }],
    total: 2,
  })
  assert.equal(isBusinessRowItemsResultComplete(complete), true)

  const truncated = normalizeBusinessRowItemsResult({
    items: [{ id: 1 }],
    total: 7,
  })
  assert.equal(isBusinessRowItemsResultComplete(truncated), false)
})

test('business row item preview rejects malformed result totals', () => {
  for (const result of [
    null,
    {},
    { items: null, total: 0 },
    { items: [], total: -1 },
    { items: [], total: 1.5 },
    { items: [{ id: 1 }], total: 0 },
  ]) {
    assert.throws(
      () => normalizeBusinessRowItemsResult(result),
      /明细数据不完整/
    )
  }
})

test('embedded item snapshots keep a five-row preview and complete modal data', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }))
  const snapshot = businessRowEmbeddedItemsSnapshot(items)

  assert.equal(snapshot.all.items, items)
  assert.equal(snapshot.all.total, 7)
  assert.deepEqual(
    snapshot.preview.items.map((item) => item.id),
    [1, 2, 3, 4, 5]
  )
  assert.equal(snapshot.preview.total, 7)
  assert.deepEqual(businessRowEmbeddedItemsSnapshot(null), {
    all: { items: [], total: 0 },
    preview: { items: [], total: 0 },
  })
})

test('business row item modal pagination clamps pages without losing items', () => {
  const items = Array.from(
    { length: BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE + 3 },
    (_, index) => ({ id: index + 1 })
  )
  assert.deepEqual(
    businessRowItemsModalPage(items, 2).items.map((item) => item.id),
    [21, 22, 23]
  )
  assert.equal(businessRowItemsModalPage(items, 99).page, 2)
  assert.equal(businessRowItemsModalPage(items, -1).page, 1)
  assert.deepEqual(businessRowItemsModalPage([], 3), {
    items: [],
    page: 1,
    pageCount: 1,
    pageSize: BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE,
  })
})
