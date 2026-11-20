import {
  RpcDomain,
  RpcMethod,
} from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'
import { requireWorkflowProcessContext } from '../utils/processRuntimePresentation.mjs'
import { requireWorkflowTaskMutationParams } from '../utils/workflowTaskMutation.mjs'
import { requireWorkflowTaskBoardResponse } from '../utils/workflowTaskBoardContract.mjs'
import { notifyWorkflowTasksChanged } from '../utils/workflowTaskChanges.mjs'
import {
  requireTrackingDetail,
  requireTrackingPage,
} from '../utils/workflowTracking.mjs'
import { requireTaskCalendarResponse } from '../utils/workflowTaskCalendar.mjs'
import {
  invalidWorkflowRoleTaskResponse,
  requireWorkflowExceptionsResponse,
  requireWorkflowRoleTaskQuery,
  requireWorkflowRoleTaskResponse,
  requireWorkflowTaskAssignmentOptionsQuery,
  requireWorkflowTaskAssignmentOptionsResponse,
  requireWorkflowTaskEventsResponse,
  requireWorkflowTaskHandlingChainResponse,
  requireWorkflowTaskLinkResponse,
  requireWorkflowTaskMutationResult,
  requireWorkflowTaskResponse,
  requireWorkflowWorkbenchQuery,
  requireWorkflowWorkbenchResponse,
  workflowTaskEventsRequest,
  workflowTaskHandlingChainRequest,
  workflowTaskLinkRequest,
} from '../utils/workflowApiContract.mjs'
import {
  requireFollowupCreateParams,
  requireFollowupOptions,
  requireFollowupReceipt,
} from '../utils/workflowFollowup.mjs'

const workflowRpc = new JsonRpc({
  url: RpcDomain.WORKFLOW,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function reportWorkflowProcessContextContractFailure() {
  console.warn('[workflow] 响应合同校验失败', {
    method: 'get_task_process_context',
    reason: 'response_contract_invalid',
  })
}

function requireWorkflowMutationParams(operation, params = {}) {
  return requireWorkflowTaskMutationParams(operation, params, {
    requireIdempotencyKey: true,
  })
}

function requireNotifiedWorkflowMutationResult(operation, params, result) {
  const task = requireWorkflowTaskMutationResult(operation, params, result)
  notifyWorkflowTasksChanged()
  return task
}

export async function listWorkflowTasks(params = {}, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.LIST_TASKS,
    params,
    options
  )
  return dataOf(result)
}

export async function listWorkflowTracking(params = {}, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.LIST_TRACKING,
    params,
    options
  )
  return requireTrackingPage(dataOf(result), params)
}

export async function getWorkflowTracking(ref, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TRACKING,
    ref,
    options
  )
  return requireTrackingDetail(dataOf(result).tracking, ref)
}

export async function getWorkflowTask(taskID, options = {}) {
  if (!Number.isSafeInteger(taskID) || taskID <= 0) {
    throw new TypeError('任务参数无效')
  }
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK,
    { task_id: taskID },
    options
  )
  return requireWorkflowTaskResponse(result, taskID)
}

export async function listWorkflowTaskEvents(taskId, options = {}) {
  const request = workflowTaskEventsRequest(taskId, options)
  const result = await workflowRpc.call(
    RpcMethod.workflow.LIST_TASK_EVENTS,
    request.params,
    request.requestOptions
  )
  return requireWorkflowTaskEventsResponse(result, request)
}

export async function getWorkflowTaskProcessContext(taskId, options = {}) {
  const normalizedTaskId = Number(taskId)
  if (!Number.isSafeInteger(normalizedTaskId) || normalizedTaskId <= 0) {
    throw new Error('任务流程参数无效')
  }
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK_PROCESS_CONTEXT,
    { task_id: normalizedTaskId },
    options
  )
  try {
    return requireWorkflowProcessContext(dataOf(result)?.process_context)
  } catch (error) {
    // Keep diagnostics actionable without logging task/source identifiers or
    // the response body. The caller still receives the business-facing error.
    reportWorkflowProcessContextContractFailure()
    throw error
  }
}

export async function getWorkflowTaskHandlingChain(taskId, options = {}) {
  const request = workflowTaskHandlingChainRequest(taskId, options)
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK_HANDLING_CHAIN,
    request.params,
    request.options
  )
  return requireWorkflowTaskHandlingChainResponse(result)
}

export async function getWorkflowTaskLink(taskID, options = {}) {
  const request = workflowTaskLinkRequest(taskID, options)
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK_LINK,
    request.params,
    request.options
  )
  return requireWorkflowTaskLinkResponse(result, request.offset)
}

