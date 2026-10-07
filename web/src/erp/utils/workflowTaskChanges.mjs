export const WORKFLOW_TASKS_CHANGED = 'erp-workflow-tasks-changed'

// Invalidate authoritative reads after a confirmed mutation; no local count arithmetic.
export function notifyWorkflowTasksChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WORKFLOW_TASKS_CHANGED))
  }
}
