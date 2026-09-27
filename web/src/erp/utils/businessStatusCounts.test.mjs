import test from 'node:test'
import assert from 'node:assert/strict'
import {
  businessStatusCount,
  resolveBusinessStatusCounts,
} from './businessStatusCounts.mjs'

test('status counts come from the complete backend projection, never the current page', () => {
  const counts = resolveBusinessStatusCounts({
    rows: [{ status: 'DRAFT' }],
    total: 1,
    status_counts: { DRAFT: 31, POSTED: 12 },
  })
  assert.equal(businessStatusCount(counts, ''), 43)
  assert.equal(businessStatusCount(counts, 'POSTED'), 12)
  assert.equal(businessStatusCount(counts, 'CANCELLED'), 0)
  assert.equal(
    businessStatusCount(
      resolveBusinessStatusCounts({ rows: [], total: 43 }),
      ''
    ),
    null
  )
  assert.equal(
    businessStatusCount(resolveBusinessStatusCounts({ status_counts: {} }), ''),
    0
  )
})

test('missing or malformed counts stay unknown rather than displaying a false zero', () => {
  for (const status_counts of [
    null,
    [],
    7,
    { DRAFT: -1 },
    { DRAFT: '3' },
    { DRAFT: 0.5 },
    { '': 1 },
    { DRAFT: Number.MAX_SAFE_INTEGER, POSTED: 1 },
  ]) {
    assert.equal(resolveBusinessStatusCounts({ status_counts }), null)
  }
})

test('an exact linked record is a complete singleton and has its own scope', () => {
  const response = { status_counts: { draft: 200 } }
  assert.deepEqual(
    resolveBusinessStatusCounts(response, {
      hasExactContext: true,
      exactRecord: { lifecycle_status: 'closed' },
      statusField: 'lifecycle_status',
    }),
    { closed: 1 }
  )
  assert.deepEqual(
    resolveBusinessStatusCounts(response, { hasExactContext: true }),
    {}
  )
  assert.equal(
    resolveBusinessStatusCounts(response, {
      hasExactContext: true,
      exactRecord: {},
    }),
    null
  )
})