async function listWorkflowRoleTaskPage(method, params = {}) {
  const query = requireWorkflowRoleTaskQuery(params)
  const result = await workflowRpc.call(method, query)
  return requireWorkflowRoleTaskResponse(result, query, method)
}

async function listAllWorkflowRoleTaskPages(method, params = {}) {
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
    const response = await listWorkflowRoleTaskPage(method, {
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

export async function listWorkflowRoleTasks(params = {}) {
  return listWorkflowRoleTaskPage('list_role_tasks', params)
}

export async function listWorkflowWorkbenchRoleTasks(params = {}) {
  return listWorkflowRoleTaskPage('list_workbench_role_tasks', params)
}

export async function listAllWorkflowWorkbenchRoleTasks(params = {}) {
  return listAllWorkflowRoleTaskPages('list_workbench_role_tasks', params)
}

export async function getWorkflowWorkbench(params = {}, options = {}) {
  const query = requireWorkflowWorkbenchQuery(params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_WORKBENCH,
    query,
    options
  )
  return requireWorkflowWorkbenchResponse(result, query)
}

export async function getWorkflowTaskBoard(params = {}, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK_BOARD,
    params,
    options
  )
  return requireWorkflowTaskBoardResponse(dataOf(result), params)
}

export async function getWorkflowTaskCalendar(params, options = {}) {
  const method = params.role_key
    ? RpcMethod.workflow.LIST_ROLE_TASKS
    : RpcMethod.workflow.GET_TASK_BOARD
  const result = await workflowRpc.call(method, params, options)
  return requireTaskCalendarResponse(dataOf(result), params)
}

export async function getWorkflowTaskAssignmentOptions(
  params = {},
  options = {}
) {
  const query = requireWorkflowTaskAssignmentOptionsQuery(params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK_ASSIGNMENT_OPTIONS,
    query,
    options
  )
  return requireWorkflowTaskAssignmentOptionsResponse(result, query.task_id)
}

export async function completeWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('complete', params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.COMPLETE_TASK_ACTION,
    mutationParams
  )
  return requireNotifiedWorkflowMutationResult(
    'complete',
    mutationParams,
    result
  )
}

export async function blockWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('block', params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.BLOCK_TASK_ACTION,
    mutationParams
  )
  return requireNotifiedWorkflowMutationResult('block', mutationParams, result)
}

export async function rejectWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('reject', params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.REJECT_TASK_ACTION,
    mutationParams
  )
  return requireNotifiedWorkflowMutationResult('reject', mutationParams, result)
}

export async function resumeWorkflowTaskAction(params = {}) {
  const mutationParams = requireWorkflowMutationParams('resume', params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.RESUME_TASK_ACTION,
    mutationParams
  )
  return requireNotifiedWorkflowMutationResult('resume', mutationParams, result)
}

export async function urgeWorkflowTask(params = {}) {
  const mutationParams = requireWorkflowMutationParams('urge', params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.URGE_TASK,
    mutationParams
  )
  return requireNotifiedWorkflowMutationResult('urge', mutationParams, result)
}

export async function reassignWorkflowTask(params = {}) {
  const mutationParams = requireWorkflowMutationParams('assign', params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.REASSIGN_TASK,
    mutationParams
  )
  return requireNotifiedWorkflowMutationResult('assign', mutationParams, result)
}

export async function explainWorkflowActionAccess(params = {}, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.EXPLAIN_ACTION_ACCESS,
    params,
    options
  )
  return dataOf(result)
}

export async function explainWorkflowTaskAssignment(params = {}, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.EXPLAIN_TASK_ASSIGNMENT,
    params,
    options
  )
  return dataOf(result)
}

export async function listWorkflowBusinessStates(params = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.LIST_BUSINESS_STATES,
    params
  )
  return dataOf(result)
}

export async function getWorkflowTaskCreateOptions(source, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.GET_TASK_CREATE_OPTIONS,
    source,
    options
  )
  return requireFollowupOptions(dataOf(result), source)
}

export async function createWorkflowFollowupTask(params) {
  const input = requireFollowupCreateParams(params)
  const result = await workflowRpc.call(
    RpcMethod.workflow.CREATE_FOLLOWUP_TASK,
    input
  )
  const receipt = requireFollowupReceipt(dataOf(result), input)
  notifyWorkflowTasksChanged()
  return receipt
}

export async function listWorkflowExceptions(params = {}, options = {}) {
  const result = await workflowRpc.call(
    RpcMethod.workflow.LIST_EXCEPTIONS,
    params,
    options
  )
  return requireWorkflowExceptionsResponse(result)
}
