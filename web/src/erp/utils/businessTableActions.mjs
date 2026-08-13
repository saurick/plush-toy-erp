import { getColumnLabel } from '../components/business-list/ColumnOrderModal.jsx'
import {
  applyEffectiveFieldPolicyFlags,
  resolveDefaultFieldPolicySurface as resolveAdminProfileFieldPolicySurface,
} from './adminProfileSync.mjs'
import { downloadCSVRows } from './csvExport.mjs'
import { sanitizeModuleColumnOrder } from './moduleTableColumns.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

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
  return resolveAdminProfileFieldPolicySurface(moduleKey)
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

export function downloadCSV({ filename, columns, rows }) {
  const visibleColumns = (Array.isArray(columns) ? columns : []).filter(
    (column) => column?.hiddenByEffectiveFieldPolicy !== true
  )
  const header = visibleColumns.map((column) => getColumnLabel(column))
  const body = rows.map((row) =>
    visibleColumns.map((column) => {
      return typeof column.exportValue === 'function'
        ? column.exportValue(row)
        : row?.[column.dataIndex]
    })
  )
  downloadCSVRows({ filename, rows: [header, ...body] })
}
