export const WORKFLOW_TASK_ACTION_STEP_KEYS = Object.freeze([
  'context',
  'action',
  'confirm',
])

export const WORKFLOW_TASK_COLLABORATION_ACTIONS = Object.freeze({
  block: { label: '标记任务受阻', condition: '任务尚未结束，当前责任人有受阻操作权限时显示；点选原因即可标记，补充说明选填。' },
  resume: { label: '解除任务阻塞', condition: '任务处于受阻状态且获准恢复时显示；填写解除说明后恢复待处理。' },
  assign: { label: '转交任务', condition: '后端允许改派且有转交权限时显示；仅调整办理人。' },
  urge: { label: '催办任务', condition: '可催办但不能代为办理时显示；提醒责任人，不改变业务结果。' },
})

export function workflowTaskPrimaryModes(actions = []) {
  return workflowTaskHandlingModes(actions).filter((key) =>
    !['block', 'blocked', 'resume', 'urge', 'assign'].includes(key)
  )
}

// Desktop and mobile use different action keys; ordering never adds permission.
export function orderWorkflowTaskActions({
  actions = [],
  approvalTask = false,
} = {}) {
  const allowed = [...new Set(actions)]
  const preferred = approvalTask
    ? ['complete', 'done', 'reject', 'rejected', 'resume']
    : ['complete', 'done', 'block', 'blocked', 'resume']
  const prioritized = preferred.filter((action) => allowed.includes(action))
  return [
    ...prioritized,
    ...allowed.filter((action) => !prioritized.includes(action)),
  ]
}

// Handling and follow-up share authorization, but handling never needs self-urging.
export function workflowTaskHandlingModes(actions = []) {
  const canHandle = actions.some((key) =>
    ['complete', 'done', 'block', 'blocked', 'reject', 'rejected', 'resume'].includes(key)
  )
  return [...new Set(actions)].filter((key) => key !== 'urge' || !canHandle)
}

// Source editors own completion and rejection; task controls only record coordination.
export function workflowTaskCollaborationModes(actions = []) {
  return orderWorkflowTaskActions({ actions: workflowTaskHandlingModes(actions) }).filter((key) =>
    ['block', 'resume', 'urge', 'assign'].includes(key)
  )
}

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

// A receipt needs an actual handling outcome; viewing never grants mutation permission.
export function getWorkflowTaskActionStepAvailability({ hasReceipt = false, isTerminal = false } = {}) {
  return Object.freeze({ context: true, action: true, confirm: hasReceipt || isTerminal })
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
  return (
    WORKFLOW_TASK_ACTION_STEP_KEYS.find((key) => availability[key]) || 'context'
  )
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
