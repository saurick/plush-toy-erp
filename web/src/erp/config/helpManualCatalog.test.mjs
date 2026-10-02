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
} from './helpManualCatalog.mjs'

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

test('全部页面权限不扩大所选岗位的目录、图解或搜索范围', () => {
  const access = {
    allowedMenuPaths: BUSINESS_USABILITY_CATALOG.map((entry) => entry.path),
  }
  const expected = {
    warehouse: ['materials', 'inbound', 'inventory', 'production-progress', 'shipments', 'shipping-release', 'outbound'],
    engineering: ['products', 'materials', 'material-bom', 'processes', 'engineering-material-request'],
    finance: ['shipping-release', 'receivables', 'payables', 'finance-payments', 'reconciliation', 'invoices', 'engineering-material-request'],
    admin: [],
  }
  for (const [key, pageKeys] of Object.entries(expected)) {
    const guide = getRoleHelpGuide(key)
    const pages = getHelpReferencePages(guide, access)
    assert.deepEqual(pages.map((page) => page.key), pageKeys, key)
    assert.deepEqual(
      getHelpReferencePages(guide).map((page) => page.key),
      pageKeys,
      '菜单只控制办理入口，岗位说明仍可阅读'
    )
    const scenarios = getRoleHelpScenarios(guide, access)
    assert(scenarios.every((scene) => !scene.pageKey || pageKeys.includes(scene.pageKey)), key)
    const references = getHelpReferenceDocuments(pages)
    if (key === 'warehouse') {
      assert.deepEqual(searchHelpDocuments({ scenarios, references }, '月结'), [])
      assert.equal(resolveHelpReference(references, 'receivables:payment-term', 'inbound').id, 'inbound')
    }
    if (key === 'finance') {
      assert(searchHelpDocuments({ scenarios, references }, '月结').length > 0)
    }
  }
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
