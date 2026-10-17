import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getActionErrorMessage } from '../../common/utils/errorMessage'
import { isRpcAbortError } from '../../common/utils/jsonRpc'
import {
  getWorkflowTaskBoard,
  getWorkflowWorkbench,
} from '../api/workflowApi.mjs'
import {
  getWorkflowTaskBoardRequestKey,
  getWorkflowTaskBoardSummaryRequestKey,
} from '../utils/workflowTaskBoard.mjs'
import useLatestRequestCoordinator from './useLatestRequestCoordinator.js'

export default function useWorkflowDashboardData({
  scopeKey,
  taskBoardRequest,
  workbenchRequest,
  isTaskBoardView,
  productCorePreview = false,
  suspended = false,
  onBeforeTaskBoardLoad,
}) {
  const [loading, setLoading] = useState(false)
  const [workbenchResponseState, setWorkbenchResponseState] = useState(null)
  const [workbenchCountsState, setWorkbenchCountsState] = useState(null)
  const [taskBoardResponseState, setTaskBoardResponseState] = useState(null)
  const [taskBoardSummaryState, setTaskBoardSummaryState] = useState(null)
  const mountedRef = useRef(false)
  const scopeKeyRef = useRef(scopeKey)
  const beginLatestRequest = useLatestRequestCoordinator()
  useLayoutEffect(() => {
    scopeKeyRef.current = scopeKey
  }, [scopeKey])
  const taskBoardRequestKey = useMemo(
    () => getWorkflowTaskBoardRequestKey(taskBoardRequest),
    [taskBoardRequest]
  )
  const taskBoardSummaryRequestKey = useMemo(
    () => getWorkflowTaskBoardSummaryRequestKey(taskBoardRequest),
    [taskBoardRequest]
  )
  const workbenchRequestKey = useMemo(
    () => JSON.stringify([scopeKey, workbenchRequest]),
    [scopeKey, workbenchRequest]
  )

  const reloadTaskData = useCallback(async () => {
    const request = beginLatestRequest('dashboard-load')
    const requestWorkbenchScopeKey = scopeKey
    if (productCorePreview) {
      setWorkbenchResponseState(null)
      setWorkbenchCountsState(null)
      setLoading(false)
      request.finish()
      return true
    }
    if (suspended) {
      setLoading(false)
      request.finish()
      return true
    }
    if (isTaskBoardView && mountedRef.current) {
      onBeforeTaskBoardLoad?.(taskBoardRequest)
    }
    setLoading(true)
    if (isTaskBoardView && mountedRef.current) {
      setTaskBoardResponseState({
        scopeKey: requestWorkbenchScopeKey,
        requestKey: taskBoardRequestKey,
        response: null,
        error: '',
      })
    } else if (mountedRef.current) {
      setWorkbenchResponseState((current) => ({
        scopeKey: requestWorkbenchScopeKey,
        requestKey: workbenchRequestKey,
        response:
          current?.scopeKey === requestWorkbenchScopeKey &&
          current?.response?.queue_key === workbenchRequest.queue_key
            ? current.response
            : null,
        error: '',
      }))
    }
    try {
      if (isTaskBoardView) {
        const taskBoardResult = await getWorkflowTaskBoard(taskBoardRequest, {
          signal: request.signal,
        })
        if (
          mountedRef.current &&
          request.isCurrent() &&
          scopeKeyRef.current === requestWorkbenchScopeKey
        ) {
          setTaskBoardResponseState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: taskBoardRequestKey,
            response: taskBoardResult,
            error: '',
          })
          setTaskBoardSummaryState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: taskBoardSummaryRequestKey,
            response: taskBoardResult,
          })
        }
      } else {
        const workbenchResult = await getWorkflowWorkbench(workbenchRequest, {
          signal: request.signal,
        })
        if (
          mountedRef.current &&
          request.isCurrent() &&
          scopeKeyRef.current === requestWorkbenchScopeKey
        ) {
          setWorkbenchResponseState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: workbenchRequestKey,
            response: workbenchResult,
            error: '',
          })
          setWorkbenchCountsState({
            scopeKey: requestWorkbenchScopeKey,
            counts: workbenchResult.counts,
          })
        }
      }
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      if (
        mountedRef.current &&
        request.isCurrent() &&
        scopeKeyRef.current === requestWorkbenchScopeKey
      ) {
        const fallback = isTaskBoardView ? '加载任务管理失败' : '加载工作台失败'
        const errorMessage = getActionErrorMessage(error, fallback)
        if (isTaskBoardView) {
          setTaskBoardResponseState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: taskBoardRequestKey,
            response: null,
            error: errorMessage,
          })
        } else {
          setWorkbenchResponseState({
            scopeKey: requestWorkbenchScopeKey,
            requestKey: workbenchRequestKey,
            response: null,
            error: errorMessage,
          })
        }
      }
      return false
    } finally {
      if (
        mountedRef.current &&
        request.isCurrent() &&
        scopeKeyRef.current === requestWorkbenchScopeKey
      ) {
        setLoading(false)
      }
      request.finish()
    }
  }, [
    beginLatestRequest,
    isTaskBoardView,
    onBeforeTaskBoardLoad,
    productCorePreview,
    suspended,
    taskBoardRequest,
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    workbenchRequest,
    workbenchRequestKey,
    scopeKey,
  ])

  useEffect(() => {
    mountedRef.current = true
    reloadTaskData()
    return () => {
      mountedRef.current = false
    }
  }, [reloadTaskData])

  const currentScope = (state) => (state?.scopeKey === scopeKey ? state : null)
  return {
    loading,
    workbenchResponseState: currentScope(workbenchResponseState),
    workbenchCountsState: currentScope(workbenchCountsState),
    taskBoardResponseState: currentScope(taskBoardResponseState),
    taskBoardSummaryState: currentScope(taskBoardSummaryState),
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    workbenchRequestKey,
    reloadTaskData,
  }
}
