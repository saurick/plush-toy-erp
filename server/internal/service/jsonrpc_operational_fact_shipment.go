package service

import (
	"context"
	"strings"
	"time"

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
	case "list_shipment_source_candidates":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, "", "shipments"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "sales_orders"); res != nil {
			return id, res, nil
		}
		filter, ok := shipmentSourceCandidateFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListShipmentSourceCandidates(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"shipment_source_candidates": shipmentSourceCandidatesToAny(items),
			"total":                      total,
			"limit":                      filter.Limit,
			"offset":                     filter.Offset,
		}), nil
	case "create_shipment_with_items":
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
		if shipmentCreateUsesSalesOrderSource(in) {
			if res := d.requireSourceActionReadPermissions(
				ctx,
				"operational_fact",
				method,
				biz.SourceReadConditionShipmentSalesOrder,
			); res != nil {
				return id, res, nil
			}
			if res := d.requireCustomerConfigModulesReadable(ctx, "sales_orders"); res != nil {
				return id, res, nil
			}
		}
		item, err := d.operationalFactUC.CreateShipmentDraftWithItems(ctx, in)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "submit_shipment_release":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if !shipmentItemAllowsOnly(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments", "workflow_tasks"); res != nil {
			return id, res, nil
		}
		task, created, err := d.operationalFactUC.SubmitShipmentRelease(ctx, getInt(pm, "id", 0), actorID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"workflow_task": workflowTaskToMap(task), "created": created}), nil
	case "ship_shipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentShip); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments", "inventory", "workflow_tasks"); res != nil {
			return id, res, nil
		}
		shipmentID := getInt(pm, "id", 0)
		if err := d.operationalFactUC.ValidateShipmentReleaseForShipping(ctx, shipmentID); err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		item, err := d.operationalFactUC.ShipShipmentWithActor(ctx, shipmentID, actorID)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "cancel_shipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCancel); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "shipments", "inventory", workflowModuleKeyTasks); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelShippedShipmentWithActor(ctx, getInt(pm, "id", 0), actorID)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "get_shipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentRead); res != nil {
			return id, res, nil
		}
		if !shipmentItemAllowsOnly(pm, "id") {
			return id, invalidParamResult(), nil
		}
		shipmentID, ok := getRequiredJSONRPCPositiveInt(pm, "id")
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.GetShipment(ctx, shipmentID)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	case "list_shipments":
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

func shipmentCreateUsesSalesOrderSource(in *biz.ShipmentCreateWithItems) bool {
	if in == nil || in.Shipment == nil {
		return false
	}
	if in.Shipment.SalesOrderID != nil {
		return true
	}
	for _, item := range in.Items {
		if item != nil && item.SalesOrderItemID != nil {
			return true
		}
	}
	return false
}

func shipmentCreateFromParams(pm map[string]any) (*biz.ShipmentCreate, bool) {
	plannedShipAt, ok := getOptionalShipmentTime(pm, "planned_ship_at")
	if !ok {
		return nil, false
	}
	totalNetWeightG, ok := getOptionalJSONRPCDecimalString(pm, "total_net_weight_g")
	if !ok {
		return nil, false
	}
	salesOrderID, ok := getOptionalShipmentPositiveInt(pm, "sales_order_id")
	if !ok {
		return nil, false
	}
	customerID, ok := getOptionalShipmentPositiveInt(pm, "customer_id")
	if !ok {
		return nil, false
	}
	customerSnapshot, ok := getOptionalShipmentString(pm, "customer_snapshot")
	if !ok {
		return nil, false
	}
	note, ok := getOptionalShipmentString(pm, "note")
	if !ok {
		return nil, false
	}
	return &biz.ShipmentCreate{
		ShipmentNo:       getString(pm, "shipment_no"),
		SalesOrderID:     salesOrderID,
		CustomerID:       customerID,
		CustomerSnapshot: customerSnapshot,
		IdempotencyKey:   getString(pm, "idempotency_key"),
		PlannedShipAt:    plannedShipAt,
		TotalNetWeightG:  totalNetWeightG,
		Note:             note,
	}, true
}

