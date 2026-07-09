package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleCustomerConfig(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}

	switch method {
	case "validate_customer_config":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); res != nil {
			return id, res, nil
		}
		in, ok := customerConfigPublishInputFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		result, err := d.customerConfigUC.ValidateCustomerConfig(ctx, in)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"validation": customerConfigValidationToMap(result)}),
		}, nil

	case "publish_customer_config":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigPublish); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		in, ok := customerConfigPublishInputFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		revision, err := d.customerConfigUC.PublishCustomerConfig(ctx, in, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"revision": customerConfigRevisionToMap(revision)}),
		}, nil

	case "activate_customer_config":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigActivate); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		customerKey := getString(pm, "customer_key")
		revision := getString(pm, "revision")
		item, err := d.customerConfigUC.ActivateCustomerConfig(ctx, customerKey, revision, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"revision": customerConfigRevisionToMap(item)}),
		}, nil

	case "rollback_customer_config":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRollback); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		customerKey := getString(pm, "customer_key")
		targetRevision := getString(pm, "target_revision")
		if strings.TrimSpace(targetRevision) == "" {
			targetRevision = getString(pm, "revision")
		}
		item, err := d.customerConfigUC.RollbackCustomerConfig(ctx, customerKey, targetRevision, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"revision": customerConfigRevisionToMap(item)}),
		}, nil

	case "get_effective_session":
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		session, err := d.customerConfigUC.GetEffectiveSession(ctx, getString(pm, "customer_key"), admin)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"session": effectiveSessionToMap(session)}),
		}, nil

	case "explain_module_status":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); res != nil {
			return id, res, nil
		}
		status, err := d.customerConfigUC.ExplainModuleStatus(ctx, getString(pm, "customer_key"), getString(pm, "module_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"module_status": customerModuleStatusExplanationToMap(status)}),
		}, nil

	case "explain_process_definition":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); res != nil {
			return id, res, nil
		}
		definition, err := d.customerConfigUC.ExplainProcessDefinition(ctx, getString(pm, "customer_key"), getString(pm, "process_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"process_definition": customerProcessDefinitionExplanationToMap(definition)}),
		}, nil

	case "start_sales_order_acceptance_process":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderSubmit); res != nil {
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
		processCreate, err := d.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, createIn)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		instance, nodes, err := d.processRuntimeUC.CreateProcessInstance(ctx, processCreate, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		startedNode, err := d.processRuntimeUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
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

	case "execute_sales_order_acceptance_submit":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSalesOrderSubmit); res != nil {
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
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                             "active_customer_config",
					"process_key":                        biz.ProcessKeySalesOrderAcceptance,
					"command_key":                        biz.ProcessDomainCommandSalesOrderSubmit,
					"executes_domain_command":            true,
					"writes_sales_order_source_document": true,
					"writes_inventory_or_quality_fact":   false,
					"writes_shipment_or_finance_fact":    false,
					"creates_next_linked_task":           true,
				},
			}),
		}, nil

	case "start_material_supply_process":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		createIn, ok := materialSupplyProcessInputFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		processCreate, err := d.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, createIn)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		instance, nodes, err := d.processRuntimeUC.CreateProcessInstance(ctx, processCreate, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		startedNode, err := d.processRuntimeUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
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
					"source":                             "active_customer_config",
					"process_key":                        biz.ProcessKeyMaterialSupply,
					"started_only":                       true,
					"executes_domain_command":            false,
					"writes_purchase_receipt_source_doc": false,
					"writes_quality_or_inventory_fact":   false,
					"writes_shipment_or_finance_fact":    false,
					"workflow_task_done_posts_fact":      false,
					"scope":                              "existing_purchase_receipt_to_quality_and_inbound",
				},
			}),
		}, nil

	case "start_material_supply_purchase_order_process":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
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
		processCreate, err := d.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, createIn)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		instance, nodes, err := d.processRuntimeUC.CreateProcessInstance(ctx, processCreate, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		startedNode, err := d.processRuntimeUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
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
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"process_instance": processInstanceToMap(instance),
				"started_node":     processNodeInstanceToMap(startedNode),
				"nodes":            processNodeInstancesToMaps(nodes),
				"runtime_boundary": map[string]any{
					"source":                             "active_customer_config",
					"process_key":                        biz.ProcessKeyMaterialSupply,
					"started_only":                       true,
					"executes_domain_command":            false,
					"writes_purchase_receipt_source_doc": false,
					"writes_quality_or_inventory_fact":   false,
					"writes_shipment_or_finance_fact":    false,
					"workflow_task_done_posts_fact":      false,
					"scope":                              "purchase_order_to_purchase_receipt_quality_inbound",
				},
			}),
		}, nil

	case "start_finished_goods_delivery_process":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
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
		processCreate, err := d.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, createIn)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		instance, nodes, err := d.processRuntimeUC.CreateProcessInstance(ctx, processCreate, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		startedNode, err := d.processRuntimeUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
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
					"scope":                           "shipment_to_quality_finance_ship_receivable",
				},
			}),
		}, nil

	case "execute_finished_goods_delivery_quality_decide":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
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
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                          "active_customer_config",
					"process_key":                     biz.ProcessKeyFinishedGoodsDelivery,
					"command_key":                     biz.ProcessDomainCommandFinishedGoodsQualityDecide,
					"executes_domain_command":         true,
					"writes_quality_fact":             true,
					"writes_shipment_or_finance_fact": false,
					"workflow_task_done_posts_fact":   false,
					"scope":                           "shipment_finished_goods_quality_decide",
				},
			}),
		}, nil

	case "execute_finished_goods_delivery_finance_release":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinanceReceivableConfirm); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		in, ok := finishedGoodsDeliveryFinanceReleaseExecutionFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                            "active_customer_config",
					"process_key":                       biz.ProcessKeyFinishedGoodsDelivery,
					"command_key":                       biz.ProcessDomainCommandShipmentFinanceRelease,
					"executes_domain_command":           true,
					"writes_finance_fact":               false,
					"writes_shipment_or_inventory_fact": false,
					"workflow_task_done_posts_fact":     false,
					"scope":                             "shipment_finance_release_domain_command",
				},
			}),
		}, nil

	case "execute_finished_goods_delivery_shipment_ship":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentShip); res != nil {
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
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                        "active_customer_config",
					"process_key":                   biz.ProcessKeyFinishedGoodsDelivery,
					"command_key":                   biz.ProcessDomainCommandShipmentShip,
					"executes_domain_command":       true,
					"writes_shipment_fact":          true,
					"writes_inventory_fact":         true,
					"writes_finance_fact":           false,
					"workflow_task_done_posts_fact": false,
					"scope":                         "shipment_execution_domain_command",
				},
			}),
		}, nil

	case "execute_finished_goods_delivery_receivable_lead":
		if res := d.RequireAdminPermission(ctx, biz.PermissionFinanceReceivableConfirm); res != nil {
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
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                        "active_customer_config",
					"process_key":                   biz.ProcessKeyFinishedGoodsDelivery,
					"command_key":                   biz.ProcessDomainCommandFinanceReceivableLead,
					"executes_domain_command":       true,
					"writes_receivable_fact":        true,
					"writes_invoice_fact":           false,
					"writes_finance_fact":           true,
					"workflow_task_done_posts_fact": false,
					"scope":                         "receivable_lead_domain_command",
				},
			}),
		}, nil

	case "execute_material_supply_purchase_receipt_create":
		if res := d.RequireAdminPermission(ctx, biz.PermissionPurchaseReceiptCreate); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		in, ok := materialSupplyPurchaseReceiptCreateExecutionFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
			return id, res, nil
		}
		completedNode, err := d.processRuntimeUC.ExecuteDomainCommandNode(ctx, in, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		instance, err := d.processRuntimeUC.GetProcessInstance(ctx, in.ProcessInstanceID)
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
				"process_instance": processInstanceToMap(instance),
				"completed_node":   processNodeInstanceToMap(completedNode),
				"nodes":            processNodeInstancesToMaps(nodes),
				"runtime_boundary": map[string]any{
					"source":                             "active_customer_config",
					"process_key":                        biz.ProcessKeyMaterialSupply,
					"command_key":                        biz.ProcessDomainCommandPurchaseReceiptCreate,
					"executes_domain_command":            true,
					"writes_purchase_receipt_source_doc": true,
					"writes_quality_decision":            false,
					"writes_inventory_fact":              false,
					"writes_shipment_or_finance_fact":    false,
					"workflow_task_done_posts_fact":      false,
					"linked_business_ref_source":         "process_runtime_result",
				},
			}),
		}, nil

	case "execute_material_supply_quality_decide":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		in, ok := materialSupplyQualityDecisionExecutionFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                             "active_customer_config",
					"process_key":                        biz.ProcessKeyMaterialSupply,
					"command_key":                        biz.ProcessDomainCommandQualityInspectionDecide,
					"executes_domain_command":            true,
					"writes_purchase_receipt_source_doc": false,
					"writes_quality_decision":            true,
					"writes_inventory_fact":              false,
					"writes_shipment_or_finance_fact":    false,
					"workflow_task_done_posts_fact":      false,
				},
			}),
		}, nil

	case "execute_material_supply_post_inbound":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseInboundConfirm); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		in, ok := materialSupplyPostInboundExecutionFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := d.requireCustomerConfigDomainCommandModulesEnabled(ctx, getString(pm, "customer_key"), in); res != nil {
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
				"runtime_boundary": map[string]any{
					"source":                             "active_customer_config",
					"process_key":                        biz.ProcessKeyMaterialSupply,
					"command_key":                        biz.ProcessDomainCommandInventoryPostInbound,
					"executes_domain_command":            true,
					"writes_purchase_receipt_source_doc": false,
					"writes_quality_decision":            false,
					"writes_inventory_fact":              true,
					"writes_shipment_or_finance_fact":    false,
					"workflow_task_done_posts_fact":      false,
				},
			}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("unknown customer_config method: %s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) requireCustomerConfigDomainCommandModulesEnabled(ctx context.Context, customerKey string, in *biz.ProcessDomainCommandExecution) *v1.JsonrpcResult {
	if in == nil {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	}
	if err := d.customerConfigUC.EnsureProcessDomainCommandModulesEnabled(ctx, customerKey, in.CommandKey); err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	return nil
}

