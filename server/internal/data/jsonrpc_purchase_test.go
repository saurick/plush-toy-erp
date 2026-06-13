package data

import (
	"context"
	"io"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJsonrpcData_PurchaseReceiptAPIClosesInboundInventoryFact(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt")
	fixtures := createInventoryTestFixtures(t, ctx, client)

	j := newPurchaseJSONRPCTestData(data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseReceiptRead,
		biz.PermissionERPDashboardRead,
	))
	adminCtx := workflowJSONRPCAdminContext()

	_, legacyRes, err := j.handlePurchase(adminCtx, "create_purchase_receipt_draft", "legacy", mustJSONRPCStruct(t, map[string]any{
		"receipt_no":         "PR-JSONRPC-LEGACY",
		"supplier_name":      "归档供应商",
		"business_record_id": float64(1),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if legacyRes == nil || legacyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("purchase API must reject business_record_id on new facts, got %#v", legacyRes)
	}

	_, receiptRes, err := j.handlePurchase(adminCtx, "create_purchase_receipt_draft", "1", mustJSONRPCStruct(t, map[string]any{
		"receipt_no":    "PR-JSONRPC-001",
		"supplier_name": "布料供应商",
		"received_at":   "2026-06-11",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if receiptRes == nil || receiptRes.Code != errcode.OK.Code {
		t.Fatalf("expected create OK, got %#v", receiptRes)
	}
	receiptID := jsonRPCInt(t, jsonRPCNestedMap(t, receiptRes, "purchase_receipt"), "id")

	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("draft purchase receipt must not write inventory txns, got %d", count)
	}

	_, itemRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "2", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":     float64(receiptID),
		"material_id":    float64(fixtures.materialID),
		"warehouse_id":   float64(fixtures.warehouseID),
		"unit_id":        float64(fixtures.unitID),
		"lot_no":         "JSONRPC-LOT-001",
		"quantity":       "8.5",
		"source_line_no": "1",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if itemRes == nil || itemRes.Code != errcode.OK.Code {
		t.Fatalf("expected add item OK, got %#v", itemRes)
	}
	itemID := jsonRPCInt(t, jsonRPCNestedMap(t, itemRes, "purchase_receipt_item"), "id")

	j.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWarehouseInboundConfirm,
		biz.PermissionWarehouseInboundRead,
		biz.PermissionERPDashboardRead,
	)}

	_, postedRes, err := j.handlePurchase(adminCtx, "post_purchase_receipt", "3", mustJSONRPCStruct(t, map[string]any{"id": float64(receiptID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if postedRes == nil || postedRes.Code != errcode.OK.Code {
		t.Fatalf("expected post OK, got %#v", postedRes)
	}
	posted := jsonRPCNestedMap(t, postedRes, "purchase_receipt")
	if status := posted["status"]; status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("expected posted status, got %#v", status)
	}

	inboundCount := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receiptID),
			inventorytxn.SourceLineID(itemID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		CountX(ctx)
	if inboundCount != 1 {
		t.Fatalf("expected one inbound txn after post, got %d", inboundCount)
	}
	postedItems := posted["items"].([]any)
	if len(postedItems) != 1 {
		t.Fatalf("expected one posted item, got %d", len(postedItems))
	}
	postedItem := postedItems[0].(map[string]any)
	lotID := jsonRPCInt(t, postedItem, "lot_id")
	balance, err := j.inventoryUC.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get posted balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "8.5")

	if _, replayRes, err := j.handlePurchase(adminCtx, "post_purchase_receipt", "4", mustJSONRPCStruct(t, map[string]any{"id": float64(receiptID)})); err != nil || replayRes.Code != errcode.OK.Code {
		t.Fatalf("expected repeat post OK, res=%#v err=%v", replayRes, err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(ctx); count != 1 {
		t.Fatalf("repeat post must keep one inbound txn, got %d", count)
	}

	_, listRes, err := j.handlePurchase(adminCtx, "list_purchase_receipts", "5", mustJSONRPCStruct(t, map[string]any{"status": biz.PurchaseReceiptStatusPosted}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one posted receipt in list, got %d", total)
	}

	_, dashboardRes, err := j.handleBusiness(adminCtx, "dashboard_stats", "6", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if dashboardRes == nil || dashboardRes.Code != errcode.OK.Code {
		t.Fatalf("expected dashboard OK, got %#v", dashboardRes)
	}
	assertDashboardInboundPurchaseReceiptProjection(t, dashboardRes, 1, 1)

	_, cancelledRes, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt", "7", mustJSONRPCStruct(t, map[string]any{"id": float64(receiptID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelledRes == nil || cancelledRes.Code != errcode.OK.Code {
		t.Fatalf("expected cancel OK, got %#v", cancelledRes)
	}
	balanceAfterCancel, err := j.inventoryUC.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get cancelled balance failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "0")

	if _, replayCancelRes, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt", "8", mustJSONRPCStruct(t, map[string]any{"id": float64(receiptID)})); err != nil || replayCancelRes.Code != errcode.OK.Code {
		t.Fatalf("expected repeat cancel OK, res=%#v err=%v", replayCancelRes, err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.TxnType(biz.InventoryTxnReversal)).CountX(ctx); count != 1 {
		t.Fatalf("repeat cancel must keep one reversal txn, got %d", count)
	}
}

func TestJsonrpcData_PurchaseReceiptAPIRequiresDomainPermissions(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt_permissions")
	j := newPurchaseJSONRPCTestData(data, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseReceiptRead))

	_, createRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_draft", "1", mustJSONRPCStruct(t, map[string]any{
		"receipt_no":    "PR-DENIED",
		"supplier_name": "供应商",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected create permission denied, got %#v", createRes)
	}

	_, postRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "post_purchase_receipt", "2", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if postRes == nil || postRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected post permission denied, got %#v", postRes)
	}
}

func newPurchaseJSONRPCTestData(data *Data, admin *biz.AdminUser) *JsonrpcData {
	logger := log.NewStdLogger(io.Discard)
	return &JsonrpcData{
		log:         log.NewHelper(log.With(logger, "module", "data.jsonrpc.purchase.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		inventoryUC: biz.NewInventoryUsecase(NewInventoryRepo(data, logger)),
	}
}

func jsonRPCNestedMap(t *testing.T, res *v1.JsonrpcResult, key string) map[string]any {
	t.Helper()
	if res == nil || res.Data == nil {
		t.Fatalf("expected jsonrpc data for %s, got %#v", key, res)
	}
	data := res.Data.AsMap()
	nested, ok := data[key].(map[string]any)
	if !ok {
		t.Fatalf("expected nested map %s, got %#v", key, data[key])
	}
	return nested
}

func jsonRPCInt(t *testing.T, data map[string]any, key string) int {
	t.Helper()
	switch value := data[key].(type) {
	case float64:
		return int(value)
	case int:
		return value
	default:
		t.Fatalf("expected numeric %s, got %#v", key, data[key])
		return 0
	}
}

func assertDashboardInboundPurchaseReceiptProjection(t *testing.T, res *v1.JsonrpcResult, wantTotal, wantPosted int) {
	t.Helper()
	if res == nil || res.Data == nil {
		t.Fatalf("expected dashboard data, got %#v", res)
	}
	modules, ok := res.Data.AsMap()["modules"].([]any)
	if !ok {
		t.Fatalf("expected dashboard modules, got %#v", res.Data.AsMap()["modules"])
	}
	for _, raw := range modules {
		module, ok := raw.(map[string]any)
		if !ok || module["module_key"] != "inbound" {
			continue
		}
		if total := jsonRPCInt(t, module, "total"); total != wantTotal {
			t.Fatalf("expected inbound total=%d, got %d", wantTotal, total)
		}
		counts, ok := module["status_counts"].(map[string]any)
		if !ok {
			t.Fatalf("expected inbound status counts, got %#v", module["status_counts"])
		}
		if posted := jsonRPCInt(t, counts, biz.PurchaseReceiptStatusPosted); posted != wantPosted {
			t.Fatalf("expected inbound posted=%d, got %d", wantPosted, posted)
		}
		return
	}
	t.Fatalf("inbound module not found in dashboard modules")
}
