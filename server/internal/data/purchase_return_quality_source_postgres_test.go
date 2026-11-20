package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/purchasereturn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReturnFromQualityInspectionPostgresConcurrentCreateIsSourceUnique(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	assertPostgresColumnExists(t, data.sqldb, "purchase_returns", "quality_inspection_id")
	assertPostgresColumnExists(t, data.sqldb, "purchase_returns", "return_reason")
	assertPostgresPartialUniqueIndex(
		t,
		data.sqldb,
		"purchase_returns",
		"purchasereturn_quality_inspection_id_active",
		"quality_inspection_id IS NOT NULL AND status <> 'CANCELLED'",
	)
	assertPostgresForeignKeyDeleteRule(
		t,
		data.sqldb,
		"purchase_returns",
		"purchase_returns_quality_inspections_purchase_returns",
		"NO ACTION",
	)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createAndPostPurchaseReceipt(
		t,
		ctx,
		uc,
		"PG-PR-QI-RETURN-"+fixtures.suffix,
		invFixtures,
		stringPtr("PG-PR-QI-RETURN-LOT-"+fixtures.suffix),
		decimal.NewFromInt(5),
	)
	inspection := createRejectedPurchaseReceiptInspection(t, ctx, uc, receipt, "PG-QI-RETURN-"+fixtures.suffix)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, suffix := range []string{"A", "B"} {
		wg.Add(1)
		go func(commandSuffix string) {
			defer wg.Done()
			<-start
			_, err := uc.CreatePurchaseReturnFromQualityInspection(ctx, &biz.PurchaseReturnFromQualityInspectionCreate{
				ReturnNo:            "PG-RET-QI-" + commandSuffix + "-" + fixtures.suffix,
				QualityInspectionID: inspection.ID,
				Quantity:            decimal.NewFromInt(2),
				ReturnedAt:          time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC),
				Reason:              "来料不合格",
				IdempotencyKey:      "PG-RET-QI-" + commandSuffix + "-" + fixtures.suffix,
			})
			errs <- err
		}(suffix)
	}
	close(start)
	wg.Wait()
	close(errs)
	successes := 0
	conflicts := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrPurchaseReturnQualitySourceConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent quality return error: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent quality return outcomes success=%d conflict=%d", successes, conflicts)
	}
	rows, err := client.PurchaseReturn.Query().Where(
		purchasereturn.QualityInspectionID(inspection.ID),
		purchasereturn.StatusNEQ(biz.PurchaseReturnStatusCancelled),
	).All(ctx)
	if err != nil || len(rows) != 1 || rows[0].ReturnReason == nil || *rows[0].ReturnReason != "来料不合格" {
		t.Fatalf("active quality return rows=%#v err=%v", rows, err)
	}
}

func TestPurchaseReturnFromQualityInspectionPostgresLocksReceiptBeforeInspection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	invFixtures := inventoryTestFixtures{
		unitID:      fixtures.unitID,
		materialID:  fixtures.materialID,
		productID:   fixtures.productID,
		warehouseID: fixtures.warehouseID,
	}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createAndPostPurchaseReceipt(
		t,
		ctx,
		uc,
		"PG-PR-QI-LOCK-ORDER-"+fixtures.suffix,
		invFixtures,
		stringPtr("PG-PR-QI-LOCK-ORDER-LOT-"+fixtures.suffix),
		decimal.NewFromInt(5),
	)
	inspection := createRejectedPurchaseReceiptInspection(t, ctx, uc, receipt, "PG-QI-LOCK-ORDER-"+fixtures.suffix)

	receiptBlocker, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin receipt blocker: %v", err)
	}
	defer func() { _ = receiptBlocker.Rollback() }()
	var blockerPID, lockedReceiptID int
	if err := receiptBlocker.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&blockerPID); err != nil {
		t.Fatalf("read receipt blocker pid: %v", err)
	}
	if err := receiptBlocker.QueryRowContext(ctx, `SELECT id FROM purchase_receipts WHERE id = $1 FOR UPDATE`, receipt.ID).Scan(&lockedReceiptID); err != nil {
		t.Fatalf("lock source receipt: %v", err)
	}

	createResult := make(chan error, 1)
	go func() {
		_, createErr := uc.CreatePurchaseReturnFromQualityInspection(ctx, &biz.PurchaseReturnFromQualityInspectionCreate{
			ReturnNo:            "PG-RET-QI-LOCK-ORDER-" + fixtures.suffix,
			QualityInspectionID: inspection.ID,
			Quantity:            decimal.NewFromInt(2),
			ReturnedAt:          time.Date(2026, 7, 14, 13, 0, 0, 0, time.UTC),
			Reason:              "来料不合格",
			IdempotencyKey:      "PG-RET-QI-LOCK-ORDER-" + fixtures.suffix,
		})
		createResult <- createErr
	}()
	_ = waitForPostgresSessionBlockedByPID(t, ctx, data.sqldb, blockerPID)

	inspectionProbe, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin inspection lock probe: %v", err)
	}
	var lockedInspectionID int
	probeErr := inspectionProbe.QueryRowContext(ctx, `SELECT id FROM quality_inspections WHERE id = $1 FOR UPDATE NOWAIT`, inspection.ID).Scan(&lockedInspectionID)
	_ = inspectionProbe.Rollback()
	if probeErr != nil {
		t.Fatalf("quality inspection was locked before its source receipt: %v", probeErr)
	}
	if err := receiptBlocker.Commit(); err != nil {
		t.Fatalf("release source receipt lock: %v", err)
	}
	select {
	case err := <-createResult:
		if err != nil {
			t.Fatalf("create quality-sourced return after receipt lock release: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("quality-sourced return did not finish after receipt lock release")
	}
}
