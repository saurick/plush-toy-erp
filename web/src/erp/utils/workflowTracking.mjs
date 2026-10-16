import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { getProcessLabel, getProcessStatusLabel, getProcessNodeLabel, getProcessNodeStatusLabel, getProcessNodeTone, getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { getWorkflowResponsibilityParts } from './workflowTaskLabels.mjs'
import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'
import { formatWorkflowTaskEventTime, getWorkflowTaskEventStatusLabel, presentWorkflowTaskEvent } from './workflowTaskEventPresentation.mjs'

const positive = (value) => Number.isSafeInteger(value) && value > 0
const nullableTime = (value) => value === null || positive(value)
const nullableText = (value) => value === null || typeof value === 'string'
const taskStatuses = new Set(Object.values(WorkflowTaskStatus))
const processStatuses = new Set(['active', 'blocked', 'completed'])
const nodeStatuses = new Set(['waiting', 'active', 'completed', 'blocked', 'withdrawn'])

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
  if (!value || !['process', 'task'].includes(value.kind) || !positive(value.id) ||
    typeof value.process_key !== 'string' || typeof value.title !== 'string' ||
    typeof value.source_type !== 'string' || !positive(value.source_id) || !nullableText(value.source_no) ||
    !validDisplayContext(value.display_context) ||
    !positive(value.started_at) || !positive(value.updated_at) || !nullableTime(value.completed_at) ||
    !nullableText(value.resolution_kind) || typeof value.initiator_name !== 'string' ||
    (value.initiator_role_key != null && typeof value.initiator_role_key !== 'string') ||
    !(value.kind === 'process' ? processStatuses : taskStatuses).has(value.status) ||
    !Array.isArray(value.current_tasks) || !value.current_tasks.every(validTask) ||
    value.current_tasks.some((task) => !['ready', 'blocked'].includes(task.status)) ||
    new Set(value.current_tasks.map((task) => task.task_id)).size !== value.current_tasks.length) invalidTracking()
  return value
}

export function requireTrackingPage(value, params = {}) {
  if (!Array.isArray(value?.items) || !Number.isSafeInteger(value.total) || value.total < 0 ||
    !positive(value.limit) || value.limit > 50 || !Number.isSafeInteger(value.offset) || value.offset < 0 ||
    value.limit !== (params.limit ?? 20) || value.offset !== (params.offset ?? 0) ||
    value.items.length !== Math.max(0, Math.min(value.limit, value.total - value.offset))) invalidTracking()
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
  if (!Array.isArray(value.current_task_access) || value.current_task_access.length !== currentTaskIDs.size ||
    new Set(value.current_task_access.map((access) => access?.task_id)).size !== currentTaskIDs.size ||
    value.current_task_access.some((access) => !access || !currentTaskIDs.has(access.task_id) ||
      typeof access.can_read !== 'boolean' || typeof access.can_handle !== 'boolean' ||
      (access.can_handle && !access.can_read))) invalidTracking()
  if (nodeIDs.size !== value.nodes.length || taskIDs.size !== value.tasks.length ||
    value.nodes.some((node) => !positive(node.id) || node.process_instance_id !== ref.id ||
      typeof node.node_key !== 'string' || !nodeStatuses.has(node.status) ||
      !['human_task', 'approval', 'domain_command', 'wait_event', 'end'].includes(node.node_type) ||
      !nullableTime(node.started_at) || !nullableTime(node.completed_at) || typeof node.completed_by_name !== 'string') ||
    value.tasks.some((task) => ref.kind === 'process' ? !nodeIDs.has(task.node_instance_id) : task.task_id !== ref.id || task.node_instance_id !== null) ||
    value.summary.current_tasks.some((task) => !taskIDs.has(task.task_id)) ||
    value.events.some((event, index) => !positive(event.id) || !taskIDs.has(event.task_id) ||
      typeof event.event_type !== 'string' || typeof event.actor_display_name !== 'string' ||
      !nullableText(event.actor_role_key) || !nullableText(event.reason) || !positive(event.created_at) ||
      (index > 0 && event.id >= value.events[index - 1].id)) ||
    (value.events_truncated && value.next_event_id !== value.events.at(-1)?.id)) invalidTracking()
  return value
}

