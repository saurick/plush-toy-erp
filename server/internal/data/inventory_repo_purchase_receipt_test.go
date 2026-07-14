package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_PurchaseReceiptLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-IN-001",
		SupplierName: "布料供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase receipt draft failed: %v", err)
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft {
		t.Fatalf("expected draft purchase receipt, got %s", receipt.Status)
	}

	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("LOT-A"),
		Quantity:       decimal.Zero,
		IdempotencyKey: "test:purchase-receipt:invalid-quantity",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 to be rejected, got %v", err)
	}

	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("LOT-A"),
		Quantity:       mustDecimal(t, "10"),
		SourceLineNo:   stringPtr("1"),
		IdempotencyKey: "test:purchase-receipt:line-1",
	})
	if err != nil {
		t.Fatalf("add purchase receipt item failed: %v", err)
	}

	txnCountBeforePost, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count txns before post failed: %v", err)
	}
	if txnCountBeforePost != 0 {
		t.Fatalf("draft purchase receipt should not affect inventory, txn count=%d", txnCountBeforePost)
	}

	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post purchase receipt failed: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptStatusPosted || posted.PostedAt == nil {
		t.Fatalf("expected posted receipt with posted_at, got status=%s posted_at=%v", posted.Status, posted.PostedAt)
	}
	if len(posted.Items) != 1 {
		t.Fatalf("expected one posted item, got %d", len(posted.Items))
	}

	lotID := posted.Items[0].LotID
	if lotID == nil {
		t.Fatalf("expected lot_id to be set after posting lot_no item")
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get posted lot balance failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "10")

	inboundTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase receipt inbound txn failed: %v", err)
	}
	assertOptionalIntEqual(t, inboundTxn.LotID, *lotID)
	if inboundTxn.IdempotencyKey != biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID) {
		t.Fatalf("unexpected inbound idempotency key %s", inboundTxn.IdempotencyKey)
	}

	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("repeat post purchase receipt failed: %v", err)
	}
	balanceAfterReplay, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after repeat post failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterReplay.Quantity, "10")
	inboundCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count inbound txns after repeat post failed: %v", err)
	}
	if inboundCount != 1 {
		t.Fatalf("repeat post should keep one inbound txn, got %d", inboundCount)
	}

	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("cancel posted purchase receipt failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected cancelled receipt, got %s", cancelled.Status)
	}
	balanceAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after cancel failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "0")
	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase receipt reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *lotID)
	if reversalTxn.IdempotencyKey != biz.PurchaseReceiptReversalIdempotencyKey(receipt.ID, item.ID) {
		t.Fatalf("unexpected reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}

	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("repeat cancel purchase receipt failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(inboundTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat cancel should keep one reversal txn, got %d", reversalCount)
	}
}

