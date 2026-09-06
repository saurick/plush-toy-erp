package service

import (
	"context"
	"errors"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
)

func (d *jsonrpcDispatcher) handleCustomerConfigGetSalesOrderAcceptanceProcess(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.requireSourceActionReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	if !customerConfigAllowsOnly(pm, "customer_key", "sales_order_id") {
		return id, invalidParamResult(), nil
	}
	salesOrderID := getInt(pm, "sales_order_id", 0)
	if salesOrderID <= 0 {
		return id, invalidParamResult(), nil
	}
	businessRefNo, err := d.salesOrderProcessSourceRefNo(ctx, salesOrderID)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	resolvedCustomerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	instance, nodes, err := d.processRuntimeUC.GetProcessInstanceByBusinessRef(
		ctx,
		biz.ProcessKeySalesOrderAcceptance,
		"sales_order",
		salesOrderID,
	)
	if errors.Is(err, biz.ErrProcessInstanceNotFound) {
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"process_context": nil,
				"source_readback": map[string]any{
					"type": "sales_order",
					"id":   salesOrderID,
					"no":   *businessRefNo,
				},
			}),
		}, nil
	}
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	if !processInstanceCustomerKeyMatches(instance, resolvedCustomerKey) ||
		instance.BusinessRefNo == nil || strings.TrimSpace(*instance.BusinessRefNo) != *businessRefNo {
		return id, d.mapCustomerConfigError(ctx, biz.ErrForbidden), nil
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"process_context": exceptionProcessContextToMap(instance, nodes),
			"source_readback": map[string]any{
				"type": "sales_order",
				"id":   salesOrderID,
				"no":   *businessRefNo,
			},
			"runtime_boundary": customerConfigProcessRuntimeBoundary(instance.ConfigRevision, map[string]any{
				"process_key":                   biz.ProcessKeySalesOrderAcceptance,
				"read_only":                     true,
				"executes_domain_command":       false,
				"workflow_task_done_posts_fact": false,
			}),
		}),
	}, nil
}

func (d *jsonrpcDispatcher) handleCustomerConfigStartSalesOrderAcceptanceProcess(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderSubmit); res != nil {
		return id, res, nil
	}
	if res := d.requireSourceActionReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	createIn, ok := salesOrderAcceptanceProcessInputFromParams(pm)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
	}
	resolvedCustomerKey, err := runtimeCustomerKey(createIn.CustomerKey)
	if err != nil {
		return id, d.mapCustomerConfigError(ctx, err), nil
	}
	createIn.CustomerKey = resolvedCustomerKey
	if res := d.requireCustomerConfigModulesEnabled(ctx, resolvedCustomerKey, "sales_orders"); res != nil {
		return id, res, nil
	}
	businessRefNo, err := d.salesOrderProcessSourceRefNo(ctx, createIn.BusinessRefID)
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
		"submit_sales_order",
		biz.ProcessNodeTypeDomainCommand,
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
				"source":                           "active_customer_config",
				"process_key":                      biz.ProcessKeySalesOrderAcceptance,
				"started_only":                     true,
				"executes_domain_command":          false,
				"writes_inventory_or_quality_fact": false,
				"writes_shipment_or_finance_fact":  false,
			},
		}),
	}, nil
}

func (d *jsonrpcDispatcher) handleCustomerConfigExecuteSalesOrderAcceptanceSubmit(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	in, ok := salesOrderAcceptanceSubmitExecutionFromParams(pm)
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
				"process_key":                        biz.ProcessKeySalesOrderAcceptance,
				"command_key":                        biz.ProcessDomainCommandSalesOrderSubmit,
				"executes_domain_command":            true,
				"writes_sales_order_source_document": true,
				"writes_inventory_or_quality_fact":   false,
				"writes_shipment_or_finance_fact":    false,
				"creates_next_linked_task":           true,
			}),
		}),
	}, nil
}
