const normalizeSortOrder = (sortOrder) => (sortOrder === 'asc' ? 'asc' : 'desc')

const toFiniteNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
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

export const sortModuleRecords = (records = [], sortOrder = 'desc') => {
  if (!Array.isArray(records)) {
    return []
  }

  const normalizedOrder = normalizeSortOrder(sortOrder)
  const nextRecords = [...records]
  nextRecords.sort((left, right) =>
    compareByCreatedAt(left, right, normalizedOrder)
  )
  return nextRecords
}
