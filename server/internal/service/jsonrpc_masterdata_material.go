package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataMaterial(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_material", "createMaterial":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyMaterials); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateMaterial(ctx, materialMutationFromParams(pm))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "update_material", "updateMaterial":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyMaterials); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateMaterial(ctx, getInt(pm, "id", 0), materialMutationFromParams(pm))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "get_material", "getMaterial":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetMaterial(ctx, getInt(pm, "id", 0))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "list_materials", "listMaterials":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListMaterials(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"materials": materialsToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_material_active", "setMaterialActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialDisable); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyMaterials); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetMaterialActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, materialMutationResult(ctx, d, item, err), nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func materialMutationFromParams(pm map[string]any) *biz.MaterialMutation {
	return &biz.MaterialMutation{
		Code:          getString(pm, "code"),
		Name:          getString(pm, "name"),
		Category:      getWorkflowStringPtr(pm, "category"),
		Spec:          getWorkflowStringPtr(pm, "spec"),
		Color:         getWorkflowStringPtr(pm, "color"),
		DefaultUnitID: getInt(pm, "default_unit_id", 0),
	}
}

func materialMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Material, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"material": materialToMap(item)})}
}

func materialToMap(item *biz.Material) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":              item.ID,
		"code":            item.Code,
		"name":            item.Name,
		"category":        optionalStringValue(item.Category),
		"spec":            optionalStringValue(item.Spec),
		"color":           optionalStringValue(item.Color),
		"default_unit_id": item.DefaultUnitID,
		"is_active":       item.IsActive,
		"created_at":      item.CreatedAt.Unix(),
		"updated_at":      item.UpdatedAt.Unix(),
	}
}

func materialsToAny(items []*biz.Material) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, materialToMap(item))
	}
	return out
}
