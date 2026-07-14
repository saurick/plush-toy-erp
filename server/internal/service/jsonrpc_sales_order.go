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
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	if d.salesOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "save_sales_order_with_items",
		"get_sales_order",
		"list_sales_orders":
		return d.handleSalesOrderDocument(ctx, method, id, pm)
	case "submit_sales_order",
		"activate_sales_order",
		"close_sales_order",
		"cancel_sales_order":
		return d.handleSalesOrderLifecycle(ctx, method, id, pm, claims.UserID)
	case "list_sales_order_items":
		return d.handleSalesOrderItem(ctx, method, id, pm)
	default:
		return id, unknownSalesOrderResult(method), nil
	}
}
