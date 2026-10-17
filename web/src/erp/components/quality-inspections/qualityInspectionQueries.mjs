import {
  getQualityInspection,
  listAllFinishedGoodsQualityInspections,
  listAllOutsourcingReturnQualityInspections,
  listAllProductionStageQualityInspections,
  listAllQualityInspections,
  listFinishedGoodsQualityInspections,
  listOutsourcingReturnQualityInspections,
  listProductionStageQualityInspections,
  listQualityInspections,
} from '../../api/qualityApi.mjs'
import {
  compactParams,
  trimOptional,
} from '../../utils/sourceDocumentValues.mjs'
import { getBusinessPaginationParams } from '../../utils/businessPagination.mjs'
import { linkedDocumentRequestKeyword } from '../../utils/relatedDocumentNavigation.mjs'
import { qualityInspectionRouteSourceParams } from '../../utils/qualityInspectionSourceAction.mjs'

export function loadQualityInspectionList({
  filters,
  context,
  pagination,
  customerKey: activeCustomerKey,
  signal,
  all = false,
}) {
  const {
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    inspectionTypeFilter,
    keyword,
    lotFilter,
    materialFilter,
    purchaseReceiptFilter,
    resultFilter,
    statusFilter,
    warehouseFilter,
  } = filters
  const {
    linkedKeyword,
    routePurchaseOrderID,
    routePurchaseReceiptID,
    routeQualityInspectionID,
    routeSourceID,
    routeSourceType,
  } = context
  const baseParams = compactParams({
    include_status_counts: all ? undefined : true,
    status: statusFilter,
    result: resultFilter,
    keyword: trimOptional(
      linkedDocumentRequestKeyword({
        localKeyword: keyword,
        linkedKeyword,
        hasExactContext: Boolean(
          routeQualityInspectionID ||
          routePurchaseOrderID ||
          routePurchaseReceiptID ||
          (routeSourceType && routeSourceID)
        ),
      })
    ),
    date_from: dateFilterStart || undefined,
    date_to: dateFilterEnd || undefined,
    ...(all ? {} : getBusinessPaginationParams(pagination)),
  })
  const inventoryFilterParams = compactParams({
    ...baseParams,
    warehouse_id: warehouseFilter || undefined,
    inventory_lot_id: lotFilter || undefined,
  })
  const routeSourceParams = qualityInspectionRouteSourceParams({
    inspectionType: inspectionTypeFilter,
    sourceType: routeSourceType,
    sourceID: routeSourceID,
  })
  const inventorySourceParams = compactParams({
    ...inventoryFilterParams,
    source_type: routeSourceParams.source_type,
    source_id: routeSourceParams.source_id,
  })
  if (inspectionTypeFilter === 'OUTSOURCING_RETURN') {
    const list = all
      ? listAllOutsourcingReturnQualityInspections
      : listOutsourcingReturnQualityInspections
    return list(
      {
        ...inventoryFilterParams,
        customer_key: activeCustomerKey || undefined,
        fact_id: routeSourceParams.fact_id,
      },
      { signal }
    )
  }
  if (
    inspectionTypeFilter === 'FINISHED_GOODS' ||
    routeSourceType === 'SHIPMENT'
  ) {
    const list = all
      ? listAllFinishedGoodsQualityInspections
      : listFinishedGoodsQualityInspections
    return list(inventorySourceParams, { signal })
  }
  let request
  if (inspectionTypeFilter === 'PRODUCTION_STAGE') {
    request = all
      ? listAllProductionStageQualityInspections(baseParams, { signal })
      : listProductionStageQualityInspections(baseParams, { signal })
  } else {
    const list = all ? listAllQualityInspections : listQualityInspections
    request = list(
      compactParams({
        ...inventorySourceParams,
        inspection_type: inspectionTypeFilter || undefined,
        date_field: dateFilterField,
        purchase_receipt_id:
          purchaseReceiptFilter || routePurchaseReceiptID || undefined,
        purchase_order_id: routePurchaseOrderID || undefined,
        material_id: materialFilter || undefined,
      }),
      { signal }
    )
  }
  return request
}

export async function loadQualityInspectionExport(query, { signal } = {}) {
  const { routeQualityInspectionID } = query.context
  const { inspectionTypeFilter } = query.filters
  const routeSelectedID = Number(routeQualityInspectionID || 0)
  if (routeSelectedID > 0 && inspectionTypeFilter !== 'PRODUCTION_STAGE') {
    const inspection = await getQualityInspection({ id: routeSelectedID })
    return inspection ? [inspection] : []
  }
  const data = await loadQualityInspectionList({ ...query, signal, all: true })
  const exportRows = data?.quality_inspections
  return routeSelectedID > 0 && Array.isArray(exportRows)
    ? exportRows.filter((item) => Number(item?.id || 0) === routeSelectedID)
    : exportRows
}
