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
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "submit_outsourcing_order", "submitOutsourcingOrder":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, biz.PermissionOutsourcingOrderUpdate, d.outsourcingOrderUC.SubmitOutsourcingOrder)
	case "confirm_outsourcing_order", "confirmOutsourcingOrder":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, biz.PermissionOutsourcingOrderConfirm, d.outsourcingOrderUC.ConfirmOutsourcingOrder)
	case "close_outsourcing_order", "closeOutsourcingOrder":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, biz.PermissionOutsourcingOrderUpdate, d.outsourcingOrderUC.CloseOutsourcingOrder)
	case "cancel_outsourcing_order", "cancelOutsourcingOrder":
		return d.handleOutsourcingOrderLifecycleAction(ctx, id, pm, biz.PermissionOutsourcingOrderUpdate, d.outsourcingOrderUC.CancelOutsourcingOrder)
	default:
		return id, unknownOutsourcingOrderResult(method), nil
	}
}

func (d *jsonrpcDispatcher) handleOutsourcingOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	permission string,
	action func(context.Context, int) (*biz.OutsourcingOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	item, err := action(ctx, getInt(pm, "id", 0))
	return id, outsourcingOrderMutationResult(ctx, d, item, err), nil
}
