function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function cleanText(value) {
  return String(value || '').trim()
}

export function getWorkflowTaskReasonMeta(task = {}) {
  const payload = payloadOf(task)
  const statusKey = cleanText(task.task_status_key)
  const blockedReason =
    cleanText(task.blocked_reason) || cleanText(payload.blocked_reason)
  const rejectedReason =
    cleanText(task.rejected_reason) || cleanText(payload.rejected_reason)
  const businessReason =
    cleanText(task.business_status_reason) ||
    cleanText(payload.business_status_reason)

  if (statusKey === 'rejected') {
    return {
      kind: 'rejected',
      label: '退回原因',
      value: rejectedReason || blockedReason || businessReason,
    }
  }
  if (statusKey === 'blocked') {
    return {
      kind: 'blocked',
      label: '阻塞原因',
      value: blockedReason || rejectedReason || businessReason,
    }
  }
  if (blockedReason) {
    return { kind: 'blocked', label: '阻塞原因', value: blockedReason }
  }
  if (rejectedReason) {
    return { kind: 'rejected', label: '退回原因', value: rejectedReason }
  }
  if (businessReason) {
    return { kind: 'business', label: '处理说明', value: businessReason }
  }
  return { kind: '', label: '处理说明', value: '' }
}

export function getWorkflowTaskReason(task = {}) {
  return getWorkflowTaskReasonMeta(task).value
}

export function getWorkflowTaskReasonLabel(task = {}) {
  return getWorkflowTaskReasonMeta(task).label
}
