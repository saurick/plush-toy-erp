package service

import (
	"context"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func purchaseReturnFromReceiptCreateFromParams(pm map[string]any) (*biz.PurchaseReturnFromReceiptCreate, bool) {
	if !jsonRPCParamsAllowed(pm, "return_no", "purchase_receipt_id", "returned_at", "note", "idempotency_key", "items", "customer_key") {
		return nil, false
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if idempotencyKey == "" {
		return nil, false
	}
	receiptID, ok := getRequiredJSONRPCPositiveInt(pm, "purchase_receipt_id")
	if !ok {
		return nil, false
	}
	returnedAt, ok := getRequiredJSONRPCTime(pm, "returned_at")
	if !ok {
		return nil, false
	}
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]biz.PurchaseReturnFromReceiptItemCreate, 0, len(rawItems))
	for _, raw := range rawItems {
		itemMap, ok := raw.(map[string]any)
		if !ok || !jsonRPCParamsAllowed(itemMap, "purchase_receipt_item_id", "quantity", "note") {
			return nil, false
		}
		itemID, ok := getRequiredJSONRPCPositiveInt(itemMap, "purchase_receipt_item_id")
		if !ok {
			return nil, false
		}
		quantity, ok := getRequiredJSONRPCDecimal(itemMap, "quantity")
		if !ok {
			return nil, false
		}
		items = append(items, biz.PurchaseReturnFromReceiptItemCreate{
			PurchaseReceiptItemID: itemID,
			Quantity:              quantity,
			Note:                  getWorkflowStringPtr(itemMap, "note"),
		})
	}
	return &biz.PurchaseReturnFromReceiptCreate{
		ReturnNo:          getString(pm, "return_no"),
		PurchaseReceiptID: receiptID,
		ReturnedAt:        returnedAt,
		Note:              getWorkflowStringPtr(pm, "note"),
		IdempotencyKey:    idempotencyKey,
		Items:             items,
	}, true
}

func purchaseReturnFromQualityInspectionCreateFromParams(pm map[string]any) (*biz.PurchaseReturnFromQualityInspectionCreate, bool) {
	if !jsonRPCParamsAllowed(pm, "return_no", "quality_inspection_id", "quantity", "returned_at", "reason", "note", "idempotency_key", "customer_key") {
		return nil, false
	}
	qualityInspectionID, ok := getRequiredJSONRPCPositiveInt(pm, "quality_inspection_id")
	if !ok {
		return nil, false
	}
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	returnedAt, ok := getRequiredJSONRPCTime(pm, "returned_at")
	if !ok {
		return nil, false
	}
	return &biz.PurchaseReturnFromQualityInspectionCreate{
		ReturnNo:            getString(pm, "return_no"),
		QualityInspectionID: qualityInspectionID,
		Quantity:            quantity,
		ReturnedAt:          returnedAt,
		Reason:              getString(pm, "reason"),
		Note:                getWorkflowStringPtr(pm, "note"),
		IdempotencyKey:      strings.TrimSpace(getString(pm, "idempotency_key")),
	}, true
}

