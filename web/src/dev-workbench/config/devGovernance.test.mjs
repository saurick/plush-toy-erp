import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_GOVERNANCE_ROUTE,
  DEV_GOVERNANCE_SOURCE_PATH,
  buildDevDocsHref,
  buildGovernanceSummary,
  extractGovernanceMermaid,
  isDevGovernanceEnabled,
  parseGovernanceAxes,
  parseGovernanceTaskRoutes,
  parseMarkdownLinks,
  parsePersonalDeliveryLoop,
} from './devGovernance.mjs'

const governanceSource = readFileSync(
  new URL('../../../../docs/项目治理地图.md', import.meta.url),
  'utf8'
)
const governancePageSource = readFileSync(
  new URL('../pages/DevGovernancePage.jsx', import.meta.url),
  'utf8'
)
const devPageNavSource = readFileSync(
  new URL('../components/DevPageNav.jsx', import.meta.url),
  'utf8'
)
const devTaskNavSource = readFileSync(
  new URL('../components/DevTaskNav.jsx', import.meta.url),
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

test('devGovernance: shared dev page nav exposes workspace routes and unique deep-link actions', () => {
  assert.match(devPageNavSource, /useLocation/)
  assert.match(devPageNavSource, /import \{ Link, useLocation \}/)
  assert.match(devPageNavSource, /to=\{item\.route\}/)
  assert.doesNotMatch(devPageNavSource, /useNavigate/)
  assert.doesNotMatch(devPageNavSource, /navigate\(item\.route\)/)
  assert.match(
    devPageNavSource,
    /`\$\{DEV_DOCS_ROUTE\}\?path=\$\{encodeURIComponent\(sourcePath\)\}`/
  )
  assert.match(devPageNavSource, /location\.pathname/)
  assert.match(devPageNavSource, /location\.search/)
  assert.match(devPageNavSource, /location\.hash/)
  assert.match(
    devPageNavSource,
    /navigator\.clipboard\s*\.writeText\(currentDeepLink\)/
  )
  assert.match(devPageNavSource, /DEV_WORKSPACE_NAV_ITEMS\.map/)
  assert.match(devPageNavSource, /resolveDevWorkbenchAreaKey/)
  assert.match(devPageNavSource, /getDevSecondaryNavItems/)
  assert.match(
    devPageNavSource,
    /function normalizePathname\(pathname\)[\s\S]*pathname\.replace\(\/\\\/\+\$\/, ''\)/
  )
  assert.match(devPageNavSource, /normalizePathname\(location\.pathname\)/)
  assert.match(devPageNavSource, /aria-current=\{isExact \? 'page'/)
  assert.match(devPageNavSource, /aria-current=\{isActive \? 'page'/)
  assert.match(devPageNavSource, /erp-dev-workspace-nav__route--context/)
  assert.doesNotMatch(devPageNavSource, /currentWorkspaceItem\s*\?\s*\[\]/u)
  assert.match(devPageNavSource, /scrollIntoView/)
  assert.match(devPageNavSource, /href=\{sourceHref\}/)
  assert.match(devPageNavSource, /aria-label="开发工作台页面"/)

  for (const accessibleName of ['复制当前开发页深链', '在开发文档中打开来源']) {
    assert.equal(
      devPageNavSource.split(accessibleName).length - 1,
      1,
      `accessible name must stay unique: ${accessibleName}`
    )
  }
})

test('devGovernance: task navigation is an accessible tab set rather than a false stepper', () => {
  assert.match(devTaskNavSource, /role="tablist"/u)
  assert.match(devTaskNavSource, /role="tab"/u)
  assert.match(devTaskNavSource, /aria-selected=\{isActive\}/u)
  assert.match(devTaskNavSource, /tabIndex=\{isActive \? 0 : -1\}/u)
  assert.match(devTaskNavSource, /event\.key === 'ArrowRight'/u)
  assert.match(devTaskNavSource, /event\.key === 'ArrowLeft'/u)
  assert.match(devTaskNavSource, /event\.key === 'Home'/u)
  assert.match(devTaskNavSource, /event\.key === 'End'/u)
  assert.doesNotMatch(devTaskNavSource, /aria-current="step"/u)
})

test('devGovernance: selected task uses canonical URL state for share and history restore', () => {
  assert.match(governancePageSource, /useSearchParams\(\)/)
  assert.match(
    governancePageSource,
    /const requestedTaskKey = searchParams\.get\(TASK_QUERY_KEY\)/
  )
  assert.match(
    governancePageSource,
    /tasks\.find\(\(task\) => task\.key === requestedTaskKey\) \|\| tasks\[0\]/
  )
  assert.match(
    governancePageSource,
    /LEGACY_QUERY_KEYS\.forEach\(\(key\) => nextParams\.delete\(key\)\)/
  )
  assert.match(
    governancePageSource,
    /setSearchParams\(nextParams, \{ replace: true \}\)/
  )
  assert.match(
    governancePageSource,
    /nextParams\.set\(TASK_QUERY_KEY, taskKey\)[\s\S]*setSearchParams\(nextParams\)/
  )
  assert.match(
    governancePageSource,
    /<DevPageNav sourcePath=\{DEV_GOVERNANCE_SOURCE_PATH\} \/>/
  )
  assert.doesNotMatch(governancePageSource, /AXIS_QUERY_KEY|SCOPE_QUERY_KEY/)
  assert.doesNotMatch(governancePageSource, /setSelectedTaskKey/)
  assert.match(
    governancePageSource,
    /aria-current=\{task\.key === selectedKey \? 'page' : undefined\}/u
  )
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

test('devGovernance: derives the five-step personal ToB delivery loop from Markdown', () => {
  const loop = parsePersonalDeliveryLoop(governanceSource)

  assert.deepEqual(
    loop.steps.map((step) => step.step),
    [
      '甲方提出目标或痛点',
      '负责人带回 Codex',
      'Codex 补齐并实现最小闭环',
      '明确授权后发布固定版本',
      '甲方使用反馈后再迭代',
    ]
  )
  assert.equal(loop.steps[0]?.owner, '甲方')
  assert.match(loop.steps[2]?.outcome || '', /只采用当前需求所需复杂度/)
  assert.match(loop.summary, /不跟随代码实现、内部层级或测试内部键逐级签认/)
  assert.deepEqual(
    loop.summaryLinks.map((link) => link.path),
    ['AGENTS.md', 'docs/product/模块实施治理.md']
  )
  assert.match(governancePageSource, /parsePersonalDeliveryLoop/)
  assert.match(governancePageSource, /erp-dev-governance-delivery-loop/)
  assert.match(governancePageSource, />\s*个人 ToB 交付循环\s*</)
})

test('devGovernance: parses explicit task-first routing without guessing relationships', () => {
  const tasks = parseGovernanceTaskRoutes(governanceSource)

  assert.deepEqual(
    tasks.map((item) => item.key),
    [
      'product-core-boundary',
      'data-contract',
      'workflow-fact',
      'page-menu',
      'test-acceptance',
      'customer-delivery',
      'release-runtime',
      'docs',
      'external-input',
    ]
  )
  assert.equal(new Set(tasks.map((item) => item.key)).size, tasks.length)
  assert(
    tasks.every(
      (item) =>
        item.task &&
        item.internalScope &&
        item.firstHop &&
        item.syncCheck &&
        item.boundary
    )
  )
  assert.equal(
    tasks.find((item) => item.key === 'product-core-boundary')?.task,
    '判断需求是否进入产品内核'
  )
  assert(
    tasks
      .find((item) => item.key === 'product-core-boundary')
      ?.firstHopLinks.some(
        (link) => link.path === 'docs/product/客户差异策略.md'
      )
  )
  assert.match(
    tasks.find((item) => item.key === 'product-core-boundary')?.boundary || '',
    /Product Core 不等于 server\/internal\/core/
  )
  assert.equal(
    tasks.find((item) => item.key === 'release-runtime')?.task,
    '准备部署、发布或回滚'
  )
  assert.match(
    tasks.find((item) => item.key === 'workflow-fact')?.boundary || '',
    /协同任务完成不等于库存、出货或财务事实已经生效/
  )
  assert(
    tasks
      .find((item) => item.key === 'release-runtime')
      ?.firstHopLinks.some((link) => link.path === 'docs/部署约定.md')
  )
  assert.doesNotMatch(
    tasks.map((item) => item.task).join(' '),
    /schema|migration|repository|usecase|RBAC|T0-T8|GPT|Markdown/u
  )
})

test('devGovernance: default page is task-first and keeps internal terminology collapsed', () => {
  assert.match(governancePageSource, /这次改动该怎么做？/)
  assert.match(governancePageSource, /你这次准备做什么？/)
  assert.match(governancePageSource, /title="先看这些"/)
  assert.match(governancePageSource, /title="同时检查"/)
  assert.match(governancePageSource, /title="不要误判"/)
  assert.match(
    governancePageSource,
    /<details className="erp-dev-governance-reference-details">/
  )
  assert.match(governancePageSource, /查看完整工作方式和内部说明/)
  assert.doesNotMatch(
    governancePageSource,
    /SearchInput|getRelatedGovernanceTasks|filterGovernanceTasks|第一跳|<Tag>分流<\/Tag>/
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
  assert.match(summary.boundary, /Markdown 是唯一维护来源/)
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
