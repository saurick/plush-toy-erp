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
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_production_fact", "createProductionFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanCreate, biz.PermissionPMCPlanUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		in, ok := operationalFactMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateProductionFactDraft(ctx, in)
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "post_production_fact", "postProductionFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostProductionFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "cancel_production_fact", "cancelProductionFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedProductionFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactProductionFactResult(ctx, d, item, err), nil
	case "list_production_facts", "listProductionFacts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPMCPlanRead, biz.PermissionWarehouseInventoryRead); res != nil {
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
	default:
		return id, unknownOperationalFactResult(method), nil
	}
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

func productionFactToAny(item *biz.ProductionFact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "subject_type": item.SubjectType, "subject_id": item.SubjectID, "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
