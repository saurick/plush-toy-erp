import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'

const bomRpc = new JsonRpc({
  url: RpcDomain.BOM,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listBOMVersions(params = {}, options = {}) {
  const result = await bomRpc.call(RpcMethod.bom.LIST_BOM_VERSIONS, params, options)
  return dataOf(result)
}

export async function listAllBOMVersions(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listBOMVersions,
    params,
    'bom_versions',
    options,
    {
      invalidResponseMessage: '服务器返回的 BOM 版本不完整，请刷新后重试',
    }
  )
}

export async function getBOMVersion(params = {}, options = {}) {
  const result = await bomRpc.call(RpcMethod.bom.GET_BOM_VERSION, params, options)
  return dataOf(result)?.bom_version || null
}

export async function saveBOMWithItems(params = {}) {
  const result = await bomRpc.call(RpcMethod.bom.SAVE_BOM_WITH_ITEMS, params)
  return dataOf(result)?.bom_version || null
}

export async function copyBOMVersion(params = {}) {
  const result = await bomRpc.call(RpcMethod.bom.COPY_BOM_VERSION, params)
  return dataOf(result)?.bom_version || null
}

export async function activateBOMVersion(params = {}) {
  const result = await bomRpc.call(RpcMethod.bom.ACTIVATE_BOM_VERSION, params)
  return dataOf(result)?.bom_version || null
}

export async function archiveBOMVersion(params = {}) {
  const result = await bomRpc.call(RpcMethod.bom.ARCHIVE_BOM_VERSION, params)
  return dataOf(result)?.bom_version || null
}
