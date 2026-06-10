import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_TESTING_ROUTE,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingDocs,
  buildDevTestingSummary,
  extractDevTestingCommandBlocks,
  filterDevTestingDocs,
  getDevTestingCategoryOptions,
  isDevTestingEnabled,
  parseDevTestingStrategyTiers,
} from './devTesting.mjs'

const strategyMarkdown = `
# 自动化测试策略 / Test Strategy

## 3. 测试分层

| 层级 | 改动类型 | 必跑或优先命令 | 说明 |
| --- | --- | --- | --- |
| T0 静态检查 | 所有改动 | \`git status --short\`；\`git diff --check\` | 确认工作区和空白错误 |
| T5 Frontend UI / 样式 | 页面、路由、API client、菜单、seed、表单、样式 | \`cd web && pnpm lint\`；\`cd web && pnpm css\`；\`cd web && pnpm test\`；\`cd web && pnpm style:l1\` | 必须做浏览器级默认态、交互态、恢复态和相邻区域回归 |

## 6. 现有命令入口

\`\`\`bash
bash scripts/qa/fast.sh
\`\`\`

\`\`\`bash
cd web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
\`\`\`
`

const deliveryEvidenceMarkdown = `
# Phase 9 目标环境发布证据 / Phase 9 Target Release Evidence

本记录包含 smoke、RBAC 和内部模拟 workflow 闭环验收。

\`\`\`bash
TRIAL_BROWSER_SMOKE_BASE_URL=http://127.0.0.1:5175 pnpm --dir web smoke:trial-demo-browser
\`\`\`
`

const unrelatedMarkdown = `
# 普通说明

这里只是普通说明。
`

test('devTesting: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_TESTING_ROUTE, '/__dev/testing')
  assert.equal(
    DEV_TESTING_STRATEGY_SOURCE_PATH,
    'docs/product/test-strategy.md'
  )
  assert.equal(isDevTestingEnabled({ DEV: true }), true)
  assert.equal(isDevTestingEnabled({ DEV: false }), false)
  assert(!DEV_TESTING_ROUTE.startsWith('/erp/'))
})

test('devTesting: 解析测试策略分层表和命令', () => {
  const tiers = parseDevTestingStrategyTiers(strategyMarkdown)

  assert.equal(tiers.length, 2)
  assert.equal(tiers[0].key, 'T0')
  assert.deepEqual(tiers[0].commands, [
    'git status --short',
    'git diff --check',
  ])
  assert.equal(tiers[1].key, 'T5')
  assert(tiers[1].commands.includes('cd web && pnpm style:l1'))
  assert.match(tiers[1].description, /浏览器级/)
})

test('devTesting: 提取 fenced command blocks 并保留章节上下文', () => {
  const blocks = extractDevTestingCommandBlocks(strategyMarkdown, {
    sourcePath: DEV_TESTING_STRATEGY_SOURCE_PATH,
    title: '自动化测试策略 / Test Strategy',
  })

  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].context, '6. 现有命令入口')
  assert.deepEqual(blocks[0].commands, ['bash scripts/qa/fast.sh'])
  assert.deepEqual(blocks[1].commands.slice(-2), ['pnpm test', 'pnpm style:l1'])
})

test('devTesting: 从 docs Markdown 中筛出测试相关文档', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/test-strategy.md': strategyMarkdown,
    '../../../../docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/product/product-principles.md': unrelatedMarkdown,
    '../../../README.md': deliveryEvidenceMarkdown,
  })

  assert.deepEqual(
    docs.map((item) => item.path),
    [
      'docs/product/test-strategy.md',
      'docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md',
    ]
  )
  assert.equal(docs[0].category, '测试策略')
  assert.equal(docs[1].category, '发布验收')
  assert.equal(docs[1].commandCount, 1)
})

test('devTesting: 支持分类和关键词筛选并汇总', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/test-strategy.md': strategyMarkdown,
    '../../../../docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md':
      deliveryEvidenceMarkdown,
  })
  const tiers = parseDevTestingStrategyTiers(strategyMarkdown)
  const summary = buildDevTestingSummary({ tiers, docs })

  assert.equal(summary.tierCount, 2)
  assert.equal(summary.docCount, 2)
  assert.equal(summary.docsWithCommands, 2)
  assert.equal(summary.commandCount, 7)
  assert.deepEqual(
    getDevTestingCategoryOptions(docs).map((item) => item.value),
    ['all', '测试策略', '发布验收']
  )
  assert.deepEqual(
    filterDevTestingDocs(docs, { keyword: 'trial' }).map((item) => item.path),
    ['docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md']
  )
  assert.deepEqual(
    filterDevTestingDocs(docs, { category: '测试策略' }).map(
      (item) => item.path
    ),
    ['docs/product/test-strategy.md']
  )
})
