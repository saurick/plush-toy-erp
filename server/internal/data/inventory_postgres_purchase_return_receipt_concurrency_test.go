package data

import (
	"context"
	"database/sql"
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
	"server/internal/data/model/ent/purchasereturn"

	"github.com/go-kratos/kratos/v2/log"
)

func TestPurchaseReturnPostgresReceiptCancelDependencyAndConcurrency(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)
	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}

	t.Run("posted return blocks source receipt cancellation", func(t *testing.T) {
		receipt := createAndPostPurchaseReceipt(
			t,
			ctx,
			uc,
			"PG-RETURN-DEPENDENCY-IN-"+fixtures.suffix,
			invFixtures,
			stringPtr("PG-RETURN-DEPENDENCY-LOT-"+fixtures.suffix),
			mustDecimal(t, "10"),
		)
		purchaseReturn := createLinkedPurchaseReturn(
			t,
			ctx,
			uc,
			"PG-RETURN-DEPENDENCY-OUT-"+fixtures.suffix,
			receipt.ID,
			receipt.Items[0],
			invFixtures,
			mustDecimal(t, "4"),
		)
		if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptCorrectionDependency) {
			t.Fatalf("draft purchase return must block source receipt cancellation, got %v", err)
		}
		if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
			t.Fatalf("post linked purchase return failed: %v", err)
		}
		if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptCorrectionDependency) {
			t.Fatalf("posted purchase return must block source receipt cancellation, got %v", err)
		}
		persisted, err := client.PurchaseReceipt.Get(ctx, receipt.ID)
		if err != nil {
			t.Fatalf("reload source receipt after rejected cancellation failed: %v", err)
		}
		if persisted.Status != biz.PurchaseReceiptStatusPosted {
			t.Fatalf("source receipt status=%s, want POSTED", persisted.Status)
		}
	})

	t.Run("return post reaches parent lock first", func(t *testing.T) {
		runPurchaseReturnReceiptCancelRace(t, ctx, data, client, uc, fixtures.suffix+"-POST-FIRST", invFixtures, true)
	})

	t.Run("receipt cancel reaches parent lock first", func(t *testing.T) {
		runPurchaseReturnReceiptCancelRace(t, ctx, data, client, uc, fixtures.suffix+"-CANCEL-FIRST", invFixtures, false)
	})
}

