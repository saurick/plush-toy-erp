import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDevTestingOverviewReports,
} from './devTestingOverview.mjs'

test('缺失、读取失败和过期报告不能用历史绿色填充总览', () => {
  const report = {
    codeCoverage: { go: { status: 'passed' }, web: { status: 'passed' } },
    businessCoverage: { status: 'passed', domains: [] },
    gates: [{ status: 'passed' }],
    acceptance: {},
  }
  for (const status of ['missing', 'failed', 'stale']) {
    const sections = buildDevTestingOverviewReports({ status, report })
    assert(sections.filter(({ value }) => value !== 'rules').every((item) => item.status === status))
    assert.equal(sections.find(({ value }) => value === 'rules').status, null)
  }
  assert(buildDevTestingOverviewReports(null).filter(({ value }) => value !== 'rules').every((item) => item.status === 'not_collected'))
  const current = buildDevTestingOverviewReports({ status: 'current', report })
  assert.equal(current.find(({ value }) => value === 'code').status, 'passed')
  assert.equal(current.find(({ value }) => value === 'rules').status, null)
  assert.equal(current.find(({ value }) => value === 'acceptance').status, 'not_collected')
  report.codeCoverage.web.status = 'failed'
  assert.equal(buildDevTestingOverviewReports({ status: 'current', report })[0].status, 'failed')
})
