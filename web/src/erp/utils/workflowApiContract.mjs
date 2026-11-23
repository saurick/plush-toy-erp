import { WorkCenterPaginationPolicy } from '../../common/consts/policies.generated.mjs'
import {
  WorkflowTaskBoardSort,
  WorkflowTaskStatus,
} from '../../common/consts/statuses.generated.mjs'
import { requireRpcData as dataOf } from '../../common/utils/jsonRpc.js'
import {
  businessStatusCount,
  resolveBusinessStatusCounts,
} from './businessStatusCounts.mjs'
import {
  DISCOVERY_REQUEST_KEYS,
  normalizeTaskDiscoveryFilters,
  taskDiscoveryRequest,
} from './workflowTaskDiscovery.mjs'
import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'
import { WORKFLOW_TASK_DUE_OPTIONS } from './workflowTaskListFilters.mjs'
import { isWorkflowHistoryDateFilter } from './workflowRoleTaskHistory.mjs'

const WORKFLOW_TASK_STATUS_KEYS = new Set(Object.values(WorkflowTaskStatus))
const WORKFLOW_TASK_MUTATION_STATUS_BY_OPERATION = Object.freeze({
  complete: WorkflowTaskStatus.DONE,
  block: WorkflowTaskStatus.BLOCKED,
  reject: WorkflowTaskStatus.REJECTED,
  resume: WorkflowTaskStatus.READY,
})
const WORKFLOW_TASK_URGE_STATUS_KEYS = new Set([
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.BLOCKED,
])
const WORKFLOW_TASK_ESCALATION_TARGET_BY_ACTION = Object.freeze({
  escalate_to_pmc: 'pmc',
  escalate_to_boss: 'boss',
})
const WORKFLOW_ROLE_TASK_VIEW_KEYS = new Set([
  'todo',
  'history',
  'risk',
  'approval',
])
const WORKFLOW_ROLE_TASK_QUERY_KEYS = new Set([
  'view_key',
  'role_key',
  'module_key',
  'chain_key',
  'stage_key',
  'assignee',
  'limit',
  'cursor',
  'keyword',
  'sort_key',
  'status_key',
  'period',
  'date_from',
  'date_to',
  'due',
  'source_type',
])
const WORKFLOW_ROLE_TASK_STATUS_KEYS_BY_VIEW = Object.freeze({
  todo: new Set([WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED]),
  history: new Set([
    WorkflowTaskStatus.DONE,
    WorkflowTaskStatus.REJECTED,
    WorkflowTaskStatus.WITHDRAWN,
  ]),
  risk: new Set([WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED]),
  approval: new Set([WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED]),
})
const WORKFLOW_ROLE_TASK_COUNT_KEYS = Object.freeze([
  'approval',
  WorkflowTaskStatus.BLOCKED,
  WorkflowTaskStatus.DONE,
  'history',
  'overdue',
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.REJECTED,
  'risk',
  'todo',
  'total',
  WorkflowTaskStatus.WITHDRAWN,
])
const WORKFLOW_ROLE_TASK_RESPONSE_KEYS = Object.freeze([
  'has_more',
  'items',
  'next_cursor',
  'server_time',
])
const WORKFLOW_ROLE_TASK_INITIAL_RESPONSE_KEYS = Object.freeze(
  [
    ...WORKFLOW_ROLE_TASK_RESPONSE_KEYS,
    'counts',
    'risk_scope',
    'status_counts',
  ].sort()
)
const WORKFLOW_ROLE_TASK_RISK_SCOPES = new Set(['role', 'supervised'])
const WORKFLOW_WORKBENCH_QUEUE_KEYS = new Set([
  'actionable',
  'risk',
  'approval',
])
const WORKFLOW_WORKBENCH_QUERY_KEYS = new Set([
  'queue_key',
  'sort',
  'limit',
  'offset',
])
const WORKFLOW_WORKBENCH_RESPONSE_KEYS = Object.freeze(
  [
    'counts',
    'items',
    'limit',
    'offset',
    'queue_key',
    'snapshot_at',
    'total',
  ].sort()
)
const WORKFLOW_WORKBENCH_COUNT_KEYS = Object.freeze(
  ['actionable', 'approval', 'risk'].sort()
)

function invalidResponse(message) {
  return Object.assign(new Error(message), { isInvalidResponse: true })
}

export function invalidWorkflowRoleTaskResponse() {
  return invalidResponse('岗位任务暂时无法显示，请稍后重试')
}

