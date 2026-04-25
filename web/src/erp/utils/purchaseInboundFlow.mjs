export const ACCESSORIES_PURCHASE_MODULE_KEY = 'accessories-purchase'
export const INBOUND_MODULE_KEY = 'inbound'

export const PURCHASE_IQC_TASK_GROUP = 'purchase_iqc'
export const WAREHOUSE_INBOUND_TASK_GROUP = 'warehouse_inbound'
export const PURCHASE_QUALITY_EXCEPTION_TASK_GROUP =
  'purchase_quality_exception'

export const IQC_PENDING_STATUS_KEY = 'iqc_pending'
export const WAREHOUSE_INBOUND_PENDING_STATUS_KEY = 'warehouse_inbound_pending'
export const QC_FAILED_STATUS_KEY = 'qc_failed'
export const INBOUND_DONE_STATUS_KEY = 'inbound_done'

const ARRIVAL_SOURCE_TYPE_KEYS = new Set([
  ACCESSORIES_PURCHASE_MODULE_KEY,
  INBOUND_MODULE_KEY,
])
const ACTIVE_TASK_STATUS_KEYS = new Set(['pending', 'ready', 'processing'])
const DEFAULT_PRIORITY = 2
const HIGH_PRIORITY = 3
const URGENT_PRIORITY = 4
const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * HOUR_SECONDS

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

export function resolveArrivalSourceType(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  return ARRIVAL_SOURCE_TYPE_KEYS.has(sourceType) ? sourceType : ''
}

export function isPurchaseArrivalRecord(record = {}) {
  return Boolean(resolveArrivalSourceType(record))
}

export function resolveInboundSourceNo(record = {}) {
  return (
    normalizeText(record.document_no) ||
    normalizeText(record.source_no) ||
    normalizeText(record.title) ||
    normalizeText(record.id)
  )
}

export function resolveInboundPriority(record = {}, options = {}) {
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
    if (secondsLeft <= 2 * DAY_SECONDS) return HIGH_PRIORITY
  }

  return DEFAULT_PRIORITY
}

export function resolveIqcDueAt(record = {}, options = {}) {
  const nowSec = nowSeconds(options)
  const defaultDueAt = nowSec + 4 * HOUR_SECONDS
  const dueSecond = parseBusinessDateEndSecond(record.due_date)
  if (!dueSecond) return defaultDueAt
  if (dueSecond <= nowSec + DAY_SECONDS) return nowSec + 2 * HOUR_SECONDS
  return defaultDueAt
}

export function isIqcPassResult(value) {
  return [
    'pass',
    'passed',
    'qualified',
    'accepted',
    'ok',
    '合格',
    '让步接收',
  ].includes(normalizeText(value).toLowerCase())
}

export function isIqcFailResult(value) {
  return [
    'fail',
    'failed',
    'rejected',
    'unqualified',
    'ng',
    '不合格',
    '退回',
  ].includes(normalizeText(value).toLowerCase())
}

function buildArrivalRelatedDocuments(record = {}, options = {}) {
  const sourceNo = resolveInboundSourceNo(record)
  const quantityText =
    record.quantity !== undefined && record.quantity !== null
      ? `数量：${record.quantity}${record.unit || ''}`
      : ''
  return [
    sourceNo ? `到货记录：${sourceNo}` : '',
    record.source_no ? `采购记录：${record.source_no}` : '',
    record.supplier_name ? `供应商：${record.supplier_name}` : '',
    record.material_name ? `物料：${record.material_name}` : '',
    record.product_name ? `产品：${record.product_name}` : '',
    quantityText,
    options.qcResult ? `IQC 结果：${options.qcResult}` : '',
    options.reason ? `不良原因：${options.reason}` : '',
  ].filter(Boolean)
}

function baseTaskSource(record = {}) {
  return {
    source_type: resolveArrivalSourceType(record),
    source_id: record.id,
    source_no: resolveInboundSourceNo(record),
  }
}

function commonPayload(record = {}) {
  return {
    record_title: record.title || '',
    supplier_name: record.supplier_name || '',
    material_name: record.material_name || '',
    product_name: record.product_name || '',
    quantity: record.quantity ?? '',
    unit: record.unit || '',
    due_date: record.due_date || '',
  }
}

