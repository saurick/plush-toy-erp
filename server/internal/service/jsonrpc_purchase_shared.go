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
)

func unknownPurchaseResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知 purchase 接口 method=%s", method)}
}

func purchaseReceiptFromPurchaseOrderCreateFromParams(pm map[string]any) (*biz.PurchaseReceiptFromPurchaseOrderCreate, bool) {
	if _, ok := pm["business_record_id"]; ok {
		return nil, false
	}
	if _, ok := pm["idempotency_payload_hash"]; ok {
		return nil, false
	}
	if _, ok := pm["supplier_id"]; ok {
		return nil, false
	}
	receivedAt, ok := getOptionalJSONRPCTime(pm, "received_at")
	if !ok {
		return nil, false
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if idempotencyKey == "" {
		return nil, false
	}
	return &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: getInt(pm, "purchase_order_id", 0),
		ReceiptNo:       getString(pm, "receipt_no"),
		WarehouseID:     getInt(pm, "warehouse_id", 0),
		ReceivedAt:      optionalTimeValue(receivedAt),
		Note:            getWorkflowStringPtr(pm, "note"),
		IdempotencyKey:  idempotencyKey,
	}, true
}

func purchaseReceiptItemCreateFromParams(pm map[string]any) (*biz.PurchaseReceiptItemCreate, bool) {
	if _, ok := pm["idempotency_payload_hash"]; ok {
		return nil, false
	}
	quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "quantity")
	if !ok {
		return nil, false
	}
	unitPrice, ok := getOptionalJSONRPCDecimalString(pm, "unit_price")
	if !ok {
		return nil, false
	}
	amount, ok := getOptionalJSONRPCDecimalString(pm, "amount")
	if !ok {
		return nil, false
	}
	return &biz.PurchaseReceiptItemCreate{
		ReceiptID:           getInt(pm, "receipt_id", 0),
		MaterialID:          getInt(pm, "material_id", 0),
		WarehouseID:         getInt(pm, "warehouse_id", 0),
		UnitID:              getInt(pm, "unit_id", 0),
		LotID:               getOptionalInt(pm, "lot_id"),
		PurchaseOrderItemID: getOptionalInt(pm, "purchase_order_item_id"),
		LotNo:               getWorkflowStringPtr(pm, "lot_no"),
		Quantity:            quantity,
		UnitPrice:           unitPrice,
		Amount:              amount,
		SourceLineNo:        getWorkflowStringPtr(pm, "source_line_no"),
		Note:                getWorkflowStringPtr(pm, "note"),
		IdempotencyKey:      strings.TrimSpace(getString(pm, "idempotency_key")),
	}, true
}

func purchaseReceiptFilterFromParams(pm map[string]any) (biz.PurchaseReceiptFilter, bool) {
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.PurchaseReceiptFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.PurchaseReceiptFilter{}, false
	}
	return biz.PurchaseReceiptFilter{
		Status:              getString(pm, "status"),
		Keyword:             getString(pm, "keyword"),
		SupplierID:          getInt(pm, "supplier_id", 0),
		SupplierName:        getString(pm, "supplier_name"),
		DateFrom:            dateFrom,
		DateTo:              dateTo,
		MaterialID:          getInt(pm, "material_id", 0),
		WarehouseID:         getInt(pm, "warehouse_id", 0),
		LotID:               getInt(pm, "lot_id", 0),
		PurchaseOrderID:     getInt(pm, "purchase_order_id", 0),
		PurchaseOrderItemID: getInt(pm, "purchase_order_item_id", 0),
		Limit:               getInt(pm, "limit", 50),
		Offset:              getInt(pm, "offset", 0),
	}, true
}

func purchaseReceiptResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseReceipt, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseError(ctx, err)
	}
	return okData(map[string]any{"purchase_receipt": purchaseReceiptToAny(item)})
}

func purchaseReceiptItemResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseReceiptItem, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseError(ctx, err)
	}
	return okData(map[string]any{"purchase_receipt_item": purchaseReceiptItemToAny(item)})
}

