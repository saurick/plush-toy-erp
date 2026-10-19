import { useCallback, useEffect, useRef } from 'react'
import { createRequestScopeAbortReason, RequestScopeOwner, RequestScopeCancellationCause } from '../../common/utils/requestScopeCancellation.mjs'

export function createLatestRequestCoordinator() {
  const requestControllers = {}
  const requestSequences = {}

  return {
    begin(key) {
      const previousSequence = Number(requestSequences[key] || 0)
      requestControllers[key]?.abort(createRequestScopeAbortReason({
        owner: RequestScopeOwner.LATEST_REQUEST,
        cause: RequestScopeCancellationCause.SUPERSEDED,
        generation: previousSequence,
        nextGeneration: previousSequence + 1,
      }))
      const controller = new AbortController()
      const nextSequence = Number(requestSequences[key] || 0) + 1
      requestControllers[key] = controller
      requestSequences[key] = nextSequence

      return {
        signal: controller.signal,
        isCurrent: () =>
          requestControllers[key] === controller &&
          requestSequences[key] === nextSequence &&
          !controller.signal.aborted,
        finish: () => {
          if (requestControllers[key] === controller) {
            delete requestControllers[key]
          }
        },
      }
    },
    abortAll() {
      Object.entries(requestControllers).forEach(([key, controller]) => {
        controller?.abort(createRequestScopeAbortReason({
          owner: RequestScopeOwner.LATEST_REQUEST,
          cause: RequestScopeCancellationCause.DISPOSED,
          generation: requestSequences[key],
        }))
      })
      Object.keys(requestControllers).forEach((key) => {
        delete requestControllers[key]
      })
    },
  }
}

export default function useLatestRequestCoordinator() {
  const coordinatorRef = useRef(null)
  if (!coordinatorRef.current) {
    coordinatorRef.current = createLatestRequestCoordinator()
  }

  const beginLatestRequest = useCallback(
    (key) => coordinatorRef.current.begin(key),
    []
  )

  useEffect(() => () => coordinatorRef.current.abortAll(), [])

  return beginLatestRequest
}