func shipmentItemCreateFromParams(pm map[string]any) (*biz.ShipmentItemCreate, bool) {
	if !shipmentItemAllowsOnly(pm,
		"sales_order_item_id",
		"product_id",
		"product_sku_id",
		"warehouse_id",
		"unit_id",
		"lot_id",
		"quantity",
		"note",
	) {
		return nil, false
	}
	quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "quantity")
	if !ok {
		return nil, false
	}
	salesOrderItemID, ok := getOptionalShipmentPositiveInt(pm, "sales_order_item_id")
	if !ok {
		return nil, false
	}
	productID, ok := getRequiredJSONRPCPositiveInt(pm, "product_id")
	if !ok {
		return nil, false
	}
	productSkuID, ok := getOptionalShipmentPositiveInt(pm, "product_sku_id")
	if !ok {
		return nil, false
	}
	warehouseID, ok := getRequiredJSONRPCPositiveInt(pm, "warehouse_id")
	if !ok {
		return nil, false
	}
	unitID, ok := getRequiredJSONRPCPositiveInt(pm, "unit_id")
	if !ok {
		return nil, false
	}
	lotID, ok := getOptionalShipmentPositiveInt(pm, "lot_id")
	if !ok {
		return nil, false
	}
	note, ok := getOptionalShipmentString(pm, "note")
	if !ok {
		return nil, false
	}
	return &biz.ShipmentItemCreate{
		SalesOrderItemID: salesOrderItemID,
		ProductID:        productID,
		ProductSkuID:     productSkuID,
		WarehouseID:      warehouseID,
		UnitID:           unitID,
		LotID:            lotID,
		Quantity:         quantity,
		Note:             note,
	}, true
}

func shipmentItemAllowsOnly(pm map[string]any, keys ...string) bool {
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

func shipmentCreateWithItemsFromParams(pm map[string]any) (*biz.ShipmentCreateWithItems, bool) {
	if !shipmentItemAllowsOnly(pm,
		"customer_key",
		"shipment_no",
		"sales_order_id",
		"customer_id",
		"customer_snapshot",
		"idempotency_key",
		"planned_ship_at",
		"total_net_weight_g",
		"note",
		"items",
	) {
		return nil, false
	}
	if raw, exists := pm["customer_key"]; exists {
		if _, ok := raw.(string); !ok {
			return nil, false
		}
	}
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
	shipment, ok := shipmentCreateFromParams(pm)
	if !ok {
		return nil, false
	}
	return &biz.ShipmentCreateWithItems{
		Shipment: shipment,
		Items:    items,
	}, true
}

func shipmentSourceCandidateFilterFromParams(pm map[string]any) (biz.ShipmentSourceCandidateFilter, bool) {
	if !shipmentItemAllowsOnly(pm, "keyword", "sales_order_id", "limit", "offset") {
		return biz.ShipmentSourceCandidateFilter{}, false
	}
	keyword := ""
	if raw, exists := pm["keyword"]; exists {
		value, ok := raw.(string)
		if !ok {
			return biz.ShipmentSourceCandidateFilter{}, false
		}
		keyword = value
	}
	salesOrderID := 0
	if _, exists := pm["sales_order_id"]; exists {
		value, ok := getRequiredJSONRPCPositiveInt(pm, "sales_order_id")
		if !ok {
			return biz.ShipmentSourceCandidateFilter{}, false
		}
		salesOrderID = value
	}
	limit := 50
	if _, exists := pm["limit"]; exists {
		value, ok := getRequiredJSONRPCPositiveInt(pm, "limit")
		if !ok || value > 200 {
			return biz.ShipmentSourceCandidateFilter{}, false
		}
		limit = value
	}
	offset := 0
	if _, exists := pm["offset"]; exists {
		value, ok := getRequiredJSONRPCNonNegativeInt(pm, "offset")
		if !ok {
			return biz.ShipmentSourceCandidateFilter{}, false
		}
		offset = value
	}
	return biz.ShipmentSourceCandidateFilter{
		Keyword:      keyword,
		SalesOrderID: salesOrderID,
		Limit:        limit,
		Offset:       offset,
	}, true
}

func getRequiredJSONRPCNonNegativeInt(pm map[string]any, key string) (int, bool) {
	const maxJSONSafeInteger = float64(9007199254740991)
	raw, ok := pm[key]
	if !ok || raw == nil {
		return 0, false
	}
	switch value := raw.(type) {
	case float64:
		if value < 0 || value > maxJSONSafeInteger || value != float64(int64(value)) {
			return 0, false
		}
		return int(value), true
	case int:
		return value, value >= 0
	default:
		return 0, false
	}
}

func getOptionalShipmentPositiveInt(pm map[string]any, key string) (*int, bool) {
	raw, exists := pm[key]
	if !exists || raw == nil {
		return nil, true
	}
	value, ok := getRequiredJSONRPCPositiveInt(pm, key)
	if !ok {
		return nil, false
	}
	return &value, true
}

func getOptionalShipmentString(pm map[string]any, key string) (*string, bool) {
	raw, exists := pm[key]
	if !exists || raw == nil {
		return nil, true
	}
	value, ok := raw.(string)
	if !ok {
		return nil, false
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, true
	}
	return &value, true
}

func getOptionalShipmentTime(pm map[string]any, key string) (*time.Time, bool) {
	raw, exists := pm[key]
	if !exists || raw == nil {
		return nil, true
	}
	if numeric, ok := raw.(float64); ok && numeric != float64(int64(numeric)) {
		return nil, false
	}
	return getOptionalJSONRPCTime(pm, key)
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

func shipmentSourceCandidatesToAny(items []*biz.ShipmentSourceCandidate) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, shipmentSourceCandidateToAny(item))
	}
	return out
}

