export const DEV_HUB_ROUTE = '/__dev'
export const DEV_PRODUCT_ENGINEERING_ROUTE = '/__dev/product-engineering'
export const DEV_QUALITY_ROUTE = '/__dev/quality'
export const DEV_DELIVERY_ROUTE = '/__dev/delivery'

export const DEV_DOCS_ROUTE = '/__dev/docs'
export const DEV_GOVERNANCE_ROUTE = '/__dev/governance'
export const DEV_STATUS_FLOWS_ROUTE = '/__dev/status-flows'
export const DEV_PROTOTYPES_ROUTE = '/__dev/prototypes'
export const DEV_CAPABILITY_LEDGER_ROUTE = '/__dev/capability-ledger'
export const DEV_CUSTOMER_CONFIG_ROUTE = '/__dev/customer-config'
export const DEV_DATABASE_MIGRATION_ROUTE = '/__dev/database-migration'
export const DEV_TESTING_ROUTE = '/__dev/testing'
export const DEV_DATA_PREPARATION_ROUTE = '/__dev/data-preparation'
export const DEV_VERSION_CENTER_ROUTE = '/__dev/version-center'

export const DEV_WORKBENCH_AREA_KEYS = Object.freeze({
  overview: 'overview',
  productEngineering: 'product-engineering',
  quality: 'quality',
  delivery: 'delivery',
})

export const DEV_WORKSPACE_NAV_ITEMS = Object.freeze([
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.overview,
    route: DEV_HUB_ROUTE,
    label: '总览',
    description: '入口、真源与边界',
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_PRODUCT_ENGINEERING_ROUTE,
    label: '产品工程',
    description: '状态、流程与产品资产',
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_QUALITY_ROUTE,
    label: '质量验证',
    description: '门禁、测试与稳定性',
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.delivery,
    route: DEV_DELIVERY_ROUTE,
    label: '交付运行',
    description: '配置、版本与发布回执',
  }),
])

export const DEV_SECONDARY_NAV_ITEMS = Object.freeze([
  Object.freeze({
    key: 'governance',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_GOVERNANCE_ROUTE,
    label: '治理地图',
  }),
  Object.freeze({
    key: 'status-flows',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_STATUS_FLOWS_ROUTE,
    label: '流程状态',
  }),
  Object.freeze({
    key: 'docs',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_DOCS_ROUTE,
    label: '文档真源',
  }),
  Object.freeze({
    key: 'prototypes',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_PROTOTYPES_ROUTE,
    label: '产品原型',
  }),
  Object.freeze({
    key: 'capability-ledger',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_CAPABILITY_LEDGER_ROUTE,
    label: '能力真源',
  }),
  Object.freeze({
    key: 'testing',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_TESTING_ROUTE,
    label: '测试入口',
  }),
  Object.freeze({
    key: 'data-preparation',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_DATA_PREPARATION_ROUTE,
    label: '数据准备',
  }),
  Object.freeze({
    key: 'customer-config',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    label: '客户配置',
  }),
  Object.freeze({
    key: 'database-migration',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    route: DEV_DATABASE_MIGRATION_ROUTE,
    label: '数据库迁移',
  }),
  Object.freeze({
    key: 'version-center',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    route: DEV_VERSION_CENTER_ROUTE,
    label: '版本中心',
  }),
])

export const DEV_PAGE_TITLE_BY_ROUTE = Object.freeze({
  [DEV_HUB_ROUTE]: '研发效能工作台',
  [DEV_PRODUCT_ENGINEERING_ROUTE]: '产品工程',
  [DEV_QUALITY_ROUTE]: '质量验证',
  [DEV_DELIVERY_ROUTE]: '交付运行',
  [DEV_GOVERNANCE_ROUTE]: '项目治理地图',
  [DEV_STATUS_FLOWS_ROUTE]: '流程与状态观察台',
  [DEV_DOCS_ROUTE]: '开发文档',
  [DEV_TESTING_ROUTE]: '测试入口',
  [DEV_DATA_PREPARATION_ROUTE]: '测试数据准备中心',
  [DEV_PROTOTYPES_ROUTE]: '产品原型',
  [DEV_CAPABILITY_LEDGER_ROUTE]: '能力真源',
  [DEV_CUSTOMER_CONFIG_ROUTE]: '客户配置包预检与发布',
  [DEV_DATABASE_MIGRATION_ROUTE]: '数据库迁移',
  [DEV_VERSION_CENTER_ROUTE]: '版本发布与部署中心',
})

function normalizeDevPathname(pathname = '') {
  const rawPath = String(pathname || '')
  if (rawPath === '/') return rawPath
  return rawPath.replace(/\/+$/, '')
}

export const DEV_PAGE_FAVICON_BY_ROUTE = Object.freeze({
  [DEV_HUB_ROUTE]: '/favicon-dev.svg',
  [DEV_PRODUCT_ENGINEERING_ROUTE]: '/favicon-dev.svg',
  [DEV_QUALITY_ROUTE]: '/favicon-dev.svg',
  [DEV_DELIVERY_ROUTE]: '/favicon-dev.svg',
  [DEV_GOVERNANCE_ROUTE]: '/favicon-governance.svg',
  [DEV_STATUS_FLOWS_ROUTE]: '/favicon-dev.svg',
  [DEV_DOCS_ROUTE]: '/favicon-docs.svg',
  [DEV_TESTING_ROUTE]: '/favicon-testing.svg',
  [DEV_DATA_PREPARATION_ROUTE]: '/favicon-testing.svg',
  [DEV_PROTOTYPES_ROUTE]: '/favicon-prototypes.svg',
  [DEV_CAPABILITY_LEDGER_ROUTE]: '/favicon-capability-ledger.svg',
  [DEV_CUSTOMER_CONFIG_ROUTE]: '/favicon-customer-config.svg',
  [DEV_DATABASE_MIGRATION_ROUTE]: '/favicon-dev.svg',
  [DEV_VERSION_CENTER_ROUTE]: '/favicon-dev.svg',
})

export function resolveDevWorkbenchAreaKey(pathname = '') {
  const normalizedPath = normalizeDevPathname(pathname)
  const primaryItem = DEV_WORKSPACE_NAV_ITEMS.find(
    (item) => item.route === normalizedPath
  )
  if (primaryItem) return primaryItem.key

  return (
    DEV_SECONDARY_NAV_ITEMS.find((item) => item.route === normalizedPath)
      ?.areaKey || ''
  )
}

export function getDevSecondaryNavItems(areaKey = '') {
  return DEV_SECONDARY_NAV_ITEMS.filter((item) => item.areaKey === areaKey)
}

export function resolveDevPageTitle(pathname, appTitle) {
  const devTitle = DEV_PAGE_TITLE_BY_ROUTE[normalizeDevPathname(pathname)]
  return devTitle ? `${devTitle} · ${appTitle}` : appTitle
}

export function resolveDevPageFavicon(pathname = '') {
  return (
    DEV_PAGE_FAVICON_BY_ROUTE[normalizeDevPathname(pathname)] ||
    '/favicon-dev.svg'
  )
}
