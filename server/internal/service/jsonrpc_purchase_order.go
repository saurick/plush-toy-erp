package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handlePurchaseOrder(
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
	if d.purchaseOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "save_purchase_order_with_items", "savePurchaseOrderWithItems",
		"get_purchase_order", "getPurchaseOrder",
		"list_purchase_orders", "listPurchaseOrders":
		return d.handlePurchaseOrderDocument(ctx, method, id, pm)
	case "submit_purchase_order", "submitPurchaseOrder",
		"approve_purchase_order", "approvePurchaseOrder",
		"close_purchase_order", "closePurchaseOrder",
		"cancel_purchase_order", "cancelPurchaseOrder":
		return d.handlePurchaseOrderLifecycle(ctx, method, id, pm)
	case "list_purchase_order_items", "listPurchaseOrderItems":
		return d.handlePurchaseOrderItem(ctx, method, id, pm)
	default:
		return id, unknownPurchaseOrderResult(method), nil
	}
}
