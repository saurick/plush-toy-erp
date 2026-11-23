import { getBusinessDocumentSectionKey, getBusinessDocumentTypeKey } from '../erp/config/businessModules.mjs'
import { WorkCenterPaginationPolicy } from '../common/consts/policies.generated.mjs'
import { WorkflowTaskBoardSort } from '../common/consts/statuses.generated.mjs'
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
  'open',
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
  const taskNumber = workflowTaskMockNumberKeyword(keyword)
  if (taskNumber) return normalizeText(task.task_no).toUpperCase() === taskNumber
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

export function workflowTaskMockNumberKeyword(keyword) {
  const value = normalizeText(keyword).toUpperCase()
  return /^RW[0-9]{8}-[0-9]{4,19}$/u.test(value) ? value : ''
}

function matchesStatus(task, status, snapshotAt) {
  const statusKey = taskStatus(task)
  if (status === 'all') return true
  if (status === 'open') return UNSETTLED_TASK_STATUS_KEYS.has(statusKey)
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

function compareTaskTimes(left, right, sort) {
  const time = (task) => Number(FINISHED_TASK_STATUS_KEYS.has(taskStatus(task)) ? task.completed_at : task.due_at) || null
  const a = time(left)
  const b = time(right)
  if (a === null || b === null) return Number(a === null) - Number(b === null)
  return sort === WorkflowTaskBoardSort.TIME_DESC ? b - a : a - b
}

export function sortWorkbenchMockTasks(tasks, sort) {
  return tasks.sort((a, b) => compareTaskTimes(a, b, sort) ||
    normalizeText(a.task_name).localeCompare(normalizeText(b.task_name)) || compareTaskIDDescending(a, b))
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
        .map((task) => getBusinessDocumentTypeKey(task.source_type))
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right))
  const sourceType = getBusinessDocumentTypeKey(params.source_type)
  const assignee = normalizeText(params.assignee)
  const dayStart = Math.floor((normalizedSnapshotAt + 8 * 3600) / 86400) * 86400 - 8 * 3600
  const periodDays = { today: 1, '7d': 7, '30d': 30 }[params.period]
  const from = periodDays ? dayStart - (periodDays - 1) * 86400 : params.period === 'custom' ? Date.parse(`${params.date_from}T00:00:00+08:00`) / 1000 : null
  const before = periodDays ? dayStart + 86400 : params.period === 'custom' ? Date.parse(`${params.date_to}T00:00:00+08:00`) / 1000 + 86400 : null
  const dueFrom = params.due_date_from ? Date.parse(`${params.due_date_from}T00:00:00+08:00`) / 1000 : null
  const dueBefore = params.due_date_to ? Date.parse(`${params.due_date_to}T00:00:00+08:00`) / 1000 + 86400 : null
  const filteredTasks = visibleTasks
    .filter(
      (task) =>
        (from === null || (task.completed_at >= from && task.completed_at < before)) &&
        (dueFrom === null || (task.due_at >= dueFrom && task.due_at < dueBefore)) &&
        (params.todo_only !== true || UNSETTLED_TASK_STATUS_KEYS.has(taskStatus(task))) &&
        matchesKeyword(task, params.keyword) &&
        matchesStatus(task, status, normalizedSnapshotAt) &&
        matchesDue(task, due, normalizedSnapshotAt) &&
        (!assignee || (assignee === 'unassigned' ? !task.assignee_id : Number(assignee) === task.assignee_id)) &&
        (!sourceType || getBusinessDocumentTypeKey(task.source_type) === sourceType) &&
        (!params.source_section || params.source_section === 'all' || getBusinessDocumentSectionKey(task.source_type) === params.source_section)
    )
    .sort((a, b) => {
      if (params.sort === WorkflowTaskBoardSort.TIME_ASC || params.sort === WorkflowTaskBoardSort.TIME_DESC) {
        return compareTaskTimes(a, b, params.sort) || compareTaskIDDescending(a, b)
      }
      return compareTaskIDDescending(a, b)
    })
  if (params.progress_view) {
    const open = filteredTasks.filter((task) => UNSETTLED_TASK_STATUS_KEYS.has(taskStatus(task)))
    const lanes = {
      open,
      exception: open.filter((task) => classifyWorkflowTaskBoardMockLane(task, normalizedSnapshotAt) === 'exception'),
      due: open.filter((task) => isTaskOverdue(task, normalizedSnapshotAt) || isTaskDueSoon(task, normalizedSnapshotAt)),
      unassigned: open.filter((task) => !task.assignee_id),
      finished: filteredTasks.filter((task) => FINISHED_TASK_STATUS_KEYS.has(taskStatus(task))),
    }
    const category = params.progress_view
    const date = (task) => (category === 'finished' ? task.completed_at : task.due_at) || null
    const source = (task) => task.source_id && task.source_type ? `${getBusinessDocumentTypeKey(task.source_type)}:${task.source_id}` : `task:${task.id}`
    const groups = new Map()
    const rank = (task) => task.task_status_key === 'blocked' ? 0 : !task.assignee_id ? 1 : 2
    const items = lanes[category].sort((a, b) => rank(a) - rank(b) || (date(a) ?? Infinity) - (date(b) ?? Infinity) || a.id - b.id)
    for (const task of items) {
      const key = source(task)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    const anchor = items.find((task) => task.id === params.progress_anchor)
    const entries = params.progress_anchor ? (anchor ? groups.get(source(anchor)).map((task) => [task]) : []) : [...groups.values()]
    const rows = entries.map((group) => {
      const dates = group.map(date).filter((value) => value !== null)
      return { task: group[0], task_count: group.length, date: dates.length ? (category === 'finished' ? Math.max(...dates) : Math.min(...dates)) : null }
    })
    const offset = normalizeOffset(params.offset)
    return { snapshot_at: normalizedSnapshotAt,
total: rows.length,
counts: Object.fromEntries(Object.entries(lanes).map(([key, list]) => [key, list.length])),
      assignees: [],
rows: rows.slice(offset, offset + normalizeLimit(params.limit)) }
  }
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
