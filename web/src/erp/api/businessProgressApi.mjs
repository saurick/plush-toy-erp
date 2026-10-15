import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requireProgressBoard,
  requireProgressDetail,
} from '../utils/businessProgress.mjs'

const rpc = new JsonRpc({
  url: RpcDomain.BUSINESS,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listBusinessProgress(params = {}, options = {}) {
  const result = await rpc.call(RpcMethod.business.LIST_PROGRESS, params, options)
  return requireProgressBoard(result?.data)
}

export async function getBusinessProgress(params, options = {}) {
  const result = await rpc.call(RpcMethod.business.GET_PROGRESS, params, options)
  return requireProgressDetail(result?.data)
}
