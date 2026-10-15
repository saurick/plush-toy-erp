package service

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"
)

func TestWarehouseMasterDataPermissionsAndMaterialReferenceBoundary(t *testing.T) {
	d, client := openInventoryRepoTestData(t, "warehouse_permissions")
	createInventoryTestFixtures(t, context.Background(), client)
	logger := log.NewStdLogger(io.Discard)
	admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionMaterialRead)
	j := &jsonrpcDispatcher{log: log.NewHelper(logger), masterDataUC: biz.NewMasterDataUsecase(datarepo.NewMasterDataRepo(d, logger)), adminReader: stubAdminAccountReader{admin: admin}, adminManageUC: newAllWarehouseScopeAdminUsecase()}
	ctx := workflowJSONRPCAdminContext()
	_, result, err := j.handleMasterData(ctx, "list_material_warehouses", "refs", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("engineering reference options: %+v %v", result, err)
	}
	warehouses := jsonRPCList(t, result.Data.AsMap(), "warehouses")
	if len(warehouses) != 1 {
		t.Fatalf("material options included product warehouse: %+v", warehouses)
	}
	if _, exists := warehouses[0].(map[string]any)["quantity"]; exists {
		t.Fatal("master references exposed stock balances")
	}
	_, result, _ = j.handleMasterData(ctx, "list_warehouses", "inventory", mustJSONRPCStruct(t, map[string]any{}))
	if result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("reference access granted inventory access: %+v", result)
	}
	params := mustJSONRPCStruct(t, map[string]any{"code": "NEW-WH", "name": "主料二仓", "type": "MAIN_MATERIAL", "is_active": true})
	_, result, _ = j.handleMasterData(ctx, "create_warehouse", "denied", params)
	if result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("unprivileged warehouse create: %+v", result)
	}
	admin.Permissions = append(admin.Permissions, biz.PermissionWarehouseManage)
	_, result, err = j.handleMasterData(ctx, "create_warehouse", "created", params)
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("warehouse create: %+v %v", result, err)
	}
	count := client.Warehouse.Query().CountX(ctx)
	for _, input := range []struct {
		method string
		field  string
		value  any
	}{
		{"update_warehouse", "id", 1.5},
		{"update_warehouse", "id", "1"},
		{"update_warehouse", "id", nil},
		{"create_warehouse", "id", 0},
		{"create_warehouse", "is_active", "false"},
	} {
		invalid := map[string]any{"code": "INVALID-WH", "name": "非法仓库", "type": "MAIN_MATERIAL"}
		invalid[input.field] = input.value
		_, result, _ = j.handleMasterData(ctx, input.method, "invalid", mustJSONRPCStruct(t, invalid))
		if result.Code != errcode.InvalidParam.Code {
			t.Fatalf("accepted %s %s=%v: %+v", input.method, input.field, input.value, result)
		}
	}
	if client.Warehouse.Query().CountX(ctx) != count {
		t.Fatal("invalid warehouse input persisted rows")
	}
}

func TestPurchaseReceiptItemWarehouseParamsRejectMalformedAndDuplicateRows(t *testing.T) {
	for _, value := range []any{nil, "1", []any{}, []any{map[string]any{"purchase_order_item_id": 1.5, "warehouse_id": 2}}, []any{map[string]any{"purchase_order_item_id": 1, "warehouse_id": 2}, map[string]any{"purchase_order_item_id": 1, "warehouse_id": 3}}, []any{map[string]any{"purchase_order_item_id": 1, "warehouse_id": 2, "quantity": 100}}} {
		if _, ok := purchaseReceiptItemWarehousesFromParams(map[string]any{"item_warehouses": value}); ok {
			t.Fatalf("accepted malformed warehouse rows: %#v", value)
		}
	}
	rows, ok := purchaseReceiptItemWarehousesFromParams(map[string]any{"item_warehouses": []any{map[string]any{"purchase_order_item_id": 1, "warehouse_id": 2}, map[string]any{"purchase_order_item_id": 3, "warehouse_id": 4}}})
	if !ok || rows[1] != 2 || rows[3] != 4 {
		t.Fatalf("valid rows: %+v %v", rows, ok)
	}
}
