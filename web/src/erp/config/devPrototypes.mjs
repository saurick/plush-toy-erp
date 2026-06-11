export const DEV_PROTOTYPES_ROUTE = '/__dev/prototypes'
export const DEV_PROTOTYPE_PINNED_STORAGE_KEY =
  'plush_erp_dev_prototype_pinned_keys'
export const DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY =
  'plush_erp_dev_prototype_expanded_groups'
export const DEV_PROTOTYPE_SELECTED_STORAGE_KEY =
  'plush_erp_dev_prototype_selected_key'
export const DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY =
  'plush_erp_dev_prototype_status_filter'

export const DEV_PROTOTYPE_STATUSES = Object.freeze({
  CURRENT: '当前实现 / Current',
  TO_IMPLEMENT: '待实现 / To Implement',
  DRAFT: '起草阶段 / Draft',
  HISTORY: '历史参考 / History',
  EVIDENCE: '截图证据 / Evidence',
  COMPARISON: '方案对比 / Comparison',
})

export const DEV_PROTOTYPE_STATUS_OPTIONS = Object.freeze([
  DEV_PROTOTYPE_STATUSES.CURRENT,
  DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT,
  DEV_PROTOTYPE_STATUSES.DRAFT,
  DEV_PROTOTYPE_STATUSES.HISTORY,
  DEV_PROTOTYPE_STATUSES.EVIDENCE,
  DEV_PROTOTYPE_STATUSES.COMPARISON,
])

export const DEV_PROTOTYPE_FILTERS = Object.freeze({
  ALL: 'all',
  CURRENT: 'current',
  TO_IMPLEMENT: 'to-implement',
  REFERENCE: 'reference',
})

export const DEV_PROTOTYPE_FILTER_OPTIONS = Object.freeze([
  { value: DEV_PROTOTYPE_FILTERS.ALL, label: '全部 / All' },
  { value: DEV_PROTOTYPE_FILTERS.CURRENT, label: '当前实现 / Current' },
  {
    value: DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT,
    label: '待实现 / To Implement',
  },
  { value: DEV_PROTOTYPE_FILTERS.REFERENCE, label: '参考资料 / Reference' },
])

