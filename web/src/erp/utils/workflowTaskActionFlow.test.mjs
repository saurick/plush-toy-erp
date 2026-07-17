import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkflowTaskActionStepAvailability,
  isWorkflowTaskActionReady,
  moveWorkflowTaskActionStep,
  resolveWorkflowTaskActionInitialStep,
  resolveWorkflowTaskActionStep,
} from './workflowTaskActionFlow.mjs'

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

test('step navigation exposes context and action immediately but gates confirmation', () => {
  const beforeSelection = getWorkflowTaskActionStepAvailability({
    canChooseActions: true,
    canConfirm: false,
  })
  assert.deepEqual(beforeSelection, {
    context: true,
    action: true,
    confirm: false,
  })
  assert.equal(
    resolveWorkflowTaskActionStep({
      requestedStep: 'action',
      availability: beforeSelection,
    }),
    'action'
  )
  assert.equal(
    resolveWorkflowTaskActionStep({
      requestedStep: 'confirm',
      availability: beforeSelection,
    }),
    'context'
  )

  const afterSelection = getWorkflowTaskActionStepAvailability({
    canChooseActions: true,
    canConfirm: true,
  })
  assert.equal(
    moveWorkflowTaskActionStep({
      currentStep: 'action',
      direction: 1,
      availability: afterSelection,
    }),
    'confirm'
  )
  assert.equal(
    moveWorkflowTaskActionStep({
      currentStep: 'context',
      direction: -1,
      availability: beforeSelection,
    }),
    'action'
  )
})
