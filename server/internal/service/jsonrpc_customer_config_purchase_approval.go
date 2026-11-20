package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleCustomerConfigStartMaterialSupplyPurchaseOrderProcess(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseOrderSubmit); res != nil {
		return id, res, nil
	}
	if res := d.requireSourceActionReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	createIn, ok := materialSupplyPurchaseOrderProcessInputFromParams(pm)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
	}
	resolvedCustomerKey, err := runtimeCustomerKey(createIn.CustomerKey)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	createIn.CustomerKey = resolvedCustomerKey
	if res := d.requireCustomerConfigModulesEnabled(ctx, resolvedCustomerKey, "purchase_orders"); res != nil {
		return id, res, nil
	}
	businessRefNo, err := d.purchaseOrderProcessSourceRefNo(ctx, createIn.BusinessRefID)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	createIn.BusinessRefNo = businessRefNo
	processCreate, err := d.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, createIn)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	instance, nodes, err := d.processRuntimeUC.CreateProcessInstanceFromSource(ctx, processCreate, admin.ID)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	startedNode, err := d.startOrReplayProcessInstanceFirstNode(ctx, instance, nodes, "submit_purchase_order", biz.ProcessNodeTypeDomainCommand, admin.ID)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	if refreshed, err := d.processRuntimeUC.GetProcessInstance(ctx, instance.ID); err == nil {
		instance = refreshed
	}
	if refreshedNodes, err := d.processRuntimeUC.ListProcessNodeInstances(ctx, instance.ID); err == nil {
		nodes = refreshedNodes
	}
	return id, &v1.JsonrpcResult{
		Code: errcode.OK.Code, Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"process_instance": processInstanceToMap(instance), "started_node": processNodeInstanceToMap(startedNode), "nodes": processNodeInstancesToMaps(nodes),
			"runtime_boundary": map[string]any{
				"source": "active_customer_config", "process_key": biz.ProcessKeyMaterialSupply,
				"started_only": true, "executes_domain_command": false,
				"writes_purchase_receipt_source_doc": false, "writes_quality_or_inventory_fact": false,
				"writes_shipment_or_finance_fact": false, "workflow_task_done_posts_fact": false,
				"scope": "purchase_order_approval_only",
			},
		}),
	}, nil
}

func (d *jsonrpcDispatcher) handleCustomerConfigExecuteMaterialSupplyPurchaseOrderSubmit(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	in, ok := materialSupplyPurchaseOrderSubmitExecutionFromParams(pm)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
	}
	runtimeRevision, res := d.requireCustomerConfigProcessDomainCommandAllowed(ctx, getString(pm, "customer_key"), in, admin)
	if res != nil {
		return id, res, nil
	}
	completedNode, err := d.processRuntimeUC.ExecuteDomainCommandNode(ctx, in, admin.ID)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	nodes, err := d.processRuntimeUC.ListProcessNodeInstances(ctx, in.ProcessInstanceID)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	return id, &v1.JsonrpcResult{
		Code: errcode.OK.Code, Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"completed_node": processNodeInstanceToMap(completedNode), "nodes": processNodeInstancesToMaps(nodes),
			"runtime_boundary": customerConfigProcessRuntimeBoundary(runtimeRevision, map[string]any{
				"process_key": biz.ProcessKeyMaterialSupply, "command_key": biz.ProcessDomainCommandPurchaseOrderSubmit,
				"executes_domain_command": true, "writes_purchase_order_source_document": true,
				"writes_purchase_receipt_source_doc": false, "writes_quality_or_inventory_fact": false,
				"writes_shipment_or_finance_fact": false, "creates_next_linked_task": true,
			}),
		}),
	}, nil
}
