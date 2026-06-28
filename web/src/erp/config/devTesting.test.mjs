import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_CURRENT_DOC_PATHS,
  DEV_TESTING_ROUTE,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingCopyText,
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
| T7 业务事实 / E2E | 库存、采购、质检、未来出货、财务、生产、委外真实事实 | 当前已有事实层按 T3 + Phase PG target；完整 E2E 后续再设计 | 不存在稳定 runner 时，不得把手工点按或未来命令写成已自动化 |

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

const currentStrategyMarkdown = strategyMarkdown
  .replace('## 3. 测试分层', '## 4. 验证层级 T0-T8')
  .replace(
    '| 层级 | 改动类型 | 必跑或优先命令 | 说明 |',
    '| 验证层级 | 改动类型 | 必跑或优先命令 | 说明 |'
  )

const deliveryEvidenceMarkdown = `
# 岗位任务端目标环境发布证据 / Mobile Workflow Target Release Evidence

本记录包含 smoke、RBAC 和内部模拟 workflow 闭环验收。

\`\`\`bash
TRIAL_BROWSER_SMOKE_BASE_URL=http://127.0.0.1:5175 pnpm --dir web smoke:trial-demo-browser
\`\`\`
`

const scriptsReadmeMarkdown = `
# QA 脚本说明

## 推荐顺序

\`\`\`bash
node scripts/import/customerSourceExtract.mjs \\
  --manifest docs/customers/yoyoosun/source-manifest.json \\
  --out output/customers/yoyoosun/source-extract
\`\`\`

\`\`\`text
source-snapshot.extracted.json
existing-v1.empty-preview.json
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
    'docs/product/自动化测试策略.md'
  )
  assert.deepEqual(DEV_TESTING_CURRENT_DOC_PATHS, [
    'docs/product/自动化测试策略.md',
    'README.md',
    'web/README.md',
    'server/README.md',
    'scripts/README.md',
    'docs/部署约定.md',
    'server/deploy/README.md',
    'server/deploy/compose/prod/README.md',
  ])
  assert.equal(isDevTestingEnabled({ DEV: true }), true)
  assert.equal(isDevTestingEnabled({ DEV: false }), false)
  assert(!DEV_TESTING_ROUTE.startsWith('/erp/'))
})

test('devTesting: 解析测试策略分层表和命令', () => {
  const tiers = parseDevTestingStrategyTiers(strategyMarkdown)

  assert.equal(tiers.length, 3)
  assert.equal(tiers[0].key, 'T0')
  assert.deepEqual(tiers[0].commands, [
    'git status --short',
    'git diff --check',
  ])
  assert.equal(tiers[0].copyText, 'git status --short\ngit diff --check')
  assert.equal(tiers[1].key, 'T5')
  assert(tiers[1].commands.includes('cd web && pnpm style:l1'))
  assert.match(tiers[1].description, /浏览器级/)
  assert.equal(tiers[2].key, 'T7')
  assert.equal(tiers[2].commands.length, 0)
  assert.match(tiers[2].copyText, /当前没有完整业务 E2E runner/)
})

test('devTesting: 兼容当前自动化测试策略的验证层级标题', () => {
  const tiers = parseDevTestingStrategyTiers(currentStrategyMarkdown)

  assert.equal(tiers.length, 3)
  assert.equal(tiers[1].key, 'T5')
  assert.equal(tiers[1].level, 'T5 Frontend UI / 样式')
  assert(tiers[1].commands.includes('cd web && pnpm style:l1'))
})

test('devTesting: 为常用预设和分层复制生成命令文本', () => {
  assert.deepEqual(
    DEV_TESTING_COPY_PRESETS.map((preset) => preset.key),
    ['frontend', 'pre-commit', 'release']
  )
  assert.match(
    buildDevTestingCopyText(DEV_TESTING_COPY_PRESETS[0].commands),
    /pnpm style:l1/
  )
  assert.equal(
    buildDevTestingCopyText(['pnpm test', '', '  pnpm css  ']),
    'pnpm test\npnpm css'
  )
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

test('devTesting: 只索引当前测试入口白名单文档', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/自动化测试策略.md': strategyMarkdown,
    '../../../../scripts/README.md': scriptsReadmeMarkdown,
    '../../../../web/README.md': deliveryEvidenceMarkdown,
    '../../../../docs/archive/customer-evidence/yoyoosun/mobile-workflow-target-release-evidence-2026-06-09.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/reference/第一次20260519/自动化测试计划.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/product/产品原则.md': unrelatedMarkdown,
    '../../../../README.md': unrelatedMarkdown,
  })

  assert.deepEqual(
    docs.map((item) => item.path),
    [
      'docs/product/自动化测试策略.md',
      'README.md',
      'web/README.md',
      'scripts/README.md',
    ]
  )
  assert.equal(docs[0].category, '测试策略')
  assert.equal(docs[1].category, '项目入口')
  assert.equal(docs[2].category, '前端验证')
  assert.equal(docs[3].category, 'QA 脚本')
  assert.equal(docs[3].commandCount, 3)
})

test('devTesting: reference 和 archive 不作为测试命令入口', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/自动化测试策略.md': strategyMarkdown,
    '../../../../docs/reference/第一次20260519/自动化测试计划.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/reference/第一次20260519/状态分层工作流与业务事实设计总结.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/archive/customer-evidence/yoyoosun/mobile-workflow-target-release-evidence-2026-06-09.md':
      deliveryEvidenceMarkdown,
  })

  assert.deepEqual(
    docs.map((item) => item.path),
    ['docs/product/自动化测试策略.md']
  )
})

test('devTesting: fenced block 只提取 shell 命令和续行', () => {
  const blocks = extractDevTestingCommandBlocks(scriptsReadmeMarkdown, {
    sourcePath: 'scripts/README.md',
    title: 'QA 脚本说明',
  })

  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].commands, [
    'node scripts/import/customerSourceExtract.mjs \\',
    '--manifest docs/customers/yoyoosun/source-manifest.json \\',
    '--out output/customers/yoyoosun/source-extract',
  ])
})

test('devTesting: 支持分类和关键词筛选并汇总', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/自动化测试策略.md': strategyMarkdown,
    '../../../../scripts/README.md': scriptsReadmeMarkdown,
    '../../../../web/README.md': deliveryEvidenceMarkdown,
  })
  const tiers = parseDevTestingStrategyTiers(strategyMarkdown)
  const summary = buildDevTestingSummary({ tiers, docs })

  assert.equal(summary.tierCount, 3)
  assert.equal(summary.docCount, 3)
  assert.equal(summary.docsWithCommands, 3)
  assert.equal(summary.commandCount, 10)
  assert.deepEqual(
    getDevTestingCategoryOptions(docs).map((item) => item.value),
    ['all', '测试策略', '前端验证', 'QA 脚本']
  )
  assert.deepEqual(
    filterDevTestingDocs(docs, { keyword: 'trial' }).map((item) => item.path),
    ['web/README.md']
  )
  assert.deepEqual(
    filterDevTestingDocs(docs, { category: '测试策略' }).map(
      (item) => item.path
    ),
    ['docs/product/自动化测试策略.md']
  )
})
