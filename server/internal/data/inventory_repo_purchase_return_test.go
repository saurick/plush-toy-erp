package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_PurchaseReturnLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-IN-001", fixtures, stringPtr("RET-LOT-A"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected posted receipt lot_id")
	}

	returnDraft, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PR-RET-001",
		PurchaseReceiptID: &postedReceipt.ID,
		SupplierName:      "布料供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create purchase return draft failed: %v", err)
	}
	if returnDraft.Status != biz.PurchaseReturnStatusDraft {
		t.Fatalf("expected draft purchase return, got %s", returnDraft.Status)
	}

	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              returnDraft.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 to be rejected, got %v", err)
	}

	item, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              returnDraft.ID,
		PurchaseReceiptItemID: &receiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
		SourceLineNo:          stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add purchase return item failed: %v", err)
	}

	outCountBeforePost, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count purchase return out txns before post failed: %v", err)
	}
	if outCountBeforePost != 0 {
		t.Fatalf("draft purchase return should not affect inventory, out txn count=%d", outCountBeforePost)
	}

	postedReturn, err := uc.PostPurchaseReturn(ctx, returnDraft.ID)
	if err != nil {
		t.Fatalf("post purchase return failed: %v", err)
	}
	if postedReturn.Status != biz.PurchaseReturnStatusPosted || postedReturn.PostedAt == nil {
		t.Fatalf("expected posted return with posted_at, got status=%s posted_at=%v", postedReturn.Status, postedReturn.PostedAt)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after purchase return failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "6")

	outTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase return out txn failed: %v", err)
	}
	assertOptionalIntEqual(t, outTxn.LotID, *receiptItem.LotID)
	if outTxn.IdempotencyKey != biz.PurchaseReturnOutboundIdempotencyKey(returnDraft.ID, item.ID) {
		t.Fatalf("unexpected outbound idempotency key %s", outTxn.IdempotencyKey)
	}

	if _, err := uc.PostPurchaseReturn(ctx, returnDraft.ID); err != nil {
		t.Fatalf("repeat post purchase return failed: %v", err)
	}
	balanceAfterReplay, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after repeat return post failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterReplay.Quantity, "6")
	outCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count out txns after repeat return post failed: %v", err)
	}
	if outCount != 1 {
		t.Fatalf("repeat post should keep one out txn, got %d", outCount)
	}

	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    returnDraft.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted purchase return must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(returnDraft.ID).SetStatus(biz.PurchaseReturnStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected posted return status update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "5")).Save(ctx); err == nil {
		t.Fatalf("expected posted return item quantity update to be rejected")
	}
	if _, err := client.PurchaseReturn.Delete().Where(purchasereturn.ID(returnDraft.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase return bulk delete to be rejected")
	}
	if err := client.PurchaseReturnItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected posted purchase return item delete-one to be rejected")
	}

	draftToCancel, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-DRAFT-CANCEL",
		SupplierName: "布料供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft return for cancel guard failed: %v", err)
	}
	draftCancelled, err := uc.CancelPostedPurchaseReturn(ctx, draftToCancel.ID)
	if err != nil || draftCancelled.Status != biz.PurchaseReturnStatusCancelled || draftCancelled.PostedAt != nil {
		t.Fatalf("cancel draft purchase return = %#v, err=%v", draftCancelled, err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, draftToCancel.ID); err != nil {
		t.Fatalf("repeat cancel draft purchase return failed: %v", err)
	}
	draftTxnCount, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReturnSourceType),
		inventorytxn.SourceID(draftToCancel.ID),
	).Count(ctx)
	if err != nil || draftTxnCount != 0 {
		t.Fatalf("draft purchase return cancellation inventory txn count=%d, err=%v", draftTxnCount, err)
	}

	cancelledReturn, err := uc.CancelPostedPurchaseReturn(ctx, returnDraft.ID)
	if err != nil {
		t.Fatalf("cancel posted purchase return failed: %v", err)
	}
	if cancelledReturn.Status != biz.PurchaseReturnStatusCancelled {
		t.Fatalf("expected cancelled return, got %s", cancelledReturn.Status)
	}
	balanceAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after purchase return cancel failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "10")

	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find purchase return reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *receiptItem.LotID)
	if reversalTxn.IdempotencyKey != biz.PurchaseReturnReversalIdempotencyKey(returnDraft.ID, item.ID) {
		t.Fatalf("unexpected return reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}

	if _, err := uc.CancelPostedPurchaseReturn(ctx, returnDraft.ID); err != nil {
		t.Fatalf("repeat cancel purchase return failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(outTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count return reversal after repeat cancel failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat cancel should keep one reversal txn, got %d", reversalCount)
	}
	if _, err := uc.PostPurchaseReturn(ctx, returnDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled return must not be posted again, got %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    returnDraft.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       receiptItem.LotID,
		Quantity:    mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled purchase return must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReturn.UpdateOneID(returnDraft.ID).SetSupplierName("修改供应商").Save(ctx); err == nil {
		t.Fatalf("expected cancelled return protected update to be rejected")
	}
	if _, err := client.PurchaseReturnItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected cancelled return item protected update to be rejected")
	}
	if err := client.PurchaseReturn.DeleteOneID(returnDraft.ID).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase return delete-one to be rejected")
	}
	if _, err := client.PurchaseReturnItem.Delete().Where(purchasereturnitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected cancelled purchase return item bulk delete to be rejected")
	}

	tracedTxns, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(returnDraft.ID),
			inventorytxn.SourceLineID(item.ID),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query traced return inventory txns failed: %v", err)
	}
	if len(tracedTxns) != 2 {
		t.Fatalf("expected outbound and reversal trace txns, got %d", len(tracedTxns))
	}
}

