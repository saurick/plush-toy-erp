export const DEV_HUB_ROUTE = '/__dev'
export const DEV_PRODUCT_ENGINEERING_ROUTE = '/__dev/product-engineering'
export const DEV_PRODUCT_CORE_ROUTE = '/__dev/product-core'
export const DEV_PERMISSION_RELATIONSHIPS_ROUTE =
  '/__dev/permission-relationships'
export const DEV_QUALITY_ROUTE = '/__dev/quality'
export const DEV_DELIVERY_ROUTE = '/__dev/delivery'

export const DEV_DOCS_ROUTE = '/__dev/docs'
export const DEV_GOVERNANCE_ROUTE = '/__dev/governance'
export const DEV_STATUS_FLOWS_ROUTE = '/__dev/status-flows'
export const DEV_PROTOTYPES_ROUTE = '/__dev/prototypes'
export const DEV_CUSTOMER_CONFIG_ROUTE = '/__dev/customer-config'
export const DEV_DATABASE_MIGRATION_ROUTE = '/__dev/database-migration'
export const DEV_TESTING_ROUTE = '/__dev/testing'
export const DEV_QUALITY_GATES_ROUTE = '/__dev/quality-gates'
export const DEV_DATA_PREPARATION_ROUTE = '/__dev/data-preparation'
export const DEV_VERSION_CENTER_ROUTE = '/__dev/version-center'
export const DEV_DRILL_RECOVERY_ROUTE = '/__dev/drill-recovery'

export const DEV_WORKBENCH_AREA_KEYS = Object.freeze({
  overview: 'overview',
  productEngineering: 'product-engineering',
  quality: 'quality',
  delivery: 'delivery',
})

// 一级菜单使用稳定责任域；二级菜单使用开发者要完成的任务或查看的对象。
// 路由和内部 key 不随可见名称调整，避免文案治理扩大为深链迁移。
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
    description: '内核、权限、规则与业务链',
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_QUALITY_ROUTE,
    label: '质量验证',
    description: '改动验证、测试数据与证据',
  }),
  Object.freeze({
    key: DEV_WORKBENCH_AREA_KEYS.delivery,
    route: DEV_DELIVERY_ROUTE,
    label: '交付运行',
    description: '配置、迁移、发布与恢复',
  }),
])

export const DEV_SECONDARY_NAV_ITEMS = Object.freeze([
  Object.freeze({
    key: 'product-core',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_PRODUCT_CORE_ROUTE,
    label: '产品内核',
  }),
  Object.freeze({
    key: 'permission-relationships',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_PERMISSION_RELATIONSHIPS_ROUTE,
    label: '权限关系',
  }),
  Object.freeze({
    key: 'governance',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_GOVERNANCE_ROUTE,
    label: '改动指南',
  }),
  Object.freeze({
    key: 'status-flows',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_STATUS_FLOWS_ROUTE,
    label: '业务链观察',
  }),
  Object.freeze({
    key: 'docs',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_DOCS_ROUTE,
    label: '开发文档',
  }),
  Object.freeze({
    key: 'prototypes',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    route: DEV_PROTOTYPES_ROUTE,
    label: '产品原型',
  }),
  Object.freeze({
    key: 'testing',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_TESTING_ROUTE,
    label: '改动验证',
  }),
  Object.freeze({
    key: 'quality-gates',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_QUALITY_GATES_ROUTE,
    label: '质量门禁',
  }),
  Object.freeze({
    key: 'data-preparation',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    route: DEV_DATA_PREPARATION_ROUTE,
    label: '测试数据',
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
    label: '版本发布',
  }),
  Object.freeze({
    key: 'drill-recovery',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    route: DEV_DRILL_RECOVERY_ROUTE,
    label: '演练与恢复',
  }),
])

export const DEV_PAGE_TITLE_BY_ROUTE = Object.freeze({
  [DEV_HUB_ROUTE]: '研发效能工作台',
  ...Object.fromEntries(
    DEV_WORKSPACE_NAV_ITEMS.filter((item) => item.route !== DEV_HUB_ROUTE).map(
      (item) => [item.route, item.label]
    )
  ),
  ...Object.fromEntries(
    DEV_SECONDARY_NAV_ITEMS.map((item) => [item.route, item.label])
  ),
})

function normalizeDevPathname(pathname = '') {
  const rawPath = String(pathname || '')
  if (rawPath === '/') return rawPath
  return rawPath.replace(/\/+$/, '')
}

export const DEV_PAGE_FAVICON_BY_ROUTE = Object.freeze({
  [DEV_HUB_ROUTE]: '/favicon-dev.svg',
  [DEV_PRODUCT_ENGINEERING_ROUTE]: '/favicon-dev.svg',
  [DEV_PRODUCT_CORE_ROUTE]: '/favicon-dev.svg',
  [DEV_PERMISSION_RELATIONSHIPS_ROUTE]: '/favicon-dev.svg',
  [DEV_QUALITY_ROUTE]: '/favicon-dev.svg',
  [DEV_DELIVERY_ROUTE]: '/favicon-dev.svg',
  [DEV_GOVERNANCE_ROUTE]: '/favicon-governance.svg',
  [DEV_STATUS_FLOWS_ROUTE]: '/favicon-dev.svg',
  [DEV_DOCS_ROUTE]: '/favicon-docs.svg',
  [DEV_TESTING_ROUTE]: '/favicon-testing.svg',
  [DEV_QUALITY_GATES_ROUTE]: '/favicon-testing.svg',
  [DEV_DATA_PREPARATION_ROUTE]: '/favicon-testing.svg',
  [DEV_PROTOTYPES_ROUTE]: '/favicon-prototypes.svg',
  [DEV_CUSTOMER_CONFIG_ROUTE]: '/favicon-customer-config.svg',
  [DEV_DATABASE_MIGRATION_ROUTE]: '/favicon-dev.svg',
  [DEV_VERSION_CENTER_ROUTE]: '/favicon-dev.svg',
  [DEV_DRILL_RECOVERY_ROUTE]: '/favicon-dev.svg',
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
