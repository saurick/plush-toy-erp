import { getBusinessStatusLabel } from '../config/workflowStatus.mjs'
import { getWorkflowTaskStatusMeta } from './workflowTaskBoard.mjs'
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
  isUrgedWorkflowTask,
  isWarehouseWorkflowTask,
} from './workflowDashboardStats.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import {
  getRoleDisplayName,
  isRoleKeyMatch,
  normalizeRoleKey,
  normalizeRolePayload,
} from './roleKeys.mjs'
import { formatWorkflowTaskSource } from './dashboardTaskDisplay.mjs'
import { getWorkflowTaskGroupLabel } from './workflowTaskLabels.mjs'

const DUE_STATUS_LABELS = Object.freeze({
  none: '无截止',
  normal: '未到期',
  due_soon: '即将到期',
  overdue: '已超时',
})

export function getMobileTaskDueStatusLabel(dueStatus) {
  const key = String(dueStatus || '').trim()
  if (!key) return '-'
  return DUE_STATUS_LABELS[key] || '到期状态'
}

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
  pmc: 'PMC 扩展可见性关注阻塞、超时、关键路径、催办、升级和高优先级。',
  boss: '老板扩展可见性关注高优先级、审批、出货风险、财务高风险和升级到老板。',
  production: '生产扩展可见性关注委外回货、成品返工和生产相关任务。',
  sales: '业务扩展可见性关注出货、业务确认和业务确认角色。',
  finance: '财务扩展可见性关注财务来源、财务通知和财务逾期。',
  warehouse: '仓库扩展可见性关注仓储来源和仓库任务。',
  quality: '品质扩展可见性关注质检来源、质检失败和品质任务。',
})

