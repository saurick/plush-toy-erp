package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/errcode"
)

const bomModuleKeyMaterialBOM = "material_bom"

func unknownBOMResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知 bom 接口 method=%s", method)}
}

func bomHeaderCreateFromParams(pm map[string]any) (*biz.BOMHeaderCreate, bool) {
	effectiveFrom, ok := getOptionalJSONRPCTime(pm, "effective_from")
	if !ok {
		return nil, false
	}
	effectiveTo, ok := getOptionalJSONRPCTime(pm, "effective_to")
	if !ok {
		return nil, false
	}
	return &biz.BOMHeaderCreate{
		ProductID:     getInt(pm, "product_id", 0),
		Version:       getString(pm, "version"),
		Status:        biz.BOMStatusDraft,
		EffectiveFrom: effectiveFrom,
		EffectiveTo:   effectiveTo,
		Note:          getWorkflowStringPtr(pm, "note"),
	}, true
}

func bomHeaderUpdateFromParams(pm map[string]any) (*biz.BOMHeaderUpdate, bool) {
	effectiveFrom, ok := getOptionalJSONRPCTime(pm, "effective_from")
	if !ok {
		return nil, false
	}
	effectiveTo, ok := getOptionalJSONRPCTime(pm, "effective_to")
	if !ok {
		return nil, false
	}
	return &biz.BOMHeaderUpdate{
		Version:       getString(pm, "version"),
		EffectiveFrom: effectiveFrom,
		EffectiveTo:   effectiveTo,
		Note:          getWorkflowStringPtr(pm, "note"),
	}, true
}

func bomItemCreateFromParams(pm map[string]any) (*biz.BOMItemCreate, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	lossRate, ok := getRequiredJSONRPCDecimal(pm, "loss_rate")
	if !ok {
		return nil, false
	}
	return &biz.BOMItemCreate{
		BOMHeaderID: getInt(pm, "bom_header_id", 0),
		MaterialID:  getInt(pm, "material_id", 0),
		Quantity:    quantity,
		UnitID:      getInt(pm, "unit_id", 0),
		LossRate:    lossRate,
		Position:    getWorkflowStringPtr(pm, "position"),
		Note:        getWorkflowStringPtr(pm, "note"),
	}, true
}

func bomItemUpdateFromParams(pm map[string]any) (*biz.BOMItemUpdate, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	lossRate, ok := getRequiredJSONRPCDecimal(pm, "loss_rate")
	if !ok {
		return nil, false
	}
	return &biz.BOMItemUpdate{
		MaterialID: getInt(pm, "material_id", 0),
		Quantity:   quantity,
		UnitID:     getInt(pm, "unit_id", 0),
		LossRate:   lossRate,
		Position:   getWorkflowStringPtr(pm, "position"),
		Note:       getWorkflowStringPtr(pm, "note"),
	}, true
}

func bomHeaderFilterFromParams(pm map[string]any) biz.BOMHeaderFilter {
	return biz.BOMHeaderFilter{
		ProductID: getInt(pm, "product_id", 0),
		Status:    getString(pm, "status"),
		Keyword:   getString(pm, "keyword"),
		Limit:     getInt(pm, "limit", 50),
		Offset:    getInt(pm, "offset", 0),
	}
}

func bomVersionDetailResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.BOMVersionDetail, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapBOMError(ctx, err)
	}
	return okData(map[string]any{"bom_version": bomVersionDetailToAny(item)})
}

func bomItemResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.BOMItem, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapBOMError(ctx, err)
	}
	return okData(map[string]any{"bom_item": bomItemToAny(item)})
}

func (d *jsonrpcDispatcher) mapBOMError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[bom] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrBOMHeaderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "BOM 版本不存在"}
	case errors.Is(err, biz.ErrBOMItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "BOM 明细不存在"}
	case errors.Is(err, biz.ErrBOMActiveImmutable):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "已激活 BOM 不允许直接修改，请复制新版本"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该产品已停用，不能用于新 BOM 版本；历史 BOM 仍保留原引用"}
	case errors.Is(err, biz.ErrMaterialNotFound), errors.Is(err, biz.ErrMaterialInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该材料已停用，不能新增引用；历史 BOM 仍保留原引用"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该单位已停用，不能新增引用；历史 BOM 仍保留原引用"}
	case ent.IsConstraintError(err):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "同一产品的 BOM 版本不能重复，且最多只能有一个激活版本"}
	default:
		l.Errorf("[bom] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func bomHeadersToAny(items []*biz.BOMHeader) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, bomHeaderToAny(item))
	}
	return out
}

func bomVersionDetailToAny(item *biz.BOMVersionDetail) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	out := bomHeaderToAny(item.Header)
	lines := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		lines = append(lines, bomItemToAny(line))
	}
	out["items"] = lines
	return out
}

func bomHeaderToAny(item *biz.BOMHeader) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":             item.ID,
		"product_id":     item.ProductID,
		"version":        item.Version,
		"status":         item.Status,
		"effective_from": optionalUnix(item.EffectiveFrom),
		"effective_to":   optionalUnix(item.EffectiveTo),
		"note":           optionalStringToAny(item.Note),
		"created_at":     item.CreatedAt.Unix(),
		"updated_at":     item.UpdatedAt.Unix(),
	}
}

func bomItemToAny(item *biz.BOMItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":            item.ID,
		"bom_header_id": item.BOMHeaderID,
		"material_id":   item.MaterialID,
		"quantity":      item.Quantity.String(),
		"unit_id":       item.UnitID,
		"loss_rate":     item.LossRate.String(),
		"position":      optionalStringToAny(item.Position),
		"note":          optionalStringToAny(item.Note),
		"created_at":    item.CreatedAt.Unix(),
		"updated_at":    item.UpdatedAt.Unix(),
	}
}
