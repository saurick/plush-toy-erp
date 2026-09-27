export function resolveBusinessStatusCounts(
  response,
  { hasExactContext = false, exactRecord = null, statusField = 'status' } = {}
) {
  // A linked single record is a complete result, unlike a paginated list.
  if (hasExactContext) {
    if (!exactRecord) return {}
    const status = exactRecord[statusField]
    return typeof status === 'string' && status ? { [status]: 1 } : null
  }
  const counts = response?.status_counts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts))
    { return null }
  if (
    !Object.entries(counts).every(
      ([status, count]) => status && Number.isSafeInteger(count) && count >= 0
    )
  )
    { return null }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return Number.isSafeInteger(total) ? counts : null
}

export function businessStatusCount(counts, status) {
  if (!counts) return null
  return status === ''
    ? Object.values(counts).reduce((sum, count) => sum + count, 0)
    : (counts[status] ?? 0)
}
