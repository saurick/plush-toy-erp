import {
  RpcDomain,
  RpcMethod,
} from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData } from '@/common/utils/jsonRpc'
import { validateWarehouseProductionWorkPage } from '../utils/warehouseProductionWork.mjs'

const rpc = new JsonRpc({
  url: RpcDomain.PRODUCTION_WIP,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listWarehouseProductionWork(params, options = {}) {
  const result = await rpc.call(
    RpcMethod.production_wip.LIST_WAREHOUSE_PRODUCTION_WORK,
    params,
    options
  )
  return validateWarehouseProductionWorkPage(requireRpcData(result), params)
}
