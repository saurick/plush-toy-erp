package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleOutsourcingOrder(
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
	if d.outsourcingOrderUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "save_outsourcing_order_with_items", "saveOutsourcingOrderWithItems",
		"get_outsourcing_order", "getOutsourcingOrder",
		"list_outsourcing_orders", "listOutsourcingOrders":
		return d.handleOutsourcingOrderDocument(ctx, method, id, pm)
	case "submit_outsourcing_order", "submitOutsourcingOrder",
		"confirm_outsourcing_order", "confirmOutsourcingOrder",
		"close_outsourcing_order", "closeOutsourcingOrder",
		"cancel_outsourcing_order", "cancelOutsourcingOrder":
		return d.handleOutsourcingOrderLifecycle(ctx, method, id, pm)
	case "list_outsourcing_order_items", "listOutsourcingOrderItems":
		return d.handleOutsourcingOrderItem(ctx, method, id, pm)
	default:
		return id, unknownOutsourcingOrderResult(method), nil
	}
}
