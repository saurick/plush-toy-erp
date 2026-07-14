import { effectiveSessionAllowsAction } from './adminProfileSync.mjs'
import { normalizeMaterialPurchaseUnitText } from './materialPurchaseContractEditor.mjs'

export const V1_ROUTE_PATHS = Object.freeze({
  customers: '/erp/master/partners/customers',
  suppliers: '/erp/master/partners/suppliers',
  materials: '/erp/master/materials',
  processes: '/erp/engineering/processes',
  salesOrders: '/erp/sales/project-orders/sales-orders',
  purchaseOrders: '/erp/purchase/accessories',
  purchaseReceipts: '/erp/warehouse/inbound',
  qualityInspections: '/erp/production/quality-inspections',
  inventory: '/erp/warehouse/inventory',
  processingContracts: '/erp/purchase/processing-contracts',
  productionProgress: '/erp/production/progress',
  outbound: '/erp/warehouse/outbound',
  shipments: '/erp/warehouse/shipments',
  receivables: '/erp/finance/receivables',
  payables: '/erp/finance/payables',
  invoices: '/erp/finance/invoices',
  reconciliation: '/erp/finance/reconciliation',
})

export const SALES_ORDER_STATUS_LABELS = Object.freeze({
  draft: '草稿',
  submitted: '已提交',
  active: '已生效',
  closed: '已关闭',
  canceled: '已取消',
})

export const SALES_ORDER_STATUS_COLORS = Object.freeze({
  draft: 'default',
  submitted: 'blue',
  active: 'green',
  closed: 'purple',
  canceled: 'red',
})

export const SALES_ORDER_ITEM_STATUS_LABELS = Object.freeze({
  open: '未关闭',
  closed: '已关闭',
  canceled: '已取消',
})

export const DEFAULT_PAYMENT_CONDITIONS = Object.freeze([
  Object.freeze({ method: '现结', termDays: 0 }),
  Object.freeze({ method: '30天月结', termDays: 30 }),
  Object.freeze({ method: '60天月结', termDays: 60 }),
])

export const PURCHASE_ORDER_STATUS_LABELS = Object.freeze({
  draft: '草稿',
  submitted: '已提交',
  approved: '已审核',
  closed: '已关闭',
  canceled: '已取消',
})

export const PURCHASE_ORDER_STATUS_COLORS = Object.freeze({
  draft: 'default',
  submitted: 'blue',
  approved: 'green',
  closed: 'purple',
  canceled: 'red',
})

export const PURCHASE_ORDER_ITEM_STATUS_LABELS = Object.freeze({
  open: '未关闭',
  closed: '已关闭',
  canceled: '已取消',
})

export const OUTSOURCING_ORDER_STATUS_LABELS = Object.freeze({
  draft: '草稿',
  submitted: '已提交',
  confirmed: '已确认',
  closed: '已关闭',
  canceled: '已取消',
})

export const OUTSOURCING_ORDER_STATUS_COLORS = Object.freeze({
  draft: 'default',
  submitted: 'blue',
  confirmed: 'green',
  closed: 'purple',
  canceled: 'red',
})

export const OUTSOURCING_ORDER_ITEM_STATUS_LABELS = Object.freeze({
  open: '未关闭',
  closed: '已关闭',
  canceled: '已取消',
})

export const OUTSOURCING_ORDER_SUBJECT_TYPES = Object.freeze({
  PRODUCT: 'PRODUCT',
  MATERIAL: 'MATERIAL',
})

export function normalizeOutsourcingOrderSubjectType(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  return Object.values(OUTSOURCING_ORDER_SUBJECT_TYPES).includes(normalized)
    ? normalized
    : undefined
}

const SALES_ORDER_LIFECYCLE_ACTIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'canceled']),
  submitted: Object.freeze(['active', 'canceled']),
  active: Object.freeze(['closed', 'canceled']),
})

const PURCHASE_ORDER_LIFECYCLE_ACTIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'canceled']),
  submitted: Object.freeze(['approved', 'canceled']),
  approved: Object.freeze(['closed', 'canceled']),
})

const OUTSOURCING_ORDER_LIFECYCLE_ACTIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'canceled']),
  submitted: Object.freeze(['confirmed', 'canceled']),
  confirmed: Object.freeze(['closed', 'canceled']),
})

function normalizeLifecycleStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function canRunLifecycleAction(transitions, currentStatus, nextStatus) {
  const current = normalizeLifecycleStatus(currentStatus)
  const next = normalizeLifecycleStatus(nextStatus)
  return (
    Array.isArray(transitions[current]) && transitions[current].includes(next)
  )
}

export function canRunSalesOrderLifecycleAction(currentStatus, nextStatus) {
  return canRunLifecycleAction(
    SALES_ORDER_LIFECYCLE_ACTIONS,
    currentStatus,
    nextStatus
  )
}

export function canRunPurchaseOrderLifecycleAction(currentStatus, nextStatus) {
  return canRunLifecycleAction(
    PURCHASE_ORDER_LIFECYCLE_ACTIONS,
    currentStatus,
    nextStatus
  )
}