const MOBILE_TASK_ACTION_LABELS = Object.freeze({
  done: '完成',
  complete: '完成',
  blocked: '阻塞',
  block: '阻塞',
  rejected: '退回',
  reject: '退回',
  urge: '催办',
  urge_task: '催办',
  escalate_to_boss: '升级给老板',
})
const RELATED_DOCUMENT_RESULT_LABELS = Object.freeze({
  pass: '合格',
  passed: '合格',
  qualified: '合格',
  approved: '合格',
  release: '放行',
  released: '放行',
  fail: '不合格',
  failed: '不合格',
  reject: '不合格',
  rejected: '不合格',
  rework: '返工',
  pending: '待检',
  合格: '合格',
  不合格: '不合格',
  放行: '放行',
  返工: '返工',
  待检: '待检',
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

function roleLabel(roleKey, fallback = '当前岗位') {
  return getRoleDisplayName(roleKey, fallback)
}

function taskGroupLabel(taskGroupKey, fallback = '业务协同') {
  return getWorkflowTaskGroupLabel(taskGroupKey, fallback)
}

function sourceTypeLabel(sourceType) {
  return formatWorkflowTaskSource({ source_type: sourceType })
}

function mobileTaskActionLabel(actionKey) {
  const normalizedActionKey = String(actionKey || '').trim()
  if (!normalizedActionKey) return ''
  return MOBILE_TASK_ACTION_LABELS[normalizedActionKey] || '任务处理'
}

function isReadableBusinessLabel(value) {
  return /[\u4e00-\u9fff]/u.test(String(value || ''))
}

function mobileTaskActionDisplayLabel(action = {}) {
  const mappedLabel = mobileTaskActionLabel(action.action_key)
  if (mappedLabel && mappedLabel !== '任务处理') return mappedLabel
  const label = String(action.action_label || '').trim()
  if (isReadableBusinessLabel(label)) return label
  return mappedLabel || '任务处理'
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
  const documents = Array.isArray(value) ? value : [value]
  return documents
    .filter(Boolean)
    .map((item) => normalizeRelatedDocumentText(String(item)))
}

function relatedDocumentResultFallback(prefix) {
  return prefix.includes('成品抽检') ? '抽检已记录' : '质检已记录'
}

function relatedDocumentResultLabel(prefix, value) {
  const key = String(value || '').trim()
  if (!key) return ''
  const label = RELATED_DOCUMENT_RESULT_LABELS[key]
  if (label) return label
  return /[A-Za-z_]/u.test(key) ? relatedDocumentResultFallback(prefix) : key
}

function normalizeRelatedDocumentText(value) {
  const text = String(value || '').trim()
  const resultMatch = text.match(
    /^(IQC 结果|检验结果|委外回货检验结果|成品抽检结果)：(.+)$/u
  )
  if (!resultMatch) return text
  const [, prefix, result] = resultMatch
  return `${prefix}：${relatedDocumentResultLabel(prefix, result)}`
}

export function normalizeMobileActionEvidenceRefs(value) {
  if (!value) return []
  const values = Array.isArray(value)
    ? value.map((item) => String(item).trim())
    : String(value)
        .split(/[\n,，;；]/u)
        .map((item) => item.trim())
  return [...new Set(values.filter(Boolean))]
}

export function buildMobileTaskActionEvidence({
  evidenceText = '',
  evidenceRefs,
} = {}) {
  const normalizedEvidenceRefs = normalizeMobileActionEvidenceRefs(
    evidenceRefs || evidenceText
  )
  return {
    ...(normalizedEvidenceRefs.length
      ? { evidence_refs: normalizedEvidenceRefs }
      : {}),
    surface_key: 'mobile_role_tasks',
  }
}

export function buildMobileTaskView(task = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now())
  const payload = normalizeRolePayload(payloadOf(task))
  const mobileAction =
    payload.mobile_action && typeof payload.mobile_action === 'object'
      ? {
          ...payload.mobile_action,
          action_label: mobileTaskActionDisplayLabel(payload.mobile_action),
          evidence_refs: normalizeMobileActionEvidenceRefs(
            payload.mobile_action.evidence_refs
          ),
        }
      : null
  const mobileActionEvidenceRefs = normalizeMobileActionEvidenceRefs(
    payload.mobile_action_evidence_refs ||
      payload.evidence_refs ||
      mobileAction?.evidence_refs
  )
  const alert = buildWorkflowTaskAlert(task, { nowMs })
  const dueStatus = getWorkflowTaskDueStatus(task, nowMs)
  const businessStatusKey = String(task.business_status_key || '').trim()

  return {
    ...task,
    payload,
    source_no: task.source_no || '',
    source_type: normalizeSourceType(task),
    source_id: task.source_id || '',
    task_group: task.task_group || '',
    owner_role_key: normalizeRoleKey(task.owner_role_key),
    task_status_label: getWorkflowTaskStatusMeta(task).label,
    business_status_label: businessStatusKey
      ? getBusinessStatusLabel(businessStatusKey)
      : '-',
    priority: Number(task.priority || 0),
    due_at_label: formatMobileTaskTime(task.due_at),
    due_status: dueStatus,
    due_status_label: getMobileTaskDueStatusLabel(dueStatus),
    alert_level: alert?.alert_level || 'info',
    alert_label: alert?.alert_label || '',
    alert_type: alert?.alert_type || '',
    notification_type: alert?.notification_type || '',
    is_urged: isUrgedWorkflowTask(task),
    urge_count: Number(task.urge_count || 0),
    last_urge_at: Number(task.last_urged_at || 0),
    last_urge_at_label: formatMobileTaskTime(task.last_urged_at),
    last_urge_reason: payload.last_urge_reason || '',
    last_urge_action: payload.last_urge_action || '',
    last_urge_action_label: mobileTaskActionLabel(payload.last_urge_action),
    is_escalated: isEscalatedWorkflowTask(task),
    escalate_target_role_key: task.escalate_target_role_key || '',
    complete_condition: payload.complete_condition || '',
    related_documents: normalizeRelatedDocuments(payload.related_documents),
    mobile_action: mobileAction,
    mobile_action_evidence_refs: mobileActionEvidenceRefs,
    mobile_exception_report:
      payload.mobile_exception_report &&
      typeof payload.mobile_exception_report === 'object'
        ? {
            ...payload.mobile_exception_report,
            action_label: mobileTaskActionLabel(
              payload.mobile_exception_report.action_key
            ),
            evidence_refs: normalizeMobileActionEvidenceRefs(
              payload.mobile_exception_report.evidence_refs
            ),
          }
        : null,
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
    isRoleKeyMatch(taskView.owner_role_key, 'sales') ||
    isRoleKeyMatch(payload.confirm_role_key, 'sales') ||
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
  if (normalizedRoleKey === 'sales') {
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
  const currentRoleLabel = roleLabel(normalizedRoleKey)
  const ownerRoleLabel = roleLabel(taskView.owner_role_key, '未指定岗位')

  if (!normalizedRoleKey) {
    blockers.push('未选择岗位，无法判断岗位任务端可见性。')
  }

  if (terminal) {
    warnings.push('任务已处于终态；当前移动端规则会从活跃统计中排除。')
  }

  appendReason(
    reasons,
    directOwnerMatch,
    `${currentRoleLabel}命中主责岗位任务池。`
  )

  if (normalizedRoleKey === 'pmc') {
    appendReason(
      reasons,
      ['blocked', 'rejected'].includes(taskView.task_status_key),
      'PMC 扩展命中阻塞或退回任务。'
    )
    appendReason(
      reasons,
      taskView.due_status === 'overdue',
      'PMC 扩展命中已超时任务。'
    )
    appendReason(
      reasons,
      taskView.alert_level === 'critical',
      'PMC 扩展命中高风险预警。'
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
      'PMC 扩展命中关键路径任务。'
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
      '老板扩展命中高优先级任务。'
    )
    appendReason(
      reasons,
      taskView.due_status === 'overdue',
      '老板扩展命中已超时任务。'
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
    appendReason(reasons, isShipmentRisk, '老板扩展命中出货风险。')
    appendReason(
      reasons,
      isFinanceWorkflowTask(taskView) && taskView.alert_level === 'critical',
      '老板扩展命中财务高风险。'
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
      '生产经理扩展命中委外回货或委外返工。'
    )
    appendReason(
      reasons,
      taskView.task_group === 'finished_goods_rework',
      '生产经理扩展命中成品返工。'
    )
    appendReason(
      reasons,
      isOutsourceReturnWorkflowTask(taskView) &&
        taskView.owner_role_key === 'production',
      '生产经理扩展命中委外相关任务。'
    )
    appendReason(
      reasons,
      isFinishedGoodsWorkflowTask(taskView) &&
        taskView.owner_role_key === 'production',
      '生产经理扩展命中成品生产相关任务。'
    )
    appendReason(
      reasons,
      payload.outsource_owner_role_key === 'outsource',
      '生产经理扩展命中委外责任标记。'
    )
  } else if (normalizedRoleKey === 'finance') {
    appendReason(reasons, isFinanceWorkflowTask(taskView), '财务命中财务任务。')
  } else if (normalizedRoleKey === 'warehouse') {
    appendReason(
      reasons,
      isWarehouseWorkflowTask(taskView),
      '仓库命中仓储任务。'
    )
  } else if (normalizedRoleKey === 'quality') {
    appendReason(reasons, isQualityWorkflowTask(taskView), '品质命中质检任务。')
  } else if (normalizedRoleKey === 'sales') {
    appendReason(
      reasons,
      isRoleKeyMatch(payload.confirm_role_key, 'sales'),
      '业务扩展命中业务确认角色。'
    )
    appendReason(
      reasons,
      ['shipping-release', 'outbound'].includes(taskView.source_type),
      '业务扩展命中出货相关来源。'
    )
  } else if (normalizedRoleKey === 'purchase') {
    checks.push('采购岗位任务端当前只看主责岗位任务池，没有额外扩展可见性。')
  }

  if (!visible && normalizedRoleKey) {
    if (!directOwnerMatch) {
      blockers.push(
        `任务主责岗位是${ownerRoleLabel}，不属于${currentRoleLabel}。`
      )
    }
    if (!ROLE_EXTENDED_VISIBILITY_LABELS[normalizedRoleKey]) {
      blockers.push('当前角色没有定义扩展可见性规则。')
    } else {
      blockers.push(ROLE_EXTENDED_VISIBILITY_LABELS[normalizedRoleKey])
    }

    if (normalizedRoleKey === 'pmc') {
      blockers.push('未命中阻塞、超时、关键路径、高优先级、催办或升级关注项。')
    }
    if (normalizedRoleKey === 'boss') {
      blockers.push(
        '未命中高优先级、财务高风险、出货风险、审批提醒或升级给老板。'
      )
    }
    if (normalizedRoleKey === 'production') {
      blockers.push(
        `${taskGroupLabel(taskView.task_group)}不在生产关注范围，且任务没有委外或成品生产标记。`
      )
    }
    if (
      ['finance', 'warehouse', 'quality', 'sales'].includes(normalizedRoleKey)
    ) {
      blockers.push(
        `${sourceTypeLabel(taskView.source_type)}或${taskGroupLabel(taskView.task_group)}不匹配${currentRoleLabel}关注范围。`
      )
    }
    if (!hasVisibilityPayloadSignal(taskView)) {
      blockers.push('任务缺少扩展可见性需要的预警、通知或关键路径标记。')
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

      if (taskView.task_status_key === 'done') {
        summary.done += 1
      } else if (taskView.task_status_key === 'rejected') {
        summary.rejected += 1
      } else if (taskView.task_status_key === 'ready') {
        summary.ready += 1
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
      ready: 0,
      rejected: 0,
      done: 0,
    }
  )
}
