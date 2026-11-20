import assert from 'node:assert/strict'
import test from 'node:test'
import { createPaymentMethodReadLoader } from './paymentMethodReads.mjs'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('concurrent payment reads share one request while each caller can cancel independently', async () => {
  const load = createPaymentMethodReadLoader()
  const response = deferred()
  let reads = 0
  let transportSignal
  const read = (signal) => {
    reads++
    transportSignal = signal
    return response.promise
  }
  const first = new AbortController()
  const second = new AbortController()
  const a = load('same-account/same-profile/retry-0', read, first.signal)
  const b = load('same-account/same-profile/retry-0', read, second.signal)
  await Promise.resolve()
  first.abort()
  await assert.rejects(a, { name: 'AbortError' })
  assert.equal(reads, 1)
  assert.equal(transportSignal.aborted, false)
  response.resolve({ methods: ['银行转账'] })
  assert.deepEqual(await b, { methods: ['银行转账'] })
  await load('same-account/same-profile/retry-0', read)
  assert.equal(reads, 2, 'settled data must not become a permission or catalogue cache')
})

test('all callers leaving aborts transport and a replacement request survives old cleanup', async () => {
  const load = createPaymentMethodReadLoader()
  const old = deferred()
  const fresh = deferred()
  const controller = new AbortController()
  let oldSignal
  const previous = load('scope', (signal) => {
    oldSignal = signal
    return old.promise
  }, controller.signal)
  await Promise.resolve()
  controller.abort()
  await assert.rejects(previous, { name: 'AbortError' })
  assert.equal(oldSignal.aborted, true)
  let reads = 0
  const nextRead = () => {
    reads++
    return fresh.promise
  }
  const next = load('scope', nextRead)
  old.resolve('stale')
  await new Promise((resolve) => setTimeout(resolve, 0))
  const follower = load('scope', nextRead)
  fresh.resolve('current')
  assert.equal(await next, 'current')
  assert.equal(await follower, 'current')
  assert.equal(reads, 1)
})

test('different accounts, permission snapshots, queries and maintenance refreshes do not share reads', async () => {
  const load = createPaymentMethodReadLoader()
  const response = deferred()
  let reads = 0
  const work = [
    'account-a/profile-1/query-a/retry-0',
    'account-b/profile-1/query-a/retry-0',
    'account-a/profile-2/query-a/retry-0',
    'account-a/profile-1/query-b/retry-0',
    'account-a/profile-1/query-a/retry-1',
  ].map((key) => load(key, () => {
    reads++
    return response.promise
  }))
  await Promise.resolve()
  assert.equal(reads, 5)
  response.resolve('ok')
  await Promise.all(work)
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(load('other', () => { reads++ }, aborted.signal), { name: 'AbortError' })
  assert.equal(reads, 5)
})

test('a failed shared read is released so retry uses a fresh request', async () => {
  const load = createPaymentMethodReadLoader()
  const response = deferred()
  const a = load('scope', () => response.promise)
  const b = load('scope', () => response.promise)
  response.reject(new Error('read failed'))
  await Promise.all([assert.rejects(a, /read failed/u), assert.rejects(b, /read failed/u)])
  assert.equal(await load('scope', async () => 'recovered'), 'recovered')
})
