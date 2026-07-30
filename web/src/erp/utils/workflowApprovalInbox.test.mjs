import assert from 'node:assert/strict'
import test from 'node:test'

import { canViewWorkflowApprovalInbox } from './workflowApprovalInbox.mjs'

test('workflowApprovalInbox: 任一有效审批能力即可显示统一入口', () => {
  assert.equal(
    canViewWorkflowApprovalInbox({
      permissions: ['finance.payment.approve'],
      effective_session: { actions: ['finance.payment.approve'] },
    }),
    true
  )
  assert.equal(
    canViewWorkflowApprovalInbox({
      permissions: ['workflow.task.approve'],
      effective_session: { actions: ['workflow.task.approve'] },
    }),
    true
  )
})

test('workflowApprovalInbox: RBAC 或当前有效会话任一缺失都隐藏入口', () => {
  assert.equal(
    canViewWorkflowApprovalInbox({
      permissions: ['finance.payment.approve'],
      effective_session: { actions: [] },
    }),
    false
  )
  assert.equal(
    canViewWorkflowApprovalInbox({
      permissions: [],
      effective_session: { actions: ['finance.payment.approve'] },
    }),
    false
  )
  assert.equal(
    canViewWorkflowApprovalInbox({
      permissions: ['workflow.task.read'],
      effective_session: { actions: ['workflow.task.read'] },
    }),
    false
  )
})
