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
  const tasks = Array.isArray(tasksByView[viewKey])
    ? tasksByView[viewKey]
    : []
  const selectedTask =
    selectedTaskID === null || selectedTaskID === undefined
      ? null
      : tasks.find(
          (task) => String(task?.id) === String(selectedTaskID)
        ) || null

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
    throw Object.assign(
      new Error('任务列表已更新，请刷新后重试'),
      { isInvalidResponse: true }
    )
  }

  const items = append ? [...(currentSlot.items || [])] : []
  const seenIDs = new Set(
    items.map((task) => String(task?.id ?? '').trim()).filter(Boolean)
  )

  for (const task of Array.isArray(response.items) ? response.items : []) {
    const id = String(task?.id ?? '').trim()
    if (!id || seenIDs.has(id)) continue
    seenIDs.add(id)
    items.push(task)
  }

  return {
    items,
    next_cursor: response.next_cursor || '',
    has_more: response.has_more === true,
    server_time: response.server_time || 0,
    loaded: true,
    loading: false,
    error: '',
  }
}
