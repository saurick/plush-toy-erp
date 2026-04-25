import {
  BUSINESS_WORKFLOW_STATES,
  TASK_WORKFLOW_STATES,
} from '../config/workflowStatus.mjs'
import {
  buildWorkflowTaskAlert,
  getWorkflowTaskDueStatus,
  isCriticalPathWorkflowTask,
  isFinanceWorkflowTask,
  isFinishedGoodsWorkflowTask,
  isHighPriorityWorkflowTask,
  isOutsourceReturnWorkflowTask,
  isQualityWorkflowTask,
  isTerminalWorkflowTask,
  isWarehouseWorkflowTask,
} from './workflowDashboardStats.mjs'

const taskStatusLabelMap = new Map(
  TASK_WORKFLOW_STATES.map((state) => [state.key, state.label])
)
const businessStatusLabelMap = new Map(
  BUSINESS_WORKFLOW_STATES.map((state) => [state.key, state.label])
)

const DUE_STATUS_LABELS = Object.freeze({
  none: '无截止',
  normal: '未到期',
  due_soon: '即将到期',
  overdue: '已超时',
})

const FINANCE_SOURCE_TYPES = new Set([
  'reconciliation',
  'payables',
  'receivables',
  'invoices',
])
const WAREHOUSE_SOURCE_TYPES = new Set([
  'inbound',
  'inventory',
  'shipping-release',
  'outbound',
])

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function normalizeSourceType(task = {}) {
  return String(task.source_type || '').trim()
}

