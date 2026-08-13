import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_HUB_ALL_GROUP,
  DEV_HUB_ITEMS,
  DEV_HUB_MAX_PINNED_ITEMS,
  DEV_HUB_PINNED_STORAGE_KEY,
  DEV_HUB_ROUTE,
  buildDevHubPinnedItems,
  buildDevHubSummary,
  filterDevHubItems,
  getDevHubGroupOptions,
  isDevHubEnabled,
  normalizeDevHubPinnedRoutes,
  toggleDevHubPinnedRoute,
} from './devHub.mjs'
import {
  DEV_SECONDARY_NAV_ITEMS,
  DEV_WORKBENCH_AREA_KEYS,
  DEV_WORKSPACE_NAV_ITEMS,
  resolveDevPageFavicon,
  resolveDevPageTitle,
  resolveDevWorkbenchAreaKey,
} from './devRoutes.mjs'

const devPageSources = [
  'DevHubPage.jsx',
  'DevProductCorePage.jsx',
  'DevPermissionRelationshipsPage.jsx',
  'DevGovernancePage.jsx',
  'DevFlowStateObservatoryPage.jsx',
  'DevBusinessUsabilityPage.jsx',
  'DevDocsPage.jsx',
  'DevTestingPage.jsx',
  'DevQualityGatesPage.jsx',
  'DevDataPreparationPage.jsx',
  'DevPrototypesPage.jsx',
  'DevCustomerConfigPage.jsx',
  'DevDatabaseMigrationPage.jsx',
  'DevVersionCenterPage.jsx',
  'DevDrillRecoveryPage.jsx',
].map((fileName) =>
  readFileSync(new URL(`../pages/${fileName}`, import.meta.url), 'utf8')
)
const devPageNavSource = readFileSync(
  new URL('../components/DevPageNav.jsx', import.meta.url),
  'utf8'
)
const devEntrySourceDetailsSource = readFileSync(
  new URL('../components/DevEntrySourceDetails.jsx', import.meta.url),
  'utf8'
)
const devHubPageSource = readFileSync(
  new URL('../pages/DevHubPage.jsx', import.meta.url),
  'utf8'
)
const devWorkbenchAreaPageSource = readFileSync(
  new URL('../pages/DevWorkbenchAreaPage.jsx', import.meta.url),
  'utf8'
)

test('devHub: route and dev gate stay dev-only', () => {
  assert.equal(DEV_HUB_ROUTE, '/__dev')
  assert.equal(DEV_HUB_PINNED_STORAGE_KEY, 'plush_erp_dev_hub_pinned_routes')
  assert.equal(DEV_HUB_ALL_GROUP, 'all')
  assert.equal(DEV_HUB_MAX_PINNED_ITEMS, 5)
  assert.equal(isDevHubEnabled({ DEV: true }), true)
  assert.equal(isDevHubEnabled({ DEV: false }), false)
  assert.equal(isDevHubEnabled({}), false)
})

test('devHub: every dev route exposes a distinct browser title', () => {
  assert.equal(
    resolveDevPageTitle('/__dev/product-core', 'Plush Toy ERP'),
    '产品内核 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/permission-relationships', 'Plush Toy ERP'),
    '权限关系 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/testing', 'Plush Toy ERP'),
    '改动验证 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/erp/dashboard', 'Plush Toy ERP'),
    'Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/docs/', 'Plush Toy ERP'),
    '开发文档 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/status-flows', 'Plush Toy ERP'),
    '业务链观察 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/business-usability', 'Plush Toy ERP'),
    '业务易用性 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/quality', 'Plush Toy ERP'),
    '质量验证 · Plush Toy ERP'
  )
  assert.equal(resolveDevPageFavicon('/__dev'), '/favicon-dev.svg')
  assert.equal(resolveDevPageFavicon('/__dev/testing'), '/favicon-testing.svg')
  assert.equal(
    resolveDevPageTitle('/__dev/quality-gates', 'Plush Toy ERP'),
    '质量门禁 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageFavicon('/__dev/quality-gates'),
    '/favicon-testing.svg'
  )
  assert.equal(
    resolveDevPageFavicon('/__dev/governance/'),
    '/favicon-governance.svg'
  )
  assert.equal(
    resolveDevPageFavicon('/__dev/customer-config'),
    '/favicon-customer-config.svg'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/version-center', 'Plush Toy ERP'),
    '版本发布 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/drill-recovery', 'Plush Toy ERP'),
    '演练与恢复 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/data-preparation', 'Plush Toy ERP'),
    '测试数据 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageFavicon('/__dev/data-preparation'),
    '/favicon-testing.svg'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/database-migration', 'Plush Toy ERP'),
    '数据库迁移 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageFavicon('/__dev/database-migration'),
    '/favicon-dev.svg'
  )
})

