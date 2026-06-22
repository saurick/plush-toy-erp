package service

import (
	"context"
	"io"
	"testing"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact(t *testing.T) {
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

	_, atomicRes, err := j.handlePurchase(adminCtx, "create_purchase_receipt_with_items", "atomic", mustJSONRPCStruct(t, map[string]any{
		"receipt_no":    "PR-JSONRPC-ATOMIC",
		"supplier_name": "原子供应商",
		"received_at":   "2026-06-11",
		"items": []any{
			map[string]any{
				"material_id":    float64(fixtures.materialID),
				"warehouse_id":   float64(fixtures.warehouseID),
				"unit_id":        float64(fixtures.unitID),
				"lot_no":         "JSONRPC-ATOMIC-LOT",
				"quantity":       "3",
				"source_line_no": "A1",
			},
		},
	}))
	if err != nil {
		t.Fatalf("expected nil err creating atomic receipt, got %v", err)
	}
	if atomicRes == nil || atomicRes.Code != errcode.OK.Code {
		t.Fatalf("expected atomic create OK, got %#v", atomicRes)
	}
	atomicReceipt := jsonRPCNestedMap(t, atomicRes, "purchase_receipt")
	atomicItems, ok := atomicReceipt["items"].([]any)
	if !ok || len(atomicItems) != 1 {
		t.Fatalf("expected atomic receipt to include one line, got %#v", atomicReceipt["items"])
	}
	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("atomic draft purchase receipt must not write inventory txns, got %d", count)
	}

	beforeRollbackCount := client.PurchaseReceipt.Query().
		Where(purchasereceipt.ReceiptNo("PR-JSONRPC-ROLLBACK")).
		CountX(ctx)
	_, rollbackRes, err := j.handlePurchase(adminCtx, "create_purchase_receipt_with_items", "atomic-rollback", mustJSONRPCStruct(t, map[string]any{
		"receipt_no":    "PR-JSONRPC-ROLLBACK",
		"supplier_name": "回滚供应商",
		"received_at":   "2026-06-11",
		"items": []any{
			map[string]any{
				"material_id":  float64(fixtures.materialID),
				"warehouse_id": float64(fixtures.warehouseID),
				"unit_id":      float64(fixtures.unitID),
				"quantity":     "2",
			},
			map[string]any{
				"material_id":  float64(999999),
				"warehouse_id": float64(fixtures.warehouseID),
				"unit_id":      float64(fixtures.unitID),
				"quantity":     "2",
			},
		},
	}))
	if err != nil {
		t.Fatalf("expected nil err creating invalid atomic receipt, got %v", err)
	}
	if rollbackRes == nil || rollbackRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid atomic create rejected, got %#v", rollbackRes)
	}
	afterRollbackCount := client.PurchaseReceipt.Query().
		Where(purchasereceipt.ReceiptNo("PR-JSONRPC-ROLLBACK")).
		CountX(ctx)
	if afterRollbackCount != beforeRollbackCount {
		t.Fatalf("invalid atomic receipt must rollback header, before=%d after=%d", beforeRollbackCount, afterRollbackCount)
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

	_, invalidLineRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "invalid-line", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":   float64(receiptID),
		"material_id":  float64(fixtures.materialID),
		"warehouse_id": float64(fixtures.warehouseID),
		"unit_id":      float64(fixtures.unitID),
		"quantity":     "0",
	}))
	if err != nil {
		t.Fatalf("expected nil err adding invalid line, got %v", err)
	}
	if invalidLineRes == nil || invalidLineRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid quantity rejected, got %#v", invalidLineRes)
	}

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

	_, getRes, err := j.handlePurchase(adminCtx, "get_purchase_receipt", "get-posted", mustJSONRPCStruct(t, map[string]any{"id": float64(receiptID)}))
	if err != nil {
		t.Fatalf("expected nil err getting posted receipt, got %v", err)
	}
	if getRes == nil || getRes.Code != errcode.OK.Code {
		t.Fatalf("expected get posted OK, got %#v", getRes)
	}
	gotReceipt := jsonRPCNestedMap(t, getRes, "purchase_receipt")
	if gotID := jsonRPCInt(t, gotReceipt, "id"); gotID != receiptID {
		t.Fatalf("expected get receipt id %d, got %d", receiptID, gotID)
	}
	gotItems, ok := gotReceipt["items"].([]any)
	if !ok || len(gotItems) != 1 {
		t.Fatalf("expected get receipt to include one item, got %#v", gotReceipt["items"])
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

	_, listRes, err := j.handlePurchase(adminCtx, "list_purchase_receipts", "5", mustJSONRPCStruct(t, map[string]any{
		"status":        biz.PurchaseReceiptStatusPosted,
		"supplier_name": "布料供应商",
		"date_from":     "2026-06-11",
		"date_to":       "2026-06-11",
		"material_id":   float64(fixtures.materialID),
		"warehouse_id":  float64(fixtures.warehouseID),
		"lot_id":        float64(lotID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one posted receipt in list, got %d", total)
	}

	_, invalidListRes, err := j.handlePurchase(adminCtx, "list_purchase_receipts", "invalid-date", mustJSONRPCStruct(t, map[string]any{
		"date_from": "not-a-date",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidListRes == nil || invalidListRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for bad purchase receipt date filter, got %#v", invalidListRes)
	}

	_, dashboardRes, err := j.handleBusiness(adminCtx, "dashboard_stats", "6", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if dashboardRes == nil || dashboardRes.Code != errcode.OK.Code {
		t.Fatalf("expected dashboard OK, got %#v", dashboardRes)
	}
	assertDashboardInboundPurchaseReceiptProjection(t, dashboardRes, 2, 1)

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

func TestPurchaseReceiptFilterFromParamsForwardsContextFilters(t *testing.T) {
	filter, ok := purchaseReceiptFilterFromParams(map[string]any{
		"supplier_name":          "布料供应商",
		"purchase_order_id":      float64(21),
		"purchase_order_item_id": float64(34),
	})
	if !ok {
		t.Fatal("expected purchase receipt filter to parse")
	}
	if filter.SupplierName != "布料供应商" {
		t.Fatalf("expected supplier_name forwarded, got %q", filter.SupplierName)
	}
	if filter.PurchaseOrderID != 21 {
		t.Fatalf("expected purchase_order_id forwarded, got %d", filter.PurchaseOrderID)
	}
	if filter.PurchaseOrderItemID != 34 {
		t.Fatalf("expected purchase_order_item_id forwarded, got %d", filter.PurchaseOrderItemID)
	}
}

func TestJsonrpcDispatcher_CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt_from_order")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)

	supplier := client.Supplier.Create().
		SetCode("SUP-JSONRPC-PO").
		SetName("采购供应商").
		SetIsActive(true).
		SaveX(ctx)
	purchaseOrderUC := biz.NewPurchaseOrderUsecase(datarepo.NewPurchaseOrderRepo(data, logger))
	qty := decimal.NewFromInt(12)
	price := decimal.NewFromFloat(2.5)
	saved, err := purchaseOrderUC.SavePurchaseOrderWithItems(ctx, 0, &biz.PurchaseOrderMutation{
		PurchaseOrderNo:  "PO-JSONRPC-RECEIPT",
		SupplierID:       supplier.ID,
		SupplierSnapshot: map[string]any{"name": supplier.Name},
		PurchaseDate:     time.Date(2026, 6, 17, 0, 0, 0, 0, time.UTC),
	}, []*biz.PurchaseOrderItemSaveMutation{
		{
			PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
				LineNo:               1,
				MaterialID:           fixtures.materialID,
				UnitID:               fixtures.unitID,
				MaterialCodeSnapshot: inventoryStringPtr("MAT-JSONRPC"),
				MaterialNameSnapshot: inventoryStringPtr("面料"),
				PurchasedQuantity:    qty,
				UnitPrice:            &price,
			},
		},
	})
	if err != nil {
		t.Fatalf("save purchase order failed: %v", err)
	}
	if _, err := purchaseOrderUC.SubmitPurchaseOrder(ctx, saved.Order.ID); err != nil {
		t.Fatalf("submit purchase order failed: %v", err)
	}
	if _, err := purchaseOrderUC.ApprovePurchaseOrder(ctx, saved.Order.ID); err != nil {
		t.Fatalf("approve purchase order failed: %v", err)
	}

	j := newPurchaseJSONRPCTestData(data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseReceiptRead,
		biz.PermissionERPDashboardRead,
	))
	_, manualReceiptRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_draft", "manual-receipt", mustJSONRPCStruct(t, map[string]any{
		"receipt_no":    "PR-FROM-PO-MANUAL",
		"supplier_name": "采购供应商",
		"received_at":   "2026-06-17",
	}))
	if err != nil {
		t.Fatalf("expected nil err creating manual receipt, got %v", err)
	}
	manualReceiptID := jsonRPCInt(t, jsonRPCNestedMap(t, manualReceiptRes, "purchase_receipt"), "id")
	_, manualLineRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "add_purchase_receipt_item", "manual-line", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(manualReceiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(saved.Items[0].ID),
		"quantity":               "2",
		"source_line_no":         "stale-client-line",
	}))
	if err != nil {
		t.Fatalf("expected nil err adding manual source line, got %v", err)
	}
	manualLine := jsonRPCNestedMap(t, manualLineRes, "purchase_receipt_item")
	if got := manualLine["source_line_no"]; got != "1" {
		t.Fatalf("expected source_line_no to be overwritten from purchase order line, got %#v", got)
	}

	_, receiptRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "1", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-001",
		"warehouse_id":      float64(fixtures.warehouseID),
		"received_at":       "2026-06-17",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if receiptRes == nil || receiptRes.Code != errcode.OK.Code {
		t.Fatalf("expected create from order OK, got %#v", receiptRes)
	}
	receipt := jsonRPCNestedMap(t, receiptRes, "purchase_receipt")
	if status := receipt["status"]; status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("expected draft receipt status, got %#v", status)
	}
	items, ok := receipt["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one receipt line, got %#v", receipt["items"])
	}
	line := items[0].(map[string]any)
	if got := jsonRPCInt(t, line, "purchase_order_item_id"); got != saved.Items[0].ID {
		t.Fatalf("expected purchase order item link %d, got %d", saved.Items[0].ID, got)
	}
	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("create from order must keep inventory untouched before post, got txns=%d", count)
	}

	_, duplicateRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "2", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-002",
		"warehouse_id":      float64(fixtures.warehouseID),
	}))
	if err != nil {
		t.Fatalf("expected nil err on duplicate attempt, got %v", err)
	}
	if duplicateRes == nil || duplicateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected duplicate attempt rejected, got %#v", duplicateRes)
	}
}

func TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions(t *testing.T) {
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

func newPurchaseJSONRPCTestData(data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	logger := log.NewStdLogger(io.Discard)
	return &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(logger, "module", "service.jsonrpc.purchase.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		inventoryUC: biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
	}
}

func jsonRPCNestedMap(t *testing.T, res *v1.JsonrpcResult, key string) map[string]any {
	t.Helper()
	if res == nil || res.Data == nil {
		t.Fatalf("expected jsonrpc dispatcher for %s, got %#v", key, res)
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
