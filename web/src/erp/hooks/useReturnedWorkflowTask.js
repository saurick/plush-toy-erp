import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTask } from '../api/workflowApi.mjs'
import { consumeWorkflowTaskReturn, readWorkflowTaskReturn } from '../utils/workflowTaskNavigation.mjs'

export default function useReturnedWorkflowTask(adminID, onTask, source = null, enabled = true) {
  const location = useLocation()
  const callback = useRef(onTask)
  const returnContext = useRef(null)
  const consumed = useRef('')
  callback.current = onTask
  // Raw history receives the marker before leaving. Only a router arrival can
  // restore it; live history also prevents remounted rows from consuming it twice.
  const value = readWorkflowTaskReturn(location.state, adminID, source)
  const pending = readWorkflowTaskReturn(window.history.state?.usr, adminID, source)
  returnContext.current = pending
  const taskID = enabled && value && value.taskID === pending?.taskID ? value.taskID : null
  useEffect(() => {
    const key = `${location.key}:${adminID}:${taskID}`
    if (!taskID || consumed.current === key) return undefined
    const controller = new AbortController()
    getWorkflowTask(taskID, { signal: controller.signal }).then((task) => {
      if (!controller.signal.aborted) {
        consumed.current = key
        consumeWorkflowTaskReturn(taskID, adminID)
        callback.current(task, returnContext.current)
      }
    }).catch((error) => {
      if (!controller.signal.aborted) message.error(getActionErrorMessage(error, '任务已更新，请重新读取任务'))
    })
    return () => controller.abort()
  }, [taskID, adminID, location.key])
}
