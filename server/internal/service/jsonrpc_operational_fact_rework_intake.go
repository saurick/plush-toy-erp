package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOperationalFactReworkIntake(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_rework_intake_source_candidates":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionReworkIntakeCreate, biz.PermissionReworkIntakeUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "rework_intakes", "shipments", "production_orders"); res != nil {
			return id, res, nil
		}
		filter, ok := reworkIntakeSourceCandidateFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if filter.EditingReworkIntakeDraftID > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeUpdate); res != nil {
				return id, res, nil
			}
		}
		items, total, err := d.operationalFactUC.ListReworkIntakeSourceCandidates(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"rework_intake_source_candidates": reworkIntakeSourceCandidatesToAny(items),
			"total":                           total,
			"limit":                           filter.Limit,
			"offset":                          filter.Offset,
		}), nil
	case "create_rework_intake":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes", "shipments", "production_orders"); res != nil {
			return id, res, nil
		}
		in, ok := reworkIntakeCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateReworkIntake(ctx, in, actorID)
		return id, operationalFactReworkIntakeResult(ctx, d, item, err), nil
	case "save_rework_intake_draft":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes", "shipments", "production_orders"); res != nil {
			return id, res, nil
		}
		in, ok := reworkIntakeDraftSaveFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.SaveReworkIntakeDraft(ctx, in, actorID)
		return id, operationalFactReworkIntakeResult(ctx, d, item, err), nil
	case "receive_rework_intake":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeReceive); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes", "inventory"); res != nil {
			return id, res, nil
		}
		in, ok := reworkIntakeTransitionFromParams(pm, false)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.ReceiveReworkIntake(ctx, in, actorID)
		return id, operationalFactReworkIntakeResult(ctx, d, item, err), nil
	case "cancel_rework_intake":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeCancel); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes"); res != nil {
			return id, res, nil
		}
		in, ok := reworkIntakeTransitionFromParams(pm, true)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CancelReworkIntake(ctx, in, actorID)
		return id, operationalFactReworkIntakeResult(ctx, d, item, err), nil
	case "reverse_rework_intake":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeReverse); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes", "inventory", "production"); res != nil {
			return id, res, nil
		}
		in, ok := reworkIntakeTransitionFromParams(pm, true)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.ReverseReworkIntake(ctx, in, actorID)
		return id, operationalFactReworkIntakeResult(ctx, d, item, err), nil
	case "get_rework_intake":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeRead); res != nil {
			return id, res, nil
		}
		if !productionCompletionAllowsOnly(pm, "id") {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.GetReworkIntake(ctx, getInt(pm, "id", 0))
		return id, operationalFactReworkIntakeResult(ctx, d, item, err), nil
	case "list_rework_intakes":
		if res := d.RequireAdminPermission(ctx, biz.PermissionReworkIntakeRead); res != nil {
			return id, res, nil
		}
		filter, ok := reworkIntakeFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListReworkIntakes(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{
			"rework_intakes": reworkIntakesToAny(items),
			"total":          total,
			"limit":          filter.Limit,
			"offset":         filter.Offset,
		}), nil
	case "create_production_rework_from_intake":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionReworkCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes", "production", "production_orders", "quality_inspections", workflowModuleKeyTasks); res != nil {
			return id, res, nil
		}
		in, ok := productionReworkFromIntakeCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateProductionReworkFromIntake(ctx, in)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "create_rework_reshipment":
		if res := d.RequireAdminPermission(ctx, biz.PermissionShipmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "rework_intakes", "shipments", "inventory"); res != nil {
			return id, res, nil
		}
		in, ok := reworkReshipmentCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateReworkReshipment(ctx, in)
		return id, operationalFactShipmentResult(ctx, d, item, err), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func reworkIntakeCreateFromParams(pm map[string]any) (*biz.ReworkIntakeCreate, bool) {
	if !productionCompletionAllowsOnly(pm, "customer_key", "intake_no", "source_shipment_id", "reason", "idempotency_key", "items") {
		return nil, false
	}
	sourceShipmentID, ok := getRequiredJSONRPCPositiveInt(pm, "source_shipment_id")
	if !ok {
		return nil, false
	}
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]biz.ReworkIntakeItemCreate, 0, len(rawItems))
	for _, raw := range rawItems {
		params, ok := raw.(map[string]any)
		if !ok || !productionCompletionAllowsOnly(params, "source_shipment_item_id", "target_production_order_item_id", "quantity", "note") {
			return nil, false
		}
		sourceItemID, ok := getRequiredJSONRPCPositiveInt(params, "source_shipment_item_id")
		if !ok {
			return nil, false
		}
		targetItemID, ok := getRequiredJSONRPCPositiveInt(params, "target_production_order_item_id")
		if !ok {
			return nil, false
		}
		quantity, ok := getRequiredJSONRPCNumeric20Scale6(params, "quantity")
		if !ok {
			return nil, false
		}
		note, ok := getOptionalShipmentString(params, "note")
		if !ok {
			return nil, false
		}
		items = append(items, biz.ReworkIntakeItemCreate{
			SourceShipmentItemID: sourceItemID, TargetProductionOrderItemID: targetItemID, Quantity: quantity, Note: note,
		})
	}
	return &biz.ReworkIntakeCreate{
		IntakeNo: getString(pm, "intake_no"), SourceShipmentID: sourceShipmentID,
		Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key"), Items: items,
	}, true
}

