import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const debugRpc = new JsonRpc({
  url: 'debug',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function getBusinessChainDebugCapabilities(params = {}) {
  const result = await debugRpc.call('capabilities', params)
  return dataOf(result)
}

export async function rebuildBusinessChainDebugScenario(params = {}) {
  const result = await debugRpc.call('rebuild_business_chain_scenario', params)
  return dataOf(result)
}

export async function cleanupBusinessChainDebugScenario(params = {}) {
  const result = await debugRpc.call('clear_business_chain_scenario', params)
  return dataOf(result)
}

export async function clearBusinessChainDebugBusinessData(params = {}) {
  const result = await debugRpc.call('clear_business_data', params)
  return dataOf(result)
}
