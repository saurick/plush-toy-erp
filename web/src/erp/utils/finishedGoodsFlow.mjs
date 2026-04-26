import { BUSINESS_ROLE_KEY } from './roleKeys.mjs'

export const PRODUCTION_PROGRESS_MODULE_KEY = 'production-progress'
export const INBOUND_MODULE_KEY = 'inbound'
export const SHIPPING_RELEASE_MODULE_KEY = 'shipping-release'

export const FINISHED_GOODS_QC_TASK_GROUP = 'finished_goods_qc'
export const FINISHED_GOODS_INBOUND_TASK_GROUP = 'finished_goods_inbound'
export const FINISHED_GOODS_REWORK_TASK_GROUP = 'finished_goods_rework'
export const SHIPMENT_RELEASE_TASK_GROUP = 'shipment_release'

export const PRODUCTION_PROCESSING_STATUS_KEY = 'production_processing'
export const QC_PENDING_STATUS_KEY = 'qc_pending'
export const WAREHOUSE_INBOUND_PENDING_STATUS_KEY = 'warehouse_inbound_pending'
export const QC_FAILED_STATUS_KEY = 'qc_failed'
export const INBOUND_DONE_STATUS_KEY = 'inbound_done'
export const SHIPMENT_PENDING_STATUS_KEY = 'shipment_pending'
export const SHIPPED_STATUS_KEY = 'shipped'

