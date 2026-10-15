package service

import (
	"context"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWarehouseMasterData(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if method == "list_material_warehouses" {
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		// These are master-data reference choices only; this endpoint exposes no warehouse balances or facts.
		filter := masterDataFilterFromParams(pm)
		filter.ActiveOnly, filter.LifecycleScope = true, ""
		filter.WarehouseTypes = []string{biz.WarehouseMainMaterial, biz.WarehouseAuxiliaryMaterial, biz.WarehousePackagingMaterial, biz.WarehouseOtherMaterial, biz.WarehouseMaterial}
		items, total, err := d.masterDataUC.ListWarehouses(ctx, filter)
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, okData(map[string]any{"warehouses": warehousesToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseManage); res != nil {
		return id, res, nil
	}
	scope, res := d.currentWarehouseDataScope(ctx)
	if res != nil {
		return id, res, nil
	}
	warehouseID := 0
	if method == "update_warehouse" {
		var valid bool
		warehouseID, valid = positiveSafeIntegerParam(pm, "id")
		if !valid {
			return id, invalidParamResult(), nil
		}
	} else if _, present := pm["id"]; present {
		return id, invalidParamResult(), nil
	}
	isActive := true
	if value, present := pm["is_active"]; present {
		var valid bool
		isActive, valid = value.(bool)
		if !valid {
			return id, invalidParamResult(), nil
		}
	}
	item, err := d.masterDataUC.SaveWarehouseForAccess(ctx, warehouseID, &biz.WarehouseMutation{Code: getString(pm, "code"), Name: getString(pm, "name"), Type: getString(pm, "type"), IsActive: isActive}, scope)
	if err != nil {
		return id, d.mapMasterDataError(ctx, err), nil
	}
	return id, okData(map[string]any{"warehouse": warehouseToMap(item)}), nil
}

func warehouseClassificationError(err error) *v1.JsonrpcResult {
	message := ""
	switch {
	case errors.Is(err, biz.ErrStockCategoryRequired):
		message = "请先补齐材料的库存类别和仓库类型，再办理入库"
	case errors.Is(err, biz.ErrWarehouseCategoryMismatch):
		message = "材料或成品与所选仓库类型不符，请重新选择入库仓库"
	case errors.Is(err, biz.ErrWarehouseClassificationInUse):
		message = "当前类别或仓库仍有关联库存或材料默认仓，请先处理后再修改"
	case errors.Is(err, biz.ErrWarehouseCodeConflict):
		message = "仓库编号已存在，请使用其他编号"
	case errors.Is(err, biz.ErrWarehouseNotFound):
		message = "仓库不存在，请重新选择"
	case errors.Is(err, biz.ErrWarehouseInactive):
		message = "仓库已停用，请选择启用的仓库"
	}
	if message == "" {
		return nil
	}
	return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: message}
}
