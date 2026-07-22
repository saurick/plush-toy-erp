package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func (d *jsonrpcDispatcher) handleProductionException(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := biz.PermissionQualityExceptionHandle
	switch method {
	case "execute_production_exception", "reverse_production_exception":
		permission = biz.PermissionProductionFactPost
	case "get_production_exception", "list_production_exceptions":
		permission = biz.PermissionProductionFactRead
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "production", "quality_inspections"); res != nil {
		return id, res, nil
	}
	var item *biz.ProductionExceptionDecision
	var err error
	switch method {
	case "submit_production_exception":
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if !productionCompletionAllowsOnly(pm, "customer_key", "decision_no", "decision_type", "production_order_id", "production_order_item_id", "production_material_requirement_id", "production_wip_batch_id", "quality_inspection_id", "requested_quantity", "reason", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "requested_quantity")
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: getString(pm, "decision_no"), DecisionType: getString(pm, "decision_type"), ProductionOrderID: getInt(pm, "production_order_id", 0), ProductionOrderItemID: getInt(pm, "production_order_item_id", 0), ProductionMaterialRequirementID: getOptionalInt(pm, "production_material_requirement_id"), ProductionWIPBatchID: getOptionalInt(pm, "production_wip_batch_id"), QualityInspectionID: getOptionalInt(pm, "quality_inspection_id"), RequestedQuantity: quantity, Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key"), RequestedBy: actorID})
	case "approve_production_exception":
		mutation, ok := productionExceptionMutationFromParams(pm, actorID, true)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.ApproveProductionException(ctx, mutation)
	case "reject_production_exception":
		mutation, ok := productionExceptionMutationFromParams(pm, actorID, false)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.RejectProductionException(ctx, mutation)
	case "cancel_production_exception":
		mutation, ok := productionExceptionMutationFromParams(pm, actorID, false)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.CancelProductionException(ctx, mutation)
	case "execute_production_exception":
		mutation, ok := productionExceptionMutationFromParams(pm, actorID, false)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.ExecuteProductionException(ctx, mutation)
	case "reverse_production_exception":
		mutation, ok := productionExceptionMutationFromParams(pm, actorID, false)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.ReverseProductionException(ctx, mutation)
	case "get_production_exception":
		if !productionCompletionAllowsOnly(pm, "customer_key", "id", "expected_version") {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.GetProductionException(ctx, getInt(pm, "id", 0))
	case "list_production_exceptions":
		if !productionCompletionAllowsOnly(pm, "customer_key", "status", "execution_status", "decision_type", "production_order_id", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		items, total, listErr := d.operationalFactUC.ListProductionExceptions(ctx, biz.ProductionExceptionFilter{Status: getString(pm, "status"), ExecutionStatus: getString(pm, "execution_status"), DecisionType: getString(pm, "decision_type"), ProductionOrderID: getInt(pm, "production_order_id", 0), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)})
		if listErr != nil {
			return id, d.mapOperationalFactError(ctx, listErr), nil
		}
		out := make([]any, 0, len(items))
		for _, current := range items {
			out = append(out, productionExceptionToAny(current))
		}
		return id, okData(map[string]any{"production_exceptions": out, "total": total}), nil
	}
	if err != nil {
		return id, d.mapOperationalFactError(ctx, err), nil
	}
	return id, okData(map[string]any{"production_exception": productionExceptionToAny(item)}), nil
}

func productionExceptionMutationFromParams(pm map[string]any, actorID int, approval bool) (*biz.ProductionExceptionMutation, bool) {
	allowed := []string{"customer_key", "id", "expected_version", "reason"}
	if approval {
		allowed = append(allowed, "approved_quantity")
	}
	if !productionCompletionAllowsOnly(pm, allowed...) {
		return nil, false
	}
	var approved *decimal.Decimal
	if _, exists := pm["approved_quantity"]; exists {
		parsed, ok := getRequiredJSONRPCNumeric20Scale6(pm, "approved_quantity")
		if !ok {
			return nil, false
		}
		approved = &parsed
	}
	return &biz.ProductionExceptionMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID, ApprovedQuantity: approved, Reason: getString(pm, "reason")}, true
}

func productionExceptionToAny(item *biz.ProductionExceptionDecision) map[string]any {
	if item == nil {
		return nil
	}
	return map[string]any{"id": item.ID, "decision_no": item.DecisionNo, "decision_type": item.DecisionType, "status": item.Status, "execution_status": item.ExecutionStatus, "production_order_id": item.ProductionOrderID, "production_order_item_id": item.ProductionOrderItemID, "production_material_requirement_id": optionalIntToAny(item.ProductionMaterialRequirementID), "production_wip_batch_id": optionalIntToAny(item.ProductionWIPBatchID), "quality_inspection_id": optionalIntToAny(item.QualityInspectionID), "requested_quantity": item.RequestedQuantity.String(), "approved_quantity": optionalDecimalToAny(item.ApprovedQuantity), "reason": item.Reason, "version": item.Version, "requested_by": item.RequestedBy, "requested_at": item.RequestedAt.Unix(), "decided_by": optionalIntToAny(item.DecidedBy), "decided_at": optionalUnix(item.DecidedAt), "decision_reason": optionalStringToAny(item.DecisionReason), "executed_by": optionalIntToAny(item.ExecutedBy), "executed_at": optionalUnix(item.ExecutedAt), "reversed_by": optionalIntToAny(item.ReversedBy), "reversed_at": optionalUnix(item.ReversedAt), "reverse_reason": optionalStringToAny(item.ReverseReason)}
}

