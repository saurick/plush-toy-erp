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
	case "add_purchase_order_item", "addPurchaseOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders"); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderItemMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.purchaseOrderUC.AddPurchaseOrderItem(ctx, in)
		return id, purchaseOrderItemMutationResult(ctx, d, item, err), nil
	case "update_purchase_order_item", "updatePurchaseOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders"); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderItemMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.purchaseOrderUC.UpdatePurchaseOrderItem(ctx, getInt(pm, "id", 0), in)
		return id, purchaseOrderItemMutationResult(ctx, d, item, err), nil
	case "remove_purchase_order_item", "removePurchaseOrderItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders"); res != nil {
			return id, res, nil
		}
		item, err := d.purchaseOrderUC.RemovePurchaseOrderItem(ctx, getInt(pm, "id", 0))
		return id, purchaseOrderItemMutationResult(ctx, d, item, err), nil
	case "list_purchase_order_items", "listPurchaseOrderItems":
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