func (d *jsonrpcDispatcher) requireCustomerConfigModulesEnabled(ctx context.Context, customerKey string, moduleKeys ...string) *v1.JsonrpcResult {
	if d == nil || d.customerConfigUC == nil {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	}
	if err := d.customerConfigUC.EnsureModuleKeysEnabled(ctx, customerKey, moduleKeys...); err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	return nil
}

func (d *jsonrpcDispatcher) mapCustomerConfigError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[customer_config] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrForbidden), errors.Is(err, biz.ErrNoPermission):
		l.Warnf("[customer_config] forbidden err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	case errors.Is(err, biz.ErrCustomerConfigNotFound):
		l.Warnf("[customer_config] revision not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "客户配置版本不存在"}
	case errors.Is(err, biz.ErrCustomerConfigActiveRevision):
		l.Warnf("[customer_config] active revision overwrite rejected err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "已激活客户配置版本不能被覆盖发布"}
	case errors.Is(err, biz.ErrProcessInstanceExists):
		l.Warnf("[customer_config] process instance exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "流程实例已存在"}
	case errors.Is(err, biz.ErrProcessInstanceNotFound), errors.Is(err, biz.ErrProcessNodeInstanceNotFound):
		l.Warnf("[customer_config] process runtime target not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "流程运行时对象不存在"}
	case errors.Is(err, biz.ErrProcessInstanceSettled), errors.Is(err, biz.ErrProcessNodeInstanceConflict), errors.Is(err, biz.ErrProcessNodeInstanceSettled), errors.Is(err, biz.ErrProcessNodeInstanceNotActive):
		l.Warnf("[customer_config] process runtime state conflict err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "流程运行时状态冲突"}
	case errors.Is(err, biz.ErrProcessDomainCommandHandlerNotFound):
		l.Warnf("[customer_config] process domain command handler missing err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "流程领域命令处理器不存在"}
	case errors.Is(err, biz.ErrSalesOrderNotFound):
		l.Warnf("[customer_config] sales order not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "销售订单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptNotFound):
		l.Warnf("[customer_config] purchase receipt not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库单不存在"}
	case errors.Is(err, biz.ErrQualityInspectionNotFound):
		l.Warnf("[customer_config] quality inspection not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "质检单不存在"}
	case errors.Is(err, biz.ErrShipmentNotFound), errors.Is(err, biz.ErrShipmentItemNotFound):
		l.Warnf("[customer_config] shipment not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "出货单不存在"}
	default:
		l.Errorf("[customer_config] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func salesOrderAcceptanceProcessInputFromParams(pm map[string]any) (biz.ProcessInstanceFromCustomerConfigInput, bool) {
	salesOrderID := getInt(pm, "sales_order_id", 0)
	if salesOrderID <= 0 {
		salesOrderID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if salesOrderID <= 0 || idempotencyKey == "" {
		return biz.ProcessInstanceFromCustomerConfigInput{}, false
	}
	businessRefNo := optionalRPCStringPointer(getString(pm, "business_ref_no"))
	if businessRefNo == nil {
		businessRefNo = optionalRPCStringPointer(getString(pm, "source_no"))
	}
	return biz.ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     getString(pm, "customer_key"),
		ProcessKey:      biz.ProcessKeySalesOrderAcceptance,
		ProcessVersion:  getString(pm, "process_version"),
		BusinessRefType: "sales_order",
		BusinessRefID:   salesOrderID,
		BusinessRefNo:   businessRefNo,
		CorrelationKey:  optionalRPCStringPointer(getString(pm, "correlation_key")),
		IdempotencyKey:  idempotencyKey,
	}, true
}

func salesOrderAcceptanceSubmitExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	salesOrderID := getInt(pm, "sales_order_id", 0)
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || salesOrderID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandSalesOrderSubmit,
		IdempotencyKey:        idempotencyKey,
		Payload: map[string]any{
			"sales_order_id": salesOrderID,
		},
	}, true
}

func materialSupplyProcessInputFromParams(pm map[string]any) (biz.ProcessInstanceFromCustomerConfigInput, bool) {
	purchaseReceiptID := getInt(pm, "purchase_receipt_id", 0)
	if purchaseReceiptID <= 0 {
		purchaseReceiptID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if purchaseReceiptID <= 0 || idempotencyKey == "" {
		return biz.ProcessInstanceFromCustomerConfigInput{}, false
	}
	businessRefNo := optionalRPCStringPointer(getString(pm, "business_ref_no"))
	if businessRefNo == nil {
		businessRefNo = optionalRPCStringPointer(getString(pm, "receipt_no"))
	}
	return biz.ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     getString(pm, "customer_key"),
		ProcessKey:      biz.ProcessKeyMaterialSupply,
		ProcessVersion:  getString(pm, "process_version"),
		BusinessRefType: "purchase_receipt",
		BusinessRefID:   purchaseReceiptID,
		BusinessRefNo:   businessRefNo,
		CorrelationKey:  optionalRPCStringPointer(getString(pm, "correlation_key")),
		IdempotencyKey:  idempotencyKey,
	}, true
}

func materialSupplyPurchaseOrderProcessInputFromParams(pm map[string]any) (biz.ProcessInstanceFromCustomerConfigInput, bool) {
	purchaseOrderID := getInt(pm, "purchase_order_id", 0)
	if purchaseOrderID <= 0 {
		purchaseOrderID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if purchaseOrderID <= 0 || idempotencyKey == "" {
		return biz.ProcessInstanceFromCustomerConfigInput{}, false
	}
	businessRefNo := optionalRPCStringPointer(getString(pm, "business_ref_no"))
	if businessRefNo == nil {
		businessRefNo = optionalRPCStringPointer(getString(pm, "purchase_order_no"))
	}
	return biz.ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     getString(pm, "customer_key"),
		ProcessKey:      biz.ProcessKeyMaterialSupply,
		ProcessVersion:  getString(pm, "process_version"),
		BusinessRefType: "purchase_order",
		BusinessRefID:   purchaseOrderID,
		BusinessRefNo:   businessRefNo,
		CorrelationKey:  optionalRPCStringPointer(getString(pm, "correlation_key")),
		IdempotencyKey:  idempotencyKey,
	}, true
}

func finishedGoodsDeliveryProcessInputFromParams(pm map[string]any) (biz.ProcessInstanceFromCustomerConfigInput, bool) {
	shipmentID := getInt(pm, "shipment_id", 0)
	if shipmentID <= 0 {
		shipmentID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if shipmentID <= 0 || idempotencyKey == "" {
		return biz.ProcessInstanceFromCustomerConfigInput{}, false
	}
	businessRefNo := optionalRPCStringPointer(getString(pm, "business_ref_no"))
	if businessRefNo == nil {
		businessRefNo = optionalRPCStringPointer(getString(pm, "shipment_no"))
	}
	return biz.ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     getString(pm, "customer_key"),
		ProcessKey:      biz.ProcessKeyFinishedGoodsDelivery,
		ProcessVersion:  getString(pm, "process_version"),
		BusinessRefType: "shipment",
		BusinessRefID:   shipmentID,
		BusinessRefNo:   businessRefNo,
		CorrelationKey:  optionalRPCStringPointer(getString(pm, "correlation_key")),
		IdempotencyKey:  idempotencyKey,
	}, true
}

func finishedGoodsDeliveryQualityDecisionExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	shipmentID := getInt(pm, "shipment_id", 0)
	if shipmentID <= 0 {
		shipmentID = getInt(pm, "business_ref_id", 0)
	}
	result := strings.TrimSpace(getString(pm, "result"))
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || shipmentID <= 0 || result == "" || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"shipment_id": shipmentID,
		"result":      result,
	}
	putPositiveIntPayload(payload, "finished_goods_lot_id", getInt(pm, "finished_goods_lot_id", 0))
	putPositiveIntPayload(payload, "quality_inspection_id", getInt(pm, "quality_inspection_id", 0))
	putPositiveIntPayload(payload, "inspector_id", getInt(pm, "inspector_id", 0))
	putStringPayload(payload, "inspected_at", getString(pm, "inspected_at"))
	putStringPayload(payload, "decision_note", getString(pm, "decision_note"))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandFinishedGoodsQualityDecide,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func finishedGoodsDeliveryFinanceReleaseExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	shipmentID := getInt(pm, "shipment_id", 0)
	if shipmentID <= 0 {
		shipmentID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || shipmentID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"shipment_id": shipmentID,
	}
	putStringPayload(payload, "finance_release_no", getString(pm, "finance_release_no"))
	putPositiveIntPayload(payload, "approved_by_id", getInt(pm, "approved_by_id", 0))
	putStringPayload(payload, "released_at", getString(pm, "released_at"))
	putStringPayload(payload, "release_note", getString(pm, "release_note"))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandShipmentFinanceRelease,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func finishedGoodsDeliveryShipmentShipExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	shipmentID := getInt(pm, "shipment_id", 0)
	if shipmentID <= 0 {
		shipmentID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || shipmentID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"shipment_id": shipmentID,
	}
	putStringPayload(payload, "shipment_no", getString(pm, "shipment_no"))
	putPositiveIntPayload(payload, "warehouse_id", getInt(pm, "warehouse_id", 0))
	putPositiveIntPayload(payload, "operator_id", getInt(pm, "operator_id", 0))
	putStringPayload(payload, "shipped_at", getString(pm, "shipped_at"))
	putStringPayload(payload, "carrier", getString(pm, "carrier"))
	putStringPayload(payload, "tracking_no", getString(pm, "tracking_no"))
	putStringPayload(payload, "ship_note", getString(pm, "ship_note"))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandShipmentShip,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func finishedGoodsDeliveryReceivableLeadExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	shipmentID := getInt(pm, "shipment_id", 0)
	if shipmentID <= 0 {
		shipmentID = getInt(pm, "business_ref_id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || shipmentID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"shipment_id": shipmentID,
	}
	putPositiveIntPayload(payload, "customer_id", getInt(pm, "customer_id", 0))
	putStringPayload(payload, "receivable_source_no", getString(pm, "receivable_source_no"))
	putStringPayload(payload, "currency", getString(pm, "currency"))
	putStringPayload(payload, "expected_amount", getString(pm, "expected_amount"))
	putStringPayload(payload, "due_date", getString(pm, "due_date"))
	putStringPayload(payload, "lead_note", getString(pm, "lead_note"))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func materialSupplyPurchaseReceiptCreateExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	purchaseOrderID := getInt(pm, "purchase_order_id", 0)
	receiptNo := strings.TrimSpace(getString(pm, "receipt_no"))
	warehouseID := getInt(pm, "warehouse_id", 0)
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || receiptNo == "" || warehouseID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"receipt_no":   receiptNo,
		"warehouse_id": warehouseID,
	}
	putPositiveIntPayload(payload, "purchase_order_id", purchaseOrderID)
	putStringPayload(payload, "received_at", getString(pm, "received_at"))
	putStringPayload(payload, "note", getString(pm, "note"))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandPurchaseReceiptCreate,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func materialSupplyQualityDecisionExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	inspectionID := getInt(pm, "quality_inspection_id", 0)
	if inspectionID <= 0 {
		inspectionID = getInt(pm, "id", 0)
	}
	result := strings.TrimSpace(getString(pm, "result"))
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || inspectionID <= 0 || result == "" || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"quality_inspection_id": inspectionID,
		"result":                result,
	}
	putPositiveIntPayload(payload, "purchase_receipt_id", getInt(pm, "purchase_receipt_id", 0))
	putPositiveIntPayload(payload, "inventory_lot_id", getInt(pm, "inventory_lot_id", 0))
	putPositiveIntPayload(payload, "inspector_id", getInt(pm, "inspector_id", 0))
	putStringPayload(payload, "inspected_at", getString(pm, "inspected_at"))
	putStringPayload(payload, "decision_note", getString(pm, "decision_note"))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func materialSupplyPostInboundExecutionFromParams(pm map[string]any) (*biz.ProcessDomainCommandExecution, bool) {
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	purchaseReceiptID := getInt(pm, "purchase_receipt_id", 0)
	if purchaseReceiptID <= 0 {
		purchaseReceiptID = getInt(pm, "id", 0)
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 || purchaseReceiptID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{
		"purchase_receipt_id": purchaseReceiptID,
	}
	putStringPayload(payload, "receipt_no", getString(pm, "receipt_no"))
	putPositiveIntPayload(payload, "warehouse_id", getInt(pm, "warehouse_id", 0))
	putPositiveIntPayload(payload, "inventory_lot_id", getInt(pm, "inventory_lot_id", 0))
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            biz.ProcessDomainCommandInventoryPostInbound,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func putPositiveIntPayload(payload map[string]any, key string, value int) {
	if value > 0 {
		payload[key] = value
	}
}

func putStringPayload(payload map[string]any, key string, value string) {
	value = strings.TrimSpace(value)
	if value != "" {
		payload[key] = value
	}
}

func optionalRPCStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func customerConfigPublishInputFromParams(pm map[string]any) (biz.CustomerConfigPublishInput, bool) {
	raw := pm
	if nested := getMap(pm, "candidate_revision"); len(nested) > 0 {
		raw = nested
	}
	snapshot := getMap(raw, "compiled_snapshot")
	if len(snapshot) == 0 {
		snapshot = getMap(raw, "compiledSnapshot")
	}
	in := biz.CustomerConfigPublishInput{
		CustomerKey:         getString(raw, "customer_key"),
		Revision:            getString(raw, "revision"),
		ProductVersion:      getString(raw, "product_version"),
		CompiledSnapshot:    snapshot,
		ModuleStates:        moduleStatesFromAny(raw["module_states"]),
		RoleProfiles:        roleProfilesFromAny(raw["role_profiles"]),
		AccessEntitlements:  accessEntitlementsFromAny(raw["access_entitlements"]),
		WorkPools:           workPoolsFromAny(raw["work_pools"]),
		WorkPoolMemberships: workPoolMembershipsFromAny(raw["work_pool_memberships"]),
	}
	if in.CustomerKey == "" {
		in.CustomerKey = getString(raw, "customerKey")
	}
	if in.ProductVersion == "" {
		in.ProductVersion = getString(raw, "productVersion")
	}
	if in.CustomerKey == "" || in.Revision == "" || len(in.CompiledSnapshot) == 0 {
		return biz.CustomerConfigPublishInput{}, false
	}
	return in, true
}

func moduleStatesFromAny(value any) []biz.DeploymentModuleStateInput {
	items := anySlice(value)
	out := make([]biz.DeploymentModuleStateInput, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, biz.DeploymentModuleStateInput{
			ModuleKey:       getString(m, "module_key"),
			ContractVersion: getString(m, "contract_version"),
			State:           getString(m, "state"),
			Reason:          getString(m, "reason"),
		})
	}
	return out
}

func roleProfilesFromAny(value any) []biz.RoleProfileInput {
	items := anySlice(value)
	out := make([]biz.RoleProfileInput, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, biz.RoleProfileInput{
			RoleKey:     getString(m, "role_key"),
			DisplayName: getString(m, "display_name"),
			Disabled:    getBool(m, "disabled", false),
			BundleKeys:  getStringSlice(m, "bundle_keys"),
			Grants:      getStringSlice(m, "grants"),
			Revokes:     getStringSlice(m, "revokes"),
		})
	}
	return out
}

func accessEntitlementsFromAny(value any) []biz.AccessEntitlementInput {
	items := anySlice(value)
	out := make([]biz.AccessEntitlementInput, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, biz.AccessEntitlementInput{
			RoleKey:       getString(m, "role_key"),
			CapabilityKey: getString(m, "capability_key"),
			ScopeType:     getString(m, "scope_type"),
			ScopeValue:    getString(m, "scope_value"),
			Constraints:   getMap(m, "constraints"),
			Enabled:       getBool(m, "enabled", true),
		})
	}
	return out
}

func workPoolsFromAny(value any) []biz.WorkPoolInput {
	items := anySlice(value)
	out := make([]biz.WorkPoolInput, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, biz.WorkPoolInput{
			PoolKey:     getString(m, "pool_key"),
			ModuleKey:   getString(m, "module_key"),
			DisplayName: getString(m, "display_name"),
			Description: getString(m, "description"),
		})
	}
	return out
}

func workPoolMembershipsFromAny(value any) []biz.WorkPoolMembershipInput {
	items := anySlice(value)
	out := make([]biz.WorkPoolMembershipInput, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, biz.WorkPoolMembershipInput{
			PoolKey:  getString(m, "pool_key"),
			RoleKey:  getString(m, "role_key"),
			UserID:   getInt(m, "user_id", 0),
			Strategy: getString(m, "strategy"),
			Priority: getInt(m, "priority", 0),
			Enabled:  getBool(m, "enabled", true),
		})
	}
	return out
}

func anySlice(value any) []any {
	if value == nil {
		return []any{}
	}
	if items, ok := value.([]any); ok {
		return items
	}
	return []any{}
}

func customerConfigValidationToMap(result *biz.CustomerConfigValidationResult) map[string]any {
	if result == nil {
		return map[string]any{}
	}
	return map[string]any{
		"customer_key":         result.CustomerKey,
		"revision":             result.Revision,
		"config_hash":          result.ConfigHash,
		"module_state_count":   result.ModuleStateCount,
		"role_profile_count":   result.RoleProfileCount,
		"entitlement_count":    result.EntitlementCount,
		"work_pool_count":      result.WorkPoolCount,
		"membership_count":     result.MembershipCount,
		"compiled_snapshot_ok": result.CompiledSnapshotOK,
	}
}

func customerConfigRevisionToMap(item *biz.CustomerConfigRevision) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                item.ID,
		"customer_key":      item.CustomerKey,
		"revision":          item.Revision,
		"product_version":   item.ProductVersion,
		"config_hash":       item.ConfigHash,
		"status":            item.Status,
		"published_by":      optionalIntValue(item.PublishedBy),
		"published_at":      optionalTimeUnix(item.PublishedAt),
		"activated_by":      optionalIntValue(item.ActivatedBy),
		"activated_at":      optionalTimeUnix(item.ActivatedAt),
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
		"compiled_snapshot": item.CompiledSnapshot,
	}
}

