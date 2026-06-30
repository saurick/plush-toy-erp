package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleBOMVersion(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_bom_versions", "listBOMVersions":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.inventoryUC.ListBOMHeaders(ctx, bomHeaderFilterFromParams(pm))
		if err != nil {
			return id, d.mapBOMError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"bom_versions": bomHeadersToAny(items),
			"total":        total,
			"limit":        normalizedLimit(pm),
			"offset":       normalizedOffset(pm),
		}), nil
	case "get_bom_version", "getBOMVersion":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetBOMVersion(ctx, getInt(pm, "id", 0))
		return id, bomVersionDetailResult(ctx, d, item, err), nil
	case "create_bom_draft", "createBOMDraft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		in, ok := bomHeaderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		in.Status = biz.BOMStatusDraft
		item, err := d.inventoryUC.CreateBOMHeader(ctx, in)
		if err != nil {
			return id, d.mapBOMError(ctx, err), nil
		}
		return id, okData(map[string]any{"bom_version": bomVersionDetailToAny(&biz.BOMVersionDetail{Header: item})}), nil
	case "update_bom_draft", "updateBOMDraft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		in, ok := bomHeaderUpdateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.UpdateBOMDraftHeader(ctx, getInt(pm, "id", 0), in)
		if err != nil {
			return id, d.mapBOMError(ctx, err), nil
		}
		detail, err := d.inventoryUC.GetBOMVersion(ctx, item.ID)
		return id, bomVersionDetailResult(ctx, d, detail, err), nil
	case "copy_bom_version", "copyBOMVersion":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		in, ok := bomHeaderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.CopyBOMVersion(ctx, getInt(pm, "source_id", 0), in)
		return id, bomVersionDetailResult(ctx, d, item, err), nil
	case "activate_bom_version", "activateBOMVersion":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMActivate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.ActivateBOMVersion(ctx, getInt(pm, "id", 0))
		return id, bomVersionDetailResult(ctx, d, item, err), nil
	case "archive_bom_version", "archiveBOMVersion":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.ArchiveBOMVersion(ctx, getInt(pm, "id", 0))
		if err != nil {
			return id, d.mapBOMError(ctx, err), nil
		}
		return id, okData(map[string]any{"bom_version": bomHeaderToAny(item)}), nil
	default:
		return id, unknownBOMResult(method), nil
	}
}