function discoveryInputOf(params) {
  return Object.fromEntries(
    Object.entries(DISCOVERY_REQUEST_KEYS)
      .filter(([, requestKey]) => params[requestKey] !== undefined)
      .map(([key, requestKey]) => [key, params[requestKey]])
  )
}

export function requireWorkflowRoleTaskQuery(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('任务查询条件有误，请清除筛选后重试')
  }
  if (
    Object.keys(params).some((key) => !WORKFLOW_ROLE_TASK_QUERY_KEYS.has(key))
  ) {
    throw new TypeError('任务查询条件有误，请清除筛选后重试')
  }

  const discoveryInput = discoveryInputOf(params)
  const discovery = normalizeTaskDiscoveryFilters(discoveryInput, {
    includeStage: true,
    includeClassification: true,
  })
  if (
    Object.keys(discoveryInput).some(
      (key) =>
        typeof discoveryInput[key] !== 'string' ||
        discovery[key] !== discoveryInput[key]
    )
  ) {
    throw new TypeError('任务筛选条件无效，请重新选择')
  }

  const viewKey = typeof params.view_key === 'string' ? params.view_key : ''
  const roleKey = typeof params.role_key === 'string' ? params.role_key : ''
  const { cursor } = params
  const hasHistoryDateFilter = ['period', 'date_from', 'date_to'].some(
    (key) => params[key] !== undefined
  )
  const invalidHistoryDateFilter =
    hasHistoryDateFilter &&
    (viewKey !== 'history' ||
      ['period', 'date_from', 'date_to'].some(
        (key) =>
          params[key] !== undefined &&
          (typeof params[key] !== 'string' || !params[key])
      ) ||
      !isWorkflowHistoryDateFilter({
        period: params.period,
        dateFrom: params.date_from,
        dateTo: params.date_to,
      }))
  if (
    (params.due !== undefined &&
      !WORKFLOW_TASK_DUE_OPTIONS.some(({ value }) => value === params.due)) ||
    (params.source_type !== undefined &&
      (typeof params.source_type !== 'string' ||
        !params.source_type ||
        params.source_type !== params.source_type.trim() ||
        [...params.source_type].length > 64)) ||
    (params.sort_key !== undefined &&
      !(
        viewKey === 'history' ? ['completed'] : ['newest', 'oldest', 'due']
      ).includes(params.sort_key)) ||
    (params.status_key !== undefined &&
      !WORKFLOW_ROLE_TASK_STATUS_KEYS_BY_VIEW[viewKey]?.has(
        params.status_key
      )) ||
    invalidHistoryDateFilter ||
    (params.keyword !== undefined &&
      (typeof params.keyword !== 'string' ||
        !params.keyword.trim() ||
        params.keyword !== params.keyword.trim() ||
        [...params.keyword].length > 100)) ||
    !WORKFLOW_ROLE_TASK_VIEW_KEYS.has(viewKey) ||
    !roleKey ||
    roleKey !== roleKey.trim() ||
    !Number.isSafeInteger(params.limit) ||
    params.limit < 1 ||
    params.limit > 100 ||
    (cursor !== undefined &&
      (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim()))
  ) {
    throw new TypeError('任务查询条件有误，请清除筛选后重试')
  }

  return {
    ...taskDiscoveryRequest(discovery, {
      includeStage: true,
      includeClassification: true,
    }),
    view_key: viewKey,
    role_key: roleKey,
    limit: params.limit,
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.sort_key ? { sort_key: params.sort_key } : {}),
    ...(params.status_key ? { status_key: params.status_key } : {}),
    ...(params.period ? { period: params.period } : {}),
    ...(params.date_from ? { date_from: params.date_from } : {}),
    ...(params.date_to ? { date_to: params.date_to } : {}),
    ...(params.due ? { due: params.due } : {}),
    ...(params.source_type ? { source_type: params.source_type } : {}),
    ...(cursor ? { cursor } : {}),
  }
}

function isWorkflowRoleTaskCountSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  return Boolean(
    keys.length === WORKFLOW_ROLE_TASK_COUNT_KEYS.length &&
    keys.every((key, index) => key === WORKFLOW_ROLE_TASK_COUNT_KEYS[index]) &&
    WORKFLOW_ROLE_TASK_COUNT_KEYS.every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0
    ) &&
    value.todo === value.ready + value.blocked &&
    value.history === value.done + value.rejected + value.withdrawn &&
    value.total === value.todo + value.history &&
    value.overdue <= value.risk
  )
}