export function canRunOutsourcingOrderLifecycleAction(
  currentStatus,
  nextStatus
) {
  return canRunLifecycleAction(
    OUTSOURCING_ORDER_LIFECYCLE_ACTIONS,
    currentStatus,
    nextStatus
  )
}

export function hasActionPermission(admin = {}, permissionKey = '') {
  if (!permissionKey) {
    return false
  }
  const rbacAllowed =
    admin?.is_super_admin === true ||
    (Array.isArray(admin?.permissions)
      ? admin.permissions.includes(permissionKey)
      : false)
  return rbacAllowed && effectiveSessionAllowsAction(admin, permissionKey)
}

export function trimOptional(value) {
  const text = String(value ?? '').trim()
  return text || undefined
}

export function normalizeOptionalDecimalString(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export function formatProductUnitNetWeight(value, unitLabel = '默认单位') {
  const weight = String(value ?? '').trim()
  if (!weight) {
    return '-'
  }
  const label = String(unitLabel || '').trim() || '默认单位'
  return `${weight} kg / ${label}`
}

export function normalizeOptionalNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined
  }
  return Math.trunc(numeric)
}

function normalizeOptionalPositiveInteger(value) {
  const normalized = normalizeOptionalNonNegativeInteger(value)
  return normalized && normalized > 0 ? normalized : undefined
}

function normalizeLineNo(primaryValue, fallbackValue) {
  const normalized = normalizeOptionalNonNegativeInteger(primaryValue)
  if (normalized && normalized > 0) {
    return normalized
  }
  const fallback = normalizeOptionalNonNegativeInteger(fallbackValue)
  return fallback && fallback > 0 ? fallback : 1
}

function parseUnsignedDecimal(value) {
  const text = String(value ?? '')
    .replace(/,/g, '')
    .trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return null
  }
  const [integerText = '0', fractionText = ''] = text.split('.')
  const digits = `${integerText || '0'}${fractionText}`.replace(/^0+(?=\d)/, '')
  return {
    value: BigInt(digits || '0'),
    scale: fractionText.length,
  }
}

function pow10(scale) {
  return BigInt(10) ** BigInt(scale)
}

function trimDecimalZeros(text, minFractionDigits = 2) {
  const source = String(text)
  const [integerPart, fractionPart = ''] = source.split('.')
  let fraction = fractionPart
  while (fraction.length > minFractionDigits && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1)
  }
  while (fraction.length < minFractionDigits) {
    fraction += '0'
  }
  return fraction ? `${integerPart}.${fraction}` : integerPart
}

function formatFixedMinorUnits(value, fractionDigits) {
  if (fractionDigits <= 0) {
    return String(value)
  }
  const text = String(value).padStart(fractionDigits + 1, '0')
  const integerPart = text.slice(0, -fractionDigits)
  const fractionPart = text.slice(-fractionDigits)
  return `${integerPart}.${fractionPart}`
}

function multiplyUnsignedDecimalToFixed(left, right, fractionDigits = 6) {
  const leftDecimal = parseUnsignedDecimal(left)
  const rightDecimal = parseUnsignedDecimal(right)
  if (!leftDecimal || !rightDecimal) {
    return undefined
  }
  const rawValue = leftDecimal.value * rightDecimal.value
  const rawScale = leftDecimal.scale + rightDecimal.scale
  if (rawScale <= fractionDigits) {
    return trimDecimalZeros(formatFixedMinorUnits(rawValue, rawScale))
  }
  const divisor = pow10(rawScale)
  const targetMultiplier = pow10(fractionDigits)
  const scaledValue = rawValue * targetMultiplier
  let roundedValue = scaledValue / divisor
  if ((scaledValue % divisor) * BigInt(2) >= divisor) {
    roundedValue += BigInt(1)
  }
  return trimDecimalZeros(formatFixedMinorUnits(roundedValue, fractionDigits))
}

function deriveOrderItemAmount(values, quantityField) {
  const sourceValues = values || {}
  return (
    multiplyUnsignedDecimalToFixed(
      sourceValues[quantityField],
      sourceValues.unit_price
    ) || trimOptional(sourceValues.amount)
  )
}

export function deriveSalesOrderItemAmount(values = {}) {
  return deriveOrderItemAmount(values, 'ordered_quantity')
}

export function derivePurchaseOrderItemAmount(values = {}) {
  return deriveOrderItemAmount(values, 'purchased_quantity')
}

export function deriveOutsourcingOrderItemAmount(values = {}) {
  return deriveOrderItemAmount(values, 'outsourcing_quantity')
}

function decimalNumber(value) {
  const numeric = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(numeric) ? numeric : 0
}

function snapshotDecimalNumber(snapshot, keys) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const value = keys
    .map((key) => source[key])
    .find((item) => String(item ?? '').trim() !== '')
  return decimalNumber(value)
}

