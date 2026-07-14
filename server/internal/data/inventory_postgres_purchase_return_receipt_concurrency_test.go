package data

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"

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
		if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
			t.Fatalf("post linked purchase return failed: %v", err)
		}
		if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrBadParam) {
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

	if postFirst {
		if postErr != nil {
			t.Fatalf("purchase return post should win parent lock, got %v", postErr)
		}
		if !errors.Is(cancelErr, biz.ErrBadParam) {
			t.Fatalf("receipt cancellation must reject the committed return dependency, got %v", cancelErr)
		}
		if persistedReceipt.Status != biz.PurchaseReceiptStatusPosted || persistedReturn.Status != biz.PurchaseReturnStatusPosted {
			t.Fatalf("post-first statuses receipt=%s return=%s, want POSTED/POSTED", persistedReceipt.Status, persistedReturn.Status)
		}
		if returnTxnCount != 1 || receiptReversalCount != 0 {
			t.Fatalf("post-first inventory evidence return_txns=%d receipt_reversals=%d, want 1/0", returnTxnCount, receiptReversalCount)
		}
		assertDecimalEqual(t, balance.Quantity, "6")
		return
	}

	if cancelErr != nil {
		t.Fatalf("purchase receipt cancellation should win parent lock, got %v", cancelErr)
	}
	if !errors.Is(postErr, biz.ErrBadParam) {
		t.Fatalf("return posting must reject the re-read cancelled source receipt, got %v", postErr)
	}
	if persistedReceipt.Status != biz.PurchaseReceiptStatusCancelled || persistedReturn.Status != biz.PurchaseReturnStatusDraft {
		t.Fatalf("cancel-first statuses receipt=%s return=%s, want CANCELLED/DRAFT", persistedReceipt.Status, persistedReturn.Status)
	}
	if returnTxnCount != 0 || receiptReversalCount != 1 {
		t.Fatalf("cancel-first inventory evidence return_txns=%d receipt_reversals=%d, want 0/1", returnTxnCount, receiptReversalCount)
	}
	assertDecimalEqual(t, balance.Quantity, "0")
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
