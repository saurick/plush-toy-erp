import { WorkCenterPaginationPolicy } from '../../common/consts/policies.generated.mjs'
import { resolveBusinessStatusCounts, businessStatusCount } from './businessStatusCounts.mjs'
import {
  ProcessNodeStatus,
  ProcessNodeType,
  ProcessResolution,
  ProcessStatus,
  MaterialRequestStatus,
  WorkflowTaskStatus,
} from '../../common/consts/statuses.generated.mjs'
import { getProcessLabel, getProcessStatusLabel, getProcessNodeLabel, getProcessNodeStatusLabel, getProcessNodeTone, getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { getWorkflowResponsibilityParts } from './workflowTaskLabels.mjs'
import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'
import { formatWorkflowTaskEventTime, getWorkflowTaskEventStatusLabel, presentWorkflowTaskEvent } from './workflowTaskEventPresentation.mjs'
import { buildEngineeringMaterialReviewStageModel } from './workflowTaskHandlingChain.mjs'
import { getEngineeringMaterialTaskContext, isEngineeringMaterialTask } from './engineeringMaterialTask.mjs'

export const MATERIAL_REVIEW_TRACKING_KIND = 'material_review'
export const isWorkflowTrackingKind = (kind) => ['process', 'task', MATERIAL_REVIEW_TRACKING_KIND].includes(kind)
export const isFlowTracking = (summary) => summary.kind !== 'task'

const positive = (value) => Number.isSafeInteger(value) && value > 0
const nullableTime = (value) => value === null || positive(value)
const nullableText = (value) => value === null || typeof value === 'string'
const taskStatuses = new Set(Object.values(WorkflowTaskStatus))
const processStatuses = new Set([ProcessStatus.ACTIVE, ProcessStatus.BLOCKED, ProcessStatus.COMPLETED])
const nodeStatuses = new Set([ProcessNodeStatus.WAITING, ProcessNodeStatus.ACTIVE, ProcessNodeStatus.COMPLETED, ProcessNodeStatus.BLOCKED, ProcessNodeStatus.WITHDRAWN])

function invalidTracking() {
  throw Object.assign(new Error('任务进度暂时无法读取，请重新读取'), { isInvalidResponse: true })
}

function validTask(task) {
  return task && positive(task.task_id) && typeof task.task_name === 'string' &&
    nullableTime(task.node_instance_id) && typeof task.owner_role_key === 'string' &&
    typeof task.assignee_name === 'string' && taskStatuses.has(task.status) &&
    positive(task.created_at) && nullableTime(task.completed_at) && nullableTime(task.due_at)
}

function validDisplayContext(value) {
  return value === null || Boolean(value && typeof value.available === 'boolean' &&
    typeof value.source_no === 'string' &&
    (value.source_line_count === null || Number.isSafeInteger(value.source_line_count) && value.source_line_count >= 0) &&
    Array.isArray(value.items) && (value.available || value.items.length === 0) &&
    value.items.every((item) => item && ['product', 'material'].includes(item.kind) &&
      ['name', 'code', 'style_no', 'supplier_item_no', 'order_no'].every((key) => typeof item[key] === 'string') &&
      ['product_id', 'image_attachment_id'].every((key) => Number.isSafeInteger(item[key]) && item[key] >= 0) &&
      (item.image_attachment_id === 0 || item.kind === 'product' && item.product_id > 0)))
}

export function requireTrackingSummary(value) {
  if (!value || !isWorkflowTrackingKind(value.kind) || !positive(value.id) ||
    typeof value.process_key !== 'string' || typeof value.title !== 'string' ||
    typeof value.source_type !== 'string' || !positive(value.source_id) || !nullableText(value.source_no) ||
    !validDisplayContext(value.display_context) ||
    !positive(value.started_at) || !positive(value.updated_at) || !nullableTime(value.completed_at) ||
    !nullableText(value.resolution_kind) || typeof value.initiator_name !== 'string' ||
    (value.initiator_role_key != null && typeof value.initiator_role_key !== 'string') ||
    !(isFlowTracking(value) ? processStatuses : taskStatuses).has(value.status) ||
    (value.kind === MATERIAL_REVIEW_TRACKING_KIND && (value.source_type !== 'engineering_material_request' || value.id !== value.source_id)) ||
    !Array.isArray(value.current_tasks) || !value.current_tasks.every(validTask) ||
    value.current_tasks.some((task) => ![WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.status)) ||
    new Set(value.current_tasks.map((task) => task.task_id)).size !== value.current_tasks.length) invalidTracking()
  return value
}

export function requireTrackingPage(value, params = {}) {
  if (!Array.isArray(value?.items) || !Number.isSafeInteger(value.total) || value.total < 0 ||
    !positive(value.limit) || value.limit > WorkCenterPaginationPolicy.maxPageSize || !Number.isSafeInteger(value.offset) || value.offset < 0 ||
    value.limit !== (params.limit ?? WorkCenterPaginationPolicy.defaultPageSize) || value.offset !== (params.offset ?? 0) ||
    value.items.length !== Math.max(0, Math.min(value.limit, value.total - value.offset))) invalidTracking()
  const counts = resolveBusinessStatusCounts(value)
  if (!counts || Object.keys(counts).some((status) => !['active', 'completed'].includes(status)) ||
    businessStatusCount(counts, params.status || '') !== value.total) invalidTracking()
  value.items.forEach(requireTrackingSummary)
  if (new Set(value.items.map((item) => `${item.kind}:${item.id}`)).size !== value.items.length) invalidTracking()
  return value
}

export function requireTrackingDetail(value, ref) {
  requireTrackingSummary(value?.summary)
  if (value.summary.kind !== ref.kind || value.summary.id !== ref.id ||
    !Array.isArray(value.tasks) || !value.tasks.every(validTask) ||
    !Array.isArray(value.nodes) || !Array.isArray(value.events) || value.events.length > 100 ||
    typeof value.events_truncated !== 'boolean' || !Number.isSafeInteger(value.next_event_id) ||
    value.next_event_id < 0 || value.events_truncated !== Boolean(value.next_event_id)) invalidTracking()
  const nodeIDs = new Set(value.nodes.map((node) => node.id))
  const taskIDs = new Set(value.tasks.map((task) => task.task_id))
  const currentTaskIDs = new Set(value.summary.current_tasks.map((task) => task.task_id))
  const material = ref.kind === MATERIAL_REVIEW_TRACKING_KIND
  if (material) {
    const review = value.material_review
    if (!review || !Object.values(MaterialRequestStatus).includes(review.status) ||
      typeof review.order_status !== 'string' || !review.order_status ||
      review.submitted_at !== value.summary.started_at ||
      !['boss_reviewed_at', 'finance_reviewed_at', 'rejected_at'].every((key) => nullableTime(review[key])) ||
      !['submitted_by_name', 'boss_reviewed_by_name', 'finance_reviewed_by_name', 'rejected_by_name'].every((key) => typeof review[key] === 'string') ||
      value.nodes.length || !value.tasks.length ||
      value.tasks.some((task) => !isEngineeringMaterialTask(task)) ||
      new Set(value.tasks.map((task) => task.task_group)).size !== value.tasks.length ||
      value.summary.current_tasks.some((task) => !value.tasks.some((entry) => entry.task_id === task.task_id && entry.task_group === task.task_group && entry.status === task.status))) invalidTracking()
  } else if (value.material_review != null) invalidTracking()
  if (!Array.isArray(value.current_task_access) || value.current_task_access.length !== currentTaskIDs.size ||
    new Set(value.current_task_access.map((access) => access?.task_id)).size !== currentTaskIDs.size ||
    value.current_task_access.some((access) => !access || !currentTaskIDs.has(access.task_id) ||
      typeof access.can_read !== 'boolean' || typeof access.can_handle !== 'boolean' ||
      (access.can_handle && !access.can_read))) invalidTracking()
  if (nodeIDs.size !== value.nodes.length || taskIDs.size !== value.tasks.length ||
    value.nodes.some((node) => !positive(node.id) || node.process_instance_id !== ref.id ||
      typeof node.node_key !== 'string' || !nodeStatuses.has(node.status) ||
      ![ProcessNodeType.HUMAN_TASK, ProcessNodeType.APPROVAL, ProcessNodeType.DOMAIN_COMMAND, ProcessNodeType.WAIT_EVENT, ProcessNodeType.END].includes(node.node_type) ||
      !nullableTime(node.started_at) || !nullableTime(node.completed_at) || typeof node.completed_by_name !== 'string') ||
    value.tasks.some((task) => ref.kind === 'process' ? !nodeIDs.has(task.node_instance_id) :
      task.node_instance_id !== null || (!material && task.task_id !== ref.id)) ||
    value.summary.current_tasks.some((task) => !taskIDs.has(task.task_id)) ||
    value.events.some((event, index) => !event || !positive(event.id) || !taskIDs.has(event.task_id) ||
      typeof event.event_type !== 'string' || typeof event.actor_display_name !== 'string' ||
      !nullableText(event.actor_role_key) || !nullableText(event.reason) || !positive(event.created_at) ||
      (index > 0 && event.id >= value.events[index - 1].id)) ||
    (value.events_truncated && value.next_event_id !== value.events.at(-1)?.id)) invalidTracking()
  if (material && !buildTrackingStageModel(value)) invalidTracking()
  return value
}

export function trackingTitle(summary) {
  return summary.kind === 'process' ? getProcessLabel(summary) : getWorkflowTaskDisplayName({ task_name: summary.title })
}

export function trackingStatus(summary) {
  if (summary.kind === MATERIAL_REVIEW_TRACKING_KIND && summary.status === ProcessStatus.COMPLETED) {
    if (summary.resolution_kind === ProcessResolution.SUCCEEDED) return '已批准采购'
    if (summary.resolution_kind === ProcessResolution.REJECTED) return '本轮已退回'
    if (summary.resolution_kind === ProcessResolution.CANCELLED) return '订单已结束'
  }
  return isFlowTracking(summary) ? getProcessStatusLabel(summary) : getWorkflowTaskEventStatusLabel(summary.status)
}

export function trackingStatusColor(summary) {
  if (isFlowTracking(summary)) {
    if (summary.status === ProcessStatus.BLOCKED) return 'error'
    if (summary.status === ProcessStatus.ACTIVE) return 'blue'
    if (summary.status === ProcessStatus.COMPLETED) {
      if (summary.resolution_kind === ProcessResolution.SUCCEEDED) return 'green'
      if (summary.resolution_kind === ProcessResolution.REJECTED) return 'orange'
    }
  } else {
    if (summary.status === WorkflowTaskStatus.BLOCKED) return 'error'
    if (summary.status === WorkflowTaskStatus.READY) return 'blue'
    if (summary.status === WorkflowTaskStatus.DONE) return 'green'
    if (summary.status === WorkflowTaskStatus.REJECTED) return 'orange'
  }
  return 'default'
}

export function trackingResponsibilityParts(task) {
  return getWorkflowResponsibilityParts({ roleKey: task.owner_role_key, assigneeName: task.assignee_name, pending: [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.status), approval: isWorkflowApprovalTask(task) })
}

export function trackingResponsibility(task) {
  return trackingResponsibilityParts(task).join(' · ')
}

export function trackingHandoff(summary) {
  if (summary.current_tasks.length) return [...new Set(summary.current_tasks.map(trackingResponsibility))].join('；')
  if (summary.kind === 'task' || summary.status === ProcessStatus.COMPLETED) return trackingStatus(summary)
  return summary.status === ProcessStatus.BLOCKED ? '流程受阻，等待处理' : '等待后续业务处理'
}

export function buildTrackingCurrentProgress({ summary, nodes, events }) {
  const taskNodeIDs = new Set(summary.current_tasks.map((task) => task.node_instance_id))
  const taskSteps = summary.current_tasks.map((task) => {
    const blocked = task.status === WorkflowTaskStatus.BLOCKED
    const approval = isWorkflowApprovalTask(task)
    const lastTransition = blocked ? events.find((event) => event.task_id === task.task_id && event.event_type === 'status_changed') : null
    const material = summary.kind === MATERIAL_REVIEW_TRACKING_KIND
    const revision = material && task.task_group === 'engineering_material_revision'
    const rejected = revision ? events.find((event) => event.event_type === 'status_changed' && event.to_status_key === WorkflowTaskStatus.REJECTED) : null
    const responsibility = getWorkflowResponsibilityParts({ roleKey: task.owner_role_key, assigneeName: task.assignee_name })
    if (!task.assignee_name) responsibility.push(task.owner_role_key ? '由岗位人员处理' : '办理人待确认')
    const nextStep = blocked ? '解决受阻事项后继续办理'
      : !task.owner_role_key && !task.assignee_name ? '等待确认办理人'
        : revision ? '修改工程资料并重新送审'
        : approval ? '核对单据并给出审批结果' : '核对任务要求并提交办理结果'
    return {
      key: `task:${task.task_id}`,
      nodeID: material ? task.task_group?.replace(/^engineering_material_/u, '') : task.node_instance_id,
      label: isFlowTracking(summary) ? getWorkflowTaskDisplayName(task) : '',
      responsibility,
      statusLabel: blocked ? getWorkflowTaskEventStatusLabel(task.status) : approval ? '待审批' : '待处理',
      blocked,
      reason: (lastTransition?.to_status_key === WorkflowTaskStatus.BLOCKED ? lastTransition.reason?.trim() : rejected?.reason?.trim()) || '',
      reasonLabel: blocked ? '受阻原因' : rejected?.reason ? '退回原因' : '',
      nextStep,
    }
  })
  const otherSteps = nodes.filter((node) => (
    (node.status === ProcessNodeStatus.ACTIVE && !taskNodeIDs.has(node.id)) ||
    (node.status === ProcessNodeStatus.BLOCKED && !summary.current_tasks.some((task) => task.node_instance_id === node.id && task.status === WorkflowTaskStatus.BLOCKED))
  )).map((node) => {
    const automatic = node.node_type === ProcessNodeType.DOMAIN_COMMAND
    const blocked = node.status === ProcessNodeStatus.BLOCKED
    return {
      key: `node:${node.id}`,
      nodeID: node.id,
      label: getProcessNodeLabel(node),
      responsibility: [automatic ? '系统处理' : '负责岗位待确认'],
      statusLabel: getProcessNodeStatusLabel(node),
      blocked,
      nextStep: blocked ? '核对当前环节的受阻事项' : automatic ? '等待系统处理' : '等待后续业务处理',
    }
  })
  return [...taskSteps, ...otherSteps].sort((left, right) => Number(right.blocked) - Number(left.blocked))
}

export function buildTrackingStageModel(detail) {
  if (detail.summary.kind === MATERIAL_REVIEW_TRACKING_KIND) {
    const asTask = (task) => task && { ...task, id: task.task_id, task_status_key: task.status }
    const revision = detail.tasks.find((task) => task.task_group === 'engineering_material_revision')
    const revisionEvent = detail.events.find((event) => event.task_id === revision?.task_id &&
      event.event_type === 'status_changed' && event.to_status_key === revision.status)
    const rejected = detail.events.find((event) => event.event_type === 'status_changed' && event.to_status_key === WorkflowTaskStatus.REJECTED)
    const revisionTask = revision && { ...asTask(revision), actor: revisionEvent ? presentWorkflowTaskEvent(revisionEvent).actorLabel : '', reason: revisionEvent?.reason || '' }
    const model = buildEngineeringMaterialReviewStageModel({ ...detail.material_review, review_note: rejected?.reason }, {
      currentTask: asTask(detail.summary.current_tasks[0]) || null,
      revisionTask,
    })
    return model ? { ...model, handoffLabel: '' } : null
  }
  const startedAt = (node) => node.started_at ?? node.completed_at ?? Number.MAX_SAFE_INTEGER
  const nodes = detail.nodes.filter((node) => node.status !== ProcessNodeStatus.WAITING).toSorted((left, right) => startedAt(left) - startedAt(right) || left.id - right.id)
  return {
    processLabel: trackingTitle(detail.summary),
    handoffLabel: '',
    items: nodes.map((node) => {
      const taskIDs = new Set(detail.tasks.filter((task) => task.node_instance_id === node.id).map((task) => task.task_id))
      const completion = detail.events.find((event) => taskIDs.has(event.task_id) && event.event_type === 'status_changed' && ['done', 'rejected', 'withdrawn'].includes(event.to_status_key))
      const actor = node.completed_by_name || (completion ? presentWorkflowTaskEvent(completion).actorLabel : '')
      return {
        id: node.id,
        key: String(node.id),
        label: getProcessNodeLabel(node),
        statusLabel: getProcessNodeStatusLabel(node),
        tone: getProcessNodeTone(node),
        current: ['active', 'blocked'].includes(node.status),
        attemptLabel: node.attempt > 1 ? `第 ${node.attempt} 次` : '',
        startedAtLabel: node.started_at ? formatWorkflowTaskEventTime(node.started_at) : '',
        completedAtLabel: node.completed_at ? formatWorkflowTaskEventTime(node.completed_at) : '',
        actor,
        reason: completion?.reason?.trim() || '',
      }
    }),
  }
}

export function trackingURL(ref, source) {
  const params = new URLSearchParams({ tracking: source ? 'visible' : 'started' })
  if (ref) { params.set('track_kind', ref.kind); params.set('track_id', String(ref.id)) }
  if (ref?.kind === 'task') params.set('view', 'followups')
  if (source) { params.set('track_source_type', source.type); params.set('track_source_id', String(source.id)) }
  return `/erp/task-board?${params}`
}

export function trackingRefForWorkflowTask(task) {
  if (positive(task?.process_instance_id)) return { kind: 'process', id: task.process_instance_id }
  const material = getEngineeringMaterialTaskContext(task)
  if (material) return { kind: MATERIAL_REVIEW_TRACKING_KIND, id: material.requestID }
  return positive(task?.id) ? { kind: 'task', id: task.id } : null
}

export function submittedProcessRef(result) {
  const id = result?.process_context?.process_instance?.id || result?.process_instance?.id
  return positive(id) ? { kind: 'process', id } : null
}