export function summarizeSalesOrderLines(lines = [], snapshot = {}) {
  const items = Array.isArray(lines) ? lines : []
  if (items.length === 0) {
    return {
      count: snapshotDecimalNumber(snapshot, [
        'count',
        'item_count',
        'line_count',
      ]),
      quantity: snapshotDecimalNumber(snapshot, [
        'quantity',
        'header_quantity',
        'quantity_total',
        'total_quantity',
      ]),
      amount: snapshotDecimalNumber(snapshot, [
        'amount',
        'header_amount',
        'amount_total',
        'total_amount',
      ]),
    }
  }
  return items.reduce(
    (summary, line) => ({
      count: summary.count + 1,
      quantity: summary.quantity + decimalNumber(line?.ordered_quantity),
      amount:
        summary.amount + decimalNumber(deriveSalesOrderItemAmount(line) || 0),
    }),
    { count: 0, quantity: 0, amount: 0 }
  )
}

export function compactParams(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  )
}

export function formatUnixDate(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '-'
  }
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatUnixDateTime(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '-'
  }
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function unixToDateInputValue(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return ''
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function optionalFormValue(value) {
  return value === null || value === undefined ? '' : value
}

export function createBlankOutsourcingLine(lineNo = 1) {
  return {
    line_no: lineNo,
    subject_type: OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT,
    product_id: undefined,
    material_id: undefined,
    process_id: undefined,
    unit_id: undefined,
    product_no_snapshot: '',
    product_order_no_snapshot: '',
    product_name_snapshot: '',
    material_code_snapshot: '',
    material_name_snapshot: '',
    process_name_snapshot: '',
    process_category_snapshot: '',
    unit_name_snapshot: '',
    outsourcing_quantity: '',
    unit_price: '',
    amount: '',
    expected_return_date: '',
    note: '',
  }
}

export function normalizeOutsourcingLineFormValue(item = {}) {
  const subjectType = normalizeOutsourcingOrderSubjectType(item.subject_type)
  const isProduct = subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
  const isMaterial = subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
  return {
    id: item.id,
    line_no: item.line_no,
    subject_type: subjectType,
    product_id: isProduct ? item.product_id : undefined,
    material_id: isMaterial ? item.material_id : undefined,
    process_id: item.process_id,
    unit_id: item.unit_id,
    product_no_snapshot: isProduct ? item.product_no_snapshot || '' : '',
    product_order_no_snapshot: isProduct
      ? item.product_order_no_snapshot || ''
      : '',
    product_name_snapshot: isProduct ? item.product_name_snapshot || '' : '',
    material_code_snapshot: isMaterial ? item.material_code_snapshot || '' : '',
    material_name_snapshot: isMaterial ? item.material_name_snapshot || '' : '',
    process_name_snapshot: item.process_name_snapshot || '',
    process_category_snapshot: item.process_category_snapshot || '',
    unit_name_snapshot: item.unit_name_snapshot || '',
    outsourcing_quantity: optionalFormValue(item.outsourcing_quantity),
    unit_price: optionalFormValue(item.unit_price),
    amount: optionalFormValue(item.amount),
    expected_return_date: unixToDateInputValue(item.expected_return_date),
    note: item.note || '',
    line_status: item.line_status,
  }
}

export function statusText(status, labels = {}, fallback = '业务状态') {
  const key = String(status || '').trim()
  if (!key) return '-'
  return labels[key] || fallback
}

export function formatUnitDisplayName(unitID, unitByID = new Map()) {
  const normalizedID = Number(unitID || 0)
  if (!Number.isFinite(normalizedID) || normalizedID <= 0) {
    return '-'
  }
  const unit = unitByID instanceof Map ? unitByID.get(normalizedID) : null
  if (!unit) {
    return '单位已关联'
  }
  const name = trimOptional(unit.name)
  const code = trimOptional(unit.code)
  if (name && code && name !== code) {
    return `${name}（${code}）`
  }
  return name || code || '单位已关联'
}

function shortDemoUnitName(name) {
  const text = trimOptional(name)
  const matched = text.match(/^核心演示单位[-－]\s*(.+)$/)
  return matched?.[1]?.trim() || text
}

function shortUnitCode(code) {
  const text = trimOptional(code)
  if (!text) return ''
  if (text.startsWith('SIM-')) {
    return text.split('-').filter(Boolean).at(-1) || text
  }
  return text.length <= 8 ? text : ''
}

export function formatUnitShortDisplayName(unitID, unitByID = new Map()) {
  const normalizedID = Number(unitID || 0)
  if (!Number.isFinite(normalizedID) || normalizedID <= 0) {
    return '-'
  }
  const unit = unitByID instanceof Map ? unitByID.get(normalizedID) : null
  if (!unit) {
    return '单位已关联'
  }
  const name = shortDemoUnitName(unit.name)
  const code = shortUnitCode(unit.code)
  if (name && code && name !== code) {
    return `${name}（${code}）`
  }
  return name || code || '单位已关联'
}

export function buildUnitSelectOptions(units = []) {
  const activeUnits = Array.isArray(units)
    ? units.filter((unit) => unit?.is_active !== false)
    : []
  const unitByID = new Map(
    activeUnits
      .map((unit) => [Number(unit?.id || 0), unit])
      .filter(([unitID]) => Number.isFinite(unitID) && unitID > 0)
  )
  return activeUnits
    .map((unit) => {
      const value = Number(unit?.id || 0)
      if (!Number.isFinite(value) || value <= 0) {
        return null
      }
      const label = formatUnitShortDisplayName(value, unitByID)
      const fullLabel = formatUnitDisplayName(value, unitByID)
      return {
        value,
        label,
        suffixLabel: label,
        searchText: [label, fullLabel].filter(Boolean).join(' '),
        title: fullLabel,
        precision: normalizeOptionalNonNegativeInteger(unit?.precision) ?? 0,
      }
    })
    .filter(Boolean)
}

export function buildTextSelectOptions(records = [], fieldName = '') {
  const seen = new Set()
  return (Array.isArray(records) ? records : [])
    .map((record) => trimOptional(record?.[fieldName]))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false
      }
      seen.add(value)
      return true
    })
    .map((value) => ({ value, label: value }))
}

