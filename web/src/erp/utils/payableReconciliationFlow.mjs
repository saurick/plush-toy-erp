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

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
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
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return BLOCKED_STATUS_KEY
    }
    return task.business_status_key || INBOUND_DONE_STATUS_KEY
  }
  if (isPayableReconciliationTask(task)) {
    if (taskStatusKey === 'done') return SETTLED_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return BLOCKED_STATUS_KEY
    }
    return task.business_status_key || RECONCILING_STATUS_KEY
  }
  return null
}
