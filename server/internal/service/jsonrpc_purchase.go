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
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.inventoryUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_purchase_receipt_draft", "createPurchaseReceiptDraft",
		"create_purchase_receipt_with_items", "createPurchaseReceiptWithItems",
		"create_purchase_receipt_from_purchase_order", "createPurchaseReceiptFromPurchaseOrder",
		"add_purchase_receipt_item", "addPurchaseReceiptItem",
		"post_purchase_receipt", "postPurchaseReceipt",
		"cancel_purchase_receipt", "cancelPurchaseReceipt",
		"get_purchase_receipt", "getPurchaseReceipt",
		"list_purchase_receipts", "listPurchaseReceipts":
		return d.handlePurchaseReceipt(ctx, method, id, pm)
	default:
		return id, unknownPurchaseResult(method), nil
	}
}