func purchaseReceiptAdjustmentFromReceiptCreateFromParams(pm map[string]any) (*biz.PurchaseReceiptAdjustmentFromReceiptCreate, bool) {
	if !jsonRPCParamsAllowed(pm, "adjustment_no", "purchase_receipt_id", "reason", "adjusted_at", "note", "idempotency_key", "items", "customer_key") {
		return nil, false
	}
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if idempotencyKey == "" {
		return nil, false
	}
	receiptID, ok := getRequiredJSONRPCPositiveInt(pm, "purchase_receipt_id")
	if !ok {
		return nil, false
	}
	adjustedAt, ok := getRequiredJSONRPCTime(pm, "adjusted_at")
	if !ok {
		return nil, false
	}
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]biz.PurchaseReceiptAdjustmentFromReceiptItemCreate, 0, len(rawItems))
	for _, raw := range rawItems {
		itemMap, ok := raw.(map[string]any)
		if !ok || !jsonRPCParamsAllowed(itemMap, "purchase_receipt_item_id", "adjust_type", "quantity", "warehouse_id", "lot_id", "correction_group", "note") {
			return nil, false
		}
		itemID, ok := getRequiredJSONRPCPositiveInt(itemMap, "purchase_receipt_item_id")
		if !ok {
			return nil, false
		}
		quantity, ok := getRequiredJSONRPCDecimal(itemMap, "quantity")
		if !ok {
			return nil, false
		}
		items = append(items, biz.PurchaseReceiptAdjustmentFromReceiptItemCreate{
			PurchaseReceiptItemID: itemID,
			AdjustType:            getString(itemMap, "adjust_type"),
			Quantity:              quantity,
			WarehouseID:           getInt(itemMap, "warehouse_id", 0),
			LotID:                 getOptionalInt(itemMap, "lot_id"),
			CorrectionGroup:       getWorkflowStringPtr(itemMap, "correction_group"),
			Note:                  getWorkflowStringPtr(itemMap, "note"),
		})
	}
	return &biz.PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo:      getString(pm, "adjustment_no"),
		PurchaseReceiptID: receiptID,
		Reason:            getWorkflowStringPtr(pm, "reason"),
		AdjustedAt:        adjustedAt,
		Note:              getWorkflowStringPtr(pm, "note"),
		IdempotencyKey:    idempotencyKey,
		Items:             items,
	}, true
}

func purchaseReturnFilterFromParams(pm map[string]any) (biz.PurchaseReturnFilter, bool) {
	if !jsonRPCParamsAllowed(pm, "status", "keyword", "supplier_name", "purchase_receipt_id", "quality_inspection_id", "material_id", "warehouse_id", "lot_id", "date_from", "date_to", "limit", "offset") {
		return biz.PurchaseReturnFilter{}, false
	}
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.PurchaseReturnFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.PurchaseReturnFilter{}, false
	}
	return biz.PurchaseReturnFilter{
		Status:              getString(pm, "status"),
		Keyword:             getString(pm, "keyword"),
		SupplierName:        getString(pm, "supplier_name"),
		PurchaseReceiptID:   getInt(pm, "purchase_receipt_id", 0),
		QualityInspectionID: getInt(pm, "quality_inspection_id", 0),
		MaterialID:          getInt(pm, "material_id", 0),
		WarehouseID:         getInt(pm, "warehouse_id", 0),
		LotID:               getInt(pm, "lot_id", 0),
		DateFrom:            dateFrom,
		DateTo:              dateTo,
		Limit:               getInt(pm, "limit", 50),
		Offset:              getInt(pm, "offset", 0),
	}, true
}

func purchaseReceiptAdjustmentFilterFromParams(pm map[string]any) (biz.PurchaseReceiptAdjustmentFilter, bool) {
	if !jsonRPCParamsAllowed(pm, "status", "keyword", "purchase_receipt_id", "adjust_type", "material_id", "warehouse_id", "lot_id", "date_from", "date_to", "limit", "offset") {
		return biz.PurchaseReceiptAdjustmentFilter{}, false
	}
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.PurchaseReceiptAdjustmentFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.PurchaseReceiptAdjustmentFilter{}, false
	}
	return biz.PurchaseReceiptAdjustmentFilter{
		Status:            getString(pm, "status"),
		Keyword:           getString(pm, "keyword"),
		PurchaseReceiptID: getInt(pm, "purchase_receipt_id", 0),
		AdjustType:        getString(pm, "adjust_type"),
		MaterialID:        getInt(pm, "material_id", 0),
		WarehouseID:       getInt(pm, "warehouse_id", 0),
		LotID:             getInt(pm, "lot_id", 0),
		DateFrom:          dateFrom,
		DateTo:            dateTo,
		Limit:             getInt(pm, "limit", 50),
		Offset:            getInt(pm, "offset", 0),
	}, true
}

func jsonRPCParamsAllowed(pm map[string]any, keys ...string) bool {
	allowed := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		allowed[key] = struct{}{}
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
}

func purchaseReturnResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseReturn, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseError(ctx, err)
	}
	return okData(map[string]any{"purchase_return": purchaseReturnToAny(item)})
}

func purchaseReceiptAdjustmentResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.PurchaseReceiptAdjustment, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapPurchaseError(ctx, err)
	}
	return okData(map[string]any{"purchase_receipt_adjustment": purchaseReceiptAdjustmentToAny(item)})
}

func purchaseReturnsToAny(items []*biz.PurchaseReturn) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, purchaseReturnToAny(item))
	}
	return out
}

func purchaseReturnToAny(item *biz.PurchaseReturn) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	items := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		items = append(items, purchaseReturnItemToAny(line))
	}
	return map[string]any{
		"id":                    item.ID,
		"return_no":             item.ReturnNo,
		"purchase_receipt_id":   optionalIntToAny(item.PurchaseReceiptID),
		"quality_inspection_id": optionalIntToAny(item.QualityInspectionID),
		"supplier_name":         item.SupplierName,
		"return_reason":         optionalStringToAny(item.ReturnReason),
		"status":                item.Status,
		"returned_at":           item.ReturnedAt.Unix(),
		"posted_at":             optionalUnix(item.PostedAt),
		"note":                  optionalStringToAny(item.Note),
		"items":                 items,
		"created_at":            item.CreatedAt.Unix(),
		"updated_at":            item.UpdatedAt.Unix(),
	}
}

func purchaseReturnItemToAny(item *biz.PurchaseReturnItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                       item.ID,
		"return_id":                item.ReturnID,
		"purchase_receipt_item_id": optionalIntToAny(item.PurchaseReceiptItemID),
		"material_id":              item.MaterialID,
		"warehouse_id":             item.WarehouseID,
		"unit_id":                  item.UnitID,
		"lot_id":                   optionalIntToAny(item.LotID),
		"quantity":                 item.Quantity.String(),
		"unit_price":               optionalDecimalString(item.UnitPrice),
		"amount":                   optionalDecimalString(item.Amount),
		"source_line_no":           optionalStringToAny(item.SourceLineNo),
		"note":                     optionalStringToAny(item.Note),
		"created_at":               item.CreatedAt.Unix(),
		"updated_at":               item.UpdatedAt.Unix(),
	}
}

func purchaseReceiptAdjustmentsToAny(items []*biz.PurchaseReceiptAdjustment) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, purchaseReceiptAdjustmentToAny(item))
	}
	return out
}

func purchaseReceiptAdjustmentToAny(item *biz.PurchaseReceiptAdjustment) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	items := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		items = append(items, purchaseReceiptAdjustmentItemToAny(line))
	}
	return map[string]any{
		"id":                  item.ID,
		"adjustment_no":       item.AdjustmentNo,
		"purchase_receipt_id": item.PurchaseReceiptID,
		"reason":              optionalStringToAny(item.Reason),
		"status":              item.Status,
		"adjusted_at":         item.AdjustedAt.Unix(),
		"posted_at":           optionalUnix(item.PostedAt),
		"note":                optionalStringToAny(item.Note),
		"items":               items,
		"created_at":          item.CreatedAt.Unix(),
		"updated_at":          item.UpdatedAt.Unix(),
	}
}

func purchaseReceiptAdjustmentItemToAny(item *biz.PurchaseReceiptAdjustmentItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                       item.ID,
		"adjustment_id":            item.AdjustmentID,
		"purchase_receipt_item_id": item.PurchaseReceiptItemID,
		"adjust_type":              item.AdjustType,
		"material_id":              item.MaterialID,
		"warehouse_id":             item.WarehouseID,
		"unit_id":                  item.UnitID,
		"lot_id":                   optionalIntToAny(item.LotID),
		"quantity":                 item.Quantity.String(),
		"source_line_no":           optionalStringToAny(item.SourceLineNo),
		"correction_group":         optionalStringToAny(item.CorrectionGroup),
		"note":                     optionalStringToAny(item.Note),
		"created_at":               item.CreatedAt.Unix(),
		"updated_at":               item.UpdatedAt.Unix(),
	}
}
