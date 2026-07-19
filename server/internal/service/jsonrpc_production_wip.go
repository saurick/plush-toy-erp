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

func (d *jsonrpcDispatcher) handleProductionWIP(ctx context.Context, method, id string, params *structpb.Struct) (string, *v1.JsonrpcResult, error) {
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.productionOrderUC == nil {
		return id, productionWIPInternalResult(), nil
	}
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	switch method {
	case "get_production_wip":
		return id, d.getProductionWIP(ctx, pm), nil
	case "execute_production_wip_action":
		return id, d.executeProductionWIPAction(ctx, pm), nil
	default:
		return id, &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: fmt.Sprintf("未知生产工序接口 method=%s", method)}, nil
	}
}

func (d *jsonrpcDispatcher) getProductionWIP(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	if !productionOrderAllowsOnly(pm, "production_order_id") {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionProductionWIPRead); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesReadable(ctx, productionOrderModuleKey, "quality_inspections"); res != nil {
		return res
	}
	orderID, ok := productionOrderRequiredPositiveInt(pm, "production_order_id")
	if !ok {
		return invalidParamResult()
	}
	aggregate, err := d.productionOrderUC.GetProductionWIP(ctx, orderID)
	return d.productionWIPAggregateResult(ctx, aggregate, err)
}