func reworkIntakeDraftSaveFromParams(pm map[string]any) (*biz.ReworkIntakeDraftSave, bool) {
	if !productionCompletionAllowsOnly(pm, "customer_key", "id", "expected_version", "intake_no", "source_shipment_id", "reason", "items") {
		return nil, false
	}
	id, ok := getRequiredJSONRPCPositiveInt(pm, "id")
	if !ok {
		return nil, false
	}
	expectedVersion, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	if !ok {
		return nil, false
	}
	sourceShipmentID, ok := getRequiredJSONRPCPositiveInt(pm, "source_shipment_id")
	if !ok {
		return nil, false
	}
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]biz.ReworkIntakeItemCreate, 0, len(rawItems))
	for _, raw := range rawItems {
		params, ok := raw.(map[string]any)
		if !ok || !productionCompletionAllowsOnly(params, "source_shipment_item_id", "target_production_order_item_id", "quantity", "note") {
			return nil, false
		}
		sourceItemID, ok := getRequiredJSONRPCPositiveInt(params, "source_shipment_item_id")
		if !ok {
			return nil, false
		}
		targetItemID, ok := getRequiredJSONRPCPositiveInt(params, "target_production_order_item_id")
		if !ok {
			return nil, false
		}
		quantity, ok := getRequiredJSONRPCNumeric20Scale6(params, "quantity")
		if !ok {
			return nil, false
		}
		note, ok := getOptionalShipmentString(params, "note")
		if !ok {
			return nil, false
		}
		items = append(items, biz.ReworkIntakeItemCreate{
			SourceShipmentItemID:        sourceItemID,
			TargetProductionOrderItemID: targetItemID,
			Quantity:                    quantity,
			Note:                        note,
		})
	}
	return &biz.ReworkIntakeDraftSave{
		ID:               id,
		ExpectedVersion:  expectedVersion,
		IntakeNo:         getString(pm, "intake_no"),
		SourceShipmentID: sourceShipmentID,
		Reason:           getString(pm, "reason"),
		Items:            items,
	}, true
}

func reworkIntakeTransitionFromParams(pm map[string]any, requireReason bool) (*biz.ReworkIntakeTransition, bool) {
	keys := []string{"customer_key", "id", "expected_version"}
	if requireReason {
		keys = append(keys, "reason")
	}
	if !productionCompletionAllowsOnly(pm, keys...) {
		return nil, false
	}
	id, ok := getRequiredJSONRPCPositiveInt(pm, "id")
	if !ok {
		return nil, false
	}
	version, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	if !ok {
		return nil, false
	}
	return &biz.ReworkIntakeTransition{ID: id, ExpectedVersion: version, Reason: getString(pm, "reason")}, true
}

