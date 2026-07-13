export function isWorkflowBossOrderApprovalTask(task = {}) {
  return (
    String(task?.source_type || '').trim() === 'project-orders' &&
    String(task?.task_group || '').trim() === 'order_approval' &&
    String(task?.owner_role_key || '').trim() === 'boss'
  )
}

export function getWorkflowTaskActionPermission(actionMode = '', task = {}) {
  if (actionMode === 'complete') {
    return isWorkflowBossOrderApprovalTask(task)
      ? 'workflow.task.approve'
      : 'workflow.task.complete'
  }
  if (actionMode === 'reject') return 'workflow.task.reject'
  if (actionMode === 'block' || actionMode === 'urge') {
    return 'workflow.task.update'
  }
  return ''
}

export function getWorkflowTaskActionStatusKey(actionMode = '') {
  if (actionMode === 'complete') return 'done'
  if (actionMode === 'block') return 'blocked'
  if (actionMode === 'reject') return 'rejected'
  if (actionMode === 'urge') return ''
  return ''
}
