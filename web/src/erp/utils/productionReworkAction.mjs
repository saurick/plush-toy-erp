import {
  addNumeric20Scale6Units,
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  normalizePositiveNumeric20Scale6,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
} from './numeric20Scale6.mjs'

const MAX_FACT_NO_LENGTH = 64
const MAX_REASON_LENGTH = 255
const MAX_IDEMPOTENCY_KEY_LENGTH = 128

function normalizedText(value) {
  return String(value ?? '').trim()
}

function normalizedUpperText(value) {
  return normalizedText(value).toUpperCase()
}

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function quantityUnits(value) {
  return numeric20Scale6Units(value) ?? '0'
}

function positiveUnitsText(value) {
  return isPositiveNumeric20Scale6Units(value)
    ? numeric20Scale6TextFromUnits(value)
    : ''
}

function invalidResponse(message = '返工记录返回结果无法确认') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function boundedText(value, label, maxLength) {
  const text = normalizedText(value)
  if (!text) throw new Error(`请填写${label}`)
  if ([...text].length > maxLength) {
    throw new Error(`${label}不能超过 ${maxLength} 个字符`)
  }
  return text
}

function optionalOccurredAt(value) {
  const text = normalizedText(value)
  if (!text) return undefined
  const parsed = new Date(text)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('发生时间无效，请重新选择')
  }
  return parsed.toISOString()
}

function sameQuantity(left, right) {
  const leftUnits = numeric20Scale6Units(left)
  const rightUnits = numeric20Scale6Units(right)
  return leftUnits !== null && rightUnits !== null && leftUnits === rightUnits
}

export function isPostedProductionCompletion(fact = {}) {
  return Boolean(
    positiveID(fact?.id) > 0 &&
      normalizedUpperText(fact?.status) === 'POSTED' &&
      normalizedUpperText(fact?.fact_type) === 'FINISHED_GOODS_RECEIPT' &&
      normalizedUpperText(fact?.subject_type) === 'PRODUCT' &&
      positiveID(fact?.warehouse_id) > 0 &&
      positiveID(fact?.unit_id) > 0 &&
      positiveID(fact?.lot_id) > 0 &&
      normalizedUpperText(fact?.source_type) === 'PRODUCTION_ORDER' &&
      positiveID(fact?.source_id) > 0 &&
      positiveID(fact?.source_line_id) > 0 &&
      isPositiveNumeric20Scale6Units(quantityUnits(fact?.quantity))
  )
}

export function productionReworkQuantitySummary(source = {}, facts = []) {
  const completed = quantityUnits(source?.quantity)
  const postedRework = (Array.isArray(facts) ? facts : []).reduce(
    (total, fact) => {
      if (
        normalizedUpperText(fact?.fact_type) !== 'REWORK' ||
        normalizedUpperText(fact?.status) !== 'POSTED' ||
        normalizedUpperText(fact?.source_type) !== 'PRODUCTION_FACT' ||
        positiveID(fact?.source_id) !== positiveID(source?.id)
      ) {
        return total
      }
      return addNumeric20Scale6Units(total, quantityUnits(fact?.quantity))
    },
    '0'
  )
  const remaining = subtractNumeric20Scale6Units(completed, postedRework)
  return {
    completed: positiveUnitsText(completed) || '0',
    postedRework: positiveUnitsText(postedRework) || '0',
    remaining: positiveUnitsText(remaining) || '0',
  }
}

export function isProductionReworkEligible(source = {}, facts = []) {
  return (
    isPostedProductionCompletion(source) &&
    isPositiveNumeric20Scale6Units(
      quantityUnits(productionReworkQuantitySummary(source, facts).remaining)
    )
  )
}

export function suggestedProductionReworkNo(source = {}) {
  const sourceNo = normalizedText(source?.fact_no)
  return sourceNo ? `RW-${sourceNo}`.slice(0, MAX_FACT_NO_LENGTH) : ''
}

export function localProductionReworkDateTimeInputValue(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : Number.NaN
  if (!Number.isFinite(timestamp)) return ''
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(timestamp - offset).toISOString().slice(0, 16)
}