export function buildPaymentConditionOptions(
  records = [],
  {
    methodField = 'default_payment_method',
    termDaysField = 'default_payment_term_days',
  } = {}
) {
  const byMethod = new Map()
  const addOption = (method, termDays) => {
    const value = trimOptional(method)
    if (!value || byMethod.has(value)) {
      return
    }
    const normalizedDays = normalizeOptionalNonNegativeInteger(termDays)
    byMethod.set(value, {
      value,
      label:
        normalizedDays === undefined ? value : `${value} / ${normalizedDays}天`,
      payment_term_days: normalizedDays,
    })
  }

  DEFAULT_PAYMENT_CONDITIONS.forEach((condition) =>
    addOption(condition.method, condition.termDays)
  )
  ;(Array.isArray(records) ? records : []).forEach((record) =>
    addOption(record?.[methodField], record?.[termDaysField])
  )
  return [...byMethod.values()]
}

export function mergePaymentConditionOptions(...optionGroups) {
  const byMethod = new Map()
  optionGroups.flat().forEach((option) => {
    const value = trimOptional(option?.value)
    if (!value || byMethod.has(value)) {
      return
    }
    const normalizedDays = normalizeOptionalNonNegativeInteger(
      option?.payment_term_days
    )
    byMethod.set(value, {
      ...option,
      value,
      label:
        option?.label ||
        (normalizedDays === undefined
          ? value
          : `${value} / ${normalizedDays}天`),
      payment_term_days: normalizedDays,
    })
  })
  return [...byMethod.values()]
}

export function resolvePaymentTermDays(method, options = []) {
  const value = trimOptional(method)
  if (!value) {
    return undefined
  }
  const matched = (Array.isArray(options) ? options : []).find(
    (option) => trimOptional(option?.value) === value
  )
  return normalizeOptionalNonNegativeInteger(matched?.payment_term_days)
}

export function paymentConditionCompleteness({ method, termDays } = {}) {
  const hasMethod = Boolean(trimOptional(method))
  const hasTermDays =
    termDays !== undefined &&
    termDays !== null &&
    String(termDays).trim() !== ''
  return {
    hasMethod,
    hasTermDays,
    methodRequired: !hasMethod && hasTermDays,
    termDaysRequired: hasMethod && !hasTermDays,
  }
}

export function formatPaymentCondition(record = {}) {
  const method = trimOptional(record?.payment_method)
  const termDays = normalizeOptionalNonNegativeInteger(
    record?.payment_term_days
  )
  if (method && termDays !== undefined) {
    return `${method} / ${termDays}天`
  }
  if (method) {
    return method
  }
  if (termDays !== undefined) {
    return `${termDays}天`
  }
  return '-'
}

export function inferDefaultUnitID(records = [], unitOptions = []) {
  const allowedUnitIDs = new Set(
    (Array.isArray(unitOptions) ? unitOptions : [])
      .map((option) => Number(option?.value || 0))
      .filter((unitID) => Number.isFinite(unitID) && unitID > 0)
  )
  if (allowedUnitIDs.size === 0) {
    return undefined
  }

  const counts = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    const unitID = Number(record?.default_unit_id || 0)
    if (!allowedUnitIDs.has(unitID)) {
      continue
    }
    counts.set(unitID, (counts.get(unitID) || 0) + 1)
  }
  const [mostUsedUnitID] = [...counts.entries()].sort(
    ([unitIDA, countA], [unitIDB, countB]) =>
      countB - countA || unitIDA - unitIDB
  )[0] || [undefined]
  return mostUsedUnitID || [...allowedUnitIDs][0]
}

function draftCodeDateKey(now = new Date()) {
  const date =
    now instanceof Date && !Number.isNaN(now.valueOf()) ? now : new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
}

