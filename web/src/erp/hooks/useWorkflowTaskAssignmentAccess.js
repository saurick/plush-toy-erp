import { useEffect, useMemo, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getWorkflowTaskAssignmentOptions } from '../api/workflowApi.mjs'
import {
  workflowTaskAdminAccessRequestIdentity,
  workflowTaskActionAccessRequestIdentity,
} from '../utils/workflowTaskActionAccess.mjs'

const EMPTY_ASSIGNMENT = Object.freeze({
  can_reassign: false,
  can_return_to_pool: false,
  candidates: Object.freeze([]),
  current_assignee: null,
  owner_role_key: '',
  owner_role_label: '',
  reason: '',
  reason_code: '',
})

export default function useWorkflowTaskAssignmentAccess({
  adminProfile = {},
  task = null,
  enabled = true,
} = {}) {
  const requestSeqRef = useRef(0)
  const { taskID, requestKey: taskRequestKey } =
    workflowTaskActionAccessRequestIdentity(task)
  const adminKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  const requestKey = taskRequestKey
    ? `${taskRequestKey}|${adminKey}|assignment`
    : ''
  const [remoteState, setRemoteState] = useState({
    requestKey: '',
    data: null,
    loading: false,
    failed: false,
    stale: false,
  })
  const [retryVersion, setRetryVersion] = useState(0)

  useEffect(() => {
    if (!enabled || !requestKey) {
      requestSeqRef.current += 1
      setRemoteState({
        requestKey: '',
        data: null,
        loading: false,
        failed: false,
        stale: false,
      })
      return undefined
    }
    const requestID = requestSeqRef.current + 1
    requestSeqRef.current = requestID
    const controller = new AbortController()
    setRemoteState({
      requestKey,
      data: null,
      loading: true,
      failed: false,
      stale: false,
    })
    getWorkflowTaskAssignmentOptions(
      { task_id: taskID },
      { signal: controller.signal }
    )
      .then((data) => {
        if (requestSeqRef.current !== requestID) return
        if (data.task_id !== taskID) {
          setRemoteState({
            requestKey,
            data: null,
            loading: false,
            failed: true,
            stale: false,
          })
          return
        }
        if (data.task_version !== Number(task?.version || 0)) {
          setRemoteState({
            requestKey,
            data: null,
            loading: false,
            failed: false,
            stale: true,
          })
          return
        }
        setRemoteState({
          requestKey,
          data,
          loading: false,
          failed: false,
          stale: false,
        })
      })
      .catch((error) => {
        if (
          requestSeqRef.current !== requestID ||
          isRpcAbortError(error) ||
          controller.signal.aborted
        ) {
          return
        }
        setRemoteState({
          requestKey,
          data: null,
          loading: false,
          failed: true,
          stale: false,
        })
      })
    return () => controller.abort()
  }, [enabled, requestKey, retryVersion, task?.version, taskID])

  return useMemo(() => {
    const current =
      remoteState.requestKey === requestKey && remoteState.data
        ? remoteState.data
        : EMPTY_ASSIGNMENT
    const loading = remoteState.requestKey === requestKey && remoteState.loading
    const failed = remoteState.requestKey === requestKey && remoteState.failed
    const stale = remoteState.requestKey === requestKey && remoteState.stale
    return {
      ...current,
      loading,
      failed,
      stale,
      reason: stale
        ? '任务信息已更新，请刷新任务列表后重新打开'
        : current.reason,
      retry() {
        if (enabled && requestKey) {
          setRetryVersion((value) => value + 1)
        }
      },
    }
  }, [enabled, remoteState, requestKey])
}
