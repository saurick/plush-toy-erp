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
  DEV_WORKSPACE_NAV_ITEMS,
  resolveDevPageFavicon,
  resolveDevPageTitle,
  resolveDevWorkbenchAreaKey,
} from './devRoutes.mjs'

const devPageSources = [
  'DevHubPage.jsx',
  'DevGovernancePage.jsx',
  'DevFlowStateObservatoryPage.jsx',
  'DevDocsPage.jsx',
  'DevTestingPage.jsx',
  'DevDataPreparationPage.jsx',
  'DevPrototypesPage.jsx',
  'DevCapabilityLedgerPage.jsx',
  'DevCustomerConfigPage.jsx',
  'DevDatabaseMigrationPage.jsx',
  'DevVersionCenterPage.jsx',
].map((fileName) =>
  readFileSync(new URL(`../pages/${fileName}`, import.meta.url), 'utf8')
)
const devPageNavSource = readFileSync(
  new URL('../components/DevPageNav.jsx', import.meta.url),
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
    resolveDevPageTitle('/__dev/testing', 'Plush Toy ERP'),
    '测试入口 · Plush Toy ERP'
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
    '流程与状态观察台 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/quality', 'Plush Toy ERP'),
    '质量验证 · Plush Toy ERP'
  )
  assert.equal(resolveDevPageFavicon('/__dev'), '/favicon-dev.svg')
  assert.equal(resolveDevPageFavicon('/__dev/testing'), '/favicon-testing.svg')
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
    '版本发布与部署中心 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/data-preparation', 'Plush Toy ERP'),
    '测试数据准备中心 · Plush Toy ERP'
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
    resolveDevWorkbenchAreaKey('/__dev/status-flows'),
    'product-engineering'
  )
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/testing'), 'quality')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/data-preparation'), 'quality')
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/customer-config'), 'delivery')
  assert.equal(
    resolveDevWorkbenchAreaKey('/__dev/database-migration'),
    'delivery'
  )
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/version-center'), 'delivery')
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

test('devHub: eleven dev pages share the backend-style workspace shell', () => {
  assert.equal(devPageSources.length, 11)
  devPageSources.forEach((source) => {
    assert.match(source, /erp-dev-workspace-page/u)
    assert.match(source, /<DevPageNav/u)
  })
})

test('devHub: lists existing dev-only entry routes without backend assumptions', () => {
  assert.deepEqual(
    DEV_HUB_ITEMS.map((item) => item.route),
    [
      '/__dev/governance',
      '/__dev/status-flows',
      '/__dev/docs',
      '/__dev/testing',
      '/__dev/data-preparation',
      '/__dev/prototypes',
      '/__dev/capability-ledger',
      '/__dev/customer-config',
      '/__dev/database-migration',
      '/__dev/version-center',
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

  const customerConfigItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'customer-config'
  )
  assert.match(customerConfigItem?.title || '', /预检与发布/)
  assert.match(customerConfigItem?.truthSource || '', /已登记客户配置包/)
  assert.doesNotMatch(customerConfigItem?.title || '', /导入/)

  const dataPreparationItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'data-preparation'
  )
  assert.match(dataPreparationItem?.title || '', /数据准备/)
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
})

test('devHub: summary records dev-only boundary', () => {
  const summary = buildDevHubSummary()

  assert.equal(summary.entryCount, 10)
  assert.equal(summary.groupCount, 7)
  assert(summary.guardrailCount >= 10)
  assert.equal(summary.devOnly, true)
  assert.match(summary.boundary, /no formal menu/)
  assert.match(summary.boundary, /not ERP RBAC/)
  assert.match(summary.boundary, /no formal menu, production build/)
  assert.match(summary.boundary, /arbitrary target/)
  assert.doesNotMatch(summary.boundary, /no backend business/)
})

test('devHub: filters by title, group, source and route', () => {
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, '测试入口').map((item) => item.key),
    ['testing']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, 'capability-ledger').map(
      (item) => item.key
    ),
    ['capability-ledger']
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
      '文档治理 / Docs',
      '流程治理 / Flow Governance',
      '验证治理 / QA',
      '产品设计 / Product Design',
      '产品治理 / Product Governance',
      '客户治理 / Customer Governance',
      '交付治理 / Delivery',
    ]
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, {
      group: '产品治理 / Product Governance',
    }).map((item) => item.key),
    ['capability-ledger']
  )
  assert.deepEqual(
    filterDevHubItems(DEV_HUB_ITEMS, {
      group: '产品治理 / Product Governance',
      keyword: '测试',
    }),
    []
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
      '/__dev/capability-ledger',
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
