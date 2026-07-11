package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOperationalFactShipment(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_shipment_with_items", "createShipmentWithItems":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments"); res != nil {
			return id, res, nil
		}
		in, ok := shipmentCreateWithItemsFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateShipmentDraftWithItems(ctx, in)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "ship_shipment", "shipShipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentShip); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.ShipShipment(ctx, getInt(pm, "id", 0))
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "cancel_shipment", "cancelShipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCancel); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments", "inventory"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelShippedShipmentWithActor(ctx, getInt(pm, "id", 0), actorID)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "list_shipments", "listShipments":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentRead); res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactShipmentFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListShipments(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"shipments": shipmentsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func shipmentCreateFromParams(pm map[string]any) *biz.ShipmentCreate {
	plannedShipAt, _ := getOptionalJSONRPCTime(pm, "planned_ship_at")
	return &biz.ShipmentCreate{
		ShipmentNo:       getString(pm, "shipment_no"),
		SalesOrderID:     getOptionalInt(pm, "sales_order_id"),
		CustomerID:       getOptionalInt(pm, "customer_id"),
		CustomerSnapshot: getWorkflowStringPtr(pm, "customer_snapshot"),
		IdempotencyKey:   getString(pm, "idempotency_key"),
		PlannedShipAt:    plannedShipAt,
		Note:             getWorkflowStringPtr(pm, "note"),
	}
}

func shipmentItemCreateFromParams(pm map[string]any) (*biz.ShipmentItemCreate, bool) {
	quantity, ok := getRequiredJSONRPCDecimal(pm, "quantity")
	if !ok {
		return nil, false
	}
	return &biz.ShipmentItemCreate{
		SalesOrderItemID: getOptionalInt(pm, "sales_order_item_id"),
		ProductID:        getInt(pm, "product_id", 0),
		ProductSkuID:     getOptionalInt(pm, "product_sku_id"),
		WarehouseID:      getInt(pm, "warehouse_id", 0),
		UnitID:           getInt(pm, "unit_id", 0),
		LotID:            getOptionalInt(pm, "lot_id"),
		Quantity:         quantity,
		Note:             getWorkflowStringPtr(pm, "note"),
	}, true
}

func shipmentCreateWithItemsFromParams(pm map[string]any) (*biz.ShipmentCreateWithItems, bool) {
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]*biz.ShipmentItemCreate, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemParams, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		item, ok := shipmentItemCreateFromParams(itemParams)
		if !ok {
			return nil, false
		}
		items = append(items, item)
	}
	return &biz.ShipmentCreateWithItems{
		Shipment: shipmentCreateFromParams(pm),
		Items:    items,
	}, true
}

func operationalFactShipmentResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Shipment, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"shipment": shipmentToAny(item)})
}

func shipmentsToAny(items []*biz.Shipment) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, shipmentToAny(item))
	}
	return out
}

func shipmentToAny(item *biz.Shipment) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	lines := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		lines = append(lines, shipmentItemToAny(line))
	}
	return map[string]any{"id": item.ID, "shipment_no": item.ShipmentNo, "sales_order_id": optionalIntToAny(item.SalesOrderID), "customer_id": optionalIntToAny(item.CustomerID), "customer_snapshot": optionalStringToAny(item.CustomerSnapshot), "status": item.Status, "idempotency_key": item.IdempotencyKey, "planned_ship_at": optionalUnix(item.PlannedShipAt), "shipped_at": optionalUnix(item.ShippedAt), "note": optionalStringToAny(item.Note), "items": lines, "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func shipmentItemToAny(item *biz.ShipmentItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "shipment_id": item.ShipmentID, "sales_order_item_id": optionalIntToAny(item.SalesOrderItemID), "product_id": item.ProductID, "product_sku_id": optionalIntToAny(item.ProductSkuID), "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
