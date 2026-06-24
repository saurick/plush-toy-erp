package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleSalesOrderItem(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "add_sales_order_item", "addSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCreate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderItemMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.salesOrderUC.AddSalesOrderItem(ctx, in)
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "update_sales_order_item", "updateSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemUpdate); res != nil {
			return id, res, nil
		}
		in, ok := salesOrderItemMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.salesOrderUC.UpdateSalesOrderItem(ctx, getInt(pm, "id", 0), in)
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "remove_sales_order_item", "removeSalesOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemCancel); res != nil {
			return id, res, nil
		}
		item, err := d.salesOrderUC.RemoveSalesOrderItem(ctx, getInt(pm, "id", 0))
		return id, salesOrderItemMutationResult(ctx, d, item, err), nil
	case "list_sales_order_items", "listSalesOrderItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderItemRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.salesOrderUC.ListSalesOrderItems(ctx, biz.SalesOrderItemFilter{
			SalesOrderID: getInt(pm, "sales_order_id", 0),
			LineStatus:   getString(pm, "line_status"),
			Limit:        getInt(pm, "limit", 50),
			Offset:       getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapSalesOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"sales_order_items": salesOrderItemsToAny(items),
			"total":             total,
			"limit":             normalizedLimit(pm),
			"offset":            normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownSalesOrderResult(method), nil
	}
}
