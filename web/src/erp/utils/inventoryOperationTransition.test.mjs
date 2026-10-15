import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'

registerJSXTestLoader()
const {
  executeInventoryOperationTransition,
  inventoryOperationMutationReceiptMatches,
} = await import('./inventoryOperationTransition.mjs')
const setRpcResponse = installRpcCallHarness(after)
const operation = {
  id: 7,
  version: 2,
  status: 'DRAFT',
  operation_type: 'CYCLE_COUNT',
}
const posted = { ...operation, version: 3, status: 'POSTED', posted_by: 9 }

test('inventory transition verifies identity, version, actor and cancellation reason', () => {
  const receipt = {
    item: posted,
    previous: operation,
    action: 'post',
    reason: '',
    actorID: 9,
  }
  assert.equal(inventoryOperationMutationReceiptMatches(receipt), true)
  for (const item of [
    { ...posted, id: 8 },
    { ...posted, version: 2 },
    { ...posted, posted_by: 8 },
  ]) {
    assert.equal(
      inventoryOperationMutationReceiptMatches({ ...receipt, item }),
      false
    )
  }
  assert.equal(
    inventoryOperationMutationReceiptMatches({
      ...receipt,
      action: 'cancel',
      reason: '错单',
      item: {
        ...posted,
        status: 'CANCELLED',
        cancelled_by: 9,
        cancel_reason: '其他原因',
      },
    }),
    false
  )
})

test('inventory transition recovers an uncertain write by reading the matching receipt once', async () => {
  const calls = []
  setRpcResponse(async (method) => {
    calls.push(method)
    return {
      data:
        method === 'get_inventory_operation'
          ? { inventory_operation: posted }
          : {},
    }
  })
  const result = await executeInventoryOperationTransition({
    operation,
    action: 'post',
    actorID: 9,
  })
  assert.deepEqual(result, {
    outcome: 'confirmed',
    operation: posted,
    recovered: true,
  })
  assert.deepEqual(calls, [
    'post_inventory_operation',
    'get_inventory_operation',
  ])
})

test('inventory transition does not claim success for a competing mutation or unreadable result', async () => {
  setRpcResponse(async (method) => ({
    data:
      method === 'get_inventory_operation'
        ? { inventory_operation: { ...posted, posted_by: 8 } }
        : {},
  }))
  assert.equal(
    (
      await executeInventoryOperationTransition({
        operation,
        action: 'post',
        actorID: 9,
      })
    ).outcome,
    'changed'
  )
  setRpcResponse(async () => ({ data: {} }))
  await assert.rejects(
    executeInventoryOperationTransition({
      operation,
      action: 'post',
      actorID: 9,
    }),
    (error) => error.isInvalidResponse === true
  )
})
