import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_HUB_ROUTE,
  DEV_PROTOTYPES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
} from './devRoutes.mjs'

export { DEV_HUB_ROUTE }
export const DEV_HUB_PINNED_STORAGE_KEY = 'plush_erp_dev_hub_pinned_routes'
export const DEV_HUB_MAX_PINNED_ITEMS = 5
export const DEV_HUB_ALL_GROUP = 'all'

export const DEV_HUB_ITEMS = Object.freeze([
  Object.freeze({
    key: 'governance',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
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
    key: 'status-flows',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: '流程与状态观察台 / Flow & State Observatory',
    group: '流程治理 / Flow Governance',
    route: DEV_STATUS_FLOWS_ROUTE,
    source: 'docs/architecture/状态字典与生命周期索引.md',
    truthSource: '代码合同、正式状态文档与已登记客户配置包',
    status: '只读观察与差异检查 / Read-only inspection',
    guardrails: Object.freeze([
      '状态分层 / Layered truth',
      '客户配置只叠加 / Customer overlay only',
      '禁止通用改状态 / No generic status write',
      '不进生产构建 / No prod build',
    ]),
    description:
      '一处查看 Product Core 状态机、双语状态树、流程编排、九类流覆盖、甲方 preview 差异与运行证据边界；inspect without creating a second runtime authority.',
  }),
  Object.freeze({
    key: 'docs',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: '开发文档 / Dev Docs',
    group: '文档治理 / Docs',
    route: DEV_DOCS_ROUTE,
    source: 'docs/**/*.md',
    truthSource: '当前工作区 Markdown / Workspace Markdown',
    status: '本地只读 / Local read-only',
    guardrails: Object.freeze([
      '不进菜单 / No menu',
      '不接 RBAC / No RBAC',
      '不进生产构建 / No prod build',
    ]),
    description:
      '按真实目录树浏览当前工作区内的 Markdown；browse workspace Markdown by real directory tree.',
  }),
  Object.freeze({
    key: 'testing',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    title: '测试入口 / Test Entry',
    group: '验证治理 / QA',
    route: DEV_TESTING_ROUTE,
    source: 'docs/product/自动化测试策略.md',
    truthSource: '测试策略文档 / Test strategy',
    status: '策略索引 / Strategy index',
    guardrails: Object.freeze([
      '不执行命令 / No shell execution',
      '不替代测试结果 / Not test evidence',
      '不索引历史参考 / No reference commands',
      '不进生产构建 / No prod build',
    ]),
    description:
      '汇总当前测试策略、QA 脚本和部署 / 前后端说明；pick validation commands without promoting reference docs.',
  }),
  Object.freeze({
    key: 'prototypes',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
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
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: '能力真源 / Capability Sources',
    group: '产品治理 / Product Governance',
    route: DEV_CAPABILITY_LEDGER_ROUTE,
    source: 'docs/product/产品能力进度台账.md',
    truthSource: '两份正式 Markdown / Two source documents',
    status: '真源入口 / Source links',
    guardrails: Object.freeze([
      '只做导航 / Navigation only',
      '不复制状态 / No duplicated status',
      '不进生产构建 / No prod build',
    ]),
    description:
      '先进入全局产品能力台账，再进入当前客户能力、交付与差异矩阵；open the two formal sources without maintaining a second dashboard.',
  }),
  Object.freeze({
    key: 'customer-config',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    title: '客户配置包预检与发布 / Package Preflight & Release',
    group: '客户治理 / Customer Governance',
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    source: 'config/customers/yoyoosun',
    truthSource: '已登记客户配置包 / Registered customer package',
    status: '预检与发布控制台 / Preflight & release console',
    guardrails: Object.freeze([
      '发布前预检 / Preflight before release',
      '不做真实导入 / No real import',
      '不写核心规则 / No core rules',
    ]),
    description:
      '读取已登记的 yoyoosun 客户配置包，完成预检、差异、Dry Run、当前代理后端测试应用和指定证据批次门禁；正式写入交给统一发布执行器。',
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
