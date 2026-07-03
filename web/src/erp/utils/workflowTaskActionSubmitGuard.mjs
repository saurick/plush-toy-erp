import {
  getActionErrorMessage,
  getUserFacingErrorMessage,
} from '@/common/utils/errorMessage'
import { explainWorkflowActionAccess } from '../api/workflowApi.mjs'
import {
  normalizeWorkflowActionExplainData,
  normalizeWorkflowActionMode,
} from './workflowTaskActionAccess.mjs'

const DEFAULT_DENIED_FALLBACK = '当前账号不能提交这个任务动作'
const DEFAULT_ERROR_FALLBACK = '核对任务动作权限失败'
const REASON_REQUIRED_ACTION_MODES = new Set(['block', 'reject', 'urge'])

const REASON_REQUIRED_MESSAGES = Object.freeze({
  block: '请先填写阻塞原因',
  reject: '请先填写退回原因',
  urge: '请先填写催办原因',
})

function getPositiveTaskID(task) {
  const taskID = Number(task?.id ?? 0)
  return Number.isFinite(taskID) && taskID > 0 ? taskID : 0
}

export async function verifyWorkflowTaskActionAccessBeforeSubmit({
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
    onWarning?.('当前任务动作缺少必要参数，请刷新后重试')
    return false
  }
  if (
    REASON_REQUIRED_ACTION_MODES.has(normalizedActionKey) &&
    !String(reason || '').trim()
  ) {
    onWarning?.(
      REASON_REQUIRED_MESSAGES[normalizedActionKey] || '请先填写处理原因'
    )
    return false
  }

  try {
    const data = await explainWorkflowActionAccess({
      task_id: taskID,
      action_key: normalizedActionKey,
    })
    const byAction = normalizeWorkflowActionExplainData(data)
    const action = byAction[normalizedActionKey]
    if (action?.allowed !== true) {
      onWarning?.(
        getUserFacingErrorMessage(action?.reason || '', deniedFallback)
      )
      return false
    }
    return true
  } catch (error) {
    onError?.(getActionErrorMessage(error, errorFallback))
    return false
  }
}
