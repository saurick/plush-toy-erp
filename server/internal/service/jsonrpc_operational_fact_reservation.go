package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOperationalFactReservation(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_stock_reservation":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionSalesOrderUpdate, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "inventory"); res != nil {
			return id, res, nil
		}
		in, ok := stockReservationCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateStockReservation(ctx, in)
		return id, operationalFactStockReservationResult(ctx, d, item, err), nil
	case "release_stock_reservation":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionSalesOrderUpdate, biz.PermissionWarehouseOutboundConfirm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.ReleaseStockReservation(ctx, getInt(pm, "id", 0))
		return id, operationalFactStockReservationResult(ctx, d, item, err), nil
	case "list_stock_reservations":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionWarehouseInventoryRead, biz.PermissionSalesOrderRead); res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListStockReservations(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"stock_reservations": stockReservationsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func stockReservationCreateFromParams(pm map[string]any) (*biz.StockReservationCreate, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	reservedAt, ok := getOptionalJSONRPCTime(pm, "reserved_at")
	if !ok {
		return nil, false
	}
	return &biz.StockReservationCreate{
		ReservationNo:    getString(pm, "reservation_no"),
		SalesOrderID:     getOptionalInt(pm, "sales_order_id"),
		SalesOrderItemID: getOptionalInt(pm, "sales_order_item_id"),
		ProductID:        getInt(pm, "product_id", 0),
		ProductSkuID:     getOptionalInt(pm, "product_sku_id"),
		WarehouseID:      getInt(pm, "warehouse_id", 0),
		UnitID:           getInt(pm, "unit_id", 0),
		LotID:            getOptionalInt(pm, "lot_id"),
		Quantity:         quantity,
		IdempotencyKey:   getString(pm, "idempotency_key"),
		ReservedAt:       optionalTimeValue(reservedAt),
		Note:             getWorkflowStringPtr(pm, "note"),
	}, true
}

func operationalFactStockReservationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.StockReservation, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"stock_reservation": stockReservationToAny(item)})
}

func stockReservationsToAny(items []*biz.StockReservation) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, stockReservationToAny(item))
	}
	return out
}

func stockReservationToAny(item *biz.StockReservation) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "reservation_no": item.ReservationNo, "status": item.Status, "sales_order_id": optionalIntToAny(item.SalesOrderID), "sales_order_item_id": optionalIntToAny(item.SalesOrderItemID), "product_id": item.ProductID, "product_sku_id": optionalIntToAny(item.ProductSkuID), "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "idempotency_key": item.IdempotencyKey, "reserved_at": item.ReservedAt.Unix(), "released_at": optionalUnix(item.ReleasedAt), "consumed_at": optionalUnix(item.ConsumedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
