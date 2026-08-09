package service

import (
	"context"

	"github.com/shopspring/decimal"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleInventoryOperation(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "get_inventory_operation", "list_inventory_operations":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionWarehouseAdjustmentCreate, biz.PermissionWarehouseAdjustmentApprove); res != nil {
			return id, res, nil
		}
	default:
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseAdjustmentCreate); res != nil {
			return id, res, nil
		}
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", "inventory"); res != nil {
		return id, res, nil
	}
	scope, scopeResult := d.currentWarehouseDataScope(ctx)
	if scopeResult != nil {
		return id, scopeResult, nil
	}
	switch method {
	case "create_inventory_operation":
		in, ok := inventoryOperationCreateFromParams(pm, actorID)
		if !ok {
			return id, invalidParamResult(), nil
		}
		if err := validateInventoryOperationCreateScope(in, scope); err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		item, err := d.inventoryUC.CreateInventoryOperation(ctx, in)
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "save_inventory_operation_draft":
		in, ok := inventoryOperationDraftSaveFromParams(pm)
		if !ok {
			return id, invalidParamResult(), nil
		}
		current, err := d.getInventoryOperationForScope(ctx, in.ID, scope)
		if err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		if err := validateInventoryOperationDraftSaveScope(in, current, scope); err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		item, err := d.inventoryUC.SaveInventoryOperationDraft(ctx, in, actorID)
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "post_inventory_operation":
		if !inventoryOperationAllowsOnly(pm, "id", "expected_version") {
			return id, invalidParamResult(), nil
		}
		operationID := getInt(pm, "id", 0)
		current, err := d.getInventoryOperationForScope(ctx, operationID, scope)
		if err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		if current.OperationType == biz.InventoryOperationManualAdjustment {
			return id, inventoryAdjustmentProcessRequiredResult(), nil
		}
		item, err := d.inventoryUC.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: operationID, ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID})
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "cancel_inventory_operation":
		if !inventoryOperationAllowsOnly(pm, "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		operationID := getInt(pm, "id", 0)
		if _, err := d.getInventoryOperationForScope(ctx, operationID, scope); err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		item, err := d.inventoryUC.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: operationID, ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID, Reason: getString(pm, "reason")})
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "get_inventory_operation":
		if !inventoryOperationAllowsOnly(pm, "id") {
			return id, invalidParamResult(), nil
		}
		item, err := d.getInventoryOperationForScope(ctx, getInt(pm, "id", 0), scope)
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "list_inventory_operations":
		if !inventoryOperationAllowsOnly(pm, "operation_type", "status", "created_by", "limit", "offset") {
			return id, invalidParamResult(), nil
		}
		items, total, err := d.inventoryUC.ListInventoryOperationsForAccess(ctx, biz.InventoryOperationFilter{OperationType: getString(pm, "operation_type"), Status: getString(pm, "status"), CreatedBy: getInt(pm, "created_by", 0), Limit: getInt(pm, "limit", 50), Offset: getInt(pm, "offset", 0)}, scope)
		if err != nil {
			return id, d.mapInventoryError(ctx, err), nil
		}
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, inventoryOperationToAny(item))
		}
		return id, okData(map[string]any{"inventory_operations": out, "total": total, "limit": getInt(pm, "limit", 50), "offset": getInt(pm, "offset", 0)}), nil
	default:
		return id, unknownPurchaseResult(method), nil
	}
}

func inventoryAdjustmentProcessRequiredResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.InvalidParam.Code,
		Message: "人工库存调整必须通过审批任务办理并在流程执行节点过账",
	}
}

