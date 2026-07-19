import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'

const inventoryRpc = new JsonRpc({
  url: 'inventory',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listInventoryBalances(params = {}, options = {}) {
  const result = await inventoryRpc.call(
    'list_inventory_balances',
    params,
    options
  )
  return dataOf(result)
}

export async function listAllInventoryBalances(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listInventoryBalances,
    params,
    'inventory_balances',
    options,
    {
      invalidResponseMessage: '服务器返回的库存余额不完整，请刷新后重试',
    }
  )
}

export async function listInventoryLots(params = {}, options = {}) {
  const result = await inventoryRpc.call('list_inventory_lots', params, options)
  return dataOf(result)
}

export async function listAllInventoryLots(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listInventoryLots,
    params,
    'inventory_lots',
    options,
    {
      invalidResponseMessage: '服务器返回的库存批次不完整，请刷新后重试',
    }
  )
}

export async function listInventoryTxns(params = {}, options = {}) {
  const result = await inventoryRpc.call('list_inventory_txns', params, options)
  return dataOf(result)
}
