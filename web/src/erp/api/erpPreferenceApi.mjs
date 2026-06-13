import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const adminRpc = new JsonRpc({
  url: 'admin',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function setERPColumnOrder(params = {}) {
  const result = await adminRpc.call('set_erp_column_order', params)
  return dataOf(result)?.erp_preferences || { column_orders: {} }
}
