import {
  getWorkflowTaskDueStatus,
  isTerminalWorkflowTask,
} from './workflowDashboardStats.mjs'
import {
  getWorkflowTaskReason as resolveWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
} from './workflowTaskReason.mjs'
import { getBusinessStatusLabel } from '../config/workflowStatus.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { getRoleDisplayName } from './roleKeys.mjs'

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
  { value: 'engineering', label: '工程' },
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
    title: '可推进任务',
    description: '当前筛选下待处理、可执行和处理中任务，优先从这里处理。',
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

export function getWorkflowTaskOwnerRoleLabel(task = {}) {
  const ownerRoleKey = getTaskOwnerRoleKey(task)
  return getRoleDisplayName(ownerRoleKey, '责任岗位')
}

export function getWorkflowTaskBusinessStatusLabel(task = {}) {
  const payload = payloadOf(task)
  const explicitLabel = String(
    task.business_status_label ||
      payload.business_status_label ||
      payload.business_status_name ||
      payload.business_status_text ||
      ''
  ).trim()
  if (explicitLabel) return explicitLabel

  const businessStatusKey = String(task.business_status_key || '').trim()
  if (!businessStatusKey) return '业务状态未记录'
  return getBusinessStatusLabel(businessStatusKey)
}

export function getWorkflowTaskCodeLabel(task = {}) {
  return String(task.task_code || '').trim() || '任务已关联'
}

function getAdminRoleKeys(admin = {}) {
  return Array.isArray(admin?.roles)
    ? admin.roles
        .map((role) => String(role?.role_key || role?.key || '').trim())
        .filter(Boolean)
    : []
}

function adminHasRole(admin = {}, roleKey = '') {
  const normalizedRoleKey = String(roleKey || '').trim()
  if (!normalizedRoleKey) return false
  return getAdminRoleKeys(admin).includes(normalizedRoleKey)
}

function isAssignedToAdmin(admin = {}, task = {}) {
  const assigneeID = Number(task?.assignee_id || 0)
  if (!Number.isFinite(assigneeID) || assigneeID <= 0) return false
  return assigneeID === Number(admin?.id || 0)
}

function isBossOrderApprovalTask(task = {}) {
  return (
    String(task?.source_type || '').trim() === 'project-orders' &&
    String(task?.task_group || '').trim() === 'order_approval' &&
    getTaskOwnerRoleKey(task) === 'boss'
  )
}

function isShipmentReleaseTask(task = {}) {
  return String(task?.task_group || '').trim() === 'shipment_release'
}

export function getWorkflowTaskActionPermission(actionMode = '', task = {}) {
  if (actionMode === 'complete') {
    return isBossOrderApprovalTask(task)
      ? 'workflow.task.approve'
      : 'workflow.task.complete'
  }
  if (
    actionMode === 'block' ||
    actionMode === 'reject' ||
    actionMode === 'urge'
  ) {
    return 'workflow.task.update'
  }
  return ''
}

function canHandleTaskByOwner(admin = {}, task = {}) {
  if (isAssignedToAdmin(admin, task)) return true
  if (admin?.is_super_admin === true && isShipmentReleaseTask(task)) return true
  return adminHasRole(admin, getTaskOwnerRoleKey(task))
}

function canUrgeTaskByOwner(admin = {}, task = {}) {
  if (admin?.is_super_admin === true) return true
  if (adminHasRole(admin, 'pmc') || adminHasRole(admin, 'boss')) return true
  if (isAssignedToAdmin(admin, task)) return true
  return adminHasRole(admin, getTaskOwnerRoleKey(task))
}

export function canRunWorkflowTaskAction(
  admin = {},
  task = {},
  actionMode = ''
) {
  if (!task || !actionMode || isTerminalWorkflowTask(task)) return false

  const permissionKey = getWorkflowTaskActionPermission(actionMode, task)
  if (!hasActionPermission(admin, permissionKey)) return false

  if (actionMode === 'urge') {
    return canUrgeTaskByOwner(admin, task)
  }
  return canHandleTaskByOwner(admin, task)
}

export function getWorkflowTaskAllowedActionModes(admin = {}, task = {}) {
  return ['complete', 'block', 'reject', 'urge'].filter((actionMode) =>
    canRunWorkflowTaskAction(admin, task, actionMode)
  )
}

export function getWorkflowTaskReadonlyReason(admin = {}, task = {}) {
  if (!task) return ''
  if (isTerminalWorkflowTask(task)) {
    return '该任务已结束，只能查看上下文。'
  }

  const ownerRoleKey = getTaskOwnerRoleKey(task)
  const hasAnyWorkflowActionPermission = [
    'workflow.task.complete',
    'workflow.task.update',
    'workflow.task.approve',
  ].some((permissionKey) => hasActionPermission(admin, permissionKey))
  if (!hasAnyWorkflowActionPermission) {
    return '当前账号只有查看任务权限，没有完成、阻塞或催办权限。'
  }
  if (ownerRoleKey && !canHandleTaskByOwner(admin, task)) {
    return `当前账号不属于${getWorkflowTaskOwnerRoleLabel(task)}责任角色，也不是该任务的指定处理人。`
  }
  return '当前账号没有可执行的任务处理动作。'
}

export function getWorkflowTaskStatusMeta(task = {}) {
  const key = getTaskStatusKey(task)
  return (
    TASK_STATUS_META[key] || {
      label: key ? '未知状态' : '未知',
      color: 'default',
    }
  )
}

export function getWorkflowTaskReason(task = {}) {
  return resolveWorkflowTaskReason(task)
}

export { getWorkflowTaskReasonLabel }

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
    getWorkflowTaskBusinessStatusLabel(task),
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
