const DEFAULT_AUDIT_LOG_LIMIT = 20

function normalizeString(value) {
  return String(value || '').trim()
}

export function buildAuditLogParams({
  source = '',
  eventKey = '',
  keyword = '',
  createdFrom = '',
  createdTo = '',
  pageSize = DEFAULT_AUDIT_LOG_LIMIT,
  offset = 0,
} = {}) {
  const params = {
    limit: Number(pageSize) > 0 ? Number(pageSize) : DEFAULT_AUDIT_LOG_LIMIT,
    offset: Number(offset) >= 0 ? Number(offset) : 0,
  }

  const normalizedSource = normalizeString(source)
  if (normalizedSource) {
    params.source = normalizedSource
  }

  const normalizedEventKey = normalizeString(eventKey)
  if (normalizedEventKey) {
    params.event_key = normalizedEventKey
  }

  const normalizedKeyword = normalizeString(keyword)
  if (normalizedKeyword) {
    params.keyword = normalizedKeyword
  }

  const normalizedCreatedFrom = normalizeString(createdFrom)
  if (normalizedCreatedFrom) {
    params.created_from = normalizedCreatedFrom
  }

  const normalizedCreatedTo = normalizeString(createdTo)
  if (normalizedCreatedTo) {
    params.created_to = normalizedCreatedTo
  }

  return params
}
