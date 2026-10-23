import { WorkCenterPaginationPolicy } from '../common/consts/policies.generated.mjs'
import { getWorkflowTaskIdentity } from '../erp/utils/workflowTaskIdentity.mjs'

const TASK_BOARD_LANE_KEYS = Object.freeze([
  'actionable',
  'exception',
  'due',
  'finished',
])
const UNSETTLED_TASK_STATUS_KEYS = new Set(['ready', 'blocked'])
const ACTIVE_TASK_STATUS_KEYS = new Set(['ready'])
const FINISHED_TASK_STATUS_KEYS = new Set(['done', 'rejected', 'withdrawn'])
const TASK_BOARD_STATUS_FILTER_KEYS = new Set([
  'all',
  'ready',
  'blocked',
  'rejected',
  'withdrawn',
  'done',
  'overdue',
  'dueSoon',
])
const TASK_BOARD_DUE_FILTER_KEYS = new Set([
  'all',
  'overdue',
  'dueSoon',
  'noDue',
])
const DUE_SOON_SECONDS = 24 * 60 * 60

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLimit(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) return WorkCenterPaginationPolicy.defaultPageSize
  return Math.min(number, WorkCenterPaginationPolicy.maxPageSize)
}

function normalizeOffset(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function normalizeSnapshotAt(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError('workflow task board mock requires snapshot_at')
  }
  return number
}

function taskStatus(task = {}) {
  return normalizeText(task.task_status_key)
}

