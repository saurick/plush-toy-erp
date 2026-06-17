import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./inventoryApi.mjs', import.meta.url)),
  'utf8'
)

test('inventoryApi: uses dedicated inventory JSON-RPC domain and admin auth', () => {
  assert.match(source, /url:\s*'inventory'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('inventoryApi: exposes read-only inventory ledger methods only', () => {
  for (const methodName of [
    'list_inventory_balances',
    'list_inventory_lots',
    'list_inventory_txns',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  for (const forbiddenActionName of [
    'createInventoryTxn',
    'postInventoryAdjustment',
    'shipInventory',
    'cancelShipment',
    'changeInventoryLotStatus',
    'reserveStock',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbiddenActionName))
  }
})
