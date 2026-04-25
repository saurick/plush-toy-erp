export const ACCESSORIES_PURCHASE_MODULE_KEY = 'accessories-purchase'
export const PROCESSING_CONTRACTS_MODULE_KEY = 'processing-contracts'
export const INBOUND_MODULE_KEY = 'inbound'
export const PAYABLES_MODULE_KEY = 'payables'
export const RECONCILIATION_MODULE_KEY = 'reconciliation'

export const PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP =
  'purchase_payable_registration'
export const OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP =
  'outsource_payable_registration'
export const PURCHASE_RECONCILIATION_TASK_GROUP = 'purchase_reconciliation'
export const OUTSOURCE_RECONCILIATION_TASK_GROUP = 'outsource_reconciliation'

export const INBOUND_DONE_STATUS_KEY = 'inbound_done'
export const RECONCILING_STATUS_KEY = 'reconciling'
export const SETTLED_STATUS_KEY = 'settled'
export const BLOCKED_STATUS_KEY = 'blocked'

const PAYABLE_SOURCE_TYPE_KEYS = new Set([
  ACCESSORIES_PURCHASE_MODULE_KEY,
  PROCESSING_CONTRACTS_MODULE_KEY,
  INBOUND_MODULE_KEY,
  PAYABLES_MODULE_KEY,
  RECONCILIATION_MODULE_KEY,
])
const ACTIVE_TASK_STATUS_KEYS = new Set(['pending', 'ready', 'processing'])
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

export function resolvePayableSourceType(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  return PAYABLE_SOURCE_TYPE_KEYS.has(sourceType) ? sourceType : ''
}

export function resolvePayableSourceNo(record = {}) {
  return (
    normalizeText(record.document_no) ||
    normalizeText(record.source_no) ||
    normalizeText(record.title) ||
    normalizeText(record.id)
  )
}

function containsOutsourceKeyword(record = {}) {
  const text = [
    record.title,
    record.source_no,
    record.document_no,
    record.supplier_name,
    payloadOf(record).source_module_key,
    payloadOf(record).source_type,
  ]
    .map(normalizeText)
    .join(' ')
  return /委外|加工|外发|processing-contracts/u.test(text)
}

function resolvePayableType(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  const payload = payloadOf(record)
  const explicitType = normalizeText(
    payload.payable_type || record.payable_type
  )
  if (['purchase', 'outsource'].includes(explicitType)) return explicitType
  if (sourceType === ACCESSORIES_PURCHASE_MODULE_KEY) return 'purchase'
  if (sourceType === PROCESSING_CONTRACTS_MODULE_KEY) return 'outsource'
  if (
    payload.outsource_processing === true ||
    containsOutsourceKeyword(record)
  ) {
    return 'outsource'
  }
  return 'purchase'
}

function isInboundDoneRecord(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(record.business_status_key) === INBOUND_DONE_STATUS_KEY ||
    normalizeText(payload.business_status_key) === INBOUND_DONE_STATUS_KEY ||
    normalizeText(payload.inbound_result) === 'done' ||
    payload.inbound_done === true
  )
}

export function isPurchaseInboundDoneRecord(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  if (
    ![ACCESSORIES_PURCHASE_MODULE_KEY, INBOUND_MODULE_KEY].includes(sourceType)
  ) {
    return false
  }
  return (
    isInboundDoneRecord(record) && resolvePayableType(record) === 'purchase'
  )
}

export function isOutsourceInboundDoneRecord(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  if (
    ![PROCESSING_CONTRACTS_MODULE_KEY, INBOUND_MODULE_KEY].includes(sourceType)
  ) {
    return false
  }
  return (
    isInboundDoneRecord(record) && resolvePayableType(record) === 'outsource'
  )
}

function resolvePaymentDueDate(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(payload.payment_due_date) ||
    normalizeText(payload.payable_due_date) ||
    normalizeText(record.payment_due_date) ||
    normalizeText(record.payable_due_date) ||
    normalizeText(record.due_date)
  )
}

