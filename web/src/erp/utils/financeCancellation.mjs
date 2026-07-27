import {
  normalizeOperationalFactLifecycleRequest,
  validateOperationalFactLifecycleResult,
} from './operationalFactLifecycle.mjs'

export function normalizeFinanceCancellationRequest(params = {}) {
  return normalizeOperationalFactLifecycleRequest(params, {
    requireReason: true,
  })
}

export function validateFinanceCancellationResult(task, request) {
  validateOperationalFactLifecycleResult(
    task,
    request,
    'CANCELLED',
    '财务记录已提交，但返回结果不完整，请刷新后核对'
  )
  if (
    typeof task.cancelled_by_name !== 'string' ||
    !task.cancelled_by_name.trim()
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
  const actor = String(record?.cancelled_by_name || '').trim()
  const reason = String(record?.cancel_reason || '').trim()
  if (!record?.cancelled_at || !actor || !reason) {
    return '取消记录信息不完整，请联系管理员核对'
  }
  return `${formatUnixDate(record.cancelled_at)} / ${actor} / ${reason}`
}
