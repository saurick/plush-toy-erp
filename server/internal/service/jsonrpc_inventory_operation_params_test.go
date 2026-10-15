package service

import (
	"context"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryOperationJSONRPCRejectsInvalidIDsWithoutWrites(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_operation_strict_ids")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	d := newInventoryJSONRPCTestData(data, workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWarehouseAdjustmentCreate))
	d.customerConfigUC = biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	params := customerConfigPublishParamsForRevision(t, "strict-operation-ids")
	params = customerConfigPublishParamsWithRevisionAndModuleState(t, params, "strict-operation-ids", "inventory", "enabled")
	publishAndActivateCustomerConfigUsecaseForTest(t, d, params, 7)
	expected, counted := decimal.Zero, decimal.NewFromInt(1)
	op, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{
		OperationNo: "STRICT-IDS", OperationType: biz.InventoryOperationCycleCount, Reason: "参数验证", IdempotencyKey: "strict-ids", CreatedBy: 7,
		Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
			FromWarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, ExpectedQuantity: &expected, CountedQuantity: &counted}},
	})
	if err != nil {
		t.Fatal(err)
	}
	invalid := []any{1.9, "abc", "1", -1, 0, true, float64(9007199254740992), nil}
	call := func(t *testing.T, method string, pm map[string]any) {
		t.Helper()
		_, result, err := d.handleInventory(workflowJSONRPCAdminContext(), method, "invalid", mustJSONRPCStruct(t, pm))
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("%s result=%#v error=%v", method, result, err)
		}
	}
	for _, method := range []string{"get_inventory_operation", "post_inventory_operation", "cancel_inventory_operation"} {
		for _, key := range []string{"id", "expected_version"} {
			if method == "get_inventory_operation" && key == "expected_version" {
				continue
			}
			for _, value := range invalid {
				t.Run(fmt.Sprintf("%s/%s/%v", method, key, value), func(t *testing.T) {
					pm := map[string]any{"id": float64(op.ID)}
					if method != "get_inventory_operation" {
						pm["expected_version"] = float64(op.Version)
					}
					pm[key] = value
					call(t, method, pm)
				})
			}
		}
	}
	for _, value := range invalid {
		if value == nil || value == 0 {
			continue
		}
		call(t, "list_inventory_operations", map[string]any{"created_by": value})
	}
	for _, key := range []string{"subject_id", "from_warehouse_id", "unit_id", "product_sku_id", "from_lot_id", "to_warehouse_id", "to_lot_id"} {
		for _, value := range invalid {
			if value == nil && (key == "product_sku_id" || key == "from_lot_id" || key == "to_warehouse_id" || key == "to_lot_id") {
				continue
			}
			t.Run(fmt.Sprintf("create/%s/%v", key, value), func(t *testing.T) {
				item := map[string]any{"line_no": "1", "subject_type": biz.InventorySubjectMaterial, "subject_id": float64(fixtures.materialID),
					"from_warehouse_id": float64(fixtures.warehouseID), "unit_id": float64(fixtures.unitID), "counted_quantity": "1", "expected_quantity": "0"}
				item[key] = value
				call(t, "create_inventory_operation", map[string]any{"operation_type": biz.InventoryOperationCycleCount,
					"operation_no": "INVALID", "reason": "参数验证", "idempotency_key": "invalid-create", "items": []any{item}})
			})
		}
	}
	current, err := uc.GetInventoryOperation(ctx, op.ID)
	if err != nil || current.Version != op.Version || current.Status != op.Status {
		t.Fatalf("invalid requests changed operation: %#v error=%v", current, err)
	}
	if count := client.InventoryOperation.Query().CountX(ctx); count != 1 {
		t.Fatalf("invalid requests created %d operations", count)
	}
	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("invalid requests created %d transactions", count)
	}
	if count := client.InventoryBalance.Query().CountX(ctx); count != 0 {
		t.Fatalf("invalid requests changed %d balances", count)
	}
}

func TestInventoryOperationCreateOptionalIDsPreserveNullAndMissing(t *testing.T) {
	item := map[string]any{"subject_id": float64(1), "from_warehouse_id": float64(2), "unit_id": float64(3), "from_lot_id": nil, "to_lot_id": nil}
	in, ok := inventoryOperationCreateFromParams(map[string]any{"items": []any{item}}, 7)
	if !ok || in.Items[0].FromLotID != nil || in.Items[0].ProductSkuID != nil || in.Items[0].ToLotID != nil {
		t.Fatalf("optional null or missing: %#v %v", in, ok)
	}
}
