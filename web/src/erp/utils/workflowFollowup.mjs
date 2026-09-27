import { requireWorkflowTaskIdempotencyKey } from './workflowTaskMutation.mjs'

export const FOLLOWUP_SOURCE_TYPES = Object.freeze([
  'sales_order', 'purchase_order', 'outsourcing_order', 'production_order', 'shipment',
])

export function followupSource(sourceType, record) {
  if (!FOLLOWUP_SOURCE_TYPES.includes(sourceType) || !Number.isSafeInteger(record?.id) || record.id <= 0) return null
  return { source_type: sourceType, source_id: record.id }
}

export function canCreateFollowupFromRecord(sourceType, record) {
  if (!followupSource(sourceType, record)) return false
  const states = {
    sales_order: ['draft', 'submitted', 'active'],
    purchase_order: ['draft', 'submitted', 'approved'],
    outsourcing_order: ['draft', 'submitted', 'confirmed'],
    production_order: ['DRAFT', 'RELEASED'],
    shipment: ['DRAFT'],
  }
  return states[sourceType].includes(record.lifecycle_status || record.status)
}

export function requireFollowupCreateParams(params) {
  const keys = ['source_type', 'source_id', 'task_name', 'description', 'owner_role_key', 'assignee_id', 'due_at', 'priority', 'idempotency_key']
  if (!params || Object.keys(params).some((key) => !keys.includes(key)) ||
      !followupSource(params.source_type, { id: params.source_id })) throw new TypeError('请重新选择业务单据')
  const normalized = { source_type: params.source_type, source_id: params.source_id }
  for (const [key, limit] of [['task_name', 128], ['description', 2000], ['owner_role_key', 32]]) {
    const value = typeof params[key] === 'string' ? params[key].trim() : ''
    if (!value || [...value].length > limit) throw new TypeError('请完整填写任务事项、要求和责任岗位')
    normalized[key] = value
  }
  if (!Number.isSafeInteger(params.due_at) || params.due_at <= 0 || ![0, 10].includes(params.priority) ||
      (params.assignee_id !== null && (!Number.isSafeInteger(params.assignee_id) || params.assignee_id <= 0))) {
    throw new TypeError('请检查办理人、截止时间和优先级')
  }
  return {
    ...normalized,
    assignee_id: params.assignee_id,
    due_at: params.due_at,
    priority: params.priority,
    idempotency_key: requireWorkflowTaskIdempotencyKey(params.idempotency_key),
  }
}

export function requireFollowupOptions(data, source) {
  if (!data || data.source_type !== source.source_type || data.source_id !== source.source_id ||
      typeof data.source_no !== 'string' || typeof data.can_create !== 'boolean' || !Array.isArray(data.roles) ||
      data.roles.some((role) => !role.role_key || !role.label || !Array.isArray(role.assignees) ||
        role.assignees.some((person) => !Number.isSafeInteger(person.admin_id) || person.admin_id <= 0 || !person.display_name))) {
    const error = new Error('任务发起资料不完整，请刷新后重试')
    error.isInvalidResponse = true
    throw error
  }
  return data
}

export function requireFollowupReceipt(data, params) {
  const task = data?.task
  if (!Number.isSafeInteger(task?.id) || task.id <= 0 || !Number.isSafeInteger(task.version) || task.version <= 0 || task.task_group !== 'business_followup' ||
      task.source_type !== params.source_type || task.source_id !== params.source_id ||
      task.task_name !== params.task_name || task.owner_role_key !== params.owner_role_key ||
      task.assignee_id !== params.assignee_id || task.due_at !== params.due_at || task.priority !== params.priority ||
      task.payload?.description !== params.description || task.process_instance_id != null || task.config_revision != null ||
      task.task_status_key !== 'ready') {
    const error = new Error('发起结果暂未确认，请使用原内容重试')
    error.isInvalidResponse = true
    throw error
  }
  return task
}

export function requireFollowupTaskPage(data, source) {
  if (!Array.isArray(data?.tasks) || !Number.isSafeInteger(data.total) || data.total < 0 ||
      data.tasks.some((task) => !Number.isSafeInteger(task.id) || task.id <= 0 ||
        !Number.isSafeInteger(task.version) || task.version <= 0 || task.source_type !== source.source_type || task.source_id !== source.source_id)) {
    throw new Error('相关任务读取不完整，请重新读取')
  }
  return data
}
