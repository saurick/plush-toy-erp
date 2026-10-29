export const WORKFLOW_TASK_BLOCK_REASONS = Object.freeze([
  '等资料',
  '等确认',
  '等材料到货',
  '等前序处理',
  '人员或设备问题',
  '其他',
  '原因待查',
])

export const WORKFLOW_TASK_BLOCK_REASON_LIMIT = 180

// Presets are input shortcuts for the existing reason, not stored classifications.
export function splitWorkflowTaskBlockReason(value = '') {
  const reason = String(value || '')
  const choice = WORKFLOW_TASK_BLOCK_REASONS.find(
    (label) => reason === label || reason.startsWith(`${label}：`)
  ) || ''
  return {
    choice,
    detail: choice ? reason.slice(choice.length + 1) : reason,
  }
}

export function buildWorkflowTaskBlockReason({ choice = '', detail = '' } = {}) {
  if (!WORKFLOW_TASK_BLOCK_REASONS.includes(choice)) return detail
  return detail.trim() ? `${choice}：${detail}` : choice
}

export function isWorkflowTaskBlockReasonReady(value = '') {
  return Boolean(splitWorkflowTaskBlockReason(value).choice) &&
    String(value || '').length <= WORKFLOW_TASK_BLOCK_REASON_LIMIT
}