function taskDueAt(task = {}) {
  const number = Number(task.due_at)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function isTaskOverdue(task, snapshotAt) {
  const dueAt = taskDueAt(task)
  return (
    dueAt !== null &&
    UNSETTLED_TASK_STATUS_KEYS.has(taskStatus(task)) &&
    dueAt < snapshotAt
  )
}

function isTaskDueSoon(task, snapshotAt) {
  const dueAt = taskDueAt(task)
  return (
    dueAt !== null &&
    UNSETTLED_TASK_STATUS_KEYS.has(taskStatus(task)) &&
    dueAt >= snapshotAt &&
    dueAt <= snapshotAt + DUE_SOON_SECONDS
  )
}

function matchesKeyword(task = {}, keyword = '') {
  const normalizedKeyword = normalizeText(keyword).toLowerCase()
  if (!normalizedKeyword) return true
  const payload =
    task.payload && typeof task.payload === 'object' ? task.payload : {}
  const values = [
    task.task_code,
    task.task_group,
    task.task_name,
    task.source_type,
    task.source_no,
    task.business_status_key,
    task.owner_role_key,
    payload.record_title,
    payload.module_title,
  ]
  const identity = getWorkflowTaskIdentity(task)
  if (identity.available) {
    values.push(
      identity.sourceNo,
      ...identity.items.flatMap((item) => [
        item.name,
        item.code,
        item.styleNo,
        item.supplierItemNo,
        item.orderNo,
      ])
    )
  }
  if (['blocked', 'rejected', 'withdrawn'].includes(taskStatus(task))) {
    values.push(
      task.blocked_reason,
      payload.blocked_reason,
      payload.rejected_reason
    )
  }
  return values.some((value) =>
    String(value ?? '')
      .toLowerCase()
      .includes(normalizedKeyword)
  )
}

function matchesStatus(task, status, snapshotAt) {
  const statusKey = taskStatus(task)
  if (status === 'all') return true
  if (status === 'overdue') {
    return isTaskOverdue(task, snapshotAt)
  }
  if (status === 'dueSoon') {
    return isTaskDueSoon(task, snapshotAt)
  }
  return statusKey === status
}

function matchesDue(task, due, snapshotAt) {
  if (due === 'all') return true
  if (due === 'overdue') return isTaskOverdue(task, snapshotAt)
  if (due === 'dueSoon') return isTaskDueSoon(task, snapshotAt)
  return due === 'noDue' && taskDueAt(task) === null
}

export function classifyWorkflowTaskBoardMockLane(task, snapshotAtValue) {
  const snapshotAt = normalizeSnapshotAt(snapshotAtValue)
  const statusKey = taskStatus(task)
  if (statusKey === 'blocked') return 'exception'
  if (FINISHED_TASK_STATUS_KEYS.has(statusKey)) return 'finished'
  if (ACTIVE_TASK_STATUS_KEYS.has(statusKey)) {
    const dueAt = taskDueAt(task)
    return dueAt !== null && dueAt <= snapshotAt + DUE_SOON_SECONDS
      ? 'due'
      : 'actionable'
  }
  throw new TypeError(`unsupported workflow task status: ${statusKey || '-'}`)
}

function compareTaskIDDescending(left, right) {
  const leftID = Number(left?.id || 0)
  const rightID = Number(right?.id || 0)
  if (Number.isFinite(leftID) && Number.isFinite(rightID)) {
    return rightID - leftID
  }
  return normalizeText(right?.id).localeCompare(normalizeText(left?.id))
}

export function buildWorkflowTaskBoardMock({
  tasks = [],
  params = {},
  snapshotAt,
} = {}) {
  const normalizedSnapshotAt = normalizeSnapshotAt(snapshotAt)
  const status = normalizeText(params.status) || 'all'
  const due = normalizeText(params.due) || 'all'
  if (!TASK_BOARD_STATUS_FILTER_KEYS.has(status)) {
    throw new TypeError(`unsupported workflow task board status: ${status}`)
  }
  if (!TASK_BOARD_DUE_FILTER_KEYS.has(due)) {
    throw new TypeError(`unsupported workflow task board due filter: ${due}`)
  }
  const ownerRoleKey = normalizeText(params.owner_role_key)
  const ownerRoleKeys = [
    ...new Set(
      (Array.isArray(tasks) ? tasks : [])
        .map((task) => normalizeText(task.owner_role_key))
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right))
  const visibleTasks = (Array.isArray(tasks) ? tasks : []).filter(
    (task) =>
      !ownerRoleKey || normalizeText(task.owner_role_key) === ownerRoleKey
  )
  const sourceTypes = [
    ...new Set(
      visibleTasks
        .map((task) => normalizeText(task.source_type))
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right))
  const sourceType = normalizeText(params.source_type)
  const dayStart = Math.floor((normalizedSnapshotAt + 8 * 3600) / 86400) * 86400 - 8 * 3600
  const periodDays = { today: 1, '7d': 7, '30d': 30 }[params.period]
  const from = periodDays ? dayStart - (periodDays - 1) * 86400 : params.period === 'custom' ? Date.parse(`${params.date_from}T00:00:00+08:00`) / 1000 : null
  const before = periodDays ? dayStart + 86400 : params.period === 'custom' ? Date.parse(`${params.date_to}T00:00:00+08:00`) / 1000 + 86400 : null
  const filteredTasks = visibleTasks
    .filter(
      (task) =>
        (from === null || (task.completed_at >= from && task.completed_at < before)) &&
        (params.todo_only !== true || UNSETTLED_TASK_STATUS_KEYS.has(taskStatus(task))) &&
        matchesKeyword(task, params.keyword) &&
        matchesStatus(task, status, normalizedSnapshotAt) &&
        matchesDue(task, due, normalizedSnapshotAt) &&
        (!sourceType || normalizeText(task.source_type) === sourceType)
    )
    .sort(compareTaskIDDescending)
  const laneTasks = Object.fromEntries(
    TASK_BOARD_LANE_KEYS.map((key) => [key, []])
  )
  filteredTasks.forEach((task) => {
    laneTasks[
      classifyWorkflowTaskBoardMockLane(task, normalizedSnapshotAt)
    ].push(task)
  })
  const counts = Object.fromEntries(
    TASK_BOARD_LANE_KEYS.map((key) => [key, laneTasks[key].length])
  )
  const laneKey = normalizeText(params.lane_key)
  const selectedLaneKeys = laneKey ? [laneKey] : TASK_BOARD_LANE_KEYS
  if (laneKey && laneKey !== 'all' && !TASK_BOARD_LANE_KEYS.includes(laneKey)) {
    throw new TypeError(`unsupported workflow task board lane: ${laneKey}`)
  }
  const limit = normalizeLimit(params.limit)
  const offset = normalizeOffset(params.offset)

  return {
    snapshot_at: normalizedSnapshotAt,
    total: filteredTasks.length,
    counts,
    lanes: selectedLaneKeys.map((key) => ({
      key,
      total: key === 'all' ? filteredTasks.length : counts[key],
      limit,
      offset,
      tasks: (key === 'all' ? filteredTasks : laneTasks[key]).slice(offset, offset + limit),
    })),
    source_types: sourceTypes,
    owner_role_keys: ownerRoleKeys,
  }
}
