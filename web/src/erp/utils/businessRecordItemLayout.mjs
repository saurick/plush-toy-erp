const ITEM_HORIZONTAL_SCROLL_SPAN_WIDTH = 64
const DEFAULT_MONEY_UNIT_TEXT = 'CNY'

const NUMBER_FIELD_SPAN_BY_KEY = Object.freeze({
  quantity: 4,
  unit_price: 4,
  amount: 4,
})

const TEXT_FIELD_SPAN_BY_KEY = Object.freeze({
  spec: 5,
  unit: 3,
  supplier_name: 5,
  warehouse_location: 5,
})

const MONEY_ITEM_FIELD_KEYS = new Set(['unit_price', 'amount'])

function clampItemSpan(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(1, Math.min(Math.round(numeric), 24))
}

function normalizeUnitText(value) {
  return String(value ?? '').trim()
}

export function resolveBusinessRecordItemDesktopSpan(field = {}) {
  if (field.span !== undefined) return clampItemSpan(field.span, 6)
  if (field.type === 'number') {
    return NUMBER_FIELD_SPAN_BY_KEY[field.key] || 4
  }
  return TEXT_FIELD_SPAN_BY_KEY[field.key] || 6
}

export function resolveBusinessRecordItemRowMinWidth(fields = []) {
  const spanBudget = fields.reduce(
    (sum, field) => sum + resolveBusinessRecordItemDesktopSpan(field),
    0
  )
  return Math.max(0, spanBudget * ITEM_HORIZONTAL_SCROLL_SPAN_WIDTH)
}

export function resolveBusinessRecordItemUnitText(field = {}, rowValues = {}) {
  if (typeof field.unit === 'function') {
    return normalizeUnitText(field.unit({ rowValues }))
  }
  if (field.unit !== undefined) {
    return normalizeUnitText(field.unit)
  }
  if (field.key === 'quantity') {
    return normalizeUnitText(rowValues.unit)
  }
  if (MONEY_ITEM_FIELD_KEYS.has(field.key)) {
    return DEFAULT_MONEY_UNIT_TEXT
  }
  return ''
}
