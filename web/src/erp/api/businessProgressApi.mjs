import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requireProgressBoard,
  requireProgressDetail,
} from '../utils/businessProgress.mjs'

const rpc = new JsonRpc({
  url: 'business',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listBusinessProgress(params = {}, options = {}) {
  const result = await rpc.call('list_progress', params, options)
  return requireProgressBoard(result?.data)
}

export async function getBusinessProgress(params, options = {}) {
  const result = await rpc.call('get_progress', params, options)
  return requireProgressDetail(result?.data)
}
