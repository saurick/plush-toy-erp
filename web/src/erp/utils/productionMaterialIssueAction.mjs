import {
  positiveSafeInteger,
  PRODUCTION_MATERIAL_REQUIREMENTS_STATE,
} from './productionOrderModel.mjs'

const LIST_REQUEST_KEYS = new Set(['customer_key', 'production_order_id'])
const CREATE_REQUEST_KEYS = new Set([
  'customer_key',
  'fact_no',
  'production_order_id',
  'production_order_item_id',
  'production_order_material_requirement_id',
  'warehouse_id',
  'lot_id',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'note',
])

function invalidContract(message = '生产领料内容不完整，请重新核对') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function requirePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidContract('生产领料内容有误，请刷新页面后重新填写')
  }
  return value
}

function requireAllowedKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw invalidContract('生产领料内容有误，请刷新页面后重新填写')
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
  if (!positiveSafeInteger(value)) throw invalidContract()
  return Number(value)
}

function decimalNumber(value) {
  const text = String(value ?? '')
    .replace(/,/gu, '')
    .trim()
  if (!/^(?:0\.(?:0*[1-9]\d*)|[1-9]\d*(?:\.\d+)?)$/u.test(text)) {
    return 0
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function quantityText(value) {
  const parsed = decimalNumber(value)
  if (parsed <= 0) return ''
  return String(Number(parsed.toFixed(6)))
}

function optionalOccurredAt(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim()) throw invalidContract()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw invalidContract()
  return date.toISOString()
}

export function normalizeProductionMaterialRequirementsListRequest(
  params = {}
) {
  const source = requirePlainObject(params)
  requireAllowedKeys(source, LIST_REQUEST_KEYS)
  const customerKey = optionalText(source.customer_key, 64)
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    production_order_id: requiredID(source.production_order_id),
  }
}

export function normalizeProductionMaterialIssueCreateRequest(params = {}) {
  const source = requirePlainObject(params)
  requireAllowedKeys(source, CREATE_REQUEST_KEYS)
  const customerKey = optionalText(source.customer_key, 64)
  const note = optionalText(source.note)
  const occurredAt = optionalOccurredAt(source.occurred_at)
  const quantity = quantityText(source.quantity)
  if (!quantity) throw invalidContract()
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    fact_no: requiredText(source.fact_no),
    production_order_id: requiredID(source.production_order_id),
    production_order_item_id: requiredID(source.production_order_item_id),
    production_order_material_requirement_id: requiredID(
      source.production_order_material_requirement_id
    ),
    warehouse_id: requiredID(source.warehouse_id),
    lot_id: requiredID(source.lot_id),
    quantity,
    idempotency_key: requiredText(source.idempotency_key),
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(note ? { note } : {}),
  }
}

export function isProductionMaterialIssueEligible(
  order = {},
  materialRequirementsState = '',
  requirement = {}
) {
  return Boolean(
    String(order?.status || '').toUpperCase() === 'RELEASED' &&
      materialRequirementsState ===
        PRODUCTION_MATERIAL_REQUIREMENTS_STATE.READY &&
      positiveSafeInteger(order?.id) &&
      positiveSafeInteger(requirement?.id) &&
      requirement.production_order_id === order.id &&
      positiveSafeInteger(requirement?.production_order_item_id) &&
      positiveSafeInteger(requirement?.material_id) &&
      positiveSafeInteger(requirement?.unit_id) &&
      decimalNumber(requirement?.remaining_quantity) > 0
  )
}

export function filterProductionMaterialIssueLots(requirement = {}, lots = []) {
  const materialID = Number(requirement?.material_id || 0)
  return (Array.isArray(lots) ? lots : []).filter(
    (lot) =>
      String(lot?.subject_type || '').toUpperCase() === 'MATERIAL' &&
      Number(lot?.subject_id || 0) === materialID &&
      String(lot?.status || '').toUpperCase() === 'ACTIVE' &&
      positiveSafeInteger(Number(lot?.id || 0))
  )
}

export function buildProductionMaterialIssuePayload(
  values = {},
  order = {},
  materialRequirementsState = '',
  requirement = {}
) {
  if (
    !isProductionMaterialIssueEligible(
      order,
      materialRequirementsState,
      requirement
    )
  ) {
    throw new Error('当前生产订单的物料需求尚不能领料，请刷新后核对')
  }
  const warehouseID = Number(values.warehouse_id || 0)
  const lotID = Number(values.lot_id || 0)
  const quantity = quantityText(values.quantity)
  if (!positiveSafeInteger(warehouseID)) throw new Error('请选择领料仓库')
  if (!positiveSafeInteger(lotID)) throw new Error('请选择匹配的材料批次')
  if (!quantity) throw new Error('领料数量必须大于 0')
  if (decimalNumber(quantity) > decimalNumber(requirement.remaining_quantity)) {
    throw new Error('领料数量不能超过当前剩余需求')
  }
  const occurredAtText = String(values.occurred_at || '').trim()
  return {
    production_order_id: Number(order.id),
    production_order_item_id: Number(requirement.production_order_item_id),
    production_order_material_requirement_id: Number(requirement.id),
    warehouse_id: warehouseID,
    lot_id: lotID,
    quantity,
    ...(occurredAtText
      ? { occurred_at: new Date(occurredAtText).toISOString() }
      : {}),
    ...(String(values.note || '').trim()
      ? { note: String(values.note).trim() }
      : {}),
  }
}

export function validateProductionMaterialIssueResult(
  result,
  request = {},
  requirement = null
) {
  const expectedMaterialID = Number(requirement?.material_id || 0)
  const expectedUnitID = Number(requirement?.unit_id || 0)
  if (
    !result ||
    !positiveSafeInteger(result.id) ||
    String(result.status || '').toUpperCase() !== 'DRAFT' ||
    String(result.fact_type || '').toUpperCase() !== 'MATERIAL_ISSUE' ||
    String(result.subject_type || '').toUpperCase() !== 'MATERIAL' ||
    !positiveSafeInteger(result.subject_id) ||
    !positiveSafeInteger(result.unit_id) ||
    String(result.source_type || '').toUpperCase() !== 'PRODUCTION_ORDER' ||
    Number(result.source_id || 0) !==
      Number(request.production_order_id || 0) ||
    Number(result.source_line_id || 0) !==
      Number(request.production_order_material_requirement_id || 0) ||
    (expectedMaterialID > 0 &&
      Number(result.subject_id) !== expectedMaterialID) ||
    (expectedUnitID > 0 && Number(result.unit_id) !== expectedUnitID)
  ) {
    throw invalidContract('生产领料记录返回结果无法确认')
  }
  return result
}

export function findProductionMaterialIssueResult(
  facts = [],
  request = {},
  requirement = null
) {
  const idempotencyKey = String(request?.idempotency_key || '').trim()
  const factNo = String(request?.fact_no || '').trim()
  const matched = (Array.isArray(facts) ? facts : []).find(
    (fact) =>
      (idempotencyKey && fact?.idempotency_key === idempotencyKey) ||
      (factNo && fact?.fact_no === factNo)
  )
  return matched
    ? validateProductionMaterialIssueResult(matched, request, requirement)
    : null
}
