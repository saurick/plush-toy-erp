import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { formatDevEnglishAnchor } from './devVisibleLabels.mjs'

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
test('devVisibleLabels: 十五个开发页和共享导航不保留无说明纯英文 Text 或 Tag', () => {
  const sources = [
    'web/src/dev-workbench/pages/DevHubPage.jsx',
    'web/src/dev-workbench/pages/DevProductCorePage.jsx',
    'web/src/dev-workbench/pages/DevPermissionRelationshipsPage.jsx',
    'web/src/dev-workbench/pages/DevGovernancePage.jsx',
    'web/src/dev-workbench/pages/DevFlowStateObservatoryPage.jsx',
    'web/src/dev-workbench/pages/DevBusinessUsabilityPage.jsx',
    'web/src/dev-workbench/pages/DevDocsPage.jsx',
    'web/src/dev-workbench/pages/DevTestingPage.jsx',
    'web/src/dev-workbench/pages/DevPrototypesPage.jsx',
    'web/src/dev-workbench/pages/DevCustomerConfigPage.jsx',
    'web/src/dev-workbench/pages/DevVersionCenterPage.jsx',
    'web/src/dev-workbench/pages/DevDataPreparationPage.jsx',
    'web/src/dev-workbench/pages/DevDatabaseMigrationPage.jsx',
    'web/src/dev-workbench/pages/DevDrillRecoveryPage.jsx',
    'web/src/dev-workbench/components/DevPageNav.jsx',
    'web/src/dev-workbench/components/DevEnvironmentEvidencePanel.jsx',
    'web/src/dev-workbench/components/DevTaskNav.jsx',
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
