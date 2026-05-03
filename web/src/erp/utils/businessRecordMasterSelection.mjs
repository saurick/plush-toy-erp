const compactText = (value) => String(value ?? '').trim()

const firstPresentText = (...values) =>
  values.map(compactText).find(Boolean) || ''

const firstLineText = (value) =>
  compactText(value).split('\n').map(compactText).find(Boolean) || ''

export function isMasterRecordField(field = {}) {
  return field.type === 'master-record' && field.sourceModuleKey
}

export function isHiddenFormField(field = {}) {
  return field.type === 'hidden'
}

function getRecordPayload(record = {}) {
  return record?.payload && typeof record.payload === 'object'
    ? record.payload
    : {}
}

export function buildMasterRecordOption(record = {}) {
  const payload = getRecordPayload(record)
  const label = [
    record.document_no,
    record.title || record.product_name,
    payload.partner_type || payload.product_category,
  ]
    .map(compactText)
    .filter(Boolean)
    .join(' / ')
  return {
    label: label || `记录 ${record.id}`,
    value: String(record.id),
  }
}

export function filterMasterRecordsByField(records = [], field = {}) {
  if (!Array.isArray(field.partnerTypes) || field.partnerTypes.length === 0) {
    return records
  }
  const allowedTypes = new Set(field.partnerTypes)
  return records.filter((record) =>
    allowedTypes.has(compactText(getRecordPayload(record).partner_type))
  )
}

export function findMasterRecord(recordId, records = []) {
  const normalizedID = compactText(recordId)
  if (!normalizedID) return null
  return records.find((record) => String(record.id) === normalizedID) || null
}

function buildPartnerSnapshotValues(kind, record) {
  const payload = getRecordPayload(record)
  const prefix = kind === 'supplier' ? 'supplier' : 'customer'
  const nameKey = kind === 'supplier' ? 'supplier_name' : 'customer_name'
  const primaryPhone = firstPresentText(
    payload.contact_phone,
    firstLineText(payload.office_phone_summary),
    firstLineText(payload.mobile_phone_summary)
  )
  return {
    [nameKey]: firstPresentText(record.title, payload.short_name),
    [`payload.${prefix}_record_code`]: compactText(record.document_no),
    [`payload.${prefix}_partner_type`]: compactText(payload.partner_type),
    [`payload.${prefix}_country_region`]: compactText(payload.country_region),
    [`payload.${prefix}_payment_method`]: compactText(payload.payment_method),
    [`payload.${prefix}_payment_cycle_days`]: payload.payment_cycle_days ?? '',
    [`payload.${prefix}_tax_no`]: compactText(payload.tax_no),
    [`payload.${prefix}_address`]: compactText(payload.address),
    [`payload.${prefix}_contact_name`]: firstPresentText(
      payload.contact_name,
      firstLineText(payload.contact_summary)
    ),
    [`payload.${prefix}_contact_phone`]: primaryPhone,
  }
}

function buildProductSnapshotValues(record) {
  const payload = getRecordPayload(record)
  return {
    product_no: firstPresentText(record.product_no),
    product_name: firstPresentText(
      record.product_name,
      payload.cn_desc,
      record.title
    ),
    style_no: compactText(record.style_no),
    'payload.category': firstPresentText(
      payload.product_category,
      payload.category
    ),
    'payload.product_record_code': compactText(record.document_no),
    'payload.product_category': compactText(payload.product_category),
    'payload.hs_code': compactText(payload.hs_code),
    'payload.spec_code': compactText(payload.spec_code),
    'payload.en_desc': compactText(payload.en_desc),
    'payload.attachment_ref': compactText(payload.attachment_ref),
  }
}

function buildEmptyMasterSnapshotValues(field = {}) {
  if (field.masterRecordKind === 'product') {
    return buildProductSnapshotValues({})
  }
  if (field.masterRecordKind === 'supplier') {
    return buildPartnerSnapshotValues('supplier', {})
  }
  return buildPartnerSnapshotValues('customer', {})
}

export function buildMasterRecordLinkedValues(record, field = {}) {
  if (!record) {
    return {
      [field.key]: '',
      ...buildEmptyMasterSnapshotValues(field),
    }
  }
  if (field.masterRecordKind === 'product') {
    return {
      [field.key]: String(record.id),
      ...buildProductSnapshotValues(record),
    }
  }
  if (field.masterRecordKind === 'supplier') {
    return {
      [field.key]: String(record.id),
      ...buildPartnerSnapshotValues('supplier', record),
    }
  }
  return {
    [field.key]: String(record.id),
    ...buildPartnerSnapshotValues('customer', record),
  }
}
