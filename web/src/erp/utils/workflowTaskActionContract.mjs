const WORKFLOW_APPROVAL_CAPABILITY_KEYS = new Set([
  'workflow.task.approve',
  'sales_return.approve',
  'finance.payment.approve',
  'warehouse.adjustment.approve',
  'production.exception.approve',
])

const WORKFLOW_PROCESS_DECISION_PROFILE_BY_CAPABILITY = Object.freeze({
  'sales_return.approve': 'sales_return_approval',
  'finance.payment.approve': 'finance_payment_approval',
  'warehouse.adjustment.approve': 'inventory_adjustment_approval',
  'production.exception.approve': 'production_exception_approval',
})

export function isWorkflowApprovalTask(task = {}) {
  const requiredCapabilityKey = String(
    task?.required_capability_key || ''
  ).trim()
  return WORKFLOW_APPROVAL_CAPABILITY_KEYS.has(requiredCapabilityKey)
}

export function isWorkflowProcessDecisionTask(task = {}) {
  return Boolean(getWorkflowProcessDecisionApprovalProfile(task))
}

export function getWorkflowProcessDecisionApprovalProfile(task = {}) {
  return (
    WORKFLOW_PROCESS_DECISION_PROFILE_BY_CAPABILITY[
      String(task?.required_capability_key || '').trim()
    ] || ''
  )
}

export function workflowTaskAllowsApprovedQuantity(task = {}) {
  return (
    String(task?.required_capability_key || '').trim() ===
    'production.exception.approve'
  )
}

export const isWorkflowBossOrderApprovalTask = isWorkflowApprovalTask

export function getWorkflowTaskActionPermission(actionMode = '', task = {}) {
  if (actionMode === 'complete') {
    return isWorkflowApprovalTask(task)
      ? String(task?.required_capability_key || '').trim()
      : 'workflow.task.complete'
  }
  if (actionMode === 'reject') return 'workflow.task.reject'
  if (
    actionMode === 'block' ||
    actionMode === 'resume' ||
    actionMode === 'urge'
  ) {
    return 'workflow.task.update'
  }
  return ''
}

export function getWorkflowTaskActionStatusKey(actionMode = '') {
  if (actionMode === 'complete') return 'done'
  if (actionMode === 'block') return 'blocked'
  if (actionMode === 'reject') return 'rejected'
  if (actionMode === 'resume') return 'ready'
  if (actionMode === 'urge') return ''
  return ''
}

const WORKFLOW_TASK_ACTION_MODES_BY_STATUS = Object.freeze({
  ready: Object.freeze(['complete', 'block', 'reject', 'urge']),
  blocked: Object.freeze(['resume', 'urge']),
})

export function getWorkflowTaskStatusActionModes(taskOrStatus = '') {
  const statusKey = String(
    typeof taskOrStatus === 'string'
      ? taskOrStatus
      : taskOrStatus?.task_status_key || ''
  ).trim()
  return WORKFLOW_TASK_ACTION_MODES_BY_STATUS[statusKey] || []
}

export function canWorkflowTaskStatusRunAction(taskOrStatus, actionMode = '') {
  return getWorkflowTaskStatusActionModes(taskOrStatus).includes(actionMode)
}