func (d *jsonrpcDispatcher) executeProductionWIPAction(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	action, ok := productionOrderRequiredString(pm, "action", 40)
	if !ok {
		return invalidParamResult()
	}
	permission, modules, allowed, ok := productionWIPActionContract(action)
	if !ok || !productionOrderAllowsOnly(pm, allowed...) {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, permission); res != nil {
		return res
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	in, ok := productionWIPActionFromParams(pm, action, admin.ID)
	if !ok {
		return invalidParamResult()
	}
	conditions := []string(nil)
	if action == biz.ProductionWIPActionAssignExecution && in.ExecutionMode == biz.ProductionWIPExecutionOutsourced {
		modules = append(modules, "outsourcing_orders")
		conditions = append(conditions, biz.SourceReadConditionOutsourcedExecution)
	}
	if res := d.requireSourceActionReadPermissions(
		ctx,
		"production_wip",
		"execute_production_wip_action",
		conditions...,
	); res != nil {
		return res
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", modules...); res != nil {
		return res
	}
	aggregate, err := d.productionOrderUC.ApplyProductionWIPAction(ctx, in)
	return d.productionWIPAggregateResult(ctx, aggregate, err)
}

func productionWIPActionContract(action string) (string, []string, []string, bool) {
	base := []string{"action", "production_order_id", "expected_version", "idempotency_key"}
	modules := []string{productionOrderModuleKey, "quality_inspections"}
	switch action {
	case biz.ProductionWIPActionSplitBatch:
		return biz.PermissionProductionWIPAssign, modules, append(base, "production_wip_batch_id", "splits"), true
	case biz.ProductionWIPActionAssignExecution:
		return biz.PermissionProductionWIPAssign, modules, append(base, "production_wip_batch_id", "execution_mode", "outsourcing_allocations"), true
	case biz.ProductionWIPActionCancelBatch:
		return biz.PermissionProductionWIPAssign, modules, append(base, "production_wip_batch_id", "reason"), true
	case biz.ProductionWIPActionStartOperation,
		biz.ProductionWIPActionCompleteOperation,
		biz.ProductionWIPActionReceiveOutsourcingReturn:
		if action == biz.ProductionWIPActionReceiveOutsourcingReturn {
			modules = append(modules, "outsourcing_orders")
		}
		return biz.PermissionProductionWIPExecute, modules, append(base, "production_wip_batch_id"), true
	case biz.ProductionWIPActionTransferToNextOperation:
		return biz.PermissionProductionWIPExecute, modules, append(base, "production_wip_batch_id", "target_operation_id", "quantity"), true
	case biz.ProductionWIPActionRework:
		return biz.PermissionProductionWIPRework, modules, append(base, "production_wip_batch_id", "target_operation_id", "quantity", "reason"), true
	case biz.ProductionWIPActionConfirmPackagingMaterial:
		return biz.PermissionPackagingMaterialConfirm, []string{productionOrderModuleKey}, append(base, "production_order_item_id", "packaging_version_snapshot", "note"), true
	default:
		return "", nil, nil, false
	}
}

func productionWIPActionFromParams(pm map[string]any, action string, actorID int) (*biz.ProductionWIPAction, bool) {
	orderID, ok1 := productionOrderRequiredPositiveInt(pm, "production_order_id")
	version, ok2 := productionOrderRequiredPositiveInt(pm, "expected_version")
	key, ok3 := productionOrderRequiredString(pm, "idempotency_key", 128)
	if !ok1 || !ok2 || !ok3 || actorID <= 0 {
		return nil, false
	}
	in := &biz.ProductionWIPAction{
		Action:            action,
		ProductionOrderID: orderID,
		ExpectedVersion:   version,
		ActorID:           actorID,
		IdempotencyKey:    key,
	}
	if action == biz.ProductionWIPActionConfirmPackagingMaterial {
		itemID, ok4 := productionOrderRequiredPositiveInt(pm, "production_order_item_id")
		packagingVersion, ok5 := productionOrderOptionalString(pm, "packaging_version_snapshot", 128)
		note, ok6 := productionOrderOptionalString(pm, "note", 255)
		if !ok4 || !ok5 || !ok6 || packagingVersion == nil {
			return nil, false
		}
		in.ProductionOrderItemID = itemID
		in.PackagingVersionSnapshot = packagingVersion
		in.Note = note
		return in, true
	}
	batchID, ok4 := productionOrderRequiredPositiveInt(pm, "production_wip_batch_id")
	if !ok4 {
		return nil, false
	}
	in.BatchID = batchID
	switch action {
	case biz.ProductionWIPActionSplitBatch:
		splits, ok := productionWIPSplitsFromParams(pm["splits"])
		if !ok {
			return nil, false
		}
		in.Splits = splits
	case biz.ProductionWIPActionAssignExecution:
		mode, ok := productionOrderRequiredString(pm, "execution_mode", 16)
		if !ok {
			return nil, false
		}
		allocations, ok := productionWIPOutsourcingAllocationsFromParams(pm["outsourcing_allocations"])
		if !ok {
			return nil, false
		}
		in.ExecutionMode = mode
		in.OutsourcingAllocations = allocations
	case biz.ProductionWIPActionTransferToNextOperation:
		targetID, ok1 := productionOrderRequiredPositiveInt(pm, "target_operation_id")
		quantity, ok2 := productionOrderRequiredDecimalString(pm, "quantity")
		if !ok1 || !ok2 {
			return nil, false
		}
		in.TargetOperationID = targetID
		in.Quantity = quantity
	case biz.ProductionWIPActionRework:
		targetID, ok1 := productionOrderRequiredPositiveInt(pm, "target_operation_id")
		quantity, ok2 := productionOrderRequiredDecimalString(pm, "quantity")
		reason, ok3 := productionOrderOptionalString(pm, "reason", 255)
		if !ok1 || !ok2 || !ok3 || reason == nil {
			return nil, false
		}
		in.TargetOperationID = targetID
		in.Quantity = quantity
		in.Reason = reason
	case biz.ProductionWIPActionCancelBatch:
		reason, ok := productionOrderOptionalString(pm, "reason", 255)
		if !ok || reason == nil {
			return nil, false
		}
		in.Reason = reason
	}
	return in, true
}

func productionWIPOutsourcingAllocationsFromParams(raw any) ([]biz.ProductionWIPOutsourcingAllocationInput, bool) {
	if raw == nil {
		return nil, true
	}
	values, ok := raw.([]any)
	if !ok || len(values) > 100 {
		return nil, false
	}
	allocations := make([]biz.ProductionWIPOutsourcingAllocationInput, 0, len(values))
	for _, value := range values {
		item, ok := value.(map[string]any)
		if !ok || !productionOrderAllowsOnly(item, "outsourcing_order_item_id", "production_order_material_requirement_id") {
			return nil, false
		}
		outsourcingItemID, ok := productionOrderRequiredPositiveInt(item, "outsourcing_order_item_id")
		if !ok {
			return nil, false
		}
		requirementID, ok := productionOrderOptionalPositiveInt(item, "production_order_material_requirement_id")
		if !ok {
			return nil, false
		}
		allocations = append(allocations, biz.ProductionWIPOutsourcingAllocationInput{
			OutsourcingOrderItemID:               outsourcingItemID,
			ProductionOrderMaterialRequirementID: requirementID,
		})
	}
	return allocations, true
}

func productionWIPSplitsFromParams(raw any) ([]biz.ProductionWIPSplit, bool) {
	values, ok := raw.([]any)
	if !ok || len(values) < 2 || len(values) > 100 {
		return nil, false
	}
	splits := make([]biz.ProductionWIPSplit, 0, len(values))
	for _, value := range values {
		item, ok := value.(map[string]any)
		if !ok || !productionOrderAllowsOnly(item, "quantity") {
			return nil, false
		}
		quantity, ok := productionOrderRequiredDecimalString(item, "quantity")
		if !ok {
			return nil, false
		}
		splits = append(splits, biz.ProductionWIPSplit{Quantity: quantity})
	}
	return splits, true
}

func (d *jsonrpcDispatcher) productionWIPAggregateResult(ctx context.Context, aggregate *biz.ProductionWIPAggregate, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapProductionWIPError(ctx, err)
	}
	if aggregate == nil || aggregate.ProductionOrder == nil || aggregate.ProductionOrder.ID <= 0 || aggregate.ProductionOrderID != aggregate.ProductionOrder.ID {
		return productionWIPInternalResult()
	}
	items := make([]any, 0, len(aggregate.ProductionOrderItems))
	for _, item := range aggregate.ProductionOrderItems {
		items = append(items, productionOrderItemToMap(item))
	}
	operations := make([]any, 0, len(aggregate.Operations))
	for _, operation := range aggregate.Operations {
		operations = append(operations, productionWIPOperationToMap(operation))
	}
	batches := make([]any, 0, len(aggregate.Batches))
	for _, batch := range aggregate.Batches {
		batches = append(batches, productionWIPBatchToMap(batch))
	}
	requirements := productionOrderMaterialRequirementsToAny(aggregate.MaterialRequirements)
	allocations := make([]any, 0, len(aggregate.OutsourcingAllocations))
	for _, allocation := range aggregate.OutsourcingAllocations {
		allocations = append(allocations, productionWIPOutsourcingAllocationToMap(allocation))
	}
	confirmations := make([]any, 0, len(aggregate.PackagingConfirmations))
	for _, confirmation := range aggregate.PackagingConfirmations {
		confirmations = append(confirmations, productionPackagingConfirmationToMap(confirmation))
	}
	inspections := make([]any, 0, len(aggregate.QualityInspections))
	for _, inspection := range aggregate.QualityInspections {
		inspections = append(inspections, productionWIPQualitySummaryToMap(inspection))
	}
	return okData(map[string]any{
		"production_order":            productionOrderToMap(aggregate.ProductionOrder),
		"production_order_items":      items,
		"material_requirements":       requirements,
		"production_order_operations": operations,
		"production_wip_batches":      batches,
		"outsourcing_allocations":     allocations,
		"packaging_confirmations":     confirmations,
		"quality_inspections":         inspections,
	})
}

