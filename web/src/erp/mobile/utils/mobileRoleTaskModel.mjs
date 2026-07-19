import {
  formatMobileTaskTime,
  getMobileTaskDueStatusLabel,
} from '../../utils/mobileTaskView.mjs'
import { formatWorkflowTaskSource } from '../../utils/dashboardTaskDisplay.mjs'
import { getWorkflowTaskStatusMeta } from '../../utils/workflowTaskBoard.mjs'
import {
  getRoleDisplayName,
  isRoleKeyMatch,
  normalizeRoleKey,
} from '../../utils/roleKeys.mjs'
import {
  ORDER_APPROVAL_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  isOrderApprovalTask,
} from '../../utils/orderApprovalFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY,
  IQC_PENDING_STATUS_KEY,
  QC_FAILED_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  isPurchaseIqcTask,
  isWarehouseInboundTask,
} from '../../utils/purchaseInboundFlow.mjs'
import {
  INBOUND_DONE_STATUS_KEY as OUTSOURCE_INBOUND_DONE_STATUS_KEY,
  PRODUCTION_PROCESSING_STATUS_KEY as OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY,
  QC_FAILED_STATUS_KEY as OUTSOURCE_QC_FAILED_STATUS_KEY,
  QC_PENDING_STATUS_KEY as OUTSOURCE_QC_PENDING_STATUS_KEY,
  WAREHOUSE_INBOUND_PENDING_STATUS_KEY as OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY,
  isOutsourceReturnQcTask,
  isOutsourceReturnTrackingTask,
  isOutsourceReworkTask,
  isOutsourceWarehouseInboundTask,
} from '../../utils/outsourceReturnFlow.mjs'
import {
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcTask,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from '../../utils/finishedGoodsFlow.mjs'
import {
  isInvoiceRegistrationTask,
  isReceivableRegistrationTask,
  resolveShipmentFinanceTaskBusinessStatus,
} from '../../utils/shipmentFinanceFlow.mjs'
import {
  isPayableRegistrationTask,
  isPayableReconciliationTask,
  resolvePayableReconciliationTaskBusinessStatus,
} from '../../utils/payableReconciliationFlow.mjs'
import { getWorkflowTaskGroupLabel } from '../../utils/workflowTaskLabels.mjs'
import {
  getWorkflowTaskReason,
  getWorkflowTaskReasonLabel,
} from '../../utils/workflowTaskReason.mjs'
import { getBusinessStatusLabel } from '../../config/workflowStatus.mjs'
import { TERMINAL_TASK_STATUS_KEYS } from '../../utils/workflowTaskLifecycle.mjs'

export { TERMINAL_TASK_STATUS_KEYS }

export const MOBILE_TASK_ACTION_ACCESS_STATES = Object.freeze({
  ACTIONABLE: 'actionable',
  CHECKING: 'checking',
  FAILED: 'failed',
  READONLY: 'readonly',
  URGE_ONLY: 'urge-only',
})

const MOBILE_ROLE_ALIASES = Object.freeze({
  business: 'sales',
})

const PAYABLE_TYPE_LABELS = Object.freeze({
  purchase: '采购应付',
  outsource: '委外应付',
})

const QC_RESULT_LABELS = Object.freeze({
  pass: '合格',
  passed: '合格',
  qualified: '合格',
  fail: '不合格',
  failed: '不合格',
  reject: '不合格',
  rejected: '不合格',
  rework: '返工',
  pending: '待检',
})

export const QUICK_REASONS = [
  '材料不足',
  '产能不足',
  '工艺/模具问题',
  '信息不清',
]

export const MOBILE_MAIN_TAB_KEYS = Object.freeze({
  TODO: 'todo',
  DONE: 'done',
  MESSAGES: 'messages',
  MINE: 'mine',
})

export const MOBILE_MESSAGE_TAB_KEYS = Object.freeze({
  WARNING: 'warning',
  NOTICE: 'notice',
})

export const MOBILE_TASK_FILTER_KEYS = Object.freeze({
  ALL: 'all',
  RISK: 'risk',
  ALERT: 'alert',
  OVERDUE: 'overdue',
  DUE_SOON: 'due_soon',
  MINE: 'mine',
  HIGH_PRIORITY: 'high_priority',
  BLOCKED: 'blocked',
  BLOCKED_OR_HIGH_PRIORITY: 'blocked_or_high_priority',
  READY: 'ready',
})

export const MOBILE_LIST_KEYS = Object.freeze({
  TODO: 'todo',
  DONE: 'done',
  WARNING: 'warning',
  NOTICE: 'notice',
})

export const MOBILE_LIST_COLLAPSED_LIMITS = Object.freeze({
  [MOBILE_LIST_KEYS.TODO]: 12,
  [MOBILE_LIST_KEYS.DONE]: 10,
  [MOBILE_LIST_KEYS.WARNING]: 8,
  [MOBILE_LIST_KEYS.NOTICE]: 8,
})

export const MOBILE_SCROLL_TOP_VISIBLE_OFFSET = 280

export function getMobileRoleLabel(roleKey) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const displayRoleKey =
    MOBILE_ROLE_ALIASES[normalizedRoleKey] || normalizedRoleKey
  return getRoleDisplayName(displayRoleKey, '岗位')
}