function workflowRoleTaskViewTotal(counts, viewKey) {
  if (viewKey === 'todo') return counts.todo
  if (viewKey === 'history') return counts.history
  if (viewKey === 'risk') return counts.risk
  if (viewKey === 'approval') return counts.approval
  return -1
}

export function requireWorkflowRoleTaskResponse(result, query, method) {
  const response = dataOf(result)
  const allowedStatusKeys =
    WORKFLOW_ROLE_TASK_STATUS_KEYS_BY_VIEW[query.view_key]
  const requiresCounts = method === 'list_role_tasks' && !query.cursor
  const expectedResponseKeys = requiresCounts
    ? WORKFLOW_ROLE_TASK_INITIAL_RESPONSE_KEYS
    : WORKFLOW_ROLE_TASK_RESPONSE_KEYS
  const responseKeys =
    response && typeof response === 'object' && !Array.isArray(response)
      ? Object.keys(response).sort()
      : []
  const itemIDs = Array.isArray(response?.items)
    ? response.items.map((task) => task?.id)
    : []
  const expectedTotal = requiresCounts
    ? workflowRoleTaskViewTotal(response?.counts || {}, query.view_key)
    : -1
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    responseKeys.length !== expectedResponseKeys.length ||
    !responseKeys.every((key, index) => key === expectedResponseKeys[index]) ||
    !Array.isArray(response.items) ||
    response.items.length > query.limit ||
    typeof response.next_cursor !== 'string' ||
    typeof response.has_more !== 'boolean' ||
    !Number.isSafeInteger(response.server_time) ||
    response.server_time <= 0 ||
    (response.has_more && !response.next_cursor) ||
    (response.has_more && response.items.length === 0) ||
    (!response.has_more && response.next_cursor) ||
    (requiresCounts && !isWorkflowRoleTaskCountSummary(response.counts)) ||
    (requiresCounts &&
      (!resolveBusinessStatusCounts(response) ||
        Object.keys(response.status_counts).some(
          (status) => !allowedStatusKeys.has(status)
        ) ||
        businessStatusCount(response.status_counts, query.status_key || '') !==
          expectedTotal)) ||
    (requiresCounts &&
      !WORKFLOW_ROLE_TASK_RISK_SCOPES.has(response.risk_scope)) ||
    new Set(itemIDs).size !== itemIDs.length ||
    (requiresCounts && response.items.length > expectedTotal) ||
    (requiresCounts &&
      response.has_more &&
      response.items.length >= expectedTotal) ||
    (requiresCounts &&
      !response.has_more &&
      response.items.length !== expectedTotal) ||
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
        !allowedStatusKeys.has(task.task_status_key) ||
        (query.status_key && task.task_status_key !== query.status_key) ||
        (query.view_key === 'approval' && !isWorkflowApprovalTask(task))
    )
  ) {
    throw invalidWorkflowRoleTaskResponse()
  }
  return response
}

export function requireWorkflowWorkbenchQuery(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('工作台查询条件有误，请刷新后重试')
  }
  if (
    Object.keys(params).some(
      (key) => !WORKFLOW_WORKBENCH_QUERY_KEYS.has(key)
    ) ||
    !WORKFLOW_WORKBENCH_QUEUE_KEYS.has(params.queue_key) ||
    (params.sort !== undefined &&
      ![
        WorkflowTaskBoardSort.TIME_ASC,
        WorkflowTaskBoardSort.TIME_DESC,
      ].includes(params.sort)) ||
    !Number.isSafeInteger(params.limit) ||
    params.limit < 1 ||
    params.limit > WorkCenterPaginationPolicy.maxPageSize ||
    !Number.isSafeInteger(params.offset) ||
    params.offset < 0
  ) {
    throw new TypeError('工作台查询条件有误，请刷新后重试')
  }
  return {
    queue_key: params.queue_key,
    ...(params.sort ? { sort: params.sort } : {}),
    limit: params.limit,
    offset: params.offset,
  }
}

