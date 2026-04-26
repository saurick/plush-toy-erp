import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowDashboardStats,
  buildWorkflowTaskAlert,
  getWorkflowTaskDueStatus,
} from './workflowDashboardStats.mjs'
import {
  formatWorkflowAlertSource,
  formatWorkflowTaskSource,
  resolveWorkflowAlertEntryPath,
  resolveWorkflowTaskEntryPath,
} from './dashboardTaskDisplay.mjs'

const NOW_SEC = 1_800_000_000
const NOW_MS = NOW_SEC * 1000

function task(overrides = {}) {
  return {
    id: overrides.id || Math.floor(Math.random() * 100000),
    task_name: overrides.task_name || '测试任务',
    task_status_key: overrides.task_status_key || 'pending',
    owner_role_key: overrides.owner_role_key || 'business',
    source_type: overrides.source_type || 'project-orders',
    source_id: overrides.source_id || 1,
    priority: overrides.priority || 0,
    payload: overrides.payload || {},
    ...overrides,
  }
}

test('dashboardTaskDisplay: 看板任务来源回显不直接露出英文模块 key', () => {
  const sourceLabel = formatWorkflowTaskSource(
    task({
      source_type: 'shipping-release',
      source_id: 9,
      source_no: '',
    })
  )
  const alertSourceLabel = formatWorkflowAlertSource({
    source_type: 'processing-contracts',
    source_no: '',
    task: task({ source_id: 12 }),
  })

  assert.equal(sourceLabel, '待出货/出货放行 第 9 条')
  assert.equal(alertSourceLabel, '加工合同/委外下单 第 12 条')
  assert(!sourceLabel.includes('shipping-release'))
  assert(!alertSourceLabel.includes('processing-contracts'))
})

test('dashboardTaskDisplay: 看板任务导航优先进入中文业务页并带单号筛选', () => {
  const entryPath = resolveWorkflowTaskEntryPath(
    task({
      source_type: 'shipping-release',
      source_no: 'OUT-001',
      source_id: 9,
    })
  )
  const payloadEntryPath = resolveWorkflowAlertEntryPath({
    source_type: 'project-orders',
    source_no: 'PO-001',
    task: task({
      source_id: 12,
      payload: { entry_path: '/erp/purchase/material-bom' },
    }),
  })

  assert.equal(
    entryPath,
    '/erp/warehouse/shipping-release?link_keyword=OUT-001&link_source=task-dashboard&link_fields=document_no%2Csource_no'
  )
  assert.equal(
    payloadEntryPath,
    '/erp/purchase/material-bom?link_keyword=PO-001&link_source=task-dashboard&link_fields=document_no%2Csource_no'
  )
})

test('workflowDashboardStats: 统计任务状态和 due_at 计算态', () => {
  const stats = buildWorkflowDashboardStats(
    [
      task({ id: 1, task_status_key: 'pending' }),
      task({ id: 2, task_status_key: 'processing' }),
      task({ id: 3, task_status_key: 'blocked' }),
      task({ id: 4, task_status_key: 'rejected' }),
      task({ id: 5, due_at: NOW_SEC - 60 }),
      task({ id: 6, due_at: NOW_SEC + 60 * 60 }),
      task({ id: 7, task_status_key: 'done', due_at: NOW_SEC - 60 }),
      task({ id: 8, task_status_key: 'closed', due_at: NOW_SEC - 60 }),
      task({ id: 9, task_status_key: 'cancelled', due_at: NOW_SEC - 60 }),
    ],
    { nowMs: NOW_MS }
  )

  assert.equal(stats.total, 9)
  assert.equal(stats.pending, 3)
  assert.equal(stats.processing, 1)
  assert.equal(stats.blocked, 1)
  assert.equal(stats.rejected, 1)
  assert.equal(stats.overdue, 1)
  assert.equal(stats.dueSoon, 1)
  assert.equal(stats.done, 1)
  assert.equal(stats.closed, 1)
  assert.equal(stats.cancelled, 1)
  assert.equal(stats.roleDistribution.business, 9)
})

