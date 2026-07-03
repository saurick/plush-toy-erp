import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const workflowRpc = new JsonRpc({
  url: 'workflow',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listWorkflowTasks(params = {}) {
  const result = await workflowRpc.call('list_tasks', params)
  return dataOf(result)
}

export async function completeWorkflowTaskAction(params = {}) {
  const result = await workflowRpc.call('complete_task_action', params)
  return dataOf(result)?.task || null
}

export async function blockWorkflowTaskAction(params = {}) {
  const result = await workflowRpc.call('block_task_action', params)
  return dataOf(result)?.task || null
}

export async function rejectWorkflowTaskAction(params = {}) {
  const result = await workflowRpc.call('reject_task_action', params)
  return dataOf(result)?.task || null
}

export async function urgeWorkflowTask(params = {}) {
  const result = await workflowRpc.call('urge_task', params)
  return dataOf(result)?.task || null
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
