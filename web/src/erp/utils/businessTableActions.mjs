import { getColumnLabel } from '../components/business-list/ColumnOrderModal.jsx'
import { isEffectiveFieldVisible } from './adminProfileSync.mjs'
import { sanitizeModuleColumnOrder } from './moduleTableColumns.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

const DEFAULT_FIELD_POLICY_SURFACE_BY_MODULE = Object.freeze({
  customers: 'customers.default',
  suppliers: 'suppliers.default',
  sales_orders: 'sales_orders.default',
  sales_order_items: 'sales_order_items.default',
  purchase_orders: 'purchase_orders.default',
  purchase_order_items: 'purchase_order_items.default',
  purchase_receipts: 'purchase_receipts.default',
  quality_inspections: 'quality_inspections.default',
  inventory_lots: 'inventory_lots.default',
  inventory_txns: 'inventory_txns.default',
  shipments: 'shipments.default',
  outsourcing_orders: 'outsourcing_orders.default',
  finance_facts: 'finance_facts.default',
})

export function parseBusinessSortValue(value = 'updated_at:desc') {
  const [sortBy = 'updated_at', sortDirection = 'desc'] =
    String(value).split(':')
  return { sortBy, sortDirection }
}

export function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') return
  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
}

export function resolveDefaultFieldPolicySurface(moduleKey = '') {
  const normalizedModuleKey = String(moduleKey || '').trim()
  if (!normalizedModuleKey) return ''
  return (
    DEFAULT_FIELD_POLICY_SURFACE_BY_MODULE[normalizedModuleKey] ||
    `${normalizedModuleKey}.default`
  )
}

function resolveColumnFieldPolicyKey(column = {}) {
  if (typeof column.effectiveFieldKey === 'string') {
    return column.effectiveFieldKey.trim()
  }
  if (typeof column.dataIndex === 'string') {
    return column.dataIndex.trim()
  }
  if (Array.isArray(column.dataIndex)) {
    return column.dataIndex.filter(Boolean).join('.')
  }
  if (typeof column.key === 'string') {
    return column.key.trim()
  }
  return ''
}

function applyEffectiveFieldPolicyFlags({ adminProfile, moduleKey, columns }) {
  const normalizedColumns = Array.isArray(columns) ? columns : []
  const surfaceKey = resolveDefaultFieldPolicySurface(moduleKey)
  for (const column of normalizedColumns) {
    if (!column || typeof column !== 'object') continue
    const fieldKey = resolveColumnFieldPolicyKey(column)
    const hidden = Boolean(
      surfaceKey &&
        fieldKey &&
        !isEffectiveFieldVisible(adminProfile, surfaceKey, fieldKey)
    )
    if (hidden) {
      column.hiddenByEffectiveFieldPolicy = true
    } else if (Object.prototype.hasOwnProperty.call(column, 'hiddenByEffectiveFieldPolicy')) {
      delete column.hiddenByEffectiveFieldPolicy
    }
  }
}

export function getPreferredColumnOrder({
  adminProfile,
  moduleKey,
  columns,
  localOrder,
}) {
  applyEffectiveFieldPolicyFlags({ adminProfile, moduleKey, columns })
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, columns)
  }
  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(accountOrder, columns)
  if (sanitizedAccountOrder.length > 0) {
    return sanitizedAccountOrder
  }
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function downloadCSV({ filename, columns, rows }) {
  const visibleColumns = (Array.isArray(columns) ? columns : []).filter(
    (column) => column?.hiddenByEffectiveFieldPolicy !== true
  )
  const header = visibleColumns.map((column) => csvEscape(getColumnLabel(column)))
  const body = rows.map((row) =>
    visibleColumns.map((column) => {
      const value =
        typeof column.exportValue === 'function'
          ? column.exportValue(row)
          : row?.[column.dataIndex]
      return csvEscape(value)
    })
  )
  const csv = [header, ...body].map((line) => line.join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
