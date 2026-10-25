import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function setup(t) {
  const view = await createReactTestHarness(t)
  const { ServerCiEvidencePanel } = await import('./ServerCiEvidencePanel.jsx')
  const evidence = {
    status: 'missing',
    gitSha: 'a'.repeat(40),
    pipeline: null,
    reports: null,
    jobs: [],
    jobGuides: [],
    historyStatus: 'available',
    history: [{ id: 7, gitSha: 'b'.repeat(40), result: 'success', url: 'https://example.test/pipelines/7' }],
  }
  return {
    ...view,
    evidence,
    show: (props = {}) => view.render(createElement(ServerCiEvidencePanel, {
      summary: { repository: { commit: evidence.gitSha }, serverEvidence: evidence },
      ...props,
    })),
  }
}

test('CI without a pipeline keeps history available and distinguishes missing from unreadable evidence', async (t) => {
  const ui = await setup(t)
  await ui.show()
  assert.match(ui.container.querySelector('[role="status"]').textContent, /当前提交尚无 CI/u)
  assert.equal(ui.container.querySelector('[aria-label="GitLab 测试报告摘要"]'), null)
  assert.equal(ui.container.querySelector('[aria-label="GitLab 覆盖率摘要"]'), null)
  assert.equal(ui.container.querySelector('a[href="https://example.test/pipelines/7"]').target, '_blank')

  await ui.show({ showEmptyState: false })
  assert.equal(ui.container.querySelector('[role="status"]'), null)
  assert.ok(ui.container.querySelector('details summary'))
  assert.ok(ui.container.querySelector('button[aria-label="流程与原理"]'))

  ui.evidence.status = 'unavailable'
  ui.evidence.historyStatus = 'unavailable'
  await ui.show()
  assert.match(ui.container.querySelector('[role="status"]').textContent, /CI 读取失败/u)
  assert.match(ui.container.textContent, /历史列表暂时读取失败/u)
  assert.doesNotMatch(ui.container.textContent, /当前提交尚无 CI|尚无原生测试报告/u)
})

test('CI pipeline details preserve report failures, results and links through running and completed states', async (t) => {
  const ui = await setup(t)
  Object.assign(ui.evidence, {
    status: 'running',
    pipeline: { id: 8, status: 'in_progress', durationMs: 8000, url: 'https://example.test/pipelines/8' },
    reports: { status: 'unavailable' },
  })
  await ui.show()
  assert.match(ui.container.textContent, /CI 运行中/u)
  assert.match(ui.container.textContent, /测试报告暂时读取失败/u)
  assert.doesNotMatch(ui.container.textContent, /结束时间|尚未完成/u)

  ui.evidence.status = 'failed'
  ui.evidence.pipeline.status = 'completed'
  ui.evidence.reports = {
    status: 'available',
    tests: { count: 3, success: 1, failed: 1, error: 1, skipped: 0 },
    testsUrl: 'https://example.test/pipelines/8/tests',
    coverage: [{ job: 'quality_web_checks', percent: 75, url: 'https://example.test/jobs/9', artifactUrl: 'https://example.test/jobs/9/artifacts' }],
  }
  await ui.show()
  assert.match(ui.container.textContent, /CI 未通过/u)
  assert.match(ui.container.textContent, /结束时间未记录/u)
  assert.match(ui.container.textContent, /测试 3 项 · 成功 1 · 失败 2 · 跳过 0/u)
  assert.match(ui.container.textContent, /Web 行覆盖 75%/u)
  assert.ok(ui.container.querySelector('a[href="https://example.test/pipelines/8/tests"]'))
  assert.ok(ui.container.querySelector('a[href="https://example.test/jobs/9/artifacts"]'))

  ui.evidence.pipeline.finishedAt = '2026-10-25T00:00:00Z'
  await ui.show()
  assert.doesNotMatch(ui.container.textContent, /结束时间未记录/u)
  assert.match(ui.container.textContent, /2026\/10\/25|2026-10-25/u)
})
