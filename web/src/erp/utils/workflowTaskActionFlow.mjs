export const WORKFLOW_TASK_ACTION_STEP_KEYS = Object.freeze([
  'context',
  'action',
  'confirm',
])

export function resolveWorkflowTaskActionInitialStep(actionMode = '') {
  return String(actionMode || '').trim() ? 'action' : 'context'
}

export function isWorkflowTaskActionReady({
  actionMode = '',
  actionReason = '',
  allowedActionModes = [],
  requireReason = false,
} = {}) {
  const normalizedMode = String(actionMode || '').trim()
  if (!normalizedMode || !allowedActionModes.includes(normalizedMode)) {
    return false
  }
  if (!requireReason) return true
  return Boolean(String(actionReason || '').trim())
}

export function getWorkflowTaskActionStepAvailability({
  canChooseActions = false,
  canConfirm = false,
} = {}) {
  return Object.freeze({
    context: true,
    action: Boolean(canChooseActions),
    confirm: Boolean(canConfirm),
  })
}

export function resolveWorkflowTaskActionStep({
  requestedStep = 'context',
  availability = {},
  fallbackStep = 'context',
} = {}) {
  const normalizedRequestedStep = String(requestedStep || '').trim()
  if (
    WORKFLOW_TASK_ACTION_STEP_KEYS.includes(normalizedRequestedStep) &&
    availability[normalizedRequestedStep]
  ) {
    return normalizedRequestedStep
  }
  if (
    WORKFLOW_TASK_ACTION_STEP_KEYS.includes(fallbackStep) &&
    availability[fallbackStep]
  ) {
    return fallbackStep
  }
  return 'context'
}

export function moveWorkflowTaskActionStep({
  currentStep = 'context',
  direction = 1,
  availability = {},
} = {}) {
  const availableSteps = WORKFLOW_TASK_ACTION_STEP_KEYS.filter(
    (stepKey) => availability[stepKey]
  )
  if (availableSteps.length === 0) return 'context'
  const currentIndex = availableSteps.indexOf(currentStep)
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0
  const offset = direction < 0 ? -1 : 1
  return availableSteps[
    (normalizedIndex + offset + availableSteps.length) % availableSteps.length
  ]
}
