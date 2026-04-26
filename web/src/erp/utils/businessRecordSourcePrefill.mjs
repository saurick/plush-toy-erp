const toText = (value) => String(value ?? '').trim()

const SOURCE_PREFILL_MODULE_KEYS_BY_TARGET = Object.freeze({
  products: ['project-orders', 'material-bom'],
  'material-bom': ['project-orders', 'products'],
  'accessories-purchase': ['material-bom', 'project-orders'],
  'processing-contracts': ['material-bom', 'project-orders', 'products'],
  'production-scheduling': [
    'project-orders',
    'material-bom',
    'processing-contracts',
  ],
  'production-progress': ['production-scheduling', 'project-orders'],
  inbound: [
    'accessories-purchase',
    'processing-contracts',
    'production-progress',
  ],
  'shipping-release': ['project-orders', 'production-progress'],
  outbound: ['shipping-release'],
  reconciliation: ['accessories-purchase', 'processing-contracts', 'outbound'],
  payables: ['reconciliation', 'inbound'],
  receivables: ['outbound', 'shipping-release'],
  invoices: ['receivables', 'payables'],
})

const isPresent = (value) =>
  value !== undefined && value !== null && toText(value) !== ''

const payloadValue = (record = {}, key = '') => record?.payload?.[key]

const firstValue = (...values) => values.find(isPresent)

const formFieldKeysOf = (definition = {}) =>
  new Set(
    (definition.formFields || []).map((field) => field.key).filter(Boolean)
  )

function copyItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }))
}

function setSupportedValue(values, supportedKeys, key, value) {
  if (!key || !supportedKeys.has(key) || !isPresent(value)) return
  values[key] = value
}

function sourceTitle(record = {}) {
  return firstValue(record.product_name, record.title, record.document_no)
}

function defaultTargetTitle(targetModuleKey, sourceRecord = {}) {
  const title = sourceTitle(sourceRecord)
  if (!title) return undefined
  switch (targetModuleKey) {
    case 'material-bom':
      return `${title} BOM`
    case 'accessories-purchase':
      return `${title} 辅材/包材采购`
    case 'processing-contracts':
      return `${title} 委外加工`
    case 'production-scheduling':
      return `${title} 排产`
    case 'production-progress':
      return `${title} 生产进度`
    default:
      return title
  }
}

function isAccessoryOrPackagingItem(item = {}) {
  const category = toText(payloadValue(item, 'material_category')).toLowerCase()
  return ['accessory', 'packaging'].includes(category)
}

function buildAccessoryItemsFromBom(sourceRecord = {}, baseItems = []) {
  const sourceItems = Array.isArray(sourceRecord.items)
    ? sourceRecord.items
    : []
  const items = sourceItems.filter(isAccessoryOrPackagingItem).map((item) => ({
    material_name: item.material_name || '',
    'payload.supplier_item_no': payloadValue(item, 'supplier_item_no') || '',
    spec: item.spec || '',
    quantity: item.quantity ?? null,
    unit: item.unit || '',
    supplier_name: item.supplier_name || '',
    'payload.supplier_short_name':
      payloadValue(item, 'supplier_short_name') || '',
    item_name: item.item_name || '',
  }))
  return items.length > 0 ? items : copyItems(baseItems)
}

function applyCommonSourceValues(values, supportedKeys, sourceRecord = {}) {
  setSupportedValue(
    values,
    supportedKeys,
    'source_no',
    sourceRecord.document_no
  )
  setSupportedValue(
    values,
    supportedKeys,
    'customer_name',
    sourceRecord.customer_name
  )
  setSupportedValue(values, supportedKeys, 'style_no', sourceRecord.style_no)
  setSupportedValue(
    values,
    supportedKeys,
    'product_no',
    sourceRecord.product_no
  )
  setSupportedValue(
    values,
    supportedKeys,
    'product_name',
    sourceRecord.product_name
  )
  setSupportedValue(values, supportedKeys, 'due_date', sourceRecord.due_date)
  setSupportedValue(
    values,
    supportedKeys,
    'payload.product_order_no',
    firstValue(
      payloadValue(sourceRecord, 'product_order_no'),
      sourceRecord.source_no,
      sourceRecord.document_no
    )
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.customer_order_no',
    sourceRecord.source_no
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.color',
    payloadValue(sourceRecord, 'color')
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.category',
    payloadValue(sourceRecord, 'category')
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.designer_name',
    payloadValue(sourceRecord, 'designer_name')
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.business_owner',
    payloadValue(sourceRecord, 'business_owner')
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.image_ref',
    payloadValue(sourceRecord, 'image_ref')
  )
  setSupportedValue(
    values,
    supportedKeys,
    'payload.order_unit_price',
    payloadValue(sourceRecord, 'order_unit_price')
  )
}