export function getMobileTaskGroupLabel(taskGroup) {
  return getWorkflowTaskGroupLabel(taskGroup)
}

function resolvePayableTypeLabel(payableType) {
  const normalized = String(payableType || '').trim()
  if (!normalized) return '-'
  return PAYABLE_TYPE_LABELS[normalized] || '应付事项'
}

function resolveQcResultLabel(qcResult) {
  const normalized = String(qcResult || '')
    .trim()
    .toLowerCase()
  if (!normalized) return '-'
  return QC_RESULT_LABELS[normalized] || '质检已记录'
}

export function resolveLatestTaskTime(tasks) {
  const latest = tasks
    .map((task) => task.updated_at || task.created_at)
    .filter(Boolean)
    .sort()
  const latestValue = latest[latest.length - 1]
  return latestValue ? formatMobileTaskTime(latestValue) : '-'
}

export function getTaskSeverityView(task) {
  if (isTaskOverdue(task)) {
    return {
      label: '超时',
      badgeClass: 'border-red-300 bg-red-50 text-red-600',
      rowClass: 'bg-red-50/35',
      timeClass: 'text-red-500',
    }
  }
  if (task.alert_level === 'critical') {
    return {
      label: '严重',
      badgeClass: 'border-red-300 bg-red-50 text-red-600',
      rowClass: 'bg-red-50/35',
      timeClass: 'text-red-500',
    }
  }
  if (isTaskAlerted(task)) {
    return {
      label: '预警',
      badgeClass: 'border-amber-300 bg-amber-50 text-amber-600',
      rowClass: 'bg-emerald-50/25',
      timeClass: 'text-orange-500',
    }
  }
  return {
    label: '普通',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-500',
    rowClass: 'bg-white',
    timeClass: 'text-slate-500',
  }
}

function hasVisiblePayloadValue(value) {
  if (value === null || value === undefined) return false
  return String(value).trim() !== ''
}

function visiblePayloadValue(value, fallback = '-') {
  return hasVisiblePayloadValue(value) ? String(value) : fallback
}

