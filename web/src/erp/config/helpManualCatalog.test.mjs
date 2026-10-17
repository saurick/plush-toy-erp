import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUSINESS_USABILITY_CATALOG,
  getBusinessHelpItem,
} from './businessUsabilityCatalog.mjs'
import { ENGINEERING_MATERIAL_HELP } from './engineeringMaterialHelp.mjs'
import {
  getRoleHelpGuide,
  getRoleHelpGuidesForProfile,
  ROLE_HELP_GUIDES,
  GENERIC_HELP_GUIDE,
} from './roleHelpContent.mjs'
import { getRoleHelpScenarios } from './helpScenarios.mjs'
import {
  HELP_REFERENCE_PAGES,
  getHelpReferencePages,
  getHelpReferenceDocuments,
  searchHelpDocuments,
  getHelpCenterHref,
  resolveHelpReference,
  resolveHelpGuide,
  getHelpGuideSections,
  getHelpReadingCatalog,
} from './helpManualCatalog.mjs'

test('图解目录按业务目录分组，每个已授权场景只出现一次', () => {
  const catalog = getHelpReadingCatalog(ROLE_HELP_GUIDES)
  const sections = getHelpGuideSections(catalog)
  assert.equal(sections[0].title, '日常与系统')
  assert.deepEqual(
    sections.flatMap((section) => section.scenarios).map((scenario) => scenario.key).sort(),
    catalog.scenarios.map((scenario) => scenario.key).sort()
  )
  assert.deepEqual(
    sections.slice(1).map((section) => section.title),
    [...new Set(catalog.referencePages.map((page) => page.sectionTitle))]
      .filter((title) => sections.some((section) => section.title === title))
  )
  assert(sections.every((section) => section.scenarios.length > 0))
})

test('目录分组保持账号阅读范围，空目录不产生额外场景', () => {
  const catalog = getHelpReadingCatalog(getRoleHelpGuidesForProfile({ roles: [{ role_key: 'warehouse' }] }))
  const sections = getHelpGuideSections(catalog)
  assert.deepEqual(
    new Set(sections.flatMap((section) => section.scenarios.map((scenario) => scenario.key))),
    new Set(catalog.scenarios.map((scenario) => scenario.key))
  )
  assert(!sections.some((section) => section.title === '财务管理'))
  assert.deepEqual(getHelpGuideSections({ scenarios: [], referencePages: [] }), [])
})

test('参考手册覆盖每个现有业务页，独立保留步骤、规则、来源、结果与异常', () => {
  const access = {
    allowedMenuPaths: BUSINESS_USABILITY_CATALOG.map((entry) => entry.path),
  }
  const pagesByKey = new Map(
    ROLE_HELP_GUIDES.flatMap((guide) => getHelpReferencePages(guide, access)).map(
      (page) => [page.key, page]
    )
  )
  assert.deepEqual(
    [...pagesByKey.keys()].sort(),
    HELP_REFERENCE_PAGES.map((page) => page.key).sort()
  )
  const pages = [...pagesByKey.values()]
  const docs = getHelpReferenceDocuments(pages)
  assert.equal(new Set(docs.map((doc) => doc.id)).size, docs.length)
  for (const page of pages) {
    assert(
      page.task && page.completion && page.handoff && page.boundary,
      page.key
    )
    assert(page.flowSteps.length >= 3, page.key)
    assert(
      docs.find((doc) => doc.id === page.key),
      page.key
    )
    for (const item of page.items) {
      const doc = docs.find((entry) => entry.id === `${page.key}:${item.key}`)
      assert.equal(doc.item, getBusinessHelpItem(page.key, item.key))
      assert.equal(doc.summary, item.explanation)
      assert(doc.summary && doc.title && doc.page.title)
      if (item.type === 'formula') assert(item.source && item.example, doc.id)
    }
  }
})

