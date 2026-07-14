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
    throw new TypeError(`${key} 必须是字符串`)
  }
  return params[key].trim() || null
}

export function requireWorkflowTaskCreateParams(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('create_task 参数必须是对象')
  }
  for (const key of Object.keys(params)) {
    if (!WORKFLOW_TASK_CREATE_PUBLIC_PARAM_KEYS.has(key)) {
      throw new TypeError(`create_task 不接收参数 ${key}`)
    }
  }

  const normalized = { ...params }
  for (const key of WORKFLOW_TASK_CREATE_REQUIRED_STRING_KEYS) {
    if (typeof params[key] !== 'string' || !params[key].trim()) {
      throw new TypeError(`${key} 必须是非空字符串`)
    }
    normalized[key] = params[key].trim()
  }
  if (!Number.isSafeInteger(params.source_id) || params.source_id <= 0) {
    throw new TypeError('source_id 必须是安全正整数')
  }

  const taskStatusKey = normalizedOptionalString(params, 'task_status_key')
  normalized.task_status_key = taskStatusKey || 'ready'
  if (normalized.task_status_key !== 'ready') {
    throw new TypeError('普通创建只支持 ready 状态')
  }

  const businessStatusKey = normalizedOptionalString(
    params,
    'business_status_key'
  )
  if (
    businessStatusKey &&
    !WORKFLOW_BUSINESS_STATE_KEYS.has(businessStatusKey)
  ) {
    throw new TypeError('business_status_key 不支持')
  }
  normalized.business_status_key = businessStatusKey

  if (
    Object.hasOwn(params, 'payload') &&
    (params.payload === null ||
      typeof params.payload !== 'object' ||
      Array.isArray(params.payload))
  ) {
    throw new TypeError('payload 必须是对象')
  }
  normalized.payload = params.payload || {}

  const priority = Object.hasOwn(params, 'priority') ? params.priority : 0
  if (!Number.isInteger(priority) || priority < -32768 || priority > 32767) {
    throw new TypeError('priority 超出范围')
  }
  normalized.priority = priority

  if (
    Object.hasOwn(params, 'assignee_id') &&
    params.assignee_id !== null &&
    (!Number.isSafeInteger(params.assignee_id) || params.assignee_id <= 0)
  ) {
    throw new TypeError('assignee_id 必须是安全正整数')
  }

  if (!Object.hasOwn(params, 'due_at') || params.due_at === null) {
    normalized.due_at = null
  } else if (
    !Number.isSafeInteger(params.due_at) ||
    params.due_at <= 0 ||
    params.due_at > 9_224_318_015_999
  ) {
    throw new TypeError('due_at 必须是 PostgreSQL 可表示的 Unix 秒正整数')
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
