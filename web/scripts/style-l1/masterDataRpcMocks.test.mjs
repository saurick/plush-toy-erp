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
