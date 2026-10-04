import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'

const adminRpc = new JsonRpc({
  url: RpcDomain.ADMIN,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function setERPColumnOrder(params = {}) {
  const result = await adminRpc.call(RpcMethod.admin.SET_ERP_COLUMN_ORDER, params)
  const preferences = dataOf(result)?.erp_preferences
  if (
    !preferences ||
    !preferences.column_orders ||
    !preferences.hidden_columns
  ) {
    const error = new Error('服务器未返回完整列设置，请刷新后重试')
    error.isInvalidResponse = true
    throw error
  }
  return preferences
}