const FINISHED_GOODS_SOURCE_TYPE_KEYS = new Set([
  PRODUCTION_PROGRESS_MODULE_KEY,
  INBOUND_MODULE_KEY,
  SHIPPING_RELEASE_MODULE_KEY,
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

export function resolveFinishedGoodsSourceType(record = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  return FINISHED_GOODS_SOURCE_TYPE_KEYS.has(sourceType) ? sourceType : ''
}

export function isProductionCompletedRecord(record = {}) {
  const payload = payloadOf(record)
  return (
    normalizeText(record.module_key || record.source_type) ===
      PRODUCTION_PROGRESS_MODULE_KEY &&
    (payload.finished === true ||
      record.finished === true ||
      normalizeText(record.business_status_key) ===
        PRODUCTION_PROCESSING_STATUS_KEY)
  )
}

export function resolveFinishedGoodsSourceNo(record = {}) {
  return (
    normalizeText(record.document_no) ||
    normalizeText(record.source_no) ||
    normalizeText(record.title) ||
    normalizeText(record.id)
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

export function resolveFinishedGoodsQcDueAt(record = {}, options = {}) {
  return nowSeconds(options) + 4 * HOUR_SECONDS
}

export function resolveShipmentDueAt(record = {}, options = {}) {
  const shipmentSecond = parseBusinessDateEndSecond(resolveShipmentDate(record))
  if (shipmentSecond) return shipmentSecond
  return nowSeconds(options) + DAY_SECONDS
}

export function resolveFinishedGoodsPriority(record = {}, options = {}) {
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

  const shipmentSecond = parseBusinessDateEndSecond(resolveShipmentDate(record))
  if (shipmentSecond) {
    const secondsLeft = shipmentSecond - nowSeconds(options)
    if (secondsLeft < 0) return URGENT_PRIORITY
    if (secondsLeft <= DAY_SECONDS) return HIGH_PRIORITY
  }

  return DEFAULT_PRIORITY
}

function buildFinishedGoodsRelatedDocuments(record = {}, options = {}) {
  const sourceType = normalizeText(record.module_key || record.source_type)
  const sourceNo = resolveFinishedGoodsSourceNo(record)
  const quantityText =
    record.quantity !== undefined && record.quantity !== null
      ? `数量：${record.quantity}${record.unit || ''}`
      : ''
  const payload = payloadOf(record)
  return [
    sourceNo && sourceType === PRODUCTION_PROGRESS_MODULE_KEY
      ? `生产进度：${sourceNo}`
      : '',
    sourceNo && sourceType === INBOUND_MODULE_KEY
      ? `入库记录：${sourceNo}`
      : '',
    sourceNo && sourceType === SHIPPING_RELEASE_MODULE_KEY
      ? `出货放行：${sourceNo}`
      : '',
    record.source_no ? `订单：${record.source_no}` : '',
    payload.order_no ? `订单：${payload.order_no}` : '',
    record.product_name ? `产品：${record.product_name}` : '',
    record.material_name ? `物料 / 成品：${record.material_name}` : '',
    quantityText,
    payload.packaging_requirement
      ? `包装要求：${payload.packaging_requirement}`
      : '',
    payload.shipping_requirement
      ? `出货要求：${payload.shipping_requirement}`
      : '',
    options.qcResult ? `成品抽检结果：${options.qcResult}` : '',
    options.reason ? `不良原因：${options.reason}` : '',
  ].filter(Boolean)
}

function baseTaskSource(record = {}) {
  return {
    source_type: resolveFinishedGoodsSourceType(record),
    source_id: record.id,
    source_no: resolveFinishedGoodsSourceNo(record),
  }
}

function commonPayload(record = {}) {
  const payload = payloadOf(record)
  return {
    record_title: record.title || '',
    customer_name: record.customer_name || payload.customer_name || '',
    style_no: record.style_no || payload.style_no || '',
    material_name: record.material_name || '',
    product_no: record.product_no || '',
    product_name: record.product_name || '',
    quantity: record.quantity ?? '',
    unit: record.unit || '',
    due_date: record.due_date || '',
    shipment_date: resolveShipmentDate(record),
    packaging_requirement: payload.packaging_requirement || '',
    shipping_requirement: payload.shipping_requirement || '',
    finished_goods: true,
  }
}

export function buildFinishedGoodsQcTask(record = {}, options = {}) {
  if (!isProductionCompletedRecord(record) || !record.id) return null
  return {
    task_code: taskCode('finished-goods-qc', record, options),
    task_group: FINISHED_GOODS_QC_TASK_GROUP,
    task_name: '成品抽检',
    ...baseTaskSource(record),
    business_status_key: QC_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'quality',
    priority: resolveFinishedGoodsPriority(record, options),
    due_at: resolveFinishedGoodsQcDueAt(record, options),
    payload: {
      ...commonPayload(record),
      complete_condition:
        '品质完成成品抽检，并给出合格、不合格、返工或放行结论',
      related_documents: buildFinishedGoodsRelatedDocuments(record),
      notification_type: 'task_created',
      alert_type: 'finished_goods_qc_pending',
      critical_path: true,
      finished_goods: true,
    },
  }
}

export function buildFinishedGoodsInboundTask(
  record = {},
  qcTask = {},
  options = {}
) {
  if (!resolveFinishedGoodsSourceType(record) || !record.id) return null
  const priority = clampPriority(qcTask?.priority) ?? DEFAULT_PRIORITY
  const qcResult =
    normalizeText(qcTask?.payload?.qc_result) ||
    normalizeText(qcTask?.payload?.approval_result) ||
    'pass'
  return {
    task_code: taskCode('finished-goods-inbound', record, options),
    task_group: FINISHED_GOODS_INBOUND_TASK_GROUP,
    task_name: '成品入库',
    ...baseTaskSource(record),
    business_status_key: WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    priority,
    due_at: nowSeconds(options) + 4 * HOUR_SECONDS,
    payload: {
      ...commonPayload(record),
      qc_task_id: qcTask?.id,
      qc_result: qcResult,
      complete_condition: '仓库确认成品入库数量、库位和经手人',
      related_documents: buildFinishedGoodsRelatedDocuments(record, {
        qcResult,
      }),
      notification_type: 'task_created',
      alert_type: 'finished_goods_inbound_pending',
      critical_path: true,
      finished_goods: true,
      inventory_balance_deferred: true,
    },
  }
}

export function buildFinishedGoodsReworkTask(
  record = {},
  qcTask = {},
  reason = '',
  options = {}
) {
  if (!resolveFinishedGoodsSourceType(record) || !record.id) return null
  const normalizedReason = normalizeText(reason)
  return {
    task_code: taskCode('finished-goods-rework', record, options),
    task_group: FINISHED_GOODS_REWORK_TASK_GROUP,
    task_name: '成品返工处理',
    ...baseTaskSource(record),
    business_status_key: QC_FAILED_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'production',
    priority: HIGH_PRIORITY,
    payload: {
      ...commonPayload(record),
      qc_task_id: qcTask?.id,
      qc_result: 'fail',
      rejected_reason: normalizedReason,
      complete_condition: '生产确认返工完成、重新提交成品抽检或让步放行处理',
      related_documents: buildFinishedGoodsRelatedDocuments(record, {
        qcResult: 'fail',
        reason: normalizedReason,
      }),
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      critical_path: true,
      finished_goods: true,
    },
  }
}

export function buildShipmentReleaseTask(
  record = {},
  inboundTask = {},
  options = {}
) {
  if (!resolveFinishedGoodsSourceType(record) || !record.id) return null
  return {
    task_code: taskCode('shipment-release', record, options),
    task_group: SHIPMENT_RELEASE_TASK_GROUP,
    task_name: '出货放行 / 出货准备',
    ...baseTaskSource(record),
    business_status_key: SHIPMENT_PENDING_STATUS_KEY,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    priority: resolveFinishedGoodsPriority(record, options),
    due_at: resolveShipmentDueAt(record, options),
    payload: {
      ...commonPayload(record),
      inbound_task_id: inboundTask?.id,
      complete_condition: '确认出货数量、装箱、唛头、客户要求和出货状态',
      related_documents: buildFinishedGoodsRelatedDocuments(record),
      notification_type: 'task_created',
      alert_type: 'shipment_pending',
      critical_path: true,
      finished_goods: true,
      confirm_role_key: BUSINESS_ROLE_KEY,
      next_module_key: SHIPPING_RELEASE_MODULE_KEY,
    },
  }
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
    FINISHED_GOODS_SOURCE_TYPE_KEYS.has(normalizeText(task.source_type)) &&
    normalizeText(task.task_group) === SHIPMENT_RELEASE_TASK_GROUP
  )
}

export function isFinishedGoodsQcPassResult(value) {
  return [
    'pass',
    'passed',
    'qualified',
    'accepted',
    'released',
    'ok',
    '合格',
    '放行',
    '让步接收',
  ].includes(normalizeText(value).toLowerCase())
}

export function isFinishedGoodsQcFailResult(value) {
  return [
    'fail',
    'failed',
    'rejected',
    'unqualified',
    'ng',
    '不合格',
    '退回',
    '返工',
  ].includes(normalizeText(value).toLowerCase())
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
    if (taskStatusKey === 'done') return SHIPPED_STATUS_KEY
    return task.business_status_key || SHIPMENT_PENDING_STATUS_KEY
  }
  return null
}

function hasActiveTaskForRecord(tasks, record, matcher) {
  const normalizedRecord = record || {}
  const sourceType = resolveFinishedGoodsSourceType(normalizedRecord)
  if (!sourceType || !normalizedRecord.id) return false
  return (Array.isArray(tasks) ? tasks : []).some(
    (task) =>
      matcher(task) &&
      normalizeText(task.source_type) === sourceType &&
      String(task.source_id) === String(normalizedRecord.id) &&
      ACTIVE_TASK_STATUS_KEYS.has(normalizeText(task.task_status_key))
  )
}

export function hasActiveFinishedGoodsQcTaskForRecord(tasks = [], record = {}) {
  return hasActiveTaskForRecord(tasks, record, isFinishedGoodsQcTask)
}

export function hasActiveFinishedGoodsInboundTaskForRecord(
  tasks = [],
  record = {}
) {
  return hasActiveTaskForRecord(tasks, record, isFinishedGoodsInboundTask)
}

export function hasActiveShipmentReleaseTaskForRecord(tasks = [], record = {}) {
  return hasActiveTaskForRecord(tasks, record, isShipmentReleaseTask)
}