function resolveInboundDate(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(payload.inbound_date) ||
    normalizeText(payload.return_date) ||
    normalizeText(payload.arrival_date) ||
    normalizeText(record.inbound_date) ||
    normalizeText(record.return_date) ||
    normalizeText(record.arrival_date) ||
    normalizeText(record.document_date)
  )
}

export function resolvePayableDueAt(record = {}, options = {}) {
  const paymentDueSecond = parseBusinessDateEndSecond(
    resolvePaymentDueDate(record)
  )
  if (paymentDueSecond) return paymentDueSecond
  return nowSeconds(options) + DAY_SECONDS
}

export function resolveReconciliationDueAt(_record = {}, options = {}) {
  return nowSeconds(options) + 2 * DAY_SECONDS
}

export function resolvePayablePriority(record = {}, options = {}) {
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

  const dueSecond =
    parseBusinessDateEndSecond(resolvePaymentDueDate(record)) ||
    parseBusinessDateEndSecond(resolveInboundDate(record))
  if (dueSecond) {
    const secondsLeft = dueSecond - nowSeconds(options)
    if (secondsLeft < 0) return URGENT_PRIORITY
    if (secondsLeft <= DAY_SECONDS) return HIGH_PRIORITY
  }

  return DEFAULT_PRIORITY
}

function buildPayableRelatedDocuments(record = {}, options = {}) {
  const payableType = options.payableType || resolvePayableType(record)
  const sourceNo = resolvePayableSourceNo(record)
  const payload = payloadOf(record)
  const quantityText =
    record.quantity !== undefined && record.quantity !== null
      ? `数量：${record.quantity}${record.unit || ''}`
      : ''
  const amount =
    record.amount ??
    payload.amount ??
    payload.payable_amount ??
    payload.amount_with_tax
  return [
    sourceNo && payableType === 'purchase' ? `采购单：${sourceNo}` : '',
    sourceNo && payableType === 'outsource' ? `加工合同：${sourceNo}` : '',
    sourceNo &&
    normalizeText(record.module_key || record.source_type) ===
      INBOUND_MODULE_KEY
      ? `入库记录：${sourceNo}`
      : '',
    record.source_no ? `来源单号：${record.source_no}` : '',
    payload.iqc_result ? `IQC 结果：${payload.iqc_result}` : '',
    payload.qc_result ? `检验结果：${payload.qc_result}` : '',
    record.supplier_name || payload.supplier_name
      ? `供应商 / 加工厂：${record.supplier_name || payload.supplier_name}`
      : '',
    record.material_name || payload.material_name
      ? `物料：${record.material_name || payload.material_name}`
      : '',
    record.product_name || payload.product_name
      ? `产品：${record.product_name || payload.product_name}`
      : '',
    quantityText,
    amount !== undefined && amount !== null && amount !== ''
      ? `金额：${amount}`
      : '',
    options.reason ? `异常原因：${options.reason}` : '',
  ].filter(Boolean)
}

function baseTaskSource(record = {}) {
  return {
    source_type: resolvePayableSourceType(record),
    source_id: record.id,
    source_no: resolvePayableSourceNo(record),
  }
}

function commonPayload(record = {}, payableType = resolvePayableType(record)) {
  const payload = payloadOf(record)
  return {
    record_title: record.title || '',
    supplier_name: record.supplier_name || payload.supplier_name || '',
    customer_name: record.customer_name || payload.customer_name || '',
    material_name: record.material_name || payload.material_name || '',
    product_name: record.product_name || payload.product_name || '',
    quantity: record.quantity ?? payload.quantity ?? '',
    unit: record.unit || payload.unit || '',
    amount: record.amount ?? payload.amount ?? payload.payable_amount ?? '',
    tax_rate: payload.tax_rate ?? record.tax_rate ?? '',
    tax_amount: payload.tax_amount ?? record.tax_amount ?? '',
    amount_with_tax: payload.amount_with_tax ?? record.amount_with_tax ?? '',
    amount_without_tax:
      payload.amount_without_tax ?? record.amount_without_tax ?? '',
    payment_due_date: resolvePaymentDueDate(record),
    inbound_date: resolveInboundDate(record),
    payable_type: payableType,
  }
}

