import {
  RpcDomain,
  RpcMethod,
} from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requireStatisticsBoard,
  requireStatisticsSources,
} from '../utils/businessStatistics.mjs'

const rpc = new JsonRpc({
  url: RpcDomain.BUSINESS,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})
export async function getBusinessStatistics(query, options = {}) {
  const { report, ...params } = query
  const method =
    report === 'receivables'
      ? RpcMethod.business.GET_RECEIVABLE_STATISTICS
      : RpcMethod.business.GET_DELIVERY_STATISTICS
  const result = await rpc.call(method, params, options)
  return requireStatisticsBoard(result?.data, report, query.group_by)
}
export async function listBusinessStatisticsSources(query, options = {}) {
  const { report, ...params } = query
  const method =
    report === 'receivables'
      ? RpcMethod.business.LIST_RECEIVABLE_STATISTICS_SOURCES
      : RpcMethod.business.LIST_DELIVERY_STATISTICS_SOURCES
  const result = await rpc.call(method, params, options)
  return requireStatisticsSources(result?.data, report)
}
