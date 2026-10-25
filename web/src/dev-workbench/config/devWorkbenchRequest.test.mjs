import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevDeliveryClient } from './devDelivery.mjs'
import { requestWorkbenchJson } from './devWorkbenchRequest.mjs'
import {
  clearDevSummarySnapshot,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
} from './devSummarySnapshot.mjs'

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason)
    else
      { signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }) }
  })
}

test('summary and session requests have deadlines; a timed-out session never sends a write', async () => {
  const requests = []
  const client = createDevDeliveryClient({
    readTimeoutMs: 5,
    summaryTimeoutMs: 5,
    fetchImpl: async (url, options) => {
      requests.push([url, options.method])
      return waitForAbort(options.signal)
    },
  })
  await assert.rejects(client.summary(), { name: 'TimeoutError' })
  await assert.rejects(client.action('dispatch-release', {}), {
    name: 'TimeoutError',
  })
  assert.equal(requests.length, 2)
  assert(requests.every(([, method]) => method === 'GET'))
})

test('a write response timeout is uncertain and never retries the POST', async () => {
  let writes = 0
  const client = createDevDeliveryClient({
    actionTimeoutMs: 5,
    fetchImpl: async (url, { signal, method }) => {
      if (method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            kind: 'plush.dev-delivery-session',
            csrfToken: 'a'.repeat(32),
            target: 'demo-133',
            targets: ['demo-133', 'customer-test-133', 'production-133'],
          }),
        }
      }
      writes += 1
      return waitForAbort(signal)
    },
  })
  await assert.rejects(
    client.action('dispatch-release', {}),
    /请先刷新操作记录核对结果/u
  )
  assert.equal(writes, 1)
})

test('transient record reads may retry but writes remain single-attempt even when attempts are requested', async () => {
  let reads = 0
  const response = await requestWorkbenchJson(
    async () => {
      reads += 1
      return {
        ok: reads > 1,
        status: reads > 1 ? 200 : 503,
        json: async () => ({ value: 'record' }),
      }
    },
    '/records',
    { method: 'GET', timeoutMs: 1000, attempts: 2 }
  )
  assert.equal(reads, 2)
  assert.equal(response.value, 'record')

  let writes = 0
  await assert.rejects(
    requestWorkbenchJson(
      async () => {
        writes += 1
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: 'result unknown' }),
        }
      },
      '/action',
      { method: 'POST', timeoutMs: 1000, attempts: 2 }
    ),
    { status: 503 }
  )
  assert.equal(writes, 1)
})

test('the deadline also covers response bodies and caller cancellation does not retry', async () => {
  await assert.rejects(
    requestWorkbenchJson(
      async (url, { signal }) => ({
        ok: true,
        json: () => waitForAbort(signal),
      }),
      '/summary',
      { method: 'GET', timeoutMs: 5 }
    ),
    { name: 'TimeoutError' }
  )
  const controller = new AbortController()
  let reads = 0
  const pending = requestWorkbenchJson(
    async (url, { signal }) => {
      reads += 1
      return waitForAbort(signal)
    },
    '/records',
    { method: 'GET', timeoutMs: 500, attempts: 2, signal: controller.signal }
  )
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(reads, 1)
})

test('shared summary reads cancel only when the last subscriber leaves and reject stale cache writes', async () => {
  const key = 'shared-cancellation'
  clearDevSummarySnapshot(key)
  const a = new AbortController()
  const b = new AbortController()
  let signal
  let complete
  let reads = 0
  const load = (options) => {
    reads += 1
    signal = options.signal
    return new Promise((resolve) => {
      complete = resolve
    })
  }
  const first = loadDevSummarySnapshot(key, load, { signal: a.signal })
  const second = loadDevSummarySnapshot(key, load, { signal: b.signal })
  await Promise.resolve()
  a.abort()
  await assert.rejects(first, { name: 'AbortError' })
  assert.equal(signal.aborted, false)
  complete({ revision: 1 })
  assert.equal((await second).summary.revision, 1)
  assert.equal(reads, 1)

  const c = new AbortController()
  const stale = loadDevSummarySnapshot(key, load, { signal: c.signal })
  await Promise.resolve()
  c.abort()
  await assert.rejects(stale, { name: 'AbortError' })
  assert.equal(signal.aborted, true)
  complete({ revision: 2 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(readDevSummarySnapshot(key).summary.revision, 1)
  const replacement = await loadDevSummarySnapshot(key, async () => ({
    revision: 3,
  }))
  assert.equal(replacement.summary.revision, 3)
  clearDevSummarySnapshot(key)
})

test('deadline settles even a transport or body that ignores abort, without exposing late data', async () => {
  for (const fetchImpl of [
    () => new Promise(() => {}),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
  ]) {
    await assert.rejects(
      requestWorkbenchJson(fetchImpl, '/read', { method: 'GET', timeoutMs: 5 }),
      { name: 'TimeoutError' }
    )
  }
})
