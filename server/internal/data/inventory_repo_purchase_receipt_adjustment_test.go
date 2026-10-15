package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestInventoryRepo_PurchaseReceiptAdjustmentQuantityLifecycleAndProtection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_lifecycle")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	draftReceipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PRA-DRAFT-RECEIPT",
		SupplierName: "调整供应商",
		ReceivedAt:   time.Date(2026, 4, 26, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft receipt failed: %v", err)
	}
	if _, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PRA-DRAFT-BLOCK",
		PurchaseReceiptID: draftReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected non-posted receipt adjustment to be rejected, got %v", err)
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-QTY-IN-RECEIPT", fixtures, stringPtr("PRA-QTY-LOT"), mustDecimal(t, "100"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected posted receipt lot_id")
	}
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PRA-QTY-IN-001",
		PurchaseReceiptID: postedReceipt.ID,
		Reason:            stringPtr("多收补入"),
		AdjustedAt:        time.Date(2026, 4, 26, 11, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create receipt adjustment draft failed: %v", err)
	}
	if adjustment.Status != biz.PurchaseReceiptAdjustmentStatusDraft {
		t.Fatalf("expected draft adjustment, got %s", adjustment.Status)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              decimal.Zero,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected quantity <= 0 adjustment item to be rejected, got %v", err)
	}
	item, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "10"),
		SourceLineNo:          stringPtr("1"),
	})
	if err != nil {
		t.Fatalf("add receipt adjustment item failed: %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustment.Delete().Where(purchasereceiptadjustment.ID(adjustment.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment bulk delete to be rejected")
	}
	if err := client.PurchaseReceiptAdjustment.DeleteOneID(adjustment.ID).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment delete-one to be rejected")
	}
	if err := client.PurchaseReceiptAdjustmentItem.DeleteOneID(item.ID).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment item delete-one to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Delete().Where(purchasereceiptadjustmentitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected adjustment item bulk delete to be rejected")
	}

	posted, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("post receipt adjustment failed: %v", err)
	}
	if posted.Status != biz.PurchaseReceiptAdjustmentStatusPosted || posted.PostedAt == nil {
		t.Fatalf("expected posted adjustment with posted_at, got status=%s posted_at=%v", posted.Status, posted.PostedAt)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after adjustment post failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "110")

	adjustTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustIn),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment adjust-in txn failed: %v", err)
	}
	assertOptionalIntEqual(t, adjustTxn.LotID, *receiptItem.LotID)
	if adjustTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentIdempotencyKey(adjustment.ID, item.ID, biz.InventoryTxnAdjustIn) {
		t.Fatalf("unexpected adjustment idempotency key %s", adjustTxn.IdempotencyKey)
	}

	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat post adjustment failed: %v", err)
	}
	adjustCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustIn),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeat adjustment txns failed: %v", err)
	}
	if adjustCount != 1 {
		t.Fatalf("repeat post should keep one adjust-in txn, got %d", adjustCount)
	}

	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("posted adjustment must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustment.UpdateOneID(adjustment.ID).SetStatus(biz.PurchaseReceiptAdjustmentStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected posted adjustment status update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "11")).Save(ctx); err == nil {
		t.Fatalf("expected posted adjustment item quantity update to be rejected")
	}

	draftToCancel, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PRA-DRAFT-CANCEL",
		PurchaseReceiptID: postedReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create draft adjustment for cancel guard failed: %v", err)
	}
	draftCancelled, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, draftToCancel.ID)
	if err != nil || draftCancelled.Status != biz.PurchaseReceiptAdjustmentStatusCancelled || draftCancelled.PostedAt != nil {
		t.Fatalf("cancel draft receipt adjustment = %#v, err=%v", draftCancelled, err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, draftToCancel.ID); err != nil {
		t.Fatalf("repeat cancel draft receipt adjustment failed: %v", err)
	}
	draftTxnCount, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
		inventorytxn.SourceID(draftToCancel.ID),
	).Count(ctx)
	if err != nil || draftTxnCount != 0 {
		t.Fatalf("draft receipt adjustment cancellation inventory txn count=%d, err=%v", draftTxnCount, err)
	}

	cancelled, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("cancel posted adjustment failed: %v", err)
	}
	if cancelled.Status != biz.PurchaseReceiptAdjustmentStatusCancelled {
		t.Fatalf("expected cancelled adjustment, got %s", cancelled.Status)
	}
	balanceAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after adjustment cancel failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterCancel.Quantity, "100")

	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find adjustment reversal txn failed: %v", err)
	}
	assertOptionalIntEqual(t, reversalTxn.LotID, *receiptItem.LotID)
	if reversalTxn.SourceType != biz.PurchaseReceiptAdjustmentSourceType {
		t.Fatalf("unexpected adjustment reversal source_type %s", reversalTxn.SourceType)
	}
	assertOptionalIntEqual(t, reversalTxn.SourceID, adjustment.ID)
	assertOptionalIntEqual(t, reversalTxn.SourceLineID, item.ID)
	if reversalTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentReversalIdempotencyKey(adjustment.ID, item.ID, adjustTxn.ID) {
		t.Fatalf("unexpected adjustment reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat cancel adjustment failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated adjustment reversals failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat cancel should keep one reversal txn, got %d", reversalCount)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled adjustment must not be posted again, got %v", err)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityIncrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancelled adjustment must reject new item, got %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustment.UpdateOneID(adjustment.ID).SetAdjustedAt(time.Now()).Save(ctx); err == nil {
		t.Fatalf("expected cancelled adjustment adjusted_at update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.UpdateOneID(item.ID).SetWarehouseID(fixtures.warehouseID).Save(ctx); err == nil {
		t.Fatalf("expected cancelled adjustment item warehouse update to be rejected")
	}
}

