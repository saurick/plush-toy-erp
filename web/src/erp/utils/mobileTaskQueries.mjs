import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { normalizeTaskListFilters, taskListFilterRequest, WORKFLOW_TASK_DUE_OPTIONS } from './workflowTaskListFilters.mjs'
import { resolveBusinessStatusCounts } from './businessStatusCounts.mjs'
import { normalizeRoleKey } from './roleKeys.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import { WORKFLOW_HISTORY_STATUS_OPTIONS, WORKFLOW_HISTORY_PERIOD_OPTIONS } from './workflowRoleTaskHistory.mjs'

export const MOBILE_ROLE_TASK_PAGE_LIMIT = 50

export const MOBILE_TASK_SORT_OPTIONS = Object.freeze([
  { value: 'newest', label: '最近进入' },
  { value: 'due', label: '截止最早' },
  { value: 'oldest', label: '等待最久' },
])

export const MOBILE_TASK_STATUS_OPTIONS = Object.freeze([
  { value: '', label: '全部状态' },
  { value: WorkflowTaskStatus.READY, label: '待处理' },
  { value: WorkflowTaskStatus.BLOCKED, label: '阻塞' },
])

export function mobileTaskQueryScope(
  accessScope,
  { keyword = '', sortKey = 'newest', statusKey = '', period = '', dateFrom = '', dateTo = '', ...discovery } = {}
) {
  const listFilters = normalizeTaskListFilters(sortKey === 'completed' ? { sourceType: discovery.sourceType } : discovery)
  return `${accessScope}${Object.keys(listFilters).length ? `|filters:${JSON.stringify(listFilters)}` : ''}|search:${keyword}|sort:${sortKey}|status:${statusKey}${sortKey === 'completed' ? `|period:${period}|from:${dateFrom}|to:${dateTo}` : ''}`
}

export function normalizeMobileTaskQueryOptions(value, history = false) {
  const options = value && typeof value === 'object' ? value : {}
  const statuses = history ? WORKFLOW_HISTORY_STATUS_OPTIONS : MOBILE_TASK_STATUS_OPTIONS
  return {
    ...normalizeTaskListFilters(history ? { sourceType: options.sourceType } : options),
    keyword: String(options.keyword || '').trim().slice(0, 100),
    sortKey: history ? 'completed' : MOBILE_TASK_SORT_OPTIONS.some(({ value: key }) => key === options.sortKey) ? options.sortKey : 'newest',
    statusKey: statuses.some(({ value: key }) => key === options.statusKey) ? options.statusKey : '',
    ...(history ? { period: WORKFLOW_HISTORY_PERIOD_OPTIONS.some(({ value: key }) => key === options.period) ? options.period : '', dateFrom: '', dateTo: '' } : {}),
  }
}

export function readMobileTaskQueryHistory(history, accessScope) {
  const isHistory = history?.mobileRoleTasksSort === 'completed'
  const options = normalizeMobileTaskQueryOptions({
    keyword: history?.mobileRoleTasksKeyword,
    sortKey: history?.mobileRoleTasksSort,
    statusKey: history?.mobileRoleTasksStatus,
    ...history?.mobileRoleTasksDates,
    ...history?.mobileRoleTasksDiscovery,
  }, isHistory)
  return history?.mobileRoleTasksScope ===
    mobileTaskQueryScope(accessScope, options)
    ? options
    : { keyword: '', sortKey: 'newest', statusKey: '' }
}

export const MOBILE_ROLE_TASK_VIEW_KEYS = Object.freeze({
  TODO: 'todo',
  HISTORY: 'history',
  RISK: 'risk',
  APPROVAL: 'approval',
})

const MOBILE_ROLE_TASK_VIEW_KEY_SET = new Set(
  Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)
)

const MOBILE_TASK_RECEIPT_STATUS_SET = new Set([
  'confirmed',
  'failed',
  'unknown',
  'recorded',
])
const MOBILE_TASK_RECEIPT_ACTION_SET = new Set([
  'done',
  'blocked',
  'rejected',
  'resume',
  'urge',
])
const MOBILE_ROLE_TASK_HISTORY_SCOPE_FIELD = 'mobileRoleTasksScope'

const RISK_FILTER_KEYS = new Set([
  'risk',
  'alert',
  'overdue',
  'due_soon',
  'high_priority',
  'blocked',
  'blocked_or_high_priority',
])

