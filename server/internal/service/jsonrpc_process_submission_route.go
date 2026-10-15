package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) getProcessSubmissionRoute(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !customerConfigAllowsOnly(pm, "customer_key", "process_key") {
		return invalidParamResult()
	}
	processKey := getString(pm, "process_key")
	var permission, startMethod string
	switch processKey {
	case biz.ProcessKeySalesOrderAcceptance:
		permission, startMethod = biz.PermissionSalesOrderSubmit, "start_sales_order_acceptance_process"
	case biz.ProcessKeyMaterialSupply:
		permission, startMethod = biz.PermissionPurchaseOrderSubmit, "start_material_supply_purchase_order_process"
	case biz.ProcessKeyFinishedGoodsDelivery:
		permission, startMethod = biz.PermissionShipmentCreate, "start_finished_goods_delivery_process"
	default:
		for _, contract := range customerConfigExceptionProcessContracts {
			if contract.processKey == processKey {
				permission, startMethod = contract.startPermission, contract.startMethod
				break
			}
		}
	}
	if permission == "" {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return res
	}
	if res := d.requireSourceActionReadPermissions(ctx, "customer_config", startMethod); res != nil {
		return res
	}
	customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	route, err := d.customerConfigUC.GetProcessSubmissionRoute(ctx, customerKey, processKey)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	return okData(map[string]any{"route": map[string]any{
		"config_revision": route.ConfigRevision, "process_key": route.ProcessKey,
		"node_key": route.NodeKey, "owner_role_key": route.OwnerRoleKey,
		"assignee_display_name": route.AssigneeDisplayName, "approval_key": route.ApprovalKey,
		"condition": map[string]any{"mode": route.Condition.Mode, "amount": route.Condition.Amount, "currency": route.Condition.Currency},
	}})
}
