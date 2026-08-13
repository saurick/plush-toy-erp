import { getColumnLabel } from './ColumnOrderModal.jsx'
import { applyEffectiveFieldPolicyFlags } from '../../utils/adminProfileSync.mjs'
import { downloadCSVRows } from '../../utils/csvExport.mjs'
import { sanitizeModuleColumnOrder } from '../../utils/moduleTableColumns.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

export function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') return
  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (!Array.isArray(order) || order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
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
  if (sanitizedAccountOrder.length > 0) return sanitizedAccountOrder
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

export function downloadBusinessCSV({ filename, columns, rows }) {
  const header = columns.map((column) => getColumnLabel(column))
  const body = rows.map((row) =>
    columns.map((column) => {
      return typeof column.exportValue === 'function'
        ? column.exportValue(row)
        : row?.[column.dataIndex]
    })
  )
  downloadCSVRows({ filename, rows: [header, ...body] })
}