function applyModuleSpecificSourceValues(
  values,
  supportedKeys,
  sourceRecord = {},
  targetModuleKey = ''
) {
  setSupportedValue(
    values,
    supportedKeys,
    'title',
    defaultTargetTitle(targetModuleKey, sourceRecord)
  )

  if (
    [
      'material-bom',
      'processing-contracts',
      'production-scheduling',
      'production-progress',
    ].includes(targetModuleKey)
  ) {
    setSupportedValue(values, supportedKeys, 'quantity', sourceRecord.quantity)
    setSupportedValue(values, supportedKeys, 'unit', sourceRecord.unit)
  }

  if (targetModuleKey === 'products') {
    setSupportedValue(
      values,
      supportedKeys,
      'title',
      firstValue(sourceRecord.product_name, sourceRecord.title)
    )
    setSupportedValue(
      values,
      supportedKeys,
      'product_name',
      sourceRecord.product_name
    )
  }
}

export function getBusinessRecordSourcePrefillModuleKeys(targetModuleKey = '') {
  const keys = SOURCE_PREFILL_MODULE_KEYS_BY_TARGET[targetModuleKey]
  return Array.isArray(keys) ? [...keys] : []
}

export function getDefaultBusinessRecordSourcePrefillModuleKey(
  targetModuleKey = ''
) {
  return getBusinessRecordSourcePrefillModuleKeys(targetModuleKey)[0] || ''
}

export function shouldClearBusinessRecordSourcePrefill({
  appliedModuleKey = '',
  appliedKeyword = '',
  nextModuleKey,
  nextKeyword,
} = {}) {
  const normalizedAppliedModuleKey = toText(appliedModuleKey)
  const normalizedAppliedKeyword = toText(appliedKeyword)
  if (!normalizedAppliedModuleKey && !normalizedAppliedKeyword) return false
  if (
    nextModuleKey !== undefined &&
    toText(nextModuleKey) !== normalizedAppliedModuleKey
  ) {
    return true
  }
  if (
    nextKeyword !== undefined &&
    toText(nextKeyword) !== normalizedAppliedKeyword
  ) {
    return true
  }
  return false
}

export function resolveBusinessRecordSourceRecord(records = [], keyword = '') {
  const normalizedKeyword = toText(keyword)
  if (!normalizedKeyword) return null
  return (
    (Array.isArray(records) ? records : []).find(
      (record) =>
        toText(record?.document_no) === normalizedKeyword ||
        toText(record?.source_no) === normalizedKeyword
    ) || null
  )
}

export function buildBusinessRecordSourcePrefillValues({
  baseValues = {},
  sourceRecord = null,
  targetModuleKey = '',
  targetDefinition = {},
} = {}) {
  const values = {
    ...baseValues,
    items: copyItems(baseValues.items),
  }
  if (!sourceRecord) return values

  const supportedKeys = new Set([
    ...Object.keys(values),
    ...formFieldKeysOf(targetDefinition),
  ])
  applyCommonSourceValues(values, supportedKeys, sourceRecord)
  applyModuleSpecificSourceValues(
    values,
    supportedKeys,
    sourceRecord,
    targetModuleKey
  )

  if (
    targetModuleKey === 'accessories-purchase' &&
    sourceRecord.module_key === 'material-bom'
  ) {
    values.items = buildAccessoryItemsFromBom(sourceRecord, values.items)
  }

  return values
}
