package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) listWarehouseProductionWork(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "kind", "stage", "keyword", "limit", "offset", "sort_by", "sort_direction") {
		return invalidParamResult()
	}
	kind, ok := productionOrderRequiredString(pm, "kind", 32)
	if !ok {
		return invalidParamResult()
	}
	permission := biz.PermissionProductionFactRead
	if kind == biz.WarehouseProductionKindReturn {
		permission = biz.PermissionProductionWIPRead
	}
	if result := d.RequireAdminPermission(ctx, permission); result != nil {
		return result
	}
	if result := d.requireCustomerConfigModulesReadable(ctx, "production_orders", "quality_inspections"); result != nil {
		return result
	}
	limit, ok := productionOrderOptionalNonNegativeInt(pm, "limit", 20)
	if !ok {
		return invalidParamResult()
	}
	offset, ok := productionOrderOptionalNonNegativeInt(pm, "offset", 0)
	if !ok {
		return invalidParamResult()
	}
	stage, ok := productionOrderOptionalExactString(pm, "stage")
	if !ok {
		return invalidParamResult()
	}
	keyword, ok := productionOrderOptionalExactString(pm, "keyword")
	if !ok {
		return invalidParamResult()
	}
	sortBy, ok := productionOrderOptionalExactString(pm, "sort_by")
	if !ok {
		return invalidParamResult()
	}
	sortDirection, ok := productionOrderOptionalExactString(pm, "sort_direction")
	if !ok {
		return invalidParamResult()
	}
	filter := biz.WarehouseProductionWorkFilter{Kind: kind, Stage: stage, Keyword: keyword, Limit: limit, Offset: offset, SortBy: sortBy, SortDirection: sortDirection}
	scope, result := d.currentWarehouseDataScope(ctx)
	if result != nil {
		return result
	}
	page, err := d.productionOrderUC.ListWarehouseProductionWork(biz.WithWarehouseDataScope(ctx, scope), filter)
	if err != nil {
		return d.mapProductionWIPError(ctx, err)
	}
	items := make([]any, 0, len(page.Items))
	for _, row := range page.Items {
		items = append(items, warehouseProductionWorkToMap(row))
	}
	counts := map[string]any{}
	for stage, count := range page.Counts {
		counts[stage] = count
	}
	return okData(map[string]any{"items": items, "total": page.Total, "counts": counts})
}

func warehouseProductionWorkToMap(row *biz.WarehouseProductionWork) map[string]any {
	return map[string]any{
		"id": row.ID, "kind": row.Kind, "stage": row.Stage, "production_order_id": row.ProductionOrderID, "production_order_item_id": row.ProductionOrderItemID, "order_no": row.OrderNo,
		"fact_id": row.FactID, "fact_no": row.FactNo, "fact_status": row.FactStatus, "fact_version": row.FactVersion, "production_wip_batch_id": row.BatchID, "batch_no": row.BatchNo,
		"operation_name": row.OperationName, "product_name": row.ProductName, "product_code": row.ProductCode, "sku_code": row.SKUCode, "unit_name": row.UnitName,
		"warehouse_id": row.WarehouseID, "warehouse_name": row.WarehouseName, "lot_no": row.LotNo, "quantity": row.Quantity,
		"pending_inspection_quantity": row.PendingInspectionQuantity, "pending_packaging_quantity": row.PendingPackagingQuantity, "packaging_confirmed": row.PackagingConfirmed,
		"action_batch_id": row.ActionBatchID, "action": row.Action,
	}
}
