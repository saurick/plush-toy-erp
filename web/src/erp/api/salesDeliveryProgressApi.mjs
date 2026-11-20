import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { validSalesDeliveryRows } from '../utils/businessProgress.mjs'

const rpc = new JsonRpc({
  url: RpcDomain.SALES_ORDER,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function invalid() {
  return Object.assign(new Error('交付进度数据暂不可用，请重试'), { isInvalidResponse: true })
}

function validMilestone(value) {
  return value && ['label', 'role', 'assignee', 'status', 'date', 'reason'].every(
    (key) => typeof value[key] === 'string'
  )
}

export async function getSalesDeliveryProgress(orderID, pagination, options) {
  const result = await rpc.call(RpcMethod.sales_order.GET_DELIVERY_PROGRESS, { id: orderID, ...pagination }, options)
  const data = result?.data
  if (data?.order_id !== orderID ||
    !['label', 'status', 'customer', 'owner'].every((key) => typeof data[key] === 'string') ||
    !Number.isFinite(Date.parse(data.snapshot_at)) || !validSalesDeliveryRows(data.lines, data.total) ||
    !data.lines.every((row) => row.line.sales_order_id === orderID) ||
    typeof data.tasks_available !== 'boolean' || (data.current !== null && !validMilestone(data.current)) ||
    !Array.isArray(data.recent) || !data.recent.every(validMilestone)) {
    throw invalid()
  }
  return data
}
