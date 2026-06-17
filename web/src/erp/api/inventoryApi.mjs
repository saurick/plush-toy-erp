import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const inventoryRpc = new JsonRpc({
  url: 'inventory',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listInventoryBalances(params = {}) {
  const result = await inventoryRpc.call('list_inventory_balances', params)
  return dataOf(result)
}

export async function listInventoryLots(params = {}) {
  const result = await inventoryRpc.call('list_inventory_lots', params)
  return dataOf(result)
}

export async function listInventoryTxns(params = {}) {
  const result = await inventoryRpc.call('list_inventory_txns', params)
  return dataOf(result)
}
