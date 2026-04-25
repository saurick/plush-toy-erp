export const ITEM_FIELD_KEYS = Object.freeze([
  'item_name',
  'material_name',
  'spec',
  'unit',
  'quantity',
  'unit_price',
  'amount',
  'supplier_name',
  'warehouse_location',
])

export const ITEM_NUMBER_FIELDS = new Set(['quantity', 'unit_price', 'amount'])

function itemFieldsOf(definition = {}) {
  return Array.isArray(definition.itemFields) ? definition.itemFields : []
}

function formFieldsOf(definition = {}) {
  return Array.isArray(definition.formFields) ? definition.formFields : []
}

export function isPayloadFieldKey(key) {
  return String(key || '').startsWith('payload.')
}

export function getPayloadFieldName(key) {
  return isPayloadFieldKey(key) ? String(key).slice('payload.'.length) : ''
}

function itemFieldKeysOf(itemFields = []) {
  return new Set(itemFields.map((field) => field.key))
}

function roundAmount(value) {
  if (!Number.isFinite(value)) return undefined
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatMetric(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

export function normalizeString(value) {
  const text = String(value ?? '').trim()
  return text || undefined
}

export function normalizeDate(value) {
  if (!value) return undefined
  if (typeof value?.format === 'function') return value.format('YYYY-MM-DD')
  return normalizeString(value)
}

export function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function createBlankItem(definition = {}) {
  return Object.fromEntries(
    itemFieldsOf(definition).map((field) => [
      field.key,
      field.type === 'number' ? null : '',
    ])
  )
}

export function createBlankFieldValue(field = {}) {
  return field.type === 'number' ? null : ''
}

export function getBusinessRecordFieldValue(record = {}, fieldKey = '') {
  if (isPayloadFieldKey(fieldKey)) {
    const payloadKey = getPayloadFieldName(fieldKey)
    return record?.payload?.[payloadKey]
  }
  return record?.[fieldKey]
}

export function calculateItemAmount(item = {}) {
  const quantity = normalizeNumber(item.quantity)
  const unitPrice = normalizeNumber(item.unit_price)
  if (quantity === undefined || unitPrice === undefined) return undefined
  return roundAmount(quantity * unitPrice)
}

function normalizeRecordItem(item = {}, itemFieldKeys = new Set()) {
  const normalized = {
    line_no: 0,
    payload: {},
  }

  ITEM_FIELD_KEYS.forEach((key) => {
    if (!itemFieldKeys.has(key)) return
    if (key === 'amount') {
      normalized.amount =
        normalizeNumber(item.amount) ?? calculateItemAmount(item)
      return
    }
    normalized[key] = ITEM_NUMBER_FIELDS.has(key)
      ? normalizeNumber(item[key])
      : normalizeString(item[key])
  })

  return normalized
}

function hasRecordItemValue(item = {}) {
  return ITEM_FIELD_KEYS.some((key) => {
    const value = item[key]
    return value !== undefined && value !== null && value !== ''
  })
}

export function normalizeRecordItems(items = [], itemFields = []) {
  const itemFieldKeys = itemFieldKeysOf(itemFields)
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeRecordItem(item, itemFieldKeys))
    .filter(hasRecordItemValue)
    .map((item, index) => ({
      ...item,
      line_no: index + 1,
    }))
}

export function summarizeNormalizedItems(items = []) {
  return items.reduce(
    (summary, item) => {
      const quantity = normalizeNumber(item.quantity)
      const amount = normalizeNumber(item.amount)
      if (quantity !== undefined) {
        summary.hasQuantity = true
        summary.quantity += quantity
      }
      if (amount !== undefined) {
        summary.hasAmount = true
        summary.amount += amount
      }
      summary.rowCount += 1
      return summary
    },
    {
      rowCount: 0,
      hasQuantity: false,
      quantity: 0,
      hasAmount: false,
      amount: 0,
    }
  )
}

export function summarizeRecordItems(items = [], itemFields = []) {
  return summarizeNormalizedItems(normalizeRecordItems(items, itemFields))
}

function resolveNumberWithSummary(value, summaryValue, hasSummary) {
  const normalized = normalizeNumber(value)
  if (normalized !== undefined) return normalized
  return hasSummary ? summaryValue : undefined
}

function normalizeFieldValue(value, field = {}) {
  if (field.type === 'number') return normalizeNumber(value)
  if (field.type === 'date') return normalizeDate(value)
  return normalizeString(value)
}

function buildPayloadFromDefinition(
  values = {},
  moduleItem = {},
  definition = {}
) {
  const payload = {
    note: normalizeString(values.note) || '',
    module_title: moduleItem.title,
    section_key: moduleItem.sectionKey,
  }

  formFieldsOf(definition).forEach((field) => {
    const payloadKey = getPayloadFieldName(field.key)
    if (!payloadKey) return
    const rawValue =
      values[field.key] !== undefined
        ? values[field.key]
        : values.payload?.[payloadKey]
    const normalizedValue = normalizeFieldValue(rawValue, field)
    if (normalizedValue !== undefined) {
      payload[payloadKey] = normalizedValue
    }
  })

  return payload
}

export function buildBusinessRecordParams(
  values,
  moduleItem,
  definition,
  editingRecord
) {
  const normalizedItems = normalizeRecordItems(
    values.items,
    itemFieldsOf(definition)
  )
  const itemSummary = summarizeNormalizedItems(normalizedItems)

  return {
    id: editingRecord?.id,
    module_key: moduleItem.key,
    document_no: normalizeString(values.document_no),
    title: normalizeString(values.title) || `${moduleItem.title}记录`,
    source_no: normalizeString(values.source_no),
    customer_name: normalizeString(values.customer_name),
    supplier_name: normalizeString(values.supplier_name),
    style_no: normalizeString(values.style_no),
    product_no: normalizeString(values.product_no),
    product_name: normalizeString(values.product_name),
    material_name: normalizeString(values.material_name),
    warehouse_location: normalizeString(values.warehouse_location),
    quantity: resolveNumberWithSummary(
      values.quantity,
      itemSummary.quantity,
      itemSummary.hasQuantity
    ),
    unit: normalizeString(values.unit),
    amount: resolveNumberWithSummary(
      values.amount,
      roundAmount(itemSummary.amount),
      itemSummary.hasAmount
    ),
    document_date: normalizeDate(values.document_date),
    due_date: normalizeDate(values.due_date),
    business_status_key: values.business_status_key,
    owner_role_key: values.owner_role_key,
    row_version: editingRecord?.row_version,
    payload: buildPayloadFromDefinition(values, moduleItem, definition),
    items: normalizedItems,
  }
}

export function buildBusinessRecordStatusUpdateParams(
  record,
  nextStatusKey,
  moduleItem,
  definition,
  options = {}
) {
  if (!record || !nextStatusKey) return null
  const params = buildBusinessRecordParams(
    {
      ...record,
      business_status_key: nextStatusKey,
      note: record.payload?.note || '',
      items: Array.isArray(record.items) ? record.items : [],
    },
    moduleItem,
    definition,
    record
  )
  params.payload = {
    ...(record.payload && typeof record.payload === 'object'
      ? record.payload
      : {}),
    ...(params.payload || {}),
  }
  const reason = normalizeString(options.reason)
  if (reason) {
    params.payload = {
      ...params.payload,
      status_reason: reason,
      status_reason_key: nextStatusKey,
    }
  }
  return params
}
