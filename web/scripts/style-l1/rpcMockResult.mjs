export function unsupportedRpcMethod(domain, method) {
  return {
    __style_l1_unsupported_method: {
      domain: String(domain || '').trim() || 'unknown',
      method: String(method || '').trim() || '(empty)',
    },
  }
}

export function styleRpcResult(data) {
  const unsupported = data?.__style_l1_unsupported_method
  if (unsupported) {
    return {
      code: 40010,
      message: `${unsupported.domain} method ${unsupported.method} is not supported`,
      data: {},
    }
  }
  return { code: 0, message: 'OK', data }
}

export function stylePaginatedRpcData(
  records,
  recordKey,
  params = {},
  defaultLimit = 100
) {
  const allRecords = Array.isArray(records) ? records : []
  const requestedLimit = Number(params.limit ?? defaultLimit)
  const limit =
    Number.isSafeInteger(requestedLimit) &&
    requestedLimit > 0 &&
    requestedLimit <= 200
      ? requestedLimit
      : defaultLimit
  const requestedOffset = Number(params.offset ?? 0)
  const offset =
    Number.isSafeInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0
  return {
    [recordKey]: allRecords.slice(offset, offset + limit),
    total: allRecords.length,
    limit,
    offset,
  }
}
