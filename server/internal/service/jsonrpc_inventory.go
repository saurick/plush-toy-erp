package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleInventory(
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
	case "list_inventory_balances":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.inventoryUC.ListInventoryBalances(ctx, inventoryBalanceFilterFromParams(pm))
		if err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"inventory_balances": inventoryBalancesToAny(items),
			"total":              total,
			"limit":              normalizedLimit(pm),
			"offset":             normalizedOffset(pm),
		}), nil
	case "list_inventory_lots":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		filter, ok := inventoryLotFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListInventoryLots(ctx, filter)
		if err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"inventory_lots": inventoryLotsToAny(items),
			"total":          total,
			"limit":          normalizedLimit(pm),
			"offset":         normalizedOffset(pm),
		}), nil
	case "list_inventory_txns":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		filter, ok := inventoryTxnFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListInventoryTxns(ctx, filter)
		if err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"inventory_txns": inventoryTxnsToAny(items),
			"total":          total,
			"limit":          normalizedLimit(pm),
			"offset":         normalizedOffset(pm),
		}), nil
	default:
		return id, &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知 inventory 接口 method=%s", method)}, nil
	}
}

func inventoryBalanceFilterFromParams(pm map[string]any) biz.InventoryBalanceFilter {
	return biz.InventoryBalanceFilter{
		SubjectType:  getString(pm, "subject_type"),
		SubjectID:    getInt(pm, "subject_id", 0),
		ProductSkuID: getInt(pm, "product_sku_id", 0),
		WarehouseID:  getInt(pm, "warehouse_id", 0),
		LotID:        getInt(pm, "lot_id", 0),
		Keyword:      getString(pm, "keyword"),
		Limit:        getInt(pm, "limit", 50),
		Offset:       getInt(pm, "offset", 0),
	}
}

func inventoryLotFilterFromParams(pm map[string]any) (biz.InventoryLotFilter, bool) {
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.InventoryLotFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.InventoryLotFilter{}, false
	}
	return biz.InventoryLotFilter{
		SubjectType:  getString(pm, "subject_type"),
		SubjectID:    getInt(pm, "subject_id", 0),
		ProductSkuID: getInt(pm, "product_sku_id", 0),
		WarehouseID:  getInt(pm, "warehouse_id", 0),
		Status:       getString(pm, "status"),
		Keyword:      getString(pm, "keyword"),
		DateFrom:     dateFrom,
		DateTo:       dateTo,
		Limit:        getInt(pm, "limit", 50),
		Offset:       getInt(pm, "offset", 0),
	}, true
}

func inventoryTxnFilterFromParams(pm map[string]any) (biz.InventoryTxnFilter, bool) {
	dateFrom, ok := getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return biz.InventoryTxnFilter{}, false
	}
	dateTo, ok := getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return biz.InventoryTxnFilter{}, false
	}
	return biz.InventoryTxnFilter{
		SubjectType:  getString(pm, "subject_type"),
		SubjectID:    getInt(pm, "subject_id", 0),
		ProductSkuID: getInt(pm, "product_sku_id", 0),
		WarehouseID:  getInt(pm, "warehouse_id", 0),
		LotID:        getInt(pm, "lot_id", 0),
		TxnType:      getString(pm, "txn_type"),
		SourceType:   getString(pm, "source_type"),
		SourceID:     getInt(pm, "source_id", 0),
		Keyword:      getString(pm, "keyword"),
		DateFrom:     dateFrom,
		DateTo:       dateTo,
		Limit:        getInt(pm, "limit", 50),
		Offset:       getInt(pm, "offset", 0),
	}, true
}

func (d *jsonrpcDispatcher) mapInventoryError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[inventory] invalid param err=%v", err)
		return invalidParamResult()
	default:
		l.Errorf("[inventory] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func inventoryBalancesToAny(items []*biz.InventoryBalance) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, inventoryBalanceToAny(item))
	}
	return out
}

func inventoryBalanceToAny(item *biz.InventoryBalance) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                       item.ID,
		"subject_type":             item.SubjectType,
		"subject_id":               item.SubjectID,
		"product_sku_id":           optionalIntToAny(item.ProductSkuID),
		"warehouse_id":             item.WarehouseID,
		"lot_id":                   optionalIntToAny(item.LotID),
		"unit_id":                  item.UnitID,
		"quantity":                 item.Quantity.String(),
		"active_reserved_quantity": item.ActiveReservedQuantity.String(),
		"available_quantity":       item.AvailableQuantity.String(),
		"updated_at":               item.UpdatedAt.Unix(),
	}
}

func inventoryLotsToAny(items []*biz.InventoryLot) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, inventoryLotToAny(item))
	}
	return out
}

func inventoryLotToAny(item *biz.InventoryLot) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                item.ID,
		"subject_type":      item.SubjectType,
		"subject_id":        item.SubjectID,
		"product_sku_id":    optionalIntToAny(item.ProductSkuID),
		"lot_no":            item.LotNo,
		"supplier_lot_no":   optionalStringToAny(item.SupplierLotNo),
		"color_no":          optionalStringToAny(item.ColorNo),
		"dye_lot_no":        optionalStringToAny(item.DyeLotNo),
		"production_lot_no": optionalStringToAny(item.ProductionLotNo),
		"status":            item.Status,
		"received_at":       optionalUnix(item.ReceivedAt),
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
	}
}

func inventoryTxnsToAny(items []*biz.InventoryTxn) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, inventoryTxnToAny(item))
	}
	return out
}

func inventoryTxnToAny(item *biz.InventoryTxn) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                 item.ID,
		"subject_type":       item.SubjectType,
		"subject_id":         item.SubjectID,
		"product_sku_id":     optionalIntToAny(item.ProductSkuID),
		"warehouse_id":       item.WarehouseID,
		"lot_id":             optionalIntToAny(item.LotID),
		"txn_type":           item.TxnType,
		"direction":          item.Direction,
		"quantity":           item.Quantity.String(),
		"unit_id":            item.UnitID,
		"source_type":        item.SourceType,
		"source_id":          optionalIntToAny(item.SourceID),
		"source_line_id":     optionalIntToAny(item.SourceLineID),
		"idempotency_key":    item.IdempotencyKey,
		"reversal_of_txn_id": optionalIntToAny(item.ReversalOfTxnID),
		"occurred_at":        item.OccurredAt.Unix(),
		"created_at":         item.CreatedAt.Unix(),
		"created_by":         optionalIntToAny(item.CreatedBy),
		"note":               optionalStringToAny(item.Note),
	}
}