export function createMobileRoleTaskSlot() {
  return {
    items: [],
    next_cursor: '',
    has_more: false,
    server_time: 0,
    count_summary: null,
    status_counts: null,
    loaded: false,
    loading: false,
    error: '',
  }
}

export function createMobileRoleTaskSlots() {
  return Object.fromEntries(
    Object.values(MOBILE_ROLE_TASK_VIEW_KEYS).map((viewKey) => [
      viewKey,
      createMobileRoleTaskSlot(),
    ])
  )
}

export function isMobileRoleTaskHistoryScope(historyState, scopeKey) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  return Boolean(
    normalizedScopeKey &&
      historyState &&
      typeof historyState === 'object' &&
      !Array.isArray(historyState) &&
      String(
        historyState[MOBILE_ROLE_TASK_HISTORY_SCOPE_FIELD] || ''
      ).trim() === normalizedScopeKey
  )
}

export function readMobileRoleTaskScopedHistoryState(historyState, scopeKey) {
  return isMobileRoleTaskHistoryScope(historyState, scopeKey)
    ? historyState
    : {}
}

export function readMobileRoleTaskLoadedCounts(
  value,
  { maxItems = 1000 } = {}
) {
  const normalizedMaxItems = Number(maxItems)
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Number.isSafeInteger(normalizedMaxItems) ||
    normalizedMaxItems < MOBILE_ROLE_TASK_PAGE_LIMIT
  ) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([viewKey, count]) => {
      const normalizedCount = Number(count)
      return MOBILE_ROLE_TASK_VIEW_KEY_SET.has(viewKey) &&
        Number.isSafeInteger(normalizedCount) &&
        normalizedCount > 0
        ? [[viewKey, Math.min(normalizedCount, normalizedMaxItems)]]
        : []
    })
  )
}

export function resolveMobileRoleTaskRestoreLimit({
  viewKey,
  loadedCounts = {},
  visibleLimits = {},
  maxItems = 1000,
} = {}) {
  const normalizedMaxItems = Number(maxItems)
  if (
    !MOBILE_ROLE_TASK_VIEW_KEY_SET.has(viewKey) ||
    !Number.isSafeInteger(normalizedMaxItems) ||
    normalizedMaxItems < MOBILE_ROLE_TASK_PAGE_LIMIT
  ) {
    return MOBILE_ROLE_TASK_PAGE_LIMIT
  }
  const normalizedLoadedCounts = readMobileRoleTaskLoadedCounts(loadedCounts, {
    maxItems: normalizedMaxItems,
  })
  const visibleLimit = Object.values(
    visibleLimits && typeof visibleLimits === 'object' ? visibleLimits : {}
  ).reduce((maximum, value) => {
    const normalizedValue = Number(value)
    return Number.isSafeInteger(normalizedValue) && normalizedValue > 0
      ? Math.max(maximum, normalizedValue)
      : maximum
  }, 0)
  return Math.min(
    normalizedMaxItems,
    Math.max(
      MOBILE_ROLE_TASK_PAGE_LIMIT,
      normalizedLoadedCounts[viewKey] || 0,
      visibleLimit
    )
  )
}

export function resolveMobileRoleTaskReceiptDetailTask({
  receipt,
  scopeKey,
  selectedTaskID,
} = {}) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const selectedID = String(selectedTaskID || '').trim()
  const task =
    receipt?.task &&
    typeof receipt.task === 'object' &&
    !Array.isArray(receipt.task)
      ? receipt.task
      : null
  if (
    !normalizedScopeKey ||
    receipt?.scope_key !== normalizedScopeKey ||
    !MOBILE_TASK_RECEIPT_STATUS_SET.has(receipt?.status) ||
    (receipt?.status === 'recorded'
      ? !isTerminalWorkflowTask(task || {})
      : !MOBILE_TASK_RECEIPT_ACTION_SET.has(receipt?.action)) ||
    !selectedID ||
    String(task?.id || '').trim() !== selectedID
  ) {
    return null
  }
  return task
}

export function createMobileRoleTaskScopeState(scopeKey = '') {
  return {
    scopeKey: String(scopeKey || ''),
    slots: createMobileRoleTaskSlots(),
  }
}

export function readMobileRoleTaskScopeState(state, scopeKey = '') {
  const normalizedScopeKey = String(scopeKey || '')
  if (
    state &&
    typeof state === 'object' &&
    state.scopeKey === normalizedScopeKey &&
    state.slots &&
    typeof state.slots === 'object'
  ) {
    return state
  }
  return createMobileRoleTaskScopeState(normalizedScopeKey)
}