test('workflowDashboardStats: 终态任务不产生超时预警', () => {
  const terminalTasks = ['done', 'closed', 'cancelled'].map(
    (statusKey, index) =>
      task({
        id: index + 1,
        task_status_key: statusKey,
        due_at: NOW_SEC - 60,
      })
  )

  terminalTasks.forEach((item) => {
    assert.equal(getWorkflowTaskDueStatus(item, NOW_MS), 'none')
    assert.equal(buildWorkflowTaskAlert(item, { nowMs: NOW_MS }), null)
  })
})

test('workflowDashboardStats: 预警等级覆盖 blocked due_soon qc shipment priority finance', () => {
  const blocked = task({ task_status_key: 'blocked' })
  const dueSoon = task({ due_at: NOW_SEC + 60 * 60 })
  const iqcPending = task({
    source_type: 'inbound',
    owner_role_key: 'quality',
    payload: { notification_type: 'task_created', alert_type: 'qc_pending' },
  })
  const inboundPending = task({
    source_type: 'inbound',
    owner_role_key: 'warehouse',
    payload: {
      notification_type: 'task_created',
      alert_type: 'inbound_pending',
    },
  })
  const qcFailed = task({
    source_type: 'quality-inspections',
    owner_role_key: 'quality',
    payload: { qc_result: 'failed' },
  })
  const purchaseQcFailed = task({
    source_type: 'inbound',
    owner_role_key: 'purchasing',
    business_status_key: 'qc_failed',
    payload: { notification_type: 'qc_failed', alert_type: 'qc_failed' },
  })
  const shipmentDue = task({
    source_type: 'shipping-release',
    owner_role_key: 'warehouse',
    due_at: NOW_SEC + 60 * 60,
  })
  const highPriority = task({ priority: 3 })
  const financeOverdue = task({
    source_type: 'receivables',
    owner_role_key: 'finance',
    due_at: NOW_SEC - 60,
  })
  const outsourceReturnPending = task({
    source_type: 'processing-contracts',
    owner_role_key: 'production',
    task_group: 'outsource_return_tracking',
    payload: {
      notification_type: 'task_created',
      alert_type: 'outsource_return_pending',
      outsource_processing: true,
      critical_path: true,
    },
  })
  const outsourceReturnQcPending = task({
    source_type: 'processing-contracts',
    owner_role_key: 'quality',
    task_group: 'outsource_return_qc',
    payload: {
      notification_type: 'task_created',
      alert_type: 'outsource_return_qc_pending',
      outsource_processing: true,
      critical_path: true,
    },
  })
  const outsourceRework = task({
    source_type: 'processing-contracts',
    owner_role_key: 'production',
    task_group: 'outsource_rework',
    business_status_key: 'qc_failed',
    payload: {
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      outsource_processing: true,
      critical_path: true,
    },
  })
  const finishedGoodsQcPending = task({
    source_type: 'production-progress',
    owner_role_key: 'quality',
    task_group: 'finished_goods_qc',
    payload: {
      notification_type: 'task_created',
      alert_type: 'finished_goods_qc_pending',
      finished_goods: true,
      critical_path: true,
    },
  })
  const finishedGoodsInboundPending = task({
    source_type: 'production-progress',
    owner_role_key: 'warehouse',
    task_group: 'finished_goods_inbound',
    payload: {
      notification_type: 'task_created',
      alert_type: 'finished_goods_inbound_pending',
      finished_goods: true,
      critical_path: true,
    },
  })
  const finishedGoodsRework = task({
    source_type: 'production-progress',
    owner_role_key: 'production',
    task_group: 'finished_goods_rework',
    business_status_key: 'qc_failed',
    payload: {
      notification_type: 'qc_failed',
      alert_type: 'qc_failed',
      finished_goods: true,
      critical_path: true,
    },
  })
  const shipmentPending = task({
    source_type: 'production-progress',
    owner_role_key: 'warehouse',
    task_group: 'shipment_release',
    business_status_key: 'shipment_pending',
    payload: {
      notification_type: 'task_created',
      alert_type: 'shipment_pending',
      finished_goods: true,
      critical_path: true,
    },
  })

  assert.equal(
    buildWorkflowTaskAlert(blocked, { nowMs: NOW_MS })?.alert_level,
    'critical'
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(dueSoon, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(dueSoon, { nowMs: NOW_MS })?.alert_level,
    ],
    ['due_soon', 'warning']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(iqcPending, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(iqcPending, { nowMs: NOW_MS })?.alert_label,
    ],
    ['qc_pending', 'IQC 待检']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(inboundPending, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(inboundPending, { nowMs: NOW_MS })?.alert_label,
    ],
    ['inbound_pending', '待确认入库']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(qcFailed, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(qcFailed, { nowMs: NOW_MS })?.alert_level,
    ],
    ['qc_failed', 'critical']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(purchaseQcFailed, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(purchaseQcFailed, { nowMs: NOW_MS })?.alert_level,
    ],
    ['qc_failed', 'critical']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(shipmentDue, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(shipmentDue, { nowMs: NOW_MS })?.alert_level,
    ],
    ['shipment_due', 'critical']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(highPriority, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(highPriority, { nowMs: NOW_MS })?.alert_level,
    ],
    ['high_priority', 'warning']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(financeOverdue, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(financeOverdue, { nowMs: NOW_MS })?.alert_level,
    ],
    ['finance_overdue', 'critical']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(outsourceReturnPending, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(outsourceReturnPending, { nowMs: NOW_MS })
        ?.alert_label,
    ],
    ['outsource_return_pending', '委外回货待跟踪']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(outsourceReturnQcPending, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(outsourceReturnQcPending, { nowMs: NOW_MS })
        ?.alert_label,
    ],
    ['outsource_return_qc_pending', '委外回货待检验']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(outsourceRework, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(outsourceRework, { nowMs: NOW_MS })?.alert_level,
    ],
    ['qc_failed', 'critical']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(finishedGoodsQcPending, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(finishedGoodsQcPending, { nowMs: NOW_MS })
        ?.alert_label,
    ],
    ['finished_goods_qc_pending', '成品抽检待处理']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(finishedGoodsInboundPending, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(finishedGoodsInboundPending, { nowMs: NOW_MS })
        ?.alert_label,
    ],
    ['finished_goods_inbound_pending', '成品待入库']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(finishedGoodsRework, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(finishedGoodsRework, { nowMs: NOW_MS })
        ?.alert_level,
    ],
    ['qc_failed', 'critical']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(shipmentPending, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(shipmentPending, { nowMs: NOW_MS })?.alert_label,
    ],
    ['shipment_pending', '待出货准备']
  )
})