export function resolveTaskListMeta(task) {
  const payload = task.payload || {}
  const hasQuantity = hasVisiblePayloadValue(payload.quantity)
  const hasSupplier = hasVisiblePayloadValue(payload.supplier_name)
  const hasPayableContext =
    hasSupplier || hasVisiblePayloadValue(payload.payable_type)
  const hasMaterialContext =
    hasVisiblePayloadValue(payload.material_name) ||
    hasVisiblePayloadValue(payload.spec) ||
    (hasSupplier && hasQuantity)
  const hasCustomerContext =
    hasVisiblePayloadValue(payload.customer_name) ||
    hasVisiblePayloadValue(payload.style_no) ||
    (!hasMaterialContext && hasVisiblePayloadValue(payload.product_name))
  if (
    hasCustomerContext ||
    (hasQuantity && !hasMaterialContext && !hasPayableContext)
  ) {
    return `客户：${visiblePayloadValue(payload.customer_name)} ｜ 款式：${visiblePayloadValue(
      payload.style_no || payload.product_name
    )} ｜ 数量：${visiblePayloadValue(payload.quantity)}${visiblePayloadValue(
      payload.unit,
      ''
    )}`
  }
  if (hasMaterialContext || hasQuantity) {
    return `物料：${visiblePayloadValue(payload.material_name)} ｜ 规格：${visiblePayloadValue(
      payload.spec
    )} ｜ 数量：${visiblePayloadValue(payload.quantity)}${visiblePayloadValue(
      payload.unit,
      ''
    )}`
  }
  if (payload.supplier_name || payload.payable_type) {
    return `供应商：${payload.supplier_name || '-'} ｜ 类型：${resolvePayableTypeLabel(
      payload.payable_type
    )}`
  }
  return `任务：${getMobileTaskGroupLabel(task.task_group)} ｜ 优先级：${task.priority || '-'}`
}

export function resolveTaskBusinessChip(task) {
  const businessStatusLabel = resolveTaskBusinessStatusLabel(task, '')
  return businessStatusLabel || resolveMobileTaskStatusLabel(task) || '待处理'
}

export function resolveMobileTaskStatusLabel(task = {}) {
  const label = String(task.task_status_label || '').trim()
  if (label) return label
  return getWorkflowTaskStatusMeta(task).label || '未知状态'
}

export function resolveMobileTaskCompletionFeedback(task = {}) {
  if (String(task.task_status_key || '').trim() !== 'done') return ''
  const feedback = task.payload?.feedback
  return typeof feedback === 'string' ? feedback.trim() : ''
}

function isBusinessReadableLabel(value) {
  return /[\u4e00-\u9fff]/u.test(String(value || ''))
}

export function resolveTaskBusinessStatusLabel(task = {}, fallback = '-') {
  const label = String(task.business_status_label || '').trim()
  if (isBusinessReadableLabel(label)) return label
  const statusKey = String(task.business_status_key || '').trim()
  if (!statusKey) return fallback
  return getBusinessStatusLabel(statusKey, '未知业务状态')
}

export function resolveTaskReason(task) {
  return getWorkflowTaskReason(task)
}

export function resolveTaskReasonLabel(task) {
  return getWorkflowTaskReasonLabel(task)
}

export function resolveDetailActionLabel(action) {
  if (action === 'done') return '完成反馈（必填）'
  if (action === 'blocked') return '阻塞原因（必填）'
  if (action === 'rejected') return '退回原因（必填）'
  if (action === 'resume') return '阻塞解除说明（必填）'
  if (action === 'urge') return '催办原因（必填）'
  return '处理原因'
}

export function requiresMobileActionFeedback(action) {
  return action === 'done'
}

export function resolveMobileActionLabel(action) {
  if (action === 'blocked' || action === 'block') return '阻塞'
  if (action === 'done' || action === 'complete') return '完成'
  if (action === 'rejected' || action === 'reject') return '退回'
  if (action === 'resume') return '解除阻塞'
  if (action === 'urge') return '催办'
  return '移动处理'
}

export function resolveMobileActionDisplayLabel(action = {}) {
  if (typeof action === 'string') return resolveMobileActionLabel(action)
  const actionKey = String(action.action_key || '').trim()
  const mappedLabel = resolveMobileActionLabel(actionKey)
  if (actionKey && mappedLabel !== '移动处理') return mappedLabel

  const actionLabel = String(action.action_label || '').trim()
  if (isBusinessReadableLabel(actionLabel)) return actionLabel
  return mappedLabel || '移动处理'
}

export function normalizeMobileTaskActionKey(action) {
  if (action === 'block') return 'blocked'
  if (action === 'reject') return 'rejected'
  if (action === 'complete') return 'done'
  if (action === 'resume') return 'resume'
  if (action === 'urge') return 'urge'
  return String(action || '').trim()
}

