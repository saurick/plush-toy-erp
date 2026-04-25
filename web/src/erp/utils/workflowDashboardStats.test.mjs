import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowDashboardStats,
  buildWorkflowTaskAlert,
  getWorkflowTaskDueStatus,
} from './workflowDashboardStats.mjs'

const NOW_SEC = 1_800_000_000
const NOW_MS = NOW_SEC * 1000

function task(overrides = {}) {
  return {
    id: overrides.id || Math.floor(Math.random() * 100000),
    task_name: overrides.task_name || '测试任务',
    task_status_key: overrides.task_status_key || 'pending',
    owner_role_key: overrides.owner_role_key || 'merchandiser',
    source_type: overrides.source_type || 'project-orders',
    source_id: overrides.source_id || 1,
    priority: overrides.priority || 0,
    payload: overrides.payload || {},
    ...overrides,
  }
}

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
