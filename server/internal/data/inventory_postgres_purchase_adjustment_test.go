package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReceiptAdjustmentPostgresShapeAndFlow(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	for _, table := range []string{
		"purchase_receipt_adjustments",
		"purchase_receipt_adjustment_items",
	} {
		assertPostgresTableExists(t, data.sqldb, table)
	}
	assertPostgresNumericColumn(t, data.sqldb, "purchase_receipt_adjustment_items", "quantity", 20, 6)
	assertPostgresUniqueIndex(t, data.sqldb, "purchase_receipt_adjustments", "purchasereceiptadjustment_adjustment_no")
	assertPostgresPartialUniqueIndex(t, data.sqldb, "purchase_receipt_adjustment_items", "purchasereceiptadjustmentitem_adjustment_id_source_line_no", "source_line_no IS NOT NULL AND source_line_no <> ''")
	assertPostgresCheckConstraint(t, data.sqldb, "purchase_receipt_adjustment_items", "purchase_receipt_adjustment_items_quantity_positive", "quantity > 0")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_adjustments", "purchase_receipt_adjustments_purchase_receipts_purchase_receipt", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_adjustment_items", "purchase_receipt_adjustment_items_purchase_receipt_items_purcha", "NO ACTION")
	assertPostgresForeignKeyDeleteRule(t, data.sqldb, "purchase_receipt_adjustment_items", "purchase_receipt_adjustment_items_inventory_lots_purchase_recei", "NO ACTION")

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	headerOnlyReceipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("PG-PRA-FK-HEAD-" + fixtures.suffix).
		SetSupplierName("PG调整供应商").
		SetStatus(biz.PurchaseReceiptStatusPosted).
		SetReceivedAt(time.Date(2026, 4, 26, 20, 0, 0, 0, time.UTC)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create header-only receipt for adjustment FK test failed: %v", err)
	}
	headerAdjustment, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PG-PRA-FK-HEAD-" + fixtures.suffix,
		PurchaseReceiptID: headerOnlyReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 20, 10, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create header adjustment failed: %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipts WHERE id = $1`, headerOnlyReceipt.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt referenced by adjustment to fail")
	}
	if _, err := client.PurchaseReceiptAdjustment.Get(ctx, headerAdjustment.ID); err != nil {
		t.Fatalf("adjustment should remain after failed receipt delete: %v", err)
	}
	if _, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      "PG-PRA-FK-HEAD-" + fixtures.suffix,
		PurchaseReceiptID: headerOnlyReceipt.ID,
		AdjustedAt:        time.Date(2026, 4, 26, 20, 20, 0, 0, time.UTC),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected adjustment_no unique constraint, got %v", err)
	}

	postedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-FLOW-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-FLOW-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	receiptItem := postedReceipt.Items[0]
	if receiptItem.LotID == nil {
		t.Fatalf("expected postgres adjustment receipt lot_id")
	}
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-FLOW-DEC-"+fixtures.suffix, postedReceipt.ID)
	item, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "4"),
		SourceLineNo:          stringPtr("same-line"),
	})
	if err != nil {
		t.Fatalf("add postgres adjustment item failed: %v", err)
	}
	if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
		AdjustmentID:          adjustment.ID,
		PurchaseReceiptItemID: receiptItem.ID,
		AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
		UnitID:                fixtures.unitID,
		LotID:                 receiptItem.LotID,
		Quantity:              mustDecimal(t, "1"),
		SourceLineNo:          stringPtr("same-line"),
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected adjustment source_line_no partial unique constraint, got %v", err)
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Create().
		SetAdjustmentID(adjustment.ID).
		SetPurchaseReceiptItemID(receiptItem.ID).
		SetAdjustType(biz.PurchaseReceiptAdjustmentQuantityDecrease).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetLotID(*receiptItem.LotID).
		SetQuantity(decimal.Zero).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected adjustment quantity DB check, got %v", err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `DELETE FROM purchase_receipt_items WHERE id = $1`, receiptItem.ID); err == nil {
		t.Fatalf("expected direct SQL delete of purchase_receipt_item referenced by adjustment item to fail")
	}

	postedAdjustment, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("post postgres adjustment failed: %v", err)
	}
	if postedAdjustment.Status != biz.PurchaseReceiptAdjustmentStatusPosted {
		t.Fatalf("expected postgres posted adjustment, got %s", postedAdjustment.Status)
	}
	adjustOutTxn, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustOut),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres adjustment adjust-out txn failed: %v", err)
	}
	assertOptionalIntEqual(t, adjustOutTxn.LotID, *receiptItem.LotID)
	if adjustOutTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentIdempotencyKey(adjustment.ID, item.ID, biz.InventoryTxnAdjustOut) {
		t.Fatalf("unexpected postgres adjustment idempotency key %s", adjustOutTxn.IdempotencyKey)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat postgres adjustment post failed: %v", err)
	}
	adjustOutCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(adjustment.ID),
			inventorytxn.SourceLineID(item.ID),
			inventorytxn.TxnType(biz.InventoryTxnAdjustOut),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated postgres adjust-out txns failed: %v", err)
	}
	if adjustOutCount != 1 {
		t.Fatalf("repeat adjustment post should keep one adjust-out txn, got %d", adjustOutCount)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receiptItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres balance after adjustment failed: %v", err)
	}
	assertDecimalEqual(t, balance.Quantity, "6")

	if _, err := client.PurchaseReceiptAdjustment.UpdateOneID(adjustment.ID).SetStatus(biz.PurchaseReceiptAdjustmentStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted adjustment status update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.UpdateOneID(item.ID).SetQuantity(mustDecimal(t, "5")).Save(ctx); err == nil {
		t.Fatalf("expected postgres posted adjustment item quantity update to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustment.Delete().Where(purchasereceiptadjustment.ID(adjustment.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres adjustment delete to be rejected")
	}
	if _, err := client.PurchaseReceiptAdjustmentItem.Delete().Where(purchasereceiptadjustmentitem.ID(item.ID)).Exec(ctx); err == nil {
		t.Fatalf("expected postgres adjustment item delete to be rejected")
	}

	cancelledAdjustment, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID)
	if err != nil {
		t.Fatalf("cancel postgres adjustment failed: %v", err)
	}
	if cancelledAdjustment.Status != biz.PurchaseReceiptAdjustmentStatusCancelled {
		t.Fatalf("expected postgres cancelled adjustment, got %s", cancelledAdjustment.Status)
	}
	reversalTxn, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustOutTxn.ID)).
		Only(ctx)
	if err != nil {
		t.Fatalf("find postgres adjustment reversal txn failed: %v", err)
	}
	if reversalTxn.IdempotencyKey != biz.PurchaseReceiptAdjustmentReversalIdempotencyKey(adjustment.ID, item.ID, adjustOutTxn.ID) {
		t.Fatalf("unexpected postgres adjustment reversal idempotency key %s", reversalTxn.IdempotencyKey)
	}
	assertOptionalIntEqual(t, reversalTxn.SourceID, adjustment.ID)
	assertOptionalIntEqual(t, reversalTxn.SourceLineID, item.ID)
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("repeat postgres adjustment cancel failed: %v", err)
	}
	reversalCount, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(adjustOutTxn.ID)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated postgres adjustment reversals failed: %v", err)
	}
	if reversalCount != 1 {
		t.Fatalf("repeat adjustment cancel should keep one reversal txn, got %d", reversalCount)
	}
}

func TestPurchaseReceiptAdjustmentPostgresEffectiveReceiptQuantityAndConcurrentAdjustOut(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	effectiveReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-EFF-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-EFF-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	effectiveItem := effectiveReceipt.Items[0]
	if effectiveItem.LotID == nil {
		t.Fatalf("expected postgres effective receipt lot_id")
	}
	decreaseAdjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-EFF-DEC-"+fixtures.suffix, effectiveReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decreaseAdjustment.ID, effectiveItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, effectiveItem.LotID, mustDecimal(t, "30"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decreaseAdjustment.ID); err != nil {
		t.Fatalf("post postgres effective decrease adjustment failed: %v", err)
	}
	extraStock := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-EFF-EXTRA-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-EFF-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	assertOptionalIntEqual(t, extraStock.Items[0].LotID, *effectiveItem.LotID)
	overEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-EFF-RET-71-"+fixtures.suffix, effectiveReceipt.ID, effectiveItem, invFixtures, mustDecimal(t, "71"))
	if _, err := uc.PostPurchaseReturn(ctx, overEffectiveReturn.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres return over effective receipt quantity to be rejected, got %v", err)
	}
	okEffectiveReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-EFF-RET-70-"+fixtures.suffix, effectiveReceipt.ID, effectiveItem, invFixtures, mustDecimal(t, "70"))
	if _, err := uc.PostPurchaseReturn(ctx, okEffectiveReturn.ID); err != nil {
		t.Fatalf("post postgres return within effective receipt quantity failed: %v", err)
	}

	increaseReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-EFF-INCREASE-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-EFF-INCREASE-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	increaseItem := increaseReceipt.Items[0]
	increaseAdjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-EFF-INCREASE-ADJ-"+fixtures.suffix, increaseReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, increaseAdjustment.ID, increaseItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, increaseItem.LotID, mustDecimal(t, "10"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, increaseAdjustment.ID); err != nil {
		t.Fatalf("post postgres increase adjustment failed: %v", err)
	}
	return110 := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-EFF-INCREASE-RET-110-"+fixtures.suffix, increaseReceipt.ID, increaseItem, invFixtures, mustDecimal(t, "110"))
	if _, err := uc.PostPurchaseReturn(ctx, return110.ID); err != nil {
		t.Fatalf("post postgres return against increased quantity failed: %v", err)
	}
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, increaseAdjustment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres cancelling increase below returned quantity to be rejected, got %v", err)
	}

	returnLimitReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-RET-LIMIT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-RET-LIMIT-LOT-"+fixtures.suffix), mustDecimal(t, "100"))
	returnLimitItem := returnLimitReceipt.Items[0]
	return80 := createLinkedPurchaseReturn(t, ctx, uc, "PG-PRA-RET-LIMIT-80-"+fixtures.suffix, returnLimitReceipt.ID, returnLimitItem, invFixtures, mustDecimal(t, "80"))
	if _, err := uc.PostPurchaseReturn(ctx, return80.ID); err != nil {
		t.Fatalf("post postgres return 80 before adjustment failed: %v", err)
	}
	decrease21 := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-RET-LIMIT-DEC21-"+fixtures.suffix, returnLimitReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, decrease21.ID, returnLimitItem, biz.PurchaseReceiptAdjustmentQuantityDecrease, fixtures.warehouseID, returnLimitItem.LotID, mustDecimal(t, "21"), nil)
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, decrease21.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected postgres adjustment decrease below returned quantity to be rejected, got %v", err)
	}

	rollbackReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-ROLLBACK-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-ROLLBACK-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	rollbackItem := rollbackReceipt.Items[0]
	if rollbackItem.LotID == nil {
		t.Fatalf("expected postgres rollback receipt lot_id")
	}
	rollbackNewLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-PRA-ROLLBACK-NEW-LOT-"+fixtures.suffix)
	rollbackAdjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-PRA-ROLLBACK-ADJ-"+fixtures.suffix, rollbackReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, rollbackAdjustment.ID, rollbackItem, biz.PurchaseReceiptAdjustmentQuantityIncrease, fixtures.warehouseID, rollbackItem.LotID, mustDecimal(t, "1"), nil)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, rollbackAdjustment.ID, rollbackItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, rollbackItem.LotID, mustDecimal(t, "12"), stringPtr("ROLLBACK"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, rollbackAdjustment.ID, rollbackItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &rollbackNewLot.ID, mustDecimal(t, "12"), stringPtr("ROLLBACK"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, rollbackAdjustment.ID); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("expected postgres partial adjustment to rollback on later insufficient stock, got %v", err)
	}
	rollbackTxnCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptAdjustmentSourceType),
			inventorytxn.SourceID(rollbackAdjustment.ID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count postgres rollback adjustment txns failed: %v", err)
	}
	if rollbackTxnCount != 0 {
		t.Fatalf("failed postgres adjustment should not leave partial txns, got %d", rollbackTxnCount)
	}
	rollbackOldBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       rollbackItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get rollback old lot balance failed: %v", err)
	}
	assertDecimalEqual(t, rollbackOldBalance.Quantity, "10")
	if rollbackNewBalance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       &rollbackNewLot.ID,
		UnitID:      fixtures.unitID,
	}); err == nil {
		assertDecimalEqual(t, rollbackNewBalance.Quantity, "0")
	} else if !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
		t.Fatalf("unexpected rollback new lot balance error: %v", err)
	}

	concurrentReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-PRA-CONCURRENT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-PRA-CONCURRENT-LOT-"+fixtures.suffix), mustDecimal(t, "10"))
	concurrentItem := concurrentReceipt.Items[0]
	if concurrentItem.LotID == nil {
		t.Fatalf("expected postgres concurrent adjustment lot_id")
	}
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			adj, err := uc.CreatePurchaseReceiptAdjustmentDraft(ctx, &biz.PurchaseReceiptAdjustmentCreate{
				AdjustmentNo:      fmt.Sprintf("PG-PRA-CONCURRENT-%s-%02d", fixtures.suffix, i),
				PurchaseReceiptID: concurrentReceipt.ID,
				AdjustedAt:        time.Date(2026, 4, 26, 21, 0, 0, 0, time.UTC),
			})
			if err != nil {
				errs <- err
				return
			}
			if _, err := uc.AddPurchaseReceiptAdjustmentItem(ctx, &biz.PurchaseReceiptAdjustmentItemCreate{
				AdjustmentID:          adj.ID,
				PurchaseReceiptItemID: concurrentItem.ID,
				AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease,
				MaterialID:            fixtures.materialID,
				WarehouseID:           fixtures.warehouseID,
				UnitID:                fixtures.unitID,
				LotID:                 concurrentItem.LotID,
				Quantity:              mustDecimal(t, "1"),
			}); err != nil {
				errs <- err
				return
			}
			_, err = uc.PostPurchaseReceiptAdjustment(ctx, adj.ID)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)

	successes := 0
	failures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrInventoryInsufficientStock) || errors.Is(err, biz.ErrBadParam):
			failures++
		default:
			t.Fatalf("unexpected postgres concurrent adjustment error: %v", err)
		}
	}
	if successes > 10 {
		t.Fatalf("postgres concurrent adjustments must not exceed stock, successes=%d", successes)
	}
	if failures < 10 {
		t.Fatalf("expected at least 10 postgres concurrent adjustment failures, got %d", failures)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       concurrentItem.LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get postgres concurrent adjustment balance failed: %v", err)
	}
	if balance.Quantity.Cmp(decimal.Zero) < 0 {
		t.Fatalf("postgres concurrent adjustments produced negative balance: %s", balance.Quantity)
	}
	assertDecimalEqual(t, balance.Quantity, fmt.Sprintf("%d", 10-successes))
}

func TestPurchaseReceiptAdjustmentPostgresLotStatusGuardAndReturnException(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)

	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	for _, status := range []string{biz.InventoryLotHold, biz.InventoryLotRejected} {
		status := status
		receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-GUARD-IN-"+status+"-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-GUARD-LOT-"+status+"-"+fixtures.suffix), mustDecimal(t, "5"))
		item := receipt.Items[0]
		if item.LotID == nil {
			t.Fatalf("expected postgres %s guard lot_id", status)
		}
		changeLotToStatus(t, ctx, uc, *item.LotID, status)
		if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      fixtures.materialID,
			WarehouseID:    fixtures.warehouseID,
			LotID:          item.LotID,
			TxnType:        biz.InventoryTxnAdjustOut,
			Direction:      -1,
			Quantity:       mustDecimal(t, "1"),
			UnitID:         fixtures.unitID,
			SourceType:     "PG_STATUS_GUARD",
			IdempotencyKey: "pg-status-guard-adjust-out-" + status + "-" + fixtures.suffix,
		}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
			t.Fatalf("expected postgres %s ADJUST_OUT to be blocked, got %v", status, err)
		}
	}

	for _, status := range []string{biz.InventoryLotHold, biz.InventoryLotRejected} {
		status := status
		receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-RETURN-IN-"+status+"-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-RETURN-LOT-"+status+"-"+fixtures.suffix), mustDecimal(t, "5"))
		item := receipt.Items[0]
		if item.LotID == nil {
			t.Fatalf("expected postgres %s return lot_id", status)
		}
		changeLotToStatus(t, ctx, uc, *item.LotID, status)
		purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-STATUS-RETURN-"+status+"-"+fixtures.suffix, receipt.ID, item, invFixtures, mustDecimal(t, "2"))
		if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
			t.Fatalf("expected postgres %s purchase return to succeed, got %v", status, err)
		}
		balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
			SubjectType: biz.InventorySubjectMaterial,
			SubjectID:   fixtures.materialID,
			WarehouseID: fixtures.warehouseID,
			LotID:       item.LotID,
			UnitID:      fixtures.unitID,
		})
		if err != nil {
			t.Fatalf("get postgres %s return balance failed: %v", status, err)
		}
		assertDecimalEqual(t, balance.Quantity, "3")
	}

	disabledReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-RETURN-DISABLED-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-RETURN-DISABLED-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	disabledItem := disabledReceipt.Items[0]
	if disabledItem.LotID == nil {
		t.Fatalf("expected postgres DISABLED return lot_id")
	}
	if _, err := client.InventoryLot.UpdateOneID(*disabledItem.LotID).SetStatus(biz.InventoryLotDisabled).Save(ctx); err != nil {
		t.Fatalf("force postgres lot to DISABLED fixture failed: %v", err)
	}
	disabledReturn := createLinkedPurchaseReturn(t, ctx, uc, "PG-STATUS-RETURN-DISABLED-"+fixtures.suffix, disabledReceipt.ID, disabledItem, invFixtures, mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReturn(ctx, disabledReturn.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected postgres DISABLED purchase return to be blocked, got %v", err)
	}

	receiptCancel := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-REV-RECEIPT-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-REV-RECEIPT-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	receiptCancelItem := receiptCancel.Items[0]
	if receiptCancelItem.LotID == nil {
		t.Fatalf("expected postgres receipt reversal lot_id")
	}
	changeLotToStatus(t, ctx, uc, *receiptCancelItem.LotID, biz.InventoryLotHold)
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receiptCancel.ID); err != nil {
		t.Fatalf("expected postgres purchase receipt reversal to ignore HOLD lot status, got %v", err)
	}

	returnCancelReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-REV-RETURN-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-REV-RETURN-LOT-"+fixtures.suffix), mustDecimal(t, "5"))
	returnCancelItem := returnCancelReceipt.Items[0]
	if returnCancelItem.LotID == nil {
		t.Fatalf("expected postgres return reversal lot_id")
	}
	returnCancel := createLinkedPurchaseReturn(t, ctx, uc, "PG-STATUS-REV-RETURN-"+fixtures.suffix, returnCancelReceipt.ID, returnCancelItem, invFixtures, mustDecimal(t, "2"))
	if _, err := uc.PostPurchaseReturn(ctx, returnCancel.ID); err != nil {
		t.Fatalf("post postgres return before reversal status failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *returnCancelItem.LotID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReturn(ctx, returnCancel.ID); err != nil {
		t.Fatalf("expected postgres purchase return reversal to ignore REJECTED lot status, got %v", err)
	}

	adjustmentReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-STATUS-REV-ADJ-IN-"+fixtures.suffix, invFixtures, stringPtr("PG-STATUS-REV-ADJ-OLD-"+fixtures.suffix), mustDecimal(t, "5"))
	adjustmentItem := adjustmentReceipt.Items[0]
	if adjustmentItem.LotID == nil {
		t.Fatalf("expected postgres adjustment reversal lot_id")
	}
	newLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "PG-STATUS-REV-ADJ-NEW-"+fixtures.suffix)
	adjustment := createPurchaseReceiptAdjustmentDraft(t, ctx, uc, "PG-STATUS-REV-ADJ-"+fixtures.suffix, adjustmentReceipt.ID)
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionOut, fixtures.warehouseID, adjustmentItem.LotID, mustDecimal(t, "2"), stringPtr("PG-STATUS-REV-ADJ"))
	addPurchaseReceiptAdjustmentItem(t, ctx, uc, adjustment.ID, adjustmentItem, biz.PurchaseReceiptAdjustmentLotCorrectionIn, fixtures.warehouseID, &newLot.ID, mustDecimal(t, "2"), stringPtr("PG-STATUS-REV-ADJ"))
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("post postgres adjustment before reversal status failed: %v", err)
	}
	changeLotToStatus(t, ctx, uc, *adjustmentItem.LotID, biz.InventoryLotHold)
	changeLotToStatus(t, ctx, uc, newLot.ID, biz.InventoryLotRejected)
	if _, err := uc.CancelPostedPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatalf("expected postgres adjustment reversal to ignore HOLD/REJECTED lot status, got %v", err)
	}
}
