package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleOperationalFactOutsourcing(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_outsourcing_fact", "createOutsourcingFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderCreate, biz.PermissionPurchaseOrderUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		in, ok := operationalFactMutationFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateOutsourcingFactDraft(ctx, in)
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "post_outsourcing_fact", "postOutsourcingFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostOutsourcingFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "cancel_outsourcing_fact", "cancelOutsourcingFact":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderUpdate, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedOutsourcingFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "list_outsourcing_facts", "listOutsourcingFacts":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionPurchaseOrderRead, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		filter, ok := operationalFactFilterFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.operationalFactUC.ListOutsourcingFacts(ctx, filter)
		if err != nil {
			return id, d.mapOperationalFactError(ctx, err), nil
		}
		return id, okData(map[string]any{"outsourcing_facts": outsourcingFactsToAny(items), "total": total, "limit": normalizedLimit(pm), "offset": normalizedOffset(pm)}), nil
	default:
		return id, unknownOperationalFactResult(method), nil
	}
}

func operationalFactOutsourcingFactResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.OutsourcingFact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapOperationalFactError(ctx, err)
	}
	return okData(map[string]any{"outsourcing_fact": outsourcingFactToAny(item)})
}

func outsourcingFactsToAny(items []*biz.OutsourcingFact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, outsourcingFactToAny(item))
	}
	return out
}

func outsourcingFactToAny(item *biz.OutsourcingFact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "subject_type": item.SubjectType, "subject_id": item.SubjectID, "product_sku_id": optionalIntToAny(item.ProductSkuID), "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "supplier_id": optionalIntToAny(item.SupplierID), "supplier_name": optionalStringToAny(item.SupplierName), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