func effectiveSessionToMap(session *biz.EffectiveSession) map[string]any {
	if session == nil {
		return map[string]any{}
	}
	return map[string]any{
		"configRevision": session.ConfigRevision,
		"configHash":     session.ConfigHash,
		"customer": map[string]any{
			"key":  session.Customer.Key,
			"name": session.Customer.Name,
		},
		"modules":               toAnyMapStringString(session.Modules),
		"roles":                 toAnySliceString(session.Roles),
		"pages":                 toAnySliceString(session.Pages),
		"actions":               toAnySliceString(session.Actions),
		"workPools":             toAnySliceString(session.WorkPools),
		"fieldPolicies":         session.FieldPolicies,
		"printTemplateDefaults": session.PrintTemplateDefaults,
		"source":                session.Source,
	}
}

func customerModuleStatusExplanationToMap(status *biz.CustomerModuleStatusExplanation) map[string]any {
	if status == nil {
		return map[string]any{}
	}
	return map[string]any{
		"customer_key":                 status.CustomerKey,
		"module_key":                   status.ModuleKey,
		"product_included":             status.ProductIncluded,
		"product_name":                 status.ProductName,
		"product_layer":                status.ProductLayer,
		"product_maturity":             status.ProductMaturity,
		"config_revision":              status.ConfigRevision,
		"config_hash":                  status.ConfigHash,
		"customer_state":               status.CustomerState,
		"contract_version":             status.ContractVersion,
		"reason":                       status.Reason,
		"dependencies":                 toAnySliceString(status.Dependencies),
		"missing_dependencies":         toAnySliceString(status.MissingDependencies),
		"dependencies_satisfied":       status.DependenciesSatisfied,
		"referenced_role_keys":         toAnySliceString(status.ReferencedRoleKeys),
		"referenced_work_pool_keys":    toAnySliceString(status.ReferencedWorkPoolKeys),
		"referenced_page_keys":         toAnySliceString(status.ReferencedPageKeys),
		"referenced_process_keys":      toAnySliceString(status.ReferencedProcessKeys),
		"in_flight_process_count":      status.InFlightProcessCount,
		"open_task_count":              status.OpenTaskCount,
		"open_business_document_count": status.OpenBusinessDocCount,
		"runtime_count_source":         status.RuntimeCountSource,
		"can_enable":                   status.CanEnable,
		"can_disable":                  status.CanDisable,
		"enable_blocked_reasons":       toAnySliceString(status.EnableBlockedReasons),
		"disable_blocked_reasons":      toAnySliceString(status.DisableBlockedReasons),
		"source":                       status.Source,
	}
}

