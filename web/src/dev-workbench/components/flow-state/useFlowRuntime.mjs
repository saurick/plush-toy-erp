import { useEffect, useState } from 'react'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getWorkflowTaskProcessContext } from '@/erp/api/workflowApi.mjs'
import {
  DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION,
  isDevFlowStateTaskUnlinkedRuntimeError,
} from '../../pages/devFlowStateTaskLookup.mjs'

function useRuntimeContext(taskId, association) {
  const [state, setState] = useState({
    status: 'idle',
    context: null,
    error: '',
    queriedAt: '',
  })
  useEffect(() => {
    if (!taskId) {
      setState({ status: 'idle', context: null, error: '', queriedAt: '' })
      return undefined
    }
    if (association === DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.UNLINKED) {
      setState({
        status: 'unlinked',
        context: null,
        error: '',
        queriedAt: new Date().toISOString(),
      })
      return undefined
    }
    if (association === DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.INVALID) {
      setState({
        status: 'error',
        context: null,
        error: '任务的 ProcessRuntime 锚点不完整，已拒绝猜测。',
        queriedAt: new Date().toISOString(),
      })
      return undefined
    }
    const controller = new AbortController()
    setState({ status: 'loading', context: null, error: '', queriedAt: '' })
    getWorkflowTaskProcessContext(Number(taskId), { signal: controller.signal })
      .then((context) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            context,
            error: '',
            queriedAt: new Date().toISOString(),
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        if (isDevFlowStateTaskUnlinkedRuntimeError(error)) {
          setState({
            status: 'unlinked',
            context: null,
            error: '',
            queriedAt: new Date().toISOString(),
          })
          return
        }
        setState({
          status: 'error',
          context: null,
          queriedAt: new Date().toISOString(),
          error: getActionErrorMessage(error, '读取任务流程位置', {
            fallback: '读取任务流程位置失败，请确认已登录且具备任务查看权限',
          }),
        })
      })
    return () => controller.abort()
  }, [association, taskId])
  return state
}

export { useRuntimeContext }