func TestInventoryRepo_PurchaseReceiptItemIdempotencyReplaysOneFactSet(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt_item_idempotency")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-ITEM-IDEMPOTENCY",
		SupplierName: "幂等供应商",
		ReceivedAt:   time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create receipt draft failed: %v", err)
	}
	input := &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("IDEMPOTENT-SUPPLIER-LOT"),
		Quantity:       mustDecimal(t, "3"),
		SourceLineNo:   stringPtr("IDEMPOTENT-LINE-1"),
		IdempotencyKey: "test:purchase-receipt-item:replay",
	}
	created, err := uc.AddPurchaseReceiptItem(ctx, input)
	if err != nil {
		t.Fatalf("create receipt item failed: %v", err)
	}
	itemCount := client.PurchaseReceiptItem.Query().CountX(ctx)
	lotCount := client.InventoryLot.Query().CountX(ctx)
	inspectionCount := client.QualityInspection.Query().CountX(ctx)

	conflicting := *input
	conflicting.Quantity = mustDecimal(t, "4")
	if _, err := uc.AddPurchaseReceiptItem(ctx, &conflicting); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed payload with reused key error = %v, want ErrIdempotencyConflict", err)
	}

	lotCountBeforeFailedAppend := client.InventoryLot.Query().CountX(ctx)
	failedAppend := *input
	failedAppend.IdempotencyKey = "test:purchase-receipt-item:source-line-conflict"
	if _, err := uc.AddPurchaseReceiptItem(ctx, &failedAppend); err == nil {
		t.Fatal("duplicate source line must fail")
	}
	if got := client.InventoryLot.Query().CountX(ctx); got != lotCountBeforeFailedAppend {
		t.Fatalf("failed item append leaked lot: %d -> %d", lotCountBeforeFailedAppend, got)
	}

	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable material after original write failed: %v", err)
	}
	replayed, err := uc.AddPurchaseReceiptItem(ctx, input)
	if err != nil {
		t.Fatalf("replay after material state changed failed: %v", err)
	}
	if replayed.ID != created.ID {
		t.Fatalf("replayed item id=%d, want %d", replayed.ID, created.ID)
	}
	if got := client.PurchaseReceiptItem.Query().CountX(ctx); got != itemCount {
		t.Fatalf("replay changed item count: %d -> %d", itemCount, got)
	}
	if got := client.InventoryLot.Query().CountX(ctx); got != lotCount {
		t.Fatalf("replay changed lot count: %d -> %d", lotCount, got)
	}
	if got := client.QualityInspection.Query().CountX(ctx); got != inspectionCount {
		t.Fatalf("replay changed inspection count: %d -> %d", inspectionCount, got)
	}

	extraWarehouse := createTestWarehouse(t, ctx, client, "IDEMPOTENCY-CORRUPT-WH")
	if _, err := data.sqldb.ExecContext(ctx, "UPDATE quality_inspections SET warehouse_id = ? WHERE purchase_receipt_item_id = ?", extraWarehouse.ID, created.ID); err != nil {
		t.Fatalf("corrupt replay inspection association: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, input); err == nil {
		t.Fatal("replay with a corrupted inspection association must fail closed")
	}
	if _, err := data.sqldb.ExecContext(ctx, "UPDATE quality_inspections SET warehouse_id = ? WHERE purchase_receipt_item_id = ?", fixtures.warehouseID, created.ID); err != nil {
		t.Fatalf("restore replay inspection association: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, "UPDATE purchase_receipt_items SET lot_id = NULL WHERE id = ?", created.ID); err != nil {
		t.Fatalf("corrupt replay lot binding: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, input); err == nil {
		t.Fatal("replay with a missing lot binding must fail closed")
	}
}

func TestInventoryUsecase_PurchaseReceiptRejectsInactiveNewReferencesAndKeepsCancelAllowed(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_receipt_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	posted := createAndPostPurchaseReceipt(t, ctx, uc, "PR-INACTIVE-HISTORY", fixtures, stringPtr("PR-INACTIVE-LOT"), mustDecimal(t, "5"))
	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable material failed: %v", err)
	}
	if cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, posted.ID); err != nil {
		t.Fatalf("cancel posted receipt should not be blocked by inactive material: %v", err)
	} else if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected cancelled receipt, got %s", cancelled.Status)
	}

	draft, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-INACTIVE-NEW",
		SupplierName: "采购供应商",
		ReceivedAt:   time.Date(2026, 4, 27, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create receipt draft failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      draft.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		IdempotencyKey: "test:purchase-receipt:inactive-material",
	}); !errors.Is(err, biz.ErrMaterialInactive) {
		t.Fatalf("expected inactive material rejected for new receipt item, got %v", err)
	}

	activeMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "MAT-PR-ACTIVE")
	if _, err := client.Warehouse.UpdateOneID(fixtures.warehouseID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable warehouse failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      draft.ID,
		MaterialID:     activeMaterial.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		IdempotencyKey: "test:purchase-receipt:inactive-warehouse",
	}); !errors.Is(err, biz.ErrWarehouseInactive) {
		t.Fatalf("expected inactive warehouse rejected for new receipt item, got %v", err)
	}
}