export function buildSequentialDraftCode(
  records = [],
  { prefix = '', field = 'code', now = new Date(), sequenceWidth = 3 } = {}
) {
  const normalizedPrefix = trimOptional(prefix)
  if (!normalizedPrefix) {
    return ''
  }
  const dateKey = draftCodeDateKey(now)
  const codePrefix = `${normalizedPrefix}-${dateKey}-`
  const maxSequence = (Array.isArray(records) ? records : []).reduce(
    (max, record) => {
      const code = String(record?.[field] || '')
      if (!code.startsWith(codePrefix)) {
        return max
      }
      const sequence = Number(code.slice(codePrefix.length))
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max
    },
    0
  )
  return `${codePrefix}${String(maxSequence + 1).padStart(sequenceWidth, '0')}`
}

export function buildMaterialDraftCode(records = [], now = new Date()) {
  return buildSequentialDraftCode(records, {
    prefix: 'MAT',
    field: 'code',
    now,
  })
}

export function buildCustomerSnapshot(customer = {}) {
  if (!customer?.id) {
    return {}
  }
  return compactParams({
    id: customer.id,
    code: trimOptional(customer.code),
    name: trimOptional(customer.name),
    short_name: trimOptional(customer.short_name),
  })
}

export function buildSalesOrderCustomerSourceValues(customer = {}) {
  if (!customer?.id) {
    return {
      customer_id: undefined,
      customer_snapshot: {},
    }
  }
  return {
    customer_id: Number(customer.id || 0) || undefined,
    customer_snapshot: buildCustomerSnapshot(customer),
  }
}

export function buildOrderContactSnapshot(values = {}) {
  return compactParams({
    name: trimOptional(values.contact_name),
    phone: trimOptional(values.contact_phone),
    mobile: trimOptional(values.contact_mobile),
    email: trimOptional(values.contact_email),
    title: trimOptional(values.contact_title),
  })
}

export const SUPPLIER_CONTACT_OWNER_TYPE = 'SUPPLIER'

function selectPrimaryContact(contacts = []) {
  const activeContacts = (Array.isArray(contacts) ? contacts : []).filter(
    (contact) => contact?.is_active !== false
  )
  return (
    activeContacts.find((contact) => contact?.is_primary === true) ||
    activeContacts[0] ||
    {}
  )
}

export function buildSupplierSnapshot(supplier = {}) {
  if (!supplier?.id) {
    return {}
  }
  return compactParams({
    id: supplier.id,
    code: trimOptional(supplier.code),
    name: trimOptional(supplier.name),
    short_name: trimOptional(supplier.short_name),
    contact_name:
      trimOptional(supplier.contact_name) ||
      trimOptional(supplier.primary_contact_name),
    contact_phone:
      trimOptional(supplier.contact_phone) ||
      trimOptional(supplier.phone) ||
      trimOptional(supplier.primary_contact_phone),
    contact_mobile:
      trimOptional(supplier.contact_mobile) ||
      trimOptional(supplier.mobile) ||
      trimOptional(supplier.primary_contact_mobile),
    address: trimOptional(supplier.address),
  })
}

export function buildSupplierSnapshotWithContacts(
  supplier = {},
  contacts = []
) {
  const baseSnapshot = buildSupplierSnapshot(supplier)
  if (!baseSnapshot.id) {
    return {}
  }
  const primaryContact = selectPrimaryContact(contacts)
  return compactParams({
    ...baseSnapshot,
    contact_name:
      trimOptional(primaryContact.name) || baseSnapshot.contact_name,
    contact_phone:
      trimOptional(primaryContact.phone) || baseSnapshot.contact_phone,
    contact_mobile:
      trimOptional(primaryContact.mobile) || baseSnapshot.contact_mobile,
  })
}

export function buildContractPartySnapshot(values = {}) {
  return compactParams({
    buyerCompany: trimOptional(values.buyerCompany),
    buyerContact: trimOptional(values.buyerContact),
    buyerPhone: trimOptional(values.buyerPhone),
    buyerAddress: trimOptional(values.buyerAddress),
    buyerSigner: trimOptional(values.buyerSigner),
  })
}

function buildOptionalContractPartySnapshotParam(values = {}) {
  if (
    !Object.prototype.hasOwnProperty.call(values, 'contract_party_snapshot')
  ) {
    return undefined
  }
  return values.contract_party_snapshot &&
    typeof values.contract_party_snapshot === 'object'
    ? buildContractPartySnapshot(values.contract_party_snapshot)
    : {}
}

export function contractPartySnapshotFromPrintTemplateDefaults(
  printTemplateDefaults = {},
  templateKey = ''
) {
  const directDefaults =
    printTemplateDefaults?.[templateKey] ||
    printTemplateDefaults?.materialPurchaseContract ||
    printTemplateDefaults?.processingContract ||
    null
  const templateDefaults = Array.isArray(printTemplateDefaults?.templates)
    ? printTemplateDefaults.templates.find(
        (item) => item?.template_key === templateKey
      )
    : null
  return buildContractPartySnapshot(
    directDefaults?.partyDefaults ||
      directDefaults?.party_defaults ||
      templateDefaults?.party_defaults ||
      {}
  )
}

