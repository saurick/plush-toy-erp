import assert from 'node:assert/strict'
import test from 'node:test'

import { stylePaginatedRpcData } from './rpcMockResult.mjs'

test('style paginated RPC data preserves full-read limit and offset', () => {
  const records = Array.from({ length: 205 }, (_, index) => ({ id: index + 1 }))
  assert.deepEqual(
    stylePaginatedRpcData(records, 'records', { limit: 200, offset: 200 }, 50),
    {
      records: records.slice(200),
      total: 205,
      limit: 200,
      offset: 200,
    }
  )
})

test('style paginated RPC data normalizes invalid paging without losing metadata', () => {
  assert.deepEqual(
    stylePaginatedRpcData([{ id: 1 }], 'records', {
      limit: 500,
      offset: -1,
    }),
    {
      records: [{ id: 1 }],
      total: 1,
      limit: 100,
      offset: 0,
    }
  )
})