export function requireWorkflowWorkbenchResponse(result, query) {
  const response = dataOf(result)
  const responseKeys =
    response && typeof response === 'object' && !Array.isArray(response)
      ? Object.keys(response).sort()
      : []
  const countKeys =
    response?.counts &&
    typeof response.counts === 'object' &&
    !Array.isArray(response.counts)
      ? Object.keys(response.counts).sort()
      : []
  const itemIDs = Array.isArray(response?.items)
    ? response.items.map((task) => task?.id)
    : []
  const queueTotal = response?.counts?.[query.queue_key]
  const availableOnPage = Math.max(0, Number(queueTotal || 0) - query.offset)
  if (
    responseKeys.length !== WORKFLOW_WORKBENCH_RESPONSE_KEYS.length ||
    !responseKeys.every(
      (key, index) => key === WORKFLOW_WORKBENCH_RESPONSE_KEYS[index]
    ) ||
    countKeys.length !== WORKFLOW_WORKBENCH_COUNT_KEYS.length ||
    !countKeys.every(
      (key, index) => key === WORKFLOW_WORKBENCH_COUNT_KEYS[index]
    ) ||
    WORKFLOW_WORKBENCH_COUNT_KEYS.some(
      (key) =>
        !Number.isSafeInteger(response?.counts?.[key]) ||
        response.counts[key] < 0
    ) ||
    response.queue_key !== query.queue_key ||
    response.limit !== query.limit ||
    response.offset !== query.offset ||
    !Number.isSafeInteger(response.snapshot_at) ||
    response.snapshot_at <= 0 ||
    !Number.isSafeInteger(response.total) ||
    response.total < 0 ||
    response.total !== queueTotal ||
    !Array.isArray(response.items) ||
    response.items.length > query.limit ||
    response.items.length !== Math.min(query.limit, availableOnPage) ||
    new Set(itemIDs).size !== itemIDs.length ||
    response.items.some(
      (task) =>
        !task ||
        typeof task !== 'object' ||
        Array.isArray(task) ||
        !Number.isSafeInteger(task.id) ||
        task.id <= 0 ||
        !Number.isSafeInteger(task.version) ||
        task.version <= 0 ||
        ![WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(
          task.task_status_key
        ) ||
        (query.queue_key === 'actionable' &&
          task.task_status_key !== WorkflowTaskStatus.READY) ||
        (query.queue_key === 'approval' && !isWorkflowApprovalTask(task))
    )
  ) {
    throw invalidResponse('工作台内容暂时无法确认，请稍后重试')
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
  const escalationTarget =
    WORKFLOW_TASK_ESCALATION_TARGET_BY_ACTION[params.action]
  return Boolean(
    escalationTarget &&
    (!Number.isSafeInteger(task.escalated_at) ||
      task.escalated_at <= 0 ||
      task.escalate_target_role_key !== escalationTarget)
  )
}

function workflowTaskAssignmentResultInvalid(params, task) {
  if (
    !WORKFLOW_TASK_URGE_STATUS_KEYS.has(task.task_status_key) ||
    task.version !== params.expected_version + 1
  ) {
    return true
  }
  if (params.assignee_id === null) {
    return Number(task.assignee_id || 0) !== 0
  }
  return task.assignee_id !== params.assignee_id
}

export function requireWorkflowTaskMutationResult(operation, params, result) {
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
    task.version !== params.expected_version + 1 ||
    typeof task.task_status_key !== 'string' ||
    !WORKFLOW_TASK_STATUS_KEYS.has(task.task_status_key) ||
    (expectedStatus && task.task_status_key !== expectedStatus) ||
    (operation === 'urge' &&
      (!WORKFLOW_TASK_URGE_STATUS_KEYS.has(task.task_status_key) ||
        workflowTaskUrgeResultInvalid(params, task))) ||
    (operation === 'assign' &&
      workflowTaskAssignmentResultInvalid(params, task))
  ) {
    throw invalidResponse('任务处理结果暂时无法确认，请刷新后重试')
  }
  return task
}

export function requireWorkflowTaskResponse(result, taskID) {
  const { task } = dataOf(result)
  if (
    task?.id !== taskID ||
    !Number.isSafeInteger(task.version) ||
    task.version <= 0 ||
    !WORKFLOW_TASK_STATUS_KEYS.has(task.task_status_key)
  ) {
    throw invalidResponse('任务详情暂不可用，请重试')
  }
  return task
}

export function workflowTaskEventsRequest(taskId, options = {}) {
  const normalizedTaskId = Number(taskId)
  if (!Number.isSafeInteger(normalizedTaskId) || normalizedTaskId <= 0) {
    throw new Error('任务轨迹参数无效')
  }
  const {
    limit = 100,
    beforeEventId = 0,
    scope = 'task',
    ...requestOptions
  } = options
  const normalizedLimit = Number(limit)
  const normalizedCursor = Number(beforeEventId)
  if (
    !Number.isSafeInteger(normalizedLimit) ||
    normalizedLimit < 1 ||
    normalizedLimit > 100 ||
    !Number.isSafeInteger(normalizedCursor) ||
    normalizedCursor < 0 ||
    !['task', 'flow'].includes(scope)
  ) {
    throw new Error('任务轨迹参数无效')
  }
  return {
    params: {
      task_id: normalizedTaskId,
      limit: normalizedLimit,
      ...(scope === 'flow' ? { scope } : {}),
      ...(normalizedCursor ? { before_event_id: normalizedCursor } : {}),
    },
    requestOptions,
    scope,
    limit: normalizedLimit,
    beforeEventId: normalizedCursor,
  }
}

export function requireWorkflowTaskEventsResponse(result, request) {
  const data = dataOf(result)
  if (!Array.isArray(data?.items) || typeof data?.truncated !== 'boolean') {
    throw new Error('本任务处理记录返回格式无效')
  }
  let previousId = request.beforeEventId || Number.MAX_SAFE_INTEGER
  for (const item of data.items) {
    if (
      !Number.isSafeInteger(item?.id) ||
      item.id <= 0 ||
      item.id >= previousId
    ) {
      throw new Error('本任务处理记录返回格式无效')
    }
    previousId = item.id
    if (
      request.scope === 'flow' &&
      (!Number.isSafeInteger(item.task_id) ||
        item.task_id <= 0 ||
        item.task?.id !== item.task_id ||
        typeof item.task?.task_name !== 'string' ||
        !item.task.task_name.trim() ||
        typeof item.task?.task_group !== 'string' ||
        typeof item.task?.owner_role_key !== 'string')
    ) {
      throw new Error('流程处理记录返回格式无效')
    }
  }
  if (
    data.items.length > request.limit ||
    (data.truncated && data.items.length === 0)
  ) {
    throw new Error('本任务处理记录返回格式无效')
  }
  return { items: data.items, truncated: data.truncated }
}

export function workflowTaskHandlingChainRequest(
  taskId,
  { view = 'task', offset = 0, ...options } = {}
) {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) {
    throw new Error('任务参数无效')
  }
  if (!['task', 'order'].includes(view)) {
    throw new Error('任务链查看范围无效')
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('任务链分页条件无效')
  }
  return {
    params: { task_id: taskId, view, ...(offset ? { offset } : {}) },
    options,
  }
}