func TestInventoryRepo_PurchaseReturnLotIsolationAndReceiptItemValidation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return_lot_validation")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	lotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-LOT-IN", fixtures, stringPtr("RET-LOT-B"), mustDecimal(t, "10"))
	lotReceiptItem := lotReceipt.Items[0]
	if lotReceiptItem.LotID == nil {
		t.Fatalf("expected lot receipt item lot_id")
	}
	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-NOLOT-IN", fixtures, nil, mustDecimal(t, "10"))
	nonLotReceiptItem := nonLotReceipt.Items[0]
	if nonLotReceiptItem.LotID == nil {
		t.Fatalf("expected generated receipt-line lot identity")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          nonLotReceiptItem.LotID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "5"),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_NON_LOT_CONSUME",
		IdempotencyKey: "test-non-lot-consume-before-return",
	}); err != nil {
		t.Fatalf("consume non-lot stock before return failed: %v", err)
	}

	mismatchReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-MISMATCH",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create mismatch return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              mismatchReturn.ID,
		PurchaseReceiptItemID: &lotReceiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected linked lot return without lot_id to be rejected, got %v", err)
	}
	otherMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "MAT-RET-OTHER")
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              mismatchReturn.ID,
		PurchaseReceiptItemID: &lotReceiptItem.ID,
		MaterialID:            otherMaterial.ID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 lotReceiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected linked return material mismatch to be rejected, got %v", err)
	}

	nonLotOverReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-NOLOT-OVER",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 13, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create non-lot over return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              nonLotOverReturn.ID,
		PurchaseReceiptItemID: &nonLotReceiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 nonLotReceiptItem.LotID,
		Quantity:              mustDecimal(t, "6"),
	}); err != nil {
		t.Fatalf("add non-lot over return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, nonLotOverReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected non-lot over return to be rejected as insufficient stock, got %v", err)
	}
	lotBalanceAfterNonLotOverReturn, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotReceiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after non-lot over return failed: %v", err)
	}
	assertDecimalEqual(t, lotBalanceAfterNonLotOverReturn.Quantity, "10")

	nonLotReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-NOLOT-OK",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 14, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create non-lot return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              nonLotReturn.ID,
		PurchaseReceiptItemID: &nonLotReceiptItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 nonLotReceiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
	}); err != nil {
		t.Fatalf("add non-lot return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, nonLotReturn.ID); err != nil {
		t.Fatalf("post non-lot return failed: %v", err)
	}
	nonLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       nonLotReceiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get non-lot balance after return failed: %v", err)
	}
	assertDecimalEqual(t, nonLotBalance.Quantity, "1")
	lotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotReceiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get lot balance after non-lot return failed: %v", err)
	}
	assertDecimalEqual(t, lotBalance.Quantity, "10")
}