func customerProcessDefinitionExplanationToMap(definition *biz.CustomerProcessDefinitionExplanation) map[string]any {
	if definition == nil {
		return map[string]any{}
	}
	nodes := make([]any, 0, len(definition.Nodes))
	for _, node := range definition.Nodes {
		nodes = append(nodes, map[string]any{
			"node_key":                           node.NodeKey,
			"node_type":                          node.NodeType,
			"owner_pool_key":                     node.OwnerPoolKey,
			"required_capability_key":            node.RequiredCapabilityKey,
			"command_key":                        node.CommandKey,
			"runtime_binding_status":             node.RuntimeBindingStatus,
			"process_runtime_handler_registered": node.ProcessRuntimeHandlerRegistered,
			"runtime_loader_blockers":            toAnySliceString(node.RuntimeLoaderBlockers),
			"runtime_execute_blockers":           toAnySliceString(node.RuntimeExecuteBlockers),
			"writes_fact":                        node.WritesFact,
		})
	}
	return map[string]any{
		"customer_key":                 definition.CustomerKey,
		"process_key":                  definition.ProcessKey,
		"process_version":              definition.ProcessVersion,
		"variant_key":                  definition.VariantKey,
		"config_revision":              definition.ConfigRevision,
		"config_hash":                  definition.ConfigHash,
		"manifest_status":              definition.ManifestStatus,
		"runtime_loader_enabled":       definition.RuntimeLoaderEnabled,
		"business_ref_type":            definition.BusinessRefType,
		"domain_boundary":              definition.DomainBoundary,
		"fact_boundary":                definition.FactBoundary,
		"source_workflow_key":          definition.SourceWorkflowKey,
		"source_status":                definition.SourceStatus,
		"nodes":                        nodes,
		"runtime_loader_blockers":      toAnySliceString(definition.RuntimeLoaderBlockers),
		"runtime_execute_blockers":     toAnySliceString(definition.RuntimeExecuteBlockers),
		"start_blocked_reasons":        toAnySliceString(definition.StartBlockedReasons),
		"execute_blocked_reasons":      toAnySliceString(definition.ExecuteBlockedReasons),
		"can_start_runtime":            definition.CanStartRuntime,
		"can_execute_runtime_commands": definition.CanExecuteRuntimeCommands,
		"source":                       definition.Source,
	}
}

