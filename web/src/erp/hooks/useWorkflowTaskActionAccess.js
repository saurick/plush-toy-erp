import { useEffect, useMemo, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { createRequestScopeAbortReason, RequestScopeOwner, RequestScopeCancellationCause } from '../../common/utils/requestScopeCancellation.mjs'
import { explainWorkflowActionAccess } from '../api/workflowApi.mjs'
import {
  DEFAULT_WORKFLOW_ACTION_MODES,
  buildWorkflowActionAccessState,
  resolveWorkflowActionAccessRequestOutcome,
  workflowTaskAdminAccessRequestIdentity,
  workflowTaskActionAccessRequestIdentity,
} from '../utils/workflowTaskActionAccess.mjs'

export default function useWorkflowTaskActionAccess({
  adminProfile = {},
  task = null,
  enabled = true,
  actionModes = DEFAULT_WORKFLOW_ACTION_MODES,
} = {}) {
  const requestSeqRef = useRef(0)
  const { taskID, requestKey: taskRequestKey } =
    workflowTaskActionAccessRequestIdentity(task)
  const adminKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  const actionModeKey = actionModes.join('|')
  const requestKey = taskRequestKey
    ? `${taskRequestKey}|${adminKey}|${actionModeKey}`
    : ''
  const [remoteState, setRemoteState] = useState({
    requestKey: '',
    data: null,
    loading: false,
    failed: false,
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
    })

    explainWorkflowActionAccess(
      { task_id: taskID },
      { signal: controller.signal }
    )
      .then((data) => {
        const nextState = resolveWorkflowActionAccessRequestOutcome({
          currentRequestID: requestSeqRef.current,
          requestID,
          requestKey,
          data,
        })
        if (nextState) setRemoteState(nextState)
      })
      .catch((error) => {
        const nextState = resolveWorkflowActionAccessRequestOutcome({
          currentRequestID: requestSeqRef.current,
          requestID,
          requestKey,
          error,
          isAbortError: isRpcAbortError,
        })
        if (nextState) setRemoteState(nextState)
      })

    return () => {
      controller.abort(createRequestScopeAbortReason({
        owner: RequestScopeOwner.WORKFLOW_ACTION_ACCESS,
        cause: RequestScopeCancellationCause.DISPOSED,
        generation: requestID,
      }))
    }
  }, [enabled, requestKey, retryVersion, taskID])

  return useMemo(() => {
    const requested = enabled && Boolean(requestKey)
    const current = requested && remoteState.requestKey === requestKey
    return {
      ...buildWorkflowActionAccessState({
        task,
        explainData: current ? remoteState.data : null,
        loading: requested && (!current || remoteState.loading),
        failed: current && remoteState.failed,
        actionModes,
      }),
      retry() {
        if (requested) setRetryVersion((version) => version + 1)
      },
    }
  }, [actionModes, enabled, remoteState, requestKey, task])
}
