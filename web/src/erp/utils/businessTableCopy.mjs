function valueAtPath(record, dataIndex) {
  const path = Array.isArray(dataIndex)
    ? dataIndex
    : String(dataIndex || '')
        .split('.')
        .filter(Boolean)
  return path.reduce((current, key) => current?.[key], record)
}

export function normalizeBusinessTableCopyText(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeBusinessTableCopyText(item))
      .filter(Boolean)
      .join('\n')
  }
  if (value && typeof value === 'object') {
    return ''
  }
  const text = String(value ?? '').trim()
  if (
    text === '-' ||
    text === '—' ||
    /^[^/（）()\n]{1,24}已关联$/u.test(text)
  ) {
    return ''
  }
  return text
}

export function resolveBusinessTableCopyText(column, value, record) {
  const copyConfig =
    typeof column?.copyable === 'object' && column.copyable !== null
      ? column.copyable
      : {}
  const resolvedValue =
    typeof copyConfig.resolveValue === 'function'
      ? copyConfig.resolveValue(value, record)
      : copyConfig.dataIndex
        ? valueAtPath(record, copyConfig.dataIndex)
        : value
  return normalizeBusinessTableCopyText(resolvedValue)
}

export function resolveBusinessTableCopyLabel(column) {
  const copyConfig =
    typeof column?.copyable === 'object' && column.copyable !== null
      ? column.copyable
      : {}
  const candidates = [
    copyConfig.label,
    column?.copyableLabel,
    column?.exportTitle,
    typeof column?.title === 'string' ? column.title : '',
  ]
  return (
    candidates.map((item) => String(item || '').trim()).find(Boolean) ||
    '字段值'
  )
}

export function businessTableCopyColumnKey(column) {
  const key = column?.dataIndex || column?.key
  return Array.isArray(key) ? key.join('.') : String(key || '')
}
