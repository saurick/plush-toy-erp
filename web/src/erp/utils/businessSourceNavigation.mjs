import { V1_ROUTE_PATHS } from './masterDataOrderView.mjs'
import { relatedDocumentRoute } from './relatedDocumentNavigation.mjs'

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
  OUTSOURCING_FACT: Object.freeze({
    path: V1_ROUTE_PATHS.processingContracts,
    queryKey: 'outsourcing_fact_id',
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

export function businessSourceRouteFor(
  sourceType,
  sourceID,
  { keyword = '', source = '' } = {}
) {
  const target = DIRECT_SOURCE_ROUTES[normalizedSourceType(sourceType)]
  const normalizedID = positiveSourceID(sourceID)
  if (!target || !normalizedID) return ''
  return relatedDocumentRoute(
    target.path,
    { [target.queryKey]: normalizedID },
    {
      keyword,
      source,
      fields: ['document_no', 'source_no'],
    }
  )
}

const INVENTORY_SOURCE_TYPE_BY_RECORD_KIND = Object.freeze({
  production: 'PRODUCTION_FACT',
  outsourcing: 'OUTSOURCING_FACT',
  shipments: 'SHIPMENT',
})

export function businessRecordInventoryRouteFor(
  recordKind,
  recordID,
  { keyword = '', source = '' } = {}
) {
  const sourceType =
    INVENTORY_SOURCE_TYPE_BY_RECORD_KIND[String(recordKind || '').trim()]
  const normalizedID = positiveSourceID(recordID)
  if (!sourceType || !normalizedID) return ''
  return relatedDocumentRoute(
    V1_ROUTE_PATHS.inventory,
    {
      source_type: sourceType,
      source_id: normalizedID,
      view: 'txns',
    },
    { keyword, source, fields: ['source_no'] }
  )
}