func runPurchaseReturnReceiptCancelRace(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	uc *biz.InventoryUsecase,
	suffix string,
	fixtures inventoryTestFixtures,
	postFirst bool,
) {
	t.Helper()

	receipt := createAndPostPurchaseReceipt(
		t,
		ctx,
		uc,
		"PG-RETURN-CANCEL-RACE-IN-"+suffix,
		fixtures,
		stringPtr("PG-RETURN-CANCEL-RACE-LOT-"+suffix),
		mustDecimal(t, "10"),
	)
	if receipt.Items[0].LotID == nil {
		t.Fatal("expected source receipt item lot_id")
	}
	purchaseReturn := createLinkedPurchaseReturn(
		t,
		ctx,
		uc,
		"PG-RETURN-CANCEL-RACE-OUT-"+suffix,
		receipt.ID,
		receipt.Items[0],
		fixtures,
		mustDecimal(t, "4"),
	)

	blocker, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin source receipt lock blocker failed: %v", err)
	}
	blockerOpen := true
	t.Cleanup(func() {
		if blockerOpen {
			_ = blocker.Rollback()
		}
	})
	var lockedReceiptID int
	if err := blocker.QueryRowContext(ctx, `SELECT id FROM purchase_receipts WHERE id = $1 FOR UPDATE`, receipt.ID).Scan(&lockedReceiptID); err != nil {
		t.Fatalf("lock source receipt row failed: %v", err)
	}

	postDone := make(chan error, 1)
	cancelDone := make(chan error, 1)
	startPost := func() {
		go func() {
			_, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID)
			postDone <- err
		}()
	}
	startCancel := func() {
		go func() {
			_, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID)
			cancelDone <- err
		}()
	}
	if postFirst {
		startPost()
	} else {
		startCancel()
	}
	waitForPostgresBlockedQueryCount(t, ctx, data.sqldb, "SELECT id FROM purchase_receipts", 1)
	if postFirst {
		startCancel()
	} else {
		startPost()
	}
	waitForPostgresBlockedQueryCount(t, ctx, data.sqldb, "SELECT id FROM purchase_receipts", 2)

	if err := blocker.Rollback(); err != nil {
		t.Fatalf("release source receipt lock blocker failed: %v", err)
	}
	blockerOpen = false
	postErr := receivePurchaseOperationError(t, postDone, "purchase return post")
	cancelErr := receivePurchaseOperationError(t, cancelDone, "purchase receipt cancel")

	persistedReceipt, err := client.PurchaseReceipt.Get(ctx, receipt.ID)
	if err != nil {
		t.Fatalf("reload source receipt after race failed: %v", err)
	}
	persistedReturn, err := client.PurchaseReturn.Get(ctx, purchaseReturn.ID)
	if err != nil {
		t.Fatalf("reload purchase return after race failed: %v", err)
	}
	returnTxnCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReturnSourceType),
			inventorytxn.SourceID(purchaseReturn.ID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count purchase return inventory transactions failed: %v", err)
	}
	receiptReversalCount, err := client.InventoryTxn.Query().
		Where(
			inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
			inventorytxn.SourceID(receipt.ID),
			inventorytxn.TxnType(biz.InventoryTxnReversal),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count purchase receipt reversal transactions failed: %v", err)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   fixtures.materialID,
		WarehouseID: fixtures.warehouseID,
		LotID:       receipt.Items[0].LotID,
		UnitID:      fixtures.unitID,
	})
	if err != nil {
		t.Fatalf("get inventory balance after race failed: %v", err)
	}

	if postErr != nil {
		t.Fatalf("purchase return post must remain legal with active source receipt, got %v", postErr)
	}
	if !errors.Is(cancelErr, biz.ErrPurchaseReceiptCorrectionDependency) {
		t.Fatalf("receipt cancellation must reject the active return dependency, got %v", cancelErr)
	}
	if persistedReceipt.Status != biz.PurchaseReceiptStatusPosted || persistedReturn.Status != biz.PurchaseReturnStatusPosted {
		t.Fatalf("%v-first statuses receipt=%s return=%s, want POSTED/POSTED", map[bool]string{true: "post", false: "cancel"}[postFirst], persistedReceipt.Status, persistedReturn.Status)
	}
	if returnTxnCount != 1 || receiptReversalCount != 0 {
		t.Fatalf("active dependency inventory evidence return_txns=%d receipt_reversals=%d, want 1/0", returnTxnCount, receiptReversalCount)
	}
	assertDecimalEqual(t, balance.Quantity, "6")
}

func TestPurchaseReceiptPostgresChildCreateAndCancelNeverLeavesActiveDraftOnCancelledReceipt(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseOperationalPostgresTestData(t)
	fixtures := createPurchaseOperationalPostgresFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	invFixtures := inventoryTestFixtures{
		unitID: fixtures.unitID, materialID: fixtures.materialID,
		productID: fixtures.productID, warehouseID: fixtures.warehouseID,
	}

	t.Run("purchase return", func(t *testing.T) {
		for iteration := 0; iteration < 8; iteration++ {
			suffix := fmt.Sprintf("%s-RETURN-CREATE-CANCEL-%d", fixtures.suffix, iteration)
			receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-"+suffix, invFixtures, stringPtr("PG-LOT-"+suffix), mustDecimal(t, "10"))
			input := &biz.PurchaseReturnFromReceiptCreate{
				ReturnNo: "PG-RET-" + suffix, PurchaseReceiptID: receipt.ID,
				ReturnedAt: time.Now().UTC(), IdempotencyKey: "pg-ret-" + suffix,
				Items: []biz.PurchaseReturnFromReceiptItemCreate{{PurchaseReceiptItemID: receipt.Items[0].ID, Quantity: mustDecimal(t, "1")}},
			}
			start := make(chan struct{})
			var created *biz.PurchaseReturn
			var createErr, cancelErr error
			var wg sync.WaitGroup
			wg.Add(2)
			go func() { defer wg.Done(); <-start; created, createErr = uc.CreatePurchaseReturnFromReceipt(ctx, input) }()
			go func() { defer wg.Done(); <-start; _, cancelErr = uc.CancelPostedPurchaseReceipt(ctx, receipt.ID) }()
			close(start)
			wg.Wait()

			receiptRow := client.PurchaseReceipt.GetX(ctx, receipt.ID)
			children := client.PurchaseReturn.Query().Where(purchasereturn.PurchaseReceiptID(receipt.ID)).AllX(ctx)
			assertPurchaseReceiptChildCreateCancelInvariant(t, receiptRow.Status, childrenStatus(children), created != nil, createErr, cancelErr)
		}
	})

	t.Run("purchase receipt adjustment", func(t *testing.T) {
		for iteration := 0; iteration < 8; iteration++ {
			suffix := fmt.Sprintf("%s-ADJUST-CREATE-CANCEL-%d", fixtures.suffix, iteration)
			receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PG-"+suffix, invFixtures, stringPtr("PG-LOT-"+suffix), mustDecimal(t, "10"))
			input := &biz.PurchaseReceiptAdjustmentFromReceiptCreate{
				AdjustmentNo: "PG-ADJ-" + suffix, PurchaseReceiptID: receipt.ID,
				AdjustedAt: time.Now().UTC(), IdempotencyKey: "pg-adj-" + suffix,
				Items: []biz.PurchaseReceiptAdjustmentFromReceiptItemCreate{{
					PurchaseReceiptItemID: receipt.Items[0].ID,
					AdjustType:            biz.PurchaseReceiptAdjustmentQuantityDecrease, Quantity: mustDecimal(t, "1"),
				}},
			}
			start := make(chan struct{})
			var created *biz.PurchaseReceiptAdjustment
			var createErr, cancelErr error
			var wg sync.WaitGroup
			wg.Add(2)
			go func() {
				defer wg.Done()
				<-start
				created, createErr = uc.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, input)
			}()
			go func() { defer wg.Done(); <-start; _, cancelErr = uc.CancelPostedPurchaseReceipt(ctx, receipt.ID) }()
			close(start)
			wg.Wait()

			receiptRow := client.PurchaseReceipt.GetX(ctx, receipt.ID)
			children := client.PurchaseReceiptAdjustment.Query().Where(purchasereceiptadjustment.PurchaseReceiptID(receipt.ID)).AllX(ctx)
			statuses := make([]string, 0, len(children))
			for _, child := range children {
				statuses = append(statuses, child.Status)
			}
			assertPurchaseReceiptChildCreateCancelInvariant(t, receiptRow.Status, statuses, created != nil, createErr, cancelErr)
		}
	})
}