export function reconcileMobileRoleTaskMutation(
  state,
  {
    scopeKey,
    viewKey,
    canonicalTask,
    keepInActiveView = true,
    keepInViews = {},
  } = {}
) {
  const currentState = readMobileRoleTaskScopeState(state, scopeKey)
  if (
    currentState !== state ||
    !MOBILE_ROLE_TASK_VIEW_KEY_SET.has(viewKey) ||
    !canonicalTask ||
    typeof canonicalTask !== 'object' ||
    Array.isArray(canonicalTask) ||
    !String(canonicalTask.id || '').trim()
  ) {
    return currentState
  }
  const canonicalTaskID = String(canonicalTask.id)
  const slots = Object.fromEntries(
    Object.entries(currentState.slots).map(([slotKey, slot]) => {
      const keepInSlot = Object.hasOwn(keepInViews, slotKey)
        ? keepInViews[slotKey] === true
        : slotKey === viewKey
          ? keepInActiveView
          : false
      return [
        slotKey,
        {
          ...slot,
          items: slot.items.flatMap((task) => {
            if (String(task?.id || '') !== canonicalTaskID) return [task]
            return keepInSlot ? [canonicalTask] : []
          }),
          loaded: slotKey === viewKey ? slot.loaded : false,
          count_summary: null,
          status_counts: null,
          loading: false,
          error: '',
        },
      ]
    })
  )
  return { ...currentState, slots }
}

export function settleMobileRoleTaskRequest(
  state,
  {
    currentScopeKey,
    requestScopeKey,
    viewKey,
    currentRequestSeq,
    requestSeq,
    response,
    append = false,
    errorMessage,
  } = {}
) {
  if (
    !state ||
    state.scopeKey !== requestScopeKey ||
    currentScopeKey !== requestScopeKey ||
    currentRequestSeq !== requestSeq ||
    !MOBILE_ROLE_TASK_VIEW_KEY_SET.has(viewKey)
  ) {
    return state
  }
  const currentSlot = state.slots[viewKey]
  const nextSlot =
    errorMessage === undefined
      ? mergeMobileRoleTaskPage(currentSlot, response, { append, viewKey })
      : {
          ...currentSlot,
          loaded: currentSlot.loaded || currentSlot.items.length > 0,
          loading: false,
          error: errorMessage,
        }
  return {
    ...state,
    slots: {
      ...state.slots,
      [viewKey]: nextSlot,
    },
  }
}

