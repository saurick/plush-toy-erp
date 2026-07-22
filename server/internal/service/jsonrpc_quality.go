package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/errcode"

	"github.com/shopspring/decimal"
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
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	if d.inventoryUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "create_quality_inspection_draft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "quality", method); res != nil {
			return id, res, nil
		}
		in, ok := qualityInspectionFromPurchaseReceiptCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "purchase_receipts", "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreateQualityInspectionFromPurchaseReceipt(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "create_quality_inspection_from_outsourcing_return":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "quality", method); res != nil {
			return id, res, nil
		}
		in, ok := qualityInspectionFromOutsourcingReturnCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders", "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreateQualityInspectionFromOutsourcingReturn(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "create_finished_goods_quality_inspection_draft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "quality", method); res != nil {
			return id, res, nil
		}
		in, ok := finishedGoodsQualityInspectionCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments", "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "submit_quality_inspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.SubmitQualityInspection(ctx, getInt(pm, "id", 0))
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "pass_quality_inspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		in, ok := qualityInspectionDecisionFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.PassQualityInspection(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "reject_quality_inspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		in, ok := qualityInspectionDecisionFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.RejectQualityInspection(ctx, in)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "cancel_quality_inspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CancelQualityInspection(ctx, getInt(pm, "id", 0), getWorkflowStringPtr(pm, "decision_note"))
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "correct_quality_inspection_result":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityExceptionHandle); res != nil {
			return id, res, nil
		}
		if !jsonRPCParamsAllowed(pm, "customer_key", "id", "correction_inspection_no", "reason") {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "quality_inspections"); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{
			InspectionID:           getInt(pm, "id", 0),
			CorrectionInspectionNo: getString(pm, "correction_inspection_no"),
			Reason:                 getString(pm, "reason"),
		}, claims.UserID)
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "get_quality_inspection":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		item, err := d.inventoryUC.GetQualityInspection(ctx, getInt(pm, "id", 0))
		return id, qualityInspectionResult(ctx, d, item, err), nil
	case "list_quality_inspections":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		filter, ok := qualityInspectionFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListQualityInspections(ctx, filter)
		if err != nil {
			return id, d.mapQualityError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"quality_inspections": qualityInspectionsToAny(items),
			"total":               total,
			"limit":               normalizedLimit(pm),
			"offset":              normalizedOffset(pm),
		}), nil
	case "list_finished_goods_quality_inspections":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "quality", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "quality_inspections", "shipments"); res != nil {
			return id, res, nil
		}
		filter, ok := finishedGoodsQualityInspectionFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListFinishedGoodsQualityInspections(ctx, filter)
		if err != nil {
			return id, d.mapQualityError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"quality_inspections": qualityInspectionsToAny(items),
			"total":               total,
			"limit":               normalizedLimit(pm),
			"offset":              normalizedOffset(pm),
		}), nil
	case "list_outsourcing_return_quality_inspections":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "quality", method); res != nil {
			return id, res, nil
		}
		filter, ok := outsourcingReturnQualityInspectionFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "quality_inspections", "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		items, total, err := d.inventoryUC.ListOutsourcingReturnQualityInspections(ctx, filter)
		if err != nil {
			return id, d.mapQualityError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"quality_inspections": qualityInspectionsToAny(items),
			"total":               total,
			"limit":               normalizedLimit(pm),
			"offset":              normalizedOffset(pm),
		}), nil
	case "list_production_stage_quality_inspections":
		if res := d.RequireAdminPermission(ctx, biz.PermissionQualityInspectionRead); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "quality", method); res != nil {
			return id, res, nil
		}
		filter, ok := productionStageQualityInspectionFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "production_orders", "quality_inspections"); res != nil {
			return id, res, nil
		}
		items, total, err := d.inventoryUC.ListProductionStageQualityInspections(ctx, filter)
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

