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
    params.created_from = /^\d{4}-\d{2}-\d{2}$/u.test(normalizedCreatedFrom)
      ? `${normalizedCreatedFrom}T00:00:00+08:00`
      : normalizedCreatedFrom
  }

  const normalizedCreatedTo = normalizeString(createdTo)
  if (normalizedCreatedTo) {
    params.created_to = /^\d{4}-\d{2}-\d{2}$/u.test(normalizedCreatedTo)
      ? `${normalizedCreatedTo}T23:59:59.999999999+08:00`
      : normalizedCreatedTo
  }

  return params
}