func validateInventoryOperationCreateScope(in *biz.InventoryOperationCreate, scope biz.WarehouseDataScope) error {
	if in == nil {
		return biz.ErrBadParam
	}
	for _, item := range in.Items {
		if err := biz.ValidateWarehouseDataScopeAccess(scope, item.FromWarehouseID); err != nil {
			return err
		}
		if item.ToWarehouseID != nil {
			if err := biz.ValidateWarehouseDataScopeAccess(scope, *item.ToWarehouseID); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateInventoryOperationDraftSaveScope(in *biz.InventoryOperationDraftSave, current *biz.InventoryOperation, scope biz.WarehouseDataScope) error {
	if in == nil || current == nil || in.ID != current.ID || len(in.Items) != len(current.Items) {
		return biz.ErrBadParam
	}
	for _, item := range in.Items {
		if item.ToWarehouseID != nil {
			if err := biz.ValidateWarehouseDataScopeAccess(scope, *item.ToWarehouseID); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateInventoryOperationScope(item *biz.InventoryOperation, scope biz.WarehouseDataScope) error {
	if item == nil {
		return biz.ErrBadParam
	}
	for _, line := range item.Items {
		if line == nil {
			return biz.ErrBadParam
		}
		if err := biz.ValidateWarehouseDataScopeAccess(scope, line.FromWarehouseID); err != nil {
			return err
		}
		if line.ToWarehouseID != nil {
			if err := biz.ValidateWarehouseDataScopeAccess(scope, *line.ToWarehouseID); err != nil {
				return err
			}
		}
	}
	return nil
}

func (d *jsonrpcDispatcher) getInventoryOperationForScope(ctx context.Context, id int, scope biz.WarehouseDataScope) (*biz.InventoryOperation, error) {
	item, err := d.inventoryUC.GetInventoryOperation(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := validateInventoryOperationScope(item, scope); err != nil {
		return nil, err
	}
	return item, nil
}

func inventoryOperationCreateFromParams(pm map[string]any, actorID int) (*biz.InventoryOperationCreate, bool) {
	if !inventoryOperationAllowsOnly(pm, "operation_no", "operation_type", "reason", "idempotency_key", "items") {
		return nil, false
	}
	raw, ok := pm["items"].([]any)
	if !ok || len(raw) == 0 {
		return nil, false
	}
	in := &biz.InventoryOperationCreate{OperationNo: getString(pm, "operation_no"), OperationType: getString(pm, "operation_type"), Reason: getString(pm, "reason"), IdempotencyKey: getString(pm, "idempotency_key"), CreatedBy: actorID}
	for _, value := range raw {
		m, ok := value.(map[string]any)
		if !ok || !inventoryOperationAllowsOnly(m, "line_no", "subject_type", "subject_id", "product_sku_id", "from_warehouse_id", "from_lot_id", "to_warehouse_id", "to_lot_id", "unit_id", "expected_quantity", "counted_quantity", "adjustment_quantity", "note") {
			return nil, false
		}
		expected, ok1 := getOptionalJSONRPCDecimalString(m, "expected_quantity")
		counted, ok2 := getOptionalJSONRPCDecimalString(m, "counted_quantity")
		adjustment, ok3 := getOptionalInventoryOperationDecimal(m, "adjustment_quantity")
		note, ok4 := optionalJSONRPCString(m, "note")
		if !ok1 || !ok2 || !ok3 || !ok4 {
			return nil, false
		}
		item := biz.InventoryOperationItemCreate{LineNo: getString(m, "line_no"), SubjectType: getString(m, "subject_type"), SubjectID: getInt(m, "subject_id", 0), ProductSkuID: optionalPositiveInt(m, "product_sku_id"), FromWarehouseID: getInt(m, "from_warehouse_id", 0), FromLotID: optionalPositiveInt(m, "from_lot_id"), ToWarehouseID: optionalPositiveInt(m, "to_warehouse_id"), ToLotID: optionalPositiveInt(m, "to_lot_id"), UnitID: getInt(m, "unit_id", 0), ExpectedQuantity: expected, CountedQuantity: counted, AdjustmentQuantity: adjustment, Note: note}
		in.Items = append(in.Items, item)
	}
	return in, true
}

func inventoryOperationDraftSaveFromParams(pm map[string]any) (*biz.InventoryOperationDraftSave, bool) {
	if !inventoryOperationAllowsOnly(pm, "id", "expected_version", "operation_no", "reason", "items") {
		return nil, false
	}
	id, idOK := getRequiredJSONRPCPositiveInt(pm, "id")
	expectedVersion, versionOK := getRequiredJSONRPCPositiveInt(pm, "expected_version")
	rawItems, itemsOK := pm["items"].([]any)
	if !idOK || !versionOK || !itemsOK || len(rawItems) == 0 {
		return nil, false
	}
	in := &biz.InventoryOperationDraftSave{
		ID: id, ExpectedVersion: expectedVersion,
		OperationNo: getString(pm, "operation_no"), Reason: getString(pm, "reason"),
	}
	for _, raw := range rawItems {
		params, ok := raw.(map[string]any)
		if !ok || !inventoryOperationAllowsOnly(params, "id", "counted_quantity", "adjustment_quantity", "to_warehouse_id", "note") {
			return nil, false
		}
		itemID, ok := getRequiredJSONRPCPositiveInt(params, "id")
		if !ok {
			return nil, false
		}
		counted, countedOK := getOptionalJSONRPCDecimalString(params, "counted_quantity")
		adjustment, adjustmentOK := getOptionalInventoryOperationDecimal(params, "adjustment_quantity")
		toWarehouseID, toWarehouseOK := getOptionalInventoryOperationPositiveInt(params, "to_warehouse_id")
		note, noteOK := optionalJSONRPCString(params, "note")
		if !countedOK || !adjustmentOK || !toWarehouseOK || !noteOK {
			return nil, false
		}
		in.Items = append(in.Items, biz.InventoryOperationDraftItemSave{
			ID: itemID, CountedQuantity: counted, AdjustmentQuantity: adjustment,
			ToWarehouseID: toWarehouseID, Note: note,
		})
	}
	return in, true
}

func inventoryOperationAllowsOnly(pm map[string]any, keys ...string) bool {
	allowed := map[string]struct{}{}
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
func optionalJSONRPCString(pm map[string]any, key string) (*string, bool) {
	v, ok := pm[key]
	if !ok || v == nil {
		return nil, true
	}
	s, ok := v.(string)
	if !ok {
		return nil, false
	}
	return &s, true
}
func optionalPositiveInt(pm map[string]any, key string) *int {
	v := getInt(pm, key, 0)
	if v <= 0 {
		return nil
	}
	return &v
}
func getOptionalInventoryOperationDecimal(pm map[string]any, key string) (decimal.Decimal, bool) {
	if _, ok := pm[key]; !ok {
		return decimal.Zero, true
	}
	return getRequiredJSONRPCNumeric20Scale6(pm, key)
}
func getOptionalInventoryOperationPositiveInt(pm map[string]any, key string) (*int, bool) {
	raw, ok := pm[key]
	if !ok || raw == nil {
		return nil, true
	}
	value, ok := getRequiredJSONRPCPositiveInt(pm, key)
	if !ok {
		return nil, false
	}
	return &value, true
}
func optionalDecimalToAny(value *decimal.Decimal) any {
	if value == nil {
		return nil
	}
	return value.String()
}
func inventoryOperationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.InventoryOperation, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapInventoryError(ctx, err)
	}
	return okData(map[string]any{"inventory_operation": inventoryOperationToAny(item)})
}
func inventoryOperationToAny(item *biz.InventoryOperation) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	items := make([]any, 0, len(item.Items))
	for _, line := range item.Items {
		items = append(items, map[string]any{"id": line.ID, "line_no": line.LineNo, "subject_type": line.SubjectType, "subject_id": line.SubjectID, "product_sku_id": optionalIntToAny(line.ProductSkuID), "from_warehouse_id": line.FromWarehouseID, "from_lot_id": optionalIntToAny(line.FromLotID), "to_warehouse_id": optionalIntToAny(line.ToWarehouseID), "to_lot_id": optionalIntToAny(line.ToLotID), "unit_id": line.UnitID, "expected_quantity": optionalDecimalToAny(line.ExpectedQuantity), "counted_quantity": optionalDecimalToAny(line.CountedQuantity), "adjustment_quantity": line.AdjustmentQuantity.String(), "note": optionalStringToAny(line.Note)})
	}
	return map[string]any{"id": item.ID, "operation_no": item.OperationNo, "operation_type": item.OperationType, "status": item.Status, "reason": item.Reason, "version": item.Version, "submitted_at": optionalUnix(item.SubmittedAt), "submitted_by": optionalIntToAny(item.SubmittedBy), "approved_at": optionalUnix(item.ApprovedAt), "approved_by": optionalIntToAny(item.ApprovedBy), "rejected_at": optionalUnix(item.RejectedAt), "rejected_by": optionalIntToAny(item.RejectedBy), "reject_reason": optionalStringToAny(item.RejectReason), "posted_at": optionalUnix(item.PostedAt), "posted_by": optionalIntToAny(item.PostedBy), "cancelled_at": optionalUnix(item.CancelledAt), "cancelled_by": optionalIntToAny(item.CancelledBy), "cancel_reason": optionalStringToAny(item.CancelReason), "created_by": item.CreatedBy, "created_at": item.CreatedAt.Unix(), "updated_at": item.UpdatedAt.Unix(), "items": items}
}
