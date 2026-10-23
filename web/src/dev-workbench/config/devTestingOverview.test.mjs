import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DEV_TESTING_METHOD_ENTRIES,
  buildDevTestingOverviewLink,
  buildDevTestingOverviewMethods,
  buildDevTestingOverviewReports,
} from './devTestingOverview.mjs'
import {
  DEV_TESTING_CURRENT_DOC_PATHS,
  buildDevTestingDocs,
  filterDevTestingCommandBlocks,
  parseDevTestingStrategyGuide,
} from './devTesting.mjs'

const root = new URL('../../../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const strategy = read('docs/product/自动化测试策略.md')
const methods = buildDevTestingOverviewMethods(strategy)

test('测试总览完整消费正式测试分类，每类都有真实入口或人工留证边界', () => {
  const source = parseDevTestingStrategyGuide(strategy).methods.rows
  assert.equal(source.length, 10)
  assert.deepEqual(Object.keys(DEV_TESTING_METHOD_ENTRIES), source.map(([label]) => label))
  assert.deepEqual(methods.map(({ label, scope }) => [label, scope]), source.map(([label, scope]) => [label, scope]))
  for (const method of methods) {
    assert(method.execute.length > 0, method.label)
    assert(method.reports?.length || method.reportNote, method.label)
  }
  for (const label of ['手机真机', 'Codex 探索']) {
    const method = methods.find((item) => item.label === label)
    assert.equal(method.reports, undefined)
    assert.equal(method.execute[0].view, 'guide')
    assert(method.executionNote)
  }
  assert.deepEqual(buildDevTestingOverviewMethods(''), [])
})

test('测试总览的专项命令检索有正式来源，不产生空执行入口', () => {
  const docs = buildDevTestingDocs(Object.fromEntries(DEV_TESTING_CURRENT_DOC_PATHS.map((path) => [path, read(path)])))
  for (const method of methods) {
    for (const entry of method.execute.filter(({ view }) => view === 'commands')) {
      assert(filterDevTestingCommandBlocks(docs, { keyword: entry.query.q }).length > 0, method.label)
    }
  }
})

test('总览下钻清除其他任务的筛选，命令返回总览且保留客户范围', () => {
  const source = 'view=overview&customer=yoyoosun&role=执行脚本&q=old&commandsPage=8&reportSource=snapshot&coverageDomain=sales'
  const command = new URL(buildDevTestingOverviewLink(methods[0].execute.find(({ view }) => view === 'commands'), source), 'http://localhost')
  assert.equal(command.searchParams.get('q'), 'go test')
  assert.equal(command.searchParams.get('returnView'), 'overview')
  assert.equal(command.searchParams.get('customer'), 'yoyoosun')
  assert.equal(command.searchParams.has('commandsPage'), false)
  const report = new URL(buildDevTestingOverviewLink(methods[0].reports[0], source), 'http://localhost')
  assert.equal(report.searchParams.get('coverage'), 'code')
  assert.equal(report.searchParams.has('reportSource'), false)
  assert.equal(report.searchParams.has('coverageDomain'), false)
  assert.equal(report.searchParams.has('returnView'), false)
})

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
