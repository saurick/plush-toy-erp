function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function normalizedUpperText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

export function resolveOperationalFactRouteRecord(
  records = [],
  {
    activeKey = '',
    factID = 0,
    sourceType = '',
    sourceID = 0,
    total = undefined,
  } = {}
) {
  const rows = Array.isArray(records) ? records : []
  const normalizedFactID = positiveID(factID)
  if (activeKey === 'production' && normalizedFactID) {
    return (
      rows.find((record) => positiveID(record?.id) === normalizedFactID) || null
    )
  }

  const normalizedSourceType = normalizedUpperText(sourceType)
  const normalizedSourceID = positiveID(sourceID)
  if (
    activeKey !== 'finance' ||
    !normalizedSourceType ||
    !normalizedSourceID
  ) {
    return null
  }

  const sourceRows = rows.filter(
    (record) =>
      normalizedUpperText(record?.source_type) === normalizedSourceType &&
      positiveID(record?.source_id) === normalizedSourceID
  )
  const activeRows = sourceRows.filter(
    (record) => normalizedUpperText(record?.status) !== 'CANCELLED'
  )
  if (activeRows.length === 1) return activeRows[0]
  if (activeRows.length > 1) return null
  const normalizedTotal = Number(total)
  const hasKnownTotal = Number.isSafeInteger(normalizedTotal) && normalizedTotal >= 0
  return sourceRows.length === 1 && (!hasKnownTotal || normalizedTotal === 1)
    ? sourceRows[0]
    : null
}
