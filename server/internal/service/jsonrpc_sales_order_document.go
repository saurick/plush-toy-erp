package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleSalesOrderDocument(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "save_sales_order_with_items":
		orderID := getInt(pm, "id", 0)
		orderPermission := biz.PermissionSalesOrderCreate
		if orderID > 0 {
			orderPermission = biz.PermissionSalesOrderUpdate
		}
		if res := d.RequireAdminPermission(ctx, orderPermission); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders"); res != nil {
			return id, res, nil
		}
		expectedVersion := 0
		if orderID > 0 {
			var ok bool
			expectedVersion, ok = getRequiredJSONRPCPositiveInt(pm, "expected_version")
			if !ok {
				return id, invalidParamResult(), nil
			}
		}
		in, ok := salesOrderMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		in.ExpectedVersion = expectedVersion
		items, ok := salesOrderItemSaveMutationsFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		result, err := d.salesOrderUC.SaveSalesOrderWithItems(ctx, orderID, in, items)
		return id, salesOrderWithItemsMutationResult(ctx, d, result, err), nil
	case "get_sales_order":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		item, err := d.salesOrderUC.GetSalesOrder(ctx, getInt(pm, "id", 0))
		return id, salesOrderMutationResult(ctx, d, item, err), nil
	case "list_sales_orders":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
		if !ok {
			return id, invalidParamResult(), nil
		}
		dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.salesOrderUC.ListSalesOrders(ctx, biz.SalesOrderFilter{
			Keyword:         getString(pm, "keyword"),
			CustomerID:      getInt(pm, "customer_id", 0),
			LifecycleStatus: getString(pm, "lifecycle_status"),
			DateField:       getString(pm, "date_field"),
			DateFrom:        dateFrom,
			DateTo:          dateTo,
			SortBy:          getString(pm, "sort_by"),
			SortDirection:   getString(pm, "sort_direction"),
			Limit:           getInt(pm, "limit", 50),
			Offset:          getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		includeItemCount, permissionResult := d.AdminHasPermission(ctx, biz.PermissionSalesOrderItemRead)
		if permissionResult != nil {
			return id, permissionResult, nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"sales_orders": salesOrdersToAny(items, includeItemCount),
			"total":        total,
			"limit":        normalizedLimit(pm),
			"offset":       normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownSalesOrderResult(method), nil
	}
}
