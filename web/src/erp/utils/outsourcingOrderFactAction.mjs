import {
  SOURCE_INBOUND_LOT_SELECTION,
  buildSourceInboundLotFields,
  normalizeSourceInboundLotRequestFields,
} from './sourceInboundLotSelection.mjs'

export const OUTSOURCING_SOURCE_ACTIONS = Object.freeze({
  MATERIAL_ISSUE: 'MATERIAL_ISSUE',
  RETURN_RECEIPT: 'RETURN_RECEIPT',
})

const BASE_CREATE_REQUEST_KEYS = [
  'customer_key',
  'fact_no',
  'outsourcing_order_id',
  'outsourcing_order_item_id',
  'warehouse_id',
  'lot_id',
  'quantity',
  'occurred_at',
  'note',
  'idempotency_key',
]
const MATERIAL_ISSUE_CREATE_REQUEST_KEYS = new Set(BASE_CREATE_REQUEST_KEYS)
const RETURN_RECEIPT_CREATE_REQUEST_KEYS = new Set([
  ...BASE_CREATE_REQUEST_KEYS,
  'new_lot_no',
])

function decimalNumber(value) {
  const parsed = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(parsed) ? parsed : 0
}

function quantityText(value) {
  const parsed = decimalNumber(value)
  if (parsed <= 0) return ''
  return String(Number(parsed.toFixed(4)))
}

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function requiredID(value) {
  const parsed = positiveID(value)
  if (!parsed) throw invalidContract()
  return parsed
}

function invalidContract(message = '委外业务内容不完整，请重新核对') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function requiredText(value, maxLength = 128) {
  if (typeof value !== 'string') throw invalidContract()
  const text = value.trim()
  if (!text || [...text].length > maxLength) throw invalidContract()
  return text
}

function optionalText(value, maxLength = 255) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw invalidContract()
  const text = value.trim()
  if (!text || [...text].length > maxLength) throw invalidContract()
  return text
}

function optionalOccurredAt(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim()) throw invalidContract()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw invalidContract()
  return date.toISOString()
}

function normalizedActionType(value) {
  const actionType = String(value || '')
    .trim()
    .toUpperCase()
  return Object.values(OUTSOURCING_SOURCE_ACTIONS).includes(actionType)
    ? actionType
    : ''
}

function expectedSubjectType(actionType) {
  return actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
    ? 'MATERIAL'
    : 'PRODUCT'
}

export function filterOutsourcingSourceActionLots(
  actionType,
  item = {},
  lots = []
) {
  const normalizedAction = normalizedActionType(actionType)
  if (!normalizedAction) return []
  const subjectType = expectedSubjectType(normalizedAction)
  const subjectID =
    subjectType === 'MATERIAL'
      ? positiveID(item.material_id)
      : positiveID(item.product_id)
  const productSkuID = positiveID(item.product_sku_id)
  if (!subjectID) return []
  return (Array.isArray(lots) ? lots : []).filter(
    (lot) =>
      String(lot?.subject_type || '').toUpperCase() === subjectType &&
      positiveID(lot?.subject_id) === subjectID &&
      String(lot?.status || '').toUpperCase() === 'ACTIVE' &&
      (subjectType !== 'PRODUCT' ||
        positiveID(lot?.product_sku_id) === productSkuID)
  )
}

export function isOutsourcingSourceActionEligible(
  actionType,
  order = {},
  item = {}
) {
  const normalizedAction = normalizedActionType(actionType)
  return Boolean(
    normalizedAction &&
      String(order?.lifecycle_status || '').toLowerCase() === 'confirmed' &&
      String(item?.line_status || '').toLowerCase() === 'open' &&
      positiveID(order?.id) > 0 &&
      positiveID(item?.id) > 0 &&
      positiveID(item?.outsourcing_order_id) === positiveID(order?.id) &&
      String(item?.subject_type || '').toUpperCase() ===
        expectedSubjectType(normalizedAction)
  )
}

export function outsourcingSourceActionProcessedQuantity(
  actionType,
  order = {},
  item = {},
  facts = []
) {
  const normalizedAction = normalizedActionType(actionType)
  if (!normalizedAction) return 0
  return (Array.isArray(facts) ? facts : []).reduce((total, fact) => {
    if (
      String(fact?.fact_type || '').toUpperCase() !== normalizedAction ||
      String(fact?.status || '').toUpperCase() === 'CANCELLED' ||
      positiveID(fact?.source_id) !== positiveID(order?.id) ||
      positiveID(fact?.source_line_id) !== positiveID(item?.id)
    ) {
      return total
    }
    return total + decimalNumber(fact?.quantity)
  }, 0)
}

export function outsourcingSourceActionQuantitySummary(
  actionType,
  order = {},
  item = {},
  facts = []
) {
  const planned = decimalNumber(item?.outsourcing_quantity)
  const processed = outsourcingSourceActionProcessedQuantity(
    actionType,
    order,
    item,
    facts
  )
  return {
    planned: quantityText(planned) || '0',
    processed: quantityText(processed) || '0',
    remaining: quantityText(Math.max(0, planned - processed)) || '0',
  }
}

