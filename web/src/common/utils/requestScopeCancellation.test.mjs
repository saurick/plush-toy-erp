import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequestScopeAbortReason, getRequestScopeCancellation, RequestScopeOwner, RequestScopeCancellationCause } from './requestScopeCancellation.mjs'

test('scope cancellation keeps the native AbortError contract and contains only lifecycle identity', async () => {
  const metadata = { owner: RequestScopeOwner.LATEST_REQUEST, cause: RequestScopeCancellationCause.SUPERSEDED, generation: 7, nextGeneration: 8 }
  const controller = new AbortController()
  const reason = createRequestScopeAbortReason(metadata)
  controller.abort(reason)
  assert.equal(controller.signal.reason, reason)
  assert.equal(controller.signal.reason.name, 'AbortError')
  assert.deepEqual(getRequestScopeCancellation(controller.signal.reason), metadata)
  assert.equal(Object.isFrozen(reason.requestScopeCancellation), true)
  assert.throws(() => { reason.requestScopeCancellation.owner = 'changed' }, TypeError)
  await assert.rejects(fetch('data:text/plain,unused', { signal: controller.signal }), (error) => error === reason)
})

test('disposed scopes, ordinary user aborts and timeouts remain distinct', () => {
  const metadata = { owner: RequestScopeOwner.WORKFLOW_ACTION_ACCESS, cause: RequestScopeCancellationCause.DISPOSED, generation: 2 }
  assert.deepEqual(getRequestScopeCancellation(createRequestScopeAbortReason(metadata)), metadata)
  assert.equal(getRequestScopeCancellation(new DOMException('User stopped', 'AbortError')), null)
  assert.equal(getRequestScopeCancellation({ name: 'TimeoutError', requestScopeCancellation: metadata }), null)
  assert.equal(getRequestScopeCancellation({ name: 'Error', requestScopeCancellation: metadata }), null)
})

test('invalid owners, generations and extra payload cannot authorize a scope cancellation', () => {
  const base = { owner: RequestScopeOwner.LATEST_REQUEST, cause: RequestScopeCancellationCause.SUPERSEDED, generation: 1, nextGeneration: 2 }
  for (const change of [{ owner: 'arbitrary' }, { cause: 'timeout' }, { generation: 0 }, { nextGeneration: 9 }, { token: 'private-data' }, { cause: RequestScopeCancellationCause.DISPOSED }]) {
    const metadata = { ...base, ...change }
    assert.equal(getRequestScopeCancellation({ name: 'AbortError', requestScopeCancellation: metadata }), null)
    assert.throws(() => createRequestScopeAbortReason(metadata), /Invalid request scope cancellation metadata/u)
  }
})
