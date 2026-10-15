const FALLBACK_COLUMN_KEY_PREFIX = '__column__'
const BUSINESS_TABLE_TEXT_COLLATOR = new Intl.Collator(['zh-Hans-CN', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

export const getModuleColumnKey = (column = {}, index = 0) =>
  String(
    column?.dataIndex || column?.key || `${FALLBACK_COLUMN_KEY_PREFIX}${index}`
  )

export const resolveModuleColumnKey = (column = {}, columns = []) => {
  if (column?.dataIndex || column?.key) {
    return getModuleColumnKey(column)
  }

  const matchedIndex = (Array.isArray(columns) ? columns : []).findIndex(
    (item) => item === column
  )
  return getModuleColumnKey(column, matchedIndex >= 0 ? matchedIndex : 0)
}

const isModuleColumnVisible = (column = {}) =>
  column?.hiddenByEffectiveFieldPolicy !== true && column?.hidden !== true

const visibleModuleColumns = (columns = []) =>
  (Array.isArray(columns) ? columns : []).filter(isModuleColumnVisible)

export const filterBusinessListColumns = (columns = []) =>
  visibleModuleColumns(columns)

export const buildModuleColumnOrder = (columns = []) =>
  (Array.isArray(columns) ? columns : [])
    // 先确定列标识，再调整默认顺序，避免展示列的已保存偏好随位置改变。
    .map((column, index) => ({
      key: getModuleColumnKey(column, index),
      priority: Number.isFinite(column.defaultPriority)
        ? column.defaultPriority
        : Number.MAX_SAFE_INTEGER,
      available: isModuleColumnVisible(column),
      index,
    }))
    .filter((column) => column.available)
    .sort(
      (left, right) =>
        left.priority - right.priority || left.index - right.index
    )
    .map(({ key }) => key)

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

export const completeModuleColumnOrder = (order = [], columns = []) => {
  const saved = sanitizeModuleColumnOrder(order, columns)
  const savedKeys = new Set(saved)
  return [
    ...saved,
    ...buildModuleColumnOrder(columns).filter((key) => !savedKeys.has(key)),
  ]
}

export const sanitizeModuleHiddenColumns = (hidden = [], columns = []) => {
  const keys = buildModuleColumnOrder(columns)
  const hiddenKeys = sanitizeModuleColumnOrder(hidden, columns)
  // 即使字段权限或列定义改变，也至少保留一个可用的数据列。
  return keys.length > 0 && hiddenKeys.length === keys.length
    ? hiddenKeys.filter((key) => key !== keys[0])
    : hiddenKeys
}

export const buildDefaultModuleHiddenColumns = (columns = []) =>
  sanitizeModuleHiddenColumns(
    columns
      .map((column, index) =>
        column.defaultHidden === true ? getModuleColumnKey(column, index) : null
      )
      .filter(Boolean),
    columns
  )

export const resolveModuleHiddenColumns = (order, hidden, columns = []) => {
  const savedOrder = new Set(sanitizeModuleColumnOrder(order, columns))
  // 新开放的可选列沿用系统默认，已保存的个人勾选优先。
  return sanitizeModuleHiddenColumns(
    [
      ...sanitizeModuleHiddenColumns(hidden, columns),
      ...buildDefaultModuleHiddenColumns(columns).filter(
        (key) => !savedOrder.has(key)
      ),
    ],
    columns
  )
}

export const buildModuleColumnSettings = (order, hidden, columns = []) => {
  const completeOrder = completeModuleColumnOrder(order, columns)
  const defaultOrder = buildModuleColumnOrder(columns)
  const normalizedHidden = sanitizeModuleHiddenColumns(hidden, columns)
  const defaultHidden = buildDefaultModuleHiddenColumns(columns)
  const isDefault =
    completeOrder.every((key, index) => key === defaultOrder[index]) &&
    normalizedHidden.length === defaultHidden.length &&
    defaultHidden.every((key) => normalizedHidden.includes(key))
  // 空排列表示恢复系统默认；完整排列也能明确保存“全部显示”。
  return isDefault
    ? { order: [], hidden_columns: [] }
    : { order: completeOrder, hidden_columns: normalizedHidden }
}

export const applyModuleColumnVisibility = (columns = [], hidden = []) => {
  const hiddenKeys = new Set(sanitizeModuleHiddenColumns(hidden, columns))
  return filterBusinessListColumns(columns).filter(
    (column) => !hiddenKeys.has(resolveModuleColumnKey(column, columns))
  )
}

export const applyModuleColumnOrder = (columns = [], order = []) => {
  const keyToColumn = new Map(
    (Array.isArray(columns) ? columns : []).map((column, index) => [
      getModuleColumnKey(column, index),
      column,
    ])
  )
  const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
  const orderedColumns = sanitizedOrder
    .map((key) => keyToColumn.get(key))
    .filter(Boolean)
  const orderedKeySet = new Set(sanitizedOrder)
  const remainingColumns = buildModuleColumnOrder(columns)
    .filter((key) => !orderedKeySet.has(key))
    .map((key) => keyToColumn.get(key))
  return [...orderedColumns, ...remainingColumns]
}

export const moveModuleColumnOrder = (
  order = [],
  columns = [],
  targetKey = '',
  direction = 0
) => {
  const normalizedOrder = completeModuleColumnOrder(order, columns)
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
  const normalizedOrder = completeModuleColumnOrder(order, columns)
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

const isBlankBusinessTableValue = (value) => {
  if (Array.isArray(value)) {
    return value.length === 0
  }
  return value === null || value === undefined || String(value).trim() === ''
}

const isNumericBusinessTableValue = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return false
  }
  return Number.isFinite(Number(value))
}

export const getBusinessTableSortValue = (record, column = {}) => {
  if (typeof column.sortValue === 'function') {
    return column.sortValue(record)
  }
  const dataIndex = column.sortDataIndex || column.dataIndex
  if (!record || !dataIndex) {
    return undefined
  }
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((current, key) => current?.[key], record)
  }
  if (Object.prototype.hasOwnProperty.call(record, dataIndex)) {
    return record[dataIndex]
  }
  return String(dataIndex)
    .split('.')
    .reduce((current, key) => current?.[key], record)
}