test('devHub: shared workspace navigation exposes exactly four primary areas and keeps all deep links', () => {
  assert.deepEqual(
    DEV_WORKSPACE_NAV_ITEMS.map((item) => item.route),
    [
      '/__dev',
      '/__dev/product-engineering',
      '/__dev/quality',
      '/__dev/delivery',
    ]
  )
  assert.deepEqual(
    DEV_WORKSPACE_NAV_ITEMS.map((item) => item.label),
    ['总览', '产品工程', '质量验证', '交付运行']
  )
  assert.deepEqual(
    DEV_SECONDARY_NAV_ITEMS.map((item) => [item.areaKey, item.label]),
    [
      ['product-engineering', '产品内核'],
      ['product-engineering', '权限关系'],
      ['product-engineering', '改动指南'],
      ['product-engineering', '业务链观察'],
      ['product-engineering', '业务易用性'],
      ['product-engineering', '开发文档'],
      ['product-engineering', '产品原型'],
      ['quality', '改动验证'],
      ['quality', '质量门禁'],
      ['quality', '测试数据'],
      ['delivery', '客户配置'],
      ['delivery', '数据库迁移'],
      ['delivery', '版本发布'],
      ['delivery', '演练与恢复'],
    ]
  )
  const hubTitleByKey = new Map(
    DEV_HUB_ITEMS.map((item) => [item.key, item.title.split(' / ')[0]])
  )
  DEV_SECONDARY_NAV_ITEMS.forEach((item) => {
    assert.equal(hubTitleByKey.get(item.key), item.label)
  })
  assert.equal(
    new Set(DEV_WORKSPACE_NAV_ITEMS.map((item) => item.route)).size,
    DEV_WORKSPACE_NAV_ITEMS.length
  )
  assert(
    DEV_WORKSPACE_NAV_ITEMS.every(
      (item) =>
        item.label && item.description && item.route.startsWith('/__dev')
    )
  )
  assert.deepEqual(
    DEV_SECONDARY_NAV_ITEMS.map((item) => item.route).toSorted(),
    DEV_HUB_ITEMS.map((item) => item.route).toSorted()
  )
  assert.equal(
    resolveDevWorkbenchAreaKey('/__dev/product-core'),
    'product-engineering'
  )
  assert.equal(
    resolveDevWorkbenchAreaKey('/__dev/permission-relationships'),
    'product-engineering'
  )
  assert.equal(
    resolveDevWorkbenchAreaKey('/__dev/status-flows'),
    'product-engineering'
  )
  assert.equal(
    resolveDevWorkbenchAreaKey('/__dev/business-usability'),
    'product-engineering'
  )
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/testing'), 'quality')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/quality-gates'), 'quality')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/data-preparation'), 'quality')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/customer-config'), 'delivery')
  assert.equal(
    resolveDevWorkbenchAreaKey('/__dev/database-migration'),
    'delivery'
  )
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/version-center'), 'delivery')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/drill-recovery'), 'delivery')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/unknown'), '')
  assert.match(
    devPageNavSource,
    /const secondaryItems = getDevSecondaryNavItems\(currentAreaKey\)/u
  )
  assert.doesNotMatch(
    devPageNavSource,
    /currentWorkspaceItem\s*\?\s*\[\]/u,
    'area landing pages must keep their secondary navigation visible'
  )
})

