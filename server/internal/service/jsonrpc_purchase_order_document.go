package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handlePurchaseOrderDocument(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_purchase_order", "createPurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.purchaseOrderUC.CreatePurchaseOrder(ctx, in)
		return id, purchaseOrderMutationResult(ctx, d, item, err), nil
	case "update_purchase_order", "updatePurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.purchaseOrderUC.UpdatePurchaseOrder(ctx, getInt(pm, "id", 0), in)
		return id, purchaseOrderMutationResult(ctx, d, item, err), nil
	case "save_purchase_order_with_items", "savePurchaseOrderWithItems":
		orderID := getInt(pm, "id", 0)
		orderPermission := biz.PermissionPurchaseOrderCreate
		if orderID > 0 {
			orderPermission = biz.PermissionPurchaseOrderUpdate
		}
		if res := d.RequireAdminPermission(ctx, orderPermission); res != nil {
			return id, res, nil
		}
		in, ok := purchaseOrderMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, ok := purchaseOrderItemSaveMutationsFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		result, err := d.purchaseOrderUC.SavePurchaseOrderWithItems(ctx, orderID, in, items)
		return id, purchaseOrderWithItemsMutationResult(ctx, d, result, err), nil
	case "get_purchase_order", "getPurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
			return id, res, nil
		}
		item, err := d.purchaseOrderUC.GetPurchaseOrder(ctx, getInt(pm, "id", 0))
		return id, purchaseOrderMutationResult(ctx, d, item, err), nil
	case "list_purchase_orders", "listPurchaseOrders":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderRead); res != nil {
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
		items, total, err := d.purchaseOrderUC.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{
			Keyword:         getString(pm, "keyword"),
			SupplierID:      getInt(pm, "supplier_id", 0),
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
			return id, d.mapPurchaseOrderError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"purchase_orders": purchaseOrdersToAny(items),
			"total":           total,
			"limit":           normalizedLimit(pm),
			"offset":          normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownPurchaseOrderResult(method), nil
	}
}