export const compareBusinessTableValues = (
  leftValue,
  rightValue,
  sortOrder = 'ascend',
  sortType = 'auto'
) => {
  const leftBlank = isBlankBusinessTableValue(leftValue)
  const rightBlank = isBlankBusinessTableValue(rightValue)
  if (leftBlank || rightBlank) {
    if (leftBlank && rightBlank) return 0
    const blankResult = leftBlank ? 1 : -1
    return sortOrder === 'descend' ? -blankResult : blankResult
  }

  if (
    sortType === 'number' ||
    sortType === 'date' ||
    (sortType === 'auto' &&
      isNumericBusinessTableValue(leftValue) &&
      isNumericBusinessTableValue(rightValue))
  ) {
    return Number(leftValue) - Number(rightValue)
  }

  if (sortType === 'boolean') {
    return Number(Boolean(leftValue)) - Number(Boolean(rightValue))
  }

  if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
    return leftValue.length - rightValue.length
  }

  return BUSINESS_TABLE_TEXT_COLLATOR.compare(
    String(leftValue),
    String(rightValue)
  )
}

export const createBusinessColumnSorter = (column = {}) => {
  if (!column?.dataIndex && typeof column?.sortValue !== 'function') {
    return undefined
  }
  return (left, right, sortOrder) =>
    compareBusinessTableValues(
      getBusinessTableSortValue(left, column),
      getBusinessTableSortValue(right, column),
      sortOrder,
      column.sortType || 'auto'
    )
}

const shouldSkipBusinessColumnSorter = (column = {}) => {
  if (column.sortable === false || column.sorter !== undefined) {
    return true
  }
  const key = String(column.key || column.dataIndex || '').trim()
  return key === 'actions' || key === 'operation'
}

export const applyBusinessColumnSorters = (columns = []) =>
  (Array.isArray(columns) ? columns : []).map((column) => {
    if (!column || typeof column !== 'object') {
      return column
    }
    if (Array.isArray(column.children) && column.children.length > 0) {
      return {
        ...column,
        children: applyBusinessColumnSorters(column.children),
      }
    }
    if (shouldSkipBusinessColumnSorter(column)) {
      return column
    }
    const sorter = createBusinessColumnSorter(column)
    return sorter
      ? {
          ...column,
          sorter,
        }
      : column
  })
