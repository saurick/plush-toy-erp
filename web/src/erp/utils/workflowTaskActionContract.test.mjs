import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORKFLOW_APPROVAL_CAPABILITY_KEYS,
  getWorkflowProcessDecisionApprovalProfile,
  getWorkflowTaskActionPermission,
  isWorkflowApprovalTask,
  isWorkflowProcessDecisionTask,
  workflowTaskAllowsApprovedQuantity,
  workflowTaskActionInput,
} from './workflowTaskActionContract.mjs'

const ALL_APPROVAL_CAPABILITIES = Object.freeze([
  'workflow.task.approve',
  'finance.payment.approve',
  'warehouse.adjustment.approve',
  'production.exception.approve',
  'engineering.material.boss_approve',
  'engineering.material.finance_approve',
])

test('办理输入保留短提示，并把填写指导与必填责任分开', () => {
  const approval = workflowTaskActionInput({ required_capability_key: 'production.exception.approve' }, 'complete')
  assert.equal(approval.placeholder, '填写审批意见')
  assert.equal(approval.required, true)
  assert.match(approval.help, /审批依据/u)
  const followup = workflowTaskActionInput({ task_group: 'business_followup' }, 'complete')
  assert.equal(followup.placeholder, '填写处理结果')
  assert.match(followup.help, /发起人/u)
  const urge = workflowTaskActionInput({}, 'urge')
  assert.equal(urge.placeholder, '填写催办说明')
  assert.equal(urge.required, false)
  assert.match(urge.fieldLabel, /选填/u)
  assert.match(urge.help, /期望完成时间/u)
})
const APPROVAL_CAPABILITIES = Object.freeze([
  'finance.payment.approve',
  'warehouse.adjustment.approve',
  'production.exception.approve',
])

test('workflow task action contract exports the complete ordered approval registry', () => {
  assert.deepEqual(WORKFLOW_APPROVAL_CAPABILITY_KEYS, ALL_APPROVAL_CAPABILITIES)
  for (const capability of ALL_APPROVAL_CAPABILITIES) {
    assert.equal(
      isWorkflowApprovalTask({ required_capability_key: capability }),
      true
    )
  }
})
const PROFILE_BY_CAPABILITY = Object.freeze({
  'finance.payment.approve': 'finance_payment_approval',
  'warehouse.adjustment.approve': 'inventory_adjustment_approval',
  'production.exception.approve': 'production_exception_approval',
})

test('workflow task action contract binds every domain approval to its exact capability and profile', () => {
  for (const capability of APPROVAL_CAPABILITIES) {
    const task = { required_capability_key: capability }
    assert.equal(isWorkflowApprovalTask(task), true)
    assert.equal(isWorkflowProcessDecisionTask(task), true)
    assert.equal(getWorkflowTaskActionPermission('complete', task), capability)
    assert.equal(
      getWorkflowProcessDecisionApprovalProfile(task),
      PROFILE_BY_CAPABILITY[capability]
    )
  }
})

test('workflow task action contract keeps generic completion and non-decision approvals distinct', () => {
  assert.equal(
    getWorkflowTaskActionPermission('complete', {
      required_capability_key: 'finance.payment.post',
    }),
    'workflow.task.complete'
  )
  assert.equal(
    isWorkflowProcessDecisionTask({
      required_capability_key: 'workflow.task.approve',
    }),
    false
  )
})

test('workflow task action contract allows approved quantity only for production exceptions', () => {
  assert.equal(
    workflowTaskAllowsApprovedQuantity({
      required_capability_key: 'production.exception.approve',
    }),
    true
  )
  for (const capability of [
    'finance.payment.approve',
    'warehouse.adjustment.approve',
    'production.exception.execute',
    '',
  ]) {
    assert.equal(
      workflowTaskAllowsApprovedQuantity({
        required_capability_key: capability,
      }),
      false
    )
  }
})