test('搜索标题、自然问题、别称、公式与来源；相同名词保留页面上下文', () => {
  const guide = getRoleHelpGuide('engineering')
  const access = {
    allowedMenuPaths: BUSINESS_USABILITY_CATALOG.map((entry) => entry.path),
  }
  const catalog = {
    scenarios: getRoleHelpScenarios(guide, access),
    references: getHelpReferenceDocuments(getHelpReferencePages(guide, access)),
  }
  assert.equal(
    searchHelpDocuments(catalog, '库存有，为什么还要采购？')[0].id,
    'engineering-material-request:stock-reference'
  )
  assert(
    searchHelpDocuments(catalog, '净需求').some(
      (doc) => doc.id === 'engineering-material-request:stock-reference'
    )
  )
  assert(
    searchHelpDocuments(catalog, '片数').some(
      (doc) => doc.id === 'engineering-material-request:total-quantity'
    )
  )
  assert(
    searchHelpDocuments(catalog, '提交老板审核').some(
      (doc) => doc.kind === 'guide' && doc.id === 'engineering-material-request'
    )
  )
  const financeCatalog = {
    references: getHelpReferenceDocuments(
      getHelpReferencePages(getRoleHelpGuide('finance'), access)
    ),
  }
  const terms = searchHelpDocuments(financeCatalog, '月结').filter(
    (doc) => doc.item?.key === 'payment-term'
  )
  assert.deepEqual(
    new Set(terms.map((doc) => doc.page.key)),
    new Set(['receivables', 'payables'])
  )
  assert(searchHelpDocuments(catalog, '采购 数量').length > 0)
  assert.deepEqual(searchHelpDocuments(catalog, '不会命中的问题标识'), [])
  assert.deepEqual(searchHelpDocuments(catalog, ' \t '), [])
})

test('已开放页面补入阅读目录，岗位常用推荐与未开放说明保持原有范围', () => {
  const access = {
    allowedMenuPaths: BUSINESS_USABILITY_CATALOG.map((entry) => entry.path),
  }
  const expected = {
    warehouse: ['materials', 'inbound', 'inventory', 'production-orders', 'production-progress', 'shipping-release', 'outbound'],
    engineering: ['products', 'materials', 'material-bom', 'processes', 'engineering-material-request'],
    finance: ['shipping-release', 'receivables', 'payables', 'finance-payments', 'reconciliation', 'invoices', 'engineering-material-request'],
    admin: [],
  }
  for (const [key, pageKeys] of Object.entries(expected)) {
    const guide = getRoleHelpGuide(key)
    const pages = getHelpReferencePages(guide, access)
    const expectedPages = HELP_REFERENCE_PAGES.filter((page) =>
      access.allowedMenuPaths.includes(page.path) || pageKeys.includes(page.key)
    )
    assert.deepEqual(pages.map((page) => page.key), expectedPages.map((page) => page.key), key)
    assert.deepEqual(
      getHelpReferencePages(guide).map((page) => page.key),
      pageKeys,
      '未额外开放页面时，岗位说明仍可阅读'
    )
    const scenarios = getRoleHelpScenarios(guide, access)
    assert(scenarios.every((scene) => !scene.pageKey || pageKeys.includes(scene.pageKey)), key)
    const references = getHelpReferenceDocuments(pages)
    if (key === 'warehouse') {
      assert(searchHelpDocuments({ scenarios, references }, '月结').length > 0)
      assert.equal(resolveHelpReference(references, 'receivables:payment-term', 'inbound').id, 'receivables:payment-term')
    }
    if (key === 'finance') {
      assert(searchHelpDocuments({ scenarios, references }, '月结').length > 0)
    }
  }
})

test('额外授予的页面说明、图解、搜索与下载目录一致，URL 岗位不增加权限', () => {
  const guides = getRoleHelpGuidesForProfile({ roles: [{ role_key: 'warehouse' }] })
  const access = { allowedMenuPaths: ['/erp/sales/project-orders/sales-orders'] }
  const catalog = getHelpReadingCatalog(guides, access)
  assert(catalog.referencePages.find((page) => page.key === 'sales-orders')?.available)
  assert(catalog.scenarios.some((scene) => scene.pageKey === 'sales-orders' && scene.available))
  assert(catalog.scenarios.filter((scene) => scene.pageKey === 'sales-orders').every((scene) => scene.roleKeys.includes('warehouse')))
  assert(searchHelpDocuments(catalog, '销售订单').some((document) => document.id === 'sales-orders'))
  assert(!catalog.referencePages.some((page) => page.key === 'finance-payments'))
  assert.equal(resolveHelpGuide(guides, 'admin').key, 'warehouse')
})

