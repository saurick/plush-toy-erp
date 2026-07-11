import { useCallback, useEffect, useRef } from 'react'

export function createLatestRequestCoordinator() {
  const requestControllers = {}
  const requestSequences = {}

  return {
    begin(key) {
      requestControllers[key]?.abort()
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
      Object.values(requestControllers).forEach((controller) => {
        controller?.abort()
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