func qualityInspectionFromPurchaseReceiptCreateFromParams(pm map[string]any) (*biz.QualityInspectionFromPurchaseReceiptCreate, bool) {
	if !jsonRPCParamsAllowed(pm, "customer_key", "inspection_no", "purchase_receipt_id", "purchase_receipt_item_id", "decision_note") {
		return nil, false
	}
	return &biz.QualityInspectionFromPurchaseReceiptCreate{
		InspectionNo:          getString(pm, "inspection_no"),
		PurchaseReceiptID:     getInt(pm, "purchase_receipt_id", 0),
		PurchaseReceiptItemID: getInt(pm, "purchase_receipt_item_id", 0),
		DecisionNote:          getWorkflowStringPtr(pm, "decision_note"),
	}, true
}

func qualityInspectionFromOutsourcingReturnCreateFromParams(pm map[string]any) (*biz.QualityInspectionFromOutsourcingReturnCreate, bool) {
	if !jsonRPCParamsAllowed(pm, "customer_key", "fact_id", "inspection_no", "note") {
		return nil, false
	}
	return &biz.QualityInspectionFromOutsourcingReturnCreate{
		InspectionNo:      getString(pm, "inspection_no"),
		OutsourcingFactID: getInt(pm, "fact_id", 0),
		DecisionNote:      getWorkflowStringPtr(pm, "note"),
	}, true
}

func finishedGoodsQualityInspectionCreateFromParams(pm map[string]any) (*biz.QualityInspectionCreate, bool) {
	if !jsonRPCParamsAllowed(
		pm,
		"customer_key",
		"inspection_no",
		"shipment_id",
		"finished_goods_lot_id",
		"product_id",
		"warehouse_id",
		"decision_note",
	) {
		return nil, false
	}
	return &biz.QualityInspectionCreate{
		InspectionNo:   getString(pm, "inspection_no"),
		InventoryLotID: getInt(pm, "finished_goods_lot_id", 0),
		WarehouseID:    getInt(pm, "warehouse_id", 0),
		SourceType:     biz.QualityInspectionSourceShipment,
		SourceID:       getInt(pm, "shipment_id", 0),
		InspectionType: biz.QualityInspectionTypeFinishedGoods,
		SubjectType:    biz.QualityInspectionSubjectProduct,
		SubjectID:      getInt(pm, "product_id", 0),
		DecisionNote:   getWorkflowStringPtr(pm, "decision_note"),
	}, true
}

func qualityInspectionDecisionFromParams(pm map[string]any) (*biz.QualityInspectionDecision, bool) {
	if !jsonRPCParamsAllowed(pm,
		"customer_key",
		"id",
		"result",
		"inspected_at",
		"inspector_id",
		"defect_rate_operator",
		"defect_rate_percent",
		"decision_note",
	) {
		return nil, false
	}
	inspectedAt, ok := getOptionalJSONRPCTime(pm, "inspected_at")
	if !ok {
		return nil, false
	}
	defectRateOperator, defectRatePercent, ok := qualityInspectionDefectRateFromParams(pm)
	if !ok {
		return nil, false
	}
	return &biz.QualityInspectionDecision{
		InspectionID:       getInt(pm, "id", 0),
		Result:             getString(pm, "result"),
		InspectedAt:        optionalTimeValue(inspectedAt),
		InspectorID:        getOptionalInt(pm, "inspector_id"),
		DefectRateOperator: defectRateOperator,
		DefectRatePercent:  defectRatePercent,
		DecisionNote:       getWorkflowStringPtr(pm, "decision_note"),
	}, true
}

func qualityInspectionDefectRateFromParams(pm map[string]any) (*string, *decimal.Decimal, bool) {
	operatorRaw, operatorPresent := pm["defect_rate_operator"]
	if operatorPresent && operatorRaw == nil {
		operatorPresent = false
	}
	percentRaw, percentPresent := pm["defect_rate_percent"]
	if percentPresent && percentRaw == nil {
		percentPresent = false
	}
	if !operatorPresent && !percentPresent {
		return nil, nil, true
	}
	if !operatorPresent || !percentPresent {
		return nil, nil, false
	}
	operatorText, ok := operatorRaw.(string)
	if !ok {
		return nil, nil, false
	}
	operatorText = strings.ToUpper(strings.TrimSpace(operatorText))
	if operatorText == "" {
		return nil, nil, false
	}
	percent, ok := getOptionalJSONRPCDecimalString(pm, "defect_rate_percent")
	if !ok || percent == nil {
		return nil, nil, false
	}
	operator, normalizedPercent, err := biz.NormalizeQualityInspectionDefectRate(&operatorText, percent, true)
	return operator, normalizedPercent, err == nil
}