func TestInventoryRepo_PurchaseReceiptAdjustmentEffectiveQuantityAndReturnLimit(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_effective")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	decreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-DEC-RECEIPT", fixtures, stringPtr("PRA-EFF-DEC-LOT"), mustDecimal(t, "100"))
	decreaseItem := decreaseReceipt.Items[0]
	decreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-30", decreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decreaseAdj.ID, decreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, decreaseItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decreaseAdj.ID); err != nil {
		t.Fatalf("post quantity decrease 30 failed: %v", err)
	}
	balanceAfterDecrease, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       decreaseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get balance after quantity decrease failed: %v", err)
	}
	assertDecimalEqual(t, balanceAfterDecrease.Quantity, "70")

	returnLimitReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-RETURN-RECEIPT", fixtures, stringPtr("PRA-EFF-RETURN-LOT"), mustDecimal(t, "100"))
	returnLimitItem := returnLimitReceipt.Items[0]
	return80 := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-80", returnLimitReceipt.ID, returnLimitItem, fixtures, mustDecimal(t, "80"))
	if _, err := uc.PostPurchaseReturn(ctx, return80.ID); err != nil {
		t.Fatalf("post return 80 before adjustment failed: %v", err)
	}
	decrease21 := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-21-BLOCK", returnLimitReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decrease21.ID, returnLimitItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnLimitItem.LotID, mustDecimal(t, "21"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease21.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected decrease below returned quantity to be rejected, got %v", err)
	}
	decrease20 := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-20-OK", returnLimitReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decrease20.ID, returnLimitItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnLimitItem.LotID, mustDecimal(t, "20"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease20.ID); err != nil {
		t.Fatalf("post decrease to returned quantity failed: %v", err)
	}

	overDecreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-DEC-101-RECEIPT", fixtures, stringPtr("PRA-EFF-DEC-101-LOT"), mustDecimal(t, "100"))
	overDecreaseItem := overDecreaseReceipt.Items[0]
	overDecreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-DEC-101", overDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, overDecreaseAdj.ID, overDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, overDecreaseItem.LotID, mustDecimal(t, "101"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, overDecreaseAdj.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected decrease below zero effective quantity to be rejected, got %v", err)
	}

	cancelDecreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-CANCEL-DEC-RECEIPT", fixtures, stringPtr("PRA-EFF-CANCEL-DEC-LOT"), mustDecimal(t, "100"))
	cancelDecreaseItem := cancelDecreaseReceipt.Items[0]
	cancelDecreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-CANCEL-DEC-20", cancelDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, cancelDecreaseAdj.ID, cancelDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, cancelDecreaseItem.LotID, mustDecimal(t, "20"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, cancelDecreaseAdj.ID); err != nil {
		t.Fatalf("post decrease before cancellation restore failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, cancelDecreaseAdj.ID); err != nil {
		t.Fatalf("cancel decrease adjustment failed: %v", err)
	}
	return100AfterCancelDecrease := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-CANCEL-DEC-RETURN-100", cancelDecreaseReceipt.ID, cancelDecreaseItem, fixtures, mustDecimal(t, "100"))
	if _, err := uc.PostPurchaseReturn(ctx, return100AfterCancelDecrease.ID); err != nil {
		t.Fatalf("post return 100 after cancelling decrease should succeed, got %v", err)
	}

	increaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-INCREASE-RECEIPT", fixtures, stringPtr("PRA-EFF-INCREASE-LOT"), mustDecimal(t, "100"))
	increaseItem := increaseReceipt.Items[0]
	increaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-INCREASE-10", increaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, increaseAdj.ID, increaseItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, increaseItem.LotID, mustDecimal(t, "10"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, increaseAdj.ID); err != nil {
		t.Fatalf("post quantity increase 10 failed: %v", err)
	}
	extraIncreaseStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-INCREASE-EXTRA-STOCK", fixtures, stringPtr("PRA-EFF-INCREASE-LOT"), mustDecimal(t, "1"))
	if extraIncreaseStock.Items[0].LotID == nil || *extraIncreaseStock.Items[0].LotID == *increaseItem.LotID {
		t.Fatalf("same supplier lot snapshot must not merge receipt-line inventory identities")
	}
	return110 := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-110", increaseReceipt.ID, increaseItem, fixtures, mustDecimal(t, "110"))
	if _, err := uc.PostPurchaseReturn(ctx, return110.ID); err != nil {
		t.Fatalf("post return up to increased effective quantity failed: %v", err)
	}
	return111 := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-111", increaseReceipt.ID, increaseItem, fixtures, mustDecimal(t, "111"))
	if _, err := uc.PostPurchaseReturn(ctx, return111.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected return over increased effective quantity to be rejected, got %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, increaseAdj.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelling increase below returned quantity to be rejected, got %v", err)
	}

	increaseThenDecreaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-IN-DEC-RECEIPT", fixtures, stringPtr("PRA-EFF-IN-DEC-LOT"), mustDecimal(t, "100"))
	increaseThenDecreaseItem := increaseThenDecreaseReceipt.Items[0]
	return80BeforeNetDecrease := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-IN-DEC-RETURN-80", increaseThenDecreaseReceipt.ID, increaseThenDecreaseItem, fixtures, mustDecimal(t, "80"))
	if _, err := uc.PostPurchaseReturn(ctx, return80BeforeNetDecrease.ID); err != nil {
		t.Fatalf("post return 80 before net decrease failed: %v", err)
	}
	netIncreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-IN-DEC-INCREASE", increaseThenDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, netIncreaseAdj.ID, increaseThenDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, increaseThenDecreaseItem.LotID, mustDecimal(t, "10"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, netIncreaseAdj.ID); err != nil {
		t.Fatalf("post net increase before decrease failed: %v", err)
	}
	netDecreaseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-IN-DEC-DECREASE", increaseThenDecreaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, netDecreaseAdj.ID, increaseThenDecreaseItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, increaseThenDecreaseItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, netDecreaseAdj.ID); err != nil {
		t.Fatalf("post net decrease to returned quantity failed: %v", err)
	}

	cancelledAdjReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-CANCELLED-RECEIPT", fixtures, stringPtr("PRA-EFF-CANCELLED-LOT"), mustDecimal(t, "100"))
	cancelledAdjItem := cancelledAdjReceipt.Items[0]
	cancelledAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-CANCELLED-INCREASE", cancelledAdjReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, cancelledAdj.ID, cancelledAdjItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, cancelledAdjItem.LotID, mustDecimal(t, "20"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, cancelledAdj.ID); err != nil {
		t.Fatalf("post adjustment before cancellation failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, cancelledAdj.ID); err != nil {
		t.Fatalf("cancel adjustment before effective check failed: %v", err)
	}
	extraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-CANCELLED-EXTRA-STOCK", fixtures, stringPtr("PRA-EFF-CANCELLED-LOT"), mustDecimal(t, "20"))
	if extraStock.Items[0].LotID == nil || *extraStock.Items[0].LotID == *cancelledAdjItem.LotID {
		t.Fatalf("same supplier lot snapshot must keep receipt-line stock isolated")
	}
	cancelledAdjReturn := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-CANCELLED-RETURN-120", cancelledAdjReceipt.ID, cancelledAdjItem, fixtures, mustDecimal(t, "120"))
	if _, err := uc.PostPurchaseReturn(ctx, cancelledAdjReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled adjustment to be ignored by effective quantity, got %v", err)
	}

	multiLineReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-MULTI-RECEIPT", fixtures, stringPtr("PRA-EFF-MULTI-LOT"), mustDecimal(t, "100"))
	multiLineItem := multiLineReceipt.Items[0]
	multiLineAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-MULTI-OVER", multiLineReceipt.ID)
	for idx, quantity := range []string{"70", "31"} {
		addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiLineAdj.ID, multiLineItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, multiLineItem.LotID, mustDecimal(t, quantity), stringPtr(fmt.Sprintf("L%d", idx+1)))
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, multiLineAdj.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected same-adjustment multi-line effective over-decrease to be rejected, got %v", err)
	}

	returnEffectiveReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-RETURN-LINK-RECEIPT", fixtures, stringPtr("PRA-EFF-RETURN-LINK-LOT"), mustDecimal(t, "100"))
	returnEffectiveItem := returnEffectiveReceipt.Items[0]
	returnEffectiveAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-EFF-RETURN-LINK-DEC", returnEffectiveReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, returnEffectiveAdj.ID, returnEffectiveItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnEffectiveItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, returnEffectiveAdj.ID); err != nil {
		t.Fatalf("post return-link decrease failed: %v", err)
	}
	extraReturnStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-RETURN-LINK-EXTRA", fixtures, stringPtr("PRA-EFF-RETURN-LINK-LOT"), mustDecimal(t, "10"))
	if extraReturnStock.Items[0].LotID == nil || *extraReturnStock.Items[0].LotID == *returnEffectiveItem.LotID {
		t.Fatalf("same supplier lot snapshot must keep receipt-line stock isolated")
	}
	overEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-LINK-71", returnEffectiveReceipt.ID, returnEffectiveItem, fixtures, mustDecimal(t, "71"))
	if _, err := uc.PostPurchaseReturn(ctx, overEffectiveReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected purchase return to use effective receipt quantity, got %v", err)
	}
	okEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PRA-EFF-RETURN-LINK-70", returnEffectiveReceipt.ID, returnEffectiveItem, fixtures, mustDecimal(t, "70"))
	if _, err := uc.PostPurchaseReturn(ctx, okEffectiveReturn.ID); err != nil {
		t.Fatalf("post return within effective receipt quantity failed: %v", err)
	}

	unlinkedReturnReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-UNLINKED-RECEIPT", fixtures, stringPtr("PRA-EFF-UNLINKED-LOT"), mustDecimal(t, "100"))
	unlinkedReturnItem := unlinkedReturnReceipt.Items[0]
	unlinkedExtraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-EFF-UNLINKED-EXTRA", fixtures, stringPtr("PRA-EFF-UNLINKED-LOT"), mustDecimal(t, "50"))
	if unlinkedExtraStock.Items[0].LotID == nil || *unlinkedExtraStock.Items[0].LotID == *unlinkedReturnItem.LotID {
		t.Fatalf("same supplier lot snapshot must keep unlinked return stock isolated")
	}
	unlinkedReturn, err := uc.CreatePurchaseReturnDraft(ctx, &biz.PurchaseReturnCreate{
		ReturnNo:     "PRA-EFF-UNLINKED-RETURN-120",
		SupplierName: "采购供应商",
		ReturnedAt:   time.Date(2026, 4, 26, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create unlinked return failed: %v", err)
	}
	if _, err := uc.AddPurchaseReturnItem(ctx, &biz.PurchaseReturnItemCreate{
		ReturnID:    unlinkedReturn.ID,
		MaterialID:  fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		LotID:       unlinkedReturnItem.LotID,
		Quantity:    mustDecimal(t, "100"),
	}); err != nil {
		t.Fatalf("add unlinked return item failed: %v", err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, unlinkedReturn.ID); err != nil {
		t.Fatalf("unlinked return should use inventory balance only, got %v", err)
	}

	if rows, err := client.PurchaseReceiptAdjustmentItem.Query().
		Where(purchasereceiptadjustmentitem.AdjustmentID(multiLineAdj.ID)).
		Count(ctx); err != nil || rows != 2 {
		t.Fatalf("failed multi-line adjustment should keep draft rows for correction, count=%d err=%v", rows, err)
	}
}

func TestInventoryRepo_PurchaseReceiptAdjustmentLotAndWarehouseCorrections(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_corrections")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-CORR-RECEIPT", fixtures, stringPtr("PRA-CORR-OLD-LOT"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected correction receipt lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-CORR-NEW-LOT")

	lotAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-CORR-LOT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotAdj.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "4"), stringPtr("LOT-G1"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotAdj.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "4"), stringPtr("LOT-G1"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, lotAdj.ID); err != nil {
		t.Fatalf("post lot correction failed: %v", err)
	}
	oldLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old lot balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, oldLotBalance.Quantity, "6")
	newLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &newLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new lot balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, newLotBalance.Quantity, "4")

	if count, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(lotAdj.ID),
		).
		Count(ctx); err != nil || count != 2 {
		t.Fatalf("expected lot correction to write two txns, count=%d err=%v", count, err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, lotAdj.ID); err != nil {
		t.Fatalf("cancel lot correction failed: %v", err)
	}
	oldLotAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old lot balance after lot correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, oldLotAfterCancel.Quantity, "10")
	newLotAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &newLot.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new lot balance after lot correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, newLotAfterCancel.Quantity, "0")

	multiGroupReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-CORR-MULTI-GROUP-RECEIPT", fixtures, stringPtr("PRA-CORR-MULTI-OLD"), mustDecimal(t, "10"))
	multiGroupItem := multiGroupReceipt.Items[0]
	if multiGroupItem.LotID == nil {
		t.Fatalf("expected multi correction receipt lot_id")
	}
	multiGroupLotA := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-CORR-MULTI-NEW-A")
	multiGroupLotB := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-CORR-MULTI-NEW-B")
	multiGroupAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-CORR-MULTI-GROUP", multiGroupReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, multiGroupItem.LotID, mustDecimal(t, "2"), stringPtr("MG-A"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &multiGroupLotA.ID, mustDecimal(t, "2"), stringPtr("MG-A"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, multiGroupItem.LotID, mustDecimal(t, "3"), stringPtr("MG-B"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, multiGroupAdj.ID, multiGroupItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &multiGroupLotB.ID, mustDecimal(t, "3"), stringPtr("MG-B"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, multiGroupAdj.ID); err != nil {
		t.Fatalf("post multiple correction groups failed: %v", err)
	}
	multiGroupOldBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       multiGroupItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get multi-group old lot balance failed: %v", err)
	}
	assertDecimalEqual(t, multiGroupOldBalance.Quantity, "5")
	multiGroupLotABalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &multiGroupLotA.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get multi-group lot A balance failed: %v", err)
	}
	assertDecimalEqual(t, multiGroupLotABalance.Quantity, "2")
	multiGroupLotBBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &multiGroupLotB.ID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get multi-group lot B balance failed: %v", err)
	}
	assertDecimalEqual(t, multiGroupLotBBalance.Quantity, "3")

	warehouseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-CORR-WAREHOUSE-RECEIPT", fixtures, stringPtr("PRA-CORR-WH-OLD-LOT"), mustDecimal(t, "10"))
	warehouseItem := warehouseReceipt.Items[0]
	if warehouseItem.LotID == nil {
		t.Fatalf("expected warehouse correction receipt lot_id")
	}
	otherWarehouse := createTestWarehouse(t, ctx, client, "PRA-CORR-WH-TO")
	warehouseAdj := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-CORR-WAREHOUSE", warehouseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseAdj.ID, warehouseItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, warehouseItem.LotID, mustDecimal(t, "3"), stringPtr("WH-G1"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseAdj.ID, warehouseItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, warehouseItem.LotID, mustDecimal(t, "3"), stringPtr("WH-G1"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseAdj.ID); err != nil {
		t.Fatalf("post warehouse correction failed: %v", err)
	}
	oldWarehouseBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old warehouse balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, oldWarehouseBalance.Quantity, "7")
	newWarehouseBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: otherWarehouse.ID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new warehouse balance after correction failed: %v", err)
	}
	assertDecimalEqual(t, newWarehouseBalance.Quantity, "3")
	if count, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(warehouseAdj.ID),
		).
		Count(ctx); err != nil || count != 2 {
		t.Fatalf("expected warehouse correction to write two txns, count=%d err=%v", count, err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, warehouseAdj.ID); err != nil {
		t.Fatalf("cancel warehouse correction failed: %v", err)
	}
	oldWarehouseAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old warehouse balance after correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, oldWarehouseAfterCancel.Quantity, "10")
	newWarehouseAfterCancel, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: otherWarehouse.ID,
		LotID:       warehouseItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get new warehouse balance after correction cancel failed: %v", err)
	}
	assertDecimalEqual(t, newWarehouseAfterCancel.Quantity, "0")
}

