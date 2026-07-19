package service

import (
	"context"
	"io"
	"testing"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt")
	fixtures := createInventoryTestFixtures(t, ctx, client)

	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseOrderRead,
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseReceiptRead,
		biz.PermissionERPDashboardRead,
	))
	actorCaptureRepo := &purchaseReceiptActorCaptureRepo{InventoryRepo: datarepo.NewInventoryRepo(data, log.NewStdLogger(io.Discard))}
	j.inventoryUC = biz.NewInventoryUsecase(actorCaptureRepo)
	adminCtx := workflowJSONRPCAdminContext()

	for _, retiredMethod := range []string{
		"create_purchase_receipt_draft",
		"create_purchase_receipt_with_items",
	} {
		_, retiredRes, err := j.handlePurchase(adminCtx, retiredMethod, "retired", mustJSONRPCStruct(t, map[string]any{
			"receipt_no": "PR-RETIRED",
		}))
		if err != nil || retiredRes == nil || retiredRes.Code != errcode.UnknownMethod.Code {
			t.Fatalf("retired purchase receipt method %s must be unknown, result=%#v err=%v", retiredMethod, retiredRes, err)
		}
	}

	linkedReceipt, sourceItem := createPurchaseReceiptAppendSourceForServiceTest(
		t,
		ctx,
		client,
		j.inventoryUC,
		fixtures,
		"JSONRPC-API",
	)
	receiptID := linkedReceipt.ID
	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("source-bound draft purchase receipt must not write inventory txns, got %d", count)
	}
	itemCountBeforeMissingSource := client.PurchaseReceiptItem.Query().CountX(ctx)
	lotCountBeforeMissingSource := client.InventoryLot.Query().CountX(ctx)
	inspectionCountBeforeMissingSource := client.QualityInspection.Query().CountX(ctx)
	_, missingSourceRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "2-missing-source", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":      float64(receiptID),
		"material_id":     float64(fixtures.materialID),
		"warehouse_id":    float64(fixtures.warehouseID),
		"unit_id":         float64(fixtures.unitID),
		"quantity":        "8.5",
		"idempotency_key": "jsonrpc-receipt-item-missing-source",
	}))
	if err != nil || missingSourceRes == nil || missingSourceRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected missing purchase order item source rejected, result=%#v err=%v", missingSourceRes, err)
	}
	if got := client.PurchaseReceiptItem.Query().CountX(ctx); got != itemCountBeforeMissingSource {
		t.Fatalf("missing source changed receipt item count: %d -> %d", itemCountBeforeMissingSource, got)
	}
	if got := client.InventoryLot.Query().CountX(ctx); got != lotCountBeforeMissingSource {
		t.Fatalf("missing source changed inventory lot count: %d -> %d", lotCountBeforeMissingSource, got)
	}
	if got := client.QualityInspection.Query().CountX(ctx); got != inspectionCountBeforeMissingSource {
		t.Fatalf("missing source changed quality inspection count: %d -> %d", inspectionCountBeforeMissingSource, got)
	}
	_, missingItemKeyRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "2-missing-key", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(receiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(sourceItem.ID),
		"quantity":               "8.5",
	}))
	if err != nil || missingItemKeyRes == nil || missingItemKeyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected missing receipt item idempotency key rejected, result=%#v err=%v", missingItemKeyRes, err)
	}

	_, itemRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "2", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(receiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(sourceItem.ID),
		"lot_no":                 "JSONRPC-LOT-001",
		"quantity":               "8.5",
		"source_line_no":         "1",
		"idempotency_key":        "jsonrpc-receipt-item-attempt-1",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if itemRes == nil || itemRes.Code != errcode.OK.Code {
		t.Fatalf("expected add item OK, got %#v", itemRes)
	}
	itemPayload := jsonRPCNestedMap(t, itemRes, "purchase_receipt_item")
	itemID := jsonRPCInt(t, itemPayload, "id")
	for field, want := range map[string]int{
		"receipt_id":   receiptID,
		"material_id":  fixtures.materialID,
		"warehouse_id": fixtures.warehouseID,
		"unit_id":      fixtures.unitID,
	} {
		if got := jsonRPCInt(t, itemPayload, field); got != want {
			t.Fatalf("purchase receipt item %s=%d, want %d", field, got, want)
		}
	}
	if lotID := jsonRPCInt(t, itemPayload, "lot_id"); lotID <= 0 {
		t.Fatalf("purchase receipt item lot_id=%d, want positive binding", lotID)
	}
	itemCount := client.PurchaseReceiptItem.Query().CountX(ctx)
	lotCount := client.InventoryLot.Query().CountX(ctx)
	inspectionCount := client.QualityInspection.Query().CountX(ctx)
	_, replayRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "2-replay", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(receiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(sourceItem.ID),
		"lot_no":                 "JSONRPC-LOT-001",
		"quantity":               "8.5000",
		"source_line_no":         "1",
		"idempotency_key":        "jsonrpc-receipt-item-attempt-1",
	}))
	if err != nil || replayRes == nil || replayRes.Code != errcode.OK.Code {
		t.Fatalf("expected exact receipt item replay OK, result=%#v err=%v", replayRes, err)
	}
	if replayID := jsonRPCInt(t, jsonRPCNestedMap(t, replayRes, "purchase_receipt_item"), "id"); replayID != itemID {
		t.Fatalf("receipt item replay id=%d, want %d", replayID, itemID)
	}
	if got := client.PurchaseReceiptItem.Query().CountX(ctx); got != itemCount {
		t.Fatalf("receipt item replay changed item count: %d -> %d", itemCount, got)
	}
	if got := client.InventoryLot.Query().CountX(ctx); got != lotCount {
		t.Fatalf("receipt item replay changed lot count: %d -> %d", lotCount, got)
	}
	if got := client.QualityInspection.Query().CountX(ctx); got != inspectionCount {
		t.Fatalf("receipt item replay changed inspection count: %d -> %d", inspectionCount, got)
	}
	_, conflictRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "2-conflict", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(receiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(sourceItem.ID),
		"lot_no":                 "JSONRPC-LOT-001",
		"quantity":               "9",
		"source_line_no":         "1",
		"idempotency_key":        "jsonrpc-receipt-item-attempt-1",
	}))
	if err != nil || conflictRes == nil || conflictRes.Code != errcode.IdempotencyConflict.Code {
		t.Fatalf("expected receipt item idempotency conflict, result=%#v err=%v", conflictRes, err)
	}

	_, invalidLineRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "invalid-line", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(receiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(sourceItem.ID),
		"quantity":               "0",
		"idempotency_key":        "jsonrpc-receipt-item-invalid-quantity",
	}))
	if err != nil {
		t.Fatalf("expected nil err adding invalid line, got %v", err)
	}
	if invalidLineRes == nil || invalidLineRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid quantity rejected, got %#v", invalidLineRes)
	}
	passPurchaseReceiptQualityForServiceTest(t, ctx, j.inventoryUC, receiptID)

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
		"supplier_name": linkedReceipt.SupplierName,
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
	_, reversedListRes, err := j.handlePurchase(adminCtx, "list_purchase_receipts", "reversed-date", mustJSONRPCStruct(t, map[string]any{
		"date_from": "2026-06-30",
		"date_to":   "2026-06-01",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if reversedListRes == nil || reversedListRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for reversed purchase receipt date filter, got %#v", reversedListRes)
	}
	const wantReceiptTotal = 1
	if total := client.PurchaseReceipt.Query().CountX(ctx); total != wantReceiptTotal {
		t.Fatalf("expected one source-bound purchase receipt fixture, got %d", total)
	}

	_, dashboardRes, err := j.handleBusiness(adminCtx, "dashboard_stats", "6", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if dashboardRes == nil || dashboardRes.Code != errcode.OK.Code {
		t.Fatalf("expected dashboard OK, got %#v", dashboardRes)
	}
	assertDashboardInboundPurchaseReceiptProjection(t, dashboardRes, wantReceiptTotal)

	_, cancelledRes, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt", "7", mustJSONRPCStruct(t, map[string]any{"id": float64(receiptID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelledRes == nil || cancelledRes.Code != errcode.OK.Code {
		t.Fatalf("expected cancel OK, got %#v", cancelledRes)
	}
	if actorCaptureRepo.actorID != 7 {
		t.Fatalf("expected authenticated purchase receipt cancellation actor 7, got %d", actorCaptureRepo.actorID)
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

type purchaseReceiptActorCaptureRepo struct {
	biz.InventoryRepo
	actorID int
}

func (r *purchaseReceiptActorCaptureRepo) CancelPostedPurchaseReceiptWithActor(ctx context.Context, receiptID int, actorID int) (*biz.PurchaseReceipt, error) {
	r.actorID = actorID
	repo, ok := r.InventoryRepo.(biz.PurchaseReceiptCancellationActorRepo)
	if !ok {
		return nil, biz.ErrActorAwareCancellationUnavailable
	}
	return repo.CancelPostedPurchaseReceiptWithActor(ctx, receiptID, actorID)
}

type purchaseReceiptSourceCaptureRepo struct {
	biz.InventoryRepo
	createFromOrderCalls int
	addItemCalls         int
}

func (r *purchaseReceiptSourceCaptureRepo) CreatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *biz.PurchaseReceiptFromPurchaseOrderCreate) (*biz.PurchaseReceipt, error) {
	r.createFromOrderCalls++
	if r.InventoryRepo == nil {
		return nil, biz.ErrBadParam
	}
	return r.InventoryRepo.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
}

func (r *purchaseReceiptSourceCaptureRepo) AddPurchaseReceiptItem(ctx context.Context, in *biz.PurchaseReceiptItemCreate) (*biz.PurchaseReceiptItem, error) {
	r.addItemCalls++
	if r.InventoryRepo == nil {
		return nil, biz.ErrBadParam
	}
	return r.InventoryRepo.AddPurchaseReceiptItem(ctx, in)
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

func TestPurchaseReceiptRetrySafeParamsRejectClientPayloadHash(t *testing.T) {
	fromOrder := map[string]any{
		"purchase_order_id":        float64(1),
		"receipt_no":               "PR-CLIENT-HASH",
		"warehouse_id":             float64(2),
		"idempotency_key":          "receipt-attempt-1",
		"idempotency_payload_hash": "client-controlled",
	}
	if _, ok := purchaseReceiptFromPurchaseOrderCreateFromParams(fromOrder); ok {
		t.Fatal("create-from-order must reject client idempotency_payload_hash")
	}

	item := map[string]any{
		"receipt_id":               float64(1),
		"material_id":              float64(2),
		"warehouse_id":             float64(3),
		"unit_id":                  float64(4),
		"quantity":                 "1",
		"idempotency_key":          "item-attempt-1",
		"idempotency_payload_hash": "client-controlled",
	}
	if _, ok := purchaseReceiptItemCreateFromParams(item); ok {
		t.Fatal("add receipt item must reject client idempotency_payload_hash")
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

	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseOrderRead,
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseReceiptRead,
		biz.PermissionERPDashboardRead,
	))
	_, missingReceiptKeyRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "missing-key", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-MISSING-KEY",
		"warehouse_id":      float64(fixtures.warehouseID),
		"received_at":       "2026-06-17",
	}))
	if err != nil || missingReceiptKeyRes == nil || missingReceiptKeyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected missing create-from-order idempotency key rejected, result=%#v err=%v", missingReceiptKeyRes, err)
	}
	_, forgedSupplierRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "forged-supplier", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-FORGED-SUPPLIER",
		"warehouse_id":      float64(fixtures.warehouseID),
		"received_at":       "2026-06-17",
		"idempotency_key":   "jsonrpc-create-receipt-forged-supplier",
		"supplier_id":       float64(supplier.ID + 1000),
	}))
	if err != nil || forgedSupplierRes == nil || forgedSupplierRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("caller-controlled supplier_id must be rejected, result=%#v err=%v", forgedSupplierRes, err)
	}

	_, receiptRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "1", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-001",
		"warehouse_id":      float64(fixtures.warehouseID),
		"received_at":       "2026-06-17",
		"idempotency_key":   "jsonrpc-create-receipt-from-po-attempt-1",
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
	if got := jsonRPCInt(t, receipt, "supplier_id"); got != supplier.ID {
		t.Fatalf("receipt supplier_id=%d, want source purchase order supplier %d", got, supplier.ID)
	}
	if got := jsonRPCInt(t, receipt, "purchase_order_id"); got != saved.Order.ID {
		t.Fatalf("receipt purchase_order_id=%d, want %d", got, saved.Order.ID)
	}
	if got := receipt["purchase_order_no"]; got != saved.Order.PurchaseOrderNo {
		t.Fatalf("receipt purchase_order_no=%v, want %s", got, saved.Order.PurchaseOrderNo)
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
	receiptID := jsonRPCInt(t, receipt, "id")
	_, replayReceiptRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "1-replay", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-001",
		"warehouse_id":      float64(fixtures.warehouseID),
		"received_at":       "2026-06-17",
		"idempotency_key":   "jsonrpc-create-receipt-from-po-attempt-1",
	}))
	if err != nil || replayReceiptRes == nil || replayReceiptRes.Code != errcode.OK.Code {
		t.Fatalf("expected create-from-order replay OK, result=%#v err=%v", replayReceiptRes, err)
	}
	replayedReceipt := jsonRPCNestedMap(t, replayReceiptRes, "purchase_receipt")
	if replayID := jsonRPCInt(t, replayedReceipt, "id"); replayID != receiptID {
		t.Fatalf("create-from-order replay id=%d, want %d", replayID, receiptID)
	}
	if replayOrderID := jsonRPCInt(t, replayedReceipt, "purchase_order_id"); replayOrderID != saved.Order.ID {
		t.Fatalf("create-from-order replay purchase_order_id=%d, want %d", replayOrderID, saved.Order.ID)
	}
	if replayOrderNo := replayedReceipt["purchase_order_no"]; replayOrderNo != saved.Order.PurchaseOrderNo {
		t.Fatalf("create-from-order replay purchase_order_no=%v, want %s", replayOrderNo, saved.Order.PurchaseOrderNo)
	}

	_, duplicateRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "2", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-002",
		"warehouse_id":      float64(fixtures.warehouseID),
		"idempotency_key":   "jsonrpc-create-receipt-from-po-attempt-1",
	}))
	if err != nil {
		t.Fatalf("expected nil err on duplicate attempt, got %v", err)
	}
	if duplicateRes == nil || duplicateRes.Code != errcode.IdempotencyConflict.Code {
		t.Fatalf("expected changed intent with reused key rejected, got %#v", duplicateRes)
	}

	_, listBySupplierRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "list_purchase_receipts", "list-by-supplier", mustJSONRPCStruct(t, map[string]any{
		"supplier_id": float64(supplier.ID),
	}))
	if err != nil || listBySupplierRes == nil || listBySupplierRes.Code != errcode.OK.Code {
		t.Fatalf("list purchase receipts by supplier identity failed, result=%#v err=%v", listBySupplierRes, err)
	}
	listData := listBySupplierRes.Data.AsMap()
	if jsonRPCInt(t, listData, "total") != 1 {
		t.Fatalf("supplier-filtered receipt total=%v, want 1", listData["total"])
	}

	otherSupplier := client.Supplier.Create().
		SetCode("SUP-JSONRPC-PO-OTHER").
		SetName("其他采购供应商").
		SetIsActive(true).
		SaveX(ctx)
	if _, err := client.PurchaseOrder.UpdateOneID(saved.Order.ID).SetSupplierID(otherSupplier.ID).Save(ctx); err != nil {
		t.Fatalf("change source supplier identity for replay test: %v", err)
	}
	_, identityConflictRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "supplier-identity-conflict", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(saved.Order.ID),
		"receipt_no":        "PR-FROM-PO-001",
		"warehouse_id":      float64(fixtures.warehouseID),
		"received_at":       "2026-06-17",
		"idempotency_key":   "jsonrpc-create-receipt-from-po-attempt-1",
	}))
	if err != nil || identityConflictRes == nil || identityConflictRes.Code != errcode.IdempotencyConflict.Code {
		t.Fatalf("changed source supplier identity must conflict on replay, result=%#v err=%v", identityConflictRes, err)
	}
}

func TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt_permissions")
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseReceiptRead))

	_, createRes, err := j.handlePurchase(workflowJSONRPCAdminContext(), "create_purchase_receipt_from_purchase_order", "1", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(1),
		"receipt_no":        "PR-DENIED",
		"warehouse_id":      float64(1),
		"idempotency_key":   "jsonrpc-permission-denied-receipt",
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

func TestJsonrpcDispatcher_PurchaseReceiptSourceMethodsRequirePurchaseOrderRead(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt_source_permissions")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	baseRepo := datarepo.NewInventoryRepo(data, logger)
	baseUC := biz.NewInventoryUsecase(baseRepo)
	_, createSourceItem := createPurchaseReceiptAppendSourceForServiceTest(t, ctx, client, baseUC, fixtures, "SOURCE-PERMISSION-CREATE")
	linkedReceipt, appendSourceItem := createPurchaseReceiptAppendSourceForServiceTest(t, ctx, client, baseUC, fixtures, "SOURCE-PERMISSION-ADD")
	captureRepo := &purchaseReceiptSourceCaptureRepo{InventoryRepo: baseRepo}

	createParams := mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(createSourceItem.PurchaseOrderID),
		"receipt_no":        "PR-SOURCE-PERMISSION",
		"warehouse_id":      float64(fixtures.warehouseID),
		"idempotency_key":   "jsonrpc-source-permission-create",
	})
	addParams := mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(linkedReceipt.ID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(appendSourceItem.ID),
		"lot_no":                 "SOURCE-PERMISSION-LOT",
		"quantity":               "1",
		"idempotency_key":        "jsonrpc-source-permission-add",
	})

	denied := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseReceiptCreate,
	))
	denied.inventoryUC = biz.NewInventoryUsecase(captureRepo)
	for _, request := range []struct {
		method string
		params *structpb.Struct
	}{
		{method: "create_purchase_receipt_from_purchase_order", params: createParams},
		{method: "add_purchase_receipt_item", params: addParams},
	} {
		_, result, err := denied.handlePurchase(workflowJSONRPCAdminContext(), request.method, "denied", request.params)
		if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
			t.Fatalf("%s without purchase_order.read result=%#v err=%v", request.method, result, err)
		}
	}
	if captureRepo.createFromOrderCalls != 0 || captureRepo.addItemCalls != 0 {
		t.Fatalf("denied source methods reached inventory repository: create=%d add=%d", captureRepo.createFromOrderCalls, captureRepo.addItemCalls)
	}

	allowed := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseOrderRead,
	))
	allowed.inventoryUC = biz.NewInventoryUsecase(captureRepo)
	for _, request := range []struct {
		method string
		params *structpb.Struct
	}{
		{method: "create_purchase_receipt_from_purchase_order", params: createParams},
		{method: "add_purchase_receipt_item", params: addParams},
	} {
		_, result, err := allowed.handlePurchase(workflowJSONRPCAdminContext(), request.method, "allowed", request.params)
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("%s with source permissions result=%#v err=%v", request.method, result, err)
		}
	}
	if captureRepo.createFromOrderCalls != 1 || captureRepo.addItemCalls != 1 {
		t.Fatalf("allowed source method calls: create=%d add=%d, want 1/1", captureRepo.createFromOrderCalls, captureRepo.addItemCalls)
	}
}

