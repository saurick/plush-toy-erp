export const PRODUCTION_PROGRESS_MODULE_KEY = 'production-progress'
export const SHIPPING_RELEASE_MODULE_KEY = 'shipping-release'
export const OUTBOUND_MODULE_KEY = 'outbound'
export const RECEIVABLES_MODULE_KEY = 'receivables'
export const INVOICES_MODULE_KEY = 'invoices'

export const SHIPMENT_RELEASE_TASK_GROUP = 'shipment_release'
export const RECEIVABLE_REGISTRATION_TASK_GROUP = 'receivable_registration'
export const INVOICE_REGISTRATION_TASK_GROUP = 'invoice_registration'

export const SHIPPED_STATUS_KEY = 'shipped'
export const RECONCILING_STATUS_KEY = 'reconciling'
export const BLOCKED_STATUS_KEY = 'blocked'

const SHIPMENT_SOURCE_TYPE_KEYS = new Set([
  SHIPPING_RELEASE_MODULE_KEY,
  OUTBOUND_MODULE_KEY,
  PRODUCTION_PROGRESS_MODULE_KEY,
])
const FINANCE_SOURCE_TYPE_KEYS = new Set([
  SHIPPING_RELEASE_MODULE_KEY,
  OUTBOUND_MODULE_KEY,
  PRODUCTION_PROGRESS_MODULE_KEY,
  RECEIVABLES_MODULE_KEY,
  INVOICES_MODULE_KEY,
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

export function resolveShipmentFinanceSourceType(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  return FINANCE_SOURCE_TYPE_KEYS.has(sourceType) ? sourceType : ''
}

export function resolveShipmentFinanceSourceNo(record = {}) {
  return (
    normalizeText(record.document_no) ||
    normalizeText(record.source_no) ||
    normalizeText(record.title) ||
    normalizeText(record.id)
  )
}

function resolvePaymentDueDate(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(payload.payment_due_date) ||
    normalizeText(payload.receivable_due_date) ||
    normalizeText(record.payment_due_date) ||
    normalizeText(record.receivable_due_date)
  )
}

function resolveInvoiceDueDate(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(payload.invoice_due_date) ||
    normalizeText(payload.billing_due_date) ||
    normalizeText(record.invoice_due_date) ||
    normalizeText(record.billing_due_date)
  )
}

function resolveShipmentDate(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(payload.shipment_date) ||
    normalizeText(payload.ship_date) ||
    normalizeText(payload.delivery_date) ||
    normalizeText(record.shipment_date) ||
    normalizeText(record.ship_date) ||
    normalizeText(record.delivery_date) ||
    normalizeText(record.due_date)
  )
}

export function resolveReceivableDueAt(record = {}, options = {}) {
  const paymentDueSecond = parseBusinessDateEndSecond(
    resolvePaymentDueDate(record)
  )
  if (paymentDueSecond) return paymentDueSecond
  return nowSeconds(options) + DAY_SECONDS
}

export function resolveInvoiceDueAt(record = {}, options = {}) {
  const invoiceDueSecond = parseBusinessDateEndSecond(
    resolveInvoiceDueDate(record)
  )
  if (invoiceDueSecond) return invoiceDueSecond
  return nowSeconds(options) + DAY_SECONDS
}

export function resolveFinancePriority(record = {}, options = {}) {
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
    parseBusinessDateEndSecond(resolveInvoiceDueDate(record)) ||
    parseBusinessDateEndSecond(resolveShipmentDate(record))
  if (dueSecond) {
    const secondsLeft = dueSecond - nowSeconds(options)
    if (secondsLeft < 0) return URGENT_PRIORITY
    if (secondsLeft <= DAY_SECONDS) return HIGH_PRIORITY
  }

  return DEFAULT_PRIORITY
}

export function isShipmentCompletedRecord(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  const payload = payloadOf(record)
  return (
    SHIPMENT_SOURCE_TYPE_KEYS.has(sourceType) &&
    (normalizeText(record.business_status_key) === SHIPPED_STATUS_KEY ||
      normalizeText(payload.shipment_result) === SHIPPED_STATUS_KEY ||
      payload.shipped === true)
  )
}

function buildFinanceRelatedDocuments(record = {}, options = {}) {
  const sourceNo = resolveShipmentFinanceSourceNo(record)
  const payload = payloadOf(record)
  const quantityText =
    record.quantity !== undefined && record.quantity !== null
      ? `数量：${record.quantity}${record.unit || ''}`
      : ''
  const amount =
    record.amount ??
    payload.amount ??
    payload.receivable_amount ??
    payload.amount_with_tax
  return [
    sourceNo ? `出货记录：${sourceNo}` : '',
    record.source_no ? `订单：${record.source_no}` : '',
    payload.order_no ? `订单：${payload.order_no}` : '',
    record.customer_name || payload.customer_name
      ? `客户：${record.customer_name || payload.customer_name}`
      : '',
    record.product_name || payload.product_name
      ? `产品：${record.product_name || payload.product_name}`
      : '',
    quantityText,
    amount !== undefined && amount !== null && amount !== ''
      ? `金额：${amount}`
      : '',
    payload.contract_no ? `合同：${payload.contract_no}` : '',
    payload.reconciliation_no ? `对账资料：${payload.reconciliation_no}` : '',
    options.invoiceNo ? `发票号：${options.invoiceNo}` : '',
    options.reason ? `异常原因：${options.reason}` : '',
  ].filter(Boolean)
}

function baseTaskSource(record = {}) {
  return {
    source_type: resolveShipmentFinanceSourceType(record),
    source_id: record.id,
    source_no: resolveShipmentFinanceSourceNo(record),
  }
}

