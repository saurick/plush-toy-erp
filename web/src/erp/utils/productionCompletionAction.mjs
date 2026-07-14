import {
  buildSourceInboundLotFields,
  normalizeSourceInboundLotRequestFields,
} from './sourceInboundLotSelection.mjs'

const CREATE_REQUEST_KEYS = new Set([
  'customer_key',
  'fact_no',
  'production_order_id',
  'production_order_item_id',
  'warehouse_id',
  'lot_id',
  'new_lot_no',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'note',
])

function decimalNumber(value) {
  const parsed = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(parsed) ? parsed : 0
}

function invalidContract(message = '完工入库请求信息不完整') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function requirePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidContract('完工入库请求参数无效')
  }
  return value
}

function requireAllowedKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw invalidContract('完工入库请求包含不允许的字段')
    }
  }
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

function requiredID(value) {
  const parsed = Number(value || 0)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw invalidContract()
  return parsed
}

function optionalOccurredAt(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim()) throw invalidContract()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw invalidContract()
  return date.toISOString()
}

function normalizedQuantity(value) {
  const parsed = decimalNumber(value)
  if (parsed <= 0) return ''
  return String(Number(parsed.toFixed(4)))
}

export function buildProductionCompletionChoices(items = [], facts = []) {
  const postedByLine = new Map()
  const draftByLine = new Map()
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (
      fact?.fact_type !== 'FINISHED_GOODS_RECEIPT' ||
      fact?.source_type !== 'PRODUCTION_ORDER' ||
      !Number(fact?.source_line_id)
    ) {
      continue
    }
    const target = fact.status === 'POSTED' ? postedByLine : draftByLine
    if (!['POSTED', 'DRAFT'].includes(fact.status)) continue
    const lineID = Number(fact.source_line_id)
    target.set(lineID, (target.get(lineID) || 0) + decimalNumber(fact.quantity))
  }

  return (Array.isArray(items) ? items : []).map((item, index) => {
    const lineID = Number(item?.id || 0)
    const planned = decimalNumber(item?.planned_quantity)
    const posted = postedByLine.get(lineID) || 0
    const draft = draftByLine.get(lineID) || 0
    const remaining = Math.max(0, planned - posted)
    const productText =
      [item?.product_code_snapshot, item?.product_name_snapshot]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ') || `生产明细 ${index + 1}`
    const skuText = String(item?.sku_code_snapshot || '').trim()
    const unitText = String(item?.unit_name_snapshot || '').trim()
    return {
      value: lineID,
      label: `${productText}${skuText ? ` / ${skuText}` : ''} · 剩余 ${normalizedQuantity(remaining)}${unitText ? ` ${unitText}` : ''}`,
      item,
      planned: normalizedQuantity(planned),
      posted: normalizedQuantity(posted),
      draft: normalizedQuantity(draft),
      remaining: normalizedQuantity(remaining),
      disabled: lineID <= 0 || remaining <= 0,
    }
  })
}

export function buildProductionCompletionLotOptions(item = {}, lots = []) {
  const productID = Number(item?.product_id || 0)
  const skuID = Number(item?.product_sku_id || 0)
  return (Array.isArray(lots) ? lots : [])
    .filter((lot) => {
      if (
        String(lot?.subject_type || '').toUpperCase() !== 'PRODUCT' ||
        Number(lot?.subject_id || 0) !== productID ||
        String(lot?.status || '').toUpperCase() !== 'ACTIVE'
      ) {
        return false
      }
      const lotSkuID = Number(lot?.product_sku_id || 0)
      return skuID > 0 ? lotSkuID === skuID : lotSkuID === 0
    })
    .map((lot) => ({
      value: Number(lot.id),
      label:
        [lot.lot_no, lot.production_lot_no]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .join(' / ') || '批次已关联',
    }))
    .filter((option) => Number.isSafeInteger(option.value) && option.value > 0)
}

