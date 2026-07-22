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

test('inventoryApi: exposes ledger reads and controlled inventory operations only', () => {
  for (const methodName of [
    'list_inventory_balances',
    'list_inventory_lots',
    'list_inventory_txns',
    'create_inventory_operation',
    'post_inventory_operation',
    'cancel_inventory_operation',
    'get_inventory_operation',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }
  assert.match(source, /listInventoryBalances\(params = \{\}, options = \{\}\)/)
  assert.match(source, /listInventoryLots\(params = \{\}, options = \{\}\)/)
  assert.match(source, /listInventoryTxns\(params = \{\}, options = \{\}\)/)
  assert.match(source, /'list_inventory_balances',[\s\S]*params,[\s\S]*options/)
  assert.match(source, /'list_inventory_lots', params, options/)
  assert.match(source, /'list_inventory_txns', params, options/)

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

test('inventoryApi: source eligibility reads use strict complete pagination', () => {
  assert.match(
    source,
    /export async function listAllInventoryBalances[\s\S]*?listAllPaginatedRecords\(\s*listInventoryBalances,\s*params,\s*'inventory_balances'/u
  )
  assert.match(
    source,
    /export async function listAllInventoryLots[\s\S]*?listAllPaginatedRecords\(\s*listInventoryLots,\s*params,\s*'inventory_lots'/u
  )
})
