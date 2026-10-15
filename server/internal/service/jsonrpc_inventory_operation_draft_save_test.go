package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryOperationDraftSaveJSONRPCKeepsServerTruthAndStrictParams(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_inventory_operation_draft_save")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger))
	dispatcher := newInventoryJSONRPCTestData(data, workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWarehouseAdjustmentCreate,
	))
	dispatcher.customerConfigUC = biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	const configRevision = "2026.08.09.inventory-operation-draft-save"
	configParams := customerConfigPublishParamsForRevision(t, configRevision)
	configParams = customerConfigPublishParamsWithRevisionAndModuleState(t, configParams, configRevision, "inventory", "enabled")
	publishAndActivateCustomerConfigUsecaseForTest(t, dispatcher, configParams, 7)
	_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
		WarehouseID: fixtures.warehouseID, TxnType: biz.InventoryTxnIn, Direction: 1,
		Quantity: decimal.NewFromInt(10), UnitID: fixtures.unitID,
		SourceType: "TEST", IdempotencyKey: "jsonrpc-operation-save-seed",
	})
	if err != nil {
		t.Fatal(err)
	}
	expected, counted := decimal.NewFromInt(10), decimal.NewFromInt(8)
	created, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{
		OperationNo: "CC-RPC-SAVE", OperationType: biz.InventoryOperationCycleCount,
		Reason: "月盘", IdempotencyKey: "cc-rpc-save", CreatedBy: 7,
		Items: []biz.InventoryOperationItemCreate{{
			LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID,
			FromWarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			ExpectedQuantity: &expected, CountedQuantity: &counted,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	params := map[string]any{
		"id": float64(created.ID), "expected_version": float64(created.Version),
		"operation_no": "CC-RPC-SAVE-2", "reason": "复盘修正",
		"items": []any{map[string]any{
			"id": float64(created.Items[0].ID), "counted_quantity": "7", "note": "复核",
		}},
	}
	_, result, err := dispatcher.handleInventory(workflowJSONRPCAdminContext(), "save_inventory_operation_draft", "save", mustJSONRPCStruct(t, params))
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("save result=%#v err=%v", result, err)
	}
	saved := jsonRPCNestedMap(t, result, "inventory_operation")
	if saved["operation_no"] != "CC-RPC-SAVE-2" || jsonRPCInt(t, saved, "version") != created.Version+1 {
		t.Fatalf("saved=%#v", saved)
	}
	params["unexpected"] = true
	_, invalid, err := dispatcher.handleInventory(workflowJSONRPCAdminContext(), "save_inventory_operation_draft", "invalid", mustJSONRPCStruct(t, params))
	if err != nil || invalid == nil || invalid.Code != errcode.InvalidParam.Code {
		t.Fatalf("strict params result=%#v err=%v", invalid, err)
	}
	delete(params, "unexpected")
	params["items"] = []any{map[string]any{
		"id": float64(created.Items[0].ID), "counted_quantity": "7", "to_warehouse_id": "not-an-id",
	}}
	_, invalid, err = dispatcher.handleInventory(workflowJSONRPCAdminContext(), "save_inventory_operation_draft", "invalid-target", mustJSONRPCStruct(t, params))
	if err != nil || invalid == nil || invalid.Code != errcode.InvalidParam.Code {
		t.Fatalf("strict target warehouse result=%#v err=%v", invalid, err)
	}
}
