import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  positiveSafeInteger,
  requireProductionOrderKey,
  validateProductionOrderAggregate,
  validateProductionOrderList,
  validateProductionOrderOptions,
} from '../utils/productionOrderModel.mjs'

const rpc = new JsonRpc({
  url: 'production_order',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

function requireMutation(params, { id = false, version = false } = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('生产订单操作参数无效')
  }
  requireProductionOrderKey(params.idempotency_key)
  if (id && !positiveSafeInteger(params.production_order_id)) {
    throw new Error('生产订单操作参数无效')
  }
  if (version && !positiveSafeInteger(params.expected_version)) {
    throw new Error('生产订单操作参数无效')
  }
  return params
}

async function aggregateMutation(method, params, expected) {
  const result = await rpc.call(method, params)
  return validateProductionOrderAggregate(dataOf(result), expected)
}

export async function listProductionOrders(params = {}, options = {}) {
  const result = await rpc.call('list_production_orders', params, options)
  return validateProductionOrderList(dataOf(result))
}

export async function getProductionOrder(productionOrderID, options = {}) {
  if (!positiveSafeInteger(productionOrderID)) {
    throw new Error('请选择有效的生产订单')
  }
  const result = await rpc.call(
    'get_production_order',
    { production_order_id: productionOrderID },
    options
  )
  return validateProductionOrderAggregate(dataOf(result), {
    id: productionOrderID,
  })
}

export async function createProductionOrder(params) {
  requireMutation(params)
  return aggregateMutation('create_production_order', params)
}

export async function saveProductionOrder(params) {
  requireMutation(params, { id: true, version: true })
  return aggregateMutation('save_production_order', params, {
    id: params.production_order_id,
    status: 'DRAFT',
  })
}

async function action(method, status, params) {
  requireMutation(params, { id: true, version: true })
  return aggregateMutation(method, params, {
    id: params.production_order_id,
    status,
  })
}

export function releaseProductionOrder(params) {
  return action('release_production_order', 'RELEASED', params)
}

export function closeProductionOrder(params) {
  return action('close_production_order', 'CLOSED', params)
}

export function cancelProductionOrder(params) {
  return action('cancel_production_order', 'CANCELLED', params)
}

export async function listProductionOrderReferenceOptions(
  referenceType,
  params = {},
  options = {}
) {
  const result = await rpc.call(
    'list_production_order_reference_options',
    { ...params, reference_type: referenceType },
    options
  )
  return validateProductionOrderOptions(dataOf(result), referenceType)
}
