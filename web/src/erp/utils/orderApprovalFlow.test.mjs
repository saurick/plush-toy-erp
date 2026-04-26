import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildBossApprovalTaskFromProjectOrder,
  buildEngineeringTaskFromApprovedOrder,
  buildRevisionTaskFromRejectedOrder,
  resolveEngineeringDueAt,
  resolveOrderApprovalPriority,
} from './orderApprovalFlow.mjs'

const NOW_MS = Date.parse('2026-04-25T08:00:00')
const NOW_SEC = Math.floor(NOW_MS / 1000)
const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

function projectOrder(overrides = {}) {
  return {
    id: 88,
    module_key: 'project-orders',
    document_no: 'PO-20260425-001',
    title: '企鹅抱枕',
    customer_name: '成慧怡',
    source_no: 'CUS-001',
    style_no: 'ST-001',
    product_no: 'PRD-001',
    product_name: '企鹅抱枕',
    due_date: '2026-05-01',
    business_status_key: 'project_pending',
    owner_role_key: 'business',
    payload: {},
    ...overrides,
  }
}

test('orderApprovalFlow: project-orders 记录生成老板审批任务', () => {
  const task = buildBossApprovalTaskFromProjectOrder(projectOrder(), {
    nowMs: NOW_MS,
  })

  assert.equal(task.task_group, 'order_approval')
  assert.equal(task.task_name, '老板审批订单')
  assert.equal(task.source_type, 'project-orders')
  assert.equal(task.source_id, 88)
  assert.equal(task.source_no, 'PO-20260425-001')
  assert.equal(task.business_status_key, 'project_pending')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'boss')
  assert.equal(task.priority, 2)
  assert.equal(task.due_at, NOW_SEC + 24 * 60 * 60)
  assert.equal(task.payload.notification_type, 'approval_required')
  assert.equal(task.payload.alert_type, 'approval_pending')
  assert.equal(task.payload.critical_path, true)
  assert.match(task.payload.complete_condition, /审批通过或驳回/)
  assert(task.payload.related_documents.some((item) => item.includes('交期')))
})

test('orderApprovalFlow: 老板审批通过后生成工程资料任务', () => {
  const task = buildEngineeringTaskFromApprovedOrder(projectOrder(), {
    nowMs: NOW_MS,
  })

  assert.equal(task.task_group, 'engineering_data')
  assert.equal(task.task_name, '准备 BOM / 色卡 / 作业指导书')
  assert.equal(task.business_status_key, 'engineering_preparing')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'engineering')
  assert.equal(task.priority, 2)
  assert.equal(task.payload.next_module_key, 'material-bom')
  assert.equal(task.payload.entry_path, '/erp/purchase/material-bom')
  assert.equal(task.payload.critical_path, true)
  assert.match(task.payload.complete_condition, /BOM/)
  assert(task.payload.related_documents.some((item) => item.includes('BOM')))
})

test('orderApprovalFlow: 老板驳回后生成业务补资料任务', () => {
  const task = buildRevisionTaskFromRejectedOrder(
    projectOrder(),
    '交期和款图缺失',
    { nowMs: NOW_MS }
  )

  assert.equal(task.task_group, 'order_revision')
  assert.equal(task.task_name, '补充订单资料后重新提交')
  assert.equal(task.business_status_key, 'project_pending')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'business')
  assert.equal(task.priority, 2)
  assert.equal(task.payload.decision, 'rejected')
  assert.equal(task.payload.transition_status, 'rejected')
  assert.equal(task.payload.rejected_reason, '交期和款图缺失')
  assert.equal(task.payload.notification_type, 'task_rejected')
  assert.equal(task.payload.critical_path, true)
  assert.match(task.payload.complete_condition, /补齐客户资料/)
})

test('orderApprovalFlow: 老板阻塞后补资料任务保留 blocked 决策来源', () => {
  const task = buildRevisionTaskFromRejectedOrder(projectOrder(), '缺少款图', {
    nowMs: NOW_MS,
    decision: 'blocked',
  })

  assert.equal(task.task_group, 'order_revision')
  assert.equal(task.owner_role_key, 'business')
  assert.equal(task.payload.decision, 'blocked')
  assert.equal(task.payload.transition_status, 'blocked')
  assert.equal(task.payload.blocked_reason, '缺少款图')
  assert.equal(task.payload.rejected_reason, '缺少款图')
})

test('orderApprovalFlow: 移动端老板审批不再本地创建下游任务', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('buildEngineeringTaskFromApprovedOrder'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildRevisionTaskFromRejectedOrder'),
    false
  )
  assert.equal(mobileRoleTasksPageSource.includes('approveOrderTask'), false)
  assert.equal(mobileRoleTasksPageSource.includes('rejectOrderTask'), false)
  assert.equal(
    mobileRoleTasksPageSource.includes('runOrderApprovalFollowUp'),
    false
  )
  assert.match(mobileRoleTasksPageSource, /await loadTasks\(\)/)
})

test('orderApprovalFlow: due_at 使用 Unix 秒且工程任务默认 24 小时后到期', () => {
  const defaultDueAt = resolveEngineeringDueAt(projectOrder(), {
    nowMs: NOW_MS,
  })
  const closeDueAt = resolveEngineeringDueAt(
    projectOrder({ due_date: '2026-04-25' }),
    { nowMs: NOW_MS }
  )

  assert.equal(defaultDueAt, NOW_SEC + 24 * 60 * 60)
  assert.equal(closeDueAt, NOW_SEC + 4 * 60 * 60)
  assert(defaultDueAt < NOW_MS)
})

test('orderApprovalFlow: 优先级默认 2，显式 priority 和近交期可提升', () => {
  assert.equal(
    resolveOrderApprovalPriority(projectOrder(), { nowMs: NOW_MS }),
    2
  )
  assert.equal(
    resolveOrderApprovalPriority(projectOrder({ payload: { priority: 4 } }), {
      nowMs: NOW_MS,
    }),
    4
  )
  assert.equal(
    resolveOrderApprovalPriority(projectOrder({ due_date: '2026-04-25' }), {
      nowMs: NOW_MS,
    }),
    4
  )
})

test('orderApprovalFlow: 缺 document_no 时回退 source_no/title 且不影响非项目订单', () => {
  const task = buildBossApprovalTaskFromProjectOrder(
    projectOrder({ document_no: '', source_no: 'CUS-FALLBACK' }),
    { nowMs: NOW_MS }
  )
  const fallbackToTitleTask = buildBossApprovalTaskFromProjectOrder(
    projectOrder({ document_no: '', source_no: '', title: '标题兜底' }),
    { nowMs: NOW_MS }
  )
  const nonProjectTask = buildBossApprovalTaskFromProjectOrder(
    projectOrder({ module_key: 'material-bom' }),
    { nowMs: NOW_MS }
  )

  assert.equal(task.source_no, 'CUS-FALLBACK')
  assert.equal(fallbackToTitleTask.source_no, '标题兜底')
  assert.equal(nonProjectTask, null)
})
