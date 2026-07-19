package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOperationalFactProduction(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_production_completion_from_order":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionCompletionCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "production"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "production_orders"); res != nil {
			return id, res, nil
		}
		in, ok := productionCompletionFromOrderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateProductionCompletionFromOrder(ctx, in)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "create_production_material_issue_from_order":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionMaterialIssueCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "production"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "production_orders"); res != nil {
			return id, res, nil
		}
		in, ok := productionMaterialIssueFromOrderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateProductionMaterialIssueFromOrder(ctx, in)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "create_production_rework_from_completion":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionReworkCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "production"); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "production_orders"); res != nil {
			return id, res, nil
		}
		in, ok := productionReworkFromCompletionCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateProductionReworkFromCompletion(ctx, in)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "post_production_fact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionFactPost); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		factID := getInt(pm, "id", 0)
		requiresSourceTask, err := d.operationalFactUC.ProductionFactRequiresSourceTask(ctx, factID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		modules := []string{"production"}
		if requiresSourceTask {
			modules = append(modules, "workflow_tasks")
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), modules...); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostProductionFactWithActor(ctx, factID, actorID)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "cancel_production_fact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionFactCancel); res != nil {
			return id, res, nil
		}
		factID := getInt(pm, "id", 0)
		requiresSourceTask, err := d.operationalFactUC.ProductionFactRequiresSourceTask(ctx, factID)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		modules := []string{"production"}
		if requiresSourceTask {
			modules = append(modules, workflowModuleKeyTasks)
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), modules...); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedProductionFactWithActor(ctx, factID, actorID)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "list_production_facts":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionFactRead); res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListProductionFacts(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"production_facts": productionFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	case "list_production_order_material_requirements":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductionFactRead); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesReadable(ctx, "production", "production_orders"); res != nil {
			return id, res, nil
		}
		if !productionCompletionAllowsOnly(pm, "customer_key", "production_order_id") {
			return id, invalidParamResult(), nil
		}
		items, err := d.operationalFactUC.ListProductionOrderMaterialRequirements(ctx, getInt(pm, "production_order_id", 0))
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"material_requirements": productionOrderMaterialRequirementsToAny(items)}), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func productionMaterialIssueFromOrderCreateFromParams(pm map[string]any) (*biz.ProductionMaterialIssueFromOrderCreate, bool) {
	if !productionCompletionAllowsOnly(
		pm,
		"customer_key",
		"fact_no",
		"production_order_id",
		"production_order_item_id",
		"production_order_material_requirement_id",
		"warehouse_id",
		"lot_id",
		"quantity",
		"idempotency_key",
		"occurred_at",
		"note",
	) {
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
	return &biz.ProductionMaterialIssueFromOrderCreate{
		FactNo:                               getString(pm, "fact_no"),
		ProductionOrderID:                    getInt(pm, "production_order_id", 0),
		ProductionOrderItemID:                getInt(pm, "production_order_item_id", 0),
		ProductionOrderMaterialRequirementID: getInt(pm, "production_order_material_requirement_id", 0),
		WarehouseID:                          getInt(pm, "warehouse_id", 0),
		LotID:                                getOptionalInt(pm, "lot_id"),
		Quantity:                             quantity,
		IdempotencyKey:                       getString(pm, "idempotency_key"),
		OccurredAt:                           optionalTimeValue(occurredAt),
		Note:                                 getWorkflowStringPtr(pm, "note"),
	}, true
}

func productionCompletionFromOrderCreateFromParams(pm map[string]any) (*biz.ProductionCompletionFromOrderCreate, bool) {
	if !productionCompletionAllowsOnly(
		pm,
		"customer_key",
		"fact_no",
		"production_order_id",
		"production_order_item_id",
		"warehouse_id",
		"lot_id",
		"new_lot_no",
		"quantity",
		"idempotency_key",
		"occurred_at",
		"note",
	) {
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
	return &biz.ProductionCompletionFromOrderCreate{
		FactNo:                getString(pm, "fact_no"),
		ProductionOrderID:     getInt(pm, "production_order_id", 0),
		ProductionOrderItemID: getInt(pm, "production_order_item_id", 0),
		WarehouseID:           getInt(pm, "warehouse_id", 0),
		LotID:                 getOptionalInt(pm, "lot_id"),
		NewLotNo:              getWorkflowStringPtr(pm, "new_lot_no"),
		Quantity:              quantity,
		IdempotencyKey:        getString(pm, "idempotency_key"),
		OccurredAt:            optionalTimeValue(occurredAt),
		Note:                  getWorkflowStringPtr(pm, "note"),
	}, true
}

func productionReworkFromCompletionCreateFromParams(pm map[string]any) (*biz.ProductionReworkFromCompletionCreate, bool) {
	if !productionCompletionAllowsOnly(
		pm,
		"customer_key",
		"fact_no",
		"source_completion_fact_id",
		"quantity",
		"idempotency_key",
		"occurred_at",
		"reason",
	) {
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
	return &biz.ProductionReworkFromCompletionCreate{
		FactNo:                 getString(pm, "fact_no"),
		SourceCompletionFactID: getInt(pm, "source_completion_fact_id", 0),
		Quantity:               quantity,
		IdempotencyKey:         getString(pm, "idempotency_key"),
		OccurredAt:             optionalTimeValue(occurredAt),
		Reason:                 getString(pm, "reason"),
	}, true
}

func productionCompletionAllowsOnly(pm map[string]any, keys ...string) bool {
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

func operationalFactProductionFactResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.ProductionFact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"production_fact": productionFactToAny(item)})
}

func productionFactsToAny(items []*biz.ProductionFact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productionFactToAny(item))
	}
	return out
}

func productionOrderMaterialRequirementsToAny(items []*biz.ProductionOrderMaterialRequirement) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productionOrderMaterialRequirementToAny(item))
	}
	return out
}

func productionOrderMaterialRequirementToAny(item *biz.ProductionOrderMaterialRequirement) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": item.ID, "production_order_id": item.ProductionOrderID, "production_order_item_id": item.ProductionOrderItemID,
		"bom_header_id": item.BOMHeaderID, "bom_item_id": item.BOMItemID, "material_id": item.MaterialID, "unit_id": item.UnitID,
		"production_operation_code": optionalStringToAny(item.ProductionOperationCode),
		"unit_quantity_snapshot":    item.UnitQuantitySnapshot.String(), "loss_rate_snapshot": item.LossRateSnapshot.String(),
		"planned_quantity": item.PlannedQuantity.String(), "issued_quantity": item.IssuedQuantity.String(), "remaining_quantity": item.RemainingQuantity.String(),
		"material_code_snapshot": item.MaterialCodeSnapshot, "material_name_snapshot": item.MaterialNameSnapshot,
		"unit_code_snapshot": item.UnitCodeSnapshot, "unit_name_snapshot": item.UnitNameSnapshot,
		"created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix(),
	}
}

func productionFactToAny(item *biz.ProductionFact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "subject_type": item.SubjectType, "subject_id": item.SubjectID, "product_sku_id": optionalIntToAny(item.ProductSkuID), "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_no": optionalStringToAny(item.SourceNo), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