func childrenStatus(children []*ent.PurchaseReturn) []string {
	statuses := make([]string, 0, len(children))
	for _, child := range children {
		statuses = append(statuses, child.Status)
	}
	return statuses
}

func assertPurchaseReceiptChildCreateCancelInvariant(
	t *testing.T,
	receiptStatus string,
	childStatuses []string,
	created bool,
	createErr error,
	cancelErr error,
) {
	t.Helper()
	switch {
	case cancelErr == nil:
		if !errors.Is(createErr, biz.ErrBadParam) || receiptStatus != biz.PurchaseReceiptStatusCancelled || len(childStatuses) != 0 || created {
			t.Fatalf("cancel winner escaped invariant: create=%v cancel=%v receipt=%s children=%#v created=%v", createErr, cancelErr, receiptStatus, childStatuses, created)
		}
	case createErr == nil:
		if !errors.Is(cancelErr, biz.ErrPurchaseReceiptCorrectionDependency) || receiptStatus != biz.PurchaseReceiptStatusPosted || len(childStatuses) != 1 || childStatuses[0] != biz.PurchaseReturnStatusDraft || !created {
			t.Fatalf("create winner escaped invariant: create=%v cancel=%v receipt=%s children=%#v created=%v", createErr, cancelErr, receiptStatus, childStatuses, created)
		}
	default:
		t.Fatalf("race has no legal winner: create=%v cancel=%v receipt=%s children=%#v", createErr, cancelErr, receiptStatus, childStatuses)
	}
}

func waitForPostgresBlockedQueryCount(t *testing.T, ctx context.Context, db *sql.DB, fragment string, want int) {
	t.Helper()
	deadline, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		var count int
		err := db.QueryRowContext(deadline, `
SELECT COUNT(*)
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND datname = current_database()
  AND wait_event_type = 'Lock'
  AND query ILIKE '%' || $1 || '%'`, fragment).Scan(&count)
		if err != nil {
			t.Fatalf("inspect blocked PostgreSQL queries failed: %v", err)
		}
		if count >= want {
			return
		}
		select {
		case <-deadline.Done():
			t.Fatalf("timed out waiting for %d blocked PostgreSQL queries containing %q; got %d", want, fragment, count)
		case <-ticker.C:
		}
	}
}

func receivePurchaseOperationError(t *testing.T, ch <-chan error, operation string) error {
	t.Helper()
	select {
	case err := <-ch:
		return err
	case <-time.After(10 * time.Second):
		t.Fatalf("timed out waiting for %s", operation)
		return fmt.Errorf("unreachable timeout waiting for %s", operation)
	}
}
