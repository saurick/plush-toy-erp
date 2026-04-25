export const DUE_SOON_MS = 24 * 60 * 60 * 1000

export const TERMINAL_TASK_STATUS_KEYS = new Set([
  'done',
  'closed',
  'cancelled',
])
export const PENDING_TASK_STATUS_KEYS = new Set(['pending', 'ready'])
export const RISK_TASK_STATUS_KEYS = new Set(['blocked', 'rejected'])
export const FINANCE_MODULE_KEYS = new Set([
  'reconciliation',
  'payables',
  'receivables',
  'invoices',
])
export const WAREHOUSE_MODULE_KEYS = new Set([
  'inbound',
  'inventory',
  'shipping-release',
  'outbound',
])
export const OUTSOURCE_RETURN_TASK_GROUP_KEYS = new Set([
  'outsource_return_tracking',
  'outsource_return_qc',
  'outsource_warehouse_inbound',
  'outsource_rework',
])
export const FINISHED_GOODS_TASK_GROUP_KEYS = new Set([
  'finished_goods_qc',
  'finished_goods_inbound',
  'finished_goods_rework',
  'shipment_release',
])

function normalizeTaskStatusKey(task = {}) {
  return String(task.task_status_key || '').trim()
}

function normalizeSourceType(task = {}) {
  return String(task.source_type || '').trim()
}

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function textIncludesAny(value, keywords = []) {
  const text = String(value || '').toLowerCase()
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

export function isTerminalWorkflowTask(task = {}) {
  return TERMINAL_TASK_STATUS_KEYS.has(normalizeTaskStatusKey(task))
}

export function getWorkflowTaskDueAtMs(task = {}) {
  const dueAt = Number(task.due_at || 0)
  if (!Number.isFinite(dueAt) || dueAt <= 0) return null
  return dueAt * 1000
}

export function getWorkflowTaskDueStatus(task = {}, nowMs = Date.now()) {
  if (isTerminalWorkflowTask(task)) return 'none'
  const dueAtMs = getWorkflowTaskDueAtMs(task)
  if (!dueAtMs) return 'none'
  if (dueAtMs < nowMs) return 'overdue'
  if (dueAtMs - nowMs <= DUE_SOON_MS) return 'due_soon'
  return 'normal'
}

export function isHighPriorityWorkflowTask(task = {}) {
  return Number(task.priority || 0) >= 3
}

export function isCriticalPathWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return payload.critical_path === true || payload.is_critical_path === true
}

export function isFinanceWorkflowTask(task = {}) {
  return (
    FINANCE_MODULE_KEYS.has(normalizeSourceType(task)) ||
    String(task.owner_role_key || '').trim() === 'finance'
  )
}

export function isWarehouseWorkflowTask(task = {}) {
  return (
    WAREHOUSE_MODULE_KEYS.has(normalizeSourceType(task)) ||
    String(task.owner_role_key || '').trim() === 'warehouse'
  )
}

export function isQualityWorkflowTask(task = {}) {
  return (
    normalizeSourceType(task) === 'quality-inspections' ||
    String(task.owner_role_key || '').trim() === 'quality'
  )
}

export function isQcFailedWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  if (
    payload.alert_type === 'qc_failed' ||
    payload.notification_type === 'qc_failed' ||
    String(task.business_status_key || '').trim() === 'qc_failed'
  ) {
    return true
  }
  return (
    isQualityWorkflowTask(task) &&
    ['failed', 'qc_failed', '不合格'].includes(
      String(payload.qc_result || payload.release_decision || '').trim()
    )
  )
}

export function isMaterialShortageWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    payload.material_shortage === true ||
    payload.shortage === true ||
    textIncludesAny(task.blocked_reason || payload.blocked_reason, [
      '缺料',
      '欠料',
      'material_shortage',
      'shortage',
    ])
  )
}

export function isVendorDelayWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    normalizeSourceType(task) === 'processing-contracts' &&
    (payload.outsource_delay === true ||
      payload.vendor_delay === true ||
      payload.alert_type === 'outsource_delay' ||
      payload.alert_type === 'vendor_delay' ||
      textIncludesAny(task.blocked_reason || payload.blocked_reason, [
        '委外延期',
        '外发延期',
        'outsource_delay',
        'vendor_delay',
      ]))
  )
}

