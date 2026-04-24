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

export async function createWorkflowTask(params = {}) {
  const result = await workflowRpc.call('create_task', params)
  return dataOf(result)?.task || null
}

export async function updateWorkflowTaskStatus(params = {}) {
  const result = await workflowRpc.call('update_task_status', params)
  return dataOf(result)?.task || null
}

export async function listWorkflowBusinessStates(params = {}) {
  const result = await workflowRpc.call('list_business_states', params)
  return dataOf(result)
}

export async function upsertWorkflowBusinessState(params = {}) {
  const result = await workflowRpc.call('upsert_business_state', params)
  return dataOf(result)?.business_state || null
}