func (d *jsonrpcDispatcher) handleOutsourcingReturnDisposition(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	permission := biz.PermissionOutsourcingFactRead
	switch method {
	case "create_outsourcing_return_disposition":
		permission = biz.PermissionQualityExceptionHandle
	case "post_outsourcing_return_disposition":
		permission = biz.PermissionOutsourcingFactPost
	case "cancel_outsourcing_return_disposition":
		permission = biz.PermissionOutsourcingFactCancel
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "outsourcing_orders", "quality_inspections"); res != nil {
		return id, res, nil
	}
	var item *biz.OutsourcingReturnDisposition
	var err error
	switch method {
	case "create_outsourcing_return_disposition":
		if res := d.requireSourceActionReadPermissions(ctx, "operational_fact", method); res != nil {
			return id, res, nil
		}
		if !productionCompletionAllowsOnly(pm, "customer_key", "disposition_no", "quality_inspection_id", "disposition_type", "quantity", "production_wip_batch_id", "reason", "idempotency_key") {
			return id, invalidParamResult(), nil
		}
		quantity, ok := getRequiredJSONRPCNumeric20Scale6(pm, "quantity")
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: getString(pm, "disposition_no"), QualityInspectionID: getInt(pm, "quality_inspection_id", 0), DispositionType: getString(pm, "disposition_type"), Quantity: quantity, ProductionWIPBatchID: getOptionalInt(pm, "production_wip_batch_id"), Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key"), CreatedBy: actorID})
	case "post_outsourcing_return_disposition":
		if !productionCompletionAllowsOnly(pm, "customer_key", "id", "expected_version") {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID})
	case "cancel_outsourcing_return_disposition":
		if !productionCompletionAllowsOnly(pm, "customer_key", "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.CancelOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID, Reason: getString(pm, "reason")})
	case "get_outsourcing_return_disposition":
		if !productionCompletionAllowsOnly(pm, "customer_key", "id") {
			return id, invalidParamResult(), nil
		}
		item, err = d.operationalFactUC.GetOutsourcingReturnDisposition(ctx, getInt(pm, "id", 0))
	case "list_outsourcing_return_dispositions":
		if !productionCompletionAllowsOnly(pm, "customer_key", "quality_inspection_id", "outsourcing_return_fact_id", "status", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		items, total, listErr := d.operationalFactUC.ListOutsourcingReturnDispositions(ctx, biz.OutsourcingReturnDispositionFilter{QualityInspectionID: getInt(pm, "quality_inspection_id", 0), OutsourcingReturnFactID: getInt(pm, "outsourcing_return_fact_id", 0), Status: getString(pm, "status"), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)})
		if listErr != nil {
			return id, d.mapOperationalFactError(ctx, listErr), nil
		}
		out := make([]any, 0, len(items))
		for _, current := range items {
			out = append(out, outsourcingDispositionToAny(current))
		}
		return id, okData(map[string]any{"outsourcing_return_dispositions": out, "total": total}), nil
	}
	if err != nil {
		return id, d.mapOperationalFactError(ctx, err), nil
	}
	return id, okData(map[string]any{"outsourcing_return_disposition": outsourcingDispositionToAny(item)}), nil
}

func outsourcingDispositionToAny(item *biz.OutsourcingReturnDisposition) map[string]any {
	if item == nil {
		return nil
	}
	return map[string]any{"id": item.ID, "disposition_no": item.DispositionNo, "quality_inspection_id": item.QualityInspectionID, "outsourcing_return_fact_id": item.OutsourcingReturnFactID, "disposition_type": item.DispositionType, "status": item.Status, "quantity": item.Quantity.String(), "production_wip_batch_id": optionalIntToAny(item.ProductionWIPBatchID), "result_wip_batch_id": optionalIntToAny(item.ResultWIPBatchID), "reason": item.Reason, "version": item.Version, "posted_at": optionalUnix(item.PostedAt), "posted_by": optionalIntToAny(item.PostedBy), "cancelled_at": optionalUnix(item.CancelledAt), "cancelled_by": optionalIntToAny(item.CancelledBy), "cancel_reason": optionalStringToAny(item.CancelReason), "created_by": item.CreatedBy}
}
