package service

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type receiptWarehouseScopeAdminRepo struct {
	*memAdminManageRepoForData
	scope biz.WarehouseDataScope
}

type receiptProcessAccessHandler struct {
	calls int
	scope *biz.WarehouseDataScope
}

func (h *receiptProcessAccessHandler) ValidateProcessDomainCommand(context.Context, *biz.ProcessDomainCommandInput, int) error {
	return nil
}

func (h *receiptProcessAccessHandler) ExecuteProcessDomainCommand(_ context.Context, in *biz.ProcessDomainCommandInput, _ int) (*biz.ProcessDomainCommandResult, error) {
	h.calls++
	h.scope = in.WarehouseScope
	return &biz.ProcessDomainCommandResult{Outcome: "checked", EffectState: biz.ProcessDomainCommandEffectStateNone}, nil
}

func TestPurchaseReceiptProcessJSONRPCChecksScopeBeforeExecutionAndReplay(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_receipt_process_access")
	f := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey}, biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptRead,
		biz.PermissionWarehouseInboundRead, biz.PermissionWarehouseInboundConfirm, biz.PermissionQualityInspectionRead,
	))
	receipt, source := createPurchaseReceiptAppendSourceForServiceTest(t, ctx, client, j.inventoryUC, f, "PROCESS-ACCESS")
	if _, err := j.inventoryUC.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID: receipt.ID, MaterialID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID,
		PurchaseOrderItemID: &source.ID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "process-access-fixture",
	}); err != nil {
		t.Fatal(err)
	}
	scopeRepo := &receiptWarehouseScopeAdminRepo{memAdminManageRepoForData: newMemAdminManageRepoForData()}
	j.adminManageUC = biz.NewAdminManageUsecase(scopeRepo, log.NewStdLogger(io.Discard), nil)
	processRepo := newServiceProcessRuntimeRepo()
	j.processRuntimeUC = biz.NewProcessRuntimeUsecase(processRepo, newServiceWorkflowRepo(), j.customerConfigUC)
	handler := &receiptProcessAccessHandler{}
	if err := j.processRuntimeUC.RegisterDomainCommandHandler(biz.ProcessDomainCommandInventoryPostInbound, handler); err != nil {
		t.Fatal(err)
	}
	revision := getString(customerConfigPublishParams(t).AsMap(), "revision")
	instance, _, err := j.processRuntimeUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey: biz.ProcessKeyMaterialSupply, ProcessVersion: "v1", ConfigRevision: revision, DefinitionHash: strings.Repeat("a", 64),
		BusinessRefType: "purchase_order", BusinessRefID: source.PurchaseOrderID, IdempotencyKey: "process-access-instance",
		ModuleContractSnapshot: map[string]any{"source": "active_customer_config", "customer_key": biz.DefaultCustomerKey, "config_revision": revision},
		Nodes: []biz.ProcessNodeInstanceCreate{
			{NodeKey: "post", NodeType: biz.ProcessNodeTypeDomainCommand, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": biz.ProcessDomainCommandInventoryPostInbound}},
			{NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Status: biz.ProcessNodeStatusWaiting},
		},
	}, 7)
	if err != nil {
		t.Fatal(err)
	}
	node, err := j.processRuntimeUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, 7)
	if err != nil {
		t.Fatal(err)
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"process_instance_id": float64(instance.ID), "process_node_instance_id": float64(node.ID), "expected_version": float64(node.Version),
		"purchase_receipt_id": float64(receipt.ID), "idempotency_key": "process-access-post",
	})
	call := func(scope biz.WarehouseDataScope, code int32) {
		t.Helper()
		scopeRepo.scope = scope
		_, result, err := j.Handle(workflowJSONRPCAdminContext(), "customer_config", "2.0", "execute_material_supply_post_inbound", "scope", params)
		if err != nil || result == nil || result.Code != code || (code != errcode.OK.Code && result.Data != nil) {
			t.Fatalf("scope=%v result=%#v err=%v want=%d", scope, result, err, code)
		}
	}
	call(biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID + 1000}}, errcode.PermissionDenied.Code)
	call(biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}, errcode.PermissionDenied.Code)
	if handler.calls != 0 || processRepo.nodes[node.ID].DomainCommandFingerprint != nil {
		t.Fatal("denied process call claimed or executed a command")
	}
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	call(assigned, errcode.OK.Code)
	if handler.calls != 1 || handler.scope == nil || !handler.scope.Allows(f.warehouseID) || handler.scope.IsAll() {
		t.Fatal("authorized process command lost its warehouse scope")
	}
	call(biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}, errcode.PermissionDenied.Code)
	call(assigned, errcode.OK.Code)
	if handler.calls != 1 || client.InventoryTxn.Query().CountX(ctx) != 0 {
		t.Fatal("scope checks or stored-result replay executed the simulated handler twice or wrote inventory")
	}
}

