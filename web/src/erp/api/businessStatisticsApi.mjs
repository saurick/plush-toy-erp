import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requireStatisticsBoard,
  requireStatisticsSources,
} from '../utils/businessStatistics.mjs'

const rpc = new JsonRpc({
  url: 'business',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})
export async function getBusinessStatistics(query, options = {}) {
  const { report, ...params } = query
  const method =
    report === 'receivables'
      ? 'get_receivable_statistics'
      : 'get_delivery_statistics'
  const result = await rpc.call(method, params, options)
  return requireStatisticsBoard(result?.data, report, query.group_by)
}
export async function listBusinessStatisticsSources(query, options = {}) {
  const { report, ...params } = query
  const method =
    report === 'receivables'
      ? 'list_receivable_statistics_sources'
      : 'list_delivery_statistics_sources'
  const result = await rpc.call(method, params, options)
  return requireStatisticsSources(result?.data, report)
}