test('workflowDashboardStats: PMC 老板和财务关注事项按规则汇总', () => {
  const stats = buildWorkflowDashboardStats(
    [
      task({ task_status_key: 'blocked' }),
      task({ due_at: NOW_SEC - 60 }),
      task({ priority: 3 }),
      task({ payload: { critical_path: true } }),
      task({
        owner_role_key: 'boss',
        payload: { notification_type: 'approval_required' },
      }),
      task({
        source_type: 'shipping-release',
        due_at: NOW_SEC + 60 * 60,
      }),
      task({
        source_type: 'receivables',
        owner_role_key: 'finance',
        due_at: NOW_SEC - 60,
      }),
    ],
    { nowMs: NOW_MS }
  )

  assert(stats.pmcFocus >= 4)
  assert(stats.bossFocus >= 3)
  assert.equal(stats.financePending, 1)
  assert.equal(stats.buckets.financePending.length, 1)
  assert.equal(stats.buckets.approvalPending.length, 1)
})

test('workflowDashboardStats: 催办和升级进入预警统计', () => {
  const urgedTask = task({
    id: 11,
    payload: {
      urged: true,
      urge_count: 2,
      last_urge_at: NOW_SEC,
      last_urge_reason: '请今天处理',
    },
  })
  const escalatedTask = task({
    id: 12,
    owner_role_key: 'finance',
    payload: {
      urged: true,
      escalated: true,
      last_urge_action: 'escalate_to_boss',
      escalate_target_role_key: 'boss',
      notification_type: 'urgent_escalation',
      alert_type: 'urgent_escalation',
    },
  })

  assert.deepEqual(
    [
      buildWorkflowTaskAlert(urgedTask, { nowMs: NOW_MS })?.notification_type,
      buildWorkflowTaskAlert(urgedTask, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(urgedTask, { nowMs: NOW_MS })?.alert_level,
    ],
    ['task_urged', 'urged_task', 'warning']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(escalatedTask, { nowMs: NOW_MS })
        ?.notification_type,
      buildWorkflowTaskAlert(escalatedTask, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(escalatedTask, { nowMs: NOW_MS })?.alert_level,
      buildWorkflowTaskAlert(escalatedTask, { nowMs: NOW_MS })?.alert_label,
    ],
    ['urgent_escalation', 'urgent_escalation', 'critical', '已升级老板']
  )

  const stats = buildWorkflowDashboardStats([urgedTask, escalatedTask], {
    nowMs: NOW_MS,
  })

  assert.equal(stats.urged, 2)
  assert.equal(stats.escalated, 1)
  assert.equal(stats.buckets.urgedTasks.length, 1)
  assert.equal(stats.buckets.escalatedTasks.length, 1)
  assert.equal(stats.buckets.bossEscalations.length, 1)
  assert.equal(stats.pmcFocus, 2)
  assert.equal(stats.bossFocus, 1)
})

test('workflowDashboardStats: 委外延期和回货预警进入对应桶', () => {
  const stats = buildWorkflowDashboardStats(
    [
      task({
        id: 21,
        source_type: 'processing-contracts',
        owner_role_key: 'production',
        payload: { vendor_delay: true },
      }),
      task({
        id: 22,
        source_type: 'processing-contracts',
        owner_role_key: 'production',
        task_group: 'outsource_return_tracking',
        payload: { alert_type: 'outsource_return_pending' },
      }),
      task({
        id: 23,
        source_type: 'processing-contracts',
        owner_role_key: 'quality',
        task_group: 'outsource_return_qc',
        payload: { alert_type: 'outsource_return_qc_pending' },
      }),
    ],
    { nowMs: NOW_MS }
  )

  assert.equal(stats.buckets.vendorDelay.length, 1)
  assert.equal(stats.buckets.outsourceReturnPending.length, 1)
  assert.equal(stats.buckets.outsourceReturnQcPending.length, 1)
})

test('workflowDashboardStats: 成品抽检 入库 返工和待出货预警进入对应桶', () => {
  const stats = buildWorkflowDashboardStats(
    [
      task({
        id: 31,
        source_type: 'production-progress',
        owner_role_key: 'quality',
        task_group: 'finished_goods_qc',
        payload: { alert_type: 'finished_goods_qc_pending' },
      }),
      task({
        id: 32,
        source_type: 'production-progress',
        owner_role_key: 'warehouse',
        task_group: 'finished_goods_inbound',
        payload: { alert_type: 'finished_goods_inbound_pending' },
      }),
      task({
        id: 33,
        source_type: 'production-progress',
        owner_role_key: 'production',
        task_group: 'finished_goods_rework',
        business_status_key: 'qc_failed',
        payload: { alert_type: 'qc_failed', finished_goods: true },
      }),
      task({
        id: 34,
        source_type: 'production-progress',
        owner_role_key: 'warehouse',
        task_group: 'shipment_release',
        business_status_key: 'shipment_pending',
        payload: { alert_type: 'shipment_pending', critical_path: true },
      }),
    ],
    { nowMs: NOW_MS }
  )

  assert.equal(stats.buckets.finishedGoodsQcPending.length, 1)
  assert.equal(stats.buckets.finishedGoodsInboundPending.length, 1)
  assert.equal(stats.buckets.qcFailed.length, 1)
  assert.equal(stats.buckets.shipmentPending.length, 1)
  assert.equal(stats.criticalAlerts, 1)
})

test('workflowDashboardStats: 应收 开票和财务超时进入财务预警', () => {
  const receivableTask = task({
    id: 41,
    source_type: 'outbound',
    owner_role_key: 'finance',
    task_group: 'receivable_registration',
    business_status_key: 'shipped',
    payload: {
      notification_type: 'finance_pending',
      alert_type: 'finance_pending',
      critical_path: true,
    },
  })
  const invoiceTask = task({
    id: 42,
    source_type: 'receivables',
    owner_role_key: 'finance',
    task_group: 'invoice_registration',
    business_status_key: 'reconciling',
    payload: {
      notification_type: 'finance_pending',
      alert_type: 'invoice_pending',
    },
  })
  const overdueInvoiceTask = task({
    id: 43,
    source_type: 'invoices',
    owner_role_key: 'finance',
    task_group: 'invoice_registration',
    business_status_key: 'reconciling',
    due_at: NOW_SEC - 60,
    payload: {
      notification_type: 'finance_pending',
      alert_type: 'invoice_pending',
    },
  })

  assert.deepEqual(
    [
      buildWorkflowTaskAlert(receivableTask, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(receivableTask, { nowMs: NOW_MS })?.alert_label,
    ],
    ['finance_pending', '应收待登记']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(invoiceTask, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(invoiceTask, { nowMs: NOW_MS })?.alert_label,
    ],
    ['invoice_pending', '开票待登记']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(overdueInvoiceTask, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(overdueInvoiceTask, { nowMs: NOW_MS })
        ?.alert_level,
    ],
    ['finance_overdue', 'critical']
  )

  const stats = buildWorkflowDashboardStats(
    [receivableTask, invoiceTask, overdueInvoiceTask],
    { nowMs: NOW_MS }
  )

  assert.equal(stats.financePending, 3)
  assert.equal(stats.buckets.financePending.length, 2)
  assert.equal(stats.buckets.invoicePending.length, 1)
  assert.equal(stats.buckets.financeOverdue.length, 1)
  assert.equal(stats.pmcFocus, 2)
  assert.equal(stats.bossFocus, 1)
})

test('workflowDashboardStats: 应付 对账和财务超时进入财务预警', () => {
  const purchasePayableTask = task({
    id: 51,
    source_type: 'accessories-purchase',
    owner_role_key: 'finance',
    task_group: 'purchase_payable_registration',
    business_status_key: 'inbound_done',
    payload: {
      notification_type: 'finance_pending',
      alert_type: 'payable_pending',
      payable_type: 'purchase',
    },
  })
  const outsourceReconciliationTask = task({
    id: 52,
    source_type: 'processing-contracts',
    owner_role_key: 'finance',
    task_group: 'outsource_reconciliation',
    business_status_key: 'reconciling',
    payload: {
      notification_type: 'finance_pending',
      alert_type: 'reconciliation_pending',
      payable_type: 'outsource',
    },
  })
  const overduePayableTask = task({
    id: 53,
    source_type: 'payables',
    owner_role_key: 'finance',
    task_group: 'purchase_payable_registration',
    business_status_key: 'inbound_done',
    due_at: NOW_SEC - 60,
    payload: {
      notification_type: 'finance_pending',
      alert_type: 'payable_pending',
      payable_type: 'purchase',
    },
  })

  assert.deepEqual(
    [
      buildWorkflowTaskAlert(purchasePayableTask, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(purchasePayableTask, { nowMs: NOW_MS })
        ?.alert_label,
    ],
    ['payable_pending', '应付待登记']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(outsourceReconciliationTask, { nowMs: NOW_MS })
        ?.alert_type,
      buildWorkflowTaskAlert(outsourceReconciliationTask, { nowMs: NOW_MS })
        ?.alert_label,
    ],
    ['reconciliation_pending', '对账待处理']
  )
  assert.deepEqual(
    [
      buildWorkflowTaskAlert(overduePayableTask, { nowMs: NOW_MS })?.alert_type,
      buildWorkflowTaskAlert(overduePayableTask, { nowMs: NOW_MS })
        ?.alert_level,
    ],
    ['finance_overdue', 'critical']
  )

  const stats = buildWorkflowDashboardStats(
    [purchasePayableTask, outsourceReconciliationTask, overduePayableTask],
    { nowMs: NOW_MS }
  )

  assert.equal(stats.financePending, 3)
  assert.equal(stats.buckets.financePending.length, 3)
  assert.equal(stats.buckets.payablePending.length, 1)
  assert.equal(stats.buckets.reconciliationPending.length, 1)
  assert.equal(stats.buckets.financeOverdue.length, 1)
  assert.equal(stats.pmcFocus, 1)
  assert.equal(stats.bossFocus, 1)
})