export function buildMasterDataParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    short_name: trimOptional(values.short_name),
    default_payment_method: trimOptional(values.default_payment_method),
    default_payment_term_days: normalizeOptionalNonNegativeInteger(
      values.default_payment_term_days
    ),
    supplier_type: trimOptional(values.supplier_type),
    tax_no: trimOptional(values.tax_no),
    category: trimOptional(values.category),
    spec: trimOptional(values.spec),
    color: trimOptional(values.color),
    default_unit_id:
      values.default_unit_id === undefined
        ? undefined
        : Number(values.default_unit_id || 0),
    note: trimOptional(values.note),
  })
}

export function buildProductParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    style_no: trimOptional(values.style_no),
    customer_style_no: trimOptional(values.customer_style_no),
    default_unit_id:
      values.default_unit_id === undefined
        ? undefined
        : Number(values.default_unit_id || 0),
    unit_net_weight_kg: normalizeOptionalDecimalString(
      values.unit_net_weight_kg
    ),
  })
}

export function buildProcessParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    category: trimOptional(values.category),
    outsourcing_enabled: values.outsourcing_enabled === true,
    inhouse_enabled: values.inhouse_enabled !== false,
    quality_required: values.quality_required === true,
    sort_order:
      values.sort_order === undefined
        ? undefined
        : Number(values.sort_order || 0),
    note: trimOptional(values.note),
  })
}

export function buildProductSKUParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    product_id: Number(values.product_id || 0),
    sku_code: trimOptional(values.sku_code),
    sku_name: trimOptional(values.sku_name),
    barcode: trimOptional(values.barcode),
    customer_sku: trimOptional(values.customer_sku),
    color: trimOptional(values.color),
    color_no: trimOptional(values.color_no),
    size: trimOptional(values.size),
    packaging_version: trimOptional(values.packaging_version),
    default_unit_id:
      values.default_unit_id === undefined || values.default_unit_id === null
        ? undefined
        : Number(values.default_unit_id || 0),
  })
}

export function buildContactParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    name: trimOptional(values.name),
    phone: trimOptional(values.phone),
    mobile: trimOptional(values.mobile),
    email: trimOptional(values.email),
    title: trimOptional(values.title),
    is_primary: values.is_primary === true,
    note: trimOptional(values.note),
  })
}

export function buildSalesOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    order_no: trimOptional(values.order_no),
    customer_id:
      values.customer_id === undefined ||
      values.customer_id === null ||
      trimOptional(values.customer_id) === ''
        ? undefined
        : Number(values.customer_id || 0),
    customer_order_no: trimOptional(values.customer_order_no),
    customer_snapshot:
      values.customer_snapshot && typeof values.customer_snapshot === 'object'
        ? values.customer_snapshot
        : {},
    sales_owner: trimOptional(values.sales_owner),
    contact_snapshot:
      values.contact_snapshot && typeof values.contact_snapshot === 'object'
        ? values.contact_snapshot
        : buildOrderContactSnapshot(values),
    payment_method: trimOptional(values.payment_method),
    payment_term_days: normalizeOptionalNonNegativeInteger(
      values.payment_term_days
    ),
    price_condition_note: trimOptional(values.price_condition_note),
    order_date: trimOptional(values.order_date),
    planned_delivery_date: trimOptional(values.planned_delivery_date),
    note: trimOptional(values.note),
  })
}

export function buildSalesOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: normalizeLineNo(extra.line_no, values.line_no),
    product_id: normalizeOptionalPositiveInteger(values.product_id),
    product_sku_id: normalizeOptionalPositiveInteger(values.product_sku_id),
    unit_id: normalizeOptionalPositiveInteger(values.unit_id),
    product_code_snapshot: trimOptional(values.product_code_snapshot),
    product_name_snapshot: trimOptional(values.product_name_snapshot),
    color_snapshot: trimOptional(values.color_snapshot),
    ordered_quantity: trimOptional(values.ordered_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: deriveSalesOrderItemAmount(values),
    planned_delivery_date: trimOptional(values.planned_delivery_date),
    note: trimOptional(values.note),
  })
}

export function buildSalesOrderItemSourceValuesFromSKU(sku = {}) {
  if (!sku?.id) {
    return {
      product_sku_id: undefined,
      product_id: undefined,
      unit_id: undefined,
      product_code_snapshot: '',
      product_name_snapshot: '',
      color_snapshot: '',
    }
  }
  return {
    product_sku_id: Number(sku.id || 0) || undefined,
    product_id: Number(sku.product_id || 0) || undefined,
    unit_id: Number(sku.default_unit_id || 0) || undefined,
    product_code_snapshot: trimOptional(sku.sku_code) || '',
    product_name_snapshot:
      trimOptional(sku.sku_name) ||
      trimOptional(sku.customer_sku) ||
      trimOptional(sku.barcode) ||
      '',
    color_snapshot: trimOptional(sku.color) || '',
  }
}

