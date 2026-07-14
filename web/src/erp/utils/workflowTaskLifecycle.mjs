export const TERMINAL_WORKFLOW_TASK_STATUS_KEYS = Object.freeze([
  'done',
  'rejected',
])

export const TERMINAL_TASK_STATUS_KEYS = new Set(
  TERMINAL_WORKFLOW_TASK_STATUS_KEYS
)

export function getWorkflowTaskLifecycleStatusKey(task = {}) {
  return String(task.task_status_key || '').trim()
}

export function isTerminalWorkflowTask(task = {}) {
  return TERMINAL_TASK_STATUS_KEYS.has(getWorkflowTaskLifecycleStatusKey(task))
}
