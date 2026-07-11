import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const operationalFactRpc = new JsonRpc({
  url: 'operational_fact',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listProductionFacts(params = {}) {
  const result = await operationalFactRpc.call('list_production_facts', params)
  return dataOf(result)
}

export async function createProductionFact(params = {}) {
  const result = await operationalFactRpc.call('create_production_fact', params)
  return dataOf(result)?.production_fact || null
}

export async function postProductionFact(params = {}) {
  const result = await operationalFactRpc.call('post_production_fact', params)
  return dataOf(result)?.production_fact || null
}

export async function cancelProductionFact(params = {}) {
  const result = await operationalFactRpc.call('cancel_production_fact', params)
  return dataOf(result)?.production_fact || null
}

export async function listOutsourcingFacts(params = {}) {
  const result = await operationalFactRpc.call('list_outsourcing_facts', params)
  return dataOf(result)
}

export async function createOutsourcingFact(params = {}) {
  const result = await operationalFactRpc.call(
    'create_outsourcing_fact',
    params
  )
  return dataOf(result)?.outsourcing_fact || null
}

export async function postOutsourcingFact(params = {}) {
  const result = await operationalFactRpc.call('post_outsourcing_fact', params)
  return dataOf(result)?.outsourcing_fact || null
}

export async function cancelOutsourcingFact(params = {}) {
  const result = await operationalFactRpc.call(
    'cancel_outsourcing_fact',
    params
  )
  return dataOf(result)?.outsourcing_fact || null
}

export async function listShipments(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_shipments',
    params,
    options
  )
  return dataOf(result)
}

export async function createShipment(params = {}) {
  const result = await operationalFactRpc.call('create_shipment', params)
  return dataOf(result)?.shipment || null
}

export async function createShipmentWithItems(params = {}) {
  const result = await operationalFactRpc.call(
    'create_shipment_with_items',
    params
  )
  return dataOf(result)?.shipment || null
}

export async function addShipmentItem(params = {}) {
  const result = await operationalFactRpc.call('add_shipment_item', params)
  return dataOf(result)?.shipment_item || null
}

export async function shipShipment(params = {}) {
  const result = await operationalFactRpc.call('ship_shipment', params)
  return dataOf(result)?.shipment || null
}

export async function cancelShipment(params = {}) {
  const result = await operationalFactRpc.call('cancel_shipment', params)
  return dataOf(result)?.shipment || null
}

export async function listStockReservations(params = {}) {
  const result = await operationalFactRpc.call(
    'list_stock_reservations',
    params
  )
  return dataOf(result)
}

export async function createStockReservation(params = {}) {
  const result = await operationalFactRpc.call(
    'create_stock_reservation',
    params
  )
  return dataOf(result)?.stock_reservation || null
}

export async function releaseStockReservation(params = {}) {
  const result = await operationalFactRpc.call(
    'release_stock_reservation',
    params
  )
  return dataOf(result)?.stock_reservation || null
}

export async function listFinanceFacts(params = {}) {
  const result = await operationalFactRpc.call('list_finance_facts', params)
  return dataOf(result)
}

export async function createFinanceFact(params = {}) {
  const result = await operationalFactRpc.call('create_finance_fact', params)
  return dataOf(result)?.finance_fact || null
}

export async function postFinanceFact(params = {}) {
  const result = await operationalFactRpc.call('post_finance_fact', params)
  return dataOf(result)?.finance_fact || null
}

export async function settleFinanceFact(params = {}) {
  const result = await operationalFactRpc.call('settle_finance_fact', params)
  return dataOf(result)?.finance_fact || null
}

export async function cancelFinanceFact(params = {}) {
  const result = await operationalFactRpc.call('cancel_finance_fact', params)
  return dataOf(result)?.finance_fact || null
}