func processInstanceToMap(item *biz.ProcessInstance) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                       item.ID,
		"process_key":              item.ProcessKey,
		"process_version":          item.ProcessVersion,
		"variant_key":              optionalStringValue(item.VariantKey),
		"config_revision":          item.ConfigRevision,
		"definition_hash":          item.DefinitionHash,
		"module_contract_snapshot": item.ModuleContractSnapshot,
		"business_ref_type":        item.BusinessRefType,
		"business_ref_id":          item.BusinessRefID,
		"business_ref_no":          optionalStringValue(item.BusinessRefNo),
		"correlation_key":          optionalStringValue(item.CorrelationKey),
		"idempotency_key":          item.IdempotencyKey,
		"status":                   item.Status,
		"started_at":               item.StartedAt.Unix(),
		"completed_at":             optionalTimeUnix(item.CompletedAt),
		"created_by":               optionalIntValue(item.CreatedBy),
		"updated_by":               optionalIntValue(item.UpdatedBy),
		"created_at":               item.CreatedAt.Unix(),
		"updated_at":               item.UpdatedAt.Unix(),
	}
}

func processNodeInstanceToMap(item *biz.ProcessNodeInstance) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                      item.ID,
		"process_instance_id":     item.ProcessInstanceID,
		"node_key":                item.NodeKey,
		"node_type":               item.NodeType,
		"attempt":                 item.Attempt,
		"status":                  item.Status,
		"owner_pool_key":          optionalStringValue(item.OwnerPoolKey),
		"required_capability_key": optionalStringValue(item.RequiredCapabilityKey),
		"form_profile_key":        optionalStringValue(item.FormProfileKey),
		"action_set_key":          optionalStringValue(item.ActionSetKey),
		"policy_snapshot":         item.PolicySnapshot,
		"due_at":                  optionalTimeUnix(item.DueAt),
		"started_at":              optionalTimeUnix(item.StartedAt),
		"completed_at":            optionalTimeUnix(item.CompletedAt),
		"outcome":                 optionalStringValue(item.Outcome),
		"version":                 item.Version,
		"created_at":              item.CreatedAt.Unix(),
		"updated_at":              item.UpdatedAt.Unix(),
	}
}

func processNodeInstancesToMaps(items []*biz.ProcessNodeInstance) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, processNodeInstanceToMap(item))
	}
	return out
}

func toAnyMapStringString(values map[string]string) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(values))
	for key, value := range values {
		out[key] = value
	}
	return out
}
