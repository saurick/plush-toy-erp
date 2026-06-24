package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleSalesOrder(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.salesOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_sales_order", "createSalesOrder",
		"update_sales_order", "updateSalesOrder",
		"save_sales_order_with_items", "saveSalesOrderWithItems",
		"get_sales_order", "getSalesOrder",
		"list_sales_orders", "listSalesOrders":
		return d.handleSalesOrderDocument(ctx, method, id, pm)
	case "submit_sales_order", "submitSalesOrder",
		"activate_sales_order", "activateSalesOrder",
		"close_sales_order", "closeSalesOrder",
		"cancel_sales_order", "cancelSalesOrder":
		return d.handleSalesOrderLifecycle(ctx, method, id, pm)
	case "add_sales_order_item", "addSalesOrderItem",
		"update_sales_order_item", "updateSalesOrderItem",
		"remove_sales_order_item", "removeSalesOrderItem",
		"list_sales_order_items", "listSalesOrderItems":
		return d.handleSalesOrderItem(ctx, method, id, pm)
	default:
		return id, unknownSalesOrderResult(method), nil
	}
}
