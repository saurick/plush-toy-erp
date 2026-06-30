package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataProcess(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_process", "createProcess":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProcesses); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateProcess(ctx, processMutationFromParams(pm))
		return id, processMutationResult(ctx, d, item, err), nil
	case "update_process", "updateProcess":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProcesses); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateProcess(ctx, getInt(pm, "id", 0), processMutationFromParams(pm))
		return id, processMutationResult(ctx, d, item, err), nil
	case "get_process", "getProcess":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetProcess(ctx, getInt(pm, "id", 0))
		return id, processMutationResult(ctx, d, item, err), nil
	case "list_processes", "listProcesses":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListProcesses(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"processes": processesToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_process_active", "setProcessActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessDisable); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProcesses); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetProcessActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, processMutationResult(ctx, d, item, err), nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func processMutationFromParams(pm map[string]any) *biz.ProcessMutation {
	return &biz.ProcessMutation{
		Code:               getString(pm, "code"),
		Name:               getString(pm, "name"),
		Category:           getWorkflowStringPtr(pm, "category"),
		OutsourcingEnabled: getBool(pm, "outsourcing_enabled", false),
		InhouseEnabled:     getBool(pm, "inhouse_enabled", true),
		QualityRequired:    getBool(pm, "quality_required", false),
		SortOrder:          getInt(pm, "sort_order", 0),
		Note:               getWorkflowStringPtr(pm, "note"),
	}
}

func processMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Process, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"process": processToMap(item)})}
}

func processToMap(item *biz.Process) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                  item.ID,
		"code":                item.Code,
		"name":                item.Name,
		"category":            optionalStringValue(item.Category),
		"outsourcing_enabled": item.OutsourcingEnabled,
		"inhouse_enabled":     item.InhouseEnabled,
		"quality_required":    item.QualityRequired,
		"sort_order":          item.SortOrder,
		"note":                optionalStringValue(item.Note),
		"is_active":           item.IsActive,
		"created_at":          item.CreatedAt.Unix(),
		"updated_at":          item.UpdatedAt.Unix(),
	}
}

func processesToAny(items []*biz.Process) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, processToMap(item))
	}
	return out
}