export function buildPurchasePayableRegistrationTask(
  record = {},
  inboundTask = {},
  options = {}
) {
  if (!isPurchaseInboundDoneRecord(record) || !record.id) return null
  const priority = Math.max(
    clampPriority(inboundTask?.priority) ?? DEFAULT_PRIORITY,
    resolvePayablePriority(record, options)
  )
  return {
    task_code: taskCode('purchase-payable-registration', record, options),
    task_group: PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP,
    task_name: '采购应付登记',
    ...baseTaskSource(record),
    business_status_key: INBOUND_DONE_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'finance',
    priority,
    due_at: resolvePayableDueAt(record, options),
    payload: {
      ...commonPayload(record, 'purchase'),
      inbound_task_id: inboundTask?.id,
      complete_condition:
        '财务确认供应商、采购数量、采购金额、税率、含税/不含税金额和应付状态',
      related_documents: buildPayableRelatedDocuments(record, {
        payableType: 'purchase',
      }),
      notification_type: 'finance_pending',
      alert_type: 'payable_pending',
      critical_path: false,
      next_module_key: PAYABLES_MODULE_KEY,
      payable_type: 'purchase',
    },
  }
}

export function buildOutsourcePayableRegistrationTask(
  record = {},
  inboundTask = {},
  options = {}
) {
  if (!isOutsourceInboundDoneRecord(record) || !record.id) return null
  const priority = Math.max(
    clampPriority(inboundTask?.priority) ?? DEFAULT_PRIORITY,
    resolvePayablePriority(record, options)
  )
  return {
    task_code: taskCode('outsource-payable-registration', record, options),
    task_group: OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP,
    task_name: '委外应付登记',
    ...baseTaskSource(record),
    business_status_key: INBOUND_DONE_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'finance',
    priority,
    due_at: resolvePayableDueAt(record, options),
    payload: {
      ...commonPayload(record, 'outsource'),
      inbound_task_id: inboundTask?.id,
      complete_condition:
        '财务确认加工厂、回货数量、加工费、税率、含税/不含税金额和应付状态',
      related_documents: buildPayableRelatedDocuments(record, {
        payableType: 'outsource',
      }),
      notification_type: 'finance_pending',
      alert_type: 'payable_pending',
      critical_path: false,
      next_module_key: PAYABLES_MODULE_KEY,
      payable_type: 'outsource',
    },
  }
}

function buildReconciliationTask(
  record = {},
  payableTask = {},
  payableType = 'purchase',
  options = {}
) {
  if (!resolvePayableSourceType(record) || !record.id) return null
  const priority = clampPriority(payableTask?.priority) ?? DEFAULT_PRIORITY
  const isOutsource = payableType === 'outsource'
  return {
    task_code: taskCode(
      isOutsource ? 'outsource-reconciliation' : 'purchase-reconciliation',
      record,
      options
    ),
    task_group: isOutsource
      ? OUTSOURCE_RECONCILIATION_TASK_GROUP
      : PURCHASE_RECONCILIATION_TASK_GROUP,
    task_name: isOutsource ? '委外对账' : '采购对账',
    ...baseTaskSource(record),
    business_status_key: RECONCILING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'finance',
    priority,
    due_at: resolveReconciliationDueAt(record, options),
    payload: {
      ...commonPayload(record, payableType),
      payable_task_id: payableTask?.id,
      complete_condition: isOutsource
        ? '财务完成加工合同、回货记录、检验结果、加工费、扣款或差异核对'
        : '财务完成采购单、入库记录、发票/对账资料、金额差异核对',
      related_documents: buildPayableRelatedDocuments(record, { payableType }),
      notification_type: 'finance_pending',
      alert_type: 'reconciliation_pending',
      critical_path: false,
      next_module_key: RECONCILIATION_MODULE_KEY,
      payable_type: payableType,
    },
  }
}