export function formatMobileTaskTime(value) {
  if (!value) return '-'
  const date = new Date(Number(value) * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export function normalizeRelatedDocuments(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  return [String(value)].filter(Boolean)
}

export function buildMobileTaskView(task = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now())
  const payload = payloadOf(task)
  const alert = buildWorkflowTaskAlert(task, { nowMs })
  const dueStatus = getWorkflowTaskDueStatus(task, nowMs)
  const taskStatusKey = String(task.task_status_key || '').trim()
  const businessStatusKey = String(task.business_status_key || '').trim()

  return {
    ...task,
    payload,
    source_no: task.source_no || '',
    source_type: normalizeSourceType(task),
    source_id: task.source_id || '',
    task_group: task.task_group || '',
    task_status_label:
      taskStatusLabelMap.get(taskStatusKey) || taskStatusKey || '-',
    business_status_label:
      businessStatusLabelMap.get(businessStatusKey) || businessStatusKey || '-',
    priority: Number(task.priority || 0),
    due_at_label: formatMobileTaskTime(task.due_at),
    due_status: dueStatus,
    due_status_label: DUE_STATUS_LABELS[dueStatus] || dueStatus,
    alert_level: alert?.alert_level || 'info',
    alert_label: alert?.alert_label || '',
    alert_type: alert?.alert_type || '',
    notification_type: alert?.notification_type || '',
    is_urged: Boolean(
      payload.urged === true || payload.urge_count || payload.last_urge_at
    ),
    complete_condition: payload.complete_condition || '',
    related_documents: normalizeRelatedDocuments(payload.related_documents),
  }
}

function isPmcMobileVisible(taskView = {}) {
  return (
    taskView.owner_role_key === 'pmc' ||
    ['blocked', 'rejected'].includes(taskView.task_status_key) ||
    taskView.due_status === 'overdue' ||
    taskView.alert_level === 'critical' ||
    isHighPriorityWorkflowTask(taskView) ||
    isCriticalPathWorkflowTask(taskView)
  )
}

function isBossMobileVisible(taskView = {}) {
  return (
    taskView.owner_role_key === 'boss' ||
    isHighPriorityWorkflowTask(taskView) ||
    taskView.notification_type === 'approval_required' ||
    taskView.notification_type === 'shipment_risk' ||
    (isFinanceWorkflowTask(taskView) && taskView.alert_level === 'critical')
  )
}

function isFinanceMobileVisible(taskView = {}) {
  return (
    taskView.owner_role_key === 'finance' ||
    FINANCE_SOURCE_TYPES.has(taskView.source_type) ||
    taskView.notification_type === 'finance_pending' ||
    taskView.alert_type === 'finance_overdue'
  )
}

function isWarehouseMobileVisible(taskView = {}) {
  return (
    taskView.owner_role_key === 'warehouse' ||
    WAREHOUSE_SOURCE_TYPES.has(taskView.source_type) ||
    isWarehouseWorkflowTask(taskView)
  )
}

function isQualityMobileVisible(taskView = {}) {
  return (
    taskView.owner_role_key === 'quality' ||
    taskView.source_type === 'quality-inspections' ||
    taskView.alert_type === 'qc_failed' ||
    isQualityWorkflowTask(taskView)
  )
}

function isProductionMobileVisible(taskView = {}) {
  const payload = payloadOf(taskView)
  return (
    taskView.owner_role_key === 'production' ||
    ['outsource_return_tracking', 'outsource_rework'].includes(
      taskView.task_group
    ) ||
    taskView.task_group === 'finished_goods_rework' ||
    (isOutsourceReturnWorkflowTask(taskView) &&
      taskView.owner_role_key === 'production') ||
    (isFinishedGoodsWorkflowTask(taskView) &&
      taskView.owner_role_key === 'production') ||
    payload.outsource_owner_role_key === 'outsource'
  )
}

function isMerchandiserMobileVisible(taskView = {}) {
  const payload = payloadOf(taskView)
  return (
    taskView.owner_role_key === 'merchandiser' ||
    payload.confirm_role_key === 'merchandiser' ||
    taskView.source_type === 'shipping-release' ||
    taskView.source_type === 'outbound'
  )
}

export function isMobileTaskVisibleForRole(taskView = {}, roleKey = '') {
  const normalizedRoleKey = String(roleKey || '').trim()
  if (!normalizedRoleKey) return false
  if (taskView.owner_role_key === normalizedRoleKey) return true
  if (normalizedRoleKey === 'pmc') return isPmcMobileVisible(taskView)
  if (normalizedRoleKey === 'boss') return isBossMobileVisible(taskView)
  if (normalizedRoleKey === 'finance') return isFinanceMobileVisible(taskView)
  if (normalizedRoleKey === 'warehouse') {
    return isWarehouseMobileVisible(taskView)
  }
  if (normalizedRoleKey === 'quality') return isQualityMobileVisible(taskView)
  if (normalizedRoleKey === 'production') {
    return isProductionMobileVisible(taskView)
  }
  if (normalizedRoleKey === 'merchandiser') {
    return isMerchandiserMobileVisible(taskView)
  }
  return false
}

function latestTimestamp(taskView = {}) {
  return Number(taskView.updated_at || taskView.created_at || 0)
}

export function sortMobileTaskViews(left = {}, right = {}) {
  const leftCritical = left.alert_level === 'critical' ? 1 : 0
  const rightCritical = right.alert_level === 'critical' ? 1 : 0
  if (leftCritical !== rightCritical) return rightCritical - leftCritical
  if (left.priority !== right.priority) return right.priority - left.priority
  return latestTimestamp(right) - latestTimestamp(left)
}

export function buildMobileTaskListForRole(
  tasks = [],
  roleKey = '',
  options = {}
) {
  const taskViews = (Array.isArray(tasks) ? tasks : [])
    .map((task) => buildMobileTaskView(task, options))
    .filter((taskView) => isMobileTaskVisibleForRole(taskView, roleKey))
    .sort(sortMobileTaskViews)
  return taskViews
}

export function buildMobileTaskSummary(taskViews = []) {
  return (Array.isArray(taskViews) ? taskViews : []).reduce(
    (summary, taskView) => {
      if (!isTerminalWorkflowTask(taskView)) {
        summary.active += 1
      }
      if (taskView.alert_level !== 'info') summary.alerts += 1
      if (taskView.due_status === 'overdue') summary.overdue += 1
      if (taskView.due_status === 'due_soon') summary.dueSoon += 1
      if (taskView.task_status_key === 'blocked') summary.blocked += 1
      if (taskView.priority >= 3) summary.highPriority += 1

      if (
        taskView.task_status_key === 'done' ||
        taskView.task_status_key === 'closed'
      ) {
        summary.done += 1
      } else if (taskView.task_status_key === 'processing') {
        summary.processing += 1
      } else if (['blocked', 'rejected'].includes(taskView.task_status_key)) {
        summary.blockedProgress += 1
      } else if (taskView.task_status_key !== 'cancelled') {
        summary.pending += 1
      }
      return summary
    },
    {
      active: 0,
      alerts: 0,
      overdue: 0,
      dueSoon: 0,
      blocked: 0,
      highPriority: 0,
      pending: 0,
      processing: 0,
      blockedProgress: 0,
      done: 0,
    }
  )
}
