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
