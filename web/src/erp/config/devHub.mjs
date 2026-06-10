import { DEV_CAPABILITY_LEDGER_ROUTE } from './devCapabilityLedger.mjs'
import { DEV_CUSTOMER_CONFIG_ROUTE } from './devCustomerConfig.mjs'
import { DEV_DOCS_ROUTE } from './devDocs.mjs'
import { DEV_PROTOTYPES_ROUTE } from './devPrototypes.mjs'
import { DEV_TESTING_ROUTE } from './devTesting.mjs'

export const DEV_HUB_ROUTE = '/__dev'
export const DEV_HUB_RECENT_STORAGE_KEY = 'plush_erp_dev_hub_recent_routes'
export const DEV_HUB_PINNED_STORAGE_KEY = 'plush_erp_dev_hub_pinned_routes'
export const DEV_HUB_MAX_RECENT_ITEMS = 3
export const DEV_HUB_MAX_PINNED_ITEMS = 5
export const DEV_HUB_ALL_GROUP = 'all'

export const DEV_HUB_ITEMS = Object.freeze([
  Object.freeze({
    key: 'docs',
    title: '开发文档',
    group: '文档治理',
    route: DEV_DOCS_ROUTE,
    source: 'docs/**/*.md',
    truthSource: '仓库 tracked Markdown',
    status: '本地只读',
    guardrails: Object.freeze(['不进菜单', '不接 RBAC', '不进生产构建']),
    description:
      '按真实目录树浏览仓库 tracked Markdown，辅助开发查阅和章节定位。',
  }),
  Object.freeze({
    key: 'testing',
    title: '测试入口',
    group: '验证治理',
    route: DEV_TESTING_ROUTE,
    source: 'docs/product/test-strategy.md',
    truthSource: '测试策略文档',
    status: '策略索引',
    guardrails: Object.freeze(['不执行命令', '不替代测试结果', '不进生产构建']),
    description:
      '汇总测试分层、命令块和 docs 下测试相关资料，帮助选择本轮验收命令。',
  }),
  Object.freeze({
    key: 'prototypes',
    title: '产品原型',
    group: '产品设计',
    route: DEV_PROTOTYPES_ROUTE,
    source: 'docs/product/prototypes',
    truthSource: '原型资产目录',
    status: '资产预览',
    guardrails: Object.freeze(['只预览资产', '不写运行时', '不进生产构建']),
    description: '浏览 HTML 原型、PNG 方案图和截图证据，供本地产品评审使用。',
  }),
  Object.freeze({
    key: 'capability-ledger',
    title: '能力台账',
    group: '产品治理',
    route: DEV_CAPABILITY_LEDGER_ROUTE,
    source: 'docs/product/capability-ledger.md',
    truthSource: '能力 / 交付台账 Markdown',
    status: '台账只读',
    guardrails: Object.freeze(['只读可视化', '不替代真源', '不接后端']),
    description: '联动产品能力、客户交付和客户差异台账，快速定位 CAP 关联。',
  }),
  Object.freeze({
    key: 'customer-config',
    title: '客户配置',
    group: '客户治理',
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    source: 'config/customers/yoyoosun',
    truthSource: '客户配置包与导入 tooling',
    status: '配置总控',
    guardrails: Object.freeze(['只读汇总', '不做真实导入', '不写核心规则']),
    description: '汇总 yoyoosun 客户配置包、菜单品牌、字段编号草案和导入边界。',
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
    { label: '全部', value: DEV_HUB_ALL_GROUP },
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

export function normalizeDevHubRecentRoutes(
  routes = [],
  items = DEV_HUB_ITEMS,
  maxItems = DEV_HUB_MAX_RECENT_ITEMS
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
  return normalizeDevHubRecentRoutes(routes, items, maxItems)
}

export function recordDevHubRecentRoute(
  route = '',
  currentRoutes = [],
  items = DEV_HUB_ITEMS,
  maxItems = DEV_HUB_MAX_RECENT_ITEMS
) {
  const normalizedRoute = String(route || '').trim()
  return normalizeDevHubRecentRoutes(
    [normalizedRoute, ...(Array.isArray(currentRoutes) ? currentRoutes : [])],
    items,
    maxItems
  )
}

export function buildDevHubRecentItems(
  items = DEV_HUB_ITEMS,
  recentRoutes = []
) {
  const itemByRoute = new Map(items.map((item) => [item.route, item]))
  return normalizeDevHubRecentRoutes(recentRoutes, items).flatMap((route) => {
    const item = itemByRoute.get(route)
    return item ? [item] : []
  })
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