test('页内深链未指定岗位时选择关联岗位，显式筛选和当前账号岗位仍有效', () => {
  const guides = getRoleHelpGuidesForProfile({ is_super_admin: true })
  assert.equal(resolveHelpGuide(guides, '', 'inventory').key, 'warehouse')
  assert.equal(resolveHelpGuide(guides, '', 'receivables').key, 'finance')
  assert.equal(resolveHelpGuide(guides, '', 'materials').key, 'purchase')
  assert.equal(resolveHelpGuide(guides, 'warehouse', 'receivables').key, 'warehouse')
  assert.equal(resolveHelpGuide(guides, 'unknown', 'inventory'), guides[0])
  assert.equal(resolveHelpGuide(guides, '', 'unknown'), guides[0])
  const warehouse = [getRoleHelpGuide('warehouse')]
  assert.equal(resolveHelpGuide(warehouse, '', 'receivables'), warehouse[0])
  assert.equal(resolveHelpGuide([], '', 'inventory'), undefined)
})

test('岗位和页面范围过滤参考内容，深链不能增加业务入口或引用任意文档', () => {
  assert.deepEqual(getHelpReferencePages(GENERIC_HELP_GUIDE), [])
  const pages = getHelpReferencePages(getRoleHelpGuide('warehouse'), {
    allowedMenuPaths: ['/erp/warehouse/inventory'],
  })
  assert(pages.every((page) => page.sectionKey !== 'finance'))
  assert.deepEqual(
    pages.filter((page) => page.available).map((page) => page.key),
    ['inventory']
  )
  const docs = getHelpReferenceDocuments(pages)
  assert.equal(
    resolveHelpReference(docs, 'receivables:payment-term', 'inventory').id,
    'inventory'
  )
  assert.equal(
    resolveHelpReference(docs, 'https://example.com', 'missing'),
    docs[0]
  )
  assert.equal(resolveHelpReference([], 'unknown'), null)
  const special = getHelpReferencePages(GENERIC_HELP_GUIDE, {
    allowedMenuPaths: ['/erp/finance/payments'],
  })
  assert.deepEqual(
    special.map((page) => page.key),
    ['finance-payments']
  )
})

test('图解和词条深链固定指向同一页，工程说明不混淆库存、采购与事实', () => {
  const url = new URL(
    getHelpCenterHref({
      pageKey: 'engineering-material-request',
      itemKey: 'stock-reference',
      roleKey: 'engineering',
    }),
    'https://erp.example'
  )
  assert.equal(url.pathname, '/erp/help-center')
  assert.equal(url.searchParams.get('view'), 'reference')
  assert.equal(
    url.searchParams.get('ref'),
    'engineering-material-request:stock-reference'
  )
  assert.equal(
    new URL(
      getHelpCenterHref({ pageKey: 'outbound', view: 'guide' }),
      url
    ).searchParams.get('page'),
    'outbound'
  )
  assert.equal(
    new URL(getHelpCenterHref({ view: 'bad' }), url).searchParams.get('view'),
    'reference'
  )
  assert.match(
    getBusinessHelpItem('engineering-material-request', 'stock-reference')
      .explanation,
    /不自动抵扣.*不表示已经.*预留/u
  )
  assert.match(
    getBusinessHelpItem('engineering-material-request', 'stock-reference')
      .example,
    /仍为 214.2 米/u
  )
  assert.match(
    getBusinessHelpItem('engineering-material-request', 'total-quantity')
      .explanation,
    /片数.*不重复相乘/u
  )
  assert.match(
    getBusinessHelpItem('engineering-material-request', 'purchase-generation')
      .explanation,
    /已批准.*单价、金额和预计到货日期留空/u
  )
  assert.match(
    getBusinessHelpItem('engineering-material-request', 'rejection')
      .explanation,
    /新审批轮次/u
  )
  assert.match(
    ENGINEERING_MATERIAL_HELP.boundary,
    /不会自动形成收货、库存或应付/u
  )
  for (const role of ['engineering', 'boss', 'finance', 'purchase']) {
    const scenario = getRoleHelpScenarios(getRoleHelpGuide(role)).find(
      (scene) => scene.key === ENGINEERING_MATERIAL_HELP.key
    )
    assert.deepEqual(
      scenario.steps.map((step) => step.description),
      ENGINEERING_MATERIAL_HELP.flowSteps
    )
    assert.equal(scenario.available, false)
    assert.match(
      scenario.exception.action,
      /轮次.*避免连续提交|轮次.*连续提交|连续提交/u
    )
  }
})