func reworkIntakeFilterFromParams(pm map[string]any) (biz.ReworkIntakeFilter, bool) {
	if !productionCompletionAllowsOnly(pm, "status", "source_shipment_id", "customer_id", "keyword", "limit", "offset") {
		return biz.ReworkIntakeFilter{}, false
	}
	filter := biz.ReworkIntakeFilter{
		Status: getString(pm, "status"), Keyword: getString(pm, "keyword"), Limit: 50,
	}
	var ok bool
	if _, exists := pm["source_shipment_id"]; exists {
		filter.SourceShipmentID, ok = getRequiredJSONRPCPositiveInt(pm, "source_shipment_id")
		if !ok {
			return biz.ReworkIntakeFilter{}, false
		}
	}
	if _, exists := pm["customer_id"]; exists {
		filter.CustomerID, ok = getRequiredJSONRPCPositiveInt(pm, "customer_id")
		if !ok {
			return biz.ReworkIntakeFilter{}, false
		}
	}
	if _, exists := pm["limit"]; exists {
		filter.Limit, ok = getRequiredJSONRPCPositiveInt(pm, "limit")
		if !ok || filter.Limit > 200 {
			return biz.ReworkIntakeFilter{}, false
		}
	}
	if _, exists := pm["offset"]; exists {
		filter.Offset, ok = getRequiredJSONRPCNonNegativeInt(pm, "offset")
		if !ok {
			return biz.ReworkIntakeFilter{}, false
		}
	}
	return filter, true
}

func reworkIntakeSourceCandidateFilterFromParams(pm map[string]any) (biz.ReworkIntakeSourceCandidateFilter, bool) {
	if !productionCompletionAllowsOnly(pm, "keyword", "source_shipment_id", "rework_intake_id", "limit", "offset") {
		return biz.ReworkIntakeSourceCandidateFilter{}, false
	}
	filter := biz.ReworkIntakeSourceCandidateFilter{Keyword: getString(pm, "keyword"), Limit: 50}
	var ok bool
	if _, exists := pm["source_shipment_id"]; exists {
		filter.SourceShipmentID, ok = getRequiredJSONRPCPositiveInt(pm, "source_shipment_id")
		if !ok {
			return biz.ReworkIntakeSourceCandidateFilter{}, false
		}
	}
	if _, exists := pm["rework_intake_id"]; exists {
		filter.EditingReworkIntakeDraftID, ok = getRequiredJSONRPCPositiveInt(pm, "rework_intake_id")
		if !ok {
			return biz.ReworkIntakeSourceCandidateFilter{}, false
		}
	}
	if _, exists := pm["limit"]; exists {
		filter.Limit, ok = getRequiredJSONRPCPositiveInt(pm, "limit")
		if !ok || filter.Limit > 200 {
			return biz.ReworkIntakeSourceCandidateFilter{}, false
		}
	}
	if _, exists := pm["offset"]; exists {
		filter.Offset, ok = getRequiredJSONRPCNonNegativeInt(pm, "offset")
		if !ok {
			return biz.ReworkIntakeSourceCandidateFilter{}, false
		}
	}
	return filter, true
}

func productionReworkFromIntakeCreateFromParams(pm map[string]any) (*biz.ProductionReworkFromIntakeCreate, bool) {
	if !productionCompletionAllowsOnly(pm, "customer_key", "fact_no", "rework_intake_item_id", "quantity", "idempotency_key", "occurred_at", "reason") {
		return nil, false
	}
	itemID, ok := getRequiredJSONRPCPositiveInt(pm, "rework_intake_item_id")
	if !ok {
		return nil, false
	}
	quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "quantity")
	if !ok {
		return nil, false
	}
	occurredAt, ok := getOptionalJSONRPCTime(pm, "occurred_at")
	if !ok {
		return nil, false
	}
	return &biz.ProductionReworkFromIntakeCreate{
		FactNo: getString(pm, "fact_no"), ReworkIntakeItemID: itemID, Quantity: quantity,
		IdempotencyKey: getString(pm, "idempotency_key"), OccurredAt: optionalTimeValue(occurredAt),
		OccurredAtSpecified: occurredAt != nil, Reason: getString(pm, "reason"),
	}, true
}

