package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handlePurchaseOrderItem(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_purchase_order_items":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.purchaseOrderUC.ListPurchaseOrderItems(ctx, biz.PurchaseOrderItemFilter{
			PurchaseOrderID: getInt(pm, "purchase_order_id", 0),
			LineStatus:      getString(pm, "line_status"),
			Limit:           getInt(pm, "limit", 50),
			Offset:          getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapPurchaseOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"purchase_order_items": purchaseOrderItemsToAny(items),
			"total":                total,
			"limit":                normalizedLimit(pm),
			"offset":               normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownPurchaseOrderResult(method), nil
	}
}
