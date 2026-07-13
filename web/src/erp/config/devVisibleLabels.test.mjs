import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatDevEnglishAnchor,
  isUnexplainedEnglishDevLabel,
} from './devVisibleLabels.mjs'
import {
  parseCapabilityLedgerMarkdown,
  parseCustomerDeltaLedgerMarkdown,
} from './devCapabilityLedger.mjs'

const read = (path) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8')

test('devVisibleLabels: 常见开发分类使用中文主体并保留英文锚点', () => {
  assert.equal(
    formatDevEnglishAnchor('Product Core'),
    '产品内核 / Product Core'
  )
  assert.equal(
    formatDevEnglishAnchor('Architecture / Workflow'),
    '架构 / Architecture · 工作流 / Workflow'
  )
  assert.equal(formatDevEnglishAnchor('HTML'), '网页原型 / HTML')
  assert.equal(formatDevEnglishAnchor('已经是中文'), '已经是中文')
})
test('devVisibleLabels: 当前能力与差异分类不存在无说明纯英文可见标签', () => {
  const capabilities = parseCapabilityLedgerMarkdown(
    read('docs/product/产品能力进度台账.md'),
    read('docs/product/产品能力证据详情.md')
  ).items
  const deltas = parseCustomerDeltaLedgerMarkdown(
    read('docs/customers/yoyoosun/客户差异台账.md')
  ).items
  const rawValues = [
    ...capabilities.flatMap((item) => [item.layer, item.domain]),
    ...deltas.map((item) => item.category),
  ].filter(Boolean)
  const unexplained = [...new Set(rawValues)].filter((value) =>
    isUnexplainedEnglishDevLabel(formatDevEnglishAnchor(value))
  )

  assert.deepEqual(unexplained, [])
})

test('devVisibleLabels: 七个开发页和共享导航不保留无说明纯英文 Text 或 Tag', () => {
  const sources = [
    'web/src/erp/pages/DevHubPage.jsx',
    'web/src/erp/pages/DevGovernancePage.jsx',
    'web/src/erp/pages/DevDocsPage.jsx',
    'web/src/erp/pages/DevTestingPage.jsx',
    'web/src/erp/pages/DevPrototypesPage.jsx',
    'web/src/erp/pages/DevCapabilityLedgerPage.jsx',
    'web/src/erp/pages/DevCustomerConfigPage.jsx',
    'web/src/erp/components/dev/DevPageNav.jsx',
    'web/src/erp/components/dev/DevTaskNav.jsx',
  ]
  const findings = []
  const visibleLiteralPattern =
    /<(Text|Tag)(?:\s[^>]*)?>\s*([A-Za-z][A-Za-z0-9 .&:+_-]*)\s*<\/\1>/gu

  sources.forEach((path) => {
    const source = read(path)
    for (const match of source.matchAll(visibleLiteralPattern)) {
      findings.push(`${path}: ${match[2].trim()}`)
    }
  })

  assert.deepEqual(findings, [])
})
