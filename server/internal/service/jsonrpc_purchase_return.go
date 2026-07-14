package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handlePurchaseReturn(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_purchase_return_from_receipt":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReturnCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReturnFromReceiptCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReturnFromReceipt(ctx, in)
		return id, purchaseReturnResult(ctx, d, item, err), nil
	case "create_purchase_return_from_quality_inspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReturnCreate); res != nil {
			return id, res, nil
		}
		in, ok := purchaseReturnFromQualityInspectionCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreatePurchaseReturnFromQualityInspection(ctx, in)
		return id, purchaseReturnResult(ctx, d, item, err), nil
	case "post_purchase_return":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReturnPost); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.PostPurchaseReturn(ctx, getInt(pm, "id", 0))
		return id, purchaseReturnResult(ctx, d, item, err), nil
	case "cancel_purchase_return":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReturnCancel); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CancelPostedPurchaseReturn(ctx, getInt(pm, "id", 0))
		return id, purchaseReturnResult(ctx, d, item, err), nil
	case "get_purchase_return":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReturnRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetPurchaseReturn(ctx, getInt(pm, "id", 0))
		return id, purchaseReturnResult(ctx, d, item, err), nil
	case "list_purchase_returns":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReturnRead); res != nil {
			return id, res, nil
		}
		filter, ok := purchaseReturnFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListPurchaseReturns(ctx, filter)
		if err != nil {
			return id, d.mapPurchaseError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"purchase_returns": purchaseReturnsToAny(items),
			"total":            total,
			"limit":            normalizedLimit(pm),
			"offset":           normalizedOffset(pm),
		}), nil
	default:
		return id, unknownPurchaseResult(method), nil
	}
}
