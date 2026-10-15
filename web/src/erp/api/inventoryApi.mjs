import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import {
  JsonRpc,
  requireRpcEntity,
  requireRpcPage,
} from '@/common/utils/jsonRpc'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'

const inventoryRpc = new JsonRpc({
  url: RpcDomain.INVENTORY,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listInventoryBalances(params = {}, options = {}) {
  const result = await inventoryRpc.call(
    RpcMethod.inventory.LIST_INVENTORY_BALANCES,
    params,
    options
  )
  return requireRpcPage(
    result,
    'inventory_balances',
    '库存余额数据不完整，请重新读取'
  )
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
  const result = await inventoryRpc.call(RpcMethod.inventory.LIST_INVENTORY_LOTS, params, options)
  return requireRpcPage(
    result,
    'inventory_lots',
    '库存批次数据不完整，请重新读取'
  )
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
  const result = await inventoryRpc.call(RpcMethod.inventory.LIST_INVENTORY_TXNS, params, options)
  return requireRpcPage(
    result,
    'inventory_txns',
    '库存流水数据不完整，请重新读取'
  )
}

export async function listAllInventoryTxns(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listInventoryTxns,
    params,
    'inventory_txns',
    options,
    {
      invalidResponseMessage: '服务器返回的库存流水不完整，请刷新后重试',
    }
  )
}

export async function createInventoryOperation(params = {}) {
  const result = await inventoryRpc.call(RpcMethod.inventory.CREATE_INVENTORY_OPERATION, params)
  return requireRpcEntity(
    result,
    'inventory_operation',
    '库存操作创建结果不完整，请重新读取'
  )
}

export async function saveInventoryOperationDraft(params = {}) {
  const result = await inventoryRpc.call(
    RpcMethod.inventory.SAVE_INVENTORY_OPERATION_DRAFT,
    params
  )
  return requireRpcEntity(
    result,
    'inventory_operation',
    '库存操作保存结果不完整，请重新读取'
  )
}

export async function postInventoryOperation(params = {}) {
  const result = await inventoryRpc.call(RpcMethod.inventory.POST_INVENTORY_OPERATION, params)
  return requireRpcEntity(
    result,
    'inventory_operation',
    '库存操作过账结果不完整，请重新读取'
  )
}

export async function cancelInventoryOperation(params = {}) {
  const result = await inventoryRpc.call(RpcMethod.inventory.CANCEL_INVENTORY_OPERATION, params)
  return requireRpcEntity(
    result,
    'inventory_operation',
    '库存操作取消结果不完整，请重新读取'
  )
}

export async function getInventoryOperation(params = {}, options = {}) {
  const result = await inventoryRpc.call(
    RpcMethod.inventory.GET_INVENTORY_OPERATION,
    params,
    options
  )
  return requireRpcEntity(
    result,
    'inventory_operation',
    '库存操作详情不完整，请重新读取'
  )
}

export async function listInventoryOperations(params = {}, options = {}) {
  const result = await inventoryRpc.call(
    RpcMethod.inventory.LIST_INVENTORY_OPERATIONS,
    params,
    options
  )
  return requireRpcPage(
    result,
    'inventory_operations',
    '库存操作列表不完整，请重新读取'
  )
}
