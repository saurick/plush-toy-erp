export const PROCESSING_CONTRACTS_MODULE_KEY = 'processing-contracts'
export const INBOUND_MODULE_KEY = 'inbound'

export const OUTSOURCE_RETURN_TRACKING_TASK_GROUP = 'outsource_return_tracking'
export const OUTSOURCE_RETURN_QC_TASK_GROUP = 'outsource_return_qc'
export const OUTSOURCE_WAREHOUSE_INBOUND_TASK_GROUP =
  'outsource_warehouse_inbound'
export const OUTSOURCE_REWORK_TASK_GROUP = 'outsource_rework'

export const PRODUCTION_PROCESSING_STATUS_KEY = 'production_processing'
export const QC_PENDING_STATUS_KEY = 'qc_pending'
export const WAREHOUSE_INBOUND_PENDING_STATUS_KEY = 'warehouse_inbound_pending'
export const QC_FAILED_STATUS_KEY = 'qc_failed'
export const INBOUND_DONE_STATUS_KEY = 'inbound_done'

const OUTSOURCE_RETURN_SOURCE_TYPE_KEYS = new Set([
  PROCESSING_CONTRACTS_MODULE_KEY,
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

function resolveOutsourceReturnSourceType(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  return OUTSOURCE_RETURN_SOURCE_TYPE_KEYS.has(sourceType) ? sourceType : ''
}

export function isOutsourceProcessingRecord(record = {}) {
  return (
    normalizeText(record.module_key || record.source_type) ===
    PROCESSING_CONTRACTS_MODULE_KEY
  )
}

export function resolveOutsourceReturnSourceNo(record = {}) {
  return (
    normalizeText(record.document_no) ||
    normalizeText(record.source_no) ||
    normalizeText(record.title) ||
    normalizeText(record.id)
  )
}

function resolveExpectedReturnDate(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(payload.expected_return_date) ||
    normalizeText(payload.return_date) ||
    normalizeText(record.expected_return_date) ||
    normalizeText(record.return_date) ||
    normalizeText(record.due_date)
  )
}

export function resolveOutsourceReturnDueAt(record = {}, options = {}) {
  const dueSecond = parseBusinessDateEndSecond(
    resolveExpectedReturnDate(record)
  )
  if (dueSecond) return dueSecond
  return nowSeconds(options) + DAY_SECONDS
}

export function resolveOutsourcePriority(record = {}, options = {}) {
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

  const dueSecond = parseBusinessDateEndSecond(
    resolveExpectedReturnDate(record)
  )
  if (dueSecond) {
    const secondsLeft = dueSecond - nowSeconds(options)
    if (secondsLeft <= DAY_SECONDS) return URGENT_PRIORITY
    if (secondsLeft <= 2 * DAY_SECONDS) return HIGH_PRIORITY
  }

  return DEFAULT_PRIORITY
}

function buildOutsourceRelatedDocuments(record = {}, options = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  const sourceNo = resolveOutsourceReturnSourceNo(record)
  const quantityText =
    record.quantity !== undefined && record.quantity !== null
      ? `数量：${record.quantity}${record.unit || ''}`
      : ''
  return [
    sourceNo && sourceType === PROCESSING_CONTRACTS_MODULE_KEY
      ? `加工合同：${sourceNo}`
      : '',
    sourceNo && sourceType === INBOUND_MODULE_KEY
      ? `回货记录：${sourceNo}`
      : '',
    record.source_no ? `委外单：${record.source_no}` : '',
    payloadOf(record).issue_no ? `发料记录：${payloadOf(record).issue_no}` : '',
    record.supplier_name ? `加工厂：${record.supplier_name}` : '',
    record.product_name ? `产品：${record.product_name}` : '',
    record.material_name ? `物料 / 成品：${record.material_name}` : '',
    quantityText,
    options.qcResult ? `回货检验结果：${options.qcResult}` : '',
    options.reason ? `不良原因：${options.reason}` : '',
  ].filter(Boolean)
}

function baseTaskSource(record = {}) {
  return {
    source_type: resolveOutsourceReturnSourceType(record),
    source_id: record.id,
    source_no: resolveOutsourceReturnSourceNo(record),
  }
}

function commonPayload(record = {}) {
  return {
    record_title: record.title || '',
    supplier_name: record.supplier_name || '',
    material_name: record.material_name || '',
    product_no: record.product_no || '',
    product_name: record.product_name || '',
    quantity: record.quantity ?? '',
    unit: record.unit || '',
    due_date: record.due_date || '',
    expected_return_date: resolveExpectedReturnDate(record),
    outsource_processing: true,
  }
}

export function buildOutsourceReturnTrackingTask(record = {}, options = {}) {
  if (!isOutsourceProcessingRecord(record) || !record.id) return null
  return {
    task_code: taskCode('outsource-return-tracking', record, options),
    task_group: OUTSOURCE_RETURN_TRACKING_TASK_GROUP,
    task_name: '跟踪委外回货',
    ...baseTaskSource(record),
    business_status_key: PRODUCTION_PROCESSING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'production',
    priority: resolveOutsourcePriority(record, options),
    due_at: resolveOutsourceReturnDueAt(record, options),
    payload: {
      ...commonPayload(record),
      complete_condition: '加工商完成回货登记，确认回货数量和回货日期',
      related_documents: buildOutsourceRelatedDocuments(record),
      notification_type: 'task_created',
      alert_type: 'outsource_return_pending',
      critical_path: true,
      outsource_owner_role_key: 'outsource',
      outsource_processing: true,
    },
  }
}

export function buildOutsourceReturnQcTask(
  record = {},
  returnTask = {},
  options = {}
) {
  if (!resolveOutsourceReturnSourceType(record) || !record.id) return null
  const returnPriority = clampPriority(returnTask?.priority)
  const dueSecond = resolveOutsourceReturnDueAt(record, options)
  const isOverdue = dueSecond < nowSeconds(options)
  const priority = Math.max(
    returnPriority ?? resolveOutsourcePriority(record, options),
    isOverdue ? HIGH_PRIORITY : DEFAULT_PRIORITY
  )
  return {
    task_code: taskCode('outsource-return-qc', record, options),
    task_group: OUTSOURCE_RETURN_QC_TASK_GROUP,
    task_name: '委外回货检验',
    ...baseTaskSource(record),
    business_status_key: QC_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'quality',
    priority,
    due_at: nowSeconds(options) + 4 * HOUR_SECONDS,
    payload: {
      ...commonPayload(record),
      return_task_id: returnTask?.id,
      qc_type: 'outsource_return',
      complete_condition:
        '品质完成委外回货检验，并给出合格、不合格、返工或让步接收结论',
      related_documents: buildOutsourceRelatedDocuments(record),
      notification_type: 'task_created',
      alert_type: 'outsource_return_qc_pending',
      critical_path: true,
    },
  }
}

export function buildOutsourceWarehouseInboundTask(
  record = {},
  qcTask = {},
  options = {}
) {
  if (!resolveOutsourceReturnSourceType(record) || !record.id) return null
  const priority = clampPriority(qcTask.priority) ?? DEFAULT_PRIORITY
  const qcResult =
    normalizeText(qcTask.payload?.qc_result) ||
    normalizeText(qcTask.payload?.approval_result) ||
    'pass'
  return {
    task_code: taskCode('outsource-warehouse-inbound', record, options),
    task_group: OUTSOURCE_WAREHOUSE_INBOUND_TASK_GROUP,
    task_name: '委外回货入库',
    ...baseTaskSource(record),
    business_status_key: WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    priority,
    due_at: nowSeconds(options) + 4 * HOUR_SECONDS,
    payload: {
      ...commonPayload(record),
      qc_task_id: qcTask.id,
      qc_result: qcResult,
      complete_condition: '仓库确认委外回货入库数量、库位和经手人',
      related_documents: buildOutsourceRelatedDocuments(record, {
        qcResult,
      }),
      notification_type: 'task_created',
      alert_type: 'inbound_pending',
      critical_path: true,
      inventory_balance_deferred: true,
    },
  }
}

export function buildOutsourceReworkTask(
  record = {},
  qcTask = {},
  reason = '',
  options = {}
) {
  if (!resolveOutsourceReturnSourceType(record) || !record.id) return null
  const normalizedReason = normalizeText(reason)
  return {
    task_code: taskCode('outsource-rework', record, options),
    task_group: OUTSOURCE_REWORK_TASK_GROUP,
    task_name: '委外返工 / 补做处理',
    ...baseTaskSource(record),
    business_status_key: QC_FAILED_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'production',
    priority: HIGH_PRIORITY,
    payload: {
      ...commonPayload(record),
      qc_task_id: qcTask.id,
      qc_result: 'fail',
      rejected_reason: normalizedReason,
      complete_condition:
        '生产/委外负责人确认返工、补做、让步接收或重新回货安排',
      related_documents: buildOutsourceRelatedDocuments(record, {
        qcResult: 'fail',
        reason: normalizedReason,
      }),
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      critical_path: true,
      outsource_owner_role_key: 'outsource',
    },
  }
}

export function isOutsourceReturnTrackingTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROCESSING_CONTRACTS_MODULE_KEY &&
    normalizeText(task.task_group) === OUTSOURCE_RETURN_TRACKING_TASK_GROUP
  )
}