test('devHub: every tool has one registered area and the overview derives stages from it', () => {
  const toolAreaKeys = [
    DEV_WORKBENCH_AREA_KEYS.productEngineering,
    DEV_WORKBENCH_AREA_KEYS.quality,
    DEV_WORKBENCH_AREA_KEYS.delivery,
  ]

  assert.equal(
    new Set(DEV_HUB_ITEMS.map((item) => item.key)).size,
    DEV_HUB_ITEMS.length,
    'tool keys must stay unique'
  )
  assert.equal(
    new Set(DEV_HUB_ITEMS.map((item) => item.route)).size,
    DEV_HUB_ITEMS.length,
    'tool routes must stay unique'
  )
  assert(
    DEV_HUB_ITEMS.every((item) => toolAreaKeys.includes(item.areaKey)),
    'every tool must belong to a registered non-overview area'
  )
  assert(
    toolAreaKeys.every((areaKey) =>
      DEV_HUB_ITEMS.some((item) => item.areaKey === areaKey)
    ),
    'every task stage must keep at least one tool'
  )
  assert.deepEqual(
    DEV_HUB_ITEMS.map((item) => [item.key, item.areaKey, item.route]).toSorted(
      (left, right) => left[0].localeCompare(right[0])
    ),
    DEV_SECONDARY_NAV_ITEMS.map((item) => [
      item.key,
      item.areaKey,
      item.route,
    ]).toSorted((left, right) => left[0].localeCompare(right[0])),
    'tool inventory and secondary navigation must use the same assignment'
  )
  assert.doesNotMatch(
    devHubPageSource,
    /itemKeys/u,
    'overview stages must not maintain a second tool-key list'
  )
  assert.match(devHubPageSource, /item\.areaKey === stage\.key/u)
})

test('devHub: fifteen dev pages share the backend-style workspace shell', () => {
  assert.equal(devPageSources.length, 15)
  devPageSources.forEach((source) => {
    assert.match(source, /erp-dev-workspace-page/u)
    assert.match(source, /<DevPageNav/u)
  })
})

test('devHub: entry cards keep technical paths behind an accessible disclosure', () => {
  assert.match(
    devEntrySourceDetailsSource,
    /<details className="erp-dev-entry-source-details">/u
  )
  assert.match(
    devEntrySourceDetailsSource,
    /<summary>查看路径与维护来源<\/summary>/u
  )
  assert.match(devEntrySourceDetailsSource, /<dt>页面路径<\/dt>/u)
  assert.match(devEntrySourceDetailsSource, /<dt>维护来源<\/dt>/u)

  for (const pageSource of [devHubPageSource, devWorkbenchAreaPageSource]) {
    assert.match(
      pageSource,
      /<DevEntrySourceDetails route=\{item\.route\} source=\{item\.source\} \/>/u
    )
    assert.doesNotMatch(
      pageSource,
      /<Text className="erp-dev-hub-card__(?:route|source)">/u
    )
  }
})

