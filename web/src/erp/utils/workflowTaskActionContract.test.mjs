import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORKFLOW_APPROVAL_CAPABILITY_KEYS,
  getWorkflowProcessDecisionApprovalProfile,
  getWorkflowTaskActionPermission,
  isWorkflowApprovalTask,
  isWorkflowProcessDecisionTask,
  workflowTaskAllowsApprovedQuantity,
} from './workflowTaskActionContract.mjs'

const ALL_APPROVAL_CAPABILITIES = Object.freeze([
  'workflow.task.approve',
  'finance.payment.approve',
  'warehouse.adjustment.approve',
  'production.exception.approve',
])
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
    assert.equal(
      getWorkflowTaskActionPermission('complete', task),
      capability
    )
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
