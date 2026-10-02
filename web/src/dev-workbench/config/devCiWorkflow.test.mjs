import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCiJobTimeline } from './devCiWorkflow.mjs'

const origin = Date.parse('2026-10-02T00:00:00.000Z')
const job = (id, start, end) => ({
  id,
  name: `Job ${id}`,
  status: 'completed',
  startedAt: new Date(origin + start).toISOString(),
  finishedAt: new Date(origin + end).toISOString(),
  durationMs: 999_999,
  queueMs: null,
})

test('timeline preserves actual overlap and uses timestamps rather than reported durations', () => {
  const result = buildCiJobTimeline([
    job(3, 20, 30),
    job(1, 0, 20),
    job(2, 5, 15),
  ])
  assert.equal(result.spanMs, 30)
  assert.equal(result.peak, 2)
  assert.deepEqual(
    result.rows.map((row) => [row.id, row.offsetMs, row.elapsedMs]),
    [
      [1, 0, 20],
      [2, 5, 10],
      [3, 20, 10],
    ]
  )
  assert.equal(result.rows[1].leftPercent, (5 / 30) * 100)
  assert.equal(result.excludedCount, 0)
})

test('touching boundaries and zero-duration records do not inflate concurrency', () => {
  const result = buildCiJobTimeline([
    job(1, 0, 10),
    job(2, 10, 20),
    job(3, 10, 10),
  ])
  assert.equal(result.peak, 1)
  assert.equal(result.rows[2].elapsedMs, 0)
})

test('identical intervals count independently', () => {
  assert.equal(
    buildCiJobTimeline([job(1, 0, 10), job(2, 0, 10), job(3, 0, 10)]).peak,
    3
  )
})

test('missing, running and reversed intervals remain outside the measured window', () => {
  const result = buildCiJobTimeline([
    job(1, 0, 20),
    { ...job(2, 5, 10), finishedAt: null },
    { ...job(3, 5, 10), startedAt: null },
    job(4, 30, 10),
    { ...job(5, 5, 10), startedAt: 'invalid' },
    { ...job(6, 5, 10), status: 'in-progress' },
  ])
  assert.equal(result.rows.length, 1)
  assert.equal(result.excludedCount, 5)
  assert.equal(result.spanMs, 20)
})

test('empty and absent timestamps do not fabricate an interval', () => {
  assert.deepEqual(buildCiJobTimeline(), {
    rows: [],
    excludedCount: 0,
    spanMs: null,
    peak: null,
  })
  assert.deepEqual(buildCiJobTimeline([{ id: 1 }]), {
    rows: [],
    excludedCount: 1,
    spanMs: null,
    peak: null,
  })
})

test('zero-span records have finite coordinates without fabricated elapsed time', () => {
  const result = buildCiJobTimeline([job(1, 10, 10)])
  assert.equal(result.spanMs, 0)
  assert.equal(result.peak, 0)
  assert.equal(result.rows[0].leftPercent, 0)
  assert.equal(result.rows[0].widthPercent, 0)
})
