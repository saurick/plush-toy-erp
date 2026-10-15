package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleCustomerConfigStartFinishedGoodsDeliveryProcess(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
		return id, res, nil
	}
	if res := d.requireSourceActionReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	createIn, ok := finishedGoodsDeliveryProcessInputFromParams(pm)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
	}
	resolvedCustomerKey, err := runtimeCustomerKey(createIn.CustomerKey)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	createIn.CustomerKey = resolvedCustomerKey
	if res := d.requireCustomerConfigModulesEnabled(ctx, resolvedCustomerKey, "shipments"); res != nil {
		return id, res, nil
	}
	businessRefNo, err := d.shipmentProcessSourceRefNo(ctx, createIn.BusinessRefID)
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
	startedNode, err := d.startOrReplayProcessInstanceFirstNode(
		ctx,
		instance,
		nodes,
		"shipment_finance_approval",
		biz.ProcessNodeTypeApproval,
		admin.ID,
	)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	if refreshedNodes, err := d.processRuntimeUC.ListProcessNodeInstances(ctx, instance.ID); err == nil {
		nodes = refreshedNodes
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"process_instance": processInstanceToMap(instance),
			"started_node":     processNodeInstanceToMap(startedNode),
			"nodes":            processNodeInstancesToMaps(nodes),
			"runtime_boundary": map[string]any{
				"source":                          "active_customer_config",
				"process_key":                     biz.ProcessKeyFinishedGoodsDelivery,
				"started_only":                    true,
				"runtime_loader_start_only":       true,
				"executes_domain_command":         false,
				"writes_quality_fact":             false,
				"writes_shipment_or_finance_fact": false,
				"workflow_task_done_posts_fact":   false,
				"scope":                           "shipment_finance_approval_only",
			},
		}),
	}, nil
}

func (d *jsonrpcDispatcher) handleCustomerConfigExecuteFinishedGoodsDeliveryQualityDecide(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	in, ok := finishedGoodsDeliveryQualityDecisionExecutionFromParams(pm)
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
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"completed_node": processNodeInstanceToMap(completedNode),
			"nodes":          processNodeInstancesToMaps(nodes),
			"runtime_boundary": customerConfigProcessRuntimeBoundary(runtimeRevision, map[string]any{
				"process_key":                     biz.ProcessKeyFinishedGoodsDelivery,
				"command_key":                     biz.ProcessDomainCommandFinishedGoodsQualityDecide,
				"executes_domain_command":         true,
				"writes_quality_fact":             true,
				"writes_shipment_or_finance_fact": false,
				"workflow_task_done_posts_fact":   false,
				"scope":                           "shipment_finished_goods_quality_decide",
			}),
		}),
	}, nil
}

func (d *jsonrpcDispatcher) handleCustomerConfigExecuteFinishedGoodsDeliveryShipmentShip(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	in, ok := finishedGoodsDeliveryShipmentShipExecutionFromParams(pm)
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
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"completed_node": processNodeInstanceToMap(completedNode),
			"nodes":          processNodeInstancesToMaps(nodes),
			"runtime_boundary": customerConfigProcessRuntimeBoundary(runtimeRevision, map[string]any{
				"process_key":                   biz.ProcessKeyFinishedGoodsDelivery,
				"command_key":                   biz.ProcessDomainCommandShipmentShip,
				"executes_domain_command":       true,
				"writes_shipment_fact":          true,
				"writes_inventory_fact":         true,
				"writes_finance_fact":           false,
				"workflow_task_done_posts_fact": false,
				"scope":                         "shipment_execution_domain_command",
			}),
		}),
	}, nil
}

func (d *jsonrpcDispatcher) handleCustomerConfigExecuteFinishedGoodsDeliveryReceivableLead(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	in, ok := finishedGoodsDeliveryReceivableLeadExecutionFromParams(pm)
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
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"completed_node": processNodeInstanceToMap(completedNode),
			"nodes":          processNodeInstancesToMaps(nodes),
			"runtime_boundary": customerConfigProcessRuntimeBoundary(runtimeRevision, map[string]any{
				"process_key":                   biz.ProcessKeyFinishedGoodsDelivery,
				"command_key":                   biz.ProcessDomainCommandFinanceReceivableLead,
				"executes_domain_command":       true,
				"writes_receivable_fact":        true,
				"writes_invoice_fact":           false,
				"writes_finance_fact":           true,
				"workflow_task_done_posts_fact": false,
				"scope":                         "receivable_lead_domain_command",
			}),
		}),
	}, nil
}
