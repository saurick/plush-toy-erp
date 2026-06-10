import {
  getWorkflowTaskDueStatus,
  isTerminalWorkflowTask,
} from './workflowDashboardStats.mjs'

export const TASK_BOARD_STATUS_OPTIONS = Object.freeze([
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'blocked', label: '阻塞' },
  { value: 'rejected', label: '退回' },
  { value: 'overdue', label: '已超时' },
  { value: 'dueSoon', label: '即将到期' },
  { value: 'done', label: '已完成' },
])

export const TASK_BOARD_ROLE_OPTIONS = Object.freeze([
  { value: 'all', label: '全部角色' },
  { value: 'boss', label: '老板' },
  { value: 'sales', label: '业务' },
  { value: 'purchase', label: '采购' },
  { value: 'production', label: '生产' },
  { value: 'warehouse', label: '仓库' },
  { value: 'finance', label: '财务' },
  { value: 'pmc', label: 'PMC' },
  { value: 'quality', label: '品质' },
])

export const TASK_BOARD_DUE_OPTIONS = Object.freeze([
  { value: 'all', label: '全部到期' },
  { value: 'overdue', label: '已超时' },
  { value: 'dueSoon', label: '即将到期' },
  { value: 'noDue', label: '未设置到期' },
])

export const DEFAULT_TASK_BOARD_FILTERS = Object.freeze({
  keyword: '',
  status: 'all',
  role: 'all',
  due: 'all',
  sourceType: 'all',
})

const FILTER_QUERY_KEYS = Object.freeze({
  keyword: 'q',
  status: 'status',
  role: 'role',
  due: 'due',
  sourceType: 'source',
})

const STATUS_FILTER_VALUES = new Set(
  TASK_BOARD_STATUS_OPTIONS.map((item) => item.value)
)
const ROLE_FILTER_VALUES = new Set(
  TASK_BOARD_ROLE_OPTIONS.map((item) => item.value)
)
const DUE_FILTER_VALUES = new Set(
  TASK_BOARD_DUE_OPTIONS.map((item) => item.value)
)