export function isOutsourceReturnWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    OUTSOURCE_RETURN_TASK_GROUP_KEYS.has(
      String(task.task_group || '').trim()
    ) ||
    payload.outsource_processing === true ||
    payload.outsource_owner_role_key === 'outsource'
  )
}

export function isOutsourceReworkWorkflowTask(task = {}) {
  return String(task.task_group || '').trim() === 'outsource_rework'
}

export function isOutsourceReturnPendingWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    String(task.task_group || '').trim() === 'outsource_return_tracking' ||
    payload.alert_type === 'outsource_return_pending'
  )
}

export function isOutsourceReturnQcPendingWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    String(task.task_group || '').trim() === 'outsource_return_qc' ||
    payload.alert_type === 'outsource_return_qc_pending'
  )
}

export function isFinishedGoodsWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    FINISHED_GOODS_TASK_GROUP_KEYS.has(String(task.task_group || '').trim()) ||
    payload.finished_goods === true
  )
}

export function isFinishedGoodsReworkWorkflowTask(task = {}) {
  return String(task.task_group || '').trim() === 'finished_goods_rework'
}

export function isFinishedGoodsQcPendingWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    String(task.task_group || '').trim() === 'finished_goods_qc' ||
    payload.alert_type === 'finished_goods_qc_pending'
  )
}

export function isFinishedGoodsInboundPendingWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    String(task.task_group || '').trim() === 'finished_goods_inbound' ||
    payload.alert_type === 'finished_goods_inbound_pending'
  )
}

export function isShipmentPendingWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    String(task.task_group || '').trim() === 'shipment_release' ||
    payload.alert_type === 'shipment_pending' ||
    String(task.business_status_key || '').trim() === 'shipment_pending'
  )
}

export function isShipmentWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    normalizeSourceType(task) === 'shipping-release' ||
    normalizeSourceType(task) === 'outbound' ||
    isShipmentPendingWorkflowTask(task) ||
    payload.shipment_risk === true ||
    payload.notification_type === 'shipment_risk'
  )
}

export function isApprovalWorkflowTask(task = {}) {
  const payload = payloadOf(task)
  return (
    payload.notification_type === 'approval_required' ||
    payload.alert_type === 'approval_pending' ||
    String(task.owner_role_key || '').trim() === 'boss'
  )
}

