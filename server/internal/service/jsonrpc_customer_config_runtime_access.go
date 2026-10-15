package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func isCustomerConfigRuntimeAccessMethod(method string) bool {
	switch method {
	case "get_process_recovery_context",
		"recover_compensated_process_domain_command",
		"resume_blocked_process_node",
		"get_effective_session",
		"explain_module_status",
		"explain_process_definition":
		return true
	default:
		return false
	}
}

func (d *jsonrpcDispatcher) handleCustomerConfigRuntimeAccess(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "get_process_recovery_context":
		if !customerConfigAllowsOnly(pm, "process_instance_id") {
			return id, invalidParamResult(), nil
		}
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRuntimeRecover); res != nil {
			return id, res, nil
		}
		processInstanceID := getInt(pm, "process_instance_id", 0)
		if processInstanceID <= 0 {
			return id, invalidParamResult(), nil
		}
		instance, nodes, err := d.processRuntimeUC.GetProcessDomainCommandRecoveryContext(ctx, processInstanceID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"process_context": exceptionProcessContextToMap(instance, nodes),
		}), nil

	case "recover_compensated_process_domain_command":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRuntimeRecover); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		in := &biz.ProcessDomainCommandRecovery{
			ProcessInstanceID:        getInt(pm, "process_instance_id", 0),
			ProcessNodeInstanceID:    getInt(pm, "process_node_instance_id", 0),
			ExpectedVersion:          getInt(pm, "expected_version", 0),
			Decision:                 getString(pm, "decision"),
			ExpectedResultHash:       getString(pm, "expected_result_hash"),
			ExpectedCompensationHash: getString(pm, "expected_compensation_hash"),
		}
		if !customerConfigAllowsOnly(pm, "process_instance_id", "process_node_instance_id", "expected_version", "decision", "expected_result_hash", "expected_compensation_hash") {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		item, err := d.processRuntimeUC.RecoverCompensatedDomainCommand(ctx, in, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"recovered_node": processNodeInstanceToMap(item)}),
		}, nil

	case "resume_blocked_process_node":
		if !customerConfigAllowsOnly(pm, "process_instance_id", "process_node_instance_id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRuntimeRecover); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		item, err := d.processRuntimeUC.ResumeProcessNodeInstance(ctx, &biz.ProcessNodeInstanceResume{
			ProcessInstanceID:     getInt(pm, "process_instance_id", 0),
			ProcessNodeInstanceID: getInt(pm, "process_node_instance_id", 0),
			ExpectedVersion:       getInt(pm, "expected_version", 0),
			Reason:                getString(pm, "reason"),
		}, admin.ID)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"resumed_node": processNodeInstanceToMap(item)}),
		}, nil

	case "get_effective_session":
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		var session *biz.EffectiveSession
		if runtimeCustomerConfigRequiresActiveRevision() {
			session, err = d.customerConfigUC.GetEffectiveSessionRequiringActiveRevision(ctx, customerKey, admin)
		} else {
			session, err = d.customerConfigUC.GetEffectiveSession(ctx, customerKey, admin)
		}
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
		customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		status, err := d.customerConfigUC.ExplainModuleStatus(ctx, customerKey, getString(pm, "module_key"))
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
		customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		definition, err := d.customerConfigUC.ExplainProcessDefinition(ctx, customerKey, getString(pm, "process_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"process_definition": customerProcessDefinitionExplanationToMap(definition)}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: errcode.UnknownMethod.Message,
		}, nil
	}
}
