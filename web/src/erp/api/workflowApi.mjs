import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { requireWorkflowTaskMutationParams } from '../utils/workflowTaskMutation.mjs'
import { requireWorkflowTaskBoardResponse } from '../utils/workflowTaskBoardContract.mjs'

const workflowRpc = new JsonRpc({
  url: 'workflow',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const WORKFLOW_TASK_STATUS_KEYS = new Set([
  'ready',
  'blocked',
  'done',
  'rejected',
])
const WORKFLOW_TASK_MUTATION_STATUS_BY_OPERATION = Object.freeze({
  complete: 'done',
  block: 'blocked',
  reject: 'rejected',
  resume: 'ready',
})
const WORKFLOW_TASK_URGE_STATUS_KEYS = new Set(['ready', 'blocked'])
const WORKFLOW_TASK_ESCALATION_TARGET_BY_ACTION = Object.freeze({
  escalate_to_pmc: 'pmc',
  escalate_to_boss: 'boss',
})
const WORKFLOW_ROLE_TASK_VIEW_KEYS = new Set(['todo', 'history', 'risk'])
const WORKFLOW_ROLE_TASK_QUERY_KEYS = new Set([
  'view_key',
  'role_key',
  'limit',
  'cursor',
])
const WORKFLOW_ROLE_TASK_STATUS_KEYS_BY_VIEW = Object.freeze({
  todo: new Set(['ready', 'blocked']),
  history: new Set(['done', 'rejected']),
  risk: new Set(['ready', 'blocked']),
})

function dataOf(result) {
  return result?.data || {}
}

function requireWorkflowMutationParams(operation, params = {}) {
  return requireWorkflowTaskMutationParams(operation, params, {
    requireIdempotencyKey: true,
  })
}

function requireWorkflowRoleTaskQuery(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('岗位任务查询参数无效')
  }
  for (const key of Object.keys(params)) {
    if (!WORKFLOW_ROLE_TASK_QUERY_KEYS.has(key)) {
      throw new TypeError('岗位任务查询参数无效')
    }
  }

  const viewKey = typeof params.view_key === 'string' ? params.view_key : ''
  const roleKey = typeof params.role_key === 'string' ? params.role_key : ''
  const { cursor } = params
  if (
    !WORKFLOW_ROLE_TASK_VIEW_KEYS.has(viewKey) ||
    !roleKey ||
    roleKey !== roleKey.trim() ||
    !Number.isSafeInteger(params.limit) ||
    params.limit < 1 ||
    params.limit > 100 ||
    (cursor !== undefined &&
      (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim()))
  ) {
    throw new TypeError('岗位任务查询参数无效')
  }

  return {
    view_key: viewKey,
    role_key: roleKey,
    limit: params.limit,
    ...(cursor ? { cursor } : {}),
  }
}

function invalidWorkflowRoleTaskResponse() {
  return Object.assign(new Error('岗位任务响应无效，请稍后重试'), {
    isInvalidResponse: true,
  })
}

function requireWorkflowRoleTaskResponse(result, query) {
  const response = dataOf(result)
  const allowedStatusKeys =
    WORKFLOW_ROLE_TASK_STATUS_KEYS_BY_VIEW[query.view_key]
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    !Array.isArray(response.items) ||
    typeof response.next_cursor !== 'string' ||
    typeof response.has_more !== 'boolean' ||
    !Number.isSafeInteger(response.server_time) ||
    response.server_time <= 0 ||
    (response.has_more && !response.next_cursor) ||
    (response.has_more && response.items.length === 0) ||
    (!response.has_more && response.next_cursor) ||
    response.items.some(
      (task) =>
        !task ||
        typeof task !== 'object' ||
        Array.isArray(task) ||
        !Number.isSafeInteger(task.id) ||
        task.id <= 0 ||
        !Number.isSafeInteger(task.version) ||
        task.version <= 0 ||
        !WORKFLOW_TASK_STATUS_KEYS.has(task.task_status_key) ||
        !allowedStatusKeys.has(task.task_status_key)
    )
  ) {
    throw invalidWorkflowRoleTaskResponse()
  }
  return response
}

function workflowTaskUrgeResultInvalid(params, task) {
  if (
    !Number.isSafeInteger(task.urge_count) ||
    task.urge_count < 1 ||
    !Number.isSafeInteger(task.last_urged_at) ||
    task.last_urged_at <= 0 ||
    !Number.isSafeInteger(task.last_urged_by) ||
    task.last_urged_by <= 0 ||
    typeof task.last_urged_by_role_key !== 'string' ||
    !task.last_urged_by_role_key ||
    task.last_urged_by_role_key !== task.last_urged_by_role_key.trim()
  ) {
    return true
  }

  const escalationTarget = WORKFLOW_TASK_ESCALATION_TARGET_BY_ACTION[params.action]
  return Boolean(
    escalationTarget &&
      (!Number.isSafeInteger(task.escalated_at) ||
        task.escalated_at <= 0 ||
        task.escalate_target_role_key !== escalationTarget)
  )
}