const TASK_STATUS_META = Object.freeze({
  pending: { label: '待处理', color: 'blue' },
  ready: { label: '可执行', color: 'blue' },
  processing: { label: '处理中', color: 'processing' },
  blocked: { label: '阻塞', color: 'red' },
  rejected: { label: '退回', color: 'orange' },
  done: { label: '已完成', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
})

const LANE_DEFINITIONS = Object.freeze([
  {
    key: 'pending',
    title: '本页待办',
    description: '待处理、可执行和处理中任务，优先从这里处理。',
    tagColor: 'blue',
    match: (task) =>
      ['pending', 'ready', 'processing'].includes(getTaskStatusKey(task)),
  },
  {
    key: 'blocked',
    title: '阻塞异常',
    description: '阻塞或退回任务，需要填写原因并继续跟进。',
    tagColor: 'red',
    match: (task) => ['blocked', 'rejected'].includes(getTaskStatusKey(task)),
  },
  {
    key: 'due',
    title: '今日到期',
    description: '已超时或即将到期任务，需要当天确认处理人。',
    tagColor: 'orange',
    match: (task) =>
      ['overdue', 'due_soon'].includes(getWorkflowTaskDueStatus(task)) &&
      !isTerminalWorkflowTask(task),
  },
  {
    key: 'done',
    title: '已完成',
    description: '只表示协同任务关闭，不代表事实层已过账。',
    tagColor: 'green',
    match: (task) => isTerminalWorkflowTask(task),
  },
])

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export function getTaskStatusKey(task = {}) {
  return String(task.task_status_key || '').trim()
}

export function getTaskOwnerRoleKey(task = {}) {
  return String(task.owner_role_key || '').trim()
}

export function getWorkflowTaskStatusMeta(task = {}) {
  const key = getTaskStatusKey(task)
  return TASK_STATUS_META[key] || { label: key || '未知', color: 'default' }
}

export function getWorkflowTaskReason(task = {}) {
  const payload = payloadOf(task)
  return String(
    task.blocked_reason ||
      payload.blocked_reason ||
      payload.rejected_reason ||
      payload.business_status_reason ||
      ''
  ).trim()
}

export function getWorkflowTaskDueLabel(task = {}, nowMs = Date.now()) {
  const dueAt = Number(task.due_at || 0)
  if (!Number.isFinite(dueAt) || dueAt <= 0) {
    return '未设置到期'
  }

  const dueMs = dueAt * 1000
  const date = new Date(dueMs)
  const label = date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const dueStatus = getWorkflowTaskDueStatus(task, nowMs)
  if (dueStatus === 'overdue') return `${label} 已超时`
  if (dueStatus === 'due_soon') return `${label} 即将到期`
  return label
}

function normalizeFilterValue(value, fallback = 'all') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeKnownFilterValue(value, values, fallback = 'all') {
  const normalized = normalizeFilterValue(value, fallback)
  return values.has(normalized) ? normalized : fallback
}

export function normalizeWorkflowTaskBoardFilters(filters = {}) {
  return {
    keyword: String(filters.keyword || '').trim(),
    status: normalizeKnownFilterValue(filters.status, STATUS_FILTER_VALUES),
    role: normalizeKnownFilterValue(filters.role, ROLE_FILTER_VALUES),
    due: normalizeKnownFilterValue(filters.due, DUE_FILTER_VALUES),
    sourceType: normalizeFilterValue(filters.sourceType),
  }
}

export function hasActiveWorkflowTaskBoardFilters(filters = {}) {
  const normalized = normalizeWorkflowTaskBoardFilters(filters)
  return (
    normalized.keyword !== DEFAULT_TASK_BOARD_FILTERS.keyword ||
    normalized.status !== DEFAULT_TASK_BOARD_FILTERS.status ||
    normalized.role !== DEFAULT_TASK_BOARD_FILTERS.role ||
    normalized.due !== DEFAULT_TASK_BOARD_FILTERS.due ||
    normalized.sourceType !== DEFAULT_TASK_BOARD_FILTERS.sourceType
  )
}

export function readWorkflowTaskBoardFiltersFromSearch(searchParams = '') {
  const params =
    typeof searchParams.get === 'function'
      ? searchParams
      : new URLSearchParams(searchParams)
  return normalizeWorkflowTaskBoardFilters({
    keyword: params.get(FILTER_QUERY_KEYS.keyword),
    status: params.get(FILTER_QUERY_KEYS.status),
    role: params.get(FILTER_QUERY_KEYS.role),
    due: params.get(FILTER_QUERY_KEYS.due),
    sourceType: params.get(FILTER_QUERY_KEYS.sourceType),
  })
}

export function writeWorkflowTaskBoardFiltersToSearch(
  currentSearchParams = '',
  filters = {}
) {
  const params =
    typeof currentSearchParams.get === 'function'
      ? new URLSearchParams(currentSearchParams)
      : new URLSearchParams(currentSearchParams)
  const normalized = normalizeWorkflowTaskBoardFilters(filters)

  Object.values(FILTER_QUERY_KEYS).forEach((key) => params.delete(key))

  if (normalized.keyword) {
    params.set(FILTER_QUERY_KEYS.keyword, normalized.keyword)
  }
  if (normalized.status !== DEFAULT_TASK_BOARD_FILTERS.status) {
    params.set(FILTER_QUERY_KEYS.status, normalized.status)
  }
  if (normalized.role !== DEFAULT_TASK_BOARD_FILTERS.role) {
    params.set(FILTER_QUERY_KEYS.role, normalized.role)
  }
  if (normalized.due !== DEFAULT_TASK_BOARD_FILTERS.due) {
    params.set(FILTER_QUERY_KEYS.due, normalized.due)
  }
  if (normalized.sourceType !== DEFAULT_TASK_BOARD_FILTERS.sourceType) {
    params.set(FILTER_QUERY_KEYS.sourceType, normalized.sourceType)
  }

  return params
}

function taskMatchesStatus(task = {}, status = 'all') {
  const statusFilter = normalizeFilterValue(status)
  if (statusFilter === 'all') return true
  if (statusFilter === 'overdue') {
    return getWorkflowTaskDueStatus(task) === 'overdue'
  }
  if (statusFilter === 'dueSoon') {
    return getWorkflowTaskDueStatus(task) === 'due_soon'
  }
  if (statusFilter === 'pending') {
    return ['pending', 'ready'].includes(getTaskStatusKey(task))
  }
  return getTaskStatusKey(task) === statusFilter
}

function taskMatchesDue(task = {}, due = 'all') {
  const dueFilter = normalizeFilterValue(due)
  if (dueFilter === 'all') return true
  const dueStatus = getWorkflowTaskDueStatus(task)
  if (dueFilter === 'overdue') return dueStatus === 'overdue'
  if (dueFilter === 'dueSoon') return dueStatus === 'due_soon'
  if (dueFilter === 'noDue') return !Number(task.due_at || 0)
  return true
}

function taskMatchesKeyword(task = {}, keyword = '') {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!query) return true
  const payload = payloadOf(task)
  const text = [
    task.task_name,
    task.task_code,
    task.source_no,
    task.source_type,
    task.task_group,
    task.owner_role_key,
    task.business_status_key,
    task.blocked_reason,
    payload.record_title,
    payload.module_title,
    payload.blocked_reason,
    payload.rejected_reason,
  ]
    .join(' ')
    .toLowerCase()
  return text.includes(query)
}

export function filterWorkflowTaskBoardTasks(tasks = [], filters = {}) {
  const role = normalizeFilterValue(filters.role)
  const sourceType = normalizeFilterValue(filters.sourceType)
  return (tasks || []).filter((task) => {
    const roleMatched = role === 'all' || getTaskOwnerRoleKey(task) === role
    const sourceMatched =
      sourceType === 'all' || String(task.source_type || '') === sourceType
    return (
      roleMatched &&
      sourceMatched &&
      taskMatchesStatus(task, filters.status) &&
      taskMatchesDue(task, filters.due) &&
      taskMatchesKeyword(task, filters.keyword)
    )
  })
}

export function buildWorkflowTaskBoardLanes(tasks = []) {
  return LANE_DEFINITIONS.map((lane) => ({
    ...lane,
    tasks: (tasks || []).filter((task) => lane.match(task)).slice(0, 5),
    count: (tasks || []).filter((task) => lane.match(task)).length,
  }))
}
