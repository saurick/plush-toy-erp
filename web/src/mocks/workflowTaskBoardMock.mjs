const TASK_BOARD_LANE_KEYS = Object.freeze([
  'actionable',
  'exception',
  'due',
  'finished',
])
const UNSETTLED_TASK_STATUS_KEYS = new Set([
  'pending',
  'ready',
  'processing',
  'blocked',
])
const ACTIVE_TASK_STATUS_KEYS = new Set(['pending', 'ready', 'processing'])
const FINISHED_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])
const DUE_SOON_SECONDS = 24 * 60 * 60

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLimit(value) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) return 5
  return Math.min(number, 50)
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
  if (['blocked', 'rejected'].includes(taskStatus(task))) {
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
  const normalizedStatus = normalizeText(status) || 'all'
  const statusKey = taskStatus(task)
  if (normalizedStatus === 'all') return true
  if (normalizedStatus === 'pending') {
    return ['pending', 'ready'].includes(statusKey)
  }
  if (normalizedStatus === 'overdue') {
    return isTaskOverdue(task, snapshotAt)
  }
  if (normalizedStatus === 'dueSoon') {
    return isTaskDueSoon(task, snapshotAt)
  }
  return statusKey === normalizedStatus
}

function matchesDue(task, due, snapshotAt) {
  const normalizedDue = normalizeText(due) || 'all'
  if (normalizedDue === 'all') return true
  if (normalizedDue === 'overdue') return isTaskOverdue(task, snapshotAt)
  if (normalizedDue === 'dueSoon') return isTaskDueSoon(task, snapshotAt)
  if (normalizedDue === 'noDue') return taskDueAt(task) === null
  return false
}

export function classifyWorkflowTaskBoardMockLane(task, snapshotAtValue) {
  const snapshotAt = normalizeSnapshotAt(snapshotAtValue)
  const statusKey = taskStatus(task)
  if (['blocked', 'rejected'].includes(statusKey)) return 'exception'
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
  const ownerRoleKey = normalizeText(params.owner_role_key)
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
  const filteredTasks = visibleTasks
    .filter(
      (task) =>
        matchesKeyword(task, params.keyword) &&
        matchesStatus(task, params.status, normalizedSnapshotAt) &&
        matchesDue(task, params.due, normalizedSnapshotAt) &&
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
  if (laneKey && !TASK_BOARD_LANE_KEYS.includes(laneKey)) {
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
      total: counts[key],
      limit,
      offset,
      tasks: laneTasks[key].slice(offset, offset + limit),
    })),
    source_types: sourceTypes,
  }
}
