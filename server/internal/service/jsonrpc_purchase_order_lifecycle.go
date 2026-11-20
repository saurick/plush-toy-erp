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
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "close_purchase_order":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionPurchaseOrderClose, biz.SourceOrderActionClose, d.purchaseOrderUC.ClosePurchaseOrderWithAction)
	case "cancel_purchase_order":
		return d.handlePurchaseOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionPurchaseOrderCancel, biz.SourceOrderActionCancel, d.purchaseOrderUC.CancelPurchaseOrderWithAction)
	default:
		return id, unknownPurchaseOrderResult(method), nil
	}
}

func (d *jsonrpcDispatcher) handlePurchaseOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
	permission string,
	actionKey string,
	action func(context.Context, *biz.SourceOrderLifecycleAction) (*biz.PurchaseOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_orders"); res != nil {
		return id, res, nil
	}
	in, ok := sourceOrderLifecycleActionFromParams(pm, actionKey, actorID)
	if !ok {
		return id, invalidSourceOrderLifecycleParamsResult(), nil
	}
	item, err := action(ctx, in)
	return id, purchaseOrderMutationResult(ctx, d, item, err), nil
}
