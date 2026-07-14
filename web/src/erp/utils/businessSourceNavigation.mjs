import { V1_ROUTE_PATHS } from './masterDataOrderView.mjs'
import { routeWithQuery } from './routeQuery.mjs'

const DIRECT_SOURCE_ROUTES = Object.freeze({
  SALES_ORDER: Object.freeze({
    path: V1_ROUTE_PATHS.salesOrders,
    queryKey: 'sales_order_id',
  }),
  PRODUCTION_ORDER: Object.freeze({
    path: V1_ROUTE_PATHS.productionOrders,
    queryKey: 'production_order_id',
  }),
  PRODUCTION_FACT: Object.freeze({
    path: V1_ROUTE_PATHS.productionProgress,
    queryKey: 'fact_id',
  }),
  OUTSOURCING_ORDER: Object.freeze({
    path: V1_ROUTE_PATHS.processingContracts,
    queryKey: 'outsourcing_order_id',
  }),
  PURCHASE_ORDER: Object.freeze({
    path: V1_ROUTE_PATHS.purchaseOrders,
    queryKey: 'purchase_order_id',
  }),
  PURCHASE_RECEIPT: Object.freeze({
    path: V1_ROUTE_PATHS.purchaseReceipts,
    queryKey: 'receipt_id',
  }),
  QUALITY_INSPECTION: Object.freeze({
    path: V1_ROUTE_PATHS.qualityInspections,
    queryKey: 'quality_inspection_id',
  }),
  SHIPMENT: Object.freeze({
    path: V1_ROUTE_PATHS.shipments,
    queryKey: 'shipment_id',
  }),
})

function normalizedSourceType(sourceType) {
  return String(sourceType || '')
    .trim()
    .toUpperCase()
}

function positiveSourceID(sourceID) {
  const parsed = Number(sourceID || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function sourceRouteFor(sourceType) {
  return DIRECT_SOURCE_ROUTES[normalizedSourceType(sourceType)]?.path || ''
}

export function businessSourceRouteFor(sourceType, sourceID) {
  const target = DIRECT_SOURCE_ROUTES[normalizedSourceType(sourceType)]
  const normalizedID = positiveSourceID(sourceID)
  if (!target || !normalizedID) return ''
  return routeWithQuery(target.path, { [target.queryKey]: normalizedID })
}