function commonPayload(record = {}) {
  const payload = payloadOf(record)
  return {
    record_title: record.title || '',
    customer_name: record.customer_name || payload.customer_name || '',
    product_name: record.product_name || payload.product_name || '',
    material_name: record.material_name || payload.material_name || '',
    quantity: record.quantity ?? payload.quantity ?? '',
    unit: record.unit || payload.unit || '',
    amount: record.amount ?? payload.amount ?? payload.receivable_amount ?? '',
    tax_rate: payload.tax_rate ?? record.tax_rate ?? '',
    tax_amount: payload.tax_amount ?? record.tax_amount ?? '',
    amount_with_tax: payload.amount_with_tax ?? record.amount_with_tax ?? '',
    amount_without_tax:
      payload.amount_without_tax ?? record.amount_without_tax ?? '',
    payment_due_date: resolvePaymentDueDate(record),
    invoice_due_date: resolveInvoiceDueDate(record),
    shipment_date: resolveShipmentDate(record),
  }
}

export function buildReceivableRegistrationTask(
  record = {},
  shipmentTask = {},
  options = {}
) {
  if (!isShipmentCompletedRecord(record) || !record.id) return null
  const priority = Math.max(
    clampPriority(shipmentTask?.priority) ?? DEFAULT_PRIORITY,
    resolveFinancePriority(record, options)
  )
  return {
    task_code: taskCode('receivable-registration', record, options),
    task_group: RECEIVABLE_REGISTRATION_TASK_GROUP,
    task_name: '应收登记',
    ...baseTaskSource(record),
    business_status_key: SHIPPED_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'finance',
    priority,
    due_at: resolveReceivableDueAt(record, options),
    payload: {
      ...commonPayload(record),
      shipment_task_id: shipmentTask?.id,
      complete_condition:
        '财务确认客户、出货数量、应收金额、税率、含税/不含税金额和收款状态',
      related_documents: buildFinanceRelatedDocuments(record),
      notification_type: 'finance_pending',
      alert_type: 'finance_pending',
      critical_path: true,
      next_module_key: RECEIVABLES_MODULE_KEY,
    },
  }
}

export function buildInvoiceRegistrationTask(
  record = {},
  receivableTask = {},
  options = {}
) {
  if (!resolveShipmentFinanceSourceType(record) || !record.id) return null
  const priority = clampPriority(receivableTask?.priority) ?? DEFAULT_PRIORITY
  return {
    task_code: taskCode('invoice-registration', record, options),
    task_group: INVOICE_REGISTRATION_TASK_GROUP,
    task_name: '开票登记',
    ...baseTaskSource(record),
    business_status_key: RECONCILING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'finance',
    priority,
    due_at: resolveInvoiceDueAt(record, options),
    payload: {
      ...commonPayload(record),
      receivable_task_id: receivableTask?.id,
      complete_condition:
        '财务登记发票号、发票类型、税率、税额、含税金额、不含税金额和发票状态',
      related_documents: buildFinanceRelatedDocuments(record),
      notification_type: 'finance_pending',
      alert_type: 'invoice_pending',
      critical_path: false,
      next_module_key: INVOICES_MODULE_KEY,
    },
  }
}

export function buildFinanceBlockedState(record = {}, task = {}, reason = '') {
  const sourceType = resolveShipmentFinanceSourceType(record)
  if (!sourceType || !record.id) return null
  const normalizedReason = normalizeText(reason)
  return {
    source_type: sourceType,
    source_id: record.id,
    source_no: resolveShipmentFinanceSourceNo(record) || task.source_no || '',
    business_status_key: BLOCKED_STATUS_KEY,
    owner_role_key: 'finance',
    blocked_reason: normalizedReason,
    payload: {
      ...commonPayload(record),
      finance_task_id: task?.id,
      notification_type: 'finance_pending',
      alert_type: 'finance_pending',
      blocked_reason: normalizedReason,
      critical_path: true,
    },
  }
}

export function isShipmentReleaseTask(task = {}) {
  return (
    FINANCE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === SHIPMENT_RELEASE_TASK_GROUP
  )
}

export function isReceivableRegistrationTask(task = {}) {
  return (
    FINANCE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === RECEIVABLE_REGISTRATION_TASK_GROUP
  )
}

export function isInvoiceRegistrationTask(task = {}) {
  return (
    FINANCE_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === INVOICE_REGISTRATION_TASK_GROUP
  )
}

export function resolveShipmentFinanceTaskBusinessStatus(task, taskStatusKey) {
  if (isReceivableRegistrationTask(task)) {
    if (taskStatusKey === 'done') return RECONCILING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return BLOCKED_STATUS_KEY
    }
    return task.business_status_key || SHIPPED_STATUS_KEY
  }
  if (isInvoiceRegistrationTask(task)) {
    if (taskStatusKey === 'done') return RECONCILING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return BLOCKED_STATUS_KEY
    }
    return task.business_status_key || RECONCILING_STATUS_KEY
  }
  return null
}

function hasActiveTaskForRecord(tasks, record, matcher) {
  const normalizedRecord = record || {}
  const sourceType = resolveShipmentFinanceSourceType(normalizedRecord)
  if (!sourceType || !normalizedRecord.id) return false
  return (Array.isArray(tasks) ? tasks : []).some(
    (task) =>
      matcher(task) &&
      normalizeText(task.source_type) === sourceType &&
      String(task.source_id) === String(normalizedRecord.id) &&
      ACTIVE_TASK_STATUS_KEYS.has(normalizeText(task.task_status_key))
  )
}

export function hasActiveReceivableRegistrationTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isReceivableRegistrationTask)
}

export function hasActiveInvoiceRegistrationTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isInvoiceRegistrationTask)
}
