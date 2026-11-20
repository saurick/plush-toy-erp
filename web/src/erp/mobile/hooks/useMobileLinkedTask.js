import { useCallback, useEffect, useState } from 'react'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTask } from '../../api/workflowApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import { consumeWorkflowTaskReturn } from '../../utils/workflowTaskNavigation.mjs'

export default function useMobileLinkedTask({
  accessScopeKey,
  adminID,
  enabled,
  taskID,
}) {
  const beginRequest = useLatestRequestCoordinator()
  const [state, setState] = useState(null)
  const linkedTask =
    state?.scope === accessScopeKey && state?.id === taskID ? state : null

  const loadLinkedTask = useCallback(
    async (id) => {
      if (!enabled || !id) return false
      const request = beginRequest('linked-task')
      setState({ scope: accessScopeKey, id, loading: true })
      try {
        const task = await getWorkflowTask(id, { signal: request.signal })
        if (!request.isCurrent()) return false
        consumeWorkflowTaskReturn(id, adminID)
        setState({ scope: accessScopeKey, id, task })
        return true
      } catch (error) {
        if (request.isCurrent()) {
          setState({
            scope: accessScopeKey,
            id,
            error: getActionErrorMessage(error, '查看关联任务失败，请重试'),
          })
        }
        return false
      } finally {
        if (request.isCurrent()) request.finish()
      }
    },
    [accessScopeKey, adminID, beginRequest, enabled]
  )

  const retainLinkedTask = useCallback(
    (task) => setState({ scope: accessScopeKey, id: task.id, task }),
    [accessScopeKey]
  )

  useEffect(() => {
    if (!enabled || !taskID) setState(null)
  }, [enabled, taskID])

  useEffect(() => {
    if (enabled && taskID && !linkedTask) loadLinkedTask(taskID)
  }, [enabled, linkedTask, loadLinkedTask, taskID])

  useEffect(
    () => () => {
      const request = beginRequest('linked-task')
      request.finish()
    },
    [accessScopeKey, beginRequest, enabled, taskID]
  )

  return { linkedTask, loadLinkedTask, retainLinkedTask }
}
