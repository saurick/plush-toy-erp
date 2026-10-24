import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCiDiagnosticText, CI_WORKFLOW_SECTIONS, formatCiWorkflowSection } from './devCiWorkflow.mjs'

test('diagnostic copy preserves missing evidence and never serializes unrelated private fields', () => {
  const text = buildCiDiagnosticText({ repository: { commit: 'a'.repeat(40), dirty: true, token: 'private-token' }, evidence: { status: 'unavailable', jobs: [], rawLog: 'private-log' } })
  assert.match(text, /存在未提交改动/u)
  assert.match(text, /无可读记录/u)
  assert.match(text, /CI SHA：未读取/u)
  assert.doesNotMatch(text, /private-token|private-log/u)
})

test('diagnostic copy keeps failure identity and native Job links without inventing a first pass rate', () => {
  const failed = { id: 20, name: 'quality_web_checks', status: 'completed', conclusion: 'failure', attemptCount: 2, durationMs: 100, queueMs: null, url: 'https://example.test/job/20' }
  const text = buildCiDiagnosticText({ evidence: { gitSha: 'b'.repeat(40), pipeline: { id: 10, status: 'completed', conclusion: 'failure' }, jobs: [failed], topology: { status: 'available', jobs: [{ name: failed.name, needs: ['prepare'] }] } }, job: failed })
  assert.match(text, /quality_web_checks \/ 20 \/ completed \/ failure/u)
  assert.match(text, /日志 URL：https:\/\/example.test\/job\/20/u)
  assert.doesNotMatch(text, /执行次数：|前置依赖：|排队 ms：/u)
  assert.match(text, /不能单独推导首次通过率/u)
})

test('copyable instructions include complete table rows, commands and source references', () => {
  const section = CI_WORKFLOW_SECTIONS.find(({ key }) => key === 'coverage')
  const text = formatCiWorkflowSection(section)
  assert.match(text, /Web ESLint \/ Stylelint \| 当前未包含 \| 当前未包含/u)
  assert.match(text, /scripts\/qa\/affected.mjs/u)
  assert(CI_WORKFLOW_SECTIONS.every(({ table }) => !table || table.rows.every((row) => row.length === table.headers.length)))
})
