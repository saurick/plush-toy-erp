package service

import (
	"context"
	"encoding/json"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) exportSalesOrders(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, "sales_orders"); res != nil {
		return res
	}
	if !jsonRPCParamsAllowed(pm, "id", "keyword", "customer_id", "sample_bom_id", "lifecycle_status", "lifecycle_scope", "date_field", "date_from", "date_to", "sort_by", "sort_direction") {
		return invalidParamResult()
	}
	query := biz.SalesOrderExportQuery{}
	if _, present := pm["id"]; present {
		id, valid := getRequiredJSONRPCPositiveInt(pm, "id")
		if !valid || !jsonRPCParamsAllowed(pm, "id") {
			return invalidParamResult()
		}
		query.ID = id
		query.Filter.LifecycleScope = "all"
	} else {
		if _, present := pm["customer_id"]; present {
			if _, valid := getRequiredJSONRPCPositiveInt(pm, "customer_id"); !valid {
				return invalidParamResult()
			}
		}
		filter, valid := salesOrderListFilterFromParams(pm)
		if !valid {
			return invalidParamResult()
		}
		query.Filter = filter
	}
	includeItemCount, res := d.AdminHasPermission(ctx, biz.PermissionSalesOrderItemRead)
	if res != nil {
		return res
	}
	ctx, release, err := d.salesOrderUC.BeginSalesOrderExport(ctx)
	if err != nil {
		return d.salesOrderExportError(ctx, err)
	}
	defer release()
	orders, err := d.salesOrderUC.ExportSalesOrders(ctx, query)
	if err != nil {
		return d.salesOrderExportError(ctx, err)
	}
	data := map[string]any{"sales_orders": salesOrdersToAny(orders, includeItemCount), "total": len(orders)}
	payload, err := json.Marshal(data)
	if err != nil {
		return d.mapSalesOrderError(ctx, err)
	}
	if len(payload) > biz.SalesOrderExportMaxBytes {
		return d.salesOrderExportError(ctx, biz.ErrSalesOrderExportLimit)
	}
	result := &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(data)}
	if err := ctx.Err(); err != nil {
		return d.salesOrderExportError(ctx, err)
	}
	return result
}

func (d *jsonrpcDispatcher) salesOrderExportError(ctx context.Context, err error) *v1.JsonrpcResult {
	definition := errcode.Definition{}
	switch {
	case errors.Is(err, biz.ErrSalesOrderExportLimit):
		definition = errcode.SalesOrderExportLimit
	case errors.Is(err, biz.ErrSalesOrderExportBusy):
		definition = errcode.SalesOrderExportBusy
	case errors.Is(err, biz.ErrSalesOrderExportTimeout), errors.Is(err, context.DeadlineExceeded):
		definition = errcode.SalesOrderExportTimeout
	default:
		return d.mapSalesOrderError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: definition.Code, Message: definition.Message}
}

func salesOrderListFilterFromParams(pm map[string]any) (biz.SalesOrderFilter, bool) {
	sampleBOMID := 0
	if _, exists := pm["sample_bom_id"]; exists {
		var valid bool
		sampleBOMID, valid = getRequiredJSONRPCPositiveInt(pm, "sample_bom_id")
		if !valid {
			return biz.SalesOrderFilter{}, false
		}
	}
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.SalesOrderFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.SalesOrderFilter{}, false
	}
	return biz.SalesOrderFilter{
		Keyword: getString(pm, "keyword"), CustomerID: getInt(pm, "customer_id", 0), SampleBOMID: sampleBOMID,
		LifecycleStatus: getString(pm, "lifecycle_status"), LifecycleScope: getString(pm, "lifecycle_scope"),
		DateField: getString(pm, "date_field"), DateFrom: dateFrom, DateTo: dateTo,
		SortBy: getString(pm, "sort_by"), SortDirection: getString(pm, "sort_direction"),
		Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0),
	}, true
}