export function buildPurchaseOrderItemSourceValuesFromMaterial(material = {}) {
  if (!material?.id) {
    return {
      material_id: undefined,
      unit_id: undefined,
      material_code_snapshot: '',
      material_name_snapshot: '',
      color_snapshot: '',
    }
  }
  return {
    material_id: Number(material.id || 0) || undefined,
    unit_id: Number(material.default_unit_id || 0) || undefined,
    material_code_snapshot: trimOptional(material.code) || '',
    material_name_snapshot: trimOptional(material.name) || '',
    color_snapshot: trimOptional(material.color) || '',
  }
}

export function buildOutsourcingOrderSubjectSwitchValues(subjectType) {
  return {
    subject_type: normalizeOutsourcingOrderSubjectType(subjectType),
    product_id: undefined,
    material_id: undefined,
    product_no_snapshot: '',
    product_order_no_snapshot: '',
    product_name_snapshot: '',
    material_code_snapshot: '',
    material_name_snapshot: '',
    unit_id: undefined,
    unit_name_snapshot: '',
  }
}

export function buildOutsourcingOrderItemSourceValuesFromProduct(
  product = {},
  unit = {}
) {
  const resetValues = buildOutsourcingOrderSubjectSwitchValues(
    OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
  )
  if (!product?.id) {
    return resetValues
  }
  return {
    ...resetValues,
    product_id: Number(product.id || 0) || undefined,
    product_no_snapshot: trimOptional(product.code) || '',
    product_name_snapshot: trimOptional(product.name) || '',
    unit_id: Number(product.default_unit_id || 0) || undefined,
    unit_name_snapshot: trimOptional(unit.name) || '',
  }
}

export function buildOutsourcingOrderItemSourceValuesFromMaterial(
  material = {},
  unit = {}
) {
  const resetValues = buildOutsourcingOrderSubjectSwitchValues(
    OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
  )
  if (!material?.id) {
    return resetValues
  }
  return {
    ...resetValues,
    material_id: Number(material.id || 0) || undefined,
    material_code_snapshot: trimOptional(material.code) || '',
    material_name_snapshot: trimOptional(material.name) || '',
    unit_id: Number(material.default_unit_id || 0) || undefined,
    unit_name_snapshot: trimOptional(unit.name) || '',
  }
}

export function buildBOMItemSourceValuesFromMaterial(material = {}) {
  if (!material?.id) {
    return {
      material_id: undefined,
      unit_id: undefined,
    }
  }
  return {
    material_id: Number(material.id || 0) || undefined,
    unit_id: Number(material.default_unit_id || 0) || undefined,
  }
}

export function buildPurchaseOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    purchase_order_no: trimOptional(values.purchase_order_no),
    supplier_id: Number(values.supplier_id || 0),
    supplier_purchase_order_no: trimOptional(values.supplier_purchase_order_no),
    supplier_snapshot:
      values.supplier_snapshot && typeof values.supplier_snapshot === 'object'
        ? values.supplier_snapshot
        : {},
    contract_party_snapshot: buildOptionalContractPartySnapshotParam(values),
    purchase_date: trimOptional(values.purchase_date),
    expected_arrival_date: trimOptional(values.expected_arrival_date),
    note: trimOptional(values.note),
  })
}

export function buildPurchaseOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: normalizeLineNo(extra.line_no, values.line_no),
    material_id: Number(values.material_id || 0),
    unit_id: Number(values.unit_id || 0),
    material_code_snapshot: trimOptional(values.material_code_snapshot),
    material_name_snapshot: trimOptional(values.material_name_snapshot),
    color_snapshot: trimOptional(values.color_snapshot),
    product_order_no_snapshot: trimOptional(values.product_order_no_snapshot),
    product_no_snapshot: trimOptional(values.product_no_snapshot),
    product_name_snapshot: trimOptional(values.product_name_snapshot),
    purchased_quantity: trimOptional(values.purchased_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: derivePurchaseOrderItemAmount(values),
    expected_arrival_date: trimOptional(values.expected_arrival_date),
    note: trimOptional(values.note),
  })
}

export function buildOutsourcingOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    outsourcing_order_no: trimOptional(values.outsourcing_order_no),
    supplier_id: Number(values.supplier_id || 0),
    supplier_snapshot:
      values.supplier_snapshot && typeof values.supplier_snapshot === 'object'
        ? values.supplier_snapshot
        : {},
    contract_party_snapshot: buildOptionalContractPartySnapshotParam(values),
    source_order_no: trimOptional(values.source_order_no),
    source_sales_order_id:
      values.source_sales_order_id === undefined ||
      values.source_sales_order_id === null ||
      values.source_sales_order_id === ''
        ? undefined
        : Number(values.source_sales_order_id || 0),
    order_date: trimOptional(values.order_date),
    expected_return_date: trimOptional(values.expected_return_date),
    note: trimOptional(values.note),
  })
}

