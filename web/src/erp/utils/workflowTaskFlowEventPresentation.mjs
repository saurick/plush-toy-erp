import { presentWorkflowTaskEvent } from './workflowTaskEventPresentation.mjs'
import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'

export function buildWorkflowTaskFlowEventItems({
  events = [],
  task = {},
  scope = 'flow',
}) {
  return events.map((event, index) => {
    const source = scope === 'flow' ? event.task : task
    const current = Number(event.task_id || source.id) === Number(task.id)
    return {
      ...presentWorkflowTaskEvent(event, {
        index,
        task: source,
        approvalTask: isWorkflowApprovalTask(source),
      }),
      sourceLabel: current ? '本任务' : source.task_name,
      taskName: source.task_name,
    }
  })
}
