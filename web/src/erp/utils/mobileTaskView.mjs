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
  isEscalatedToBossWorkflowTask,
  isEscalatedWorkflowTask,
  isTerminalWorkflowTask,
  isUrgedWorkflowTask,
  isWarehouseWorkflowTask,
} from './workflowDashboardStats.mjs'
import {
  isRoleKeyMatch,
  normalizeRoleKey,
  normalizeRolePayload,
} from './roleKeys.mjs'

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
const ROLE_EXTENDED_VISIBILITY_LABELS = Object.freeze({
  pmc: 'PMC 扩展可见性关注 blocked / overdue / critical_path / 催办 / 升级 / 高优先级。',
  boss: '老板扩展可见性关注高优先级、审批、出货风险、财务 critical 和升级到老板。',
  production: '生产扩展可见性关注委外回货、成品返工和生产相关任务。',
  business: '业务扩展可见性关注出货、业务确认和 confirm_role_key。',
  finance: '财务扩展可见性关注财务来源、财务通知和财务逾期。',
  warehouse: '仓库扩展可见性关注仓储来源和仓库任务。',
  quality: '品质扩展可见性关注质检来源、质检失败和品质任务。',
})

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function normalizeSourceType(task = {}) {
  return String(task.source_type || '').trim()
}

function appendReason(reasons, condition, reason) {
  if (condition) {
    reasons.push(reason)
  }
}

function hasVisibilityPayloadSignal(taskView = {}) {
  const payload = payloadOf(taskView)
  return Boolean(
    payload.alert_type ||
      payload.notification_type ||
      payload.critical_path === true ||
      payload.is_critical_path === true ||
      payload.urged === true ||
      payload.escalated === true ||
      payload.outsource_processing === true ||
      payload.finished_goods === true ||
      payload.confirm_role_key ||
      payload.outsource_owner_role_key ||
      payload.shipment_risk === true ||
      payload.finance_risk === true
  )
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
  const payload = normalizeRolePayload(payloadOf(task))
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
    owner_role_key: normalizeRoleKey(task.owner_role_key),
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
    is_urged: isUrgedWorkflowTask(task),
    urge_count: Number(payload.urge_count || 0),
    last_urge_at: Number(payload.last_urge_at || 0),
    last_urge_at_label: formatMobileTaskTime(payload.last_urge_at),
    last_urge_reason: payload.last_urge_reason || '',
    last_urge_action: payload.last_urge_action || '',
    is_escalated: isEscalatedWorkflowTask(task),
    escalate_target_role_key: payload.escalate_target_role_key || '',
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
    taskView.is_urged ||
    taskView.is_escalated ||
    isHighPriorityWorkflowTask(taskView) ||
    isCriticalPathWorkflowTask(taskView)
  )
}

