const FALLBACK_COLUMN_KEY_PREFIX = '__column__'

export const getModuleColumnKey = (column = {}, index = 0) =>
  String(
    column?.dataIndex || column?.key || `${FALLBACK_COLUMN_KEY_PREFIX}${index}`
  )

export const buildModuleColumnOrder = (columns = []) =>
  (Array.isArray(columns) ? columns : []).map((column, index) =>
    getModuleColumnKey(column, index)
  )

export const sanitizeModuleColumnOrder = (order = [], columns = []) => {
  const validKeys = new Set(buildModuleColumnOrder(columns))
  const seen = new Set()
  return (Array.isArray(order) ? order : []).reduce((list, value) => {
    const key = String(value || '').trim()
    if (!key || !validKeys.has(key) || seen.has(key)) {
      return list
    }
    seen.add(key)
    list.push(key)
    return list
  }, [])
}

export const applyModuleColumnOrder = (columns = [], order = []) => {
  const normalizedColumns = Array.isArray(columns) ? columns : []
  const keyToColumn = new Map(
    normalizedColumns.map((column, index) => [
      getModuleColumnKey(column, index),
      column,
    ])
  )
  const sanitizedOrder = sanitizeModuleColumnOrder(order, normalizedColumns)
  const orderedColumns = sanitizedOrder
    .map((key) => keyToColumn.get(key))
    .filter(Boolean)
  const orderedKeySet = new Set(sanitizedOrder)
  const remainingColumns = normalizedColumns.filter(
    (column, index) => !orderedKeySet.has(getModuleColumnKey(column, index))
  )
  return [...orderedColumns, ...remainingColumns]
}

export const moveModuleColumnOrder = (
  order = [],
  columns = [],
  targetKey = '',
  direction = 0
) => {
  const fallbackOrder = buildModuleColumnOrder(columns)
  const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
  const normalizedOrder =
    sanitizedOrder.length > 0 ? sanitizedOrder : fallbackOrder
  const normalizedTargetKey = String(targetKey || '').trim()
  const currentIndex = normalizedOrder.indexOf(normalizedTargetKey)
  if (currentIndex < 0) {
    return normalizedOrder
  }
  const nextIndex = currentIndex + Number(direction || 0)
  if (nextIndex < 0 || nextIndex >= normalizedOrder.length) {
    return normalizedOrder
  }
  const nextOrder = normalizedOrder.slice()
  const [movedKey] = nextOrder.splice(currentIndex, 1)
  nextOrder.splice(nextIndex, 0, movedKey)
  return nextOrder
}

export const repositionModuleColumnOrder = (
  order = [],
  columns = [],
  targetKey = '',
  targetIndex = 0
) => {
  const fallbackOrder = buildModuleColumnOrder(columns)
  const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
  const normalizedOrder =
    sanitizedOrder.length > 0 ? sanitizedOrder : fallbackOrder
  const normalizedTargetKey = String(targetKey || '').trim()
  const currentIndex = normalizedOrder.indexOf(normalizedTargetKey)
  if (currentIndex < 0) {
    return normalizedOrder
  }
  const boundedTargetIndex = Math.min(
    Math.max(Number(targetIndex || 0), 0),
    normalizedOrder.length - 1
  )
  if (boundedTargetIndex === currentIndex) {
    return normalizedOrder
  }
  const nextOrder = normalizedOrder.slice()
  const [movedKey] = nextOrder.splice(currentIndex, 1)
  nextOrder.splice(boundedTargetIndex, 0, movedKey)
  return nextOrder
}
