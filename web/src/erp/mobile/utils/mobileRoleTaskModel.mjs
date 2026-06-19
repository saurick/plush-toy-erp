import { formatMobileTaskTime } from '../../utils/mobileTaskView.mjs'
import { formatWorkflowTaskSource } from '../../utils/dashboardTaskDisplay.mjs'
import { isRoleKeyMatch, normalizeRoleKey } from '../../utils/roleKeys.mjs'
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

export const TERMINAL_TASK_STATUS_KEYS = new Set([
  'done',
  'closed',
  'cancelled',
])

const MOBILE_ROLE_LABELS = {
  boss: '老板',
  business: '业务',
  sales: '业务',
  purchase: '采购',
  production: '生产',
  warehouse: '仓库组',
  finance: '财务',
  pmc: 'PMC',
  quality: '质检',
}

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
  PENDING: 'pending',
  PROCESSING: 'processing',
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
  return MOBILE_ROLE_LABELS[normalizeRoleKey(roleKey)] || '岗位'
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

export function resolveTaskListMeta(task) {
  const payload = task.payload || {}
  if (payload.customer_name || payload.style_no || payload.quantity) {
    return `客户：${payload.customer_name || '-'} ｜ 款式：${
      payload.style_no || payload.product_name || '-'
    } ｜ 数量：${payload.quantity || '-'}${payload.unit || ''}`
  }
  if (payload.material_name || payload.spec || payload.quantity) {
    return `物料：${payload.material_name || '-'} ｜ 规格：${
      payload.spec || '-'
    } ｜ 数量：${payload.quantity || '-'}${payload.unit || ''}`
  }
  if (payload.supplier_name || payload.payable_type) {
    return `供应商：${payload.supplier_name || '-'} ｜ 类型：${
      payload.payable_type || '-'
    }`
  }
  return `分组：${task.task_group || '-'} ｜ 优先级：${task.priority || '-'}`
}

export function resolveTaskBusinessChip(task) {
  return task.business_status_label || task.task_status_label || '待处理'
}

export function resolveDetailActionLabel(action) {
  if (action === 'blocked') return '阻塞原因（必填）'
  if (action === 'rejected') return '退回原因（必填）'
  if (action === 'urge') return '催办原因（必填）'
  return '处理原因'
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

export function isTaskOverdue(task) {
  return task.due_status === 'overdue'
}

export function isTaskDueSoon(task) {
  return task.due_status === 'due_soon'
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

export function isTaskPendingProgress(task) {
  return ['pending', 'ready'].includes(
    String(task.task_status_key || '').trim()
  )
}

export function isTaskBlockedProgress(task) {
  return ['blocked', 'rejected'].includes(
    String(task.task_status_key || '').trim()
  )
}

export function getTaskQueueTone(task) {
  if (
    ['blocked', 'rejected'].includes(String(task.task_status_key || '').trim())
  ) {
    return '卡住'
  }
  if (task.alert_level === 'critical' || isTaskOverdue(task)) {
    return '高风险'
  }
  if (isTaskAlerted(task)) {
    return task.alert_label || task.due_status_label || '预警'
  }
  return task.task_status_label || '待处理'
}

export function buildTaskFactRows(task) {
  const payload = task.payload || {}
  const rows = [
    [
      '状态',
      `${task.task_status_label} / ${formatMobileTaskTime(task.updated_at)}`,
    ],
    ['业务', task.business_status_label],
    ['分组', `${task.task_group || '-'} / 优先级 ${task.priority}`],
    ['截止', task.due_at_label || '-'],
  ]

  if (payload.customer_name || payload.style_no || payload.due_date) {
    rows.push([
      '客户/款式/交期',
      `${payload.customer_name || '-'} / ${
        payload.style_no || payload.product_name || '-'
      } / ${payload.due_date || '-'}`,
    ])
  }

  if (payload.supplier_name || payload.material_name || payload.quantity) {
    rows.push([
      '供应/物料/数量',
      `${payload.supplier_name || '-'} / ${
        payload.material_name || payload.product_name || '-'
      } / ${payload.quantity || '-'}${payload.unit || ''}`,
    ])
  }

  if (payload.qc_result) {
    rows.push(['IQC 结果', payload.qc_result])
  }

  if (hasFinanceAmountPayload(task)) {
    rows.push([
      '金额/税率',
      `${payload.amount || '-'} / ${payload.tax_rate || '-'} / 税额 ${
        payload.tax_amount || '-'
      } / 含税 ${payload.amount_with_tax || '-'} / 不含税 ${
        payload.amount_without_tax || '-'
      }`,
    ])
  }

  if (payload.payable_type) {
    rows.push(['应付类型', payload.payable_type])
  }

  return rows
}
