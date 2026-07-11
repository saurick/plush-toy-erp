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
	case "submit_sales_order", "submitSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderSubmit, d.salesOrderUC.SubmitSalesOrder)
	case "activate_sales_order", "activateSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderActivate, d.salesOrderUC.ActivateSalesOrder)
	case "close_sales_order", "closeSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderClose, d.salesOrderUC.CloseSalesOrder)
	case "cancel_sales_order", "cancelSalesOrder":
		return d.handleSalesOrderLifecycleAction(ctx, id, pm, biz.PermissionSalesOrderCancel, func(ctx context.Context, id int) (*biz.SalesOrder, error) {
			return d.salesOrderUC.CancelSalesOrderWithActor(ctx, id, actorID)
		})
	default:
		return id, unknownSalesOrderResult(method), nil
	}
}

func (d *jsonrpcDispatcher) handleSalesOrderLifecycleAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	permission string,
	action func(context.Context, int) (*biz.SalesOrder, error),
) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders"); res != nil {
		return id, res, nil
	}
	item, err := action(ctx, getInt(pm, "id", 0))
	return id, salesOrderMutationResult(ctx, d, item, err), nil
}
