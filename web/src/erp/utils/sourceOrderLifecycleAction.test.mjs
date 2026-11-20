import assert from 'node:assert/strict'
import test from 'node:test'

import { createSourceBusinessActionAttemptStore } from './sourceBusinessAction.mjs'
import {
  normalizeSourceOrderLifecycleReason,
  prepareSourceOrderLifecycleAttempt,
} from './sourceOrderLifecycleAction.mjs'

function attemptStore() {
  let index = 0
  return createSourceBusinessActionAttemptStore({
    cryptoProvider: { randomUUID: () => `order-action-${++index}` },
  })
}

test('source order lifecycle action builds a versioned normal-close request', () => {
  const store = attemptStore()
  const prepared = prepareSourceOrderLifecycleAttempt({
    action: {
      sourceLifecycle: true,
      sourceType: 'sales_order',
      commandKey: 'close',
      closeMode: 'normal',
    },
    attemptStore: store,
    customerKey: 'demo',
    record: { id: 7, version: 3 },
  })

  assert.equal(
    prepared.scope,
    'source-order-lifecycle:sales_order:7:close:normal'
  )
  assert.deepEqual(prepared.attempt.params, {
    close_mode: 'normal',
    customer_key: 'demo',
    expected_version: 3,
    id: 7,
    idempotency_key: 'order-action-1',
  })
})

test('source order lifecycle action retains one key for the same uncertain intent', () => {
  const store = attemptStore()
  const action = {
    sourceLifecycle: true,
    sourceType: 'purchase_order',
    commandKey: 'close',
    closeMode: 'short',
    requiresReason: true,
  }
  const input = {
    action,
    attemptStore: store,
    record: { id: 9, version: 4 },
    reason: '供应商无法继续供货',
  }
  const first = prepareSourceOrderLifecycleAttempt(input)
  store.settle(first.scope, first.attempt, { isNetworkError: true })
  const retry = prepareSourceOrderLifecycleAttempt(input)
  assert.equal(retry.attempt, first.attempt)

  const changed = prepareSourceOrderLifecycleAttempt({
    ...input,
    reason: '双方协商终止剩余数量',
  })
  assert.notEqual(
    changed.attempt.params.idempotency_key,
    first.attempt.params.idempotency_key
  )
})

test('source order lifecycle action requires readable reasons and fresh versions', () => {
  const cancel = { requiresReason: true }
  assert.equal(
    normalizeSourceOrderLifecycleReason(cancel, '  客户撤单  '),
    '客户撤单'
  )
  assert.throws(
    () => normalizeSourceOrderLifecycleReason(cancel, ''),
    /请填写业务原因/u
  )
  assert.throws(
    () => normalizeSourceOrderLifecycleReason(cancel, '原'.repeat(256)),
    /不能超过 255 个字/u
  )
  assert.throws(
    () =>
      prepareSourceOrderLifecycleAttempt({
        action: {
          sourceLifecycle: true,
          sourceType: 'outsourcing_order',
          commandKey: 'cancel',
          requiresReason: true,
        },
        attemptStore: attemptStore(),
        record: { id: 5, version: 0 },
        reason: '合同终止',
      }),
    /刷新列表/u
  )
})
