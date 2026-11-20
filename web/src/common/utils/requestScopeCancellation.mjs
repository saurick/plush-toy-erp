export const RequestScopeOwner = Object.freeze({
  LATEST_REQUEST: 'latest-request',
  WORKFLOW_ACTION_ACCESS: 'workflow-action-access',
  OUTSOURCING_TASK_ITEMS: 'outsourcing-task-items',
})

export const RequestScopeCancellationCause = Object.freeze({
  SUPERSEDED: 'superseded',
  DISPOSED: 'disposed',
})

export function getRequestScopeCancellation(reason) {
  if (reason?.name !== 'AbortError') return null
  const value = reason.requestScopeCancellation
  if (!value || typeof value !== 'object') return null
  const keys = ['owner', 'cause', 'generation', 'nextGeneration']
  if (Object.keys(value).some((key) => !keys.includes(key))) return null
  if (!Object.values(RequestScopeOwner).includes(value.owner)) return null
  if (!Object.values(RequestScopeCancellationCause).includes(value.cause)) return null
  if (!Number.isSafeInteger(value.generation) || value.generation < 1) return null
  if (value.cause === RequestScopeCancellationCause.SUPERSEDED) {
    if (!Number.isSafeInteger(value.nextGeneration) || value.nextGeneration !== value.generation + 1) return null
  } else if (value.nextGeneration !== undefined) return null
  return {
    owner: value.owner,
    cause: value.cause,
    generation: value.generation,
    ...(value.nextGeneration === undefined ? {} : { nextGeneration: value.nextGeneration }),
  }
}

export function createRequestScopeAbortReason(metadata) {
  const reason = new DOMException('Request scope released', 'AbortError')
  const value = getRequestScopeCancellation({ name: reason.name, requestScopeCancellation: metadata })
  if (!value) throw new TypeError('Invalid request scope cancellation metadata')
  Object.defineProperty(reason, 'requestScopeCancellation', { value: Object.freeze(value) })
  return reason
}