func (r *receiptWarehouseScopeAdminRepo) ListRoleDataScopesByRoleKeys(context.Context, []string) ([]biz.RoleDataScope, error) {
	return []biz.RoleDataScope{{ResourceType: biz.DataScopeResourceWarehouse, Mode: r.scope.Mode, ResourceIDs: r.scope.WarehouseIDs}}, nil
}

func TestPurchaseReceiptJSONRPCWarehouseScopeAndIdempotentReadback(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_receipt_warehouse_access")
	f := createInventoryTestFixtures(t, ctx, client)
	other := client.Warehouse.Create().SetCode("WH-API-OTHER").SetName("范围外模拟仓库").SetType("MATERIAL").SetIsActive(true).SaveX(ctx)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey, biz.PurchaseRoleKey},
		biz.PermissionPurchaseOrderRead, biz.PermissionPurchaseReceiptCreate, biz.PermissionPurchaseReceiptRead,
		biz.PermissionPurchaseReceiptCancelDraft, biz.PermissionWarehouseInboundRead, biz.PermissionWarehouseInboundConfirm,
	))
	scopeRepo := &receiptWarehouseScopeAdminRepo{memAdminManageRepoForData: newMemAdminManageRepoForData(), scope: biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}}
	j.adminManageUC = biz.NewAdminManageUsecase(scopeRepo, log.NewStdLogger(io.Discard), nil)
	call := func(method string, params map[string]any, code int32) *v1.JsonrpcResult {
		t.Helper()
		_, result, err := j.Handle(workflowJSONRPCAdminContext(), "purchase", "2.0", method, "scope", mustJSONRPCStruct(t, params))
		if err != nil || result == nil || result.Code != code {
			t.Fatalf("%s scope=%v result=%#v err=%v want=%d", method, scopeRepo.scope, result, err, code)
		}
		if code == errcode.PermissionDenied.Code && result.Data != nil {
			t.Fatalf("%s disclosed response data: %#v", method, result.Data)
		}
		return result
	}
	create := func(suffix string, warehouses ...int) (*biz.PurchaseReceipt, int) {
		t.Helper()
		receipt, source := createPurchaseReceiptAppendSourceForServiceTest(t, ctx, client, j.inventoryUC, f, suffix)
		for index, warehouseID := range warehouses {
			_, err := j.inventoryUC.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
				ReceiptID: receipt.ID, MaterialID: f.materialID, UnitID: f.unitID, WarehouseID: warehouseID,
				PurchaseOrderItemID: &source.ID, Quantity: decimal.NewFromInt(1), IdempotencyKey: fmt.Sprintf("api-fixture-%s-%d", suffix, index),
			})
			if err != nil {
				t.Fatal(err)
			}
		}
		return receipt, source.ID
	}
	allowed, allowedSourceID := create("API-ACCESS-ALLOWED", f.warehouseID)
	outside, _ := create("API-ACCESS-OUTSIDE", other.ID)
	mixed, _ := create("API-ACCESS-MIXED", f.warehouseID, other.ID)
	appendParams := map[string]any{
		"receipt_id": float64(allowed.ID), "material_id": float64(f.materialID), "unit_id": float64(f.unitID),
		"warehouse_id": float64(f.warehouseID), "purchase_order_item_id": float64(allowedSourceID),
		"quantity": "1", "idempotency_key": "api-scope-append",
	}
	scopeRepo.scope = biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
	call("get_purchase_receipt", map[string]any{"id": float64(allowed.ID)}, errcode.OK.Code)
	call("add_purchase_receipt_item", appendParams, errcode.OK.Code)
	call("add_purchase_receipt_item", appendParams, errcode.OK.Code)
	for _, receipt := range []*biz.PurchaseReceipt{outside, mixed} {
		for _, method := range []string{"get_purchase_receipt", "post_purchase_receipt", "cancel_purchase_receipt", "cancel_purchase_receipt_draft"} {
			call(method, map[string]any{"id": float64(receipt.ID)}, errcode.PermissionDenied.Code)
		}
		params := make(map[string]any, len(appendParams))
		for key, value := range appendParams {
			params[key] = value
		}
		params["receipt_id"] = float64(receipt.ID)
		call("add_purchase_receipt_item", params, errcode.PermissionDenied.Code)
	}
	list := call("list_purchase_receipts", map[string]any{"limit": float64(1), "warehouse_id": float64(f.warehouseID)}, errcode.OK.Code)
	rows := list.Data.AsMap()["purchase_receipts"].([]any)
	if jsonRPCInt(t, list.Data.AsMap(), "total") != 1 || len(rows) != 1 || jsonRPCInt(t, rows[0].(map[string]any), "id") != allowed.ID {
		t.Fatalf("list exposed an outside or partial receipt: %#v", list.Data)
	}
	for _, line := range rows[0].(map[string]any)["items"].([]any) {
		if jsonRPCInt(t, line.(map[string]any), "warehouse_id") != f.warehouseID {
			t.Fatal("nested line escaped warehouse scope")
		}
	}
	itemCount, lotCount, inspectionCount := client.PurchaseReceiptItem.Query().CountX(ctx), client.InventoryLot.Query().CountX(ctx), client.QualityInspection.Query().CountX(ctx)
	scopeRepo.scope = biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
	call("add_purchase_receipt_item", appendParams, errcode.PermissionDenied.Code)
	call("get_purchase_receipt", map[string]any{"id": float64(allowed.ID)}, errcode.PermissionDenied.Code)
	list = call("list_purchase_receipts", map[string]any{}, errcode.OK.Code)
	if jsonRPCInt(t, list.Data.AsMap(), "total") != 0 || len(list.Data.AsMap()["purchase_receipts"].([]any)) != 0 {
		t.Fatalf("NONE list exposed documents: %#v", list.Data)
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 || client.PurchaseReceiptItem.Query().CountX(ctx) != itemCount || client.InventoryLot.Query().CountX(ctx) != lotCount || client.QualityInspection.Query().CountX(ctx) != inspectionCount {
		t.Fatal("denied requests changed inventory, receipt lines, lots or quality facts")
	}
	passPurchaseReceiptQualityForServiceTest(t, ctx, j.inventoryUC, allowed.ID)
	for _, method := range []string{"post_purchase_receipt", "cancel_purchase_receipt"} {
		scopeRepo.scope = biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}}
		call(method, map[string]any{"id": float64(allowed.ID)}, errcode.OK.Code)
		call(method, map[string]any{"id": float64(allowed.ID)}, errcode.OK.Code)
		scopeRepo.scope = biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
		call(method, map[string]any{"id": float64(allowed.ID)}, errcode.PermissionDenied.Code)
	}
	if client.InventoryTxn.Query().CountX(ctx) != 4 {
		t.Fatal("post or cancel replay duplicated inventory effects")
	}
}
