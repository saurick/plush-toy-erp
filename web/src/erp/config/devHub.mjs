import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_HUB_ROUTE,
  DEV_PROTOTYPES_ROUTE,
  DEV_TESTING_ROUTE,
} from './devRoutes.mjs'

export { DEV_HUB_ROUTE }
export const DEV_HUB_PINNED_STORAGE_KEY = 'plush_erp_dev_hub_pinned_routes'
export const DEV_HUB_MAX_PINNED_ITEMS = 5
export const DEV_HUB_ALL_GROUP = 'all'

export const DEV_HUB_ITEMS = Object.freeze([
  Object.freeze({
    key: 'governance',
    title: '项目治理地图 / Governance Map',
    group: '文档治理 / Docs',
    route: DEV_GOVERNANCE_ROUTE,
    source: 'docs/项目治理地图.md',
    truthSource: '治理地图 Markdown / Governance Markdown',
    status: '只读可视化 / Read-only map',
    guardrails: Object.freeze([
      '只读派生 / Derived only',
      '不新增规则 / No new rules',
      '不进生产构建 / No prod build',
    ]),
    description:
      '把项目治理地图可视化成治理维度与口径、任务分流和文档跳转；navigate governance axes without creating a second truth source.',
  }),
  Object.freeze({
    key: 'docs',
    title: '开发文档 / Dev Docs',
    group: '文档治理 / Docs',
    route: DEV_DOCS_ROUTE,
    source: 'docs/**/*.md',
    truthSource: '仓库 tracked Markdown / Repo Markdown',
    status: '本地只读 / Local read-only',
    guardrails: Object.freeze([
      '不进菜单 / No menu',
      '不接 RBAC / No RBAC',
      '不进生产构建 / No prod build',
    ]),
    description:
      '按真实目录树浏览仓库 tracked Markdown；browse repo Markdown by real directory tree.',
  }),
  Object.freeze({
    key: 'testing',
    title: '测试入口 / Test Entry',
    group: '验证治理 / QA',
    route: DEV_TESTING_ROUTE,
    source: 'docs/product/自动化测试策略.md',
    truthSource: '测试策略文档 / Test strategy',
    status: '策略索引 / Strategy index',
    guardrails: Object.freeze([
      '不执行命令 / No shell execution',
      '不替代测试结果 / Not test evidence',
      '不进生产构建 / No prod build',
    ]),
    description:
      '汇总测试分层、命令块和 docs 下测试相关资料；pick validation commands for the current change.',
  }),
  Object.freeze({
    key: 'prototypes',
    title: '产品原型 / Prototypes',
    group: '产品设计 / Product Design',
    route: DEV_PROTOTYPES_ROUTE,
    source: 'docs/product/prototypes',
    truthSource: '原型资产目录 / Prototype assets',
    status: '资产预览 / Asset preview',
    guardrails: Object.freeze([
      '只预览资产 / Preview only',
      '不写运行时 / No runtime writes',
      '不进生产构建 / No prod build',
    ]),
    description:
      '浏览 HTML 原型、PNG 方案图和截图证据；review local prototype assets.',
  }),
  Object.freeze({
    key: 'capability-ledger',
    title: '能力台账 / Capability Ledger',
    group: '产品治理 / Product Governance',
    route: DEV_CAPABILITY_LEDGER_ROUTE,
    source: 'docs/product/产品能力进度台账.md',
    truthSource: '能力 / 交付台账 Markdown / Ledger Markdown',
    status: '台账只读 / Read-only ledger',
    guardrails: Object.freeze([
      '只读可视化 / Read-only view',
      '不替代真源 / Not source of truth',
      '不接后端 / No backend',
    ]),
    description:
      '联动产品能力、客户交付和客户差异台账；trace CAP links across ledgers.',
  }),
  Object.freeze({
    key: 'customer-config',
    title: '客户配置 / Customer Config',
    group: '客户治理 / Customer Governance',
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    source: 'config/customers/yoyoosun',
    truthSource: '客户配置包与导入 tooling / Customer package',
    status: '配置总控 / Config hub',
    guardrails: Object.freeze([
      '只读汇总 / Read-only summary',
      '不做真实导入 / No real import',
      '不写核心规则 / No core rules',
    ]),
    description:
      '汇总 yoyoosun 客户配置包、菜单品牌、字段编号草案和导入边界；review customer config boundaries.',
  }),
])

