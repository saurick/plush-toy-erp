import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkflowTaskActionStepAvailability,
  isWorkflowTaskActionReady,
  moveWorkflowTaskActionStep,
  resolveWorkflowTaskActionInitialStep,
  resolveWorkflowTaskActionStep,
  splitWorkflowTaskActions,
} from './workflowTaskActionFlow.mjs'

test('action grouping keeps ordinary and approval primary choices small without removing allowed actions', () => {
  const actions = ['complete', 'block', 'reject', 'urge', 'assign']
  assert.deepEqual(splitWorkflowTaskActions({ actions }), {
    primary: ['complete', 'block'],
    secondary: ['reject', 'urge', 'assign'],
  })
  assert.deepEqual(splitWorkflowTaskActions({ actions, approvalTask: true }), {
    primary: ['complete', 'reject'],
    secondary: ['block', 'urge', 'assign'],
  })
  assert.deepEqual(splitWorkflowTaskActions({ actions: ['resume', 'urge'] }), {
    primary: ['resume'], secondary: ['urge'],
  })
})

test('mobile grouping preserves permissions, single-action access and empty states', () => {
  assert.deepEqual(splitWorkflowTaskActions({
    actions: ['done', 'blocked', 'rejected', 'urge'], approvalTask: true,
  }), { primary: ['done', 'rejected'], secondary: ['blocked', 'urge'] })
  for (const action of ['urge', 'assign', 'rejected']) {
    assert.deepEqual(splitWorkflowTaskActions({ actions: [action] }), {
      primary: [action], secondary: [],
    })
  }
  assert.deepEqual(splitWorkflowTaskActions(), { primary: [], secondary: [] })
  assert.deepEqual(splitWorkflowTaskActions({ actions: ['urge', 'urge', 'assign'] }), {
    primary: ['urge'], secondary: ['assign'],
  })
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

test('a confirmed receipt remains on its only available step when editing closes', () => {
  for (const requestedStep of ['context', 'action', 'confirm']) {
    assert.equal(
      resolveWorkflowTaskActionStep({
        requestedStep,
        availability: { context: false, action: false, confirm: true },
      }),
      'confirm'
    )
  }
})
