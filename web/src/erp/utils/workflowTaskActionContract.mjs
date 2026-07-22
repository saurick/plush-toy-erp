export function isWorkflowApprovalTask(task = {}) {
  const requiredCapabilityKey = String(
    task?.required_capability_key || ''
  ).trim()
  if (requiredCapabilityKey === 'workflow.task.approve') {
    return true
  }
  // Tasks created before ProcessRuntime exposed the generic node contract keep
  // the former sales-order identity as a read-only classification fallback.
  return (
    String(task?.source_type || '').trim() === 'project-orders' &&
    String(task?.task_group || '').trim() === 'order_approval' &&
    String(task?.owner_role_key || '').trim() === 'boss'
  )
}

export const isWorkflowBossOrderApprovalTask = isWorkflowApprovalTask

export function getWorkflowTaskActionPermission(actionMode = '', task = {}) {
  if (actionMode === 'complete') {
    return isWorkflowApprovalTask(task)
      ? 'workflow.task.approve'
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