func (d *jsonrpcDispatcher) mapPurchaseError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrIdempotencyConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: errcode.IdempotencyConflict.Message}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[purchase] invalid param err=%v", err)
		return invalidParamResult()
	case errors.Is(err, biz.ErrPurchaseReceiptNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库行不存在"}
	case errors.Is(err, biz.ErrPurchaseReturnNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购退货单不存在"}
	case errors.Is(err, biz.ErrPurchaseReturnItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购退货行不存在"}
	case errors.Is(err, biz.ErrPurchaseReturnQualitySourceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "不合格质检与采购入库、入库行或批次不一致，请刷新来源后重试"}
	case errors.Is(err, biz.ErrPurchaseReturnQualitySourceState):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "仅已驳回且仍处于不合格批次状态的来料质检可生成采购退货"}
	case errors.Is(err, biz.ErrPurchaseReturnQualitySourceConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: "该不合格质检已生成未取消的采购退货单"}
	case errors.Is(err, biz.ErrPurchaseReturnQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "本次退货数量超过该入库行剩余可退数量"}
	case errors.Is(err, biz.ErrPurchaseReceiptAdjustmentNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库调整单不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptAdjustmentItemNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库调整行不存在"}
	case errors.Is(err, biz.ErrPurchaseReceiptCorrectionDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库仍有未取消的退货或调整单，不能取消"}
	case errors.Is(err, biz.ErrPurchaseReceiptQualityPending):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "来料质检尚未逐行完成，不能入库过账"}
	case errors.Is(err, biz.ErrPurchaseReceiptQualityRejected):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "来料质检存在拒收行，不能入库过账"}
	case errors.Is(err, biz.ErrPurchaseOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购订单不存在"}
	case errors.Is(err, biz.ErrMaterialNotFound), errors.Is(err, biz.ErrMaterialInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该材料已停用，不能新增引用；历史入库仍保留原引用"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该单位已停用，不能新增引用；历史入库仍保留原引用"}
	case errors.Is(err, biz.ErrWarehouseNotFound), errors.Is(err, biz.ErrWarehouseInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该仓库已停用，不能用于新入库"}
	case errors.Is(err, biz.ErrInventoryLotNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存批次不存在"}
	case errors.Is(err, biz.ErrInventoryTxnNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库库存流水不存在"}
	case errors.Is(err, biz.ErrInventoryInsufficientStock):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "库存不足，无法完成本次采购库存操作"}
	case errors.Is(err, biz.ErrInventoryLotStatusBlocked):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前批次状态不允许扣减库存"}
	case ent.IsConstraintError(err):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "采购入库、退货或调整单号及行号已存在"}
	default:
		l.Errorf("[purchase] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func purchaseReceiptsToAny(items []*biz.PurchaseReceipt) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, purchaseReceiptToAny(item))
	}
	return out
}

func purchaseReceiptToAny(item *biz.PurchaseReceipt) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	lines := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		lines = append(lines, purchaseReceiptItemToAny(line))
	}
	qualityInspections := make([]any, 0, len(item.QualityInspections))
	for _, inspection := range item.QualityInspections {
		qualityInspections = append(qualityInspections, qualityInspectionToAny(inspection))
	}
	return map[string]any{
		"id":                  item.ID,
		"receipt_no":          item.ReceiptNo,
		"purchase_order_id":   optionalIntToAny(item.PurchaseOrderID),
		"purchase_order_no":   optionalStringToAny(item.PurchaseOrderNo),
		"supplier_id":         optionalIntToAny(item.SupplierID),
		"supplier_name":       item.SupplierName,
		"status":              item.Status,
		"received_at":         item.ReceivedAt.Unix(),
		"posted_at":           optionalUnix(item.PostedAt),
		"note":                optionalStringToAny(item.Note),
		"items":               lines,
		"quality_inspections": qualityInspections,
		"created_at":          item.CreatedAt.Unix(),
		"updated_at":          item.UpdatedAt.Unix(),
	}
}

func purchaseReceiptItemToAny(item *biz.PurchaseReceiptItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                     item.ID,
		"receipt_id":             item.ReceiptID,
		"material_id":            item.MaterialID,
		"warehouse_id":           item.WarehouseID,
		"unit_id":                item.UnitID,
		"lot_id":                 optionalIntToAny(item.LotID),
		"purchase_order_item_id": optionalIntToAny(item.PurchaseOrderItemID),
		"lot_no":                 optionalStringToAny(item.LotNo),
		"quantity":               item.Quantity.String(),
		"unit_price":             optionalDecimalString(item.UnitPrice),
		"amount":                 optionalDecimalString(item.Amount),
		"source_line_no":         optionalStringToAny(item.SourceLineNo),
		"note":                   optionalStringToAny(item.Note),
		"created_at":             item.CreatedAt.Unix(),
		"updated_at":             item.UpdatedAt.Unix(),
	}
}
