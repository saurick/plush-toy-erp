export const DEV_HUB_ROUTE = '/__dev'
export const DEV_DOCS_ROUTE = '/__dev/docs'
export const DEV_GOVERNANCE_ROUTE = '/__dev/governance'
export const DEV_PROTOTYPES_ROUTE = '/__dev/prototypes'
export const DEV_CAPABILITY_LEDGER_ROUTE = '/__dev/capability-ledger'
export const DEV_CUSTOMER_CONFIG_ROUTE = '/__dev/customer-config'
export const DEV_TESTING_ROUTE = '/__dev/testing'

export const DEV_WORKSPACE_NAV_ITEMS = Object.freeze([
  {
    route: DEV_GOVERNANCE_ROUTE,
    label: '治理',
    description: '确认规则与边界',
  },
  {
    route: DEV_DOCS_ROUTE,
    label: '文档',
    description: '查找当前真源',
  },
  {
    route: DEV_TESTING_ROUTE,
    label: '测试',
    description: '选择验证命令',
  },
  {
    route: DEV_PROTOTYPES_ROUTE,
    label: '原型',
    description: '查看设计资产',
  },
  {
    route: DEV_CAPABILITY_LEDGER_ROUTE,
    label: '能力',
    description: '核对成熟度与交付',
  },
  {
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    label: '客户配置',
    description: '预检与发布控制',
  },
])

export const DEV_PAGE_TITLE_BY_ROUTE = Object.freeze({
  [DEV_HUB_ROUTE]: '开发导航',
  [DEV_GOVERNANCE_ROUTE]: '项目治理地图',
  [DEV_DOCS_ROUTE]: '开发文档',
  [DEV_TESTING_ROUTE]: '测试入口',
  [DEV_PROTOTYPES_ROUTE]: '产品原型',
  [DEV_CAPABILITY_LEDGER_ROUTE]: '能力台账',
  [DEV_CUSTOMER_CONFIG_ROUTE]: '客户配置包预检与发布',
})

export function resolveDevPageTitle(pathname, appTitle) {
  const rawPath = String(pathname || '')
  const normalizedPath = rawPath === '/' ? rawPath : rawPath.replace(/\/+$/, '')
  const devTitle = DEV_PAGE_TITLE_BY_ROUTE[normalizedPath]
  return devTitle ? `${devTitle} · ${appTitle}` : appTitle
}
