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
  DEV_TESTING_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
  DEV_WORKSPACE_NAV_ITEMS,
  getDevSecondaryNavItems,
  resolveDevNavigationRoute,
  resolveDevPageTitle,
  resolveDevWorkbenchAreaKey,
} from './devRoutes.mjs'

const devToolTableSource = readFileSync(
  new URL('../components/DevToolTable.jsx', import.meta.url),
  'utf8'
)
const devPageSources = [
  'DevHubPage.jsx',
  'DevProductCorePage.jsx',
  'DevPermissionRelationshipsPage.jsx',
  'DevIntegrationPage.jsx',
  'DevFlowStateObservatoryPage.jsx',
  'DevTaskHandlingPage.jsx',
  'DevBusinessUsabilityPage.jsx',
  'DevDocsPage.jsx',
  'DevTestingPage.jsx',
  'DevQualityGatesPage.jsx',
  'DevDataPreparationPage.jsx',
  'DevUIDesignPage.jsx',
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
const devEnvironmentEvidencePanelSource = readFileSync(
  new URL('../components/DevEnvironmentEvidencePanel.jsx', import.meta.url),
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
    '产品能力 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/permission-relationships', 'Plush Toy ERP'),
    '权限关系 · Plush Toy ERP'
  )
  assert.equal(resolveDevPageTitle('/__dev/integration', 'Plush Toy ERP'), '接口与集成 · Plush Toy ERP')
  assert.equal(
    resolveDevPageTitle('/__dev/testing', 'Plush Toy ERP'),
    '测试执行 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/erp/dashboard', 'Plush Toy ERP'),
    'Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/docs/', 'Plush Toy ERP'),
    '项目文档 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/status-flows', 'Plush Toy ERP'),
    '业务链路 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/business-usability', 'Plush Toy ERP'),
    '页面说明检查 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/quality', 'Plush Toy ERP'),
    '测试验证 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/quality-gates', 'Plush Toy ERP'),
    '质量门禁 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/version-center', 'Plush Toy ERP'),
    '版本发布 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/version-center/guide', 'Plush Toy ERP'),
    '手动与应急发布指引 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/drill-recovery', 'Plush Toy ERP'),
    '安全与恢复 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/data-preparation', 'Plush Toy ERP'),
    '测试数据 · Plush Toy ERP'
  )
  assert.equal(
    resolveDevPageTitle('/__dev/database-migration', 'Plush Toy ERP'),
    '数据库迁移 · Plush Toy ERP'
  )
})

test('devHub: shared workspace navigation exposes overview and four responsibility areas and keeps all deep links', () => {
  assert.deepEqual(
    DEV_WORKSPACE_NAV_ITEMS.map((item) => item.route),
    [
      '/__dev',
      '/__dev/product-engineering',
      '/__dev/development-resources',
      '/__dev/quality',
      '/__dev/delivery',
    ]
  )
  assert.deepEqual(
    DEV_WORKSPACE_NAV_ITEMS.map((item) => item.label),
    ['总览', '产品与业务', '开发资源', '测试验证', '交付运维']
  )
  assert.deepEqual(
    DEV_SECONDARY_NAV_ITEMS.map((item) => [item.areaKey, item.label]),
    [
      ['product-engineering', '产品能力'],
      ['product-engineering', '业务链路'],
      ['product-engineering', '业务规则'],
      ['product-engineering', '业务专题'],
      ['product-engineering', '任务办理'],
      ['product-engineering', '权限关系'],
      ['product-engineering', '交互设计'],
      ['development-resources', '接口与集成'],
      ['quality', '页面说明检查'],
      ['development-resources', '项目文档'],
      ['development-resources', '项目 Skill'],
      ['quality', '测试执行'],
      ['quality', '链路实测报告'],
      ['quality', '质量门禁'],
      ['quality', '测试数据'],
      ['delivery', '客户配置'],
      ['delivery', '数据库迁移'],
      ['delivery', '版本发布'],
      ['delivery', '安全与恢复'],
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
    'quality'
  )
  assert.equal(
    getDevSecondaryNavItems('quality').some(
      (item) => item.route === '/__dev/business-usability'
    ),
    false,
    '页面说明检查保留登记和深链，通过测试执行按需进入'
  )
  assert.equal(getDevSecondaryNavItems('product-engineering').length, 7)
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/integration'), 'development-resources')
  assert.deepEqual(
    getDevSecondaryNavItems('quality').map((item) => item.key),
    ['testing', 'quality-gates', 'data-preparation'],
    '链路实测报告保留登记和深链，从测试执行的报告视图按需进入'
  )
  assert.equal(resolveDevWorkbenchAreaKey('/__dev/business-chain-audit'), 'quality')
  assert.equal(resolveDevPageTitle('/__dev/business-chain-audit', 'ERP'), '链路实测报告 · ERP')
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
    /getDevSecondaryNavItems\(area.key\)/u
  )
  assert.doesNotMatch(
    devPageNavSource,
    /currentWorkspaceItem\s*\?\s*\[\]/u,
    'area landing pages must keep their secondary navigation visible'
  )
})

