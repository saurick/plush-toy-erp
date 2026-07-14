import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  requireSourceBusinessActionKey,
  sourceBusinessActionNo,
  sourceBusinessActionSignature,
  sourceBusinessActionUUID,
} from './sourceBusinessAction.mjs'

test('source business action keeps one key for the same uncertain intent', () => {
  let index = 0
  const store = createSourceBusinessActionAttemptStore({
    cryptoProvider: {
      randomUUID: () => `request-${++index}`,
    },
  })
  const payload = { quantity: '2', source_id: 7 }
  const first = store.prepare('completion:7', payload)
  assert.equal(first.params.idempotency_key, 'request-1')
  assert.equal(
    store.settle('completion:7', first, { isNetworkError: true }),
    true
  )
  assert.equal(
    store.prepare('completion:7', { source_id: 7, quantity: '2' }),
    first
  )

  assert.equal(store.settle('completion:7', first, null), false)
  assert.equal(
    store.prepare('completion:7', payload).params.idempotency_key,
    'request-2'
  )
})

test('source business action changes key when the business intent changes', () => {
  let index = 0
  const store = createSourceBusinessActionAttemptStore({
    cryptoProvider: { randomUUID: () => `request-${++index}` },
  })
  const first = store.prepare('reservation:3', { quantity: '1' })
  const second = store.prepare('reservation:3', { quantity: '2' })
  assert.notEqual(first.params.idempotency_key, second.params.idempotency_key)
  assert.equal(store.peek('reservation:3'), second)
  store.clear('reservation:3')
  assert.equal(store.peek('reservation:3'), null)
})

test('source business action canonicalizes payloads and hides a caller key', () => {
  assert.equal(
    sourceBusinessActionSignature({
      z: 1,
      nested: { b: 2, a: 1 },
      idempotency_key: 'caller-owned',
      ignored: undefined,
    }),
    JSON.stringify({ nested: { a: 1, b: 2 }, z: 1 })
  )
})

test('source business action builds a stable readable number without exposing the full key', () => {
  const number = sourceBusinessActionNo(
    'prod-fg',
    'MO 2026/0001',
    '12345678-abcd-4000-8000-1234567890ab'
  )
  assert.equal(number, 'PROD-FG-MO-2026-0001-34567890AB')
  assert.ok(number.length <= 64)
  assert.doesNotMatch(number, /ABCD-4000/u)
})

test('source business action validates secure keys and unknown results', () => {
  assert.equal(requireSourceBusinessActionKey(' key-1 '), 'key-1')
  assert.throws(() => requireSourceBusinessActionKey(''))
  assert.throws(() => sourceBusinessActionUUID({}))
  assert.equal(isSourceBusinessActionResultUnknown({ httpStatus: 408 }), true)
  assert.equal(isSourceBusinessActionResultUnknown({ code: 50001 }), true)
  assert.equal(isSourceBusinessActionResultUnknown({ code: 40001 }), false)
})