export function buildWorkflowTaskAlert(task = {}, options = {}) {
  if (!task || isTerminalWorkflowTask(task)) return null

  const nowMs = Number(options.nowMs || Date.now())
  const dueStatus = getWorkflowTaskDueStatus(task, nowMs)
  const payload = payloadOf(task)
  const sourceType = normalizeSourceType(task)
  const base = {
    task,
    task_id: task.id,
    task_name: task.task_name || '未命名任务',
    source_type: sourceType,
    source_no: task.source_no || '',
    due_status: dueStatus,
  }

  if (isFinishedGoodsReworkWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      alert_level: 'critical',
      alert_label: '成品返工处理',
    }
  }

  if (isOutsourceReworkWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      alert_level: 'critical',
      alert_label: '委外返工 / 补做',
    }
  }

  if (isQcFailedWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      alert_level: 'critical',
      alert_label: '质检不合格',
    }
  }

  if (isMaterialShortageWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'material_shortage',
      alert_type: 'material_shortage',
      alert_level: 'critical',
      alert_label: '欠料风险',
    }
  }

  if (normalizeTaskStatusKey(task) === 'blocked') {
    return {
      ...base,
      notification_type: 'task_blocked',
      alert_type: 'blocked',
      alert_level: 'critical',
      alert_label: '任务阻塞',
    }
  }

  if (isVendorDelayWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'outsource_delay',
      alert_type: 'vendor_delay',
      alert_level: dueStatus === 'overdue' ? 'critical' : 'warning',
      alert_label: '委外延期',
    }
  }

  if (isOutsourceReturnPendingWorkflowTask(task)) {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'outsource_return_pending',
      alert_level: dueStatus === 'overdue' ? 'critical' : 'warning',
      alert_label: '委外回货待跟踪',
    }
  }

  if (isOutsourceReturnQcPendingWorkflowTask(task)) {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'outsource_return_qc_pending',
      alert_level: dueStatus === 'overdue' ? 'critical' : 'warning',
      alert_label: '委外回货待检验',
    }
  }

  if (isFinishedGoodsQcPendingWorkflowTask(task)) {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'finished_goods_qc_pending',
      alert_level: dueStatus === 'overdue' ? 'critical' : 'warning',
      alert_label: '成品抽检待处理',
    }
  }

  if (isFinishedGoodsInboundPendingWorkflowTask(task)) {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'finished_goods_inbound_pending',
      alert_level: dueStatus === 'overdue' ? 'critical' : 'warning',
      alert_label: '成品待入库',
    }
  }

  if (isShipmentPendingWorkflowTask(task)) {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'shipment_pending',
      alert_level: dueStatus === 'overdue' ? 'critical' : 'warning',
      alert_label: dueStatus === 'overdue' ? '出货准备已超时' : '待出货准备',
    }
  }

  if (
    isShipmentWorkflowTask(task) &&
    (dueStatus === 'overdue' ||
      dueStatus === 'due_soon' ||
      payload.shipment_risk === true)
  ) {
    return {
      ...base,
      notification_type: 'shipment_risk',
      alert_type: 'shipment_due',
      alert_level: dueStatus === 'normal' ? 'warning' : 'critical',
      alert_label: dueStatus === 'overdue' ? '出货已超时' : '出货风险',
    }
  }

  if (isFinanceWorkflowTask(task) && dueStatus === 'overdue') {
    return {
      ...base,
      notification_type: 'finance_pending',
      alert_type: 'finance_overdue',
      alert_level: 'critical',
      alert_label: '财务已超时',
    }
  }

  if (dueStatus === 'overdue') {
    return {
      ...base,
      notification_type: 'task_overdue',
      alert_type: 'overdue',
      alert_level: 'critical',
      alert_label: '已超时',
    }
  }

  if (payload.alert_type === 'qc_pending') {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'qc_pending',
      alert_level: 'warning',
      alert_label: 'IQC 待检',
    }
  }

  if (payload.alert_type === 'inbound_pending') {
    return {
      ...base,
      notification_type: payload.notification_type || 'task_created',
      alert_type: 'inbound_pending',
      alert_level: 'warning',
      alert_label: '待确认入库',
    }
  }

  if (dueStatus === 'due_soon') {
    return {
      ...base,
      notification_type: 'task_due_soon',
      alert_type: 'due_soon',
      alert_level: 'warning',
      alert_label: '即将超时',
    }
  }

  if (normalizeTaskStatusKey(task) === 'rejected') {
    return {
      ...base,
      notification_type: 'task_rejected',
      alert_type: 'approval_pending',
      alert_level: 'warning',
      alert_label: '任务退回',
    }
  }

  if (isHighPriorityWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'urgent_escalation',
      alert_type: 'high_priority',
      alert_level: 'warning',
      alert_label: '高优先级',
    }
  }

  if (isApprovalWorkflowTask(task)) {
    return {
      ...base,
      notification_type: 'approval_required',
      alert_type: 'approval_pending',
      alert_level: 'warning',
      alert_label: '待审批',
    }
  }

  if (
    isFinanceWorkflowTask(task) &&
    PENDING_TASK_STATUS_KEYS.has(normalizeTaskStatusKey(task))
  ) {
    return {
      ...base,
      notification_type: 'finance_pending',
      alert_type: 'finance_overdue',
      alert_level: payload.finance_risk === true ? 'critical' : 'warning',
      alert_label: '财务待处理',
    }
  }

  return null
}

