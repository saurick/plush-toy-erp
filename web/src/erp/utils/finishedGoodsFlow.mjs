export const PRODUCTION_PROGRESS_MODULE_KEY = 'production-progress'

export const INBOUND_MODULE_KEY = 'inbound'

export const SHIPPING_RELEASE_MODULE_KEY = 'shipping-release'

export const SHIPMENT_SOURCE_TYPE_KEY = 'shipment'

export const FINISHED_GOODS_QC_TASK_GROUP = 'finished_goods_qc'

export const FINISHED_GOODS_INBOUND_TASK_GROUP = 'finished_goods_inbound'

export const FINISHED_GOODS_REWORK_TASK_GROUP = 'finished_goods_rework'

export const SHIPMENT_RELEASE_TASK_GROUP = 'shipment_finance_approval'

export const PRODUCTION_PROCESSING_STATUS_KEY = 'production_processing'

export const QC_PENDING_STATUS_KEY = 'qc_pending'

export const WAREHOUSE_INBOUND_PENDING_STATUS_KEY = 'warehouse_inbound_pending'

export const QC_FAILED_STATUS_KEY = 'qc_failed'

export const INBOUND_DONE_STATUS_KEY = 'inbound_done'

export const SHIPMENT_PENDING_STATUS_KEY = 'shipment_pending'

export const SHIPPING_RELEASED_STATUS_KEY = 'shipping_released'

const FINISHED_GOODS_SOURCE_TYPE_KEYS = new Set([
  PRODUCTION_PROGRESS_MODULE_KEY,
  INBOUND_MODULE_KEY,
  SHIPPING_RELEASE_MODULE_KEY,
])

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

export function isFinishedGoodsQcTask(task = {}) {
  return (
    normalizeText(task.source_type) === PRODUCTION_PROGRESS_MODULE_KEY &&
    normalizeText(task.task_group) === FINISHED_GOODS_QC_TASK_GROUP
  )
}

export function isFinishedGoodsInboundTask(task = {}) {
  return (
    FINISHED_GOODS_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === FINISHED_GOODS_INBOUND_TASK_GROUP
  )
}

export function isFinishedGoodsReworkTask(task = {}) {
  return (
    FINISHED_GOODS_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === FINISHED_GOODS_REWORK_TASK_GROUP
  )
}

export function isShipmentReleaseTask(task = {}) {
  return (
    normalizeText(task.source_type) === SHIPMENT_SOURCE_TYPE_KEY &&
    normalizeText(task.task_group) === SHIPMENT_RELEASE_TASK_GROUP
  )
}

export function resolveFinishedGoodsTaskBusinessStatus(task, taskStatusKey) {
  if (isFinishedGoodsQcTask(task)) {
    if (taskStatusKey === 'done') return WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || QC_PENDING_STATUS_KEY
  }
  if (isFinishedGoodsInboundTask(task)) {
    if (taskStatusKey === 'done') return INBOUND_DONE_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return task.business_status_key || WAREHOUSE_INBOUND_PENDING_STATUS_KEY
  }
  if (isFinishedGoodsReworkTask(task)) {
    if (taskStatusKey === 'done') return PRODUCTION_PROCESSING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || QC_FAILED_STATUS_KEY
  }
  if (isShipmentReleaseTask(task)) {
    if (taskStatusKey === 'done') return SHIPPING_RELEASED_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return task.business_status_key || SHIPMENT_PENDING_STATUS_KEY
  }
  return null
}