export function buildOutsourcingOrderItemParams(values = {}, extra = {}) {
  const subjectType = normalizeOutsourcingOrderSubjectType(values.subject_type)
  const productSubject = subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
  const materialSubject =
    subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
  return compactParams({
    ...extra,
    line_no: normalizeLineNo(extra.line_no, values.line_no),
    subject_type: subjectType,
    product_id: productSubject
      ? normalizeOptionalPositiveInteger(values.product_id)
      : undefined,
    material_id: materialSubject
      ? normalizeOptionalPositiveInteger(values.material_id)
      : undefined,
    process_id: Number(values.process_id || 0),
    unit_id: Number(values.unit_id || 0),
    product_no_snapshot: productSubject
      ? trimOptional(values.product_no_snapshot)
      : undefined,
    product_order_no_snapshot: productSubject
      ? trimOptional(values.product_order_no_snapshot)
      : undefined,
    product_name_snapshot: productSubject
      ? trimOptional(values.product_name_snapshot)
      : undefined,
    material_code_snapshot: materialSubject
      ? trimOptional(values.material_code_snapshot)
      : undefined,
    material_name_snapshot: materialSubject
      ? trimOptional(values.material_name_snapshot)
      : undefined,
    process_name_snapshot: trimOptional(values.process_name_snapshot),
    process_category_snapshot: trimOptional(values.process_category_snapshot),
    unit_name_snapshot: trimOptional(values.unit_name_snapshot),
    outsourcing_quantity: trimOptional(values.outsourcing_quantity),
    unit_price: trimOptional(values.unit_price),
    expected_return_date: trimOptional(values.expected_return_date),
    note: trimOptional(values.note),
  })
}

function materialLookupByID(materials = []) {
  return new Map(
    (Array.isArray(materials) ? materials : [])
      .filter((item) => item?.id)
      .map((item) => [Number(item.id), item])
  )
}

function formatPrintDraftDate(value) {
  const text = trimOptional(value)
  const timestamp = Number(value || 0)
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return formatUnixDate(value)
  }
  return text || undefined
}

function isCanceledBusinessLineStatus(value) {
  return ['canceled', 'cancelled'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase()
  )
}

export function buildMaterialPurchaseContractDraftFromPurchaseOrder(
  order = {},
  items = [],
  { materials = [], unitOptions = [], printTemplateDefaults = {} } = {}
) {
  const supplierSnapshot =
    order?.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  const materialByID = materialLookupByID(materials)
  const unitLabelByID = new Map(
    (Array.isArray(unitOptions) ? unitOptions : [])
      .map((option) => [
        Number(option?.value || 0),
        trimOptional(option?.suffixLabel) ||
          trimOptional(option?.label) ||
          trimOptional(option?.title),
      ])
      .filter(
        ([unitID, label]) => Number.isFinite(unitID) && unitID > 0 && label
      )
  )
  const contractPartySnapshot = buildContractPartySnapshot(
    order?.contract_party_snapshot &&
      typeof order.contract_party_snapshot === 'object'
      ? order.contract_party_snapshot
      : {}
  )
  const lines = (Array.isArray(items) ? items : [])
    .filter((item) => !isCanceledBusinessLineStatus(item?.line_status))
    .map((item) => {
      const material = materialByID.get(Number(item.material_id || 0)) || {}
      const unitOptionLabel = unitLabelByID.get(Number(item.unit_id || 0))
      return compactParams({
        contractNo: trimOptional(order.purchase_order_no),
        productOrderNo:
          trimOptional(item.product_order_no_snapshot) ||
          trimOptional(item.source_order_no_snapshot) ||
          trimOptional(item.source_order_no),
        productNo:
          trimOptional(item.product_no_snapshot) ||
          trimOptional(item.product_code_snapshot),
        productName: trimOptional(item.product_name_snapshot),
        materialName:
          trimOptional(item.material_name_snapshot) ||
          trimOptional(material.name),
        vendorCode:
          trimOptional(item.material_code_snapshot) ||
          trimOptional(material.code),
        spec: trimOptional(material.spec),
        unit:
          normalizeMaterialPurchaseUnitText(unitOptionLabel) ||
          normalizeMaterialPurchaseUnitText(item.unit_name_snapshot) ||
          undefined,
        unitPrice: trimOptional(item.unit_price),
        quantity: trimOptional(item.purchased_quantity),
        amount: derivePurchaseOrderItemAmount(item),
        remark: trimOptional(item.note) || trimOptional(item.color_snapshot),
      })
    })
  return compactParams({
    contractNo: trimOptional(order.purchase_order_no),
    orderDateText: formatPrintDraftDate(order.purchase_date),
    returnDateText: formatPrintDraftDate(order.expected_arrival_date),
    signDateText: formatPrintDraftDate(order.purchase_date),
    supplierName:
      trimOptional(supplierSnapshot.name) ||
      trimOptional(supplierSnapshot.short_name),
    supplierContact: trimOptional(supplierSnapshot.contact_name),
    supplierPhone:
      trimOptional(supplierSnapshot.contact_phone) ||
      trimOptional(supplierSnapshot.contact_mobile),
    supplierAddress: trimOptional(supplierSnapshot.address),
    ...contractPartySnapshotFromPrintTemplateDefaults(
      printTemplateDefaults,
      'material-purchase-contract'
    ),
    ...contractPartySnapshot,
    lines,
  })
}
