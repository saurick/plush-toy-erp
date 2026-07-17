const WORKFLOW_TASK_CREATE_PUBLIC_PARAM_KEYS = new Set([
  'task_code',
  'task_group',
  'task_name',
  'source_type',
  'source_id',
  'source_no',
  'business_status_key',
  'task_status_key',
  'owner_role_key',
  'owner_pool_key',
  'required_capability_key',
  'assignee_id',
  'priority',
  'due_at',
  'payload',
])

const WORKFLOW_TASK_CREATE_REQUIRED_STRING_KEYS = Object.freeze([
  'task_code',
  'task_group',
  'task_name',
  'source_type',
  'owner_role_key',
])

const WORKFLOW_SOURCE_TASK_GROUPS = new Set([
  'production_scheduling',
  'production_exception',
  'shipment_release',
])

const WORKFLOW_SOURCE_TASK_CODE_PREFIXES = Object.freeze([
  'source-production-scheduling-',
  'source-production-exception-',
  'source-shipment-release-',
])

const WORKFLOW_BUSINESS_STATE_KEYS = new Set([
  'project_pending',
  'project_approved',
  'engineering_preparing',
  'material_preparing',
  'production_ready',
  'production_processing',
  'qc_pending',
  'iqc_pending',
  'qc_failed',
  'warehouse_processing',
  'warehouse_inbound_pending',
  'inbound_done',
  'shipment_pending',
  'shipping_released',
  'shipped',
  'reconciling',
  'settled',
  'blocked',
  'cancelled',
  'closed',
])

function normalizedOptionalString(params, key) {
  if (!Object.hasOwn(params, key) || params[key] === null) return null
  if (typeof params[key] !== 'string') {
    throw new TypeError('任务资料格式不正确，请刷新后重试')
  }
  return params[key].trim() || null
}

export function isReservedWorkflowSourceTaskNamespace(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return false
  }
  const taskGroup = String(params.task_group ?? params.taskGroup ?? '').trim()
  const taskCode = String(params.task_code ?? params.taskCode ?? '').trim()
  return (
    WORKFLOW_SOURCE_TASK_GROUPS.has(taskGroup) ||
    WORKFLOW_SOURCE_TASK_CODE_PREFIXES.some((prefix) =>
      taskCode.startsWith(prefix)
    )
  )
}

export function requireWorkflowTaskCreateParams(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('任务资料格式不正确，请刷新后重试')
  }
  for (const key of Object.keys(params)) {
    if (!WORKFLOW_TASK_CREATE_PUBLIC_PARAM_KEYS.has(key)) {
      throw new TypeError('任务资料包含无法识别的内容，请刷新后重试')
    }
  }

  const normalized = { ...params }
  for (const key of WORKFLOW_TASK_CREATE_REQUIRED_STRING_KEYS) {
    if (typeof params[key] !== 'string' || !params[key].trim()) {
      throw new TypeError('任务必填资料不完整，请补充后重试')
    }
    normalized[key] = params[key].trim()
  }
  if (isReservedWorkflowSourceTaskNamespace(normalized)) {
    throw new TypeError('该类任务由业务单据自动生成，不能手工创建')
  }
  if (!Number.isSafeInteger(params.source_id) || params.source_id <= 0) {
    throw new TypeError('关联业务单据无效，请重新选择')
  }

  const taskStatusKey = normalizedOptionalString(params, 'task_status_key')
  normalized.task_status_key = taskStatusKey || 'ready'
  if (normalized.task_status_key !== 'ready') {
    throw new TypeError('新建任务只能从待处理状态开始')
  }

  const businessStatusKey = normalizedOptionalString(
    params,
    'business_status_key'
  )
  if (
    businessStatusKey &&
    !WORKFLOW_BUSINESS_STATE_KEYS.has(businessStatusKey)
  ) {
    throw new TypeError('当前业务状态暂不支持，请重新选择')
  }
  normalized.business_status_key = businessStatusKey

  if (
    Object.hasOwn(params, 'payload') &&
    (params.payload === null ||
      typeof params.payload !== 'object' ||
      Array.isArray(params.payload))
  ) {
    throw new TypeError('任务补充资料格式不正确，请刷新后重试')
  }
  normalized.payload = params.payload || {}

  const priority = Object.hasOwn(params, 'priority') ? params.priority : 0
  if (!Number.isInteger(priority) || priority < -32768 || priority > 32767) {
    throw new TypeError('任务优先级设置无效，请重新选择')
  }
  normalized.priority = priority

  if (
    Object.hasOwn(params, 'assignee_id') &&
    params.assignee_id !== null &&
    (!Number.isSafeInteger(params.assignee_id) || params.assignee_id <= 0)
  ) {
    throw new TypeError('指定处理人无效，请重新选择')
  }

  if (!Object.hasOwn(params, 'due_at') || params.due_at === null) {
    normalized.due_at = null
  } else if (
    !Number.isSafeInteger(params.due_at) ||
    params.due_at <= 0 ||
    params.due_at > 9_224_318_015_999
  ) {
    throw new TypeError('截止时间设置无效，请重新选择')
  } else {
    normalized.due_at = params.due_at
  }

  for (const key of [
    'source_no',
    'owner_pool_key',
    'required_capability_key',
  ]) {
    normalized[key] = normalizedOptionalString(params, key)
  }
  return normalized
}
