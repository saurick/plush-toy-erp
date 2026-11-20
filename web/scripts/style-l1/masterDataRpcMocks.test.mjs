import assert from 'node:assert/strict'
import test from 'node:test'

import { stylePaginatedMasterData } from './masterDataRpcMocks.mjs'

test('style master-data mock preserves requested full-read paging metadata', () => {
  const records = Array.from({ length: 205 }, (_, index) => ({ id: index + 1 }))

  const firstPage = stylePaginatedMasterData(records, 'materials', {
    limit: 200,
    offset: 0,
  })
  assert.equal(firstPage.limit, 200)
  assert.equal(firstPage.offset, 0)
  assert.equal(firstPage.total, 205)
  assert.equal(firstPage.materials.length, 200)

  const secondPage = stylePaginatedMasterData(records, 'materials', {
    limit: 200,
    offset: 200,
  })
  assert.equal(secondPage.limit, 200)
  assert.equal(secondPage.offset, 200)
  assert.equal(secondPage.total, 205)
  assert.deepEqual(
    secondPage.materials.map((record) => record.id),
    [201, 202, 203, 204, 205]
  )
})

test('style master-data mock treats a successful empty page as complete data', () => {
  assert.deepEqual(
    stylePaginatedMasterData([], 'materials', { limit: 200, offset: 0 }),
    {
      materials: [],
      total: 0,
      limit: 200,
      offset: 0,
    }
  )
})

test('material search filters before pagination and clears back to all candidates', () => {
  const records = [
    { id: 1, name: '面料', color: '米白', supplier_item_no: 'AB-001' },
    { id: 2, name: '面料', color: '灰', supplier_name: 'Sample Supplier' },
    { id: 3, name: '包装', note: '只在备注中出现的关键字' },
  ]
  const result = stylePaginatedMasterData(records, 'materials', { keyword: '面料', limit: 1, offset: 1 })
  assert.deepEqual(result, { materials: [records[1]], total: 2, limit: 1, offset: 1 })
  for (const [keyword, expected] of [['米白', 1], ['ab-001', 1], ['sample supplier', 2]]) {
    assert.deepEqual(stylePaginatedMasterData(records, 'materials', { keyword }).materials.map((record) => record.id), [expected])
  }
  for (const keyword of ['没有匹配材料', '只在备注中出现的关键字']) {
    assert.equal(stylePaginatedMasterData(records, 'materials', { keyword }).total, 0)
  }
  assert.equal(stylePaginatedMasterData(records, 'materials', { keyword: '' }).total, 3)
})
