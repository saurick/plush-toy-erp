import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const bomRpc = new JsonRpc({
  url: 'bom',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listBOMVersions(params = {}) {
  const result = await bomRpc.call('list_bom_versions', params)
  return dataOf(result)
}

export async function getBOMVersion(params = {}) {
  const result = await bomRpc.call('get_bom_version', params)
  return dataOf(result)?.bom_version || null
}

export async function saveBOMWithItems(params = {}) {
  const result = await bomRpc.call('save_bom_with_items', params)
  return dataOf(result)?.bom_version || null
}

export async function copyBOMVersion(params = {}) {
  const result = await bomRpc.call('copy_bom_version', params)
  return dataOf(result)?.bom_version || null
}

export async function activateBOMVersion(params = {}) {
  const result = await bomRpc.call('activate_bom_version', params)
  return dataOf(result)?.bom_version || null
}

export async function archiveBOMVersion(params = {}) {
  const result = await bomRpc.call('archive_bom_version', params)
  return dataOf(result)?.bom_version || null
}
