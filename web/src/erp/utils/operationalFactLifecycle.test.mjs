import assert from 'node:assert/strict'
import test from 'node:test'

import {
  matchesOperationalFactLifecycleResult,
  normalizeOperationalFactLifecycleRequest,
  validateOperationalFactLifecycleResult,
} from './operationalFactLifecycle.mjs'

test('operational fact lifecycle request keeps only the strict CAS intent', () => {
  assert.deepEqual(
    normalizeOperationalFactLifecycleRequest({
      id: 7,
      expected_version: 3,
      customer_key: ' yoyoosun ',
      ignored: 'not forwarded',
    }),
    { id: 7, expected_version: 3, customer_key: 'yoyoosun' }
  )
  assert.deepEqual(
    normalizeOperationalFactLifecycleRequest(
      {
        id: 7,
        expected_version: 3,
        reason: '  来源业务撤销  ',
      },
      { requireReason: true }
    ),
    { id: 7, expected_version: 3, reason: '来源业务撤销' }
  )
  for (const params of [
    {},
    { id: '7', expected_version: 3 },
    { id: 7, expected_version: '3' },
    { id: 7, expected_version: 0 },
    { id: 7.5, expected_version: 3 },
  ]) {
    assert.throws(
      () => normalizeOperationalFactLifecycleRequest(params),
      TypeError
    )
  }
  assert.throws(
    () =>
      normalizeOperationalFactLifecycleRequest(
        { id: 7, expected_version: 3, reason: ' ' },
        { requireReason: true }
      ),
    TypeError
  )
})

test('operational fact lifecycle readback requires version and actor audit', () => {
  const postRequest = { id: 7, expected_version: 3 }
  const posted = {
    id: 7,
    status: 'POSTED',
    version: 4,
    posted_at: 1_700_000_000,
    posted_by: 11,
  }
  assert.equal(
    matchesOperationalFactLifecycleResult(posted, postRequest, 'POSTED'),
    true
  )
  assert.equal(
    validateOperationalFactLifecycleResult(posted, postRequest, 'POSTED'),
    posted
  )

  const cancelRequest = {
    id: 7,
    expected_version: 4,
    reason: '来源业务撤销',
  }
  const cancelled = {
    ...posted,
    status: 'CANCELLED',
    version: 5,
    cancelled_at: 1_700_000_100,
    cancelled_by: 12,
    cancel_reason: '来源业务撤销',
  }
  assert.equal(
    matchesOperationalFactLifecycleResult(
      cancelled,
      cancelRequest,
      'CANCELLED'
    ),
    true
  )
  for (const changed of [
    { ...cancelled, version: 4 },
    { ...cancelled, cancelled_by: null },
    { ...cancelled, cancel_reason: '改写原因' },
  ]) {
    assert.equal(
      matchesOperationalFactLifecycleResult(
        changed,
        cancelRequest,
        'CANCELLED'
      ),
      false
    )
    assert.throws(
      () =>
        validateOperationalFactLifecycleResult(
          changed,
          cancelRequest,
          'CANCELLED'
        ),
      (error) => error?.isInvalidResponse === true
    )
  }
})
