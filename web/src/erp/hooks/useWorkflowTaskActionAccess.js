import { useEffect, useMemo, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { explainWorkflowActionAccess } from '../api/workflowApi.mjs'
import {
  DEFAULT_WORKFLOW_ACTION_MODES,
  buildWorkflowActionAccessState,
  resolveWorkflowActionAccessRequestOutcome,
} from '../utils/workflowTaskActionAccess.mjs'

function taskAccessRequestKey(task) {
  const taskID = Number(task?.id || 0)
  return Number.isFinite(taskID) && taskID > 0 ? String(taskID) : ''
}

function adminAccessRequestKey(adminProfile = {}) {
  return [
    adminProfile?.id || '',
    adminProfile?.is_super_admin === true ? 'super' : 'normal',
    Array.isArray(adminProfile?.roles)
      ? adminProfile.roles
          .map((role) => role?.role_key || role?.key || '')
          .filter(Boolean)
          .sort()
          .join(',')
      : '',
    Array.isArray(adminProfile?.permissions)
      ? adminProfile.permissions.filter(Boolean).sort().join(',')
      : '',
  ].join('|')
}

export default function useWorkflowTaskActionAccess({
  adminProfile = {},
  task = null,
  enabled = true,
  actionModes = DEFAULT_WORKFLOW_ACTION_MODES,
} = {}) {
  const requestSeqRef = useRef(0)
  const taskKey = taskAccessRequestKey(task)
  const adminKey = adminAccessRequestKey(adminProfile)
  const actionModeKey = actionModes.join('|')
  const [remoteState, setRemoteState] = useState({
    taskKey: '',
    data: null,
    loading: false,
    failed: false,
  })

  useEffect(() => {
    if (!enabled || !taskKey) {
      requestSeqRef.current += 1
      setRemoteState({ taskKey: '', data: null, loading: false, failed: false })
      return undefined
    }

    const requestID = requestSeqRef.current + 1
    requestSeqRef.current = requestID
    const controller = new AbortController()
    setRemoteState({
      taskKey,
      data: null,
      loading: true,
      failed: false,
    })

    explainWorkflowActionAccess(
      { task_id: Number(taskKey) },
      { signal: controller.signal }
    )
      .then((data) => {
        const nextState = resolveWorkflowActionAccessRequestOutcome({
          currentRequestID: requestSeqRef.current,
          requestID,
          taskKey,
          data,
        })
        if (nextState) setRemoteState(nextState)
      })
      .catch((error) => {
        const nextState = resolveWorkflowActionAccessRequestOutcome({
          currentRequestID: requestSeqRef.current,
          requestID,
          taskKey,
          error,
          isAbortError: isRpcAbortError,
        })
        if (nextState) setRemoteState(nextState)
      })

    return () => {
      controller.abort()
    }
  }, [actionModeKey, adminKey, enabled, taskKey])

  return useMemo(
    () =>
      buildWorkflowActionAccessState({
        adminProfile,
        task,
        explainData: remoteState.taskKey === taskKey ? remoteState.data : null,
        loading: remoteState.taskKey === taskKey && remoteState.loading,
        failed: remoteState.taskKey === taskKey && remoteState.failed,
        actionModes,
      }),
    [actionModes, adminProfile, remoteState, task, taskKey]
  )
}
