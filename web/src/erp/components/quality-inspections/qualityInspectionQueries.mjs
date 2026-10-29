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
    includeSuperseded,
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
  if (routeQualityInspectionID > 0) {
    return getQualityInspection({ id: routeQualityInspectionID }, { signal }).then((inspection) => ({
      quality_inspections: inspection ? [inspection] : [],
      total: inspection ? 1 : 0,
    }))
  }
  const baseParams = compactParams({
    include_status_counts: all ? undefined : true,
    include_superseded: Boolean(includeSuperseded),
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
  if (inspectionTypeFilter === 'FINISHED_GOODS') {
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
  const data = await loadQualityInspectionList({ ...query, signal, all: true })
  return data?.quality_inspections
}
