import {
  OUTSOURCING_ORDER_SUBJECT_TYPES,
  normalizeOutsourcingOrderSubjectType,
} from './sourceOrderLineValues.mjs'

import {
  trimOptional,
  normalizeOptionalNonNegativeInteger,
} from './sourceDocumentValues.mjs'
import { effectiveSessionAllowsAction } from './adminProfileSync.mjs'
import { BUSINESS_CURRENCY_OPTIONS } from './businessCurrency.mjs'
import { unixSecondsToBusinessDate } from './businessDate.mjs'

export const V1_ROUTE_PATHS = Object.freeze({
  customers: '/erp/master/partners/customers',
  suppliers: '/erp/master/partners/suppliers',
  materials: '/erp/master/materials',
  processes: '/erp/engineering/processes',
  salesOrders: '/erp/sales/project-orders/sales-orders',
  purchaseOrders: '/erp/purchase/accessories',
  purchaseReceipts: '/erp/warehouse/inbound',
  qualityInspections: '/erp/production/quality-inspections',
  productionOrders: '/erp/production/orders',
  inventory: '/erp/warehouse/inventory',
  processingContracts: '/erp/purchase/processing-contracts',
  productionProgress: '/erp/production/progress',
  outbound: '/erp/warehouse/outbound',
  shipments: '/erp/warehouse/shipments',
  receivables: '/erp/finance/receivables',
  payables: '/erp/finance/payables',
  invoices: '/erp/finance/invoices',
  reconciliation: '/erp/finance/reconciliation',
  financePayments: '/erp/finance/payments',
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

export { BUSINESS_CURRENCY_OPTIONS }

export const SALES_ORDER_TAX_MODE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'INCLUSIVE', label: '含税价' }),
  Object.freeze({ value: 'EXCLUSIVE', label: '未税价（税额另加）' }),
  Object.freeze({ value: 'NONE', label: '不计税' }),
])

export const SALES_ORDER_FREIGHT_TERMS_OPTIONS = Object.freeze([
  Object.freeze({ value: 'INCLUDED', label: '报价含运费' }),
  Object.freeze({ value: 'EXCLUDED', label: '报价不含运费（另计）' }),
])

export const PURCHASE_INVOICE_REQUIRED_OPTIONS = Object.freeze([
  Object.freeze({ value: true, label: '需要发票' }),
  Object.freeze({ value: false, label: '不需要发票' }),
])

export const PURCHASE_INVOICE_CATEGORY_OPTIONS = Object.freeze([
  Object.freeze({ value: 'EXPORT_GENERAL', label: '出口普通发票' }),
  Object.freeze({ value: 'VAT_GENERAL_1', label: '增值税普通发票 1%' }),
  Object.freeze({ value: 'VAT_SPECIAL_3', label: '增值税专用发票 3%' }),
  Object.freeze({ value: 'VAT_SPECIAL_13', label: '增值税专用发票 13%' }),
])

const SALES_ORDER_TAX_MODE_LABELS = Object.freeze(
  Object.fromEntries(
    SALES_ORDER_TAX_MODE_OPTIONS.map((option) => [option.value, option.label])
  )
)
const SALES_ORDER_FREIGHT_TERMS_LABELS = Object.freeze(
  Object.fromEntries(
    SALES_ORDER_FREIGHT_TERMS_OPTIONS.map((option) => [
      option.value,
      option.label,
    ])
  )
)
const PURCHASE_INVOICE_CATEGORY_LABELS = Object.freeze(
  Object.fromEntries(
    PURCHASE_INVOICE_CATEGORY_OPTIONS.map((option) => [
      option.value,
      option.label,
    ])
  )
)

export function salesOrderTaxModeText(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
  return SALES_ORDER_TAX_MODE_LABELS[key] || (key ? '税费方式待核对' : '未填写')
}

export function salesOrderFreightTermsText(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
  return (
    SALES_ORDER_FREIGHT_TERMS_LABELS[key] || (key ? '运费条件待核对' : '未填写')
  )
}

export function purchaseInvoicePreferenceText(required, category) {
  if (required === null || required === undefined) return '未填写'
  if (required === false) return '不需要发票'
  const key = String(category || '')
    .trim()
    .toUpperCase()
  return PURCHASE_INVOICE_CATEGORY_LABELS[key] || '需要发票（类别未填写）'
}

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

export function formatProductUnitNetWeight(value) {
  const weight = String(value ?? '').trim()
  if (!weight) {
    return '-'
  }
  return `${weight} 克`
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
  return unixSecondsToBusinessDate(timestamp)
}

function optionalFormValue(value) {
  return value === null || value === undefined ? '' : value
}

export function createBlankOutsourcingLine(lineNo = 1) {
  return {
    line_no: lineNo,
    subject_type: OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT,
    product_id: undefined,
    product_sku_id: undefined,
    material_id: undefined,
    process_id: undefined,
    unit_id: undefined,
    product_no_snapshot: '',
    sku_code_snapshot: '',
    product_order_no_snapshot: '',
    product_name_snapshot: '',
    material_code_snapshot: '',
    material_name_snapshot: '',
    processing_item: '',
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
    product_sku_id: isProduct ? item.product_sku_id : undefined,
    material_id: isMaterial ? item.material_id : undefined,
    process_id: item.process_id,
    unit_id: item.unit_id,
    product_no_snapshot: isProduct ? item.product_no_snapshot || '' : '',
    sku_code_snapshot: isProduct ? item.sku_code_snapshot || '' : '',
    product_order_no_snapshot: item.product_order_no_snapshot || '',
    product_name_snapshot: isProduct ? item.product_name_snapshot || '' : '',
    material_code_snapshot: isMaterial ? item.material_code_snapshot || '' : '',
    material_name_snapshot: isMaterial ? item.material_name_snapshot || '' : '',
    processing_item: item.processing_item || '',
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

export function inferProductDefaultUnitID(records = [], unitOptions = []) {
  const options = Array.isArray(unitOptions) ? unitOptions : []
  const preferredCodes = ['PCS', 'PC', 'EA']
  for (const code of preferredCodes) {
    const codePattern = new RegExp(`(?:^|[（(\\s])${code}(?:[）)\\s]|$)`, 'u')
    const matched = options.find((option) =>
      codePattern.test(
        `${String(option?.label || '')} ${String(option?.title || '')}`.toUpperCase()
      )
    )
    const unitID = Number(matched?.value || 0)
    if (Number.isFinite(unitID) && unitID > 0) {
      return unitID
    }
  }
  const matchedByName = options.find((option) =>
    /^(?:件|个|只)(?:[（(]|$)/u.test(String(option?.label || '').trim())
  )
  const unitID = Number(matchedByName?.value || 0)
  return Number.isFinite(unitID) && unitID > 0
    ? unitID
    : inferDefaultUnitID(records, options)
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
