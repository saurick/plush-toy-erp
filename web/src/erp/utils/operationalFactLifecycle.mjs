const LIFECYCLE_AUDIT_FIELDS = Object.freeze({
  POSTED: Object.freeze({ at: 'posted_at', by: 'posted_by' }),
  SETTLED: Object.freeze({ at: 'settled_at', by: 'settled_by' }),
  CANCELLED: Object.freeze({ at: 'cancelled_at', by: 'cancelled_by' }),
})

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function boundedReason(value) {
  const reason = typeof value === 'string' ? value.trim() : ''
  return reason && [...reason].length <= 255 ? reason : ''
}

export function normalizeOperationalFactLifecycleRequest(
  params = {},
  { requireReason = false } = {}
) {
  if (
    !positiveSafeInteger(params?.id) ||
    !positiveSafeInteger(params?.expected_version)
  ) {
    throw new TypeError('业务记录已变化，请刷新后重试')
  }
  const request = {
    id: params.id,
    expected_version: params.expected_version,
  }
  if (params.customer_key !== undefined) {
    if (
      typeof params.customer_key !== 'string' ||
      !params.customer_key.trim()
    ) {
      throw new TypeError('当前客户配置不正确，请重新登录后重试')
    }
    request.customer_key = params.customer_key.trim()
  }
  if (requireReason) {
    const reason = boundedReason(params.reason)
    if (!reason) {
      throw new TypeError('请填写不超过 255 个字的业务原因')
    }
    request.reason = reason
  } else if (params.reason !== undefined) {
    throw new TypeError('当前操作不接受取消原因')
  }
  return Object.freeze(request)
}

export function matchesOperationalFactLifecycleResult(
  record,
  request,
  targetStatus
) {
  const audit = LIFECYCLE_AUDIT_FIELDS[targetStatus]
  if (
    !audit ||
    !record ||
    typeof record !== 'object' ||
    record.id !== request.id ||
    record.status !== targetStatus ||
    record.version !== request.expected_version + 1 ||
    !positiveSafeInteger(record[audit.at]) ||
    !positiveSafeInteger(record[audit.by])
  ) {
    return false
  }
  return (
    targetStatus !== 'CANCELLED' ||
    (typeof record.cancel_reason === 'string' &&
      record.cancel_reason.trim() === request.reason)
  )
}

export function validateOperationalFactLifecycleResult(
  record,
  request,
  targetStatus,
  invalidResponseMessage = '操作已提交，但返回结果不完整，请刷新后核对'
) {
  if (!matchesOperationalFactLifecycleResult(record, request, targetStatus)) {
    const error = new Error(invalidResponseMessage)
    error.isInvalidResponse = true
    throw error
  }
  return record
}
