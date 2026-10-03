import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DATABASE_MIGRATION_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_HUB_ROUTE,
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_UI_DESIGN_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
} from './devRoutes.mjs'

export { DEV_HUB_ROUTE }
export const DEV_HUB_PINNED_STORAGE_KEY = 'plush_erp_dev_hub_pinned_routes'
export const DEV_HUB_MAX_PINNED_ITEMS = 5
export const DEV_HUB_ALL_GROUP = 'all'

export const DEV_HUB_ITEMS = Object.freeze([
  Object.freeze({
    key: 'product-core',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: '产品内核 / Product Core',
    group: '产品治理 / Product Governance',
    route: DEV_PRODUCT_CORE_ROUTE,
    source: 'docs/product/产品能力进度台账.md',
    truthSource: '唯一产品能力进度台账 / Product Capability Ledger',
    status: '只读能力清单 / Read-only inventory',
    guardrails: Object.freeze([
      '台账是唯一状态真源 / Ledger is the only status truth',
      '产品事实不等于发布或验收 / Product fact is not release or UAT',
      '不进生产构建 / No prod build',
    ]),
    description: '查看产品能力的当前范围、完成程度与边界。',
  }),
  Object.freeze({
    key: 'permission-relationships',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: '权限关系 / Effective Access',
    group: '权限治理 / Access Governance',
    route: DEV_PERMISSION_RELATIONSHIPS_ROUTE,
    source: 'docs/product/配置与权限策略.md',
    truthSource:
      '员工账号、岗位、最终权限解释、正式菜单投影、仓库范围与已启用审批设置',
    status: '只读运行投影 / Read-only projection',
    guardrails: Object.freeze([
      '只读复用现有权限与菜单投影 / Existing access and menu projection only',
      '不汇入任务、单据、流程或业务事实 / Permission relationships only',
      '不在本页写权限 / No permission writes',
      '不进生产构建 / No prod build',
    ]),
    description: '核对岗位或账号的可用功能、实际侧栏、仓库范围与审批责任。',
  }),
  Object.freeze({
    key: 'status-flows',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: '业务链观察 / Business Chain Observatory',
    group: '业务链治理 / Business Chain Governance',
    route: DEV_STATUS_FLOWS_ROUTE,
    source: 'docs/architecture/业务链与运行轨迹边界.md',
    truthSource: '代码合同、业务链与运行轨迹文档及已登记客户配置包',
    status: '只读观察与差异检查 / Read-only inspection',
    guardrails: Object.freeze([
      '来源、协同、运行与事实分层 / Layered chain truth',
      '客户配置只叠加 / Customer overlay only',
      '禁止通用改状态 / No generic status write',
      '不进生产构建 / No prod build',
    ]),
    description: '从业务链图核对单据、岗位交接、运行路径和已生效结果。',
  }),
  Object.freeze({
    key: 'business-usability',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    title: '页面说明检查 / Page Help Check',
    group: '验证治理 / QA',
    route: DEV_BUSINESS_USABILITY_ROUTE,
    source: 'web/src/erp/config/businessUsabilityCatalog.mjs',
    truthSource: '正式业务页面目录、业务链目录与岗位帮助内容',
    status: '只读覆盖检查 / Read-only coverage',
    guardrails: Object.freeze([
      '统一解释目录 / Shared explanation catalog',
      '不复制权限与岗位责任 / No duplicate access or role truth',
      '岗位推荐不代表实际权限 / Help recommendations do not grant access',
      '不写业务状态 / No business writes',
      '不进生产构建 / No prod build',
    ]),
    description:
      '核对业务页面的任务说明、完成标准、交接、字段解释和岗位帮助覆盖。',
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
    description: '搜索并阅读当前工作区的正式文档。',
  }),
  Object.freeze({
    key: 'testing',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    title: '改动验证 / Change Validation',
    group: '验证治理 / QA',
    route: DEV_TESTING_ROUTE,
    source: 'docs/product/自动化测试策略.md',
    truthSource: '测试策略文档 / Test strategy',
    status: '策略与固定采集 / Strategy and fixed collection',
    guardrails: Object.freeze([
      '不执行任意命令，仅允许固定覆盖率采集器 / Fixed coverage collector only',
      '不替代测试结果 / Not test evidence',
      '不索引历史参考 / No reference commands',
      '不进生产构建 / No prod build',
    ]),
    description: '生成本轮验证建议，运行固定检查并核对独立证据。',
  }),
  Object.freeze({
    key: 'quality-gates',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    title: '质量门禁 / Quality Gates',
    group: '验证治理 / QA',
    route: DEV_QUALITY_GATES_ROUTE,
    source: 'scripts/qa/README.md',
    truthSource: '正式 full / strict runner、门禁回执与本地 operation',
    status: '本机受控运行 / Local controlled execution',
    guardrails: Object.freeze([
      '只运行固定 full / strict 动作 / Fixed actions only',
      '门禁回执是唯一结果真源 / Receipt is the only result truth',
      '一次性数据库与有界清理 / Disposable database and bounded cleanup',
      '不接受命令、路径、凭据或任意目标 / No arbitrary input',
      '不进生产构建 / No prod build',
    ]),
    description: '核对固定版本 CI、运行本机门禁，查看阶段与覆盖缺口。',
  }),
  Object.freeze({
    key: 'data-preparation',
    areaKey: DEV_WORKBENCH_AREA_KEYS.quality,
    title: '测试数据 / Test Data',
    group: '验证治理 / QA',
    route: DEV_DATA_PREPARATION_ROUTE,
    source: 'docs/engineering/研发效能工作台与CI-CD设计.md',
    truthSource: '计划回执、正式 Source / Fact API 与目标读回',
    status: '本机受控写入 / Local controlled writes',
    guardrails: Object.freeze([
      '固定数据档位 / Fixed profiles',
      '本机系统边界 / Local OS boundary',
      '不可变计划确认 / Immutable plan confirmation',
      '场景数据只向前补齐 / Forward-only scenario data',
      '禁止任意目标或命令 / No arbitrary target or shell',
      '不进生产构建 / No prod build',
    ]),
    description:
      '准备固定数据计划，确认后执行并读回；业务场景固定批次长期保留，完整回归使用隔离库。',
  }),
  Object.freeze({
    key: 'ui-design',
    areaKey: DEV_WORKBENCH_AREA_KEYS.productEngineering,
    title: 'UI 交互设计 / UI Interaction Design',
    group: '产品设计 / Product Design',
    route: DEV_UI_DESIGN_ROUTE,
    source: 'docs/product/ui-design',
    truthSource: '交互设计目录 / UI design',
    status: '资产预览 / Asset preview',
    guardrails: Object.freeze([
      '只预览资产 / Preview only',
      '不写运行时 / No runtime writes',
      '不进生产构建 / No prod build',
    ]),
    description: '查看唯一 HTML 交互稿、设计说明与设计依据。',
  }),
  Object.freeze({
    key: 'customer-config',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    title: '客户配置 / Customer Config',
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
    description: '核对已登记客户配置包，预检差异、试运行并测试应用。',
  }),
  Object.freeze({
    key: 'database-migration',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    title: '数据库迁移 / Database Migration',
    group: '交付治理 / Delivery',
    route: DEV_DATABASE_MIGRATION_ROUTE,
    source: 'docs/engineering/研发效能工作台与CI-CD设计.md',
    truthSource: 'migration / schema 真源、固定目标身份、备份恢复与读回',
    status: '本机受控写入 / Local controlled writes',
    guardrails: Object.freeze([
      '固定 shared-dev / Fixed shared-dev',
      '准备与执行分离 / Prepare then execute',
      '真实备份恢复 / Verified backup restore',
      '结果未知不重试 / No retry when unknown',
      '禁止任意目标或命令 / No arbitrary target or shell',
      '不进生产构建 / No prod build',
    ]),
    description:
      '检查计划与备份恢复，确认后迁移并读回；无关工作区变化不触发重建。',
  }),
  Object.freeze({
    key: 'version-center',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    title: '版本发布 / Release & Deployment',
    group: '交付治理 / Delivery',
    route: DEV_VERSION_CENTER_ROUTE,
    source: 'docs/engineering/研发效能工作台与CI-CD设计.md',
    truthSource: 'GitLab 不可变制品、固定目标预检与 operation 回执',
    status: '本地受控编排 / Local controlled actions',
    guardrails: Object.freeze([
      '固定 GitLab 项目 / Fixed repository',
      '固定 demo / test 双目标 / Fixed targets',
      '明确确认 / Explicit confirmation',
      '终态不重试 / No terminal retry',
      '不进生产构建 / No prod build',
    ]),
    description: '核对版本与目标，准备发布、部署或回滚计划，并追踪操作回执。',
  }),
  Object.freeze({
    key: 'drill-recovery',
    areaKey: DEV_WORKBENCH_AREA_KEYS.delivery,
    title: '安全与恢复 / Security & Recovery',
    group: '交付治理 / Delivery',
    route: DEV_DRILL_RECOVERY_ROUTE,
    source: 'docs/security/运维安全与勒索恢复.md',
    truthSource: '应用安全合同、固定目标预检与恢复 / operation 回执',
    status: '只读目录与受控入口 / Read-only catalog',
    guardrails: Object.freeze([
      '复用 operation 真源 / Reuse operation truth',
      '按风险分级 / Risk-tiered drills',
      '新目标先登记 / Register targets first',
      '故障注入默认关闭 / Fault injection disabled by default',
      '不接受任意目标或命令 / No arbitrary target or shell',
      '不进生产构建 / No prod build',
    ]),
    description:
      '核对防入侵、备份隔离与恢复证据；缺少运行回执的安全项保持未核验。',
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
      'DEV-only fixed local orchestration; local operating-system user boundary, not ERP RBAC; no formal menu, production build, arbitrary target, path, shell, SQL or credential input',
  }
}
