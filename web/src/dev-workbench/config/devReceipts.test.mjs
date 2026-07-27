import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterDevReceiptsForArea,
  summarizeDevReceiptEvidence,
} from './devReceipts.mjs'
import { DEV_WORKBENCH_AREA_KEYS } from './devRoutes.mjs'

const item = (gate, freshness, status, finishedAt) => ({
  freshness,
  receipt: { gate, status, finishedAt },
})

test('receipt projection keeps only registered gates for each workbench area', () => {
  const receipts = [
    item('target-release', 'current', 'passed', '2026-07-28T03:00:00Z'),
    item('full', 'historical', 'passed', '2026-07-28T02:00:00Z'),
    item('strict', 'current', 'failed', '2026-07-28T01:00:00Z'),
    item('arbitrary', 'current', 'passed', '2026-07-28T04:00:00Z'),
  ]
  assert.deepEqual(
    filterDevReceiptsForArea(
      receipts,
      DEV_WORKBENCH_AREA_KEYS.quality
    ).map((entry) => entry.receipt.gate),
    ['strict', 'full']
  )
  assert.deepEqual(
    filterDevReceiptsForArea(
      receipts,
      DEV_WORKBENCH_AREA_KEYS.delivery
    ).map((entry) => entry.receipt.gate),
    ['target-release', 'strict', 'full'].filter((gate) => gate !== 'full')
  )
})

test('receipt summary never upgrades historical or blocked evidence to current green', () => {
  const summary = summarizeDevReceiptEvidence(
    {
      receipts: [
        item('full', 'historical', 'passed', '2026-07-28T02:00:00Z'),
        item('strict', 'current', 'blocked', '2026-07-28T03:00:00Z'),
        item('browser', 'current', 'passed', '2026-07-28T04:00:00Z'),
      ],
    },
    DEV_WORKBENCH_AREA_KEYS.quality
  )
  assert.equal(summary.currentPassed.length, 1)
  assert.equal(summary.blockers.length, 1)
  assert.equal(summary.historical.length, 1)
})
