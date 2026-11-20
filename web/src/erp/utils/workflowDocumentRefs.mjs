export function normalizeWorkflowDocumentRef(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

export function isInternalSourceNoFallback(sourceNo, sourceID) {
  const text = normalizeWorkflowDocumentRef(sourceNo)
  if (!text) return false
  if (/^TASK[-_#]/iu.test(text)) return true

  const normalizedID = normalizeWorkflowDocumentRef(sourceID)
  if (!normalizedID) return false

  return (
    text === normalizedID ||
    text === `#${normalizedID}` ||
    text === `ID-${normalizedID}`
  )
}

function workflowSourceIDs(record = {}) {
  const payload =
    record.payload && typeof record.payload === 'object' ? record.payload : {}
  return [record.source_id, record.id, payload.source_id].filter((value) =>
    normalizeWorkflowDocumentRef(value)
  )
}

export function isInternalWorkflowDocumentRef(value, record = {}) {
  return workflowSourceIDs(record).some((sourceID) =>
    isInternalSourceNoFallback(value, sourceID)
  )
}

export function resolveReadableWorkflowSourceNo(
  record = {},
  fields = ['document_no', 'source_no', 'title']
) {
  for (const field of fields) {
    const value = normalizeWorkflowDocumentRef(record[field])
    if (value && !isInternalWorkflowDocumentRef(value, record)) {
      return value
    }
  }
  return ''
}

export function formatWorkflowRelatedDocumentRef(label, record, sourceNo) {
  const readableNo = normalizeWorkflowDocumentRef(sourceNo)
  if (readableNo && !isInternalWorkflowDocumentRef(readableNo, record)) {
    return `${label}：${readableNo}`
  }
  if (readableNo) {
    return `${label}已关联`
  }
  return ''
}
