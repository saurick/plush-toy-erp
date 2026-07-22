package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handlePurchaseRejectionDisposition(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := biz.PermissionPurchaseReturnRead
	switch method {
	case "create_purchase_rejection_disposition":
		permission = biz.PermissionPurchaseReturnCreate
	case "post_purchase_rejection_disposition":
		permission = biz.PermissionPurchaseReturnPost
	case "cancel_purchase_rejection_disposition":
		permission = biz.PermissionPurchaseReturnCancel
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", "purchase_receipts", "quality_inspections"); res != nil {
		return id, res, nil
	}
	switch method {
	case "create_purchase_rejection_disposition":
		if res := d.requireSourceActionReadPermissions(ctx, "purchase", method); res != nil {
			return id, res, nil
		}
		if !purchaseRejectionAllowsOnly(pm, "disposition_no", "quality_inspection_id", "disposition_type", "quantity", "reason", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "quantity")
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: getString(pm, "disposition_no"), QualityInspectionID: getInt(pm, "quality_inspection_id", 0), DispositionType: getString(pm, "disposition_type"), Quantity: quantity, Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key"), CreatedBy: actorID})
		return id, purchaseRejectionResult(ctx, d, item, err), nil
	case "post_purchase_rejection_disposition":
		if !purchaseRejectionAllowsOnly(pm, "id", "expected_version") {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID})
		return id, purchaseRejectionResult(ctx, d, item, err), nil
	case "cancel_purchase_rejection_disposition":
		if !purchaseRejectionAllowsOnly(pm, "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.CancelPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID, Reason: getString(pm, "reason")})
		return id, purchaseRejectionResult(ctx, d, item, err), nil
	case "get_purchase_rejection_disposition":
		if !purchaseRejectionAllowsOnly(pm, "id") {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.GetPurchaseRejectionDisposition(ctx, getInt(pm, "id", 0))
		return id, purchaseRejectionResult(ctx, d, item, err), nil
	case "list_purchase_rejection_dispositions":
		if !purchaseRejectionAllowsOnly(pm, "quality_inspection_id", "purchase_receipt_id", "status", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListPurchaseRejectionDispositions(ctx, biz.PurchaseRejectionDispositionFilter{QualityInspectionID: getInt(pm, "quality_inspection_id", 0), PurchaseReceiptID: getInt(pm, "purchase_receipt_id", 0), Status: getString(pm, "status"), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)})
		if err != nil {
			return id, d.mapPurchaseError(ctx, err), nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, purchaseRejectionToAny(item))
		}
		return id, okData(map[string]any{"purchase_rejection_dispositions": out, "total": total}), nil
	default:
		return id, unknownPurchaseResult(method), nil
	}
}
func purchaseRejectionAllowsOnly(pm map[string]any, keys ...string) bool {
	allowed := map[string]struct{}{}
	for _, key := range keys {
		allowed[key] = struct{}{}
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
}
func purchaseRejectionResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseRejectionDisposition, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseError(ctx, err)
	}
	return okData(map[string]any{"purchase_rejection_disposition": purchaseRejectionToAny(item)})
}
func purchaseRejectionToAny(item *biz.PurchaseRejectionDisposition) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "disposition_no": item.DispositionNo, "quality_inspection_id": item.QualityInspectionID, "purchase_receipt_id": item.PurchaseReceiptID, "purchase_receipt_item_id": item.PurchaseReceiptItemID, "replacement_receipt_id": optionalIntToAny(item.ReplacementReceiptID), "disposition_type": item.DispositionType, "status": item.Status, "quantity": item.Quantity.String(), "supplier_id": optionalIntToAny(item.SupplierID), "supplier_name": item.SupplierName, "reason": item.Reason, "version": item.Version, "posted_at": optionalUnix(item.PostedAt), "posted_by": optionalIntToAny(item.PostedBy), "cancelled_at": optionalUnix(item.CancelledAt), "cancelled_by": optionalIntToAny(item.CancelledBy), "cancel_reason": optionalStringToAny(item.CancelReason)}
}
