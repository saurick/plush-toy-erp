import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

import {
  businessMainlineDocGroups,
  documentationCards,
  helpCenterAdvancedDocItems,
  helpCenterAdvancedDocKeys,
  helpCenterNavItems,
  helpCenterPrimaryNavKeys,
  helpCenterReadingPath,
  qaNavItems,
} from './seedData.mjs'

const docsDir = new URL('../docs/', import.meta.url)
const docsConfigUrl = new URL('./docs.mjs', import.meta.url)
const docsConfigSource = readFileSync(docsConfigUrl, 'utf8')

function parseDocImports() {
  const imports = new Map()
  const importRegex =
    /import\s+([A-Za-z0-9_]+)\s+from\s+'..\/docs\/([^']+)\.md\?raw'/g
  let match = importRegex.exec(docsConfigSource)
  while (match) {
    imports.set(match[2], match[1])
    match = importRegex.exec(docsConfigSource)
  }
  return imports
}

function parseDocRegistryEntries() {
  const start = docsConfigSource.indexOf('export const docRegistry = {')
  const body = docsConfigSource.slice(start)
  const entryRegex =
    /\n {2}(?:'([^']+)'|([A-Za-z0-9_-]+)):\s*\{([\s\S]*?)(?=\n {2}(?:'[^']+'|[A-Za-z0-9_-]+):\s*\{|\n})/g
  const entries = []
  let match = entryRegex.exec(body)
  while (match) {
    entries.push({
      key: match[1] || match[2],
      body: match[3],
    })
    match = entryRegex.exec(body)
  }
  return entries
}

const docImports = parseDocImports()
const registryEntries = parseDocRegistryEntries()
const registryKeys = new Set(registryEntries.map((entry) => entry.key))
const qaNavPaths = new Set(qaNavItems.map((item) => item.path))

function docKeyFromPath(path = '') {
  return String(path).replace('/erp/docs/', '')
}

function assertDocPathRegistered(path) {
  if (!String(path).startsWith('/erp/docs/')) return
  assert(
    registryKeys.has(docKeyFromPath(path)),
    `${path} must be registered in docRegistry`
  )
}

test('docs: docRegistry 每个文档都有标题 摘要 和 source', () => {
  assert(registryEntries.length > 0)
  registryEntries.forEach((entry) => {
    assert(entry.body.includes('title:'), `${entry.key} missing title`)
    assert(entry.body.includes('summary:'), `${entry.key} missing summary`)
    assert(entry.body.includes('source:'), `${entry.key} missing source`)
    const sourceMatch = entry.body.match(/source:\s*([A-Za-z0-9_]+)/)
    assert(sourceMatch?.[1], `${entry.key} source must be non-empty`)
  })
})

test('docs: docs 目录中的正式 Markdown 都已导入注册', () => {
  const mdKeys = readdirSync(docsDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => fileName.replace(/\.md$/, ''))
    .sort()

  assert.deepEqual([...docImports.keys()].sort(), mdKeys)
})

test('docs: docRegistry 不引用不存在的 Markdown source', () => {
  const importedSources = new Set(docImports.values())
  registryEntries.forEach((entry) => {
    const sourceMatch = entry.body.match(/source:\s*([A-Za-z0-9_]+)/)
    assert(
      importedSources.has(sourceMatch?.[1]),
      `${entry.key} source ${sourceMatch?.[1] || ''} must be imported`
    )
  })
})

test('docs: 帮助中心和文档卡片不指向未注册文档', () => {
  helpCenterNavItems.forEach((item) => assertDocPathRegistered(item.path))
  helpCenterAdvancedDocItems.forEach((item) =>
    assertDocPathRegistered(item.path)
  )
  documentationCards.forEach((card) => assertDocPathRegistered(card.path))
  helpCenterReadingPath.forEach((item) => {
    assertDocPathRegistered(item.path)
    if (String(item.path).startsWith('/erp/qa/')) {
      assert(qaNavPaths.has(item.path), `${item.path} must be a QA nav path`)
    }
  })
  businessMainlineDocGroups
    .flatMap((group) => group.items)
    .forEach((item) => {
      assert(item?.path, 'business mainline doc group item must have path')
      assertDocPathRegistered(item.path)
      if (String(item.path).startsWith('/erp/qa/')) {
        assert(qaNavPaths.has(item.path), `${item.path} must be a QA nav path`)
      }
    })
})

