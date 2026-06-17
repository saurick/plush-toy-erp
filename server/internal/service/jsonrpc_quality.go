package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleQuality(
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
	if d.inventoryUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_quality_inspection_draft", "createQualityInspectionDraft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionCreate); res != nil {
			return id, res, nil
		}
		in := qualityInspectionCreateFromParams(pm)
		item, err := d.inventoryUC.CreateQualityInspectionDraft(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "submit_quality_inspection", "submitQualityInspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.SubmitQualityInspection(ctx, getInt(pm, "id", 0))
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "pass_quality_inspection", "passQualityInspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		in, ok := qualityInspectionDecisionFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.PassQualityInspection(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "reject_quality_inspection", "rejectQualityInspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		in, ok := qualityInspectionDecisionFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.RejectQualityInspection(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "cancel_quality_inspection", "cancelQualityInspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CancelQualityInspection(ctx, getInt(pm, "id", 0), getWorkflowStringPtr(pm, "decision_note"))
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "get_quality_inspection", "getQualityInspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetQualityInspection(ctx, getInt(pm, "id", 0))
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "list_quality_inspections", "listQualityInspections":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.inventoryUC.ListQualityInspections(ctx, qualityInspectionFilterFromParams(pm))
		if err != nil {
			return id, d.mapQualityError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"quality_inspections": qualityInspectionsToAny(items),
			"total":               total,
			"limit":               normalizedLimit(pm),
			"offset":              normalizedOffset(pm),
		}), nil
	default:
		return id, &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知 quality 接口 method=%s", method)}, nil
	}
}

func qualityInspectionCreateFromParams(pm map[string]any) *biz.QualityInspectionCreate {
	return &biz.QualityInspectionCreate{
		InspectionNo:          getString(pm, "inspection_no"),
		PurchaseReceiptID:     getInt(pm, "purchase_receipt_id", 0),
		PurchaseReceiptItemID: getOptionalInt(pm, "purchase_receipt_item_id"),
		InventoryLotID:        getInt(pm, "inventory_lot_id", 0),
		MaterialID:            getInt(pm, "material_id", 0),
		WarehouseID:           getInt(pm, "warehouse_id", 0),
		InspectorID:           getOptionalInt(pm, "inspector_id"),
		DecisionNote:          getWorkflowStringPtr(pm, "decision_note"),
	}
}

func qualityInspectionDecisionFromParams(pm map[string]any) (*biz.QualityInspectionDecision, bool) {
	inspectedAt, ok := getOptionalJSONRPCTime(pm, "inspected_at")
	if !ok {
		return nil, false
	}
	return &biz.QualityInspectionDecision{
		InspectionID: getInt(pm, "id", 0),
		Result:       getString(pm, "result"),
		InspectedAt:  optionalTimeValue(inspectedAt),
		InspectorID:  getOptionalInt(pm, "inspector_id"),
		DecisionNote: getWorkflowStringPtr(pm, "decision_note"),
	}, true
}

func qualityInspectionFilterFromParams(pm map[string]any) biz.QualityInspectionFilter {
	return biz.QualityInspectionFilter{
		Status:  getString(pm, "status"),
		Result:  getString(pm, "result"),
		Keyword: getString(pm, "keyword"),
		Limit:   getInt(pm, "limit", 50),
		Offset:  getInt(pm, "offset", 0),
	}
}

func qualityInspectionResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.QualityInspection, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapQualityError(ctx, err)
	}
	return okData(map[string]any{"quality_inspection": qualityInspectionToAny(item)})
}

func (d *jsonrpcDispatcher) mapQualityError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[quality] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrQualityInspectionNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "质检单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库行不存在"}
	case errors.Is(err, biz.ErrInventoryLotNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存批次不存在"}
	case errors.Is(err, biz.ErrInventoryLotStatusBlocked):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前批次状态不允许提交质检"}
	case ent.IsConstraintError(err):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "质检单号或待检批次已存在"}
	default:
		l.Errorf("[quality] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func qualityInspectionsToAny(items []*biz.QualityInspection) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, qualityInspectionToAny(item))
	}
	return out
}

func qualityInspectionToAny(item *biz.QualityInspection) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                       item.ID,
		"inspection_no":            item.InspectionNo,
		"purchase_receipt_id":      item.PurchaseReceiptID,
		"purchase_receipt_item_id": optionalIntToAny(item.PurchaseReceiptItemID),
		"inventory_lot_id":         item.InventoryLotID,
		"material_id":              item.MaterialID,
		"warehouse_id":             item.WarehouseID,
		"status":                   item.Status,
		"result":                   optionalStringToAny(item.Result),
		"original_lot_status":      item.OriginalLotStatus,
		"inspected_at":             optionalUnix(item.InspectedAt),
		"inspector_id":             optionalIntToAny(item.InspectorID),
		"decision_note":            optionalStringToAny(item.DecisionNote),
		"created_at":               item.CreatedAt.Unix(),
		"updated_at":               item.UpdatedAt.Unix(),
	}
}
