import { getWorkflowTaskDueStatus } from './workflowDashboardStats.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import {
  getWorkflowTaskReason as resolveWorkflowTaskReason,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskReasonLabel,
} from './workflowTaskReason.mjs'
import { getBusinessStatusLabel } from '../config/workflowStatus.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { getRoleDisplayName } from './roleKeys.mjs'
import {
  canWorkflowTaskStatusRunAction,
  getWorkflowTaskActionPermission,
  getWorkflowTaskStatusActionModes,
} from './workflowTaskActionContract.mjs'
import {
  WORKFLOW_TASK_BOARD_LANE_KEYS,
  requireWorkflowTaskBoardResponse,
} from './workflowTaskBoardContract.mjs'

export { getWorkflowTaskActionPermission }

export const TASK_BOARD_STATUS_OPTIONS = Object.freeze([
  { value: 'all', label: '全部状态' },
  { value: 'ready', label: '可执行' },
  { value: 'blocked', label: '阻塞' },
  { value: 'rejected', label: '退回' },
  { value: 'overdue', label: '已超时' },
  { value: 'dueSoon', label: '即将到期' },
  { value: 'done', label: '已完成' },
])

export const TASK_BOARD_ROLE_OPTIONS = Object.freeze([
  { value: 'all', label: '全部岗位' },
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
  { value: 'all', label: '全部截止时间' },
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
  lane: 'all',
  page: 1,
})

export const TASK_BOARD_OVERVIEW_LIMIT = 5
export const TASK_BOARD_FOCUS_PAGE_SIZE = 8
export const TASK_BOARD_LANE_DEFINITIONS = Object.freeze([
  {
    key: 'actionable',
    title: '常规待办',
    description: '未阻塞、未退回，也未进入到期提醒的待处理任务。',
    actionLabel: '查看全部常规待办',
    tagColor: 'blue',
  },
  {
    key: 'exception',
    title: '阻塞',
    description: '当前阻塞的任务，优先补齐原因和责任交接。',
    actionLabel: '查看全部阻塞任务',
    tagColor: 'red',
  },
  {
    key: 'due',
    title: '到期提醒',
    description: '已经超时或即将到期的任务，优先确认处理人。',
    actionLabel: '查看全部到期提醒',
    tagColor: 'orange',
  },
  {
    key: 'finished',
    title: '已结束',
    description: '已完成或已退回的任务只保留查看和追溯。',
    actionLabel: '查看全部已结束任务',
    tagColor: 'green',
  },
])

const FILTER_QUERY_KEYS = Object.freeze({
  keyword: 'q',
  status: 'status',
  role: 'role',
  due: 'due',
  sourceType: 'source',
  lane: 'lane',
  page: 'page',
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
const LANE_FILTER_VALUES = new Set(['all', ...WORKFLOW_TASK_BOARD_LANE_KEYS])

const TASK_STATUS_META = Object.freeze({
  ready: { label: '可执行', color: 'blue' },
  blocked: { label: '阻塞', color: 'red' },
  rejected: { label: '退回', color: 'orange' },
  done: { label: '已完成', color: 'green' },
})

const BUSINESS_STATUS_VISIBLE_LABEL_OVERRIDES = Object.freeze({
  'IQC 待检': '来料检验（IQC）待处理',
  入库协同已完成: '入库跟进已完成',
  出货协同已完成: '出货跟进已完成',
  结算协同已完成: '结算跟进已完成',
})

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
  return getRoleDisplayName(ownerRoleKey, '负责岗位')
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
  if (explicitLabel) {
    return BUSINESS_STATUS_VISIBLE_LABEL_OVERRIDES[explicitLabel] || explicitLabel
  }

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

function isShipmentReleaseTask(task = {}) {
  return String(task?.task_group || '').trim() === 'shipment_release'
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
  if (!canWorkflowTaskStatusRunAction(task, actionMode)) return false

  const permissionKey = getWorkflowTaskActionPermission(actionMode, task)
  if (!hasActionPermission(admin, permissionKey)) return false

  if (actionMode === 'urge') {
    return canUrgeTaskByOwner(admin, task)
  }
  return canHandleTaskByOwner(admin, task)
}

export function getWorkflowTaskAllowedActionModes(admin = {}, task = {}) {
  return getWorkflowTaskStatusActionModes(task).filter((actionMode) =>
    canRunWorkflowTaskAction(admin, task, actionMode)
  )
}

export function getWorkflowTaskReadonlyReason(admin = {}, task = {}) {
  if (!task) return ''
  if (isTerminalWorkflowTask(task)) {
    return '该任务已结束，只能查看任务详情。'
  }

  const ownerRoleKey = getTaskOwnerRoleKey(task)
  const hasAnyWorkflowActionPermission = [
    'workflow.task.complete',
    'workflow.task.update',
    'workflow.task.reject',
    'workflow.task.approve',
  ].some((permissionKey) => hasActionPermission(admin, permissionKey))
  if (!hasAnyWorkflowActionPermission) {
    return '当前账号只有查看任务权限，没有完成、阻塞或催办权限。'
  }
  if (ownerRoleKey && !canHandleTaskByOwner(admin, task)) {
    return `当前账号不属于${getWorkflowTaskOwnerRoleLabel(task)}，也不是该任务的指定处理人。`
  }
  return '当前账号没有可用的任务处理方式。'
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

export { getWorkflowTaskReasonLabel, getWorkflowTaskReasonMeta }

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

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) return fallback
  return number
}

export function normalizeWorkflowTaskBoardFilters(filters = {}) {
  return {
    keyword: String(filters.keyword || '').trim(),
    status: normalizeKnownFilterValue(filters.status, STATUS_FILTER_VALUES),
    role: normalizeKnownFilterValue(filters.role, ROLE_FILTER_VALUES),
    due: normalizeKnownFilterValue(filters.due, DUE_FILTER_VALUES),
    sourceType: normalizeFilterValue(filters.sourceType),
    lane: normalizeKnownFilterValue(filters.lane, LANE_FILTER_VALUES),
    page: normalizePositiveInteger(filters.page),
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
    lane: params.get(FILTER_QUERY_KEYS.lane),
    page: params.get(FILTER_QUERY_KEYS.page),
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
  if (normalized.lane !== DEFAULT_TASK_BOARD_FILTERS.lane) {
    params.set(FILTER_QUERY_KEYS.lane, normalized.lane)
    params.set(FILTER_QUERY_KEYS.page, String(normalized.page))
  }

  return params
}

export function buildWorkflowTaskBoardRequest(filters = {}) {
  const normalized = normalizeWorkflowTaskBoardFilters(filters)
  const focused = normalized.lane !== DEFAULT_TASK_BOARD_FILTERS.lane
  const params = {
    limit: focused ? TASK_BOARD_FOCUS_PAGE_SIZE : TASK_BOARD_OVERVIEW_LIMIT,
    offset: focused ? (normalized.page - 1) * TASK_BOARD_FOCUS_PAGE_SIZE : 0,
  }

  if (normalized.keyword) params.keyword = normalized.keyword
  if (normalized.status !== DEFAULT_TASK_BOARD_FILTERS.status) {
    params.status = normalized.status
  }
  if (normalized.role !== DEFAULT_TASK_BOARD_FILTERS.role) {
    params.owner_role_key = normalized.role
  }
  if (normalized.due !== DEFAULT_TASK_BOARD_FILTERS.due) {
    params.due = normalized.due
  }
  if (normalized.sourceType !== DEFAULT_TASK_BOARD_FILTERS.sourceType) {
    params.source_type = normalized.sourceType
  }
  if (focused) params.lane_key = normalized.lane
  return params
}

export function getWorkflowTaskBoardRequestKey(request = {}) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(request).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    )
  )
}