export function getMobileTaskActionReasonDraftKey(task, action) {
  const taskID = Number(task?.id || 0)
  const actionKey = normalizeMobileTaskActionKey(action)
  if (!Number.isFinite(taskID) || taskID <= 0 || !actionKey) return ''
  return `${taskID}:${actionKey}`
}

export function resolveMobileTaskActionReason({
  task,
  action,
  reasonDrafts = {},
  urgeReasonByTaskID = {},
} = {}) {
  const actionKey = normalizeMobileTaskActionKey(action)
  const taskID = task?.id
  if (!task || !actionKey) return ''
  if (actionKey === 'urge') {
    return String(urgeReasonByTaskID[taskID] || '')
  }

  const draftKey = getMobileTaskActionReasonDraftKey(task, actionKey)
  if (draftKey && Object.hasOwn(reasonDrafts, draftKey)) {
    return String(reasonDrafts[draftKey] || '')
  }

  const taskStatusKey = String(task.task_status_key || '').trim()
  if (
    (actionKey === 'blocked' && taskStatusKey === 'blocked') ||
    (actionKey === 'rejected' && taskStatusKey === 'rejected')
  ) {
    return resolveTaskReason(task)
  }

  return ''
}

function resolveOrderApprovalBusinessStatus(task, taskStatusKey) {
  if (!isOrderApprovalTask(task)) {
    return task.business_status_key || undefined
  }
  if (taskStatusKey === 'done') return ORDER_APPROVED_STATUS_KEY
  if (taskStatusKey === 'blocked') return 'blocked'
  if (taskStatusKey === 'rejected') return ORDER_APPROVAL_STATUS_KEY
  return task.business_status_key || ORDER_APPROVAL_STATUS_KEY
}

function resolvePurchaseInboundBusinessStatus(task, taskStatusKey) {
  if (isPurchaseIqcTask(task)) {
    if (taskStatusKey === 'done') return WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || IQC_PENDING_STATUS_KEY
  }
  if (isWarehouseInboundTask(task)) {
    if (taskStatusKey === 'done') return INBOUND_DONE_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return task.business_status_key || WAREHOUSE_INBOUND_PENDING_STATUS_KEY
  }
  return null
}

function resolveOutsourceReturnBusinessStatus(task, taskStatusKey) {
  if (isOutsourceReturnTrackingTask(task)) {
    if (taskStatusKey === 'done') return OUTSOURCE_QC_PENDING_STATUS_KEY
    if (['blocked', 'rejected'].includes(taskStatusKey)) return 'blocked'
    return (
      task.business_status_key || OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY
    )
  }
  if (isOutsourceReturnQcTask(task)) {
    if (taskStatusKey === 'done') {
      return OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    }
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return OUTSOURCE_QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || OUTSOURCE_QC_PENDING_STATUS_KEY
  }
  if (isOutsourceWarehouseInboundTask(task)) {
    if (taskStatusKey === 'done') return OUTSOURCE_INBOUND_DONE_STATUS_KEY
    return (
      task.business_status_key || OUTSOURCE_WAREHOUSE_INBOUND_PENDING_STATUS_KEY
    )
  }
  if (isOutsourceReworkTask(task)) {
    if (taskStatusKey === 'done') {
      return OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY
    }
    if (['blocked', 'rejected'].includes(taskStatusKey)) {
      return OUTSOURCE_QC_FAILED_STATUS_KEY
    }
    return task.business_status_key || OUTSOURCE_QC_FAILED_STATUS_KEY
  }
  return null
}

export function resolveMobileTaskBusinessStatus(task, taskStatusKey) {
  return (
    resolvePurchaseInboundBusinessStatus(task, taskStatusKey) ||
    resolveOutsourceReturnBusinessStatus(task, taskStatusKey) ||
    resolveFinishedGoodsTaskBusinessStatus(task, taskStatusKey) ||
    resolveShipmentFinanceTaskBusinessStatus(task, taskStatusKey) ||
    resolvePayableReconciliationTaskBusinessStatus(task, taskStatusKey) ||
    resolveOrderApprovalBusinessStatus(task, taskStatusKey)
  )
}