func TestInventoryRepo_PurchaseReturnReceiptItemCumulativeLimit(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return_cumulative")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-001", fixtures, stringPtr("RET-CUM-LOT-A"), mustDecimal(t, "100"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected cumulative receipt lot_id")
	}

	createLinkedReturn := func(returnNo string, quantity decimal.Decimal) *biz.PurchaseReturn {
		t.Helper()
		purchaseReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
			ReturnNo:          returnNo,
			PurchaseReceiptID: &postedReceipt.ID,
			SupplierName:      "累计退货供应商",
			ReturnedAt:        time.Date(2026, 4, 26, 15, 0, 0, 0, time.UTC),
		})
		if err != nil {
			t.Fatalf("create linked purchase return %s failed: %v", returnNo, err)
		}
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              purchaseReturn.ID,
			PurchaseReceiptItemID: &receiptItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 receiptItem.LotID,
			Quantity:              quantity,
		}); err != nil {
			t.Fatalf("add linked purchase return item %s failed: %v", returnNo, err)
		}
		return purchaseReturn
	}

	return60 := createLinkedReturn("PR-RET-CUM-060", mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("post 60 cumulative return failed: %v", err)
	}
	balanceAfter60, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after 60 return failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfter60.Quantity, "40")

	return40 := createLinkedReturn("PR-RET-CUM-040", mustDecimal(t, "40"))
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("post 40 cumulative return failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, return40.ID); err != nil {
		t.Fatalf("repeat post 40 cumulative return should be idempotent, got %v", err)
	}
	outCount40, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(return40.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated cumulative return out txns failed: %v", err)
	}
	if outCount40 != 1 {
		t.Fatalf("repeat post should keep one out txn, got %d", outCount40)
	}

	extraStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-EXTRA", fixtures, stringPtr("RET-CUM-LOT-A"), mustDecimal(t, "10"))
	if extraStockReceipt.Items[0].LotID == nil || *extraStockReceipt.Items[0].LotID == *receiptItem.LotID {
		t.Fatalf("same supplier lot snapshot must keep receipt-line stock isolated")
	}
	overOriginal := createLinkedReturn("PR-RET-CUM-OVER-001", mustDecimal(t, "1"))
	if _, err := uc.PostPurchaseReturn(ctx, overOriginal.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cumulative over-return to be rejected even with stock available, got %v", err)
	}

	if _, err := uc.CancelPostedPurchaseReturn(ctx, return60.ID); err != nil {
		t.Fatalf("cancel 60 cumulative return failed: %v", err)
	}
	releasedReturn := createLinkedReturn("PR-RET-CUM-RELEASED-060", mustDecimal(t, "60"))
	if _, err := uc.PostPurchaseReturn(ctx, releasedReturn.ID); err != nil {
		t.Fatalf("post return after cancellation released quantity failed: %v", err)
	}

	multiLineReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-MULTI", fixtures, stringPtr("RET-CUM-LOT-MULTI"), mustDecimal(t, "100"))
	multiLineItem := multiLineReceipt.Items[0]
	if multiLineItem.LotID == nil {
		t.Fatalf("expected multi-line receipt lot_id")
	}
	multiLineReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PR-RET-CUM-MULTI",
		PurchaseReceiptID: &multiLineReceipt.ID,
		SupplierName:      "累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 16, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create multi-line cumulative return failed: %v", err)
	}
	for _, quantity := range []string{"70", "31"} {
		if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
			ReturnID:              multiLineReturn.ID,
			PurchaseReceiptItemID: &multiLineItem.ID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
			UnitID:                fixtures.unitID,
			LotID:                 multiLineItem.LotID,
			Quantity:              mustDecimal(t, quantity),
		}); err != nil {
			t.Fatalf("add multi-line cumulative item %s failed: %v", quantity, err)
		}
	}
	if _, err := uc.PostPurchaseReturn(ctx, multiLineReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected same-return multi-line over original receipt item to be rejected, got %v", err)
	}

	lowStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-CUM-IN-LOW-STOCK", fixtures, stringPtr("RET-CUM-LOT-LOW"), mustDecimal(t, "100"))
	lowStockItem := lowStockReceipt.Items[0]
	if lowStockItem.LotID == nil {
		t.Fatalf("expected low-stock receipt lot_id")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          lowStockItem.LotID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "95"),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_LOW_STOCK_CONSUME",
		IdempotencyKey: "test-low-stock-before-linked-return",
	}); err != nil {
		t.Fatalf("consume low-stock lot before linked return failed: %v", err)
	}
	lowStockReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:          "PR-RET-CUM-LOW-STOCK",
		PurchaseReceiptID: &lowStockReceipt.ID,
		SupplierName:      "累计退货供应商",
		ReturnedAt:        time.Date(2026, 4, 26, 17, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create low-stock return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:              lowStockReturn.ID,
		PurchaseReceiptItemID: &lowStockItem.ID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 lowStockItem.LotID,
		Quantity:              mustDecimal(t, "10"),
	}); err != nil {
		t.Fatalf("add low-stock return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, lowStockReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected linked return within original quantity but over current stock to be rejected, got %v", err)
	}
}

