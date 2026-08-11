package service

import (
	"context"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func isCustomerConfigLifecycleMethod(method string) bool {
	switch method {
	case "get_approval_settings",
		"preview_approval_settings",
		"publish_approval_settings",
		"apply_approval_settings",
		"validate_customer_config",
		"publish_customer_config",
		"check_customer_config_transition",
		"activate_customer_config",
		"rollback_customer_config":
		return true
	default:
		return false
	}
}

func (d *jsonrpcDispatcher) handleCustomerConfigLifecycle(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "get_approval_settings":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); res != nil {
			return id, res, nil
		}
		if !customerConfigAllowsOnly(pm, "customer_key") {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		settings, err := d.customerConfigUC.GetApprovalSettings(ctx, customerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code: errcode.OK.Code, Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{"approval_settings": approvalSettingsExplanationToMap(settings)}),
		}, nil

	case "preview_approval_settings", "publish_approval_settings", "apply_approval_settings":
		permission := biz.PermissionCustomerConfigRead
		if method == "publish_approval_settings" || method == "apply_approval_settings" {
			permission = biz.PermissionCustomerConfigPublish
		}
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return id, res, nil
		}
		if method == "apply_approval_settings" {
			if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigActivate); res != nil {
				return id, res, nil
			}
		}
		in, ok := approvalSettingsRevisionInputFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		customerKey, err := runtimeCustomerKey(in.CustomerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		in.CustomerKey = customerKey
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		settings, err := d.customerConfigUC.PreviewApprovalSettingsRevision(ctx, in)
		if err != nil {
			if method == "apply_approval_settings" && errors.Is(err, biz.ErrCustomerConfigTransitionBlocked) {
				revision, applyErr := d.customerConfigUC.ApplyApprovalSettingsRevision(ctx, in, admin.ID)
				if applyErr == nil {
					return id, &v1.JsonrpcResult{
						Code: errcode.OK.Code, Message: errcode.OK.Message,
						Data: newDataStruct(map[string]any{"revision": customerConfigRevisionToMap(revision)}),
					}, nil
				}
				return id, d.mapCustomerConfigError(ctx, applyErr), nil
			}
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		if candidateResult := d.validateApprovalSettingsCandidate(ctx, settings, admin); candidateResult != nil {
			return id, candidateResult, nil
		}
		if method == "preview_approval_settings" {
			return id, &v1.JsonrpcResult{
				Code: errcode.OK.Code, Message: errcode.OK.Message,
				Data: newDataStruct(map[string]any{"approval_settings": approvalSettingsExplanationToMap(settings)}),
			}, nil
		}
		var revision *biz.CustomerConfigRevision
		if method == "apply_approval_settings" {
			revision, err = d.customerConfigUC.ApplyApprovalSettingsRevision(ctx, in, admin.ID)
		} else {
			revision, err = d.customerConfigUC.PublishApprovalSettingsRevision(ctx, in, admin.ID)
		}
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code: errcode.OK.Code, Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{"revision": customerConfigRevisionToMap(revision)}),
		}, nil

	case "validate_customer_config":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigRead); res != nil {
			return id, res, nil
		}
		in, ok := customerConfigPublishInputFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := localTestCustomerConfigBoundaryResult(in.ProductVersion, in.CompiledSnapshot, d.localTestConfigEnabled); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerTrialConfigManifest(in); res != nil {
			return id, res, nil
		}
		resolvedCustomerKey, err := runtimeCustomerKey(in.CustomerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		in.CustomerKey = resolvedCustomerKey
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
		if res := localTestCustomerConfigBoundaryResult(in.ProductVersion, in.CompiledSnapshot, d.localTestConfigEnabled); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerTrialConfigManifest(in); res != nil {
			return id, res, nil
		}
		resolvedCustomerKey, err := runtimeCustomerKey(in.CustomerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		in.CustomerKey = resolvedCustomerKey
		candidate, err := d.customerConfigUC.ExplainApprovalSettingsPublishInput(ctx, in)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		if candidateResult := d.validateApprovalSettingsCandidate(ctx, candidate, admin); candidateResult != nil {
			return id, candidateResult, nil
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

	case "check_customer_config_transition":
		in, ok := customerConfigTransitionCheckInputFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		permission := biz.PermissionCustomerConfigActivate
		if in.Action == biz.CustomerConfigTransitionRollback {
			permission = biz.PermissionCustomerConfigRollback
		}
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return id, res, nil
		}
		if res := localTestCustomerConfigBoundaryResult(in.ExpectedProductVersion, nil, d.localTestConfigEnabled); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerTrialConfigRevisionProductVersion(in.CustomerKey, in.TargetRevision, in.ExpectedProductVersion); res != nil {
			return id, res, nil
		}
		resolvedCustomerKey, err := runtimeCustomerKey(in.CustomerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		in.CustomerKey = resolvedCustomerKey
		check, err := d.customerConfigUC.CheckCustomerConfigTransition(ctx, in)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"transition": customerConfigTransitionCheckToMap(check)}),
		}, nil

	case "activate_customer_config":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerConfigActivate); res != nil {
			return id, res, nil
		}
		identity, ok := customerConfigTransitionMutationIdentityFromParams(pm, biz.CustomerConfigTransitionActivate)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := localTestCustomerConfigBoundaryResult(identity.ExpectedProductVersion, nil, d.localTestConfigEnabled); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerTrialConfigRevisionProductVersion(identity.CustomerKey, identity.TargetRevision, identity.ExpectedProductVersion); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		customerKey, err := runtimeCustomerKey(identity.CustomerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		item, err := d.customerConfigUC.ActivateCustomerConfig(
			ctx,
			customerKey,
			identity.TargetRevision,
			identity.ExpectedConfigHash,
			identity.ExpectedProductVersion,
			identity.ExpectedActiveRevision,
			admin.ID,
		)
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
		identity, ok := customerConfigTransitionMutationIdentityFromParams(pm, biz.CustomerConfigTransitionRollback)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := localTestCustomerConfigBoundaryResult(identity.ExpectedProductVersion, nil, d.localTestConfigEnabled); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerTrialConfigRevisionProductVersion(identity.CustomerKey, identity.TargetRevision, identity.ExpectedProductVersion); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		customerKey, err := runtimeCustomerKey(identity.CustomerKey)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		item, err := d.customerConfigUC.RollbackCustomerConfig(
			ctx,
			customerKey,
			identity.TargetRevision,
			identity.ExpectedConfigHash,
			identity.ExpectedProductVersion,
			identity.ExpectedActiveRevision,
			admin.ID,
		)
		if err != nil {
			return id, d.mapCustomerConfigError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"revision": customerConfigRevisionToMap(item)}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: errcode.UnknownMethod.Message,
		}, nil
	}
}
