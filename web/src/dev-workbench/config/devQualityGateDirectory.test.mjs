import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeQualityGateTestDirectory,
  readQualityGateTestDirectory,
  selectQualityGateTests,
} from './devQualityGateDirectory.mjs'

test('test directory uses the shared GET contract and honors cancellation without writes', async () => {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, method: options.method, signal: options.signal, cache: options.cache })
    return { ok: true, status: 200, json: async () => ({ kind: 'plush.quality-gate-test-directory', readAt: '2026-11-18T00:00:00Z', missingRoots: [], files: [] }) }
  }
  const result = await readQualityGateTestDirectory({ fetchImpl })
  assert.equal(result.files.length, 0)
  assert.equal(requests[0].url, '/__dev/api/qa/quality-gates/test-directory')
  assert.equal(requests[0].method, 'GET')
  assert.equal(requests[0].cache, 'no-store')
  assert.equal(requests[0].signal.aborted, false)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => readQualityGateTestDirectory({ fetchImpl, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(requests.length, 1)
})

const report = {
  kind: 'plush.quality-gate-test-directory',
  readAt: '2026-11-18T01:00:00Z',
  missingRoots: [],
  files: Array.from({ length: 25 }, (_, i) => ({
    path: `web/src/item-${i}.test.mjs`,
    group: 'web',
    present: true,
  })),
}

test('test directory filters before pagination, corrects pages and preserves missing evidence', () => {
  const normalized = normalizeQualityGateTestDirectory({
    ...report,
    privateToken: 'not-public',
  })
  assert.equal('privateToken' in normalized, false)
  assert.equal(selectQualityGateTests(normalized, { page: 99 }).page, 3)
  assert.equal(
    selectQualityGateTests(normalized, { query: 'item-24', page: 2 }).rows[0]
      .path,
    'web/src/item-24.test.mjs'
  )
  assert.equal(selectQualityGateTests(normalized, { group: 'go' }).total, 0)
  assert.equal(selectQualityGateTests(null).total, 0)
  assert.equal(
    normalizeQualityGateTestDirectory({
      ...report,
      files: [
        { path: 'scripts/missing.test.mjs', group: 'fast', present: false },
      ],
    }).files[0].present,
    false
  )
  assert.equal(
    normalizeQualityGateTestDirectory({
      ...report,
      files: [{ path: 'web/src/中文.test.mjs', group: 'web', present: true }],
    }).files.length,
    1
  )
})

test('test directory rejects malformed identity, paths, duplicate rows and invented states', () => {
  for (const patch of [
    { kind: 'other' },
    { readAt: 'invalid' },
    { missingRoots: ['private'] },
  ])
    { assert.throws(() =>
      normalizeQualityGateTestDirectory({ ...report, ...patch })
    ) }
  for (const file of [
    { path: '/private/test.mjs', group: 'web', present: true },
    { path: 'web/../private.test.mjs', group: 'web', present: true },
    { path: 'web/control\n.test.mjs', group: 'web', present: true },
    { path: 'web/back\\slash.test.mjs', group: 'web', present: true },
    { path: 'web/a.test.mjs', group: 'web', present: 'passed' },
  ])
    { assert.throws(() =>
      normalizeQualityGateTestDirectory({ ...report, files: [file] })
    ) }
  assert.throws(() =>
    normalizeQualityGateTestDirectory({
      ...report,
      files: [report.files[0], report.files[0]],
    })
  )
})
