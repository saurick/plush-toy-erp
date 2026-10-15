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

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
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
