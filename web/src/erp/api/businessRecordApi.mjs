import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const businessRpc = new JsonRpc({
  url: 'business',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listBusinessRecords(params = {}) {
  const result = await businessRpc.call('list_records', params)
  return dataOf(result)
}

export async function getBusinessDashboardStats(params = {}) {
  const result = await businessRpc.call('dashboard_stats', params)
  return dataOf(result)
}

export async function createBusinessRecord(params = {}) {
  const result = await businessRpc.call('create_record', params)
  return dataOf(result)?.record || null
}

export async function updateBusinessRecord(params = {}) {
  const result = await businessRpc.call('update_record', params)
  return dataOf(result)?.record || null
}

export async function deleteBusinessRecords(params = {}) {
  const result = await businessRpc.call('delete_records', params)
  return dataOf(result)
}

export async function restoreBusinessRecord(params = {}) {
  const result = await businessRpc.call('restore_record', params)
  return dataOf(result)?.record || null
}