test('docs: 帮助中心主入口受控且高级文档不丢', () => {
  assert.deepEqual(helpCenterPrimaryNavKeys, [
    'help-operation-flow-overview',
    'help-operation-guide',
    'help-role-collaboration-guide',
    'help-mobile-role-guide',
    'help-task-flow-v1',
    'help-notification-alert-v1',
    'help-finance-v1',
    'help-warehouse-quality-v1',
  ])
  assert(helpCenterNavItems.length <= 8)
  assert(helpCenterAdvancedDocKeys.includes('help-workflow-schema-draft'))
  assert(helpCenterAdvancedDocKeys.includes('help-workflow-usecase-review'))
  assert(helpCenterAdvancedDocKeys.includes('help-industry-schema-review'))
  assert(helpCenterAdvancedDocKeys.includes('help-workflow-status-guide'))
  assert(helpCenterAdvancedDocKeys.includes('help-log-trace-audit-v1'))
  assert(helpCenterAdvancedDocKeys.includes('help-current-boundaries'))
  assert(!helpCenterPrimaryNavKeys.includes('help-workflow-usecase-review'))
  assert(!helpCenterPrimaryNavKeys.includes('help-industry-schema-review'))
})

test('docs: 开发与验收入口保持 7 个 QA 页面', () => {
  assert.deepEqual(
    qaNavItems.map((item) => item.path),
    [
      '/erp/qa/acceptance-overview',
      '/erp/qa/business-chain-debug',
      '/erp/qa/field-linkage-coverage',
      '/erp/qa/run-records',
      '/erp/qa/reports',
      '/erp/qa/system-layer-progress',
      '/erp/qa/productization-delivery',
    ]
  )
  assert(registryKeys.has('system-layer-progress'))
  assert(registryKeys.has('productization-delivery'))
  assert(
    !helpCenterNavItems.some((item) =>
      /debug seed|debug cleanup|生成调试数据|清理调试数据/u.test(
        `${item.title || ''} ${item.label || ''} ${item.summary || ''}`
      )
    )
  )
  assert(
    !helpCenterNavItems.some((item) =>
      [
        '/erp/qa/system-layer-progress',
        '/erp/qa/productization-delivery',
      ].includes(item.path)
    )
  )
})

test('docs: 架构评审文档只进入高级入口并保留专项报告索引', () => {
  const reviewDocKeys = ['workflow-usecase-review', 'industry-schema-review']

  reviewDocKeys.forEach((docKey) => {
    const entry = registryEntries.find((item) => item.key === docKey)
    assert(entry, `${docKey} must be registered in docRegistry`)
    assert(entry.body.includes('source:'), `${docKey} must have source`)
  })

  assert(
    helpCenterAdvancedDocItems.some(
      (item) => item.path === '/erp/docs/workflow-usecase-review'
    )
  )
  assert(
    helpCenterAdvancedDocItems.some(
      (item) => item.path === '/erp/docs/industry-schema-review'
    )
  )
  assert(
    !helpCenterNavItems.some(
      (item) =>
        item.path === '/erp/docs/workflow-usecase-review' ||
        item.path === '/erp/docs/industry-schema-review'
    )
  )
  assert(
    !documentationCards.some(
      (item) =>
        item.path === '/erp/docs/workflow-usecase-review' ||
        item.path === '/erp/docs/industry-schema-review'
    )
  )

  const qaReportsSource = readFileSync(
    new URL('../docs/qa-reports.md', import.meta.url),
    'utf8'
  )
  assert(qaReportsSource.includes('workflow usecase review'))
  assert(qaReportsSource.includes('industry schema review'))
})
