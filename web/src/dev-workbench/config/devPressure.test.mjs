import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPressureNumber,
  normalizeDevPressureReports,
  readDevPressureReports,
} from './devPressure.mjs'

const empty = () => ({
  schemaVersion: 'plush.dev-pressure-reports/v1',
  reports: [],
  report: null,
  progress: null,
  invalidCount: 0,
})
test('empty pressure evidence does not fabricate zero latency or a passed result', () => {
  assert.deepEqual(normalizeDevPressureReports(empty()), empty())
  assert.equal(formatPressureNumber(null), '—')
  assert.equal(formatPressureNumber(0), '0')
  assert.throws(() =>
    normalizeDevPressureReports({ ...empty(), schemaVersion: 'unknown' })
  )
  assert.throws(() =>
    normalizeDevPressureReports({ ...empty(), report: { status: 'passed' } })
  )
  assert.throws(() =>
    normalizeDevPressureReports({
      ...empty(),
      progress: { phase: 'arbitrary' },
    })
  )
})
test('report client only reads the fixed API with a bounded report id and forwards cancellation', async () => {
  const calls = []
    const controller = new AbortController()
  const fetchImpl = async (...args) => {
    calls.push(args)
    return { ok: true, json: async () => empty() }
  }
  await readDevPressureReports({
    id: 'workbench-123',
    signal: controller.signal,
    fetchImpl,
  })
  assert.equal(
    calls[0][0],
    '/__dev/api/qa/testing/pressure-reports?id=workbench-123'
  )
  assert.equal(calls[0][1].signal, controller.signal)
  assert.equal(calls[0][1].credentials, 'same-origin')
  await assert.rejects(
    readDevPressureReports({ id: '../../secret', fetchImpl })
  )
  assert.equal(calls.length, 1)
  await assert.rejects(
    readDevPressureReports({ fetchImpl: async () => ({ ok: false }) })
  )
})