test('devHub: quality area uses the registered tool directory without a duplicate header shortcut', () => {
  assert.doesNotMatch(devWorkbenchAreaPageSource, /<Navigate/u)
  assert.doesNotMatch(devWorkbenchAreaPageSource, /开始验证|href=\{DEV_TESTING_ROUTE\}/u)
  assert.match(devWorkbenchAreaPageSource, /<DevToolTable/u)
  assert.ok(getDevSecondaryNavItems(DEV_WORKBENCH_AREA_KEYS.quality).some((item) => item.route === DEV_TESTING_ROUTE))
})

test('devHub: area tools follow navigation order and development resources own project graphs', () => {
  assert.match(
    devWorkbenchAreaPageSource,
    /getDevSecondaryNavItems\(areaKey\)/u
  )
  assert.match(devWorkbenchAreaPageSource, /DEV_HUB_ITEMS\.find\(\(item\) => item\.key === entry\.key\)/u)
  assert.match(devWorkbenchAreaPageSource, /<DevToolTable/u)
  assert.match(
    devWorkbenchAreaPageSource,
    /\{isDelivery \? \([\s\S]*?<DevTaskNav/u
  )
  assert.match(
    devWorkbenchAreaPageSource,
    /开发资源查看方式/u
  )
  assert.match(devWorkbenchAreaPageSource, /DEV_DEVELOPMENT_RESOURCES_VIEWS/u)
  assert.match(devWorkbenchAreaPageSource, /<DevProjectRelationships/u)
  assert.match(devToolTableSource, /DEV_PAGE_TITLE_BY_ROUTE\[item.route\]/u)
  assert.match(devToolTableSource, /<th scope="col">用来做什么<\/th>/u)
})

test('devHub: report details select their visible parent without changing page identity', () => {
  assert.equal(resolveDevNavigationRoute('/__dev/business-chain-audit'), '/__dev/testing')
  assert.equal(resolveDevNavigationRoute('/__dev/business-chain-audit/'), '/__dev/testing')
  assert.equal(resolveDevPageTitle('/__dev/business-chain-audit', 'ERP'), '链路实测报告 · ERP')

  for (const item of [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]) {
    if (!item.navigationParentRoute) {
      assert.equal(resolveDevNavigationRoute(item.route), item.route)
      continue
    }
    const parent = getDevSecondaryNavItems(item.areaKey).find(
      (entry) => entry.route === item.navigationParentRoute
    )
    assert(parent, `${item.label} 的所属菜单应为同一责任区的可见入口`)
    assert.equal(parent.navigationParentRoute, undefined, '所属菜单必须直接可见，不递归委托')
  }
  assert.equal(resolveDevNavigationRoute('/__dev/unregistered'), '/__dev/unregistered')
  assert.equal(resolveDevNavigationRoute(), '')
})

test('devHub: tools share one area registry without duplicate overview stage inventories', () => {
  const toolAreaKeys = [
    DEV_WORKBENCH_AREA_KEYS.productEngineering,
    DEV_WORKBENCH_AREA_KEYS.developmentResources,
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
  assert.match(devHubPageSource, /filterDevHubItems\(source/u)
  assert.doesNotMatch(
    devHubPageSource,
    /stageItems|erp-dev-overview-stage__details|这一阶段包含什么/u
  )
})

test('devHub: dev pages share the backend-style workspace shell', () => {
  assert.equal(devPageSources.length, 16)
  devPageSources.forEach((source) => {
    assert.match(source, /erp-dev-workspace-page/u)
    assert.match(source, /<DevPageNav/u)
  })
  const routes = readFileSync(new URL('../DevWorkbenchRoutes.jsx', import.meta.url), 'utf8')
  const report = readFileSync(new URL('../pages/DevBusinessChainAuditPage.jsx', import.meta.url), 'utf8')
  assert.match(routes, /<Route element=\{<DevTestingPage \/>\}>\s*<Route path="testing" \/>\s*<Route path="business-chain-audit" element=\{<DevBusinessChainAuditPage \/>\} \/>\s*<\/Route>/u)
  assert.doesNotMatch(report, /erp-dev-workspace-page|<DevPageNav/u, '链路报告复用测试执行布局，不能嵌套侧栏或工作台根节点')
})

test('devHub: delivery overview owns the local, demo, test, and isolated evidence comparison', () => {
  assert.doesNotMatch(devPageNavSource, /DevEnvironmentEvidencePanel/u)
  assert.doesNotMatch(devPageNavSource, /页面工具|开发工具仅供维护使用/u)
  assert.match(
    devWorkbenchAreaPageSource,
    /import DevEnvironmentEvidencePanel from '..\/components\/DevEnvironmentEvidencePanel\.jsx'/u
  )
  assert.match(
    devWorkbenchAreaPageSource,
    /const isDelivery = areaKey === DEV_WORKBENCH_AREA_KEYS\.delivery/u
  )
  assert.match(
    devWorkbenchAreaPageSource,
    /activeView === 'environments' \? \([\s\S]*?<DevEnvironmentEvidencePanel \/>/u
  )
  assert.match(devEnvironmentEvidencePanelSource, /环境与验收事实/u)
  assert.match(devEnvironmentEvidencePanelSource, /sharedSummaryResources/u)
  assert.match(devEnvironmentEvidencePanelSource, /readSharedSummary/u)
  assert.match(devEnvironmentEvidencePanelSource, /SUMMARY_TTL_MS = 120_000/u)
  assert.match(devEnvironmentEvidencePanelSource, /requestVersionRef/u)
  assert.doesNotMatch(
    devEnvironmentEvidencePanelSource,
    /Promise\.allSettled|new AbortController\(\)/u
  )
  assert.match(devEnvironmentEvidencePanelSource, /dataLoading/u)
  assert.match(devEnvironmentEvidencePanelSource, /deliveryLoading/u)
  assert.match(devEnvironmentEvidencePanelSource, /权威读回/u)
  assert.doesNotMatch(
    devEnvironmentEvidencePanelSource,
    /setInterval|setTimeout/u
  )
  assert.doesNotMatch(
    devEnvironmentEvidencePanelSource,
    /name=["'](?:host|port|target|path|command|dsn|password|token)["']/iu
  )
})

test('devHub: tool tables explain purpose without reference disclosures', () => {
  for (const pageSource of [devHubPageSource, devWorkbenchAreaPageSource]) {
    assert.match(pageSource, /<DevToolTable/u)
    assert.doesNotMatch(
      pageSource,
      /<Text className="erp-dev-hub-card__(?:route|source)">/u
    )
  }
  assert.match(devToolTableSource, /item\.description/u)
  assert.doesNotMatch(devToolTableSource, /DevToolInfo|item\.source|item\.truthSource|item\.guardrails/u)
})

test('devHub: lists existing dev-only entry routes without backend assumptions', () => {
  assert.deepEqual(
    DEV_HUB_ITEMS.map((item) => item.route),
    [
      '/__dev/product-core',
      '/__dev/status-flows',
      '/__dev/business-rules',
      '/__dev/business-topics',
      '/__dev/task-handling',
      '/__dev/permission-relationships',
      '/__dev/ui-design',
      '/__dev/integration',
      '/__dev/business-usability',
      '/__dev/docs',
      '/__dev/project-skills',
      '/__dev/testing',
      '/__dev/business-chain-audit',
      '/__dev/quality-gates',
      '/__dev/data-preparation',
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
  assert.equal(productCoreItem?.title, '产品能力 / Product Capabilities')
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
  assert.match(
    businessUsabilityItem?.guardrails?.join(' ') || '',
    /不代表实际权限/u
  )

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
  assert.match(dataPreparationItem?.guardrails?.join(' ') || '', /本地与服务器 demo 按登记目标区分/)
  assert.match(dataPreparationItem?.guardrails?.join(' ') || '', /只向前补齐/)
  assert.match(dataPreparationItem?.guardrails?.join(' ') || '', /业务场景固定批次/)
  assert.match(dataPreparationItem?.guardrails?.join(' ') || '', /长期保留/)

  const databaseMigrationItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'database-migration'
  )
  assert.match(databaseMigrationItem?.title || '', /数据库迁移/)
  assert.match(databaseMigrationItem?.truthSource || '', /migration \/ schema/)
  assert.match(
    databaseMigrationItem?.guardrails?.join(' ') || '',
    /No retry when unknown/
  )
  assert.match(databaseMigrationItem?.guardrails?.join(' ') || '', /无关工作区变化/)

  const drillRecoveryItem = DEV_HUB_ITEMS.find(
    (item) => item.key === 'drill-recovery'
  )
  assert.match(drillRecoveryItem?.title || '', /安全与恢复/)
  assert.match(drillRecoveryItem?.truthSource || '', /operation 回执/)
  assert.match(drillRecoveryItem?.guardrails?.join(' ') || '', /Risk-tiered/)
  assert.match(
    drillRecoveryItem?.guardrails?.join(' ') || '',
    /Fault injection disabled/
  )
  assert.match(drillRecoveryItem?.guardrails?.join(' ') || '', /未核验/)
})

test('devHub: summary records dev-only boundary', () => {
  const summary = buildDevHubSummary()

  assert.equal(summary.entryCount, 19)
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
    filterDevHubItems(DEV_HUB_ITEMS, '测试执行').map((item) => item.key),
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
      '业务链治理 / Business Chain Governance',
      '权限治理 / Access Governance',
      '产品设计 / Product Design',
      '验证治理 / QA',
      '文档治理 / Docs',
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
      '/__dev/product-core',
      '/__dev/docs',
      '/__dev/customer-config',
      '/__dev/ui-design',
      '/erp/dashboard',
      '/__dev/docs',
    ]),
    [
      '/__dev/testing',
      '/__dev/product-core',
      '/__dev/docs',
      '/__dev/customer-config',
      '/__dev/ui-design',
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
      '/__dev/ui-design',
      '/__dev/docs',
    ]).map((item) => item.key),
    ['ui-design', 'docs']
  )
})

test('devHub: every tool has a unique owner and old name searches retain their destination', () => {
  assert.equal(new Set(DEV_SECONDARY_NAV_ITEMS.map((item) => item.route)).size, DEV_SECONDARY_NAV_ITEMS.length)
  for (const navigation of DEV_SECONDARY_NAV_ITEMS) {
    const item = DEV_HUB_ITEMS.find((entry) => entry.key === navigation.key)
    assert.equal(item.route, navigation.route)
    assert.equal(item.areaKey, navigation.areaKey)
    assert.equal(item.title.split(' / ')[0], navigation.label)
    assert.equal(DEV_PAGE_TITLE_BY_ROUTE[item.route], navigation.label)
    for (const keyword of item.searchKeywords || []) {
      assert(filterDevHubItems(DEV_HUB_ITEMS, keyword).some((entry) => entry.route === item.route))
    }
  }
  assert.deepEqual(getDevSecondaryNavItems('development-resources').map((item) => item.route), [
    '/__dev/integration', '/__dev/docs', '/__dev/project-skills',
  ])
})
