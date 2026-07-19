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
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_purchase_receipt_from_purchase_order":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "purchase", method); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptFromPurchaseOrderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders", "purchase_receipts", "quality_inspections", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "add_purchase_receipt_item":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "purchase", method); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptItemCreateFromParams(pm)
		if !ok || in.PurchaseOrderItemID == nil || *in.PurchaseOrderItemID <= 0 || in.IdempotencyKey == "" {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders", "purchase_receipts", "quality_inspections", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.AddPurchaseReceiptItem(ctx, in)
		return id, purchaseReceiptItemResult(ctx, d, item, err), nil
	case "post_purchase_receipt":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptCreate, biz.PermissionWarehouseInboundConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "quality_inspections", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.PostPurchaseReceipt(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "cancel_purchase_receipt":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptCreate, biz.PermissionWarehouseInboundConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "quality_inspections", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CancelPostedPurchaseReceiptWithActor(ctx, getInt(pm, "id", 0), actorID)
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "get_purchase_receipt":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseReceiptRead, biz.PermissionWarehouseInboundRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetPurchaseReceipt(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptResult(ctx, d, item, err), nil
	case "list_purchase_receipts":
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
