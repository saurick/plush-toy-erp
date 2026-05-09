const DEFAULT_SORT_DATA_INDEX = 'created_at'
const TEXT_COLLATOR = new Intl.Collator(['en', 'zh-Hans-CN'], {
  numeric: true,
  sensitivity: 'base',
})

const normalizeSortOrder = (sortOrder) =>
  sortOrder === 'asc' || sortOrder === 'ascend' ? 'asc' : 'desc'

const normalizeSortSpec = (sortSpec) => {
  if (!sortSpec || typeof sortSpec === 'string') {
    return {
      dataIndex: DEFAULT_SORT_DATA_INDEX,
      order: normalizeSortOrder(sortSpec),
    }
  }
  return {
    dataIndex:
      sortSpec.dataIndex ||
      sortSpec.field ||
      sortSpec.columnKey ||
      DEFAULT_SORT_DATA_INDEX,
    order: normalizeSortOrder(sortSpec.order || sortSpec.sortOrder),
  }
}

const toFiniteNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isBlankValue = (value) => {
  if (Array.isArray(value)) {
    return value.length === 0
  }
  return value === null || value === undefined || String(value).trim() === ''
}

const isNumericValue = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return false
  }
  return Number.isFinite(Number(value))
}

const getValueByDataIndex = (record, dataIndex) => {
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

const compareByCreatedAt = (left, right, sortOrder) => {
  const leftCreatedAt = toFiniteNumber(left?.created_at)
  const rightCreatedAt = toFiniteNumber(right?.created_at)
  if (leftCreatedAt !== rightCreatedAt) {
    return sortOrder === 'asc'
      ? leftCreatedAt - rightCreatedAt
      : rightCreatedAt - leftCreatedAt
  }

  const leftID = toFiniteNumber(left?.id)
  const rightID = toFiniteNumber(right?.id)
  return sortOrder === 'asc' ? leftID - rightID : rightID - leftID
}

const compareModuleValues = (leftValue, rightValue, sortOrder) => {
  const leftBlank = isBlankValue(leftValue)
  const rightBlank = isBlankValue(rightValue)
  if (leftBlank || rightBlank) {
    if (leftBlank && rightBlank) return 0
    return leftBlank ? 1 : -1
  }

  const direction = sortOrder === 'asc' ? 1 : -1
  if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
    return (leftValue.length - rightValue.length) * direction
  }
  if (isNumericValue(leftValue) && isNumericValue(rightValue)) {
    return (Number(leftValue) - Number(rightValue)) * direction
  }
  return (
    TEXT_COLLATOR.compare(String(leftValue), String(rightValue)) * direction
  )
}

export const sortModuleRecords = (records = [], sortSpec = 'desc') => {
  if (!Array.isArray(records)) {
    return []
  }

  const { dataIndex, order } = normalizeSortSpec(sortSpec)
  const nextRecords = [...records]
  nextRecords.sort((left, right) => {
    if (dataIndex === DEFAULT_SORT_DATA_INDEX) {
      return compareByCreatedAt(left, right, order)
    }
    const comparedValue = compareModuleValues(
      getValueByDataIndex(left, dataIndex),
      getValueByDataIndex(right, dataIndex),
      order
    )
    if (comparedValue !== 0) {
      return comparedValue
    }
    return compareByCreatedAt(left, right, 'desc')
  })
  return nextRecords
}