function countBy(tasks, keyGetter) {
  return (Array.isArray(tasks) ? tasks : []).reduce((counts, task) => {
    const key = String(keyGetter(task) || '').trim()
    if (!key) return counts
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function isPmcFocusTask(task = {}, alert = null) {
  return (
    RISK_TASK_STATUS_KEYS.has(normalizeTaskStatusKey(task)) ||
    getWorkflowTaskDueStatus(task) === 'overdue' ||
    isHighPriorityWorkflowTask(task) ||
    isCriticalPathWorkflowTask(task) ||
    alert?.alert_level === 'critical'
  )
}

function isBossFocusTask(task = {}, alert = null) {
  return (
    isApprovalWorkflowTask(task) ||
    isHighPriorityWorkflowTask(task) ||
    alert?.notification_type === 'shipment_risk' ||
    (isFinanceWorkflowTask(task) && alert?.alert_level === 'critical')
  )
}

export function buildWorkflowDashboardStats(tasks = [], options = {}) {
  const nowMs = Number(options.nowMs || Date.now())
  const normalizedTasks = Array.isArray(tasks) ? tasks : []
  const activeTasks = normalizedTasks.filter(
    (task) => !isTerminalWorkflowTask(task)
  )
  const alerts = activeTasks
    .map((task) => buildWorkflowTaskAlert(task, { nowMs }))
    .filter(Boolean)

  const summary = normalizedTasks.reduce(
    (accumulator, task) => {
      const statusKey = normalizeTaskStatusKey(task)
      accumulator.total += 1
      if (statusKey === 'pending' || statusKey === 'ready') {
        accumulator.pending += 1
      }
      if (statusKey === 'processing') accumulator.processing += 1
      if (statusKey === 'blocked') accumulator.blocked += 1
      if (statusKey === 'rejected') accumulator.rejected += 1
      if (statusKey === 'done') accumulator.done += 1
      if (statusKey === 'closed') accumulator.closed += 1
      if (statusKey === 'cancelled') accumulator.cancelled += 1
      if (!isTerminalWorkflowTask(task)) {
        const dueStatus = getWorkflowTaskDueStatus(task, nowMs)
        if (dueStatus === 'overdue') accumulator.overdue += 1
        if (dueStatus === 'due_soon') accumulator.dueSoon += 1
      }
      if (isHighPriorityWorkflowTask(task)) accumulator.highPriority += 1
      return accumulator
    },
    {
      total: 0,
      pending: 0,
      processing: 0,
      blocked: 0,
      rejected: 0,
      overdue: 0,
      dueSoon: 0,
      done: 0,
      closed: 0,
      cancelled: 0,
      highPriority: 0,
    }
  )

  return {
    ...summary,
    active: activeTasks.length,
    roleDistribution: countBy(normalizedTasks, (task) => task.owner_role_key),
    alerts,
    todayAlerts: alerts.length,
    criticalAlerts: alerts.filter((alert) => alert.alert_level === 'critical')
      .length,
    warningAlerts: alerts.filter((alert) => alert.alert_level === 'warning')
      .length,
    pmcFocus: activeTasks.filter((task) =>
      isPmcFocusTask(task, buildWorkflowTaskAlert(task, { nowMs }))
    ).length,
    bossFocus: activeTasks.filter((task) =>
      isBossFocusTask(task, buildWorkflowTaskAlert(task, { nowMs }))
    ).length,
    financePending: activeTasks.filter(isFinanceWorkflowTask).length,
    qualityPending: activeTasks.filter(isQualityWorkflowTask).length,
    warehousePending: activeTasks.filter(isWarehouseWorkflowTask).length,
    buckets: {
      overdueTasks: alerts.filter((alert) => alert.alert_type === 'overdue'),
      blockedTasks: alerts.filter((alert) => alert.alert_type === 'blocked'),
      shipmentRisk: alerts.filter(
        (alert) => alert.alert_type === 'shipment_due'
      ),
      materialShortage: alerts.filter(
        (alert) => alert.alert_type === 'material_shortage'
      ),
      vendorDelay: alerts.filter(
        (alert) => alert.alert_type === 'vendor_delay'
      ),
      outsourceReturnPending: alerts.filter(
        (alert) => alert.alert_type === 'outsource_return_pending'
      ),
      outsourceReturnQcPending: alerts.filter(
        (alert) => alert.alert_type === 'outsource_return_qc_pending'
      ),
      finishedGoodsQcPending: alerts.filter(
        (alert) => alert.alert_type === 'finished_goods_qc_pending'
      ),
      finishedGoodsInboundPending: alerts.filter(
        (alert) => alert.alert_type === 'finished_goods_inbound_pending'
      ),
      shipmentPending: alerts.filter(
        (alert) => alert.alert_type === 'shipment_pending'
      ),
      qcFailed: alerts.filter((alert) => alert.alert_type === 'qc_failed'),
      financePending: alerts.filter((alert) =>
        ['finance_overdue'].includes(alert.alert_type)
      ),
      approvalPending: alerts.filter(
        (alert) => alert.alert_type === 'approval_pending'
      ),
      pmcFocus: alerts.filter((alert) => isPmcFocusTask(alert.task, alert)),
    },
  }
}
