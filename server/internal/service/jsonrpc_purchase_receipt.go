package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handlePurchaseReceipt(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_purchase_receipt_draft", "createPurchaseReceiptDraft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReceiptDraft(ctx, in)
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "create_purchase_receipt_with_items", "createPurchaseReceiptWithItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, ok := purchaseReceiptItemsCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReceiptWithItems(ctx, in, items)
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "create_purchase_receipt_from_purchase_order", "createPurchaseReceiptFromPurchaseOrder":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptFromPurchaseOrderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders", "purchase_receipts"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "add_purchase_receipt_item", "addPurchaseReceiptItem":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptItemCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.AddPurchaseReceiptItem(ctx, in)
		return id, purchaseReceiptItemResult(ctx, d, item, err), nil
	case "post_purchase_receipt", "postPurchaseReceipt":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptCreate, biz.PermissionWarehouseInboundConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.PostPurchaseReceipt(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "cancel_purchase_receipt", "cancelPurchaseReceipt":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptCreate, biz.PermissionWarehouseInboundConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CancelPostedPurchaseReceipt(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "get_purchase_receipt", "getPurchaseReceipt":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptRead, biz.PermissionWarehouseInboundRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetPurchaseReceipt(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "list_purchase_receipts", "listPurchaseReceipts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptRead, biz.PermissionWarehouseInboundRead); res != nil {
			return id, res, nil
		}
		filter, ok := purchaseReceiptFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListPurchaseReceipts(ctx, filter)
		if err != nil {
			return id, d.mapPurchaseError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"purchase_receipts": purchaseReceiptsToAny(items),
			"total":             total,
			"limit":             normalizedLimit(pm),
			"offset":            normalizedOffset(pm),
		}), nil
	default:
		return id, unknownPurchaseResult(method), nil
	}
}
