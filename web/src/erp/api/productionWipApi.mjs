import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

import {
  buildProductionWipActionParams,
  positiveSafeInteger,
  validateProductionWipAggregate,
} from '../utils/productionWipModel.mjs'

const rpc = new JsonRpc({
  url: 'production_wip',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function prepareProductionOutsourcingOrder(params) {
  const value = dataOf(
    await rpc.call('prepare_production_outsourcing_order', params)
  )
  if (
    !positiveSafeInteger(value.outsourcing_order_id) ||
    !String(value.outsourcing_order_no || '').trim()
  ) {
    throw new Error('委外草稿信息不完整，请重新读取后核对')
  }
  return value
}

function requireProductionOrderID(value) {
  if (!positiveSafeInteger(value)) {
    throw new Error('请选择有效的生产订单')
  }
  return value
}

export async function getProductionWip(productionOrderID, options = {}) {
  const normalizedOrderID = requireProductionOrderID(productionOrderID)
  const result = await rpc.call(
    'get_production_wip',
    { production_order_id: normalizedOrderID },
    options
  )
  return validateProductionWipAggregate(dataOf(result), {
    productionOrderID: normalizedOrderID,
  })
}

export async function executeProductionWipAction(action, values = {}) {
  const params = buildProductionWipActionParams(action, values)
  const result = await rpc.call('execute_production_wip_action', params)
  return validateProductionWipAggregate(dataOf(result), {
    productionOrderID: params.production_order_id,
  })
}
