export function normalizeFinanceCancellationRequest(params = {}) {
  const id = Number(params?.id)
  const reason = typeof params?.reason === 'string' ? params.reason.trim() : ''
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !reason ||
    [...reason].length > 255
  ) {
    throw new TypeError('财务记录或取消原因不正确')
  }
  return { id, reason }
}

export function validateFinanceCancellationResult(task, request) {
  if (
    !task ||
    typeof task !== 'object' ||
    Number(task.id) !== request.id ||
    task.status !== 'CANCELLED' ||
    !Number.isSafeInteger(Number(task.cancelled_at)) ||
    Number(task.cancelled_at) <= 0 ||
    typeof task.cancelled_by_name !== 'string' ||
    !task.cancelled_by_name.trim() ||
    typeof task.cancel_reason !== 'string' ||
    !task.cancel_reason.trim() ||
    task.cancel_audit_legacy === true
  ) {
    const error = new Error('财务记录已提交，但返回结果不完整，请刷新后核对')
    error.isInvalidResponse = true
    throw error
  }
  return task
}

export function financeCancelAuditText(record, formatUnixDate) {
  if (record?.status !== 'CANCELLED') {
    return '-'
  }
  if (record?.cancel_audit_legacy) {
    return '历史记录，取消审计信息缺失'
  }
  const actor = String(record?.cancelled_by_name || '').trim()
  const reason = String(record?.cancel_reason || '').trim()
  if (!record?.cancelled_at || !actor || !reason) {
    return '取消记录信息不完整，请联系管理员核对'
  }
  return `${formatUnixDate(record.cancelled_at)} / ${actor} / ${reason}`
}