export function buildIqcTaskFromArrivalRecord(record = {}, options = {}) {
  if (!isPurchaseArrivalRecord(record) || !record.id) return null
  return {
    task_code: taskCode('purchase-iqc', record, options),
    task_group: PURCHASE_IQC_TASK_GROUP,
    task_name: 'IQC 来料检验',
    ...baseTaskSource(record),
    business_status_key: IQC_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'quality',
    priority: resolveInboundPriority(record, options),
    due_at: resolveIqcDueAt(record, options),
    payload: {
      ...commonPayload(record),
      complete_condition: '品质完成来料检验并给出合格/不合格/让步接收结论',
      related_documents: buildArrivalRelatedDocuments(record),
      notification_type: 'task_created',
      alert_type: 'qc_pending',
      critical_path: true,
    },
  }
}

export function buildWarehouseInboundTaskFromIqcPass(
  record = {},
  iqcTask = {},
  options = {}
) {
  if (!isPurchaseArrivalRecord(record) || !record.id) return null
  const priority = clampPriority(iqcTask.priority) ?? DEFAULT_PRIORITY
  const qcResult =
    normalizeText(iqcTask.payload?.qc_result) ||
    normalizeText(iqcTask.payload?.approval_result) ||
    'pass'
  return {
    task_code: taskCode('warehouse-inbound', record, options),
    task_group: WAREHOUSE_INBOUND_TASK_GROUP,
    task_name: '确认入库',
    ...baseTaskSource(record),
    business_status_key: WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    priority,
    due_at: nowSeconds(options) + 4 * HOUR_SECONDS,
    payload: {
      ...commonPayload(record),
      qc_result: qcResult,
      complete_condition:
        '仓库确认入库数量、库位和经手人，业务状态更新为已入库',
      related_documents: buildArrivalRelatedDocuments(record, {
        qcResult,
      }),
      notification_type: 'task_created',
      alert_type: 'inbound_pending',
      critical_path: true,
    },
  }
}

export function buildPurchaseQualityExceptionTask(
  record = {},
  iqcTask = {},
  reason = '',
  options = {}
) {
  if (!isPurchaseArrivalRecord(record) || !record.id) return null
  const normalizedReason = normalizeText(reason)
  return {
    task_code: taskCode('purchase-qc-exception', record, options),
    task_group: PURCHASE_QUALITY_EXCEPTION_TASK_GROUP,
    task_name: '处理来料不良 / 补货 / 退货',
    ...baseTaskSource(record),
    business_status_key: QC_FAILED_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'purchasing',
    priority: HIGH_PRIORITY,
    payload: {
      ...commonPayload(record),
      iqc_task_id: iqcTask.id,
      qc_result: 'fail',
      rejected_reason: normalizedReason,
      complete_condition: '采购确认退货、补货、让步接收或重新到货安排',
      related_documents: buildArrivalRelatedDocuments(record, {
        qcResult: 'fail',
        reason: normalizedReason,
      }),
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      critical_path: true,
    },
  }
}

export function isPurchaseIqcTask(task = {}) {
  return (
    ARRIVAL_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === PURCHASE_IQC_TASK_GROUP
  )
}

export function isWarehouseInboundTask(task = {}) {
  return (
    ARRIVAL_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === WAREHOUSE_INBOUND_TASK_GROUP
  )
}

export function isPurchaseQualityExceptionTask(task = {}) {
  return (
    ARRIVAL_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === PURCHASE_QUALITY_EXCEPTION_TASK_GROUP
  )
}

export function hasActiveIqcTaskForRecord(tasks = [], record = {}) {
  const sourceType = resolveArrivalSourceType(record)
  if (!sourceType || !record.id) return false
  return (Array.isArray(tasks) ? tasks : []).some(
    (task) =>
      isPurchaseIqcTask(task) &&
      normalizeText(task.source_type) === sourceType &&
      String(task.source_id) === String(record.id) &&
      ACTIVE_TASK_STATUS_KEYS.has(normalizeText(task.task_status_key))
  )
}
