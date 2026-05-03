const ITEM_HORIZONTAL_SCROLL_SPAN_WIDTH = 64
const DEFAULT_MONEY_UNIT_TEXT = 'CNY'

const NUMBER_FIELD_SPAN_BY_KEY = Object.freeze({
  quantity: 3,
  unit_price: 4,
  amount: 4,
})

const TEXT_FIELD_SPAN_BY_KEY = Object.freeze({
  item_name: 5,
  material_name: 5,
  spec: 5,
  unit: 2,
  supplier_name: 5,
  warehouse_location: 5,
  'payload.color': 3,
  'payload.material_unit': 2,
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
    return NUMBER_FIELD_SPAN_BY_KEY[field.key] || 3
  }
  return TEXT_FIELD_SPAN_BY_KEY[field.key] || 5
}

export function resolveBusinessRecordItemFieldWidth(field = {}) {
  return (
    resolveBusinessRecordItemDesktopSpan(field) *
    ITEM_HORIZONTAL_SCROLL_SPAN_WIDTH
  )
}

export function resolveBusinessRecordItemColStyle(field = {}) {
  const width = resolveBusinessRecordItemFieldWidth(field)
  return {
    flex: `0 0 ${width}px`,
    maxWidth: `${width}px`,
  }
}

export function resolveBusinessRecordItemRowMinWidth(fields = []) {
  return fields.reduce(
    (sum, field) => sum + resolveBusinessRecordItemFieldWidth(field),
    0
  )
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
