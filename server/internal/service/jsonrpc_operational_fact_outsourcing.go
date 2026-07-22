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
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_outsourcing_return_disposition", "post_outsourcing_return_disposition", "cancel_outsourcing_return_disposition", "get_outsourcing_return_disposition", "list_outsourcing_return_dispositions":
		return d.handleOutsourcingReturnDisposition(ctx, method, id, pm, actorID)
	case "create_outsourcing_material_issue_from_order":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingMaterialIssueCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		in, ok := outsourcingFactFromOrderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateOutsourcingMaterialIssueFromOrder(ctx, in)
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "create_outsourcing_return_receipt_from_order":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingReturnReceiptCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		in, ok := outsourcingFactFromOrderCreateFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.operationalFactUC.CreateOutsourcingReturnReceiptFromOrder(ctx, in)
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "post_outsourcing_fact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingFactPost); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.PostOutsourcingFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "cancel_outsourcing_fact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingFactCancel); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders"); res != nil {
			return id, res, nil
		}
		item, err := d.operationalFactUC.CancelPostedOutsourcingFact(ctx, getInt(pm, "id", 0))
		return id, operationalFactOutsourcingFactResult(ctx, d, item, err), nil
	case "list_outsourcing_facts":
		if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingFactRead); res != nil {
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

func outsourcingFactFromOrderCreateFromParams(pm map[string]any) (*biz.OutsourcingFactFromOrderCreate, bool) {
	if !productionCompletionAllowsOnly(
		pm,
		"customer_key",
		"fact_no",
		"outsourcing_order_id",
		"outsourcing_order_item_id",
		"warehouse_id",
		"lot_id",
		"new_lot_no",
		"quantity",
		"occurred_at",
		"note",
		"idempotency_key",
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
	return &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 getString(pm, "fact_no"),
		OutsourcingOrderID:     getInt(pm, "outsourcing_order_id", 0),
		OutsourcingOrderItemID: getInt(pm, "outsourcing_order_item_id", 0),
		WarehouseID:            getInt(pm, "warehouse_id", 0),
		LotID:                  getOptionalInt(pm, "lot_id"),
		NewLotNo:               getWorkflowStringPtr(pm, "new_lot_no"),
		Quantity:               quantity,
		IdempotencyKey:         getString(pm, "idempotency_key"),
		OccurredAt:             optionalTimeValue(occurredAt),
		Note:                   getWorkflowStringPtr(pm, "note"),
	}, true
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
	return map[string]any{"id": item.ID, "fact_no": item.FactNo, "fact_type": item.FactType, "status": item.Status, "subject_type": item.SubjectType, "subject_id": item.SubjectID, "product_sku_id": optionalIntToAny(item.ProductSkuID), "sku_code_snapshot": optionalStringToAny(item.SKUCodeSnapshot), "warehouse_id": item.WarehouseID, "unit_id": item.UnitID, "lot_id": optionalIntToAny(item.LotID), "quantity": item.Quantity.String(), "supplier_id": optionalIntToAny(item.SupplierID), "supplier_name": optionalStringToAny(item.SupplierName), "source_type": optionalStringToAny(item.SourceType), "source_id": optionalIntToAny(item.SourceID), "source_no": optionalStringToAny(item.SourceNo), "source_line_id": optionalIntToAny(item.SourceLineID), "idempotency_key": item.IdempotencyKey, "occurred_at": item.OccurredAt.Unix(), "posted_at": optionalUnix(item.PostedAt), "note": optionalStringToAny(item.Note), "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix()}
}
