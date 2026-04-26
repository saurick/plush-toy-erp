import { BUSINESS_ROLE_KEY } from './roleKeys.mjs'

export const PROJECT_ORDER_MODULE_KEY = 'project-orders'
export const MATERIAL_BOM_MODULE_KEY = 'material-bom'

export const ORDER_APPROVAL_TASK_GROUP = 'order_approval'
export const ENGINEERING_DATA_TASK_GROUP = 'engineering_data'
export const ORDER_REVISION_TASK_GROUP = 'order_revision'

export const ORDER_APPROVAL_STATUS_KEY = 'project_pending'
export const ORDER_APPROVED_STATUS_KEY = 'project_approved'
export const ENGINEERING_PREPARING_STATUS_KEY = 'engineering_preparing'

const DEFAULT_PRIORITY = 2
const HIGH_PRIORITY = 3
const URGENT_PRIORITY = 4
const DAY_SECONDS = 24 * 60 * 60

function payloadOf(record = {}) {
  return record.payload && typeof record.payload === 'object'
    ? record.payload
    : {}
}

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clampPriority(value) {
  const priority = numberOrNull(value)
  if (priority === null) return null
  return Math.max(0, Math.min(5, Math.round(priority)))
}

function nowSeconds(options = {}) {
  return Math.floor(Number(options.nowMs ?? Date.now()) / 1000)
}

function parseBusinessDateEndSecond(value) {
  const text = normalizeText(value)
  if (!text) return null
  const timestamp = Date.parse(`${text}T23:59:59`)
  if (!Number.isFinite(timestamp)) return null
  return Math.floor(timestamp / 1000)
}

function taskCode(prefix, record = {}, options = {}) {
  const stableID =
    normalizeText(record.id) || normalizeText(record.document_no) || 'unknown'
  return `${prefix}-${stableID}-${Number(options.nowMs ?? Date.now())}`
}

export function isProjectOrderRecord(record = {}) {
  const moduleKey = normalizeText(record.module_key || record.source_type)
  return !moduleKey || moduleKey === PROJECT_ORDER_MODULE_KEY
}

export function resolveOrderSourceNo(record = {}) {
  return (
    normalizeText(record.document_no) ||
    normalizeText(record.source_no) ||
    normalizeText(record.title) ||
    normalizeText(record.id)
  )
}

export function resolveOrderTitle(record = {}) {
  return (
    normalizeText(record.title) ||
    normalizeText(record.product_name) ||
    normalizeText(record.style_no) ||
    '客户/款式立项记录'
  )
}

export function resolveOrderApprovalPriority(record = {}, options = {}) {
  const payload = payloadOf(record)
  const explicitPriority = clampPriority(payload.priority ?? record.priority)
  if (explicitPriority !== null) return explicitPriority

  if (
    payload.urgent === true ||
    payload.is_urgent === true ||
    normalizeText(payload.priority_label).includes('急')
  ) {
    return HIGH_PRIORITY
  }

  const dueSecond = parseBusinessDateEndSecond(record.due_date)
  if (dueSecond) {
    const secondsLeft = dueSecond - nowSeconds(options)
    if (secondsLeft <= DAY_SECONDS) return URGENT_PRIORITY
    if (secondsLeft <= 3 * DAY_SECONDS) return HIGH_PRIORITY
  }

  return DEFAULT_PRIORITY
}

export function resolveEngineeringDueAt(record = {}, options = {}) {
  const nowSec = nowSeconds(options)
  const defaultDueAt = nowSec + DAY_SECONDS
  const orderDueAt = parseBusinessDateEndSecond(record.due_date)
  if (!orderDueAt) return defaultDueAt

  if (orderDueAt <= nowSec + 12 * 60 * 60) {
    return nowSec + 4 * 60 * 60
  }

  if (orderDueAt <= nowSec + 2 * DAY_SECONDS) {
    return Math.max(nowSec + 4 * 60 * 60, orderDueAt - 12 * 60 * 60)
  }

  return defaultDueAt
}

function buildOrderRelatedDocuments(record = {}, options = {}) {
  const sourceNo = resolveOrderSourceNo(record)
  const documents = [
    sourceNo ? `客户/款式立项记录：${sourceNo}` : '',
    record.customer_name ? `客户：${record.customer_name}` : '',
    record.style_no ? `款式：${record.style_no}` : '',
    record.product_name ? `产品：${record.product_name}` : '',
    record.due_date ? `交期：${record.due_date}` : '',
    options.includeMaterialBom ? '材料 BOM：待工程资料补齐' : '',
    options.includeArtwork ? '款图/资料：随订单资料检查' : '',
  ]
  return documents.filter(Boolean)
}