test('devHub: lists existing dev-only entry routes without backend assumptions', () => {
  assert.deepEqual(
    DEV_HUB_ITEMS.map((item) => item.route),
    [
      '/__dev/product-core',
      '/__dev/permission-relationships',
      '/__dev/governance',
      '/__dev/status-flows',
      '/__dev/business-usability',
      '/__dev/docs',
      '/__dev/testing',
      '/__dev/quality-gates',
      '/__dev/data-preparation',
      '/__dev/prototypes',
      '/__dev/customer-config',
      '/__dev/database-migration',
      '/__dev/version-center',
      '/__dev/drill-recovery',
    ]
  )
  assert(
    DEV_HUB_ITEMS.every((item) => item.route.startsWith('/__dev/')),
    'all child entries must remain under /__dev'
  )
  assert(
    DEV_HUB_ITEMS.every(
      (item) =>
        item.truthSource &&
        Array.isArray(item.guardrails) &&
        item.guardrails.length > 0
    ),
    'all dev hub entries must expose truth source and guardrail metadata'
  )

  const docsItem = DEV_HUB_ITEMS.find((item) => item.key === 'docs')
  assert.match(docsItem?.truthSource || '', /当前工作区 Markdown/)
  assert.doesNotMatch(docsItem?.description || '', /tracked Markdown/)

  const productCoreItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'product-core'
  )
  assert.equal(productCoreItem?.title, '产品内核 / Product Core')
  assert.equal(productCoreItem?.source, 'docs/product/产品能力进度台账.md')
  assert.match(productCoreItem?.truthSource || '', /唯一产品能力进度台账/u)
  assert.match(
    productCoreItem?.guardrails?.join(' ') || '',
    /不等于发布或验收/u
  )

  const permissionRelationshipsItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'permission-relationships'
  )
  assert.equal(
    permissionRelationshipsItem?.title,
    '权限关系 / Effective Access'
  )
  assert.equal(
    permissionRelationshipsItem?.source,
    'docs/product/配置与权限策略.md'
  )
  assert.match(
    permissionRelationshipsItem?.guardrails?.join(' ') || '',
    /不在本页写权限/u
  )
  assert.match(
    permissionRelationshipsItem?.guardrails?.join(' ') || '',
    /不汇入任务、单据、流程或业务事实/u
  )
  assert.match(permissionRelationshipsItem?.truthSource || '', /正式菜单投影/u)
  assert.match(permissionRelationshipsItem?.description || '', /实际侧栏/u)

  const businessUsabilityItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'business-usability'
  )
  assert.equal(
    businessUsabilityItem?.source,
    'web/src/erp/config/businessUsabilityCatalog.mjs'
  )
  assert.match(businessUsabilityItem?.truthSource || '', /岗位帮助内容/u)
  assert.match(
    businessUsabilityItem?.guardrails?.join(' ') || '',
    /不复制权限与岗位责任/u
  )
  assert.match(businessUsabilityItem?.description || '', /不代表实际权限/u)

  const testingItem = DEV_HUB_ITEMS.find((item) => item.key === 'testing')
  assert.equal(
    testingItem?.status,
    '策略与固定采集 / Strategy and fixed collection'
  )
  assert.match(testingItem?.guardrails?.join(' ') || '', /固定覆盖率采集器/)
  assert.doesNotMatch(
    testingItem?.guardrails?.join(' ') || '',
    /No shell execution/
  )

  const qualityGatesItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'quality-gates'
  )
  assert.equal(qualityGatesItem?.title, '质量门禁 / Quality Gates')
  assert.match(
    qualityGatesItem?.truthSource || '',
    /正式 full \/ strict runner/
  )
  assert.match(qualityGatesItem?.guardrails?.join(' ') || '', /唯一结果真源/)
  assert.match(
    qualityGatesItem?.guardrails?.join(' ') || '',
    /No arbitrary input/
  )

  const customerConfigItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'customer-config'
  )
  assert.match(customerConfigItem?.title || '', /客户配置/)
  assert.match(
    `${customerConfigItem?.status || ''} ${customerConfigItem?.description || ''}`,
    /预检.*发布/u
  )
  assert.match(customerConfigItem?.truthSource || '', /已登记客户配置包/)
  assert.doesNotMatch(customerConfigItem?.title || '', /导入/)

  const dataPreparationItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'data-preparation'
  )
  assert.match(dataPreparationItem?.title || '', /测试数据/)
  assert.equal(
    dataPreparationItem?.source,
    'docs/engineering/研发效能工作台与CI-CD设计.md'
  )
  assert.match(dataPreparationItem?.truthSource || '', /Source \/ Fact API/)
  assert.match(dataPreparationItem?.guardrails?.join(' ') || '', /本机系统边界/)
  assert.match(dataPreparationItem?.guardrails?.join(' ') || '', /只向前补齐/)
  assert.match(dataPreparationItem?.description || '', /业务场景固定批次/)
  assert.match(dataPreparationItem?.description || '', /长期保留/)

  const databaseMigrationItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'database-migration'
  )
  assert.match(databaseMigrationItem?.title || '', /数据库迁移/)
  assert.match(databaseMigrationItem?.truthSource || '', /migration \/ schema/)
  assert.match(
    databaseMigrationItem?.guardrails?.join(' ') || '',
    /No retry when unknown/
  )
  assert.match(databaseMigrationItem?.description || '', /无关工作区变化/)

  const drillRecoveryItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'drill-recovery'
  )
  assert.match(drillRecoveryItem?.title || '', /演练与恢复/)
  assert.match(drillRecoveryItem?.truthSource || '', /operation 回执/)
  assert.match(drillRecoveryItem?.guardrails?.join(' ') || '', /Risk-tiered/)
  assert.match(
    drillRecoveryItem?.guardrails?.join(' ') || '',
    /Fault injection disabled/
  )
  assert.match(drillRecoveryItem?.description || '', /P0、P1、P2/)
})