function isBossMobileVisible(taskView = {}) {
  const payload = payloadOf(taskView)
  return (
    taskView.owner_role_key === 'boss' ||
    isHighPriorityWorkflowTask(taskView) ||
    taskView.due_status === 'overdue' ||
    isEscalatedToBossWorkflowTask(taskView) ||
    taskView.notification_type === 'approval_required' ||
    taskView.notification_type === 'shipment_risk' ||
    payload.notification_type === 'shipment_risk' ||
    payload.shipment_risk === true ||
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

function isBusinessMobileVisible(taskView = {}) {
  const payload = payloadOf(taskView)
  return (
    isRoleKeyMatch(taskView.owner_role_key, 'business') ||
    isRoleKeyMatch(payload.confirm_role_key, 'business') ||
    taskView.source_type === 'shipping-release' ||
    taskView.source_type === 'outbound'
  )
}

export function isMobileTaskVisibleForRole(taskView = {}, roleKey = '') {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  if (!normalizedRoleKey) return false
  if (isRoleKeyMatch(taskView.owner_role_key, normalizedRoleKey)) return true
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
  if (normalizedRoleKey === 'business') {
    return isBusinessMobileVisible(taskView)
  }
  return false
}

export function explainMobileTaskVisibility(
  task = {},
  roleKey = '',
  options = {}
) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  const taskView = buildMobileTaskView(task, options)
  const payload = payloadOf(taskView)
  const reasons = []
  const blockers = []
  const warnings = []
  const checks = []
  const terminal = isTerminalWorkflowTask(taskView)
  const directOwnerMatch = isRoleKeyMatch(
    taskView.owner_role_key,
    normalizedRoleKey
  )
  const visible = isMobileTaskVisibleForRole(taskView, normalizedRoleKey)

  if (!normalizedRoleKey) {
    blockers.push('未选择 role_key，无法判断角色移动端可见性。')
  }

  if (terminal) {
    warnings.push(
      'task_status_key 是终态；当前移动端规则会标记为终态并从活跃统计中排除。'
    )
  }

  appendReason(reasons, directOwnerMatch, 'owner_role_key 命中当前角色任务池。')

  if (normalizedRoleKey === 'pmc') {
    appendReason(
      reasons,
      ['blocked', 'rejected'].includes(taskView.task_status_key),
      'PMC 扩展命中 blocked / rejected 任务。'
    )
    appendReason(
      reasons,
      taskView.due_status === 'overdue',
      'PMC 扩展命中 overdue 任务。'
    )
    appendReason(
      reasons,
      taskView.alert_level === 'critical',
      'PMC 扩展命中 critical 预警。'
    )
    appendReason(reasons, taskView.is_urged, 'PMC 扩展命中已催办任务。')
    appendReason(reasons, taskView.is_escalated, 'PMC 扩展命中已升级任务。')
    appendReason(
      reasons,
      isHighPriorityWorkflowTask(taskView),
      'PMC 扩展命中高优先级任务。'
    )
    appendReason(
      reasons,
      isCriticalPathWorkflowTask(taskView),
      'PMC 扩展命中 critical_path 任务。'
    )
    checks.push('PMC 可以看风险和卡点，但不能代办事实。')
  } else if (normalizedRoleKey === 'boss') {
    const isShipmentRisk =
      taskView.notification_type === 'shipment_risk' ||
      payload.notification_type === 'shipment_risk' ||
      payload.shipment_risk === true

    appendReason(
      reasons,
      isHighPriorityWorkflowTask(taskView),
      '老板扩展命中 high priority 任务。'
    )
    appendReason(
      reasons,
      taskView.due_status === 'overdue',
      '老板扩展命中 overdue 任务。'
    )
    appendReason(
      reasons,
      isEscalatedToBossWorkflowTask(taskView),
      '老板扩展命中升级到老板。'
    )
    appendReason(
      reasons,
      taskView.notification_type === 'approval_required',
      '老板扩展命中审批提醒。'
    )
    appendReason(reasons, isShipmentRisk, '老板扩展命中 shipment risk。')
    appendReason(
      reasons,
      isFinanceWorkflowTask(taskView) && taskView.alert_level === 'critical',
      '老板扩展命中 finance critical。'
    )
    checks.push(
      '老板可以看高优先级和升级关注，但不能代办财务 / 品质 / 仓库事实。'
    )
  } else if (normalizedRoleKey === 'production') {
    appendReason(
      reasons,
      ['outsource_return_tracking', 'outsource_rework'].includes(
        taskView.task_group
      ),
      'production 扩展命中委外回货 / 委外返工任务组。'
    )
    appendReason(
      reasons,
      taskView.task_group === 'finished_goods_rework',
      'production 扩展命中成品返工任务组。'
    )
    appendReason(
      reasons,
      isOutsourceReturnWorkflowTask(taskView) &&
        taskView.owner_role_key === 'production',
      'production 扩展命中委外相关任务。'
    )
    appendReason(
      reasons,
      isFinishedGoodsWorkflowTask(taskView) &&
        taskView.owner_role_key === 'production',
      'production 扩展命中成品生产相关任务。'
    )
    appendReason(
      reasons,
      payload.outsource_owner_role_key === 'outsource',
      'production 扩展命中 outsource_owner_role_key。'
    )
  } else if (normalizedRoleKey === 'finance') {
    appendReason(
      reasons,
      isFinanceWorkflowTask(taskView),
      'finance 命中财务任务。'
    )
  } else if (normalizedRoleKey === 'warehouse') {
    appendReason(
      reasons,
      isWarehouseWorkflowTask(taskView),
      'warehouse 命中仓库任务。'
    )
  } else if (normalizedRoleKey === 'quality') {
    appendReason(
      reasons,
      isQualityWorkflowTask(taskView),
      'quality 命中质检任务。'
    )
  } else if (normalizedRoleKey === 'business') {
    appendReason(
      reasons,
      isRoleKeyMatch(payload.confirm_role_key, 'business'),
      'business 扩展命中 confirm_role_key。'
    )
    appendReason(
      reasons,
      ['shipping-release', 'outbound'].includes(taskView.source_type),
      'business 扩展命中出货相关 source_type。'
    )
  } else if (normalizedRoleKey === 'purchasing') {
    checks.push('采购移动端当前按 owner_role_key 直查，没有额外扩展可见性。')
  }

  if (!visible && normalizedRoleKey) {
    if (!directOwnerMatch) {
      blockers.push(
        `owner_role_key=${taskView.owner_role_key || '-'} 不匹配 role_key=${normalizedRoleKey}。`
      )
    }
    if (!ROLE_EXTENDED_VISIBILITY_LABELS[normalizedRoleKey]) {
      blockers.push('当前角色没有定义扩展可见性规则。')
    } else {
      blockers.push(ROLE_EXTENDED_VISIBILITY_LABELS[normalizedRoleKey])
    }

    if (normalizedRoleKey === 'pmc') {
      blockers.push(
        '未命中 blocked / overdue / critical_path / high priority / urged / escalated。'
      )
    }
    if (normalizedRoleKey === 'boss') {
      blockers.push(
        '未命中 high priority / finance critical / shipment risk / approval_required / escalate_to_boss。'
      )
    }
    if (normalizedRoleKey === 'production') {
      blockers.push(
        'task_group 不在生产关注范围，且 payload 未标记委外或成品生产信号。'
      )
    }
    if (
      ['finance', 'warehouse', 'quality', 'business'].includes(
        normalizedRoleKey
      )
    ) {
      blockers.push('source_type 或 task_group 不匹配该角色关注范围。')
    }
    if (!hasVisibilityPayloadSignal(taskView)) {
      blockers.push(
        'payload 缺少扩展可见性需要的 alert_type / notification_type / critical_path 等字段。'
      )
    }
  }

  return {
    role_key: normalizedRoleKey,
    visible,
    terminal,
    direct_owner_match: directOwnerMatch,
    reasons,
    blockers,
    warnings,
    checks,
    task_view: taskView,
  }
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
      if (taskView.is_urged) summary.urged += 1
      if (taskView.is_escalated) summary.escalated += 1

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
      urged: 0,
      escalated: 0,
      pending: 0,
      processing: 0,
      blockedProgress: 0,
      done: 0,
    }
  )
}