func reworkReshipmentCreateFromParams(pm map[string]any) (*biz.ReworkReshipmentCreate, bool) {
	if !productionCompletionAllowsOnly(pm, "customer_key", "shipment_no", "rework_intake_id", "idempotency_key", "planned_ship_at", "note", "items") {
		return nil, false
	}
	intakeID, ok := getRequiredJSONRPCPositiveInt(pm, "rework_intake_id")
	if !ok {
		return nil, false
	}
	plannedShipAt, ok := getOptionalShipmentTime(pm, "planned_ship_at")
	if !ok {
		return nil, false
	}
	note, ok := getOptionalShipmentString(pm, "note")
	if !ok {
		return nil, false
	}
	rawItems, ok := pm["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return nil, false
	}
	items := make([]biz.ReworkReshipmentItemCreate, 0, len(rawItems))
	for _, raw := range rawItems {
		params, ok := raw.(map[string]any)
		if !ok || !productionCompletionAllowsOnly(params, "rework_completion_fact_id", "quantity", "note") {
			return nil, false
		}
		completionID, ok := getRequiredJSONRPCPositiveInt(params, "rework_completion_fact_id")
		if !ok {
			return nil, false
		}
		quantity, ok := getRequiredJSONRPCNumeric20Scale6(params, "quantity")
		if !ok {
			return nil, false
		}
		itemNote, ok := getOptionalShipmentString(params, "note")
		if !ok {
			return nil, false
		}
		items = append(items, biz.ReworkReshipmentItemCreate{ReworkCompletionFactID: completionID, Quantity: quantity, Note: itemNote})
	}
	return &biz.ReworkReshipmentCreate{
		ShipmentNo: getString(pm, "shipment_no"), ReworkIntakeID: intakeID,
		IdempotencyKey: getString(pm, "idempotency_key"), PlannedShipAt: plannedShipAt, Note: note, Items: items,
	}, true
}

func operationalFactReworkIntakeResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.ReworkIntake, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"rework_intake": reworkIntakeToAny(item)})
}

func reworkIntakesToAny(items []*biz.ReworkIntake) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, reworkIntakeToAny(item))
	}
	return out
}

func reworkIntakeToAny(item *biz.ReworkIntake) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	lines := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		lines = append(lines, reworkIntakeItemToAny(line))
	}
	return map[string]any{
		"id": item.ID, "intake_no": item.IntakeNo, "source_shipment_id": item.SourceShipmentID,
		"source_shipment_no": item.SourceShipmentNo, "customer_id": item.CustomerID, "customer_snapshot": item.CustomerSnapshot,
		"status": item.Status, "progress_stage": item.ProgressStage, "reason": item.Reason, "version": item.Version,
		"received_at": optionalUnix(item.ReceivedAt), "received_by": optionalIntToAny(item.ReceivedBy),
		"cancelled_at": optionalUnix(item.CancelledAt), "cancelled_by": optionalIntToAny(item.CancelledBy), "cancel_reason": optionalStringToAny(item.CancelReason),
		"reversed_at": optionalUnix(item.ReversedAt), "reversed_by": optionalIntToAny(item.ReversedBy), "reverse_reason": optionalStringToAny(item.ReverseReason),
		"created_by": item.CreatedBy, "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix(), "items": lines,
	}
}