test('devHub: summary records dev-only boundary', () => {
  const summary = buildDevHubSummary()

  assert.equal(summary.entryCount, 14)
  assert.equal(summary.groupCount, 8)
  assert(summary.guardrailCount >= 9)
  assert.equal(summary.devOnly, true)
  assert.match(summary.boundary, /no formal menu/)
  assert.match(summary.boundary, /not ERP RBAC/)
  assert.match(summary.boundary, /no formal menu, production build/)
  assert.match(summary.boundary, /arbitrary target/)
  assert.doesNotMatch(summary.boundary, /no backend business/)
})

test('devHub: filters by title, group, source and route', () => {
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, '改动验证').map((item) => item.key),
    ['testing']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, 'config/customers').map(
      (item) => item.key
    ),
    ['customer-config']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, '不替代测试结果').map((item) => item.key),
    ['testing']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, 'No reference commands').map(
      (item) => item.key
    ),
    ['testing']
  )
  assert.equal(filterDevHubItems(DEV_HUB_ITEMS, 'missing').length, 0)
})

test('devHub: filters by governance group and keyword together', () => {
  assert.deepEqual(
    getDevHubGroupOptions(DEV_HUB_ITEMS).map((item) => item.value),
    [
      'all',
      '产品治理 / Product Governance',
      '权限治理 / Access Governance',
      '文档治理 / Docs',
      '业务链治理 / Business Chain Governance',
      '验证治理 / QA',
      '产品设计 / Product Design',
      '客户治理 / Customer Governance',
      '交付治理 / Delivery',
    ]
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, {
      group: '客户治理 / Customer Governance',
    }).map((item) => item.key),
    ['customer-config']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, {
      group: '客户治理 / Customer Governance',
      keyword: '测试',
    }).map((item) => item.key),
    ['customer-config']
  )
  assert.equal(filterDevHubItems(DEV_HUB_ITEMS, { group: 'unknown' }).length, 0)
})

test('devHub: pinned routes keep valid unique dev entries up to the pin limit', () => {
  assert.deepEqual(
    normalizeDevHubPinnedRoutes([
      '/__dev/testing',
      '/__dev/governance',
      '/__dev/docs',
      '/__dev/customer-config',
      '/__dev/prototypes',
      '/erp/dashboard',
      '/__dev/docs',
    ]),
    [
      '/__dev/testing',
      '/__dev/governance',
      '/__dev/docs',
      '/__dev/customer-config',
      '/__dev/prototypes',
    ]
  )
  assert.deepEqual(normalizeDevHubPinnedRoutes('invalid'), [])
})

test('devHub: toggling pinned routes adds, removes and ignores invalid routes', () => {
  assert.deepEqual(toggleDevHubPinnedRoute('/__dev/testing', ['/__dev/docs']), [
    '/__dev/testing',
    '/__dev/docs',
  ])
  assert.deepEqual(
    toggleDevHubPinnedRoute('/__dev/testing', [
      '/__dev/testing',
      '/__dev/docs',
    ]),
    ['/__dev/docs']
  )
  assert.deepEqual(toggleDevHubPinnedRoute('/erp/dashboard', ['/__dev/docs']), [
    '/__dev/docs',
  ])
})

test('devHub: builds pinned items in stored route order', () => {
  assert.deepEqual(
    buildDevHubPinnedItems(DEV_HUB_ITEMS, [
      '/__dev/prototypes',
      '/__dev/docs',
    ]).map((item) => item.key),
    ['prototypes', 'docs']
  )
})