export function buildOutsourcingSourceFactPayload(
  actionType,
  values = {},
  order = {},
  item = {},
  facts = []
) {
  const normalizedAction = normalizedActionType(actionType)
  if (!isOutsourcingSourceActionEligible(normalizedAction, order, item)) {
    throw new Error('当前委外明细不允许办理该业务')
  }
  const warehouseID = positiveID(values.warehouse_id)
  const quantity = quantityText(values.quantity)
  if (!warehouseID) {
    throw new Error('请选择办理仓库')
  }
  if (!quantity) {
    throw new Error('办理数量必须大于 0')
  }
  const lotInput =
    normalizedAction === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
      ? {
          ...values,
          lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
        }
      : values
  const lotFields = buildSourceInboundLotFields(lotInput, {
    allowNew: normalizedAction === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
    existingRequiredMessage:
      normalizedAction === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
        ? '请选择已有产品批次'
        : '请选择已有材料批次',
    newRequiredMessage: '请填写本次回货的新批次号',
    invalidMessage:
      normalizedAction === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
        ? '请选择已有产品批次或填写新批次号'
        : '请选择已有材料批次',
  })
  const summary = outsourcingSourceActionQuantitySummary(
    normalizedAction,
    order,
    item,
    facts
  )
  if (decimalNumber(quantity) > decimalNumber(summary.remaining)) {
    throw new Error('办理数量不能超过当前剩余数量')
  }
  const occurredAtText = String(values.occurred_at || '').trim()
  return {
    outsourcing_order_id: positiveID(order.id),
    outsourcing_order_item_id: positiveID(item.id),
    warehouse_id: warehouseID,
    ...lotFields,
    quantity,
    ...(occurredAtText
      ? { occurred_at: new Date(occurredAtText).toISOString() }
      : {}),
    ...(String(values.note || '').trim()
      ? { note: String(values.note).trim() }
      : {}),
  }
}

export function normalizeOutsourcingSourceFactCreateRequest(
  actionType,
  params = {}
) {
  const normalizedAction = normalizedActionType(actionType)
  if (
    !normalizedAction ||
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params)
  ) {
    throw invalidContract('委外业务内容有误，请刷新页面后重新填写')
  }
  const allowed =
    normalizedAction === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
      ? RETURN_RECEIPT_CREATE_REQUEST_KEYS
      : MATERIAL_ISSUE_CREATE_REQUEST_KEYS
  if (!Object.keys(params).every((key) => allowed.has(key))) {
    throw invalidContract('委外业务内容有误，请刷新页面后重新填写')
  }
  let lotFields
  try {
    lotFields = normalizeSourceInboundLotRequestFields(params, {
      allowNew: normalizedAction === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
    })
  } catch {
    throw invalidContract('委外业务批次有误，请重新选择或填写')
  }
  const customerKey = optionalText(params.customer_key, 64)
  const occurredAt = optionalOccurredAt(params.occurred_at)
  const note = optionalText(params.note)
  const quantity = quantityText(params.quantity)
  if (!quantity) throw invalidContract()
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    fact_no: requiredText(params.fact_no),
    outsourcing_order_id: requiredID(params.outsourcing_order_id),
    outsourcing_order_item_id: requiredID(params.outsourcing_order_item_id),
    warehouse_id: requiredID(params.warehouse_id),
    ...lotFields,
    quantity,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(note ? { note } : {}),
    idempotency_key: requiredText(params.idempotency_key),
  }
}

export function validateOutsourcingSourceFactResult(
  result,
  actionType,
  order = {},
  item = {},
  request = {}
) {
  const normalizedAction = normalizedActionType(actionType)
  const expectedLotID = positiveID(request?.lot_id)
  const expectedProductSkuID = positiveID(item?.product_sku_id)
  const shouldValidateProductSku =
    normalizedAction === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE ||
    Object.hasOwn(item || {}, 'product_sku_id')
  if (
    !result ||
    positiveID(result.id) <= 0 ||
    String(result.status || '').toUpperCase() !== 'DRAFT' ||
    String(result.fact_type || '').toUpperCase() !== normalizedAction ||
    String(result.source_type || '').toUpperCase() !== 'OUTSOURCING_ORDER' ||
    positiveID(result.source_id) !== positiveID(order.id) ||
    positiveID(result.source_line_id) !== positiveID(item.id) ||
    String(result.subject_type || '').toUpperCase() !==
      expectedSubjectType(normalizedAction) ||
    (shouldValidateProductSku &&
      positiveID(result.product_sku_id) !== expectedProductSkuID) ||
    positiveID(result.lot_id) <= 0 ||
    (expectedLotID > 0 && positiveID(result.lot_id) !== expectedLotID)
  ) {
    const error = new Error('委外业务返回结果无法确认')
    error.isInvalidResponse = true
    throw error
  }
  return result
}

export function findOutsourcingSourceFactResult(
  facts = [],
  request = {},
  actionType = '',
  order = {},
  item = {}
) {
  const idempotencyKey = String(request?.idempotency_key || '').trim()
  const factNo = String(request?.fact_no || '').trim()
  const matched = (Array.isArray(facts) ? facts : []).find(
    (fact) =>
      (idempotencyKey && fact?.idempotency_key === idempotencyKey) ||
      (factNo && fact?.fact_no === factNo)
  )
  return matched
    ? validateOutsourcingSourceFactResult(
        matched,
        actionType,
        order,
        item,
        request
      )
    : null
}
