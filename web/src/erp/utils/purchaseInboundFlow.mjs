export const ACCESSORIES_PURCHASE_MODULE_KEY = 'accessories-purchase'

export const INBOUND_MODULE_KEY = 'inbound'

export const PURCHASE_IQC_TASK_GROUP = 'purchase_iqc'

export const WAREHOUSE_INBOUND_TASK_GROUP = 'warehouse_inbound'

export const IQC_PENDING_STATUS_KEY = 'iqc_pending'

export const WAREHOUSE_INBOUND_PENDING_STATUS_KEY = 'warehouse_inbound_pending'

export const QC_FAILED_STATUS_KEY = 'qc_failed'

export const INBOUND_DONE_STATUS_KEY = 'inbound_done'

const ARRIVAL_SOURCE_TYPE_KEYS = new Set([
  ACCESSORIES_PURCHASE_MODULE_KEY,
  INBOUND_MODULE_KEY,
])

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
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
