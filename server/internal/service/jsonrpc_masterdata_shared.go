package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataReference(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_units":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListUnits(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"units":  unitsToAny(items),
			"total":  total,
			"limit":  normalizedLimit(pm),
			"offset": normalizedOffset(pm),
		})}, nil
	case "list_warehouses":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListWarehouses(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"warehouses": warehousesToAny(items),
			"total":      total,
			"limit":      normalizedLimit(pm),
			"offset":     normalizedOffset(pm),
		})}, nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func masterDataFilterFromParams(pm map[string]any) biz.MasterDataFilter {
	return biz.MasterDataFilter{
		Keyword:    getString(pm, "keyword"),
		ActiveOnly: getBool(pm, "active_only", false),
		Limit:      getInt(pm, "limit", 50),
		Offset:     getInt(pm, "offset", 0),
	}
}

func (d *jsonrpcDispatcher) mapMasterDataError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[masterdata] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrCustomerNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "客户不存在"}
	case errors.Is(err, biz.ErrSupplierNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "供应商不存在"}
	case errors.Is(err, biz.ErrMaterialNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "材料不存在"}
	case errors.Is(err, biz.ErrProcessNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "工序不存在"}
	case errors.Is(err, biz.ErrProductSKUNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "SKU 不存在"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品不存在或已停用"}
	case errors.Is(err, biz.ErrContactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "联系人不存在"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "默认单位不存在或已停用"}
	default:
		l.Errorf("[masterdata] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func unknownMasterDataResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.UnknownMethod.Code,
		Message: fmt.Sprintf("未知 masterdata 接口 method=%s", method),
	}
}

func unitToMap(item *biz.Unit) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"code":       item.Code,
		"name":       item.Name,
		"precision":  item.Precision,
		"is_active":  item.IsActive,
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func unitsToAny(items []*biz.Unit) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, unitToMap(item))
	}
	return out
}

func warehouseToMap(item *biz.Warehouse) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"code":       item.Code,
		"name":       item.Name,
		"type":       item.Type,
		"is_active":  item.IsActive,
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func warehousesToAny(items []*biz.Warehouse) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, warehouseToMap(item))
	}
	return out
}