export function isDevHubEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizeKeyword(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeFilters(filters = '') {
  if (typeof filters === 'string') {
    return {
      keyword: filters,
      group: DEV_HUB_ALL_GROUP,
    }
  }
  return {
    keyword: filters?.keyword || '',
    group: filters?.group || DEV_HUB_ALL_GROUP,
  }
}

export function getDevHubGroupOptions(items = DEV_HUB_ITEMS) {
  const groups = Array.from(
    new Set(items.map((item) => item.group).filter(Boolean))
  )
  return [
    { label: '全部 / All', value: DEV_HUB_ALL_GROUP },
    ...groups.map((group) => ({ label: group, value: group })),
  ]
}

export function filterDevHubItems(items = DEV_HUB_ITEMS, filters = '') {
  const { keyword, group } = normalizeFilters(filters)
  const normalizedKeyword = normalizeKeyword(keyword)
  const normalizedGroup = String(group || DEV_HUB_ALL_GROUP)

  return items.filter((item) => {
    if (
      normalizedGroup !== DEV_HUB_ALL_GROUP &&
      item.group !== normalizedGroup
    ) {
      return false
    }
    if (!normalizedKeyword) return true

    const haystack = [
      item.title,
      item.group,
      item.route,
      item.source,
      item.truthSource,
      item.status,
      item.description,
      ...(Array.isArray(item.guardrails) ? item.guardrails : []),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalizedKeyword)
  })
}

function buildRouteSet(items = DEV_HUB_ITEMS) {
  return new Set(items.map((item) => item.route))
}

function normalizeDevHubRoutes(
  routes = [],
  items = DEV_HUB_ITEMS,
  maxItems = DEV_HUB_MAX_PINNED_ITEMS
) {
  const validRoutes = buildRouteSet(items)
  const seen = new Set()
  return (Array.isArray(routes) ? routes : [])
    .map((route) => String(route || '').trim())
    .filter((route) => {
      if (!validRoutes.has(route) || seen.has(route)) return false
      seen.add(route)
      return true
    })
    .slice(0, maxItems)
}

export function normalizeDevHubPinnedRoutes(
  routes = [],
  items = DEV_HUB_ITEMS,
  maxItems = DEV_HUB_MAX_PINNED_ITEMS
) {
  return normalizeDevHubRoutes(routes, items, maxItems)
}

export function toggleDevHubPinnedRoute(
  route = '',
  currentRoutes = [],
  items = DEV_HUB_ITEMS,
  maxItems = DEV_HUB_MAX_PINNED_ITEMS
) {
  const normalizedRoute = String(route || '').trim()
  const normalizedCurrent = normalizeDevHubPinnedRoutes(
    currentRoutes,
    items,
    maxItems
  )
  if (!buildRouteSet(items).has(normalizedRoute)) {
    return normalizedCurrent
  }
  if (normalizedCurrent.includes(normalizedRoute)) {
    return normalizedCurrent.filter(
      (itemRoute) => itemRoute !== normalizedRoute
    )
  }
  return normalizeDevHubPinnedRoutes(
    [normalizedRoute, ...normalizedCurrent],
    items,
    maxItems
  )
}

export function buildDevHubPinnedItems(
  items = DEV_HUB_ITEMS,
  pinnedRoutes = []
) {
  const itemByRoute = new Map(items.map((item) => [item.route, item]))
  return normalizeDevHubPinnedRoutes(pinnedRoutes, items).flatMap((route) => {
    const item = itemByRoute.get(route)
    return item ? [item] : []
  })
}

export function buildDevHubSummary(items = DEV_HUB_ITEMS) {
  const groupSet = new Set(items.map((item) => item.group).filter(Boolean))
  const guardrailSet = new Set(
    items.flatMap((item) =>
      Array.isArray(item.guardrails) ? item.guardrails : []
    )
  )
  return {
    entryCount: items.length,
    groupCount: groupSet.size,
    guardrailCount: guardrailSet.size,
    devOnly: true,
    boundary:
      'dev-only, no menu, no seedData, no RBAC, no backend business, no production build',
  }
}