export function supportsRejectedAction(roleKey, task) {
  return (
    (roleKey === 'boss' && isOrderApprovalTask(task)) ||
    (roleKey === 'quality' &&
      (isPurchaseIqcTask(task) ||
        isOutsourceReturnQcTask(task) ||
        isFinishedGoodsQcTask(task))) ||
    (roleKey === 'warehouse' &&
      (isWarehouseInboundTask(task) ||
        isFinishedGoodsInboundTask(task) ||
        isShipmentReleaseTask(task))) ||
    (roleKey === 'finance' &&
      (isReceivableRegistrationTask(task) ||
        isInvoiceRegistrationTask(task) ||
        isPayableRegistrationTask(task) ||
        isPayableReconciliationTask(task)))
  )
}

export function canOpenMobileTaskDetailAction(roleKey, task, action) {
  const normalizedAction = normalizeMobileTaskActionKey(action)
  if (normalizedAction === 'urge') {
    return canUrgeTask(roleKey, task)
  }
  if (normalizedAction === 'rejected') {
    return (
      canOperateTask(roleKey, task) && supportsRejectedAction(roleKey, task)
    )
  }
  if (
    normalizedAction === 'done' ||
    normalizedAction === 'blocked' ||
    normalizedAction === 'resume'
  ) {
    return canOperateTask(roleKey, task)
  }
  return false
}

export function canOperateTask(roleKey, task) {
  return isRoleKeyMatch(task.owner_role_key, roleKey)
}

function isRiskTaskForUrge(task = {}) {
  return (
    ['blocked', 'rejected'].includes(
      String(task.task_status_key || '').trim()
    ) ||
    task.due_status === 'overdue' ||
    task.alert_level === 'critical' ||
    task.priority >= 3 ||
    task.payload?.critical_path === true ||
    task.is_escalated === true
  )
}

export function resolveMobileUrgeAction(roleKey, task = {}) {
  if (roleKey === 'boss') return 'escalate_to_boss'
  if (
    roleKey !== 'pmc' &&
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  ) {
    return 'escalate_to_pmc'
  }
  return 'urge_task'
}

export function canUrgeTask(roleKey, task = {}) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const taskOwnerRoleKey = normalizeRoleKey(task.owner_role_key)
  const confirmRoleKey = normalizeRoleKey(task.payload?.confirm_role_key)
  if (
    TERMINAL_TASK_STATUS_KEYS.has(String(task.task_status_key || '').trim())
  ) {
    return false
  }
  if (normalizedRoleKey === 'pmc') return isRiskTaskForUrge(task)
  if (normalizedRoleKey === 'boss') {
    return (
      task.priority >= 3 ||
      task.due_status === 'overdue' ||
      task.alert_level === 'critical' ||
      taskOwnerRoleKey === 'finance' ||
      task.is_escalated === true
    )
  }
  if (normalizedRoleKey === 'business') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      confirmRoleKey === normalizedRoleKey ||
      ['project-orders', 'shipping-release', 'outbound'].includes(
        task.source_type
      )
    )
  }
  if (normalizedRoleKey === 'production') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      ['processing-contracts', 'production-progress'].includes(
        task.source_type
      ) ||
      String(task.task_group || '').includes('rework') ||
      String(task.task_group || '').includes('outsource')
    )
  }
  if (normalizedRoleKey === 'finance') {
    return (
      taskOwnerRoleKey === normalizedRoleKey ||
      ['receivables', 'invoices', 'payables', 'reconciliation'].includes(
        task.source_type
      )
    )
  }
  return (
    taskOwnerRoleKey === normalizedRoleKey &&
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  )
}

function hasFinanceAmountPayload(task) {
  const payload = task?.payload || {}
  return [
    'amount',
    'tax_rate',
    'tax_amount',
    'amount_with_tax',
    'amount_without_tax',
  ].some((key) => payload[key] !== undefined && payload[key] !== '')
}

export function resolveTaskSourceLabel(task) {
  return formatWorkflowTaskSource(task)
}

export function resolveTaskRelatedSourceLabel(task) {
  return `来源：${resolveTaskSourceLabel(task)}`
}