func productionWIPOperationToMap(value *biz.ProductionOrderOperation) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	qualityGates := make([]any, 0, len(value.RequiredQualityGates))
	for _, gate := range value.RequiredQualityGates {
		qualityGates = append(qualityGates, gate)
	}
	return map[string]any{
		"id": value.ID, "production_order_id": value.ProductionOrderID, "production_order_item_id": value.ProductionOrderItemID,
		"route_code": value.RouteCode, "route_version": value.RouteVersion, "step_no": value.StepNo, "operation_code": value.OperationCode,
		"process_id": value.ProcessID, "process_code_snapshot": value.ProcessCodeSnapshot, "process_name_snapshot": value.ProcessNameSnapshot,
		"output_code": value.OutputCode, "inhouse_allowed": value.InhouseAllowed, "outsourcing_allowed": value.OutsourcingAllowed,
		"planned_quantity": value.PlannedQuantity.String(), "required_quality_gates": qualityGates,
		"business_confirmation_code": optionalStringValue(value.BusinessConfirmationCode), "created_at": value.CreatedAt.Unix(),
	}
}

func productionWIPBatchToMap(value *biz.ProductionWIPBatch) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": value.ID, "production_order_id": value.ProductionOrderID, "production_order_item_id": value.ProductionOrderItemID,
		"production_order_operation_id": value.ProductionOrderOperationID, "source_batch_id": optionalIntValue(value.SourceBatchID),
		"batch_no": value.BatchNo, "flow_type": value.FlowType, "execution_mode": optionalStringValue(value.ExecutionMode),
		"status": value.Status, "version": value.Version, "quantity": value.Quantity.String(),
		"rework_reason": optionalStringValue(value.ReworkReason),
		"created_by":    value.CreatedBy, "started_at": optionalTimeUnix(value.StartedAt), "completed_at": optionalTimeUnix(value.CompletedAt),
		"created_at": value.CreatedAt.Unix(), "updated_at": value.UpdatedAt.Unix(),
	}
}