export function requireWorkflowTaskHandlingChainResponse(result) {
  const data = dataOf(result)
  if (
    !Array.isArray(data?.items) ||
    data.items.length > 100 ||
    typeof data.truncated !== 'boolean' ||
    !data.items.every(
      (item) =>
        Number.isSafeInteger(item?.id) &&
        item.id > 0 &&
        typeof item.task_name === 'string' &&
        ['ready', 'blocked', 'done', 'rejected', 'withdrawn'].includes(
          item.task_status_key
        ) &&
        typeof item.owner_role_key === 'string'
    )
  ) {
    throw new Error('任务链返回格式无效')
  }
  return data
}

export function workflowTaskLinkRequest(
  taskID,
  { offset = 0, ...options } = {}
) {
  if (
    !Number.isSafeInteger(taskID) ||
    taskID <= 0 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new Error('任务链接无效')
  }
  return {
    params: { task_id: taskID, ...(offset ? { offset } : {}) },
    options,
    offset,
  }
}

export function requireWorkflowTaskLinkResponse(result, offset) {
  const data = dataOf(result)
  if (
    !Array.isArray(data?.items) ||
    (!offset && data.items.length === 0) ||
    data.items.length > 100 ||
    typeof data.truncated !== 'boolean' ||
    (data.truncated && data.items.length !== 100) ||
    new Set(data.items.map((item) => item?.id)).size !== data.items.length ||
    !data.items.every(
      (item) =>
        Number.isSafeInteger(item?.id) &&
        item.id > 0 &&
        typeof item.task_name === 'string' &&
        typeof item.owner_role_key === 'string' &&
        typeof item.can_handle === 'boolean' &&
        ['ready', 'blocked', 'done', 'rejected', 'withdrawn'].includes(
          item.task_status_key
        ) &&
        (!item.can_handle ||
          ['ready', 'blocked'].includes(item.task_status_key))
    )
  ) {
    throw new Error('任务链暂时无法确认，请重试')
  }
  return data
}