func TestInventoryRepo_PurchaseReceiptAdjustmentCorrectionGuardsAndLotIsolation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_guards")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-GUARD-RECEIPT", fixtures, stringPtr("PRA-GUARD-LOT"), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected guard receipt lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-GUARD-NEW-LOT")

	missingPair := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-LOT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, missingPair.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "1"), stringPtr("MISSING"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, missingPair.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing lot correction pair to be rejected, got %v", err)
	}
	missingLotOut := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-LOT-OUT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, missingLotOut.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "1"), stringPtr("MISSING-OUT"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, missingLotOut.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot correction missing OUT to be rejected, got %v", err)
	}

	quantityMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-LOT-QTY-MISMATCH", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, quantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "2"), stringPtr("QTY-MISMATCH"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, quantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "3"), stringPtr("QTY-MISMATCH"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, quantityMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot correction quantity mismatch to be rejected, got %v", err)
	}

	otherWarehouse := createTestWarehouse(t, ctx, client, "PRA-GUARD-WH-TO")
	lotWarehouseMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-LOT-WH-MISMATCH", postedReceipt.ID)
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(lotWarehouseMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentLotCorrectionOut).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetLotID(*receiptItem.LotID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("LOT-WH-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create lot correction out mismatch fixture failed: %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(lotWarehouseMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentLotCorrectionIn).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(otherWarehouse.ID).
		SetUnitID(fixtures.unitID).
		SetLotID(newLot.ID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("LOT-WH-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create lot correction in mismatch fixture failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, lotWarehouseMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot correction warehouse mismatch to be rejected, got %v", err)
	}

	warehouseMissingPair := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-WH", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseMissingPair.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "1"), stringPtr("WH-MISSING"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseMissingPair.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected missing warehouse correction pair to be rejected, got %v", err)
	}
	warehouseMissingOut := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-MISSING-WH-OUT", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseMissingOut.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, receiptItem.LotID, mustDecimal(t, "1"), stringPtr("WH-MISSING-OUT"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseMissingOut.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected warehouse correction missing OUT to be rejected, got %v", err)
	}

	warehouseQuantityMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-WH-QTY-MISMATCH", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseQuantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "2"), stringPtr("WH-QTY-MISMATCH"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseQuantityMismatch.ID, receiptItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, receiptItem.LotID, mustDecimal(t, "3"), stringPtr("WH-QTY-MISMATCH"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseQuantityMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected warehouse correction quantity mismatch to be rejected, got %v", err)
	}
	warehouseLotMismatch := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-WH-LOT-MISMATCH", postedReceipt.ID)
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(warehouseLotMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetLotID(*receiptItem.LotID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("WH-LOT-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create warehouse correction out mismatch fixture failed: %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(warehouseLotMismatch.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(otherWarehouse.ID).
		SetUnitID(fixtures.unitID).
		SetLotID(newLot.ID).
		SetQuantity(mustDecimal(t, "1")).
		SetCorrectionGroup("WH-LOT-MISMATCH").
		Save(ctx); err != nil {
		t.Fatalf("create warehouse correction in mismatch fixture failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseLotMismatch.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected warehouse correction lot mismatch to be rejected, got %v", err)
	}

	overdraw := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-LOT-OVERDRAW", postedReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, overdraw.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, receiptItem.LotID, mustDecimal(t, "11"), stringPtr("OVERDRAW"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, overdraw.ID, receiptItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "11"), stringPtr("OVERDRAW"))
	beforeTxnCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count adjustment txns before overdraw failed: %v", err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, overdraw.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected correction out side overdraw to be rejected, got %v", err)
	}
	afterTxnCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count adjustment txns after overdraw failed: %v", err)
	}
	if afterTxnCount != beforeTxnCount {
		t.Fatalf("failed overdraw correction should rollback txns, before=%d after=%d", beforeTxnCount, afterTxnCount)
	}

	nonLotReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-GUARD-NONLOT-RECEIPT", fixtures, nil, mustDecimal(t, "10"))
	nonLotItem := nonLotReceipt.Items[0]
	if nonLotItem.LotID == nil {
		t.Fatalf("expected generated receipt-line lot identity")
	}
	lotStockReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-GUARD-LOT-STOCK", fixtures, stringPtr("PRA-GUARD-ISOLATED-LOT"), mustDecimal(t, "10"))
	if lotStockReceipt.Items[0].LotID == nil {
		t.Fatalf("expected isolated lot stock")
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          nonLotItem.LotID,
		TxnType:        biz.InventoryTxnOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "8"),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_PRA_NONLOT_CONSUME",
		IdempotencyKey: "test-pra-nonlot-consume",
	}); err != nil {
		t.Fatalf("consume non-lot stock before adjustment failed: %v", err)
	}
	nonLotDecrease := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-GUARD-NONLOT-DECREASE", nonLotReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, nonLotDecrease.ID, nonLotItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, nonLotItem.LotID, mustDecimal(t, "3"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, nonLotDecrease.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected non-lot decrease to ignore lot stock, got %v", err)
	}
	lotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotStockReceipt.Items[0].LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get isolated lot balance failed: %v", err)
	}
	assertDecimalEqual(t, lotBalance.Quantity, "10")
}

