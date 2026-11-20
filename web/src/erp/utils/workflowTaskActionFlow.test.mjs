import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkflowTaskActionStepAvailability,
  isWorkflowTaskActionReady,
  moveWorkflowTaskActionStep,
  orderWorkflowTaskActions,
  workflowTaskCollaborationModes,
  workflowTaskHandlingModes,
  workflowTaskPrimaryModes,
  resolveWorkflowTaskActionInitialStep,
  resolveWorkflowTaskActionStep,
} from './workflowTaskActionFlow.mjs'

test('secondary collaboration keeps only authorized ancillary commands without completing business work', () => {
  assert.deepEqual(workflowTaskCollaborationModes(['complete', 'urge', 'assign', 'urge', 'unknown']), ['assign'])
  assert.deepEqual(workflowTaskCollaborationModes([]), [])
  assert.deepEqual(workflowTaskCollaborationModes(['block', 'resume', 'reject']), ['block', 'resume'])
  assert.deepEqual(workflowTaskCollaborationModes(['complete', 'block', 'reject', 'urge', 'assign']), ['block', 'assign'])
  assert.deepEqual(workflowTaskCollaborationModes(['urge', 'assign']), ['urge', 'assign'])
})

test('handling keeps approval rejection and recovery while urging is limited to follow-up access', () => {
  assert.deepEqual(workflowTaskHandlingModes(['complete', 'reject', 'urge']), ['complete', 'reject'])
  assert.deepEqual(workflowTaskHandlingModes(['done', 'blocked', 'rejected', 'urge']), ['done', 'blocked', 'rejected'])
  assert.deepEqual(workflowTaskHandlingModes(['resume', 'urge']), ['resume'])
  assert.deepEqual(workflowTaskHandlingModes(['urge', 'assign', 'urge']), ['urge', 'assign'])
  assert.deepEqual(workflowTaskHandlingModes(), [])
})

test('action ordering keeps ordinary and approval choices stable without hiding allowed actions', () => {
  const actions = ['complete', 'block', 'reject', 'urge', 'assign']
  assert.deepEqual(orderWorkflowTaskActions({ actions }), actions)
  assert.deepEqual(
    orderWorkflowTaskActions({ actions, approvalTask: true }),
    ['complete', 'reject', 'block', 'urge', 'assign']
  )
  assert.deepEqual(
    orderWorkflowTaskActions({ actions: ['resume', 'urge'] }),
    ['resume', 'urge']
  )
})

test('mobile ordering preserves permissions, single-action access and empty states', () => {
  assert.deepEqual(
    orderWorkflowTaskActions({
      actions: ['done', 'blocked', 'rejected', 'urge'],
      approvalTask: true,
    }),
    ['done', 'rejected', 'blocked', 'urge']
  )
  for (const action of ['urge', 'assign', 'rejected']) {
    assert.deepEqual(orderWorkflowTaskActions({ actions: [action] }), [action])
  }
  assert.deepEqual(orderWorkflowTaskActions(), [])
  assert.deepEqual(
    orderWorkflowTaskActions({ actions: ['urge', 'urge', 'assign'] }),
    ['urge', 'assign']
  )
})

test('task action flow opens on context unless an action was explicitly preselected', () => {
  assert.equal(resolveWorkflowTaskActionInitialStep(), 'context')
  assert.equal(resolveWorkflowTaskActionInitialStep('urge'), 'action')
})

test('confirmation requires an allowed action and any required reason', () => {
  const allowedActionModes = ['complete', 'block', 'urge']
  assert.equal(
    isWorkflowTaskActionReady({
      actionMode: 'complete',
      allowedActionModes,
    }),
    true
  )
  assert.equal(
    isWorkflowTaskActionReady({
      actionMode: 'block',
      allowedActionModes,
      requireReason: true,
    }),
    false
  )
  assert.equal(
    isWorkflowTaskActionReady({
      actionMode: 'block',
      actionReason: '等待供应商补齐资料',
      allowedActionModes,
      requireReason: true,
    }),
    true
  )
  assert.equal(
    isWorkflowTaskActionReady({
      actionMode: 'reject',
      actionReason: '资料不完整',
      allowedActionModes,
      requireReason: true,
    }),
    false
  )
})

test('receipt stays locked until an outcome exists, and finished tasks retain all steps', () => {
  assert.deepEqual(getWorkflowTaskActionStepAvailability(), { context: true, action: true, confirm: false })
  assert.equal(getWorkflowTaskActionStepAvailability({ hasReceipt: true }).confirm, true)
  const availability = getWorkflowTaskActionStepAvailability({ isTerminal: true })
  assert.deepEqual(availability, { context: true, action: true, confirm: true })
  for (const requestedStep of ['context', 'action', 'confirm']) {
    assert.equal(resolveWorkflowTaskActionStep({ requestedStep, availability }), requestedStep)
  }
  assert.equal(moveWorkflowTaskActionStep({ currentStep: 'confirm', direction: -1, availability }), 'action')
  assert.equal(moveWorkflowTaskActionStep({ currentStep: 'context', direction: -1, availability }), 'confirm')
})

test('primary choices never absorb generic task coordination on either device', () => {
  assert.deepEqual(workflowTaskPrimaryModes(['complete', 'block', 'reject', 'resume', 'urge', 'assign']), ['complete', 'reject'])
  assert.deepEqual(workflowTaskPrimaryModes(['done', 'blocked', 'rejected', 'resume', 'urge']), ['done', 'rejected'])
  assert.deepEqual(workflowTaskPrimaryModes(['urge', 'assign']), [])
})
