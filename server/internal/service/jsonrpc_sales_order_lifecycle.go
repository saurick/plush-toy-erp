package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleSalesOrderLifecycle(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "close_sales_order":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionSalesOrderClose, biz.SourceOrderActionClose, d.salesOrderUC.CloseSalesOrderWithAction)
	case "cancel_sales_order":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, actorID, biz.PermissionSalesOrderCancel, biz.SourceOrderActionCancel, d.salesOrderUC.CancelSalesOrderWithAction)
	default:
		return id, unknownSalesOrderResult(method), nil
	}
}

func (d *jsonrpcDispatcher) handleSalesOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
	permission string,
	actionKey string,
	action func(context.Context, *biz.SourceOrderLifecycleAction) (*biz.SalesOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders"); res != nil {
		return id, res, nil
	}
	in, ok := sourceOrderLifecycleActionFromParams(pm, actionKey, actorID)
	if !ok {
		return id, invalidSourceOrderLifecycleParamsResult(), nil
	}
	item, err := action(ctx, in)
	return id, salesOrderMutationResult(ctx, d, item, err), nil
}