func shipmentSourceCandidateToAny(item *biz.ShipmentSourceCandidate) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"sales_order_id":        item.SalesOrderID,
		"order_no":              item.OrderNo,
		"order_status":          item.OrderStatus,
		"order_version":         item.OrderVersion,
		"customer_id":           item.CustomerID,
		"customer_snapshot":     item.CustomerSnapshot,
		"customer_name":         item.CustomerName,
		"sales_order_item_id":   item.SalesOrderItemID,
		"line_no":               item.LineNo,
		"line_status":           item.LineStatus,
		"product_id":            item.ProductID,
		"product_sku_id":        optionalIntToAny(item.ProductSkuID),
		"product_code":          item.ProductCode,
		"product_name":          item.ProductName,
		"product_code_snapshot": optionalStringToAny(item.ProductCodeSnapshot),
		"product_name_snapshot": optionalStringToAny(item.ProductNameSnapshot),
		"color_snapshot":        optionalStringToAny(item.ColorSnapshot),
		"sku_code":              optionalStringToAny(item.SKUCode),
		"sku_name":              optionalStringToAny(item.SKUName),
		"unit_id":               item.UnitID,
		"unit_code":             item.UnitCode,
		"unit_name":             item.UnitName,
		"ordered_quantity":      item.OrderedQuantity.String(),
		"shipped_quantity":      item.ShippedQuantity.String(),
		"remaining_quantity":    item.RemainingQuantity.String(),
		"selectable":            item.Selectable,
		"disabled_reason":       item.DisabledReason,
	}
}

func shipmentToAny(item *biz.Shipment) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	lines := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		lines = append(lines, shipmentItemToAny(line))
	}
	return map[string]any{"id": item.ID, "shipment_no": item.ShipmentNo, "sales_order_id": optionalIntToAny(item.SalesOrderID), "customer_id": optionalIntToAny(item.CustomerID), "customer_snapshot": optionalStringToAny(item.CustomerSnapshot), "status": item.Status, "idempotency_key": item.IdempotencyKey, "planned_ship_at": optionalUnix(item.PlannedShipAt), "shipped_at": optionalUnix(item.ShippedAt), "total_net_weight_g": optionalDecimalString(item.TotalNetWeightG), "note": optionalStringToAny(item.Note), "items": lines, "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}

func shipmentItemToAny(item *biz.ShipmentItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "shipment_id": item.ShipmentID, "sales_order_item_id": optionalIntToAny(item.SalesOrderItemID), "product_id": item.ProductID, "product_sku_id": optionalIntToAny(item.ProductSkuID), "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "unit_net_weight_g_snapshot": optionalDecimalString(item.UnitNetWeightGSnapshot), "unit_price_snapshot": optionalDecimalString(item.UnitPriceSnapshot), "amount_snapshot": optionalDecimalString(item.AmountSnapshot), "currency_snapshot": optionalStringToAny(item.CurrencySnapshot), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
