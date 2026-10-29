import { presentWorkflowTaskEvent } from './workflowTaskEventPresentation.mjs'
import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'

const RESULT_EVENTS = new Set(['status_changed', 'reassigned', 'unassigned', 'urge_task', 'urge_role', 'urge_assignee', 'escalate_to_pmc', 'escalate_to_boss', 'process_resumed', 'recovery_withdrawn', 'source_cancelled_withdrawal'])

// Housekeeping and refreshed snapshots cannot replace the actual handling result.
export function workflowTaskRecordedResult(task, events = []) {
  const event = events.filter((item) => RESULT_EVENTS.has(item?.event_type))
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
  return event ? presentWorkflowTaskEvent(event, { approvalTask: isWorkflowApprovalTask(task) }) : null
}