function requireWorkflowTaskMutationResult(operation, params, result) {
  const task = dataOf(result)?.task
  const expectedStatus = WORKFLOW_TASK_MUTATION_STATUS_BY_OPERATION[operation]
  if (
    !task ||
    typeof task !== 'object' ||
    Array.isArray(task) ||
    !Number.isSafeInteger(task.id) ||
    task.id <= 0 ||
    task.id !== params.task_id ||
    !Number.isSafeInteger(task.version) ||
    task.version <= 0 ||
    typeof task.task_status_key !== 'string' ||
    !WORKFLOW_TASK_STATUS_KEYS.has(task.task_status_key) ||
    (expectedStatus && task.task_status_key !== expectedStatus) ||
    (operation === 'urge' &&
      (!WORKFLOW_TASK_URGE_STATUS_KEYS.has(task.task_status_key) ||
        workflowTaskUrgeResultInvalid(params, task)))
  ) {
    throw Object.assign(new Error('任务响应无效，请刷新后重试'), {
      isInvalidResponse: true,
    })
  }
  return task
}

export async function listWorkflowTasks(params = {}) {
  const result = await workflowRpc.call('list_tasks', params)
  return dataOf(result)
}

export async function listWorkflowRoleTasks(params = {}) {
  const query = requireWorkflowRoleTaskQuery(params)
  const result = await workflowRpc.call('list_role_tasks', query)
  return requireWorkflowRoleTaskResponse(result, query)
}

export async function listAllWorkflowRoleTasks(params = {}) {
  const initialQuery = requireWorkflowRoleTaskQuery(params)
  const baseQuery = { ...initialQuery }
  delete baseQuery.cursor
  const items = []
  const seenTaskIDs = new Set()
  const seenCursors = new Set()
  let cursor = initialQuery.cursor || ''
  let serverTime = 0

  while (true) {
    if (cursor) {
      if (seenCursors.has(cursor)) throw invalidWorkflowRoleTaskResponse()
      seenCursors.add(cursor)
    }
    const response = await listWorkflowRoleTasks({
      ...baseQuery,
      ...(cursor ? { cursor } : {}),
    })
    if (serverTime && response.server_time !== serverTime) {
      throw invalidWorkflowRoleTaskResponse()
    }
    serverTime ||= response.server_time
    for (const task of response.items) {
      if (seenTaskIDs.has(task.id)) throw invalidWorkflowRoleTaskResponse()
      seenTaskIDs.add(task.id)
      items.push(task)
    }
    if (!response.has_more) {
      return {
        items,
        next_cursor: '',
        has_more: false,
        server_time: serverTime,
      }
    }
    cursor = response.next_cursor
  }
}

export async function getWorkflowTaskBoard(params = {}) {
  const result = await workflowRpc.call('get_task_board', params)
  return requireWorkflowTaskBoardResponse(dataOf(result), params)
}

export async function completeWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('complete', params)
  const result = await workflowRpc.call('complete_task_action', mutationParams)
  return requireWorkflowTaskMutationResult('complete', mutationParams, result)
}

export async function blockWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('block', params)
  const result = await workflowRpc.call('block_task_action', mutationParams)
  return requireWorkflowTaskMutationResult('block', mutationParams, result)
}

export async function rejectWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('reject', params)
  const result = await workflowRpc.call('reject_task_action', mutationParams)
  return requireWorkflowTaskMutationResult('reject', mutationParams, result)
}

export async function resumeWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('resume', params)
  const result = await workflowRpc.call('resume_task_action', mutationParams)
  return requireWorkflowTaskMutationResult('resume', mutationParams, result)
}

export async function urgeWorkflowTask(params = {}) {
  const mutationParams = requireWorkflowMutationParams('urge', params)
  const result = await workflowRpc.call('urge_task', mutationParams)
  return requireWorkflowTaskMutationResult('urge', mutationParams, result)
}

export async function explainWorkflowActionAccess(params = {}, options = {}) {
  const result = await workflowRpc.call(
    'explain_action_access',
    params,
    options
  )
  return dataOf(result)
}

export async function explainWorkflowTaskAssignment(params = {}, options = {}) {
  const result = await workflowRpc.call(
    'explain_task_assignment',
    params,
    options
  )
  return dataOf(result)
}

export async function listWorkflowBusinessStates(params = {}) {
  const result = await workflowRpc.call('list_business_states', params)
  return dataOf(result)
}
