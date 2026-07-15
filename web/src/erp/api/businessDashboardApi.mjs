import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { requireBusinessDashboardStatsResponse } from '../utils/businessDashboardContract.mjs'

const businessRpc = new JsonRpc({
  url: 'business',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function getBusinessDashboardStats(params = {}) {
  const result = await businessRpc.call('dashboard_stats', params)
  return requireBusinessDashboardStatsResponse(dataOf(result))
}
