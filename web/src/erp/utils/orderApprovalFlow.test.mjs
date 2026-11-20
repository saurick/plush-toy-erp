import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import * as flow from './orderApprovalFlow.mjs'
import {
  assertCanonicalTaskReload,
  assertServerOwnedTaskMatchers,
  assertSourceOmitsSymbols,
  mobileWorkflowSources,
} from '../../../scripts/test/workflowFlowContract.mjs'

const {
  ENGINEERING_PREPARING_STATUS_KEY,
  ORDER_APPROVED_STATUS_KEY,
  ORDER_APPROVAL_STATUS_KEY,
  isOpenWorkflowTask,
} = flow

const {
  actions: mobileRoleTaskActionsSource,
  page: mobileRoleTasksPageSource,
} = mobileWorkflowSources
const orderApprovalFlowSource = readFileSync(
  new URL('./orderApprovalFlow.mjs', import.meta.url),
  'utf8'
)

test('orderApprovalFlow: 正式运行时代码不再保留前端串任务 builder', () => {
  assertSourceOmitsSymbols(orderApprovalFlowSource, 'orderApprovalFlow', [
    'buildBossApprovalTaskFromProjectOrder',
    'buildEngineeringTaskFromApprovedOrder',
    'buildRevisionTaskFromRejectedOrder',
    'taskCode(',
    'owner_role_key:',
    'due_at:',
  ])
})

test('orderApprovalFlow: 保留订单审批相关任务识别和状态常量', () => {
  assert.equal(ORDER_APPROVAL_STATUS_KEY, 'project_pending')
  assert.equal(ORDER_APPROVED_STATUS_KEY, 'project_approved')
  assert.equal(ENGINEERING_PREPARING_STATUS_KEY, 'engineering_preparing')
  assertServerOwnedTaskMatchers(flow, [
    {
      matcher: 'isOrderApprovalTask',
      sourceType: 'project-orders',
      taskGroup: 'order_approval',
    },
    {
      matcher: 'isEngineeringDataTask',
      sourceType: 'project-orders',
      taskGroup: 'engineering_data',
    },
    {
      matcher: 'isOrderRevisionTask',
      sourceType: 'project-orders',
      taskGroup: 'order_revision',
    },
  ])
  assert.equal(isOpenWorkflowTask({ task_status_key: 'ready' }), true)
  assert.equal(isOpenWorkflowTask({ task_status_key: 'done' }), false)
  assert.equal(isOpenWorkflowTask({ task_status_key: 'rejected' }), false)
})

test('orderApprovalFlow: 移动端老板审批不再本地创建下游任务', () => {
  assertSourceOmitsSymbols(mobileRoleTasksPageSource, 'MobileRoleTasksPage', [
    'buildEngineeringTaskFromApprovedOrder',
    'buildRevisionTaskFromRejectedOrder',
    'approveOrderTask',
    'rejectOrderTask',
    'runOrderApprovalFollowUp',
  ])
  assertCanonicalTaskReload(mobileRoleTaskActionsSource)
})
