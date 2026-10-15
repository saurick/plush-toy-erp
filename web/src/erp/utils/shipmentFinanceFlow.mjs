export const PRODUCTION_PROGRESS_MODULE_KEY = 'production-progress'

export const SHIPPING_RELEASE_MODULE_KEY = 'shipping-release'

export const OUTBOUND_MODULE_KEY = 'outbound'

export const RECEIVABLES_MODULE_KEY = 'receivables'

export const INVOICES_MODULE_KEY = 'invoices'

export const RECEIVABLE_REGISTRATION_TASK_GROUP = 'receivable_registration'

export const INVOICE_REGISTRATION_TASK_GROUP = 'invoice_registration'

export const SHIPPED_STATUS_KEY = 'shipped'

export const RECONCILING_STATUS_KEY = 'reconciling'

export const BLOCKED_STATUS_KEY = 'blocked'

const FINANCE_SOURCE_TYPE_KEYS = new Set([
  'shipment',
  SHIPPING_RELEASE_MODULE_KEY,
  OUTBOUND_MODULE_KEY,
  PRODUCTION_PROGRESS_MODULE_KEY,
  RECEIVABLES_MODULE_KEY,
  INVOICES_MODULE_KEY,
])

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
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
