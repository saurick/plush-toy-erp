import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ENGINEERING_PREPARING_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  ORDER_APPROVAL_STATUS_KEY,
  isEngineeringDataTask,
  isOpenWorkflowTask,
  isOrderApprovalTask,
  isOrderRevisionTask,
} from './orderApprovalFlow.mjs'

const orderApprovalFlowSource = readFileSync(
  new URL('./orderApprovalFlow.mjs', import.meta.url),
  'utf8'
)
const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)
const mobileRoleTaskActionsSource = readFileSync(
  new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
  'utf8'
)

test('orderApprovalFlow: 正式运行时代码不再保留前端串任务 builder', () => {
  assert.equal(
    orderApprovalFlowSource.includes('buildBossApprovalTaskFromProjectOrder'),
    false
  )
  assert.equal(
    orderApprovalFlowSource.includes('buildEngineeringTaskFromApprovedOrder'),
    false
  )
  assert.equal(
    orderApprovalFlowSource.includes('buildRevisionTaskFromRejectedOrder'),
    false
  )
  assert.equal(orderApprovalFlowSource.includes('taskCode('), false)
  assert.equal(orderApprovalFlowSource.includes('owner_role_key:'), false)
  assert.equal(orderApprovalFlowSource.includes('due_at:'), false)
})

test('orderApprovalFlow: 保留订单审批相关任务识别和状态常量', () => {
  assert.equal(ORDER_APPROVAL_STATUS_KEY, 'project_pending')
  assert.equal(ORDER_APPROVED_STATUS_KEY, 'project_approved')
  assert.equal(ENGINEERING_PREPARING_STATUS_KEY, 'engineering_preparing')
  assert.equal(
    isOrderApprovalTask({
      source_type: 'project-orders',
      task_group: 'order_approval',
    }),
    true
  )
  assert.equal(
    isEngineeringDataTask({
      source_type: 'project-orders',
      task_group: 'engineering_data',
    }),
    true
  )
  assert.equal(
    isOrderRevisionTask({
      source_type: 'project-orders',
      task_group: 'order_revision',
    }),
    true
  )
  assert.equal(
    isOrderApprovalTask({
      source_type: 'project-orders',
      task_group: 'engineering_data',
    }),
    false
  )
  assert.equal(
    isOrderApprovalTask({
      source_type: 'material-bom',
      task_group: 'order_approval',
    }),
    false
  )
  assert.equal(isOpenWorkflowTask({ task_status_key: 'ready' }), true)
  assert.equal(isOpenWorkflowTask({ task_status_key: 'done' }), false)
  assert.equal(isOpenWorkflowTask({ task_status_key: 'rejected' }), false)
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
  assert.match(mobileRoleTaskActionsSource, /await loadTasks\(\)/)
})
