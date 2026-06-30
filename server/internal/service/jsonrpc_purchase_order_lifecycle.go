package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handlePurchaseOrderLifecycle(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "submit_purchase_order", "submitPurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderUpdate, d.purchaseOrderUC.SubmitPurchaseOrder)
	case "approve_purchase_order", "approvePurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderApprove, d.purchaseOrderUC.ApprovePurchaseOrder)
	case "close_purchase_order", "closePurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderUpdate, d.purchaseOrderUC.ClosePurchaseOrder)
	case "cancel_purchase_order", "cancelPurchaseOrder":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, biz.PermissionPurchaseOrderUpdate, d.purchaseOrderUC.CancelPurchaseOrder)
	default:
		return id, unknownPurchaseOrderResult(method), nil
	}
}

func (d *jsonrpcDispatcher) handlePurchaseOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	permission string,
	action func(context.Context, int) (*biz.PurchaseOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders"); res != nil {
		return id, res, nil
	}
	item, err := action(ctx, getInt(pm, "id", 0))
	return id, purchaseOrderMutationResult(ctx, d, item, err), nil
}
