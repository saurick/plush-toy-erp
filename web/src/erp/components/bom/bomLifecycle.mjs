function bomStatusKey(recordOrStatus) {
  return String(
    typeof recordOrStatus === 'string'
      ? recordOrStatus
      : recordOrStatus?.status || ''
  )
    .trim()
    .toUpperCase()
}

export function canActivateBOM(recordOrStatus) {
  return ['DRAFT', 'ARCHIVED'].includes(bomStatusKey(recordOrStatus))
}

export function canArchiveBOM(recordOrStatus) {
  return ['DRAFT', 'ACTIVE'].includes(bomStatusKey(recordOrStatus))
}

export function canRequestBOMArchive(recordOrStatus) {
  return ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(bomStatusKey(recordOrStatus))
}

export function canEditBOM(recordOrStatus) {
  return bomStatusKey(recordOrStatus) === 'DRAFT'
}

export function canCopyBOM(recordOrStatus) {
  return ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(bomStatusKey(recordOrStatus))
}

export async function runBOMArchiveBatch({
  records = [],
  archive,
  refresh,
} = {}) {
  const requestedRecords = Array.isArray(records) ? records : []
  let archivedCount = 0
  let archiveError = null
  let refreshError = null

  for (const record of requestedRecords) {
    try {
      await archive(record)
      archivedCount += 1
    } catch (error) {
      archiveError = error
      break
    }
  }

  if (requestedRecords.length > 0) {
    try {
      const refreshed = await refresh()
      if (refreshed === false) {
        refreshError = new Error('BOM version refresh returned false')
      }
    } catch (error) {
      refreshError = error
    }
  }

  return { archivedCount, archiveError, refreshError }
}
