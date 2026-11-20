import {
  getActionErrorMessage,
  getUserFacingErrorMessage,
} from '../../common/utils/errorMessage.js'
import {
  normalizeWorkflowActionExplainData,
  normalizeWorkflowActionMode,
  normalizeWorkflowTaskSourceAccess,
} from './workflowTaskActionAccess.mjs'
import { workflowTaskActionInput } from './workflowTaskActionContract.mjs'

const DEFAULT_DENIED_FALLBACK = '当前账号不能提交这项操作'
const DEFAULT_ERROR_FALLBACK = '暂时无法确认这项操作是否可用，请稍后重试'
function getPositiveTaskID(task) {
  const taskID = Number(task?.id ?? 0)
  return Number.isFinite(taskID) && taskID > 0 ? taskID : 0
}

export function bindWorkflowActionSubmitGuard({ explain } = {}) {
  if (typeof explain !== 'function') {
    throw new TypeError('workflow action explain dependency is required')
  }
  return async function verifyWorkflowTaskActionAccessBeforeSubmit({
    task,
    actionKey,
    reason = '',
    onWarning,
    onError,
    deniedFallback = DEFAULT_DENIED_FALLBACK,
    errorFallback = DEFAULT_ERROR_FALLBACK,
  } = {}) {
    const taskID = getPositiveTaskID(task)
    const normalizedActionKey = normalizeWorkflowActionMode(actionKey)
    if (!taskID || !normalizedActionKey) {
      onWarning?.('当前操作暂时无法提交，请刷新后重试')
      return false
    }
    const input = workflowTaskActionInput(task, normalizedActionKey)
    // Completion feedback belongs to its form and domain command.
    if (
      normalizedActionKey !== 'complete' && input.required &&
      !String(reason || '').trim()
    ) {
      onWarning?.(`请先填写${input.label}`)
      return false
    }

    try {
      const data = await explain({
        task_id: taskID,
        action_key: normalizedActionKey,
      })
      const byAction = normalizeWorkflowActionExplainData(data)
      const action = byAction[normalizedActionKey]
      const sourceAccess = normalizeWorkflowTaskSourceAccess(data)
      const sourceAccessDenied =
        normalizedActionKey !== 'urge' && sourceAccess.allowed !== true
      if (action?.allowed !== true) {
        onWarning?.(
          getUserFacingErrorMessage(action?.reason || '', deniedFallback)
        )
        return false
      }
      if (sourceAccessDenied) {
        onWarning?.(
          getUserFacingErrorMessage(sourceAccess.reason, deniedFallback)
        )
        return false
      }
      return true
    } catch (error) {
      onError?.(getActionErrorMessage(error, errorFallback))
      return false
    }
  }
}