export function buildPurchaseReconciliationTask(
  record = {},
  payableTask = {},
  options = {}
) {
  return buildReconciliationTask(record, payableTask, 'purchase', options)
}

export function buildOutsourceReconciliationTask(
  record = {},
  payableTask = {},
  options = {}
) {
  return buildReconciliationTask(record, payableTask, 'outsource', options)
}

export function buildPayableBlockedState(record = {}, task = {}, reason = '') {
  const sourceType = resolvePayableSourceType(record)
  if (!sourceType || !record.id) return null
  const normalizedReason = normalizeText(reason)
  return {
    source_type: sourceType,
    source_id: record.id,
    source_no: resolvePayableSourceNo(record) || task.source_no || '',
    business_status_key: BLOCKED_STATUS_KEY,
    owner_role_key: 'finance',
    blocked_reason: normalizedReason,
    payload: {
      ...commonPayload(
        record,
        task?.payload?.payable_type || resolvePayableType(record)
      ),
      finance_task_id: task?.id,
      notification_type: 'finance_pending',
      alert_type: 'finance_pending',
      blocked_reason: normalizedReason,
      critical_path: true,
    },
  }
}

export function isPurchasePayableRegistrationTask(task = {}) {
  return (
    PAYABLE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP
  )
}

export function isOutsourcePayableRegistrationTask(task = {}) {
  return (
    PAYABLE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === OUTSOURCE_PAYABLE_REGISTRATION_TASK_GROUP
  )
}

export function isPurchaseReconciliationTask(task = {}) {
  return (
    PAYABLE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === PURCHASE_RECONCILIATION_TASK_GROUP
  )
}

export function isOutsourceReconciliationTask(task = {}) {
  return (
    PAYABLE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === OUTSOURCE_RECONCILIATION_TASK_GROUP
  )
}

export function isPayableRegistrationTask(task = {}) {
  return (
    isPurchasePayableRegistrationTask(task) ||
    isOutsourcePayableRegistrationTask(task)
  )
}

export function isPayableReconciliationTask(task = {}) {
  return (
    isPurchaseReconciliationTask(task) || isOutsourceReconciliationTask(task)
  )
}

export function resolvePayableReconciliationTaskBusinessStatus(
  task,
  taskStatusKey
) {
  if (isPayableRegistrationTask(task)) {
    if (taskStatusKey === 'done') return RECONCILING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey))
      return BLOCKED_STATUS_KEY
    return task.business_status_key || INBOUND_DONE_STATUS_KEY
  }
  if (isPayableReconciliationTask(task)) {
    if (taskStatusKey === 'done') return SETTLED_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey))
      return BLOCKED_STATUS_KEY
    return task.business_status_key || RECONCILING_STATUS_KEY
  }
  return null
}

function hasActiveTaskForRecord(tasks, record, matcher) {
  const normalizedRecord = record || {}
  const sourceType = resolvePayableSourceType(normalizedRecord)
  if (!sourceType || !normalizedRecord.id) return false
  return (Array.isArray(tasks) ? tasks : []).some(
    (task) =>
      matcher(task) &&
      normalizeText(task.source_type) === sourceType &&
      String(task.source_id) === String(normalizedRecord.id) &&
      ACTIVE_TASK_STATUS_KEYS.has(normalizeText(task.task_status_key))
  )
}

export function hasActivePayableRegistrationTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isPayableRegistrationTask)
}

export function hasActiveReconciliationTaskForRecord(tasks = [], record = {}) {
  return hasActiveTaskForRecord(tasks, record, isPayableReconciliationTask)
}
