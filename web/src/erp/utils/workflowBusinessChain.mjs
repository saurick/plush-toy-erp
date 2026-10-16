import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { getWorkflowTaskOwnerRoleLabel, getWorkflowTaskStatusMeta } from './workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { workflowTaskDiscoveryCatalog as catalog } from './workflowTaskDiscovery.mjs'
import { PRODUCTION_WIP_OPERATION_LABELS } from './productionWipModel.mjs'

// Presentation groups retain the catalog's detailed stages and never imply fact completion.
const OVERVIEW_GROUPS = [
  ['order', '订单准备', ['sales_order', 'customer_advance']],
  ['purchase', '采购入库', ['purchasing', 'supplier_advance', 'purchase_count', 'incoming_quality']],
  ['production', '生产加工', ['cutting_issue', 'cutting_return', 'cutting_quality', 'sewing_execute', 'shell_quality', 'handwork_execute']],
  ['inbound', '成品入库', ['finished_inbound']],
  ['packing', '检验与包装', ['finished_quality', 'packaging']],
  ['shipping', '放行与发货', ['shipment']],
  ['settlement', '对账结清', ['financial_settlement']],
]

function taskPresentation(task) {
  const name = getWorkflowTaskDisplayName(task)
  const roleLabel = getWorkflowTaskOwnerRoleLabel(task)
  const personLabel = String(task.discovery?.assignee_name || '').trim()
  const assigned = task.assignee_id > 0 || Boolean(personLabel)
  const statusLabel = getWorkflowTaskStatusMeta(task).label
  const responsibilityLabel = task.task_status_key === WorkflowTaskStatus.READY
    ? assigned ? [roleLabel, personLabel || '已分配', '待办理'].join(' · ') : `待${roleLabel}领取`
    : [roleLabel, personLabel, statusLabel].filter(Boolean).join(' · ')
  const seen = new Set()
  const references = [
    { label: '批次', value: String(task.batch_no || '').trim() },
    { label: '来源', value: String(task.source_no || '').trim() },
  ].filter(({ value }) => {
    if (!value || seen.has(value)) return false
    seen.add(value)
    return ![value, ` ${value}`, `：${value}`, `（${value}）`].some((suffix) => name === suffix || (suffix !== value && name.endsWith(suffix)))
  })
  return { name, roleLabel, personLabel, statusLabel, responsibilityLabel, references, operationLabel: PRODUCTION_WIP_OPERATION_LABELS[task.operation_code] || '' }
}

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
    const matches = catalog.fulfillment_flow.filter((step) => step.stages.includes(stage?.key))
    const key = matches.length === 1 ? matches[0].stage : stage?.key || 'unclassified'
    const detail = { ...task, ...taskPresentation(task), stageLabel: stage?.label || '', current: task.id === currentTaskID }
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
    open: group.tasks.filter((task) => [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.task_status_key)).length,
    blocked: group.tasks.some((task) => task.task_status_key === WorkflowTaskStatus.BLOCKED),
    tasks: [...group.tasks].sort((a, b) => Number(b.current) - Number(a.current) || Number(b.task_status_key === WorkflowTaskStatus.BLOCKED) - Number(a.task_status_key === WorkflowTaskStatus.BLOCKED) || Number(b.task_status_key === WorkflowTaskStatus.READY) - Number(a.task_status_key === WorkflowTaskStatus.READY) || a.id - b.id),
  })
  const mainGroups = [...main.values()].map(decorate)
  const exceptionGroups = [...exceptions.values()].map(decorate)
  const knownStages = new Set(OVERVIEW_GROUPS.flatMap(([, , stages]) => stages))
  const unknownGroups = mainGroups.filter((group) => !knownStages.has(group.key))
  const summarize = (key, label, groups) => {
    const group = decorate({ key, label, groups, tasks: groups.flatMap((item) => item.tasks) })
    const blocked = group.tasks.filter((item) => item.task_status_key === WorkflowTaskStatus.BLOCKED).length
    const ended = group.tasks.every((item) => [WorkflowTaskStatus.DONE, WorkflowTaskStatus.REJECTED, WorkflowTaskStatus.WITHDRAWN].includes(item.task_status_key))
    return { ...group,
      tone: blocked ? 'blocked' : group.open ? 'active' : 'neutral',
      statusLabel: !group.tasks.length ? '暂无可见任务' : blocked ? `${blocked} 项受阻` : group.open ? `${group.open} 项待处理` : ended ? '可见任务已结束' : '状态待核对',
    }
  }
  const overview = OVERVIEW_GROUPS.map(([key, label, stages]) => summarize(key, label, mainGroups.filter((group) => stages.includes(group.key))))
  if (unknownGroups.length) overview.push(summarize('unclassified', '环节待核对', unknownGroups))
  if (exceptionGroups.length) overview.push({ ...summarize('exceptions', '异常处理', exceptionGroups), exception: true })
  return { tasks, main: mainGroups, exceptions: exceptionGroups, overview, truncated: data.truncated }
}