func TestInventoryRepo_PurchaseReturnAllowsHoldRejectedLots(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_purchase_return_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	statuses := []struct {
		name        string
		status      string
		prepare     func(t *testing.T, lotID int)
		wantPostErr error
	}{
		{name: "ACTIVE", status: biz.InventoryLotActive},
		{name: "HOLD", status: biz.InventoryLotHold, prepare: func(t *testing.T, lotID int) {
			changeLotToStatus(t, ctx, uc, lotID, biz.InventoryLotHold)
		}},
		{name: "REJECTED", status: biz.InventoryLotRejected, prepare: func(t *testing.T, lotID int) {
			changeLotToStatus(t, ctx, uc, lotID, biz.InventoryLotRejected)
		}},
		{name: "DISABLED", status: biz.InventoryLotDisabled, prepare: func(t *testing.T, lotID int) {
			if _, err := client.InventoryLot.UpdateOneID(lotID).SetStatus(biz.InventoryLotDisabled).Save(ctx); err != nil {
				t.Fatalf("force lot to DISABLED fixture failed: %v", err)
			}
		}, wantPostErr: biz.ErrInventoryLotStatusBlocked},
	}

	for _, tc := range statuses {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-IN-"+tc.name, fixtures, stringPtr("PR-RET-STATUS-LOT-"+tc.name), mustDecimal(t, "5"))
			receiptItem := receipt.Items[0]
			if receiptItem.LotID == nil {
				t.Fatalf("expected %s receipt lot_id", tc.name)
			}
			if tc.prepare != nil {
				tc.prepare(t, *receiptItem.LotID)
			}
			purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "PR-RET-STATUS-"+tc.name, receipt.ID, receiptItem, fixtures, mustDecimal(t, "2"))
			_, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID)
			if tc.wantPostErr != nil {
				if !errors.Is(err, tc.wantPostErr) {
					t.Fatalf("expected %s purchase return to fail with %v, got %v", tc.status, tc.wantPostErr, err)
				}
				balance, balanceErr := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
					SubjectType: biz.InventorySubjectMaterial,
					SubjectID:   fixtures.materialID,
					WarehouseID: fixtures.warehouseID,
					LotID:       receiptItem.LotID,
					UnitID:      fixtures.unitID,
				})
				if balanceErr != nil {
					t.Fatalf("get %s balance after rejected return failed: %v", tc.status, balanceErr)
				}
				assertDecimalEqual(t, balance.Quantity, "5")
				return
			}
			if err != nil {
				t.Fatalf("expected %s purchase return to succeed, got %v", tc.status, err)
			}
			balance, balanceErr := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				WarehouseID: fixtures.warehouseID,
				LotID:       receiptItem.LotID,
				UnitID:      fixtures.unitID,
			})
			if balanceErr != nil {
				t.Fatalf("get %s balance after return failed: %v", tc.status, balanceErr)
			}
			assertDecimalEqual(t, balance.Quantity, "3")
		})
	}

	lowStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-LOW-STOCK-IN", fixtures, stringPtr("PR-RET-STATUS-LOW-STOCK-LOT"), mustDecimal(t, "2"))
	lowStockItem := lowStockReceipt.Items[0]
	if lowStockItem.LotID == nil {
		t.Fatalf("expected low-stock lot_id")
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, *lowStockItem.LotID, biz.InventoryLotHold, "待检低库存退货"); err != nil {
		t.Fatalf("change low-stock lot to HOLD failed: %v", err)
	}
	lowStockReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PR-RET-STATUS-LOW-STOCK",
		SupplierName: "状态退货供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create low-stock status return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    lowStockReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       lowStockItem.LotID,
		Quantity:    mustDecimal(t, "3"),
	}); err != nil {
		t.Fatalf("add low-stock status return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, lowStockReturn.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected HOLD return over current stock to be rejected by balance, got %v", err)
	}

	effectiveReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-EFFECTIVE-IN", fixtures, stringPtr("PR-RET-STATUS-EFFECTIVE-LOT"), mustDecimal(t, "2"))
	effectiveItem := effectiveReceipt.Items[0]
	if effectiveItem.LotID == nil {
		t.Fatalf("expected effective status lot_id")
	}
	extraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PR-RET-STATUS-EFFECTIVE-EXTRA", fixtures, stringPtr("PR-RET-STATUS-EFFECTIVE-LOT"), mustDecimal(t, "3"))
	if extraStock.Items[0].LotID == nil || *extraStock.Items[0].LotID == *effectiveItem.LotID {
		t.Fatalf("same supplier lot snapshot must keep effective receipt quantities isolated")
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, *effectiveItem.LotID, biz.InventoryLotHold, "待判有效入库上限"); err != nil {
		t.Fatalf("change effective lot to HOLD failed: %v", err)
	}
	if _, err := uc.ChangeInventoryLotStatus(ctx, *effectiveItem.LotID, biz.InventoryLotRejected, "不合格有效入库上限"); err != nil {
		t.Fatalf("change effective lot to REJECTED failed: %v", err)
	}
	overEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PR-RET-STATUS-EFFECTIVE-OVER", effectiveReceipt.ID, effectiveItem, fixtures, mustDecimal(t, "3"))
	if _, err := uc.PostPurchaseReturn(ctx, overEffectiveReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected REJECTED linked return over effective receipt quantity to be rejected, got %v", err)
	}
}

