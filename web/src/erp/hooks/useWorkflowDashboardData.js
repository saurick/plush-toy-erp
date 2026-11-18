import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getActionErrorMessage } from '../../common/utils/errorMessage'
import { isAuthFailureCode, isAdminSessionUnavailableCode, RpcErrorCode } from '../../common/consts/errorCodes'
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
  riskRequest = null,
  suspended = false,
  onBeforeTaskBoardLoad,
}) {
  const [loading, setLoading] = useState(false)
  const [riskResponseState, setRiskResponseState] = useState(null)
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
  // The server builds filter choices from the visible tasks before applying document and list filters.
  const taskBoardOptionsScope = JSON.stringify([
    taskBoardRequest.owner_role_key || '',
    Boolean(taskBoardRequest.approval_only),
    Boolean(taskBoardRequest.todo_only),
  ])
  const riskRequestKey = useMemo(
    () => JSON.stringify([scopeKey, riskRequest]),
    [scopeKey, riskRequest]
  )

  const reloadTaskData = useCallback(async () => {
    const request = beginLatestRequest('dashboard-load')
    const requestScopeKey = scopeKey
    if (suspended) {
      setLoading(false)
      request.finish()
      return true
    }
    if (!riskRequest && mountedRef.current) {
      onBeforeTaskBoardLoad?.(taskBoardRequest)
    }
    setLoading(true)
    if (!riskRequest && mountedRef.current) {
      setTaskBoardResponseState((current) => ({
        scopeKey: requestScopeKey,
        requestKey: taskBoardRequestKey,
        response:
          current?.scopeKey === requestScopeKey &&
          current?.requestKey === taskBoardRequestKey
            ? current.response
            : null,
        error: '',
      }))
    } else if (mountedRef.current) {
      setRiskResponseState((current) => ({
        scopeKey: requestScopeKey,
        requestKey: riskRequestKey,
        sort: current?.sort,
        response:
          current?.scopeKey === requestScopeKey
            ? current.response
            : null,
        error: '',
      }))
    }
    try {
      if (!riskRequest) {
        const taskBoardResult = await getWorkflowTaskBoard(taskBoardRequest, {
          signal: request.signal,
        })
        if (
          mountedRef.current &&
          request.isCurrent() &&
          scopeKeyRef.current === requestScopeKey
        ) {
          setTaskBoardResponseState({
            scopeKey: requestScopeKey,
            requestKey: taskBoardRequestKey,
            response: taskBoardResult,
            error: '',
          })
          setTaskBoardSummaryState({
            scopeKey: requestScopeKey,
            requestKey: taskBoardSummaryRequestKey,
            optionsScope: taskBoardOptionsScope,
            response: taskBoardResult,
          })
        }
      } else {
        const riskResult = await getWorkflowWorkbench(riskRequest, {
          signal: request.signal,
        })
        if (
          mountedRef.current &&
          request.isCurrent() &&
          scopeKeyRef.current === requestScopeKey
        ) {
          setRiskResponseState({
            scopeKey: requestScopeKey,
            requestKey: riskRequestKey,
            sort: riskRequest.sort,
            response: riskResult,
            error: '',
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
        scopeKeyRef.current === requestScopeKey
      ) {
        const fallback = riskRequest ? '加载风险任务失败' : '加载任务管理失败'
        const errorMessage = getActionErrorMessage(error, fallback)
        if (!riskRequest) {
          setTaskBoardResponseState({
            scopeKey: requestScopeKey,
            requestKey: taskBoardRequestKey,
            response: null,
            error: errorMessage,
          })
        } else {
          const accessLost = isAuthFailureCode(error?.code) || isAdminSessionUnavailableCode(error?.code) ||
            Number(error?.code) === RpcErrorCode.PERMISSION_DENIED
          setRiskResponseState((current) => ({
            scopeKey: requestScopeKey,
            requestKey: riskRequestKey,
            sort: current?.sort,
            response:
              !accessLost && current?.scopeKey === requestScopeKey
                ? current.response
                : null,
            error: errorMessage,
          }))
        }
      }
      return false
    } finally {
      if (
        mountedRef.current &&
        request.isCurrent() &&
        scopeKeyRef.current === requestScopeKey
      ) {
        setLoading(false)
      }
      request.finish()
    }
  }, [
    beginLatestRequest,
    onBeforeTaskBoardLoad,
    suspended,
    taskBoardRequest,
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    taskBoardOptionsScope,
    riskRequest,
    riskRequestKey,
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
  const summary = currentScope(taskBoardSummaryState)
  const options = summary?.optionsScope === taskBoardOptionsScope ? summary.response : null
  return {
    loading,
    riskResponseState: currentScope(riskResponseState),
    taskBoardResponseState: currentScope(taskBoardResponseState),
    taskBoardSummaryState: summary,
    taskBoardFilterOptions: options && {
      sourceTypes: options.source_types,
      ownerRoleKeys: options.owner_role_keys,
      assignees: options.assignees,
    },
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    riskRequestKey,
    reloadTaskData,
  }
}
