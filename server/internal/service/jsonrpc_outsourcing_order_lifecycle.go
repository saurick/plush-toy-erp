package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOutsourcingOrderLifecycle(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "submit_outsourcing_order":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionOutsourcingOrderSubmit, biz.SourceOrderActionSubmit, d.outsourcingOrderUC.SubmitOutsourcingOrderWithAction)
	case "confirm_outsourcing_order":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionOutsourcingOrderConfirm, biz.SourceOrderActionConfirm, d.outsourcingOrderUC.ConfirmOutsourcingOrderWithAction)
	case "close_outsourcing_order":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionOutsourcingOrderClose, biz.SourceOrderActionClose, d.outsourcingOrderUC.CloseOutsourcingOrderWithAction)
	case "cancel_outsourcing_order":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionOutsourcingOrderCancel, biz.SourceOrderActionCancel, d.outsourcingOrderUC.CancelOutsourcingOrderWithAction)
	default:
		return id, unknownOutsourcingOrderResult(method), nil
	}
}

func (d *jsonrpcDispatcher) handleOutsourcingOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
	permission string,
	actionKey string,
	action func(context.Context, *biz.SourceOrderLifecycleAction) (*biz.OutsourcingOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
		return id, res, nil
	}
	in, ok := sourceOrderLifecycleActionFromParams(pm, actionKey, actorID)
	if !ok {
		return id, invalidSourceOrderLifecycleParamsResult(), nil
	}
	item, err := action(ctx, in)
	return id, outsourcingOrderMutationResult(ctx, d, item, err), nil
}
