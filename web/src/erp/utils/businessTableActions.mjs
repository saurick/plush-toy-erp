import { getColumnLabel } from '../components/business-list/ColumnOrderModal.jsx'
import {
  resolveDefaultFieldPolicySurface as resolveAdminProfileFieldPolicySurface,
} from './adminProfileSync.mjs'
import { downloadCSVRows } from './csvExport.mjs'

export function parseBusinessSortValue(value = 'updated_at:desc') {
  const [sortBy = 'updated_at', sortDirection = 'desc'] =
    String(value).split(':')
  return { sortBy, sortDirection }
}

export function resolveDefaultFieldPolicySurface(moduleKey = '') {
  return resolveAdminProfileFieldPolicySurface(moduleKey)
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
