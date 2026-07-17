export const WORKFLOW_SOURCE_TASK_CONTRACT = 'workflow.source-task/v1'

const WORKFLOW_TASK_STATUS_KEYS = new Set([
  'ready',
  'blocked',
  'done',
  'rejected',
])

const SHIPMENT_RELEASE_SOURCE_TASK = Object.freeze({
  taskGroup: 'shipment_release',
  sourceType: 'shipments',
  producer: 'shipment.submit_release',
  taskCodePrefix: 'source-shipment-release-',
  ownerRoleKey: 'warehouse',
})

const SHIPMENT_RELEASE_BUSINESS_STATUSES_BY_TASK_STATUS = Object.freeze({
  ready: Object.freeze(['shipment_pending', 'blocked']),
  blocked: Object.freeze(['blocked']),
  done: Object.freeze(['shipping_released']),
  rejected: Object.freeze(['blocked']),
})

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function validIntentHash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function invalidResponse() {
  return Object.assign(
    new Error('出货放行任务返回结果无法确认，请刷新后重试'),
    { isInvalidResponse: true }
  )
}

export function normalizeShipmentReleaseTaskRequest(params = {}) {
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    Object.keys(params).some((key) => key !== 'id') ||
    !positiveSafeInteger(params.id)
  ) {
    throw new TypeError('请选择有效的待出货草稿')
  }
  return { id: params.id }
}

export function validateShipmentReleaseTaskResult(response, request = {}) {
  const task = response?.workflow_task
  const payload = task?.payload
  const requestID = request?.id
  const taskStatusKey = task?.task_status_key
  const allowedBusinessStatuses =
    SHIPMENT_RELEASE_BUSINESS_STATUSES_BY_TASK_STATUS[taskStatusKey]
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    typeof response.created !== 'boolean' ||
    !task ||
    typeof task !== 'object' ||
    Array.isArray(task) ||
    !positiveSafeInteger(task.id) ||
    !positiveSafeInteger(task.version) ||
    !positiveSafeInteger(requestID) ||
    task.task_code !==
      `${SHIPMENT_RELEASE_SOURCE_TASK.taskCodePrefix}${requestID}` ||
    task.task_group !== SHIPMENT_RELEASE_SOURCE_TASK.taskGroup ||
    task.source_type !== SHIPMENT_RELEASE_SOURCE_TASK.sourceType ||
    task.source_id !== requestID ||
    task.owner_role_key !== SHIPMENT_RELEASE_SOURCE_TASK.ownerRoleKey ||
    !WORKFLOW_TASK_STATUS_KEYS.has(taskStatusKey) ||
    !allowedBusinessStatuses?.includes(task.business_status_key) ||
    (response.created &&
      (taskStatusKey !== 'ready' ||
        task.business_status_key !== 'shipment_pending')) ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.source_task_contract !== WORKFLOW_SOURCE_TASK_CONTRACT ||
    payload.source_task_producer !== SHIPMENT_RELEASE_SOURCE_TASK.producer ||
    payload.shipment_id !== requestID ||
    !validIntentHash(payload.source_task_intent_hash)
  ) {
    throw invalidResponse()
  }
  return Object.freeze({
    workflow_task: task,
    created: response.created,
  })
}
