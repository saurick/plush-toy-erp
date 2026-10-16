import assert from 'node:assert/strict'
import test from 'node:test'
import { BUSINESS_USABILITY_CATALOG } from './businessUsabilityCatalog.mjs'
import { ENGINEERING_MATERIAL_HELP } from './engineeringMaterialHelp.mjs'
import {
  ROLE_HELP_GUIDES,
  getRoleHelpGuidesForProfile,
} from './roleHelpContent.mjs'
import {
  getBusinessHandbookIntroductions,
  getBusinessPageHandbookSections,
  renderBusinessHandbookMarkdown,
} from './businessHandbook.mjs'
import {
  getHelpReadingCatalog,
  searchHelpDocuments,
  resolveHelpReference,
} from './helpManualCatalog.mjs'
import { renderBusinessHandbookHtml } from '../utils/businessHandbookExport.mjs'

test('完整业务手册保留每个业务页的步骤、字段、完成标准、交接与边界', () => {
  const markdown = renderBusinessHandbookMarkdown()
  for (const page of [
    ...BUSINESS_USABILITY_CATALOG,
    ENGINEERING_MATERIAL_HELP,
  ]) {
    assert(markdown.includes(`<a id="${page.key}"></a>`), page.key)
    for (const text of [
      page.task,
      page.completion,
      page.handoff,
      page.boundary,
      ...page.flowSteps,
      ...page.items
        .flatMap((item) => [
          item.title,
          item.explanation,
          item.source,
          item.updateRule,
          item.example,
          item.effect,
        ])
        .filter(Boolean),
    ]) {
      assert(
        markdown.includes(text.replaceAll('|', '\\|').replaceAll('\n', ' ')),
        `${page.key}: ${text}`
      )
    }
    const sections = getBusinessPageHandbookSections(page)
    assert.equal(
      new Set(sections.map((s) => s.key)).size,
      sections.length,
      page.key
    )
  }
  const roles = getBusinessHandbookIntroductions().find(
    (c) => c.id === 'handbook:roles'
  )
  assert.deepEqual(
    roles.sections.map((s) => s.key),
    ROLE_HELP_GUIDES.map((g) => g.key)
  )
  assert.equal(markdown, renderBusinessHandbookMarkdown())
})

test('搜索与手册取当前账号可读岗位并集，推荐岗位不收窄其他已授予岗位', () => {
  const guides = getRoleHelpGuidesForProfile({
    roles: [{ role_key: 'warehouse' }, { role_key: 'finance' }],
  })
  const catalog = getHelpReadingCatalog(guides, {
    allowedMenuPaths: ['/erp/warehouse/inventory'],
  })
  assert.equal(
    new Set(catalog.references.map((r) => r.id)).size,
    catalog.references.length
  )
  assert.equal(
    new Set(catalog.scenarios.map((s) => s.key)).size,
    catalog.scenarios.length
  )
  assert(
    searchHelpDocuments(catalog, '月结').some(
      (r) => r.page?.key === 'receivables'
    )
  )
  assert(
    catalog.referencePages.some((p) => p.key === 'inventory' && p.available)
  )
  assert(
    catalog.referencePages
      .filter((p) => p.available)
      .every((p) => p.path === '/erp/warehouse/inventory')
  )
  assert(
    catalog.scenarios
      .filter((s) => s.available)
      .every((s) => s.path === '/erp/warehouse/inventory')
  )
  assert(!catalog.referencePages.some((p) => p.key === 'sales-orders'))
})

test('链接和搜索不能增加账号阅读岗位、业务入口或任意文件内容', () => {
  const guides = getRoleHelpGuidesForProfile({
    roles: [{ role_key: 'warehouse' }],
  })
  const catalog = getHelpReadingCatalog(guides)
  assert.equal(searchHelpDocuments(catalog, '月结').length, 0)
  assert(catalog.referencePages.every((p) => !p.available))
  assert.equal(
    resolveHelpReference(catalog.references, 'receivables').id,
    'handbook:start'
  )
  assert.equal(
    resolveHelpReference(catalog.references, '../../server/.env').id,
    'handbook:start'
  )
  const roleChapter = catalog.references.find((r) => r.id === 'handbook:roles')
  assert.deepEqual(
    roleChapter.sections.map((s) => s.key),
    ['warehouse']
  )
  const generic = getHelpReadingCatalog(
    getRoleHelpGuidesForProfile({ roles: [{ role_key: 'custom' }] })
  )
  assert.equal(generic.referencePages.length, 0)
  assert(generic.references.some((r) => r.id === 'handbook:start'))
})

test('共享场景去重且保留可读岗位，通用章节也能直接搜索', () => {
  const guides = getRoleHelpGuidesForProfile({ is_super_admin: true })
  const catalog = getHelpReadingCatalog(guides)
  assert.deepEqual(
    new Set(
      catalog.scenarios.find((s) => s.key === 'engineering-material-request')
        .roleKeys
    ),
    new Set(['boss', 'purchase', 'finance', 'engineering'])
  )
  assert(
    searchHelpDocuments(catalog, '重复提交').some(
      (r) => r.id === 'handbook:problems'
    )
  )
  assert.equal(
    catalog.referencePages.length,
    BUSINESS_USABILITY_CATALOG.length + 1
  )
  assert(
    searchHelpDocuments(catalog, 'Excel').some(
      (entry) => entry.id === 'sales-orders'
    )
  )
  assert(
    searchHelpDocuments(catalog, 'Excel').some(
      (entry) => entry.id === 'material-bom'
    )
  )
})

test('离线 HTML 包含同一范围的完整内容并转义文本，不依赖网络或写入业务', () => {
  const guides = getRoleHelpGuidesForProfile({
    roles: [{ role_key: 'warehouse' }],
  })
  const pages = getHelpReadingCatalog(guides).referencePages
  const html = renderBusinessHandbookHtml({ guides, pages })
  assert(html.startsWith('<!doctype html>'))
  assert(html.includes('采购入库'))
  assert(!html.includes('月结 N 天'))
  assert(!/<script|fetch\(|https?:\/\//u.test(html))
  for (const page of pages) assert(html.includes(`id="${page.key}"`), page.key)
  const sample = {
    ...pages[0],
    title: '<script>alert(1)</script>',
    task: 'A & B < C',
  }
  const escaped = renderBusinessHandbookHtml({ guides, pages: [sample] })
  assert(escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert(escaped.includes('A &amp; B &lt; C'))
  assert(!escaped.includes('<script>'))
})