func TestJsonrpcDispatcher_AddPurchaseReceiptItemRequiresEnabledPurchaseOrdersModule(t *testing.T) {
	for _, sourceModule := range []struct {
		name  string
		state string
	}{
		{name: "missing"},
		{name: "disabled", state: "disabled"},
	} {
		t.Run(sourceModule.name, func(t *testing.T) {
			configRepo := newServiceCustomerConfigRepo()
			revision := "2026.07.18.purchase-receipt-add-source-" + sourceModule.name
			key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
			configRepo.revisions[key] = &biz.CustomerConfigRevision{
				CustomerKey: biz.DefaultCustomerKey,
				Revision:    revision,
				Status:      biz.CustomerConfigStatusActive,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			configRepo.modules[key] = []biz.DeploymentModuleStateInput{
				{ModuleKey: "purchase_receipts", State: "enabled"},
				{ModuleKey: "quality_inspections", State: "enabled"},
				{ModuleKey: "inventory", State: "enabled"},
			}
			if sourceModule.state != "" {
				configRepo.modules[key] = append(configRepo.modules[key], biz.DeploymentModuleStateInput{ModuleKey: "purchase_orders", State: sourceModule.state})
			}
			captureRepo := &purchaseReceiptSourceCaptureRepo{}
			dispatcher := &jsonrpcDispatcher{
				log: log.NewHelper(log.NewStdLogger(io.Discard)),
				adminReader: stubAdminAccountReader{admin: &biz.AdminUser{
					ID:           7,
					Username:     "admin",
					IsSuperAdmin: true,
				}},
				inventoryUC:      biz.NewInventoryUsecase(captureRepo),
				customerConfigUC: biz.NewCustomerConfigUsecase(configRepo),
			}
			_, result, err := dispatcher.handlePurchase(workflowJSONRPCAdminContext(), "add_purchase_receipt_item", "module", mustJSONRPCStruct(t, map[string]any{
				"receipt_id":             float64(1),
				"material_id":            float64(2),
				"warehouse_id":           float64(3),
				"unit_id":                float64(4),
				"purchase_order_item_id": float64(5),
				"quantity":               "1",
				"idempotency_key":        "module-gate-add-purchase-receipt-item",
			}))
			if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("%s purchase_orders module result=%#v err=%v", sourceModule.name, result, err)
			}
			if captureRepo.addItemCalls != 0 {
				t.Fatalf("%s purchase_orders module reached inventory repository", sourceModule.name)
			}
		})
	}
}

func TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresEnabledModules(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_purchase_receipt_module_gate")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newPurchaseJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey, biz.WarehouseRoleKey},
		biz.PermissionPurchaseOrderRead,
		biz.PermissionPurchaseReceiptCreate,
		biz.PermissionPurchaseReceiptRead,
		biz.PermissionWarehouseInboundConfirm,
		biz.PermissionWarehouseInboundRead,
	))
	adminCtx := workflowJSONRPCAdminContext()
	_, gateSourceItem := createPurchaseReceiptAppendSourceForServiceTest(
		t,
		ctx,
		client,
		j.inventoryUC,
		fixtures,
		"MODULE-GATE-SOURCE",
	)

	readOnlyReceiptConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.purchase-receipts-read-only",
		"purchase_receipts",
		"read_only",
	)
	activatePurchaseTestCustomerConfig(t, j, readOnlyReceiptConfig)

	_, createRes, err := j.handlePurchase(adminCtx, "create_purchase_receipt_from_purchase_order", "read-only-create", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(gateSourceItem.PurchaseOrderID),
		"receipt_no":        "PR-MODULE-READONLY",
		"warehouse_id":      float64(fixtures.warehouseID),
		"idempotency_key":   "jsonrpc-module-read-only-create",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected module read_only create rejected, got %#v", createRes)
	}
	if count := client.PurchaseReceipt.Query().Where(purchasereceipt.ReceiptNo("PR-MODULE-READONLY")).CountX(ctx); count != 0 {
		t.Fatalf("read_only purchase_receipts must not create purchase receipt, got %d", count)
	}

	enabledConfig := customerConfigPublishParamsForRevision(t, "2026.06.28.purchase-modules-enabled")
	activatePurchaseTestCustomerConfig(t, j, enabledConfig)
	_, receiptRes, err := j.handlePurchase(adminCtx, "create_purchase_receipt_from_purchase_order", "enabled-create", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(gateSourceItem.PurchaseOrderID),
		"receipt_no":        "PR-MODULE-ENABLED",
		"warehouse_id":      float64(fixtures.warehouseID),
		"idempotency_key":   "jsonrpc-module-enabled-create",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if receiptRes == nil || receiptRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create OK, got %#v", receiptRes)
	}
	createdFromOrder := jsonRPCNestedMap(t, receiptRes, "purchase_receipt")
	if sourceOrderID := jsonRPCInt(t, createdFromOrder, "purchase_order_id"); sourceOrderID != gateSourceItem.PurchaseOrderID {
		t.Fatalf("expected enabled receipt source order %d, got %d", gateSourceItem.PurchaseOrderID, sourceOrderID)
	}
	linkedReceipt, sourceItem := createPurchaseReceiptAppendSourceForServiceTest(
		t,
		ctx,
		client,
		j.inventoryUC,
		fixtures,
		"MODULE-ENABLED",
	)
	receiptID := linkedReceipt.ID
	_, itemRes, err := j.handlePurchase(adminCtx, "add_purchase_receipt_item", "enabled-line", mustJSONRPCStruct(t, map[string]any{
		"receipt_id":             float64(receiptID),
		"material_id":            float64(fixtures.materialID),
		"warehouse_id":           float64(fixtures.warehouseID),
		"unit_id":                float64(fixtures.unitID),
		"purchase_order_item_id": float64(sourceItem.ID),
		"lot_no":                 "PR-MODULE-ENABLED-LOT",
		"quantity":               "2",
		"idempotency_key":        "jsonrpc-module-enabled-line",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if itemRes == nil || itemRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled add item OK, got %#v", itemRes)
	}

	readOnlyQualityConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.07.18.quality-read-only-cancel-receipt",
		"quality_inspections",
		"read_only",
	)
	activatePurchaseTestCustomerConfig(t, j, readOnlyQualityConfig)
	_, cancelRes, err := j.handlePurchase(adminCtx, "cancel_purchase_receipt", "quality-read-only-cancel", mustJSONRPCStruct(t, map[string]any{
		"id": float64(receiptID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected quality read_only draft cancellation rejected, got %#v", cancelRes)
	}
	if status := client.PurchaseReceipt.GetX(ctx, receiptID).Status; status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("quality read_only cancellation changed receipt status to %s", status)
	}

	readOnlyInventoryConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.28.inventory-read-only",
		"inventory",
		"read_only",
	)
	activatePurchaseTestCustomerConfig(t, j, readOnlyInventoryConfig)

	_, postRes, err := j.handlePurchase(adminCtx, "post_purchase_receipt", "inventory-read-only-post", mustJSONRPCStruct(t, map[string]any{
		"id": float64(receiptID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if postRes == nil || postRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected inventory read_only post rejected, got %#v", postRes)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(receiptID)).CountX(ctx); count != 0 {
		t.Fatalf("inventory read_only post must not write inventory txns, got %d", count)
	}

	_, getRes, err := j.handlePurchase(adminCtx, "get_purchase_receipt", "read-after-disabled", mustJSONRPCStruct(t, map[string]any{
		"id": float64(receiptID),
	}))
	if err != nil {
		t.Fatalf("expected nil err getting historical receipt, got %v", err)
	}
	if getRes == nil || getRes.Code != errcode.OK.Code {
		t.Fatalf("expected get to remain available for historical read, got %#v", getRes)
	}
}

func createPurchaseReceiptAppendSourceForServiceTest(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	uc *biz.InventoryUsecase,
	fixtures inventoryTestFixtures,
	suffix string,
) (*biz.PurchaseReceipt, *ent.PurchaseOrderItem) {
	t.Helper()
	supplier := client.Supplier.Create().
		SetCode("SUP-RECEIPT-APPEND-" + suffix).
		SetName("追加来源供应商-" + suffix).
		SetIsActive(true).
		SaveX(ctx)
	order := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PO-RECEIPT-APPEND-" + suffix).
		SetSupplierID(supplier.ID).
		SetSupplierSnapshot(map[string]any{"name": supplier.Name}).
		SetPurchaseDate(time.Date(2026, 6, 11, 0, 0, 0, 0, time.UTC)).
		SetLifecycleStatus(biz.PurchaseOrderStatusApproved).
		SaveX(ctx)
	item := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(order.ID).
		SetLineNo(1).
		SetMaterialID(fixtures.materialID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(decimal.NewFromInt(10)).
		SetLineStatus(biz.PurchaseOrderItemStatusOpen).
		SaveX(ctx)
	supplierID := supplier.ID
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-RECEIPT-APPEND-" + suffix,
		SupplierID:   &supplierID,
		SupplierName: supplier.Name,
		ReceivedAt:   time.Date(2026, 6, 11, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create source-linked purchase receipt draft failed: %v", err)
	}
	return receipt, item
}

func newPurchaseJSONRPCTestData(t *testing.T, data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	customerConfigUC := biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(logger, "module", "service.jsonrpc.purchase.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		inventoryUC:      biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
		customerConfigUC: customerConfigUC,
	}
	activatePurchaseTestCustomerConfig(t, dispatcher, customerConfigPublishParams(t))
	return dispatcher
}

func activatePurchaseTestCustomerConfig(t *testing.T, dispatcher *jsonrpcDispatcher, params *structpb.Struct) {
	t.Helper()
	if dispatcher == nil || dispatcher.customerConfigUC == nil {
		t.Fatalf("customerConfigUC missing")
	}
	in, ok := customerConfigPublishInputFromParams(params.AsMap())
	if !ok {
		t.Fatalf("invalid customer config params: %#v", params.AsMap())
	}
	published, err := dispatcher.customerConfigUC.PublishCustomerConfig(context.Background(), in, 1)
	if err != nil {
		t.Fatalf("publish customer config %s err = %v", in.Revision, err)
	}
	activatePublishedCustomerConfigForTest(t, dispatcher.customerConfigUC, in, published, 1)
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

func assertDashboardInboundPurchaseReceiptProjection(t *testing.T, res *v1.JsonrpcResult, wantTotal int) {
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
		if available, ok := module["available"].(bool); !ok || !available {
			t.Fatalf("expected inbound projection available, got %#v", module["available"])
		}
		if _, exists := module["status_counts"]; exists {
			t.Fatalf("dashboard module must not expose status_counts: %#v", module)
		}
		return
	}
	t.Fatalf("inbound module not found in dashboard modules")
}
