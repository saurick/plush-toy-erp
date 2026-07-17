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

const QUANTITY_PATTERN = /^(?:0*\d+(?:\.\d+)?|0*\.\d+)$/u
const QUANTITY_MAX_LENGTH = 21
const QUANTITY_SCALE = 6

function zeroQuantityUnits() {
  return BigInt(0)
}

function canonicalQuantity(value, allowZero = false) {
  const text = String(value ?? '').trim()
  if (text.length > QUANTITY_MAX_LENGTH || !QUANTITY_PATTERN.test(text)) {
    return ''
  }
  const [whole = '0', fraction = ''] = text.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, '') || '0'
  if (normalizedWhole.length > 14 || fraction.length > QUANTITY_SCALE) {
    return ''
  }
  const normalizedFraction = fraction.replace(/0+$/u, '')
  const normalized = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole
  return allowZero || normalized !== '0' ? normalized : ''
}

function quantityUnits(value, allowZero = false) {
  const normalized = canonicalQuantity(value, allowZero)
  if (!normalized) throw invalidContract('完工数量不完整，请刷新后重试')
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(`${whole}${fraction.padEnd(QUANTITY_SCALE, '0')}`)
}

function quantityTextFromUnits(value) {
  const digits = value.toString().padStart(QUANTITY_SCALE + 1, '0')
  const whole = digits.slice(0, -QUANTITY_SCALE) || '0'
  const fraction = digits.slice(-QUANTITY_SCALE).replace(/0+$/u, '')
  return fraction ? `${whole}.${fraction}` : whole
}

function invalidContract(message = '完工入库内容不完整，请重新核对') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function requirePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidContract('完工入库内容有误，请刷新页面后重新填写')
  }
  return value
}

function requireAllowedKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw invalidContract('完工入库内容有误，请刷新页面后重新填写')
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
  return canonicalQuantity(value)
}

export function compareProductionCompletionQuantity(left, right) {
  const leftUnits = quantityUnits(left)
  const rightUnits = quantityUnits(right, true)
  return leftUnits === rightUnits ? 0 : leftUnits > rightUnits ? 1 : -1
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
    const quantity = quantityUnits(fact.quantity)
    target.set(lineID, (target.get(lineID) || zeroQuantityUnits()) + quantity)
  }

  return (Array.isArray(items) ? items : []).map((item, index) => {
    const lineID = Number(item?.id || 0)
    const planned = quantityUnits(item?.planned_quantity)
    const acceptedPackaging = item?.accepted_packaging_quantity
      ? quantityUnits(item.accepted_packaging_quantity)
      : planned
    const posted = postedByLine.get(lineID) || zeroQuantityUnits()
    const draft = draftByLine.get(lineID) || zeroQuantityUnits()
    const remaining =
      acceptedPackaging > posted
        ? acceptedPackaging - posted
        : zeroQuantityUnits()
    const productText =
      [item?.product_code_snapshot, item?.product_name_snapshot]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ') || `生产明细 ${index + 1}`
    const skuText = String(item?.sku_code_snapshot || '').trim()
    const unitText = String(item?.unit_name_snapshot || '').trim()
    return {
      value: lineID,
      label: `${productText}${skuText ? ` / ${skuText}` : ''} · 剩余 ${quantityTextFromUnits(remaining)}${unitText ? ` ${unitText}` : ''}`,
      item,
      planned: quantityTextFromUnits(planned),
      acceptedPackaging: quantityTextFromUnits(acceptedPackaging),
      posted: quantityTextFromUnits(posted),
      draft: quantityTextFromUnits(draft),
      remaining: quantityTextFromUnits(remaining),
      disabled: lineID <= 0 || remaining <= zeroQuantityUnits(),
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
    throw invalidContract('完工入库批次有误，请重新选择或填写')
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