func TestInventoryRepo_ReversalIgnoresCurrentLotStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_reversal_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "REV-STATUS-RECEIPT", fixtures, stringPtr("REV-STATUS-RECEIPT-LOT"), mustDecimal(t, "5"))
	receiptItem := receipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected receipt reversal lot_id")
	}
	changeLotToStatus(t, ctx, uc, *receiptItem.LotID, biz.InventoryLotHold)
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("cancel purchase receipt should ignore HOLD lot status, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatalf("repeat cancel purchase receipt should remain idempotent, got %v", err)
	}
	inboundTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.SourceLineID(receiptItem.ID),
			inventorytxn.TxnType(biz.InventoryTxnIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find receipt inbound txn failed: %v", err)
	}
	assertReversalCount(t, ctx, client, inboundTxn.ID, 1)

	returnReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "REV-STATUS-RETURN-IN", fixtures, stringPtr("REV-STATUS-RETURN-LOT"), mustDecimal(t, "5"))
	returnItem := returnReceipt.Items[0]
	if returnItem.LotID == nil {
		t.Fatalf("expected return reversal lot_id")
	}
	purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "REV-STATUS-RETURN", returnReceipt.ID, returnItem, fixtures, mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("post return before status reversal failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *returnItem.LotID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("cancel purchase return should ignore REJECTED lot status, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("repeat cancel purchase return should remain idempotent, got %v", err)
	}
	returnOutTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
			inventorytxn.TxnType(biz.InventoryTxnOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find return outbound txn failed: %v", err)
	}
	assertReversalCount(t, ctx, client, returnOutTxn.ID, 1)

	adjustmentReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "REV-STATUS-ADJ-IN", fixtures, stringPtr("REV-STATUS-ADJ-OLD"), mustDecimal(t, "5"))
	adjustmentItem := adjustmentReceipt.Items[0]
	if adjustmentItem.LotID == nil {
		t.Fatalf("expected adjustment reversal old lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "REV-STATUS-ADJ-NEW")
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "REV-STATUS-ADJ", adjustmentReceipt.ID)
	outItem := addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, adjustmentItem.LotID, mustDecimal(t, "2"), stringPtr("REV-ADJ"))
	inItem := addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "2"), stringPtr("REV-ADJ"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("post adjustment before status reversal failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *adjustmentItem.LotID, biz.InventoryLotHold)
	changeLotToStatus(t, ctx, uc, newLot.ID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("cancel adjustment should ignore HOLD/REJECTED lot status, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat cancel adjustment should remain idempotent, got %v", err)
	}
	adjustOutTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(outItem.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment out txn failed: %v", err)
	}
	adjustInTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(inItem.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment in txn failed: %v", err)
	}
	assertReversalCount(t, ctx, client, adjustOutTxn.ID, 1)
	assertReversalCount(t, ctx, client, adjustInTxn.ID, 1)
}