export function isTaskOverdue(task) {
  return task.due_status === 'overdue'
}

export function isTaskDueSoon(task) {
  return task.due_status === 'due_soon'
}

export function resolveMobileTaskDueLabel(task = {}) {
  const dueAtLabel = String(task.due_at_label || '').trim()
  if (dueAtLabel) return dueAtLabel

  const dueStatus = String(task.due_status || '').trim()
  if (dueStatus) return getMobileTaskDueStatusLabel(dueStatus)

  const dueStatusLabel = String(task.due_status_label || '').trim()
  if (isBusinessReadableLabel(dueStatusLabel)) return dueStatusLabel

  return '-'
}

export function isTaskAlerted(task) {
  return task.alert_level !== 'info'
}

export function isTaskRisk(task) {
  return (
    isTaskAlerted(task) ||
    isTaskDueSoon(task) ||
    isTaskBlockedProgress(task) ||
    isTaskHighPriority(task)
  )
}

export function isTaskHighPriority(task) {
  return Number(task.priority || 0) >= 3
}

export function isTaskReadyProgress(task) {
  return String(task.task_status_key || '').trim() === 'ready'
}

export function isTaskBlockedProgress(task) {
  return String(task.task_status_key || '').trim() === 'blocked'
}

export function getTaskQueueTone(task) {
  const taskStatusKey = String(task.task_status_key || '').trim()
  if (taskStatusKey === 'rejected') return '已退回'
  if (taskStatusKey === 'blocked') {
    return '卡住'
  }
  if (task.alert_level === 'critical' || isTaskOverdue(task)) {
    return '高风险'
  }
  if (isTaskAlerted(task)) {
    return task.alert_label || resolveMobileTaskDueLabel(task) || '预警'
  }
  return resolveMobileTaskStatusLabel(task)
}

export function buildTaskFactRows(task) {
  const payload = task.payload || {}
  const rows = [
    [
      '状态',
      `${resolveMobileTaskStatusLabel(task)} / ${formatMobileTaskTime(
        task.updated_at
      )}`,
    ],
    ['业务', resolveTaskBusinessStatusLabel(task)],
    [
      '任务类型',
      `${getMobileTaskGroupLabel(task.task_group)} / 优先级 ${task.priority}`,
    ],
    ['截止', task.due_at_label || '-'],
  ]

  if (
    hasVisiblePayloadValue(payload.customer_name) ||
    hasVisiblePayloadValue(payload.style_no) ||
    hasVisiblePayloadValue(payload.due_date)
  ) {
    rows.push([
      '客户/款式/交期',
      `${visiblePayloadValue(payload.customer_name)} / ${visiblePayloadValue(
        payload.style_no || payload.product_name
      )} / ${visiblePayloadValue(payload.due_date)}`,
    ])
  }

  if (
    hasVisiblePayloadValue(payload.supplier_name) ||
    hasVisiblePayloadValue(payload.material_name) ||
    hasVisiblePayloadValue(payload.quantity)
  ) {
    rows.push([
      '供应/物料/数量',
      `${visiblePayloadValue(payload.supplier_name)} / ${visiblePayloadValue(
        payload.material_name || payload.product_name
      )} / ${visiblePayloadValue(payload.quantity)}${visiblePayloadValue(
        payload.unit,
        ''
      )}`,
    ])
  }

  if (payload.qc_result) {
    rows.push(['IQC 结果', resolveQcResultLabel(payload.qc_result)])
  }

  if (hasFinanceAmountPayload(task)) {
    rows.push([
      '金额/税率',
      `${visiblePayloadValue(payload.amount)} / ${visiblePayloadValue(
        payload.tax_rate
      )} / 税额 ${visiblePayloadValue(payload.tax_amount)} / 含税 ${visiblePayloadValue(
        payload.amount_with_tax
      )} / 不含税 ${visiblePayloadValue(payload.amount_without_tax)}`,
    ])
  }

  if (payload.payable_type) {
    rows.push(['应付类型', resolvePayableTypeLabel(payload.payable_type)])
  }

  return rows
}