export function requireWorkflowTaskAssignmentOptionsQuery(params = {}) {
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    Object.keys(params).some((key) => key !== 'task_id') ||
    !Number.isSafeInteger(params.task_id) ||
    params.task_id <= 0
  ) {
    throw new TypeError('任务转交参数无效')
  }
  return { task_id: params.task_id }
}

export function requireWorkflowTaskAssignmentOptionsResponse(result, taskID) {
  const assignment = dataOf(result)?.assignment
  const candidates = assignment?.candidates
  const currentAssignee = assignment?.current_assignee
  const candidateIDs = new Set()
  if (
    !assignment ||
    typeof assignment !== 'object' ||
    Array.isArray(assignment) ||
    assignment.task_id !== taskID ||
    !Number.isSafeInteger(assignment.task_version) ||
    assignment.task_version <= 0 ||
    !WORKFLOW_TASK_STATUS_KEYS.has(assignment.task_status_key) ||
    typeof assignment.owner_role_key !== 'string' ||
    !assignment.owner_role_key.trim() ||
    typeof assignment.owner_role_label !== 'string' ||
    typeof assignment.can_reassign !== 'boolean' ||
    typeof assignment.can_return_to_pool !== 'boolean' ||
    typeof assignment.reason_code !== 'string' ||
    typeof assignment.reason !== 'string' ||
    !Array.isArray(candidates) ||
    (currentAssignee !== null &&
      currentAssignee !== undefined &&
      (!currentAssignee ||
        typeof currentAssignee !== 'object' ||
        Array.isArray(currentAssignee) ||
        !Number.isSafeInteger(currentAssignee.admin_id) ||
        currentAssignee.admin_id <= 0 ||
        typeof currentAssignee.username !== 'string' ||
        !currentAssignee.username.trim() ||
        typeof currentAssignee.display_name !== 'string')) ||
    candidates.some((candidate) => {
      const invalid =
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate) ||
        !Number.isSafeInteger(candidate.admin_id) ||
        candidate.admin_id <= 0 ||
        candidateIDs.has(candidate.admin_id) ||
        typeof candidate.username !== 'string' ||
        !candidate.username.trim() ||
        typeof candidate.display_name !== 'string' ||
        !Array.isArray(candidate.role_keys) ||
        candidate.role_keys.some(
          (roleKey) => typeof roleKey !== 'string' || !roleKey.trim()
        ) ||
        typeof candidate.role_label !== 'string'
      candidateIDs.add(candidate?.admin_id)
      return invalid
    })
  ) {
    throw invalidResponse('任务转交信息暂时无法确认，请稍后重试')
  }
  return {
    ...assignment,
    candidates: candidates.map((candidate) => ({
      admin_id: candidate.admin_id,
      username: candidate.username.trim(),
      display_name: candidate.display_name.trim(),
      role_keys: candidate.role_keys.map((roleKey) => roleKey.trim()),
      role_label: candidate.role_label.trim(),
    })),
    current_assignee:
      currentAssignee && typeof currentAssignee === 'object'
        ? {
            admin_id: currentAssignee.admin_id,
            username: currentAssignee.username.trim(),
            display_name: currentAssignee.display_name.trim(),
          }
        : null,
  }
}

export function requireWorkflowExceptionsResponse(result) {
  const data = dataOf(result)
  if (
    !Array.isArray(data?.items) ||
    !Array.isArray(data?.tasks) ||
    !Array.isArray(data?.orders) ||
    ![
      'total',
      'view_total',
      'pending_tasks',
      'affected_orders',
      'open',
      'closed',
      'pending_plan',
      'executing',
    ].every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0) ||
    data.pending_plan + data.executing !== data.open ||
    data.items.some(
      (item) =>
        !item.key ||
        !Array.isArray(item.tasks) ||
        !Array.isArray(item.task_ids) ||
        !Array.isArray(item.orders) ||
        !Array.isArray(item.quality_photo_sources) ||
        item.quality_photo_sources.some((source) => !Number.isSafeInteger(source?.id) || source.id <= 0 || typeof source.number !== 'string' || !source.number.trim())
    )
  ) {
    throw new Error('异常跟踪数据不完整，请重试')
  }
  return data
}