function baseTaskSource(record = {}) {
  return {
    source_type: PROJECT_ORDER_MODULE_KEY,
    source_id: record.id,
    source_no: resolveOrderSourceNo(record),
  }
}

export function buildBossApprovalTaskFromProjectOrder(
  record = {},
  options = {}
) {
  if (!isProjectOrderRecord(record) || !record.id) return null
  const priority = resolveOrderApprovalPriority(record, options)
  return {
    task_code: taskCode('order-approval', record, options),
    task_group: ORDER_APPROVAL_TASK_GROUP,
    task_name: '老板审批订单',
    ...baseTaskSource(record),
    business_status_key: ORDER_APPROVAL_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'boss',
    priority,
    due_at: nowSeconds(options) + DAY_SECONDS,
    payload: {
      record_title: resolveOrderTitle(record),
      customer_name: record.customer_name || '',
      style_no: record.style_no || '',
      product_no: record.product_no || '',
      product_name: record.product_name || '',
      due_date: record.due_date || '',
      complete_condition: '老板审批通过或驳回，必须写入审批结果',
      related_documents: buildOrderRelatedDocuments(record, {
        includeArtwork: true,
      }),
      notification_type: 'approval_required',
      alert_type: 'approval_pending',
      critical_path: true,
      next_business_status_key: ORDER_APPROVED_STATUS_KEY,
    },
  }
}

export function buildEngineeringTaskFromApprovedOrder(
  record = {},
  options = {}
) {
  if (!isProjectOrderRecord(record) || !record.id) return null
  return {
    task_code: taskCode('engineering-data', record, options),
    task_group: ENGINEERING_DATA_TASK_GROUP,
    task_name: '准备 BOM / 色卡 / 作业指导书',
    ...baseTaskSource(record),
    business_status_key: ENGINEERING_PREPARING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'engineering',
    priority: DEFAULT_PRIORITY,
    due_at: resolveEngineeringDueAt(record, options),
    payload: {
      record_title: resolveOrderTitle(record),
      customer_name: record.customer_name || '',
      style_no: record.style_no || '',
      product_no: record.product_no || '',
      product_name: record.product_name || '',
      due_date: record.due_date || '',
      complete_condition: 'BOM、色卡、作业指导书或包装要求已补齐并确认',
      related_documents: buildOrderRelatedDocuments(record, {
        includeMaterialBom: true,
      }),
      next_module_key: MATERIAL_BOM_MODULE_KEY,
      entry_path: '/erp/purchase/material-bom',
      critical_path: true,
    },
  }
}

export function buildRevisionTaskFromRejectedOrder(
  record = {},
  reason = '',
  options = {}
) {
  if (!isProjectOrderRecord(record) || !record.id) return null
  const rejectedReason = normalizeText(reason)
  const decision = normalizeText(options.decision) || 'rejected'
  const reasonPayload =
    decision === 'blocked' ? { blocked_reason: rejectedReason } : {}
  return {
    task_code: taskCode('order-revision', record, options),
    task_group: ORDER_REVISION_TASK_GROUP,
    task_name: '补充订单资料后重新提交',
    ...baseTaskSource(record),
    business_status_key: ORDER_APPROVAL_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: BUSINESS_ROLE_KEY,
    priority: DEFAULT_PRIORITY,
    payload: {
      record_title: resolveOrderTitle(record),
      customer_name: record.customer_name || '',
      style_no: record.style_no || '',
      due_date: record.due_date || '',
      complete_condition:
        '补齐客户资料、款式资料、交期或审批驳回原因后重新提交',
      related_documents: buildOrderRelatedDocuments(record, {
        includeArtwork: true,
      }),
      decision,
      transition_status: decision,
      rejected_reason: rejectedReason,
      ...reasonPayload,
      notification_type: 'task_rejected',
      alert_type: 'approval_pending',
      critical_path: true,
    },
  }
}

export function isOpenWorkflowTask(task = {}) {
  return !['done', 'closed', 'cancelled'].includes(
    normalizeText(task.task_status_key)
  )
}

export function isOrderApprovalTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROJECT_ORDER_MODULE_KEY &&
    normalizeText(task.task_group) === ORDER_APPROVAL_TASK_GROUP
  )
}

export function isEngineeringDataTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROJECT_ORDER_MODULE_KEY &&
    normalizeText(task.task_group) === ENGINEERING_DATA_TASK_GROUP
  )
}

export function isOrderRevisionTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROJECT_ORDER_MODULE_KEY &&
    normalizeText(task.task_group) === ORDER_REVISION_TASK_GROUP
  )
}
