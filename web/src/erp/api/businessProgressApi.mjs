import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requireProgressBoard,
  requireProgressDetail,
  requireProgressTaskPage,
} from '../utils/businessProgress.mjs'

const rpc = new JsonRpc({
  url: RpcDomain.BUSINESS,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listBusinessProgress(params = {}, options = {}) {
  const result = await rpc.call(RpcMethod.business.LIST_PROGRESS, params, options)
  return requireProgressBoard(result?.data, params.display)
}

export async function listBusinessProgressOwners(view, options = {}) {
  const result = await rpc.call(RpcMethod.business.LIST_PROGRESS_OWNER_OPTIONS, { view }, options)
  const names = result?.data?.names
  if (!Array.isArray(names) || !names.every((name) => typeof name === 'string' && name.trim())) {
    throw new Error('负责人名单格式有误')
  }
  return names
}

export async function getBusinessProgress(params, options = {}) {
  const result = await rpc.call(RpcMethod.business.GET_PROGRESS, params, options)
  return requireProgressDetail(result?.data)
}

export async function listBusinessProgressTasks(params, options = {}) {
  const result = await rpc.call(RpcMethod.business.LIST_PROGRESS_TASKS, params, options)
  return requireProgressTaskPage(result?.data)
}
