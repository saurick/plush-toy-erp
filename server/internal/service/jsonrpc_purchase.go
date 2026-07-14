package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handlePurchase(
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
	if d.inventoryUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_purchase_receipt_draft",
		"create_purchase_receipt_with_items",
		"create_purchase_receipt_from_purchase_order",
		"add_purchase_receipt_item",
		"post_purchase_receipt",
		"cancel_purchase_receipt",
		"get_purchase_receipt",
		"list_purchase_receipts":
		return d.handlePurchaseReceipt(ctx, method, id, pm, claims.UserID)
	default:
		return id, unknownPurchaseResult(method), nil
	}
}
