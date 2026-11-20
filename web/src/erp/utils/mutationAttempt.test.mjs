import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deepFreezeMutationValue,
  isMutationResultUnknown,
  secureMutationUUID,
  stableMutationSignature,
} from './mutationAttempt.mjs'

test('mutation signature is stable for nested values and omitted fields', () => {
  assert.equal(
    stableMutationSignature({
      z: 1,
      nested: { b: 2, a: 1 },
      omitted: undefined,
    }),
    JSON.stringify({ nested: { a: 1, b: 2 }, z: 1 })
  )
})

test('mutation values are deeply frozen without replacing the original value', () => {
  const value = { items: [{ quantity: '2' }] }
  assert.equal(deepFreezeMutationValue(value), value)
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.items), true)
  assert.equal(Object.isFrozen(value.items[0]), true)
})

test('secure mutation UUID uses browser crypto and rejects unavailable providers', () => {
  assert.equal(
    secureMutationUUID({ randomUUID: () => 'secure-request-id' }),
    'secure-request-id'
  )
  assert.equal(
    secureMutationUUID({
      getRandomValues(bytes) {
        bytes.fill(1)
        return bytes
      },
    }),
    '01010101-0101-4101-8101-010101010101'
  )
  assert.throws(
    () => secureMutationUUID({}, '当前操作暂时无法提交'),
    /当前操作暂时无法提交/u
  )
})

test('mutation result is unknown only for transport and server-side uncertainty', () => {
  for (const error of [
    { isNetworkError: true },
    { isAbortError: true },
    { isInvalidResponse: true },
    { httpStatus: 408 },
    { httpStatus: 503 },
    { code: 50000 },
  ]) {
    assert.equal(isMutationResultUnknown(error), true)
  }
  assert.equal(isMutationResultUnknown({ httpStatus: 409, code: 40920 }), false)
})