func TestInventoryRepo_PurchaseReceiptTraceProtection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_trace_protection")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-TRACE-001",
		SupplierName: "追溯供应商",
		ReceivedAt:   time.Date(2026, 4, 25, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create trace receipt failed: %v", err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		LotNo:          stringPtr("TRACE-LOT-001"),
		Quantity:       mustDecimal(t, "6"),
		SourceLineNo:   stringPtr("TRACE-LINE-001"),
		IdempotencyKey: "test:purchase-receipt:trace-line",
	})
	if err != nil {
		t.Fatalf("add trace receipt item failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("draft receipt must not be cancellable, got %v", err)
	}

	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	posted, err := uc.PostPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("post trace receipt failed: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptStatusPosted {
		t.Fatalf("expected posted trace receipt, got %s", posted.Status)
	}
	lotID := posted.Items[0].LotID
	if lotID == nil {
		t.Fatalf("expected posted trace item lot_id")
	}

	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		IdempotencyKey: "test:purchase-receipt:posted-reject",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted receipt must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(receipt.ID).SetReceiptNo("PR-TRACE-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected posted receipt protected field update to be rejected")
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(receipt.ID).SetStatus(biz.PurchaseReceiptStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected posted receipt status update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "7")).Save(ctx); err == nil {
		t.Fatalf("expected posted receipt item quantity update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(item.ID).SetLotNo("TRACE-LOT-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected posted receipt item lot_no update to be rejected")
	}
	if _, err := client.PurchaseReceipt.Delete().Where(purchasereceipt.ID(receipt.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase receipt bulk delete to be rejected")
	}
	if err := client.PurchaseReceiptItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase receipt item delete-one to be rejected")
	}

	cancelled, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("cancel posted trace receipt failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("expected cancelled trace receipt, got %s", cancelled.Status)
	}
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled receipt must not be posted again, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID:      receipt.ID,
		MaterialID:     fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       mustDecimal(t, "1"),
		IdempotencyKey: "test:purchase-receipt:cancelled-reject",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled receipt must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceipt.UpdateOneID(receipt.ID).SetSupplierName("修改供应商").Save(ctx); err == nil {
		t.Fatalf("expected cancelled receipt protected field update to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected cancelled receipt item warehouse update to be rejected")
	}
	if err := client.PurchaseReceipt.DeleteOneID(receipt.ID).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase receipt delete-one to be rejected")
	}
	if _, err := client.PurchaseReceiptItem.Delete().Where(purchasereceiptitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase receipt item bulk delete to be rejected")
	}

	tracedTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(item.ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query traced inventory txns failed: %v", err)
	}
	if len(tracedTxns) != 2 {
		t.Fatalf("expected inbound and reversal trace txns, got %d", len(tracedTxns))
	}
	var inboundTxnID, reversalTxnID int
	for _, txn := range tracedTxns {
		assertOptionalIntEqual(t, txn.SourceID, receipt.ID)
		assertOptionalIntEqual(t, txn.SourceLineID, item.ID)
		assertOptionalIntEqual(t, txn.LotID, *lotID)
		switch txn.TxnType {
		case biz.InventoryTxnIn:
			inboundTxnID = txn.ID
		case biz.InventoryTxnReversal:
			reversalTxnID = txn.ID
		default:
			t.Fatalf("unexpected trace txn type %s", txn.TxnType)
		}
	}
	if inboundTxnID == 0 || reversalTxnID == 0 {
		t.Fatalf("expected both inbound and reversal txns, inbound=%d reversal=%d", inboundTxnID, reversalTxnID)
	}
	if err := client.InventoryTxn.DeleteOneID(inboundTxnID).Exec(ctx); err == nil {
		t.Fatalf("expected inbound inventory txn delete to be rejected")
	}
	if err := client.InventoryTxn.DeleteOneID(reversalTxnID).Exec(ctx); err == nil {
		t.Fatalf("expected reversal inventory txn delete to be rejected")
	}
	if _, err := client.PurchaseReceipt.Get(ctx, receipt.ID); err != nil {
		t.Fatalf("receipt should remain after failed deletes: %v", err)
	}
	if _, err := client.PurchaseReceiptItem.Get(ctx, item.ID); err != nil {
		t.Fatalf("receipt item should remain after failed deletes: %v", err)
	}
}

func TestInventoryRepo_PurchaseReceiptLotsAndNonLotSeparation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_lots")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	firstReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-LOT-001", fixtures, stringPtr("LOT-SAME"), mustDecimal(t, "5"))
	firstLotID := firstReceipt.Items[0].LotID
	if firstLotID == nil {
		t.Fatalf("expected first lot_id")
	}
	secondReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-LOT-002", fixtures, stringPtr("LOT-SAME"), mustDecimal(t, "2"))
	if secondReceipt.Items[0].LotID == nil || *secondReceipt.Items[0].LotID == *firstLotID {
		t.Fatalf("each receipt line must own a distinct inventory lot identity")
	}
	sameLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       firstLotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get same lot balance failed: %v", err)
	}
	assertDecimalEqual(t, sameLotBalance.Quantity, "5")

	otherReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-LOT-003", fixtures, stringPtr("LOT-OTHER"), mustDecimal(t, "3"))
	otherLotID := otherReceipt.Items[0].LotID
	if otherLotID == nil {
		t.Fatalf("expected other lot_id")
	}
	if *otherLotID == *firstLotID {
		t.Fatalf("expected different lot_no to create different lot_id")
	}
	otherLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       otherLotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get other lot balance failed: %v", err)
	}
	assertDecimalEqual(t, otherLotBalance.Quantity, "3")

	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-NO-LOT-001", fixtures, nil, mustDecimal(t, "4"))
	if nonLotReceipt.Items[0].LotID == nil {
		t.Fatalf("every receipt line must have a generated lot identity")
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       nonLotReceipt.Items[0].LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot purchase balance failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "4")
	sameLotBalanceAfterNonLot, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       firstLotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get same lot balance after non-lot receipt failed: %v", err)
	}
	assertDecimalEqual(t, sameLotBalanceAfterNonLot.Quantity, "5")

	lotCount, err := client.InventoryLot.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count lots after purchase receipts failed: %v", err)
	}
	if lotCount != 4 {
		t.Fatalf("expected one material lot identity per receipt line, got %d", lotCount)
	}
}
