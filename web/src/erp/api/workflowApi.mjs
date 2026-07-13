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
  'pending',
  'ready',
  'processing',
  'blocked',
  'done',
  'rejected',
  'cancelled',
  'closed',
])
const WORKFLOW_TASK_MUTATION_STATUS_BY_OPERATION = Object.freeze({
  complete: 'done',
  block: 'blocked',
  reject: 'rejected',
})
const WORKFLOW_TASK_URGE_STATUS_KEYS = new Set([
  'pending',
  'ready',
  'processing',
  'blocked',
])

function dataOf(result) {
  return result?.data || {}
}

function requireWorkflowMutationParams(operation, params = {}) {
  return requireWorkflowTaskMutationParams(operation, params, {
    requireIdempotencyKey: true,
  })
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
      !WORKFLOW_TASK_URGE_STATUS_KEYS.has(task.task_status_key))
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
