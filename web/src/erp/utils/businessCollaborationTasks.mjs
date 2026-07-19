import {
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
} from './workflowTaskReason.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import { listAllPaginatedRecords } from './referencePagination.mjs'

const BLOCKING_TASK_STATUS_KEYS = new Set(['blocked', 'rejected'])
const BUSINESS_COLLABORATION_TASK_REQUEST_KEY =
  'business-collaboration-tasks'

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
  return isTerminalWorkflowTask(task)
}

export function isBusinessCollaborationTaskBlocking(task = {}) {
  return BLOCKING_TASK_STATUS_KEYS.has(
    getBusinessCollaborationTaskStatusKey(task)
  )
}

export function getBusinessCollaborationTaskReason(task = {}) {
  return getWorkflowTaskReason(task)
}

export function getBusinessCollaborationTaskReasonLabel(task = {}) {
  return getWorkflowTaskReasonLabel(task)
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

export async function loadBusinessCollaborationTasksForSource({
  beginLatestRequest,
  canRead,
  isAbortError = () => false,
  isCurrentSource = () => true,
  listTasks,
  onError = () => {},
  setLoadState = () => {},
  setTasks = () => {},
  sourceID,
  sourceType,
} = {}) {
  if (typeof beginLatestRequest !== 'function') {
    throw new TypeError('beginLatestRequest must be a function')
  }

  const request = beginLatestRequest(
    BUSINESS_COLLABORATION_TASK_REQUEST_KEY
  )
  const requestedSourceID = Number(sourceID || 0)
  const requestIsCurrent = () =>
    request.isCurrent() && isCurrentSource(requestedSourceID)

  try {
    if (!requestIsCurrent()) return { status: 'stale' }

    setTasks([])
    if (canRead !== true) {
      setLoadState('forbidden')
      return { status: 'forbidden', tasks: [] }
    }
    if (
      !Number.isSafeInteger(requestedSourceID) ||
      requestedSourceID <= 0
    ) {
      setLoadState('idle')
      return { status: 'idle', tasks: [] }
    }
    if (typeof listTasks !== 'function') {
      throw new TypeError('listTasks must be a function')
    }

    setLoadState('loading')
    try {
      const data = await listAllPaginatedRecords(
        listTasks,
        {
          source_type: String(sourceType || '').trim(),
          source_id: requestedSourceID,
        },
        'tasks',
        { signal: request.signal },
        {
          invalidResponseMessage:
            '服务器返回的当前业务记录协同任务不完整，请刷新后重试',
        }
      )
      if (!requestIsCurrent()) return { status: 'stale' }

      const nextTasks = Array.isArray(data?.tasks) ? data.tasks : []
      setTasks(nextTasks)
      setLoadState('ready')
      return { status: 'ready', tasks: nextTasks }
    } catch (error) {
      if (isAbortError(error) || !requestIsCurrent()) {
        return { status: 'stale' }
      }
      setTasks([])
      setLoadState('error')
      onError(error)
      return { status: 'error', error, tasks: [] }
    }
  } finally {
    request.finish()
  }
}

export function resolveBusinessCollaborationActionTask({
  actionTask,
  tasks = [],
} = {}) {
  const actionTaskID = String(actionTask?.id || '').trim()
  if (!actionTaskID) return null

  const latestTask = (Array.isArray(tasks) ? tasks : []).find(
    (task) => String(task?.id || '').trim() === actionTaskID
  )
  if (!latestTask || isBusinessCollaborationTaskTerminal(latestTask)) {
    return null
  }
  return latestTask
}

export function buildBusinessCollaborationTaskPanelModel({
  tasks = [],
  visibleLimit = 6,
} = {}) {
  const allTasks = Array.isArray(tasks) ? tasks : []
  const activeTasks = allTasks.filter(
    (task) => !isBusinessCollaborationTaskTerminal(task)
  )
  const blockedTasks = activeTasks.filter(isBusinessCollaborationTaskBlocking)
  const doneTasks = allTasks.filter(isBusinessCollaborationTaskTerminal)
  const limit =
    Number.isFinite(visibleLimit) && visibleLimit > 0 ? visibleLimit : 6

  return {
    totalTaskCount: allTasks.length,
    visibleLimit: limit,
    activeTaskCount: activeTasks.length,
    currentRecordTaskCount: activeTasks.length,
    blockedTaskCount: blockedTasks.length,
    doneTaskCount: doneTasks.length,
    currentRecordTasks: activeTasks.slice(0, limit),
    blockedTasks: blockedTasks.slice(0, limit),
    doneTasks: doneTasks.slice(0, limit),
  }
}
