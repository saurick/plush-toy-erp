const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])
const BLOCKING_TASK_STATUS_KEYS = new Set(['blocked', 'rejected'])

function normalizeTaskID(task = {}) {
  return String(task.id || '').trim()
}

function normalizeTaskSourceID(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const numericValue = Number(text)
  return Number.isFinite(numericValue) ? String(numericValue) : text
}

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export function getBusinessCollaborationTaskStatusKey(task = {}) {
  return String(task.task_status_key || '').trim()
}

export function isBusinessCollaborationTaskTerminal(task = {}) {
  return TERMINAL_TASK_STATUS_KEYS.has(
    getBusinessCollaborationTaskStatusKey(task)
  )
}

export function isBusinessCollaborationTaskBlocking(task = {}) {
  return BLOCKING_TASK_STATUS_KEYS.has(
    getBusinessCollaborationTaskStatusKey(task)
  )
}

export function getBusinessCollaborationTaskReason(task = {}) {
  const payload = payloadOf(task)
  return String(
    task.blocked_reason ||
      payload.blocked_reason ||
      payload.rejected_reason ||
      payload.business_status_reason ||
      ''
  ).trim()
}

export function getBusinessCollaborationTaskUrgeMeta(task = {}) {
  const payload = payloadOf(task)
  const urgeCount = Number(payload.urge_count || 0)
  const lastUrgeReason = String(payload.last_urge_reason || '').trim()
  const isUrged = Boolean(
    payload.urged === true || urgeCount > 0 || payload.last_urge_at
  )

  return {
    isUrged,
    urgeCount: isUrged ? urgeCount || 1 : 0,
    lastUrgeReason,
  }
}

export function filterBusinessCollaborationTasksBySource({
  tasks = [],
  sourceType = '',
  sourceIDs = [],
} = {}) {
  const allTasks = Array.isArray(tasks) ? tasks : []
  const normalizedSourceType = String(sourceType || '').trim()
  const normalizedSourceIDs = new Set(
    (Array.isArray(sourceIDs) ? sourceIDs : [sourceIDs])
      .map(normalizeTaskSourceID)
      .filter(Boolean)
  )

  return allTasks.filter((task) => {
    if (
      normalizedSourceType &&
      String(task.source_type || '').trim() !== normalizedSourceType
    ) {
      return false
    }
    if (
      normalizedSourceIDs.size > 0 &&
      !normalizedSourceIDs.has(normalizeTaskSourceID(task.source_id))
    ) {
      return false
    }
    return true
  })
}

export function buildBusinessCollaborationTaskPanelModel({
  tasks = [],
  selectedTasks = [],
  visibleLimit = 6,
} = {}) {
  const allTasks = Array.isArray(tasks) ? tasks : []
  const currentRecordTasks = Array.isArray(selectedTasks) ? selectedTasks : []
  const currentTaskIDs = new Set(
    currentRecordTasks.map(normalizeTaskID).filter(Boolean)
  )
  const pageTasks = allTasks.filter(
    (task) => !currentTaskIDs.has(normalizeTaskID(task))
  )
  const limit =
    Number.isFinite(visibleLimit) && visibleLimit > 0 ? visibleLimit : 6

  return {
    totalTaskCount: allTasks.length,
    activeTaskCount: allTasks.filter(
      (task) => !isBusinessCollaborationTaskTerminal(task)
    ).length,
    blockedTaskCount: allTasks.filter(isBusinessCollaborationTaskBlocking)
      .length,
    currentRecordTasks: currentRecordTasks.slice(0, limit),
    pageTasks: pageTasks.slice(0, limit),
    blockedTasks: allTasks
      .filter(isBusinessCollaborationTaskBlocking)
      .slice(0, limit),
    doneTasks: allTasks
      .filter(isBusinessCollaborationTaskTerminal)
      .slice(0, limit),
  }
}