export const DEV_PROTOTYPE_ASSETS = Object.freeze([
  {
    key: 'admin-command-center',
    title: '后台工作台样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'admin-command-center-v1/',
    assetPath: 'admin-command-center-v1/index.html',
    readmePath: 'admin-command-center-v1/README.md',
    description:
      '把工作台收敛为登录后的今日处理台：今日队列、当前任务详情和少量常用业务对象入口。',
    appliesTo:
      '后台首页 / 工作台、任务看板、业务看板、模板打印中心和异常闭环等总控入口可参照；常用入口不是正式菜单替代表。',
  },
  {
    key: 'business-module-standard-page',
    title: '业务模块标准页样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/index.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '保留标题摘要、少量筛选、表格、当前记录操作条和底部轻量协同入口。',
    appliesTo:
      '客户档案、供应商档案、产品、销售订单、辅材 / 包材采购、加工合同 / 委外下单、入库通知 / 检验 / 入库、库存、待出货 / 出货放行、出库、生产排单、生产进度、延期 / 返工 / 异常、品质检验、对账 / 结算、待付款 / 应付提醒、应收 / 开票登记和发票登记等同类列表页可参照。',
  },
  {
    key: 'business-task-collab-entry',
    title: '业务页协同入口组件样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/task-collab-entry-v2.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '作为业务页内组件样板：收起保留风险提示，展开处理本页相关任务。',
    appliesTo:
      '嵌入有 Workflow 协同任务的业务页可参照；它是页内组件，不是独立菜单、路由或权限入口。',
  },
  {
    key: 'business-detail-standard-page',
    title: '业务详情页标准样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-detail-page-standard-v1/',
    assetPath: 'business-detail-page-standard-v1/index.html',
    readmePath: 'business-detail-page-standard-v1/README.md',
    description:
      '覆盖基础信息、业务状态、关联单据、操作记录、附件区，并区分 Workflow 协同动作和 Fact 事实动作。',
    appliesTo:
      '销售订单、客户 / 供应商、产品、采购入库、库存批次、质检、出货和财务等需要详情承载的页面可参照；字段和动作仍由各自 API / usecase / RBAC 决定。',
  },
  {
    key: 'business-form-standard-page',
    title: '新建 / 编辑表单标准样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-form-page-standard-v1/',
    assetPath: 'business-form-page-standard-v1/index.html',
    readmePath: 'business-form-page-standard-v1/README.md',
    description:
      '覆盖字段分组、必填提示、校验错误、保存 / 取消 / 重置、来源带值、清值和缺值 / 残值防护。',
    appliesTo:
      '客户、供应商、联系人、销售订单、采购、库存、质检和财务等新建 / 编辑表单可参照；字段真源以 schema、API 和保存 usecase 为准。',
  },
  {
    key: 'action-modal-drawer-standard',
    title: '弹窗 / 抽屉动作标准样板',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'action-modal-drawer-standard-v1/',
    assetPath: 'action-modal-drawer-standard-v1/index.html',
    readmePath: 'action-modal-drawer-standard-v1/README.md',
    description:
      '覆盖审批、驳回、阻塞、冲正、关闭任务、危险确认和 reason 必填表达。',
    appliesTo:
      '审批、驳回、阻塞、冲正、关闭任务、过账 / 取消等动作浮层可参照；动作可见性、权限、幂等和事实约束仍由后端 usecase / RBAC 决定。',
  },
  {
    key: 'business-direction-sidebar',
    title: '方向 1：右侧当前记录协同侧栏',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT, DEV_PROTOTYPE_STATUSES.COMPARISON],
    directory: 'business-module-page-standard-v1/images/',
    assetPath:
      'business-module-page-standard-v1/images/direction-1-current-record-sidebar.png',
    readmePath: 'business-module-page-standard-v1/README.md',
    description: '早期协同入口方向图，用于追溯为何不采用右侧侧栏作为默认骨架。',
    appliesTo: '仅用于业务页协同入口方案对比，不对应正式菜单或当前实现。',
  },
  {
    key: 'business-direction-flowbar',
    title: '方向 2：顶部流程条 + 协同任务抽屉',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT, DEV_PROTOTYPE_STATUSES.COMPARISON],
    directory: 'business-module-page-standard-v1/images/',
    assetPath:
      'business-module-page-standard-v1/images/direction-2-flowbar-task-drawer.png',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '早期协同入口方向图，用于比较流程条和抽屉结构的占位与理解成本。',
    appliesTo: '仅用于业务页协同入口方案对比，不对应正式菜单或当前实现。',
  },
  {
    key: 'business-direction-bottom-table',
    title: '方向 3：表格下方协同待办表',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.DRAFT, DEV_PROTOTYPE_STATUSES.COMPARISON],
    directory: 'business-module-page-standard-v1/images/',
    assetPath:
      'business-module-page-standard-v1/images/direction-3-bottom-task-table.png',
    readmePath: 'business-module-page-standard-v1/README.md',
    description: '早期协同入口方向图，用于说明长表格下方入口的可见性问题。',
    appliesTo: '仅用于业务页协同入口方案对比，不对应正式菜单或当前实现。',
  },
  {
    key: 'mobile-role-tasks-implemented',
    title: '岗位任务端当前实现参考',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.CURRENT],
    directory: 'mobile-role-tasks-v1/',
    assetPath: 'mobile-role-tasks-v1/implemented-reference.html',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '覆盖待办 / 已办 / 消息 / 我的、主筛选、分批展开、任务详情、现场留痕、原因面板和底部动作栏。',
    appliesTo:
      '岗位任务端 `/m/<role>/tasks` 当前实现参考；岗位入口按任务和职责投影，不复制桌面菜单树。',
  },
  {
    key: 'mobile-role-tasks-list',
    title: '岗位任务端早期待办列表图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.HISTORY, DEV_PROTOTYPE_STATUSES.EVIDENCE],
    directory: 'mobile-role-tasks-v1/images/',
    assetPath:
      'mobile-role-tasks-v1/images/mobile-role-tasks-list-reference.png',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '保留岗位胶囊、刷新、同步信息、指标、筛选、任务列表和底部导航的早期方向证据。',
    appliesTo:
      '仅为岗位任务端早期视觉参考；当前实现以 HTML 参考和运行时代码为准。',
  },
  {
    key: 'mobile-role-task-detail',
    title: '岗位任务端早期任务详情图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.HISTORY, DEV_PROTOTYPE_STATUSES.EVIDENCE],
    directory: 'mobile-role-tasks-v1/images/',
    assetPath:
      'mobile-role-tasks-v1/images/mobile-role-task-detail-reference.png',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '保留任务关键信息、风险提示、关联单据、最近动态、原因输入和底部动作栏的早期方向证据。',
    appliesTo:
      '仅为岗位任务端早期视觉参考；当前实现以 HTML 参考和运行时代码为准。',
  },
  {
    key: 'mobile-role-risk-dashboard',
    title: '岗位任务端早期风险分组图',
    type: 'PNG',
    statuses: [DEV_PROTOTYPE_STATUSES.HISTORY, DEV_PROTOTYPE_STATUSES.EVIDENCE],
    directory: 'mobile-role-tasks-v1/images/',
    assetPath:
      'mobile-role-tasks-v1/images/mobile-role-risk-dashboard-reference.png',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '保留今日必须处理、卡点、等待他人、催办和已完成等分组的早期方向证据。',
    appliesTo:
      '仅为岗位任务端早期视觉参考；当前实现以 HTML 参考和运行时代码为准。',
  },
])

