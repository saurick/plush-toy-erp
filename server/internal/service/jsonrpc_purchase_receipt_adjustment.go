package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handlePurchaseReceiptAdjustment(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_purchase_receipt_adjustment_from_receipt":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptAdjustmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "purchase", method); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReceiptAdjustmentFromReceiptCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, in)
		return id, purchaseReceiptAdjustmentResult(ctx, d, item, err), nil
	case "post_purchase_receipt_adjustment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptAdjustmentPost); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.PostPurchaseReceiptAdjustment(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptAdjustmentResult(ctx, d, item, err), nil
	case "cancel_purchase_receipt_adjustment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptAdjustmentCancel); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CancelPostedPurchaseReceiptAdjustment(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptAdjustmentResult(ctx, d, item, err), nil
	case "get_purchase_receipt_adjustment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptAdjustmentRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetPurchaseReceiptAdjustment(ctx, getInt(pm, "id", 0))
		return id, purchaseReceiptAdjustmentResult(ctx, d, item, err), nil
	case "list_purchase_receipt_adjustments":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptAdjustmentRead); res != nil {
			return id, res, nil
		}
		filter, ok := purchaseReceiptAdjustmentFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListPurchaseReceiptAdjustments(ctx, filter)
		if err != nil {
			return id, d.mapPurchaseError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"purchase_receipt_adjustments": purchaseReceiptAdjustmentsToAny(items),
			"total":                        total,
			"limit":                        normalizedLimit(pm),
			"offset":                       normalizedOffset(pm),
		}), nil
	default:
		return id, unknownPurchaseResult(method), nil
	}
}
