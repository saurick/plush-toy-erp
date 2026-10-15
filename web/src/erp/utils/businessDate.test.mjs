import assert from 'node:assert/strict'
import test from 'node:test'

import {
  currentBusinessDate,
  formatBusinessDate,
  unixSecondsToBusinessDate,
} from './businessDate.mjs'

test('formatBusinessDate uses the Shanghai business day by default', () => {
  assert.equal(
    formatBusinessDate(new Date('2026-08-10T16:30:00.000Z')),
    '2026-08-11'
  )
})

test('currentBusinessDate is deterministic with an injected clock value', () => {
  assert.equal(
    currentBusinessDate(new Date('2026-12-31T18:00:00.000Z')),
    '2027-01-01'
  )
})

test('unixSecondsToBusinessDate handles epoch values and invalid input', () => {
  assert.equal(unixSecondsToBusinessDate(0), '1970-01-01')
  assert.equal(
    unixSecondsToBusinessDate(Date.parse('2026-08-10T16:30:00.000Z') / 1000),
    '2026-08-11'
  )
  assert.equal(unixSecondsToBusinessDate('invalid'), '')
  assert.equal(unixSecondsToBusinessDate(null), '')
})
