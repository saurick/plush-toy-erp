export const DEV_PROTOTYPES_ROUTE = '/__dev/prototypes'
export const DEV_PROTOTYPE_PINNED_STORAGE_KEY =
  'plush_erp_dev_prototype_pinned_keys'
export const DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY =
  'plush_erp_dev_prototype_expanded_groups'

export const DEV_PROTOTYPE_STATUSES = Object.freeze({
  CURRENT: '当前实现对齐版',
  EXPLORATION: '探索方案',
  HISTORY: '历史参考',
  EVIDENCE: '截图证据',
  COMPARISON: '方案对比',
})

export const DEV_PROTOTYPE_STATUS_OPTIONS = Object.freeze([
  DEV_PROTOTYPE_STATUSES.CURRENT,
  DEV_PROTOTYPE_STATUSES.EXPLORATION,
  DEV_PROTOTYPE_STATUSES.HISTORY,
  DEV_PROTOTYPE_STATUSES.EVIDENCE,
  DEV_PROTOTYPE_STATUSES.COMPARISON,
])

export const DEV_PROTOTYPE_ASSETS = Object.freeze([
  {
    key: 'admin-command-center',
    title: '后台工作台与看板整套原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.EXPLORATION],
    directory: 'admin-command-center-v1/',
    assetPath: 'admin-command-center-v1/index.html',
    readmePath: 'admin-command-center-v1/README.md',
    description:
      '覆盖工作台、任务看板、业务看板、模板打印中心和异常 / 阻塞闭环五个视图。',
  },
  {
    key: 'business-module-standard-page',
    title: '业务模块标准页整页原型',
    type: 'HTML',
    statuses: [DEV_PROTOTYPE_STATUSES.EXPLORATION],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/index.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description:
      '覆盖标题统计、筛选、表格工具、选中记录操作条、主表分页和底部常驻协同入口。',
  },
  {
    key: 'business-task-collab-entry',
    title: '协同入口独立探索原型',
    type: 'HTML',
    statuses: [
      DEV_PROTOTYPE_STATUSES.EXPLORATION,
      DEV_PROTOTYPE_STATUSES.COMPARISON,
    ],
    directory: 'business-module-page-standard-v1/',
    assetPath: 'business-module-page-standard-v1/task-collab-entry-v2.html',
    readmePath: 'business-module-page-standard-v1/README.md',
    description: '用于对比底部常驻入口、展开面板和本页待办任务分组。',
  },
  {
    key: 'business-direction-sidebar',
    title: '方向 1：右侧当前记录协同侧栏',
    type: 'PNG',
    statuses: [
      DEV_PROTOTYPE_STATUSES.COMPARISON,
      DEV_PROTOTYPE_STATUSES.HISTORY,
    ],
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
    statuses: [
      DEV_PROTOTYPE_STATUSES.COMPARISON,
      DEV_PROTOTYPE_STATUSES.HISTORY,
    ],
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
    statuses: [
      DEV_PROTOTYPE_STATUSES.COMPARISON,
      DEV_PROTOTYPE_STATUSES.HISTORY,
    ],
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
  { status = 'all', keyword = '' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  return items.filter((item) => {
    const statusMatched =
      status === 'all' || item.statuses?.includes(String(status))
    const keywordMatched = !query || item.searchText?.includes(query)
    return statusMatched && keywordMatched
  })
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
