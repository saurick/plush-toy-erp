import { getWorkflowTaskOwnerRoleLabel, getWorkflowTaskStatusMeta } from './workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { workflowTaskDiscoveryCatalog as catalog } from './workflowTaskDiscovery.mjs'

export function supportsWorkflowBusinessChain(task) {
  return ['sales_order', 'engineering_material_request', 'purchase_order', 'purchase_receipt', 'production_order', 'production-orders',
    'production_wip_batch', 'production_packaging_confirmation', 'production_fact', 'production-progress', 'quality_inspection',
    'outsourcing_order', 'outsourcing_fact', 'production_exception_decision', 'shipment', 'shipments'].includes(task?.source_type)
}

export function buildWorkflowBusinessChain(data, currentTaskID) {
  const main = new Map(catalog.fulfillment_flow.map((step) => [step.stage, { key: step.stage, label: step.label, role: step.role, role_keys: step.role_keys, stages: step.stages, tasks: [] }]))
  const exceptions = new Map()
  const tasks = []
  for (const task of data.items) {
    const stage = catalog.stages.find((item) => item.key === task.discovery?.stage_key)
    const key = catalog.fulfillment_flow.find((step) => step.stages.includes(stage?.key))?.stage || stage?.key || 'unclassified'
    const detail = { ...task, name: getWorkflowTaskDisplayName(task), current: task.id === currentTaskID, roleLabel: getWorkflowTaskOwnerRoleLabel(task), personLabel: task.discovery?.assignee_name || '岗位待领取', statusLabel: getWorkflowTaskStatusMeta(task).label }
    tasks.push(detail)
    const isException = task.exception_id > 0 || ['handoff_production_exception', 'handoff_receipt_exception', 'purchase_quality_exception', 'outsource_quality_exception', 'production_exception', 'finished_goods_rework'].includes(task.task_group) || task.source_type === 'production_exception_decision'
    if (isException) {
      const branchKey = task.exception_id > 0 ? `decision-${task.exception_id}` : `issue-${task.batch_no || task.id}`
      if (!exceptions.has(branchKey)) exceptions.set(branchKey, { key: branchKey, label: `${task.discovery?.path || '质量异常'}${task.exception_no ? ` · ${task.exception_no}` : ''}`, tasks: [] })
      exceptions.get(branchKey).tasks.push(detail)
    } else {
      if (!main.has(key)) main.set(key, { key, label: task.discovery?.path || '环节待核对', tasks: [] })
      main.get(key).tasks.push(detail)
    }
  }
  const decorate = (group) => ({ ...group,
    current: group.tasks.some((task) => task.current),
    open: group.tasks.filter((task) => ['ready', 'blocked'].includes(task.task_status_key)).length,
    blocked: group.tasks.some((task) => task.task_status_key === 'blocked'),
    tasks: [...group.tasks].sort((a, b) => Number(b.current) - Number(a.current) || Number(b.task_status_key === 'blocked') - Number(a.task_status_key === 'blocked') || a.id - b.id),
  })
  return { tasks, main: [...main.values()].map(decorate), exceptions: [...exceptions.values()].map(decorate), truncated: data.truncated }
}
