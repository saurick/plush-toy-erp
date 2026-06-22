import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_GOVERNANCE_ROUTE,
  DEV_GOVERNANCE_SOURCE_PATH,
  buildDevDocsHref,
  buildGovernanceSummary,
  extractGovernanceMermaid,
  filterGovernanceTasks,
  getRelatedGovernanceTasks,
  isDevGovernanceEnabled,
  parseGovernanceAxes,
  parseGovernanceTaskRoutes,
  parseMarkdownLinks,
} from './devGovernance.mjs'

const governanceSource = readFileSync(
  new URL('../../../../docs/项目治理地图.md', import.meta.url),
  'utf8'
)

test('devGovernance: route and dev gate stay dev-only', () => {
  assert.equal(DEV_GOVERNANCE_ROUTE, '/__dev/governance')
  assert.equal(DEV_GOVERNANCE_SOURCE_PATH, 'docs/项目治理地图.md')
  assert.equal(isDevGovernanceEnabled({ DEV: true }), true)
  assert.equal(isDevGovernanceEnabled({ DEV: false }), false)
  assert.equal(isDevGovernanceEnabled({}), false)
  assert(!DEV_GOVERNANCE_ROUTE.startsWith('/erp/'))
})

test('devGovernance: parses governance axes and source links from Markdown', () => {
  const axes = parseGovernanceAxes(governanceSource)
  const currentTruthAxis = axes.find((item) =>
    item.axis.includes('当前真源与交接')
  )
  const architectureAxis = axes.find((item) =>
    item.axis.includes('Architecture layer')
  )

  assert(axes.length >= 10)
  assert.equal(currentTruthAxis?.question.includes('现在先读哪里'), true)
  assert.equal(
    currentTruthAxis?.sourcesLinks[0]?.path,
    'docs/当前真源与交接顺序.md'
  )
  assert.equal(
    architectureAxis?.sourcesLinks.some((link) => link.path === 'AGENTS.md'),
    true
  )
  assert.match(
    architectureAxis?.sourcesLinks.find((link) => link.path === 'AGENTS.md')
      ?.devDocsHref || '',
    /^\/__dev\/docs\?path=AGENTS\.md#/
  )
})

test('devGovernance: parses common task routing without inventing rules', () => {
  const tasks = parseGovernanceTaskRoutes(governanceSource)

  assert(tasks.length >= 6)
  assert.deepEqual(
    filterGovernanceTasks(tasks, '部署').map((item) => item.task),
    ['改部署、发布或低配运行口径']
  )
  assert(
    tasks.some((item) =>
      item.firstHopLinks.some((link) => link.path === 'docs/部署约定.md')
    )
  )
})

test('devGovernance: derives related task routing from Markdown links', () => {
  const axes = parseGovernanceAxes(governanceSource)
  const tasks = parseGovernanceTaskRoutes(governanceSource)
  const pageDesignAxis = axes.find((item) => item.axis.includes('页面设计治理'))
  const customerAxis = axes.find((item) =>
    item.axis.includes('产品化与客户差异')
  )

  assert.deepEqual(
    getRelatedGovernanceTasks(tasks, pageDesignAxis).map((item) => item.task),
    ['改页面、菜单、原型或信息密度']
  )
  assert.deepEqual(
    getRelatedGovernanceTasks(tasks, customerAxis).map((item) => item.task),
    ['改客户资料、导入、客户配置或交付资料']
  )
})

test('devGovernance: extracts Mermaid and summary from source Markdown', () => {
  const axes = parseGovernanceAxes(governanceSource)
  const tasks = parseGovernanceTaskRoutes(governanceSource)
  const mermaid = extractGovernanceMermaid(governanceSource)
  const summary = buildGovernanceSummary({ axes, tasks, mermaid })

  assert.match(mermaid, /^flowchart TD/)
  assert.equal(summary.axisCount, axes.length)
  assert.equal(summary.taskCount, tasks.length)
  assert.equal(summary.hasMermaid, true)
  assert(summary.sourceCount >= 10)
  assert.match(summary.boundary, /Markdown remains the source of truth/)
})

test('devGovernance: builds dev docs links only for supported Markdown paths', () => {
  assert.equal(
    buildDevDocsHref('docs/product/模块实施治理.md', '#section'),
    '/__dev/docs?path=docs%2Fproduct%2F%E6%A8%A1%E5%9D%97%E5%AE%9E%E6%96%BD%E6%B2%BB%E7%90%86.md#section'
  )
  assert.equal(buildDevDocsHref('.agents/skills/example/SKILL.md'), '')

  const links = parseMarkdownLinks(
    '[AGENTS.md](../AGENTS.md#Git-约定)、[web README](../web/README.md)'
  )
  assert.deepEqual(
    links.map((link) => [link.label, link.copyPath]),
    [
      ['AGENTS.md', 'AGENTS.md#Git-约定'],
      ['web README', 'web/README.md'],
    ]
  )
})