func productionWIPOutsourcingAllocationToMap(value *biz.ProductionWIPOutsourcingAllocation) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": value.ID, "production_wip_batch_id": value.ProductionWIPBatchID,
		"outsourcing_order_item_id":                value.OutsourcingOrderItemID,
		"production_order_material_requirement_id": optionalIntValue(value.ProductionOrderMaterialRequirementID),
		"subject_type":                             value.SubjectType, "allocated_quantity": value.AllocatedQuantity.String(),
		"unit_id": value.UnitID, "created_by": value.CreatedBy, "created_at": value.CreatedAt.Unix(),
	}
}

func productionPackagingConfirmationToMap(value *biz.ProductionPackagingConfirmation) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": value.ID, "production_order_id": value.ProductionOrderID, "production_order_item_id": value.ProductionOrderItemID,
		"status": value.Status, "version": value.Version, "packaging_version_snapshot": optionalStringValue(value.PackagingVersionSnapshot),
		"confirmed_by": optionalIntValue(value.ConfirmedBy), "confirmed_at": optionalTimeUnix(value.ConfirmedAt), "note": optionalStringValue(value.Note),
		"created_at": value.CreatedAt.Unix(), "updated_at": value.UpdatedAt.Unix(),
	}
}

func productionWIPQualitySummaryToMap(value *biz.ProductionWIPQualityInspectionSummary) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": value.ID, "production_wip_batch_id": value.ProductionWIPBatchID, "gate_code": value.GateCode,
		"status": value.Status, "result": optionalStringValue(value.Result),
	}
}

func (d *jsonrpcDispatcher) mapProductionWIPError(ctx context.Context, err error) *v1.JsonrpcResult {
	logger := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrIdempotencyConflict):
		return &v1.JsonrpcResult{Code: errcode.IdempotencyConflict.Code, Message: errcode.IdempotencyConflict.Message}
	case errors.Is(err, biz.ErrProductionOrderNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产订单不存在"}
	case errors.Is(err, biz.ErrProductionWIPInvalidRoute), errors.Is(err, biz.ErrProductionOrderReferenceInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "生产路线或工序档案不完整，请核对四个标准路线位置是否已分别绑定有效工序"}
	case errors.Is(err, biz.ErrProductionWIPQuantityExceeded):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "办理数量超过当前在制批次可用数量"}
	case errors.Is(err, biz.ErrProductionWIPExecutionModeNotAllowed):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前工序不允许所选的本厂或外发方式"}
	case errors.Is(err, biz.ErrProductionWIPOutsourcingAllocationInvalid):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "外发合同明细与当前工序或材料需求不匹配，请重新核对"}
	case errors.Is(err, biz.ErrProductionWIPOutsourcingMaterialIssuePending):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "布料加工材料尚未完成外发发料，不能开工"}
	case errors.Is(err, biz.ErrProductionWIPOutsourcingSourceDependency):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "外发合同已关联在制批次，当前不能取消或改写"}
	case errors.Is(err, biz.ErrProductionWIPQualityGateIncomplete):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前质量关口尚未全部通过，不能继续转序"}
	case errors.Is(err, biz.ErrProductionWIPPackagingConfirmationPending):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "包材版面和包装版本尚未完成业务确认"}
	case errors.Is(err, biz.ErrProductionWIPInvalidTransition), errors.Is(err, biz.ErrProductionOrderInvalidState), errors.Is(err, biz.ErrBadParam):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前在制批次状态不允许该操作，请刷新后核对"}
	default:
		logger.Errorf("[production_wip] operation failed classification=internal err=%v", err)
		return productionWIPInternalResult()
	}
}

func productionWIPInternalResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
}