func TestInventoryRepo_PurchaseReceiptAdjustmentLotStatusGuard(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_receipt_adjustment_lot_status")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	for _, status := range []string{biz.InventoryLotHold, biz.InventoryLotRejected} {
		status := status
		t.Run("quantity_decrease_"+status, func(t *testing.T) {
			receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-STATUS-QTY-"+status, fixtures, stringPtr("PRA-STATUS-QTY-LOT-"+status), mustDecimal(t, "5"))
			item := receipt.Items[0]
			if item.LotID == nil {
				t.Fatalf("expected quantity status lot_id")
			}
			changeLotToStatus(t, ctx, uc, *item.LotID, status)
			adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-STATUS-QTY-ADJ-"+status, receipt.ID)
			addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, item, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, item.LotID, mustDecimal(t, "1"), nil)
			if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
				t.Fatalf("expected %s quantity decrease to be blocked by lot status, got %v", status, err)
			}
			assertAdjustmentTxnCount(t, ctx, client, adjustment.ID, 0)
			balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
				SubjectType: biz.InventorySubjectMaterial,
				SubjectID:   fixtures.materialID,
				WarehouseID: fixtures.warehouseID,
				LotID:       item.LotID,
				UnitID:      fixtures.unitID,
			})
			if err != nil {
				t.Fatalf("get %s balance after blocked quantity decrease failed: %v", status, err)
			}
			assertDecimalEqual(t, balance.Quantity, "5")
		})
	}

	lotCorrectionReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-STATUS-LOT-CORR-IN", fixtures, stringPtr("PRA-STATUS-LOT-CORR-OLD"), mustDecimal(t, "5"))
	lotCorrectionItem := lotCorrectionReceipt.Items[0]
	if lotCorrectionItem.LotID == nil {
		t.Fatalf("expected lot correction status old lot_id")
	}
	lotCorrectionNewLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PRA-STATUS-LOT-CORR-NEW")
	changeLotToStatus(t, ctx, uc, *lotCorrectionItem.LotID, biz.InventoryLotHold)
	lotCorrection := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-STATUS-LOT-CORR", lotCorrectionReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotCorrection.ID, lotCorrectionItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, lotCorrectionItem.LotID, mustDecimal(t, "2"), stringPtr("LOT-STATUS"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, lotCorrection.ID, lotCorrectionItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &lotCorrectionNewLot.ID, mustDecimal(t, "2"), stringPtr("LOT-STATUS"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, lotCorrection.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected HOLD lot correction OUT to be blocked, got %v", err)
	}
	assertAdjustmentTxnCount(t, ctx, client, lotCorrection.ID, 0)
	oldLotBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       lotCorrectionItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get old lot balance after blocked correction failed: %v", err)
	}
	assertDecimalEqual(t, oldLotBalance.Quantity, "5")
	if _, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &lotCorrectionNewLot.ID,
		UnitID:      fixtures.unitID,
	}); !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("blocked correction must not write IN-side balance, got %v", err)
	}

	warehouseCorrectionReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PRA-STATUS-WH-CORR-IN", fixtures, stringPtr("PRA-STATUS-WH-CORR-LOT"), mustDecimal(t, "5"))
	warehouseCorrectionItem := warehouseCorrectionReceipt.Items[0]
	if warehouseCorrectionItem.LotID == nil {
		t.Fatalf("expected warehouse correction status lot_id")
	}
	otherWarehouse := createTestWarehouse(t, ctx, client, "PRA-STATUS-WH-CORR-TO")
	changeLotToStatus(t, ctx, uc, *warehouseCorrectionItem.LotID, biz.InventoryLotRejected)
	warehouseCorrection := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PRA-STATUS-WH-CORR", warehouseCorrectionReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseCorrection.ID, warehouseCorrectionItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut, fixtures.warehouseID, warehouseCorrectionItem.LotID, mustDecimal(t, "2"), stringPtr("WH-STATUS"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, warehouseCorrection.ID, warehouseCorrectionItem, biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn, otherWarehouse.ID, warehouseCorrectionItem.LotID, mustDecimal(t, "2"), stringPtr("WH-STATUS"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, warehouseCorrection.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected REJECTED warehouse correction OUT to be blocked, got %v", err)
	}
	assertAdjustmentTxnCount(t, ctx, client, warehouseCorrection.ID, 0)
	if _, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: otherWarehouse.ID,
		LotID:       warehouseCorrectionItem.LotID,
		UnitID:      fixtures.unitID,
	}); !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("blocked warehouse correction must not write IN-side balance, got %v", err)
	}
}
