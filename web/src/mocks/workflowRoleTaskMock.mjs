import { isWorkflowApprovalTask } from '../erp/utils/workflowTaskActionContract.mjs'

const WORKFLOW_ROLE_TASK_VIEW_KEYS = new Set([
  'todo',
  'history',
  'risk',
  'approval',
])
const WORKFLOW_ROLE_TASK_QUERY_KEYS = new Set([
  'view_key',
  'role_key',
  'limit',
  'cursor',
])
const WORKFLOW_TASK_STATUS_KEYS = new Set([
  'ready',
  'blocked',
  'done',
  'rejected',
  'withdrawn',
])

function normalizedText(value) {
  return String(value ?? '').trim()
}

function encodeCursor(beforeID, snapshotAt) {
  return `mock-role-task:${snapshotAt}:${beforeID}`
}

function decodeCursor(cursor, snapshotAt) {
  const normalizedCursor = normalizedText(cursor)
  if (!normalizedCursor) return { beforeID: 0, snapshotAt }
  const match = /^mock-role-task:(\d+):(\d+)$/u.exec(normalizedCursor)
  if (!match) throw new TypeError('invalid workflow role task cursor')
  const cursorSnapshotAt = Number(match[1])
  const beforeID = Number(match[2])
  if (
    !Number.isSafeInteger(cursorSnapshotAt) ||
    cursorSnapshotAt <= 0 ||
    !Number.isSafeInteger(beforeID) ||
    beforeID <= 0
  ) {
    throw new TypeError('invalid workflow role task cursor')
  }
  return { beforeID, snapshotAt: cursorSnapshotAt }
}

function requireQuery(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('invalid workflow role task query')
  }
  for (const key of Object.keys(params)) {
    if (!WORKFLOW_ROLE_TASK_QUERY_KEYS.has(key)) {
      throw new TypeError('invalid workflow role task query')
    }
  }
  const viewKey = normalizedText(params.view_key)
  const roleKey = normalizedText(params.role_key)
  if (
    !WORKFLOW_ROLE_TASK_VIEW_KEYS.has(viewKey) ||
    !roleKey ||
    roleKey !== params.role_key ||
    !Number.isSafeInteger(params.limit) ||
    params.limit < 1 ||
    params.limit > 100 ||
    (Object.hasOwn(params, 'cursor') &&
      (!params.cursor || normalizedText(params.cursor) !== params.cursor))
  ) {
    throw new TypeError('invalid workflow role task query')
  }
  return { viewKey, roleKey, limit: params.limit, cursor: params.cursor || '' }
}

function isRiskTask(task, snapshotAt) {
  const payload =
    task?.payload && typeof task.payload === 'object' ? task.payload : {}
  const dueAt = Number(task?.due_at || 0)
  return Boolean(
    task.task_status_key === 'blocked' ||
      (Number.isSafeInteger(dueAt) && dueAt > 0 && dueAt < snapshotAt) ||
      Number(task?.priority || 0) >= 3 ||
      task?.critical_path === true ||
      payload.critical_path === true ||
      Number(task?.urge_count || 0) > 0 ||
      Number(task?.escalated_at || 0) > 0
  )
}

export function buildWorkflowRoleTaskPageMock({
  tasks = [],
  params = {},
  snapshotAt,
  adminID = 0,
  crossRoleRiskAllowed = false,
  includeCounts = false,
} = {}) {
  const query = requireQuery(params)
  const initialSnapshotAt = Number(snapshotAt)
  if (!Number.isSafeInteger(initialSnapshotAt) || initialSnapshotAt <= 0) {
    throw new TypeError('workflow role task mock requires snapshot_at')
  }
  const cursor = decodeCursor(query.cursor, initialSnapshotAt)
  const normalizedTasks = Array.isArray(tasks) ? tasks : []
  for (const task of normalizedTasks) {
    if (
      !task ||
      !Number.isSafeInteger(task.id) ||
      task.id <= 0 ||
      !WORKFLOW_TASK_STATUS_KEYS.has(task.task_status_key)
    ) {
      throw new TypeError('unsupported workflow task in role view')
    }
  }

  const visibleForView = (viewKey, beforeID = 0) =>
    normalizedTasks
      .filter((task) => !beforeID || task.id < beforeID)
      .filter((task) => {
        if (viewKey === 'risk' && crossRoleRiskAllowed) return true
        return (
          normalizedText(task.owner_role_key) === query.roleKey ||
          (Number.isSafeInteger(adminID) &&
            adminID > 0 &&
            Number(task.assignee_id || 0) === adminID)
        )
      })
      .filter((task) => {
        if (viewKey === 'todo') {
          return ['ready', 'blocked'].includes(task.task_status_key)
        }
        if (viewKey === 'history') {
          return ['done', 'rejected', 'withdrawn'].includes(
            task.task_status_key
          )
        }
        if (viewKey === 'approval') {
          return (
            ['ready', 'blocked'].includes(task.task_status_key) &&
            isWorkflowApprovalTask(task)
          )
        }
        return (
          ['ready', 'blocked'].includes(task.task_status_key) &&
          isRiskTask(task, cursor.snapshotAt)
        )
      })

  const visible = visibleForView(query.viewKey, cursor.beforeID).sort(
    (left, right) => right.id - left.id
  )

  const hasMore = visible.length > query.limit
  const items = visible.slice(0, query.limit)
  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(items.at(-1).id, cursor.snapshotAt)
      : ''
  const counts =
    includeCounts && !query.cursor
      ? (() => {
          const roleVisibleTasks = normalizedTasks.filter(
            (task) =>
              normalizedText(task.owner_role_key) === query.roleKey ||
              (Number.isSafeInteger(adminID) &&
                adminID > 0 &&
                Number(task.assignee_id || 0) === adminID)
          )
          const ready = roleVisibleTasks.filter(
            (task) => task.task_status_key === 'ready'
          ).length
          const blocked = roleVisibleTasks.filter(
            (task) => task.task_status_key === 'blocked'
          ).length
          const done = roleVisibleTasks.filter(
            (task) => task.task_status_key === 'done'
          ).length
          const rejected = roleVisibleTasks.filter(
            (task) => task.task_status_key === 'rejected'
          ).length
          const withdrawn = roleVisibleTasks.filter(
            (task) => task.task_status_key === 'withdrawn'
          ).length
          const todo = ready + blocked
          const history = done + rejected + withdrawn
          const riskTasks = visibleForView('risk')
          return {
            approval: visibleForView('approval').length,
            blocked,
            done,
            history,
            overdue: riskTasks.filter((task) => {
              const dueAt = Number(task?.due_at || 0)
              return (
                Number.isSafeInteger(dueAt) &&
                dueAt > 0 &&
                dueAt < cursor.snapshotAt
              )
            }).length,
            ready,
            rejected,
            risk: riskTasks.length,
            todo,
            total: todo + history,
            withdrawn,
          }
        })()
      : null
  return {
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
    server_time: cursor.snapshotAt,
    ...(counts
      ? {
          counts,
          risk_scope: crossRoleRiskAllowed ? 'supervised' : 'role',
        }
      : {}),
  }
}