export function trackingTitle(summary) {
  return summary.kind === 'process' ? getProcessLabel(summary) : getWorkflowTaskDisplayName({ task_name: summary.title })
}

export function trackingStatus(summary) {
  return summary.kind === 'process' ? getProcessStatusLabel(summary) : getWorkflowTaskEventStatusLabel(summary.status)
}

export function trackingStatusColor(summary) {
  if (summary.status === 'blocked') return 'error'
  if (summary.kind === 'process') {
    if (summary.status === 'active') return 'blue'
    if (summary.status === 'completed') {
      if (summary.resolution_kind === 'succeeded') return 'green'
      if (summary.resolution_kind === 'rejected') return 'orange'
    }
  } else {
    if (summary.status === 'ready') return 'blue'
    if (summary.status === 'done') return 'green'
    if (summary.status === 'rejected') return 'orange'
  }
  return 'default'
}

export function trackingResponsibilityParts(task) {
  return getWorkflowResponsibilityParts({ roleKey: task.owner_role_key, assigneeName: task.assignee_name, pending: ['ready', 'blocked'].includes(task.status), approval: isWorkflowApprovalTask(task) })
}

export function trackingResponsibility(task) {
  return trackingResponsibilityParts(task).join(' · ')
}

export function trackingHandoff(summary) {
  if (summary.current_tasks.length) return [...new Set(summary.current_tasks.map(trackingResponsibility))].join('；')
  if (summary.kind === 'task' || summary.status === 'completed') return trackingStatus(summary)
  return summary.status === 'blocked' ? '流程受阻，等待处理' : '等待后续业务处理'
}

export function buildTrackingStageModel(detail) {
  const nodes = detail.nodes.filter((node) => node.status !== 'waiting').toSorted((left, right) => left.id - right.id)
  return {
    processLabel: trackingTitle(detail.summary),
    summaryLabel: `${nodes.length} 个已发生步骤`,
    handoffLabel: '',
    items: nodes.map((node) => {
      const tasks = detail.tasks.filter((task) => task.node_instance_id === node.id)
      const currentTasks = detail.summary.current_tasks.filter((task) => task.node_instance_id === node.id)
      const completion = detail.events.find((event) => event.event_type === 'status_changed' && tasks.some((task) => task.task_id === event.task_id) && ['done', 'rejected', 'withdrawn'].includes(event.to_status_key))
      const actor = node.completed_by_name || (completion ? presentWorkflowTaskEvent(completion).actorLabel : '')
      return {
        id: node.id,
        key: String(node.id),
        label: getProcessNodeLabel(node),
        statusLabel: getProcessNodeStatusLabel(node),
        tone: getProcessNodeTone(node),
        current: ['active', 'blocked'].includes(node.status),
        attemptLabel: node.attempt > 1 ? `第 ${node.attempt} 次` : '',
        responsibilities: currentTasks.map(trackingResponsibilityParts),
        detail: currentTasks.length
          ? [...new Set(currentTasks.map(trackingResponsibility))].join('；')
          : node.completed_at ? [actor, formatWorkflowTaskEventTime(node.completed_at)].filter(Boolean).join(' · ') : '',
      }
    }),
  }
}

export function trackingURL(ref, source) {
  const params = new URLSearchParams({ tracking: source ? 'visible' : 'started' })
  if (ref) { params.set('track_kind', ref.kind); params.set('track_id', String(ref.id)) }
  if (source) { params.set('track_source_type', source.type); params.set('track_source_id', String(source.id)) }
  return `/erp/task-board?${params}`
}

export function submittedProcessRef(result) {
  const id = result?.process_context?.process_instance?.id || result?.process_instance?.id
  return positive(id) ? { kind: 'process', id } : null
}
