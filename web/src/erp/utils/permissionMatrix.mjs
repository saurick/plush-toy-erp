export const PERMISSION_MATRIX_COLUMNS = [
  { key: 'read', label: '查看' },
  { key: 'create', label: '新建' },
  { key: 'update', label: '编辑' },
  { key: 'other', label: '其他业务操作' },
]

export function getPermissionMatrixColumn(item = {}) {
  return ['read', 'create', 'update'].includes(item.action)
    ? item.action
    : 'other'
}

export function isSensitivePermission(item = {}) {
  return (
    ['system', 'mobile', 'debug'].includes(item.module) ||
    /(?:^|_)(activate|approve|cancel|clear|cleanup|confirm|disable|handle|manage|post|reject|reverse|revoke|seed|ship)(?:_|$)/u.test(
      item.action || ''
    )
  )
}

const resourceKey = (item) => item.resource || item.key
const labelPriority = (item) =>
  ['read', 'create', 'update'].indexOf(item.action) < 0
    ? 3
    : ['read', 'create', 'update'].indexOf(item.action)

// Labels come from the complete API group, so filtering cannot rename a row.
export function buildPermissionMatrixRows(items = [], allItems = items) {
  const labels = new Map()
  const availableColumns = new Map()
  for (const item of [...allItems].sort(
    (left, right) => labelPriority(left) - labelPriority(right)
  )) {
    const key = resourceKey(item)
    const columns = availableColumns.get(key) || new Set()
    columns.add(getPermissionMatrixColumn(item))
    availableColumns.set(key, columns)
    if (!labels.has(key)) {
      const label = item.resource
        ? item.label.replace(
            /^(查看|创建|登记|维护|更新|确认|提交|审批|处理|发起|清空|恢复|释放|分配)\s*/u,
            ''
          )
        : item.label
      labels.set(key, label || item.label)
    }
  }
  const rows = new Map()
  for (const item of items) {
    const key = resourceKey(item)
    const row = rows.get(key) || {
      key,
      label: labels.get(key) || item.label,
      availableColumns: [...(availableColumns.get(key) || [])],
      cells: Object.fromEntries(
        PERMISSION_MATRIX_COLUMNS.map((column) => [column.key, []])
      ),
    }
    row.cells[getPermissionMatrixColumn(item)].push(item)
    rows.set(key, row)
  }
  return [...rows.values()]
}