export function isDevPrototypesEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizePrototypeModulePath(modulePath = '') {
  const cleanPath = String(modulePath || '').replace(/\?.*$/, '')
  const marker = '/docs/product/prototypes/'
  const markerIndex = cleanPath.indexOf(marker)
  if (markerIndex >= 0) {
    return cleanPath.slice(markerIndex + marker.length)
  }
  return cleanPath
    .replace(/^\.{1,2}\//, '')
    .replace(/^(\.\.\/)+docs\/product\/prototypes\//, '')
}

function normalizeModuleValue(value) {
  if (typeof value === 'string') return value
  if (typeof value?.default === 'string') return value.default
  return ''
}

export function buildDevPrototypeItems({
  htmlModules = {},
  imageModules = {},
} = {}) {
  const htmlByPath = new Map(
    Object.entries(htmlModules).map(([modulePath, moduleValue]) => [
      normalizePrototypeModulePath(modulePath),
      normalizeModuleValue(moduleValue),
    ])
  )
  const imageByPath = new Map(
    Object.entries(imageModules).map(([modulePath, moduleValue]) => [
      normalizePrototypeModulePath(modulePath),
      normalizeModuleValue(moduleValue),
    ])
  )

  return DEV_PROTOTYPE_ASSETS.map((asset) => {
    const isHtml = asset.type === 'HTML'
    const source = isHtml ? htmlByPath.get(asset.assetPath) || '' : ''
    const url = isHtml ? '' : imageByPath.get(asset.assetPath) || ''
    return {
      ...asset,
      source,
      url,
      available: isHtml ? Boolean(source) : Boolean(url),
      searchText: [
        asset.title,
        asset.type,
        asset.directory,
        asset.assetPath,
        asset.readmePath,
        asset.description,
        asset.appliesTo,
        ...asset.statuses,
      ]
        .join(' ')
        .toLowerCase(),
    }
  })
}

export function filterDevPrototypeItems(
  items = [],
  { status = DEV_PROTOTYPE_FILTERS.ALL, keyword = '' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  return items.filter((item) => {
    const statuses = item.statuses || []
    const filter = String(status || DEV_PROTOTYPE_FILTERS.ALL)
    const statusMatched =
      filter === DEV_PROTOTYPE_FILTERS.ALL ||
      (filter === DEV_PROTOTYPE_FILTERS.CURRENT &&
        statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT)) ||
      (filter === DEV_PROTOTYPE_FILTERS.TO_IMPLEMENT &&
        statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT)) ||
      (filter === DEV_PROTOTYPE_FILTERS.REFERENCE &&
        !statuses.includes(DEV_PROTOTYPE_STATUSES.CURRENT) &&
        !statuses.includes(DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT))
    const keywordMatched = !query || item.searchText?.includes(query)
    return statusMatched && keywordMatched
  })
}

export function normalizeDevPrototypeStatusFilter(
  status = DEV_PROTOTYPE_FILTERS.ALL
) {
  const filter = String(status || DEV_PROTOTYPE_FILTERS.ALL)
  return DEV_PROTOTYPE_FILTER_OPTIONS.some((option) => option.value === filter)
    ? filter
    : DEV_PROTOTYPE_FILTERS.ALL
}

export function normalizeDevPrototypeSelectedKey(selectedKey = '', items = []) {
  const fallbackKey = items[0]?.key || ''
  const itemKey = String(selectedKey || '')
  if (!itemKey) return fallbackKey
  return items.some((item) => item.key === itemKey) ? itemKey : fallbackKey
}

export function normalizeDevPrototypePinnedKeys(pinnedKeys = [], items = []) {
  if (!Array.isArray(pinnedKeys)) return []

  const availableKeys = new Set(items.map((item) => item.key))
  const normalized = []
  const seen = new Set()
  pinnedKeys.forEach((key) => {
    const itemKey = String(key || '')
    if (!itemKey || !availableKeys.has(itemKey) || seen.has(itemKey)) return
    normalized.push(itemKey)
    seen.add(itemKey)
  })
  return normalized
}

export function applyDevPrototypePinnedState(items = [], pinnedKeys = []) {
  const normalizedPinnedKeys = normalizeDevPrototypePinnedKeys(
    pinnedKeys,
    items
  )
  const pinnedRankByKey = new Map(
    normalizedPinnedKeys.map((key, index) => [key, index])
  )

  return items
    .map((item, index) => {
      const pinnedRank = pinnedRankByKey.get(item.key)
      return {
        ...item,
        pinned: pinnedRank !== undefined,
        pinnedRank: pinnedRank ?? Number.POSITIVE_INFINITY,
        originalIndex: index,
      }
    })
    .sort((left, right) => {
      if (left.pinned && right.pinned) return left.pinnedRank - right.pinnedRank
      if (left.pinned) return -1
      if (right.pinned) return 1
      return left.originalIndex - right.originalIndex
    })
}

export function groupDevPrototypeItemsByDirectory(items = []) {
  const groups = []
  const groupByDirectory = new Map()

  items.forEach((item) => {
    const directory = item.directory || '(未归类)'
    let group = groupByDirectory.get(directory)
    if (!group) {
      group = {
        key: directory,
        directory,
        items: [],
      }
      groupByDirectory.set(directory, group)
      groups.push(group)
    }
    group.items.push(item)
  })

  return groups
}

export function normalizeDevPrototypeExpandedGroupKeys(
  expandedGroupKeys = [],
  availableGroupKeys = []
) {
  if (!Array.isArray(expandedGroupKeys)) return []

  const availableKeys = new Set(availableGroupKeys)
  const normalized = []
  const seen = new Set()
  expandedGroupKeys.forEach((key) => {
    const groupKey = String(key || '')
    if (!groupKey || !availableKeys.has(groupKey) || seen.has(groupKey)) return
    normalized.push(groupKey)
    seen.add(groupKey)
  })
  return normalized
}
