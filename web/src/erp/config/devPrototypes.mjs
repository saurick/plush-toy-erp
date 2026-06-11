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
  CURRENT: '当前实现对齐版 / Current',
  TO_IMPLEMENT: '待吸收实现 / To Implement',
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
    title: '极简后台工作台原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'admin-command-center-v1/',
    assetPath: 'admin-command-center-v1/index.html',
    readmePath: 'admin-command-center-v1/README.md',
    description:
      '把工作台收敛为登录后的今日处理台：今日队列、当前任务详情和少量常用业务对象入口。',
  },
  {
    key: 'business-module-standard-page',
    title: '极简业务模块标准页原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/index.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '保留标题摘要、少量筛选、表格、当前记录操作条和底部轻量协同入口。',
  },
  {
    key: 'business-task-collab-entry',
    title: '业务页轻量协同入口候选',
    type: 'HTML',
    statuses: [
      DEV_PROTOTYPE_STATUSES.TO_IMPLEMENT,
      DEV_PROTOTYPE_STATUSES.COMPARISON,
    ],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/task-collab-entry-v2.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '把协同入口收敛为业务页内组件：收起保留风险提示，展开处理本页相关任务。',
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
  },
  {
    key: 'mobile-role-tasks-implemented',
    title: '岗位任务端当前实现对齐版原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.CURRENT],
    directory: 'mobile-role-tasks-v1/',
    assetPath: 'mobile-role-tasks-v1/implemented-reference.html',
    readmePath: 'mobile-role-tasks-v1/README.md',
    description:
      '覆盖待办 / 已办 / 消息 / 我的、主筛选、分批展开、任务详情、现场留痕、原因面板和底部动作栏。',
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
