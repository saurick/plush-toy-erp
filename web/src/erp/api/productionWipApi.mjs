import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

import {
  buildProductionWipActionParams,
  positiveSafeInteger,
  productionWipUUID,
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

export async function initializeProductionWip(
  productionOrderID,
  { idempotencyKey = productionWipUUID(), options = {} } = {}
) {
  const normalizedOrderID = requireProductionOrderID(productionOrderID)
  const normalizedIdempotencyKey = String(idempotencyKey || '').trim()
  if (!normalizedIdempotencyKey || [...normalizedIdempotencyKey].length > 128) {
    throw new Error('生产工序路线不完整，请刷新后重试')
  }
  const result = await rpc.call(
    'initialize_production_wip',
    {
      production_order_id: normalizedOrderID,
      idempotency_key: normalizedIdempotencyKey,
    },
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
