import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCiJobTimeline, buildCiDiagnosticText, CI_WORKFLOW_SECTIONS, formatCiWorkflowSection } from './devCiWorkflow.mjs'

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

test('diagnostic copy preserves missing evidence and never serializes unrelated private fields', () => {
  const text = buildCiDiagnosticText({ repository: { commit: 'a'.repeat(40), dirty: true, token: 'private-token' }, evidence: { status: 'unavailable', jobs: [], rawLog: 'private-log' } })
  assert.match(text, /存在未提交改动/u)
  assert.match(text, /无可读记录/u)
  assert.match(text, /CI SHA：未读取/u)
  assert.doesNotMatch(text, /private-token|private-log/u)
})

test('diagnostic copy keeps failed attempts and real dependency evidence without inventing a first pass rate', () => {
  const failed = { id: 20, name: 'quality_web_checks', status: 'completed', conclusion: 'failure', attemptCount: 2, durationMs: 100, queueMs: null, url: 'https://example.test/job/20' }
  const text = buildCiDiagnosticText({ evidence: { gitSha: 'b'.repeat(40), pipeline: { id: 10, status: 'completed', conclusion: 'failure' }, jobs: [failed], topology: { status: 'available', jobs: [{ name: failed.name, needs: ['prepare'] }] } }, job: failed })
  assert.match(text, /quality_web_checks \/ 20 \/ completed \/ failure/u)
  assert.match(text, /执行次数：2/u)
  assert.match(text, /前置依赖：prepare/u)
  assert.match(text, /排队 ms：未读取/u)
  assert.match(text, /不能单独推导首次通过率/u)
})

test('copyable instructions include complete table rows, commands and source references', () => {
  const section = CI_WORKFLOW_SECTIONS.find(({ key }) => key === 'coverage')
  const text = formatCiWorkflowSection(section)
  assert.match(text, /Web ESLint \/ Stylelint \| 当前未包含 \| 当前未包含/u)
  assert.match(text, /scripts\/qa\/affected.mjs/u)
  assert(CI_WORKFLOW_SECTIONS.every(({ table }) => !table || table.rows.every((row) => row.length === table.headers.length)))
})