export function isOutsourceReturnQcTask(task = {}) {
  return (
    OUTSOURCE_RETURN_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === OUTSOURCE_RETURN_QC_TASK_GROUP
  )
}

export function isOutsourceWarehouseInboundTask(task = {}) {
  return (
    OUTSOURCE_RETURN_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === OUTSOURCE_WAREHOUSE_INBOUND_TASK_GROUP
  )
}

export function isOutsourceReworkTask(task = {}) {
  return (
    OUTSOURCE_RETURN_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === OUTSOURCE_REWORK_TASK_GROUP
  )
}

export function isOutsourceQcPassResult(value) {
  return [
    'pass',
    'passed',
    'qualified',
    'accepted',
    'concession',
    'ok',
    '合格',
    '让步接收',
  ].includes(normalizeText(value).toLowerCase())
}

export function isOutsourceQcFailResult(value) {
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

function hasActiveTaskForRecord(tasks, record, matcher) {
  const normalizedRecord = record || {}
  const sourceType = resolveOutsourceReturnSourceType(normalizedRecord)
  if (!sourceType || !normalizedRecord.id) return false
  return (Array.isArray(tasks) ? tasks : []).some(
    (task) =>
      matcher(task) &&
      normalizeText(task.source_type) === sourceType &&
      String(task.source_id) === String(normalizedRecord.id) &&
      ACTIVE_TASK_STATUS_KEYS.has(normalizeText(task.task_status_key))
  )
}

export function hasActiveOutsourceReturnTrackingTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isOutsourceReturnTrackingTask)
}

export function hasActiveOutsourceReturnQcTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isOutsourceReturnQcTask)
}

export function hasActiveOutsourceWarehouseInboundTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isOutsourceWarehouseInboundTask)
}