export function buildProductionReworkPayload(
  values = {},
  source = {},
  facts = []
) {
  if (!isPostedProductionCompletion(source)) {
    throw new Error('仅已过账且来源完整的成品入库记录可以发起返工')
  }
  const summary = productionReworkQuantitySummary(source, facts)
  const quantity = normalizePositiveNumeric20Scale6(values.quantity)
  if (!quantity) throw new Error('返工数量必须大于 0')
  if (
    compareNumeric20Scale6Units(
      quantityUnits(quantity),
      quantityUnits(summary.remaining)
    ) > 0
  ) {
    throw new Error('本次返工数量不能超过剩余可返工数量')
  }
  const factNo = boundedText(values.fact_no, '返工业务编号', MAX_FACT_NO_LENGTH)
  const reason = boundedText(values.reason, '返工原因', MAX_REASON_LENGTH)
  const occurredAt = optionalOccurredAt(values.occurred_at)
  return {
    fact_no: factNo,
    source_completion_fact_id: positiveID(source.id),
    quantity,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    reason,
  }
}

const PRODUCTION_REWORK_REQUEST_KEYS = new Set([
  'customer_key',
  'fact_no',
  'source_completion_fact_id',
  'quantity',
  'idempotency_key',
  'occurred_at',
  'reason',
])

export function normalizeProductionReworkRequest(params = {}) {
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    !Object.keys(params).every((key) => PRODUCTION_REWORK_REQUEST_KEYS.has(key))
  ) {
    throw invalidResponse('返工内容有误，请刷新页面后重新填写')
  }
  const sourceCompletionFactID = positiveID(params.source_completion_fact_id)
  const quantity = normalizePositiveNumeric20Scale6(params.quantity)
  const customerKey = normalizedText(params.customer_key)
  const idempotencyKey = normalizedText(params.idempotency_key)
  if (
    !sourceCompletionFactID ||
    !quantity ||
    !idempotencyKey ||
    [...idempotencyKey].length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    [...customerKey].length > 64
  ) {
    throw invalidResponse('返工内容有误，请刷新页面后重新填写')
  }
  const occurredAt = optionalOccurredAt(params.occurred_at)
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    fact_no: boundedText(params.fact_no, '返工业务编号', MAX_FACT_NO_LENGTH),
    source_completion_fact_id: sourceCompletionFactID,
    quantity,
    idempotency_key: idempotencyKey,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    reason: boundedText(params.reason, '返工原因', MAX_REASON_LENGTH),
  }
}

export function validateProductionReworkResult(result, request = {}) {
  const valid =
    positiveID(result?.id) > 0 &&
    normalizedUpperText(result?.status) === 'DRAFT' &&
    normalizedUpperText(result?.fact_type) === 'REWORK' &&
    normalizedUpperText(result?.subject_type) === 'PRODUCT' &&
    positiveID(result?.warehouse_id) > 0 &&
    positiveID(result?.unit_id) > 0 &&
    positiveID(result?.lot_id) > 0 &&
    normalizedUpperText(result?.source_type) === 'PRODUCTION_FACT' &&
    positiveID(result?.source_id) ===
      positiveID(request?.source_completion_fact_id) &&
    positiveID(result?.source_line_id) > 0 &&
    normalizedText(result?.fact_no) === normalizedText(request?.fact_no) &&
    normalizedText(result?.idempotency_key) ===
      normalizedText(request?.idempotency_key) &&
    normalizedText(result?.note) === normalizedText(request?.reason) &&
    sameQuantity(result?.quantity, request?.quantity)
  if (!valid) throw invalidResponse()
  return result
}

export function findProductionReworkResult(facts = [], request = {}) {
  const idempotencyKey = normalizedText(request?.idempotency_key)
  const factNo = normalizedText(request?.fact_no)
  const matched = (Array.isArray(facts) ? facts : []).find(
    (fact) =>
      (idempotencyKey && fact?.idempotency_key === idempotencyKey) ||
      (factNo && fact?.fact_no === factNo)
  )
  return matched ? validateProductionReworkResult(matched, request) : null
}

export function productionReworkFormValuesFromRequest(request = {}) {
  const occurredAt = normalizedText(request?.occurred_at)
  const date = occurredAt ? new Date(occurredAt) : null
  return {
    fact_no: normalizedText(request?.fact_no),
    quantity: normalizePositiveNumeric20Scale6(request?.quantity),
    occurred_at:
      date && Number.isFinite(date.getTime())
        ? localProductionReworkDateTimeInputValue(date)
        : '',
    reason: normalizedText(request?.reason),
  }
}
