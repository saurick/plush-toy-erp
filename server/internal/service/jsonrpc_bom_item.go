package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleBOMItem(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "add_bom_item":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		in, ok := bomItemCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.CreateBOMItem(ctx, in)
		return id, bomItemResult(ctx, d, item, err), nil
	case "update_bom_item":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		in, ok := bomItemUpdateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.UpdateBOMDraftItem(ctx, getInt(pm, "id", 0), in)
		return id, bomItemResult(ctx, d, item, err), nil
	case "delete_bom_item":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBOMUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), bomModuleKeyMaterialBOM); res != nil {
			return id, res, nil
		}
		itemID := getInt(pm, "id", 0)
		err := d.inventoryUC.DeleteBOMDraftItem(ctx, itemID)
		if err != nil {
			return id, d.mapBOMError(ctx, err), nil
		}
		return id, okData(map[string]any{"deleted_id": itemID}), nil
	default:
		return id, unknownBOMResult(method), nil
	}
}