export function resolveWorkflowTaskBoardResponseState(
  responseState = null,
  request = {}
) {
  if (
    !responseState ||
    responseState.requestKey !== getWorkflowTaskBoardRequestKey(request)
  ) {
    return null
  }
  return responseState.response || null
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

export function buildWorkflowTaskBoardModel(response = {}, filters = {}) {
  const normalizedFilters = normalizeWorkflowTaskBoardFilters(filters)
  const focused = normalizedFilters.lane !== DEFAULT_TASK_BOARD_FILTERS.lane
  if (response !== null && response !== undefined) {
    requireWorkflowTaskBoardResponse(
      response,
      buildWorkflowTaskBoardRequest(normalizedFilters)
    )
  }
  const normalizedResponse = response || {}
  const responseLanes = new Map(
    (Array.isArray(normalizedResponse.lanes) ? normalizedResponse.lanes : [])
      .filter((lane) => LANE_FILTER_VALUES.has(String(lane?.key || '').trim()))
      .map((lane) => [String(lane.key).trim(), lane])
  )
  const counts = Object.fromEntries(
    TASK_BOARD_LANE_DEFINITIONS.map((definition) => {
      const responseLane = responseLanes.get(definition.key)
      const countValue = Object.hasOwn(
        normalizedResponse.counts || {},
        definition.key
      )
        ? normalizedResponse.counts[definition.key]
        : responseLane?.total
      return [definition.key, normalizeNonNegativeInteger(countValue)]
    })
  )
  const displayLimit = focused
    ? TASK_BOARD_FOCUS_PAGE_SIZE
    : TASK_BOARD_OVERVIEW_LIMIT
  const lanes = TASK_BOARD_LANE_DEFINITIONS.map((definition) => {
    const responseLane = responseLanes.get(definition.key) || {}
    const tasks = (
      Array.isArray(responseLane.tasks) ? responseLane.tasks : []
    ).slice(0, displayLimit)
    const count = counts[definition.key]
    return {
      ...definition,
      count,
      tasks,
      limit: normalizeNonNegativeInteger(responseLane.limit) || displayLimit,
      offset: normalizeNonNegativeInteger(responseLane.offset),
      hiddenCount: Math.max(0, count - tasks.length),
    }
  })
  const selectedLane = focused ? normalizedFilters.lane : 'all'
  const selectedLaneModel =
    lanes.find((lane) => lane.key === selectedLane) || null
  const pageCount = selectedLaneModel
    ? Math.max(
        1,
        Math.ceil(selectedLaneModel.count / TASK_BOARD_FOCUS_PAGE_SIZE)
      )
    : 1

  return {
    snapshotAt: normalizeNonNegativeInteger(normalizedResponse.snapshot_at),
    total: normalizeNonNegativeInteger(normalizedResponse.total),
    counts,
    lanes,
    visibleLanes: selectedLaneModel ? [selectedLaneModel] : lanes,
    selectedLane,
    focused,
    requestedPage: normalizedFilters.page,
    page: Math.min(normalizedFilters.page, pageCount),
    pageCount,
    sourceTypes: Array.isArray(normalizedResponse.source_types)
      ? normalizedResponse.source_types
          .map((sourceType) => String(sourceType || '').trim())
          .filter(Boolean)
      : [],
  }
}