func qualityInspectionFilterFromParams(pm map[string]any) (biz.QualityInspectionFilter, bool) {
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	return biz.QualityInspectionFilter{
		Status:                getString(pm, "status"),
		Result:                getString(pm, "result"),
		Keyword:               getString(pm, "keyword"),
		DateFrom:              dateFrom,
		DateTo:                dateTo,
		PurchaseReceiptID:     getInt(pm, "purchase_receipt_id", 0),
		PurchaseReceiptItemID: getInt(pm, "purchase_receipt_item_id", 0),
		PurchaseOrderID:       getInt(pm, "purchase_order_id", 0),
		InventoryLotID:        getInt(pm, "inventory_lot_id", 0),
		MaterialID:            getInt(pm, "material_id", 0),
		WarehouseID:           getInt(pm, "warehouse_id", 0),
		SourceType:            getString(pm, "source_type"),
		SourceID:              getInt(pm, "source_id", 0),
		InspectionType:        getString(pm, "inspection_type"),
		SubjectType:           getString(pm, "subject_type"),
		SubjectID:             getInt(pm, "subject_id", 0),
		Limit:                 getInt(pm, "limit", 50),
		Offset:                getInt(pm, "offset", 0),
	}, true
}

func finishedGoodsQualityInspectionFilterFromParams(pm map[string]any) (biz.QualityInspectionFilter, bool) {
	filter, ok := qualityInspectionFilterFromParams(pm)
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	if shipmentID := getInt(pm, "shipment_id", 0); shipmentID > 0 {
		filter.SourceID = shipmentID
	}
	if productID := getInt(pm, "product_id", 0); productID > 0 {
		filter.SubjectID = productID
	}
	filter.SourceType = biz.QualityInspectionSourceShipment
	filter.InspectionType = biz.QualityInspectionTypeFinishedGoods
	filter.SubjectType = biz.QualityInspectionSubjectProduct
	return filter, true
}

func outsourcingReturnQualityInspectionFilterFromParams(pm map[string]any) (biz.QualityInspectionFilter, bool) {
	if !jsonRPCParamsAllowed(pm, "customer_key", "fact_id", "status", "result", "keyword", "inventory_lot_id", "warehouse_id", "product_id", "date_from", "date_to", "limit", "offset") {
		return biz.QualityInspectionFilter{}, false
	}
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	return biz.QualityInspectionFilter{
		Status:         getString(pm, "status"),
		Result:         getString(pm, "result"),
		Keyword:        getString(pm, "keyword"),
		DateFrom:       dateFrom,
		DateTo:         dateTo,
		InventoryLotID: getInt(pm, "inventory_lot_id", 0),
		WarehouseID:    getInt(pm, "warehouse_id", 0),
		SourceID:       getInt(pm, "fact_id", 0),
		SubjectID:      getInt(pm, "product_id", 0),
		Limit:          getInt(pm, "limit", 50),
		Offset:         getInt(pm, "offset", 0),
	}, true
}

