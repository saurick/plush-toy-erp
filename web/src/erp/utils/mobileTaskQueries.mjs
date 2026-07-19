import { normalizeRoleKey } from './roleKeys.mjs'

export const MOBILE_ROLE_TASK_PAGE_LIMIT = 50

export const MOBILE_ROLE_TASK_VIEW_KEYS = Object.freeze({
  TODO: 'todo',
  HISTORY: 'history',
  RISK: 'risk',
})

const MOBILE_ROLE_TASK_VIEW_KEY_SET = new Set(
  Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)
)

const MOBILE_TASK_RECEIPT_STATUS_SET = new Set([
  'confirmed',
  'failed',
  'unknown',
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

export function readMobileRoleTaskScopedHistoryState(
  historyState,
  scopeKey
) {
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
    !MOBILE_TASK_RECEIPT_ACTION_SET.has(receipt?.action) ||
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
      ? mergeMobileRoleTaskPage(currentSlot, response, { append })
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
  limit = MOBILE_ROLE_TASK_PAGE_LIMIT,
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

  return {
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
  selectedTaskID = null,
} = {}) {
  const tasksByView = {
    [MOBILE_ROLE_TASK_VIEW_KEYS.TODO]: todoTasks,
    [MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY]: historyTasks,
    [MOBILE_ROLE_TASK_VIEW_KEYS.RISK]: riskTasks,
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
  { append = false } = {}
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
    if (!id || seenIDs.has(id)) continue
    seenIDs.add(id)
    items.push(task)
  }

  const nextCursor = String(response.next_cursor || '').trim()
  const hasMore = response.has_more === true
  if (
    append &&
    hasMore &&
    (!nextCursor ||
      nextCursor === String(currentSlot.next_cursor || '').trim() ||
      items.length === initialItemCount)
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
    loaded: true,
    loading: false,
    error: '',
  }
}
