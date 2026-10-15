import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'

registerJSXTestLoader()
const attachmentApi = await import('./attachmentApi.mjs')
const inventoryApi = await import('./inventoryApi.mjs')
const setRpcResponse = installRpcCallHarness(after)
const invalidResponse = (error) => error.isInvalidResponse === true

test('attachment reads distinguish an empty list from a missing or malformed list', async () => {
  setRpcResponse(async () => ({ data: { attachments: [] } }))
  assert.deepEqual(await attachmentApi.listBusinessAttachments(), [])
  for (const response of [
    {},
    { data: null },
    { data: {} },
    { data: { attachments: {} } },
  ]) {
    setRpcResponse(async () => response)
    await assert.rejects(
      attachmentApi.listBusinessAttachments(),
      invalidResponse
    )
  }
})

test('attachment writes and downloads require an identified result', async () => {
  for (const execute of [
    attachmentApi.downloadBusinessAttachment,
    attachmentApi.withdrawBusinessAttachment,
  ]) {
    for (const attachment of [undefined, null, {}, [], { id: 0 }]) {
      setRpcResponse(async () => ({ data: { attachment } }))
      await assert.rejects(execute({ id: 7 }), invalidResponse)
    }
    setRpcResponse(async () => ({ data: { attachment: { id: 7 } } }))
    assert.equal((await execute({ id: 7 })).id, 7)
  }
  setRpcResponse(async () => ({ data: {} }))
  await assert.rejects(
    attachmentApi.clearProductImage({ product_id: 7 }),
    invalidResponse
  )
})

test('inventory list pages preserve legitimate empty results and reject missing pagination', async () => {
  for (const [load, key] of [
    [inventoryApi.listInventoryBalances, 'inventory_balances'],
    [inventoryApi.listInventoryLots, 'inventory_lots'],
    [inventoryApi.listInventoryTxns, 'inventory_txns'],
    [inventoryApi.listInventoryOperations, 'inventory_operations'],
  ]) {
    const emptyPage = { [key]: [], total: 0, limit: 50, offset: 0 }
    setRpcResponse(async () => ({ data: emptyPage }))
    assert.deepEqual(await load(), emptyPage)
    for (const data of [
      undefined,
      {},
      { ...emptyPage, [key]: null },
      { ...emptyPage, total: undefined },
      { ...emptyPage, limit: 0 },
      { ...emptyPage, offset: -1 },
    ]) {
      setRpcResponse(async () => ({ data }))
      await assert.rejects(load(), invalidResponse)
    }
  }
})

test('inventory operation reads and writes cannot return silent null receipts', async () => {
  for (const execute of [
    inventoryApi.createInventoryOperation,
    inventoryApi.saveInventoryOperationDraft,
    inventoryApi.postInventoryOperation,
    inventoryApi.cancelInventoryOperation,
    inventoryApi.getInventoryOperation,
  ]) {
    setRpcResponse(async () => ({ data: {} }))
    await assert.rejects(execute({ id: 7 }), invalidResponse)
    setRpcResponse(async () => ({
      data: { inventory_operation: { id: 7, version: 2, status: 'POSTED' } },
    }))
    assert.equal((await execute({ id: 7 })).id, 7)
  }
})