export function buildProductionCompletionPayload(values = {}, order = {}) {
  if (String(order?.status || '').toUpperCase() !== 'RELEASED') {
    throw new Error('仅已发布生产订单可以登记完工入库')
  }
  const orderID = Number(order?.id || 0)
  const itemID = Number(values.production_order_item_id || 0)
  const warehouseID = Number(values.warehouse_id || 0)
  const quantity = normalizedQuantity(values.quantity)
  if (orderID <= 0 || itemID <= 0 || warehouseID <= 0 || !quantity) {
    throw new Error('请完整填写完工入库信息')
  }
  const occurredAtText = String(values.occurred_at || '').trim()
  const occurredAt = occurredAtText
    ? new Date(occurredAtText).toISOString()
    : undefined
  const lotFields = buildSourceInboundLotFields(values, {
    existingRequiredMessage: '请选择已有入库批次',
    newRequiredMessage: '请填写本次完工的新批次号',
    invalidMessage: '请选择已有入库批次或填写新批次号',
  })
  return {
    production_order_id: orderID,
    production_order_item_id: itemID,
    warehouse_id: warehouseID,
    ...lotFields,
    quantity,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(String(values.note || '').trim()
      ? { note: String(values.note).trim() }
      : {}),
  }
}

export function normalizeProductionCompletionCreateRequest(params = {}) {
  const source = requirePlainObject(params)
  requireAllowedKeys(source, CREATE_REQUEST_KEYS)
  const customerKey = optionalText(source.customer_key, 64)
  const note = optionalText(source.note)
  const occurredAt = optionalOccurredAt(source.occurred_at)
  const quantity = normalizedQuantity(source.quantity)
  if (!quantity) throw invalidContract()
  let lotFields
  try {
    lotFields = normalizeSourceInboundLotRequestFields(source)
  } catch {
    throw invalidContract('完工入库批次参数无效')
  }
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    fact_no: requiredText(source.fact_no),
    production_order_id: requiredID(source.production_order_id),
    production_order_item_id: requiredID(source.production_order_item_id),
    warehouse_id: requiredID(source.warehouse_id),
    ...lotFields,
    quantity,
    idempotency_key: requiredText(source.idempotency_key),
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(note ? { note } : {}),
  }
}

export function validateProductionCompletionResult(
  result,
  request = {},
  item = null
) {
  const expectedLotID = Number(request?.lot_id || 0)
  const expectedProductID = Number(item?.product_id || 0)
  const expectedUnitID = Number(item?.unit_id || 0)
  if (
    !result ||
    !Number.isSafeInteger(Number(result.id)) ||
    Number(result.id) <= 0 ||
    String(result.status || '').toUpperCase() !== 'DRAFT' ||
    String(result.fact_type || '').toUpperCase() !== 'FINISHED_GOODS_RECEIPT' ||
    String(result.subject_type || '').toUpperCase() !== 'PRODUCT' ||
    !Number.isSafeInteger(Number(result.lot_id)) ||
    Number(result.lot_id) <= 0 ||
    String(result.source_type || '').toUpperCase() !== 'PRODUCTION_ORDER' ||
    Number(result.source_id || 0) !==
      Number(request.production_order_id || 0) ||
    Number(result.source_line_id || 0) !==
      Number(request.production_order_item_id || 0) ||
    (expectedLotID > 0 && Number(result.lot_id) !== expectedLotID) ||
    (expectedProductID > 0 &&
      Number(result.subject_id) !== expectedProductID) ||
    (expectedUnitID > 0 && Number(result.unit_id) !== expectedUnitID)
  ) {
    throw invalidContract('完工记录返回结果无法确认')
  }
  return result
}

export function findProductionCompletionResult(
  facts = [],
  request = {},
  item = null
) {
  const idempotencyKey = String(request?.idempotency_key || '').trim()
  const factNo = String(request?.fact_no || '').trim()
  const matched = (Array.isArray(facts) ? facts : []).find(
    (fact) =>
      (idempotencyKey && fact?.idempotency_key === idempotencyKey) ||
      (factNo && fact?.fact_no === factNo)
  )
  return matched
    ? validateProductionCompletionResult(matched, request, item)
    : null
}
