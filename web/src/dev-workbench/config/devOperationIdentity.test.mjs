import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevOperationUUID } from './devOperationIdentity.mjs'

test('operation identifiers use native secure UUIDs when available', () => {
  const uuid = '9c0d97a2-5864-438a-90fe-d1e6e8f45a57'
  assert.equal(
    createDevOperationUUID({
      randomUUID: () => uuid,
      getRandomValues: () => assert.fail('native UUID generation is available'),
    }),
    uuid
  )
})

test('HTTP LAN operation identifiers retain UUID version and uniqueness from Web Crypto', () => {
  let sequence = 0
  const provider = {
    getRandomValues(bytes) {
      bytes.fill(sequence++)
      return bytes
    },
  }
  const first = createDevOperationUUID(provider)
  const second = createDevOperationUUID(provider)
  const version4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
  assert.match(first, version4)
  assert.match(second, version4)
  assert.notEqual(first, second)
})

test('operation identifiers fail closed without secure browser randomness', () => {
  for (const provider of [null, {}, { randomUUID: undefined }]) {
    assert.throws(
      () => createDevOperationUUID(provider),
      /不能生成安全的操作标识/u
    )
  }
})
