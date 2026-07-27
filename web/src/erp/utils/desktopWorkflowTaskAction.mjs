import { isWorkflowProcessDecisionTask } from './workflowTaskActionContract.mjs'
import { requireWorkflowTaskMutationParams } from './workflowTaskMutation.mjs'
import { requireWorkflowProcessDecisionSubmission } from './workflowProcessDecision.mjs'

const DESKTOP_TASK_ACTION_MODES = new Set([
  'complete',
  'block',
  'reject',
  'resume',
  'urge',
  'assign',
])

function invalidDesktopTaskAction() {
  throw new Error('当前任务操作参数已失效，请刷新后重试')
}

export function buildDesktopWorkflowTaskActionParams({
  task,
  actionMode,
  reason = '',
  assignmentTarget,
  processDecision = null,
} = {}) {
  if (
    !task ||
    !Number.isSafeInteger(task.id) ||
    task.id <= 0 ||
    !Number.isSafeInteger(task.version) ||
    task.version <= 0 ||
    !DESKTOP_TASK_ACTION_MODES.has(actionMode) ||
    typeof reason !== 'string'
  ) {
    invalidDesktopTaskAction()
  }

  const normalizedReason = reason.trim()
  const decisionRequired =
    actionMode === 'complete' && isWorkflowProcessDecisionTask(task)
  let canonicalProcessDecision = null
  if (decisionRequired) {
    canonicalProcessDecision = requireWorkflowProcessDecisionSubmission(
      task,
      processDecision,
      { reason: normalizedReason }
    )
  } else if (processDecision != null) {
    invalidDesktopTaskAction()
  }

  if (actionMode === 'assign') {
    const assigneeID = assignmentTarget === 'pool' ? null : assignmentTarget
    return requireWorkflowTaskMutationParams('assign', {
      task_id: task.id,
      expected_version: task.version,
      assignee_id: assigneeID,
      reason: normalizedReason,
    })
  }

  if (actionMode === 'urge') {
    return requireWorkflowTaskMutationParams('urge', {
      task_id: task.id,
      expected_version: task.version,
      action: 'urge_task',
      reason: normalizedReason,
      payload: {
        surface_key: 'desktop_task_board',
      },
    })
  }

  return requireWorkflowTaskMutationParams(actionMode, {
    task_id: task.id,
    expected_version: task.version,
    action_key: actionMode,
    reason: normalizedReason,
    payload: {
      surface_key: 'desktop_task_board',
      ...(canonicalProcessDecision
        ? { process_decision: canonicalProcessDecision }
        : {}),
    },
  })
}
