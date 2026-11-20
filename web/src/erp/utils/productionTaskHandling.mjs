import { ProductionWIPStatus } from '../../common/consts/statuses.generated.mjs'
import { canonicalBusinessPath } from './businessTaskRoute.mjs'
import { resolveWorkflowTaskEntryPath } from './dashboardTaskDisplay.mjs'
import { PRODUCTION_WIP_ACTION } from './productionWipModel.mjs'

// Task identity selects a form. Permissions and current business state still
// decide whether the form can submit through the existing business usecase.
export function productionTaskHandling(task, entryPath) {
  const canonicalPath = canonicalBusinessPath(entryPath)
  if (!canonicalPath || canonicalPath !== resolveWorkflowTaskEntryPath(task)) return null
  const group = String(task?.task_group || '')
  if (!group.startsWith('handoff_production_')) return null
  if (['done', 'withdrawn', 'cancelled'].includes(task.task_status_key)) return null
  return { taskID: task.id, group, sourceID: Number(task.source_id), sourceType: task.source_type }
}

export function productionTaskWipAction(handling, batch) {
  if (!handling || !batch) return ''
  const { group } = handling
  const { ASSIGN_EXECUTION, START_OPERATION, COMPLETE_OPERATION, RECEIVE_OUTSOURCING_RETURN,
    TRANSFER_TO_NEXT_OPERATION, CONFIRM_PACKAGING_MATERIAL } = PRODUCTION_WIP_ACTION
  if (group === 'handoff_production_packaging') return CONFIRM_PACKAGING_MATERIAL
  if (Number(batch.id) !== handling.sourceID) return ''
  if (['handoff_production_transfer', 'handoff_production_packaging_transfer'].includes(group)) return TRANSFER_TO_NEXT_OPERATION
  if (group === 'handoff_production_return') return RECEIVE_OUTSOURCING_RETURN
  if (['handoff_production_execute', 'handoff_production_cutting_issue', 'handoff_production_packaging_execute'].includes(group)) {
    if (batch.status === ProductionWIPStatus.PLANNED) return batch.execution_mode ? START_OPERATION : ASSIGN_EXECUTION
    if (batch.status === ProductionWIPStatus.IN_PROGRESS) return COMPLETE_OPERATION
  }
  return ''
}

export function retainReturnedWorkflowTask(tasks, returned, position) {
  if (!returned?.id) return tasks
  const result = [...tasks]
  const existing = result.findIndex((task) => task.id === returned.id)
  const index = existing >= 0 ? existing : Math.min(result.length, Math.max(0, position?.rowIndex || 0))
  result.splice(index, existing >= 0 ? 1 : 0, { ...returned, returnedToPosition: true })
  return result
}