func productionStageQualityInspectionFilterFromParams(pm map[string]any) (biz.QualityInspectionFilter, bool) {
	if !jsonRPCParamsAllowed(
		pm,
		"customer_key",
		"status",
		"result",
		"keyword",
		"production_wip_batch_id",
		"gate_code",
		"date_from",
		"date_to",
		"limit",
		"offset",
	) {
		return biz.QualityInspectionFilter{}, false
	}
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.QualityInspectionFilter{}, false
	}
	return biz.QualityInspectionFilter{
		Status:               getString(pm, "status"),
		Result:               getString(pm, "result"),
		Keyword:              getString(pm, "keyword"),
		ProductionWIPBatchID: getInt(pm, "production_wip_batch_id", 0),
		GateCode:             getString(pm, "gate_code"),
		DateFrom:             dateFrom,
		DateTo:               dateTo,
		Limit:                getInt(pm, "limit", 50),
		Offset:               getInt(pm, "offset", 0),
	}, true
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
	case errors.Is(err, biz.ErrIdempotencyConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: errcode.IdempotencyConflict.Message}
	case errors.Is(err, biz.ErrQualityInspectionSourceConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: "该业务来源已存在未取消的质检单"}
	case errors.Is(err, biz.ErrQualityInspectionSourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "质检来源与业务记录不一致，请刷新来源后重试"}
	case errors.Is(err, biz.ErrQualityInspectionSourceState):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "来源业务记录当前状态不允许发起质检"}
	case errors.Is(err, biz.ErrProductionWIPInvalidRoute):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产路线或质量关口不完整，请刷新生产订单后核对"}
	case errors.Is(err, biz.ErrProductionWIPInvalidTransition):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前在制批次状态已变化，不能重复办理该质量关口，请刷新后重试"}
	case errors.Is(err, biz.ErrProductionWIPQualityGateIncomplete):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "前置质量关口尚未通过，不能越级办理当前检验"}
	case errors.Is(err, biz.ErrShipmentReleaseAlreadySubmitted):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该出货单已提交放行，不能再新增出货前检验"}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[quality] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrQualityInspectionNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "质检单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库行不存在"}
	case errors.Is(err, biz.ErrOutsourcingFactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "委外回货记录不存在"}
	case errors.Is(err, biz.ErrShipmentNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "出货单不存在"}
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
		"id":                          item.ID,
		"inspection_no":               item.InspectionNo,
		"purchase_receipt_id":         positiveIntToAny(item.PurchaseReceiptID),
		"purchase_receipt_item_id":    optionalIntToAny(item.PurchaseReceiptItemID),
		"inventory_lot_id":            positiveIntToAny(item.InventoryLotID),
		"production_wip_batch_id":     optionalIntToAny(item.ProductionWIPBatchID),
		"gate_code":                   optionalStringToAny(item.GateCode),
		"material_id":                 positiveIntToAny(item.MaterialID),
		"warehouse_id":                positiveIntToAny(item.WarehouseID),
		"source_type":                 optionalStringToAny(item.SourceType),
		"source_id":                   optionalIntToAny(item.SourceID),
		"source_no":                   optionalStringToAny(item.SourceNo),
		"inspection_type":             optionalStringToAny(item.InspectionType),
		"subject_type":                optionalStringToAny(item.SubjectType),
		"subject_id":                  optionalIntToAny(item.SubjectID),
		"status":                      item.Status,
		"result":                      optionalStringToAny(item.Result),
		"original_lot_status":         item.OriginalLotStatus,
		"inspected_at":                optionalUnix(item.InspectedAt),
		"inspector_id":                optionalIntToAny(item.InspectorID),
		"defect_rate_operator":        optionalStringToAny(item.DefectRateOperator),
		"defect_rate_percent":         optionalDecimalString(item.DefectRatePercent),
		"decision_note":               optionalStringToAny(item.DecisionNote),
		"correction_of_inspection_id": optionalIntToAny(item.CorrectionOfInspectionID),
		"superseded_at":               optionalUnix(item.SupersededAt),
		"superseded_by":               optionalIntToAny(item.SupersededBy),
		"superseded_reason":           optionalStringToAny(item.SupersededReason),
		"production_order_no":         optionalStringToAny(item.ProductionOrderNo),
		"production_order_item_id":    optionalIntToAny(item.ProductionOrderItemID),
		"product_code":                optionalStringToAny(item.ProductCode),
		"product_name":                optionalStringToAny(item.ProductName),
		"operation_code":              optionalStringToAny(item.OperationCode),
		"operation_name":              optionalStringToAny(item.OperationName),
		"wip_batch_no":                optionalStringToAny(item.WIPBatchNo),
		"batch_quantity":              optionalDecimalString(item.BatchQuantity),
		"created_at":                  item.CreatedAt.Unix(),
		"updated_at":                  item.UpdatedAt.Unix(),
	}
}

func positiveIntToAny(value int) any {
	if value <= 0 {
		return nil
	}
	return value
}
