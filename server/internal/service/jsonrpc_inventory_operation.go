package service

import (
	"context"

	"github.com/shopspring/decimal"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleInventoryOperation(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseAdjustmentCreate); res != nil {
		return id, res, nil
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, "", "inventory"); res != nil {
		return id, res, nil
	}
	switch method {
	case "create_inventory_operation":
		in, ok := inventoryOperationCreateFromParams(pm, actorID)
		if !ok {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.CreateInventoryOperation(ctx, in)
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "post_inventory_operation":
		if !inventoryOperationAllowsOnly(pm, "id", "expected_version") {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID})
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "cancel_inventory_operation":
		if !inventoryOperationAllowsOnly(pm, "id", "expected_version", "reason") {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.CancelInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: getInt(pm, "id", 0), ExpectedVersion: getInt(pm, "expected_version", 0), ActorID: actorID, Reason: getString(pm, "reason")})
		return id, inventoryOperationResult(ctx, d, item, err), nil
	case "get_inventory_operation":
		if !inventoryOperationAllowsOnly(pm, "id") {
			return id, invalidParamResult(), nil
		}
		item, err := d.inventoryUC.GetInventoryOperation(ctx, getInt(pm, "id", 0))
		return id, inventoryOperationResult(ctx, d, item, err), nil
	default:
		return id, unknownPurchaseResult(method), nil
	}
}

func inventoryOperationCreateFromParams(pm map[string]any, actorID int) (*biz.InventoryOperationCreate, bool) {
	if !inventoryOperationAllowsOnly(pm, "operation_no", "operation_type", "reason", "approval_ref", "idempotency_key", "items") {
		return nil, false
	}
	raw, ok := pm["items"].([]any)
	if !ok || len(raw) == 0 {
		return nil, false
	}
	approval, ok := optionalJSONRPCString(pm, "approval_ref")
	if !ok {
		return nil, false
	}
	in := &biz.InventoryOperationCreate{OperationNo: getString(pm, "operation_no"), OperationType: getString(pm, "operation_type"), Reason: getString(pm, "reason"), ApprovalRef: approval, IdempotencyKey: getString(pm, "idempotency_key"), CreatedBy: actorID}
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
	return map[string]any{"id": item.ID, "operation_no": item.OperationNo, "operation_type": item.OperationType, "status": item.Status, "reason": item.Reason, "approval_ref": optionalStringToAny(item.ApprovalRef), "version": item.Version, "posted_at": optionalUnix(item.PostedAt), "posted_by": optionalIntToAny(item.PostedBy), "cancelled_at": optionalUnix(item.CancelledAt), "cancelled_by": optionalIntToAny(item.CancelledBy), "cancel_reason": optionalStringToAny(item.CancelReason), "items": items}
}