export function buildMobileRoleTaskQuery({
  roleKey,
  viewKey,
  cursor = '',
  keyword = '',
  sortKey = '',
  statusKey = '',
  period = '',
  dateFrom = '',
  dateTo = '',
  limit = MOBILE_ROLE_TASK_PAGE_LIMIT,
  ...discovery
} = {}) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const normalizedViewKey = String(viewKey || '').trim()
  const normalizedCursor = String(cursor || '').trim()

  if (!normalizedRoleKey) {
    throw new TypeError('移动岗位任务查询缺少岗位')
  }
  if (!MOBILE_ROLE_TASK_VIEW_KEY_SET.has(normalizedViewKey)) {
    throw new TypeError('移动岗位任务查询视图无效')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('移动岗位任务查询分页大小无效')
  }

  const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : null
  if (normalizedKeyword === null || [...normalizedKeyword].length > 100) {
    throw new TypeError('搜索内容最多 100 个字')
  }
  if ((discovery.due && !WORKFLOW_TASK_DUE_OPTIONS.some(({ value }) => value === discovery.due)) || (discovery.sourceType && (typeof discovery.sourceType !== 'string' || [...discovery.sourceType].length > 64))) throw new TypeError('任务筛选条件无效')
  const history = normalizedViewKey === 'history'
  const statuses = history ? WORKFLOW_HISTORY_STATUS_OPTIONS : MOBILE_TASK_STATUS_OPTIONS
  if ((sortKey && (history ? sortKey !== 'completed' : !MOBILE_TASK_SORT_OPTIONS.some((option) => option.value === sortKey))) ||
    !statuses.some((option) => option.value === statusKey) ||
    (history ? !WORKFLOW_HISTORY_PERIOD_OPTIONS.some(({ value: key }) => key === period) || Boolean(dateFrom || dateTo) : Boolean(period || dateFrom || dateTo))) {
    throw new TypeError('任务筛选或排序无效')
  }
  return {
    ...taskListFilterRequest(history ? { sourceType: discovery.sourceType } : discovery),
    ...(sortKey ? { sort_key: sortKey } : {}),
    ...(statusKey ? { status_key: statusKey } : {}),
    ...(period ? { period } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    ...(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
    view_key: normalizedViewKey,
    role_key: normalizedRoleKey,
    limit,
    ...(normalizedCursor ? { cursor: normalizedCursor } : {}),
  }
}

export function resolveMobileRoleTaskViewKey({ mainTabKey, filterKey } = {}) {
  if (mainTabKey === 'done') {
    return MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY
  }
  if (mainTabKey === 'todo' && filterKey === 'approval') {
    return MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL
  }
  if (mainTabKey === 'messages' || RISK_FILTER_KEYS.has(filterKey)) {
    return MOBILE_ROLE_TASK_VIEW_KEYS.RISK
  }
  return MOBILE_ROLE_TASK_VIEW_KEYS.TODO
}

export function resolveMobileRoleTaskViewState({
  viewKey,
  todoTasks = [],
  historyTasks = [],
  riskTasks = [],
  approvalTasks = [],
  selectedTaskID = null,
} = {}) {
  const tasksByView = {
    [MOBILE_ROLE_TASK_VIEW_KEYS.TODO]: todoTasks,
    [MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY]: historyTasks,
    [MOBILE_ROLE_TASK_VIEW_KEYS.RISK]: riskTasks,
    [MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL]: approvalTasks,
  }
  const tasks = Array.isArray(tasksByView[viewKey]) ? tasksByView[viewKey] : []
  const selectedTask =
    selectedTaskID === null || selectedTaskID === undefined
      ? null
      : tasks.find((task) => String(task?.id) === String(selectedTaskID)) ||
        null

  return {
    tasks,
    selectedTask,
    actionsEnabled:
      Boolean(selectedTask) && viewKey !== MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY,
  }
}

export function mergeMobileRoleTaskPage(
  currentSlot = createMobileRoleTaskSlot(),
  response = {},
  { append = false, viewKey = '' } = {}
) {
  if (append && currentSlot.server_time !== response.server_time) {
    throw Object.assign(new Error('任务列表已更新，请刷新后重试'), {
      isInvalidResponse: true,
    })
  }

  const items = append ? [...(currentSlot.items || [])] : []
  const initialItemCount = items.length
  const seenIDs = new Set(
    items.map((task) => String(task?.id ?? '').trim()).filter(Boolean)
  )

  for (const task of Array.isArray(response.items) ? response.items : []) {
    const id = String(task?.id ?? '').trim()
    if (!id || seenIDs.has(id)) {
      throw Object.assign(new Error('任务分页结果重复，请刷新后重试'), {
        isInvalidResponse: true,
      })
    }
    seenIDs.add(id)
    items.push(task)
  }

  const nextCursor = String(response.next_cursor || '').trim()
  const hasMore = response.has_more === true
  const countSummary = append
    ? currentSlot.count_summary || null
    : response?.counts
      ? {
          counts: response.counts,
          risk_scope: response.risk_scope,
          server_time: response.server_time,
        }
      : null
  const expectedTotal = countSummary
    ? viewKey === MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY
      ? countSummary.counts.history
      : viewKey === MOBILE_ROLE_TASK_VIEW_KEYS.RISK
        ? countSummary.counts.risk
        : viewKey === MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL
          ? countSummary.counts.approval
          : viewKey === MOBILE_ROLE_TASK_VIEW_KEYS.TODO
            ? countSummary.counts.todo
            : null
    : null
  if (
    (append &&
      hasMore &&
      (!nextCursor ||
        nextCursor === String(currentSlot.next_cursor || '').trim() ||
        items.length === initialItemCount)) ||
    (Number.isSafeInteger(expectedTotal) &&
      (items.length > expectedTotal ||
        (hasMore && items.length >= expectedTotal) ||
        (!hasMore && items.length !== expectedTotal)))
  ) {
    throw Object.assign(new Error('任务分页结果异常，请刷新后重试'), {
      isInvalidResponse: true,
    })
  }

  return {
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
    server_time: response.server_time || 0,
    count_summary: countSummary,
    status_counts: append ? currentSlot.status_counts : resolveBusinessStatusCounts(response),
    loaded: true,
    loading: false,
    error: '',
  }
}