func reworkIntakeItemToAny(item *biz.ReworkIntakeItem) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	candidates := make([]any, 0, len(item.CompletionCandidates))
	for _, candidate := range item.CompletionCandidates {
		candidates = append(candidates, reworkCompletionCandidateToAny(candidate))
	}
	return map[string]any{
		"id": item.ID, "rework_intake_id": item.ReworkIntakeID, "line_no": item.LineNo,
		"source_shipment_item_id":    item.SourceShipmentItemID,
		"target_production_order_id": item.TargetProductionOrderID, "target_production_order_no": item.TargetProductionOrderNo,
		"target_production_order_item_id": item.TargetProductionOrderItemID,
		"product_id":                      item.ProductID, "product_code": item.ProductCode, "product_name": item.ProductName,
		"product_sku_id": optionalIntToAny(item.ProductSkuID), "product_sku_code": optionalStringToAny(item.ProductSkuCode), "product_sku_name": optionalStringToAny(item.ProductSkuName),
		"receiving_warehouse_id": item.ReceivingWarehouseID, "receiving_warehouse_code": item.ReceivingWarehouseCode, "receiving_warehouse_name": item.ReceivingWarehouseName,
		"unit_id": item.UnitID, "unit_code": item.UnitCode, "unit_name": item.UnitName,
		"received_lot_id": optionalIntToAny(item.ReceivedLotID), "received_lot_no": optionalStringToAny(item.ReceivedLotNo),
		"quantity": item.Quantity.String(), "source_shipped_quantity": item.SourceShippedQuantity.String(),
		"active_intake_quantity": item.ActiveIntakeQuantity.String(), "remaining_intake_quantity": item.RemainingIntakeQuantity.String(),
		"active_rework_quantity": item.ActiveReworkQuantity.String(), "completed_quantity": item.CompletedQuantity.String(),
		"active_reshipment_quantity": item.ActiveReshipmentQuantity.String(), "reshipped_quantity": item.ReshippedQuantity.String(),
		"progress_stage": item.ProgressStage, "note": optionalStringToAny(item.Note), "completion_candidates": candidates,
	}
}

func reworkCompletionCandidateToAny(item *biz.ReworkCompletionCandidate) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"production_fact_id": item.ProductionFactID, "production_fact_no": item.ProductionFactNo,
		"warehouse_id": item.WarehouseID, "lot_id": item.LotID, "lot_no": item.LotNo,
		"completed_quantity": item.CompletedQuantity.String(), "active_reship_quantity": item.ActiveReshipQuantity.String(),
		"remaining_quantity": item.RemainingQuantity.String(), "selectable": item.Selectable, "disabled_reason": optionalStringToAny(item.DisabledReason),
	}
}

func reworkIntakeSourceCandidatesToAny(items []*biz.ReworkIntakeSourceCandidate) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		out = append(out, map[string]any{
			"source_shipment_id": item.SourceShipmentID, "source_shipment_no": item.SourceShipmentNo,
			"customer_id": item.CustomerID, "customer_snapshot": item.CustomerSnapshot,
			"source_shipment_item_id": item.SourceShipmentItemID, "sales_order_item_id": item.SalesOrderItemID,
			"target_production_order_id": item.TargetProductionOrderID, "target_production_order_no": item.TargetProductionOrderNo,
			"target_production_order_item_id": item.TargetProductionOrderItemID,
			"product_id":                      item.ProductID, "product_code": item.ProductCode, "product_name": item.ProductName,
			"product_sku_id": optionalIntToAny(item.ProductSkuID), "product_sku_code": optionalStringToAny(item.ProductSkuCode), "product_sku_name": optionalStringToAny(item.ProductSkuName),
			"warehouse_id": item.WarehouseID, "warehouse_code": item.WarehouseCode, "warehouse_name": item.WarehouseName,
			"unit_id": item.UnitID, "unit_code": item.UnitCode, "unit_name": item.UnitName,
			"shipped_quantity": item.ShippedQuantity.String(), "active_intake_quantity": item.ActiveIntakeQuantity.String(),
			"remaining_intake_quantity": item.RemainingIntakeQuantity.String(), "selectable": item.Selectable, "disabled_reason": optionalStringToAny(item.DisabledReason),
		})
	}
	return out
}
