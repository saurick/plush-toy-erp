package data

import (
	"context"
	"errors"
	"io"
	"slices"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorylotstatusevent"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestQualityInspectionPostgresCorrectionAtomicityAndConcurrency(t *testing.T) {
	for _, mode := range []string{"rollback-and-retry", "concurrent-replay", "downstream-disposition"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			data, client := openInventoryPostgresTestData(t)
			f := createInventoryPostgresFixtures(t, ctx, client)
			repo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
			uc := biz.NewInventoryUsecase(repo)
			actor := client.AdminUser.Create().SetUsername("pg-correct-" + f.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
			receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "PG-CORRECT-" + f.suffix, SupplierName: "纠错供应商"})
			if err != nil {
				t.Fatal(err)
			}
			item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: f.materialID,
				WarehouseID: f.warehouseID, UnitID: f.unitID, LotNo: stringPtr("PG-CORRECT-" + f.suffix), Quantity: decimal.NewFromInt(5), IdempotencyKey: "pg-correct-" + f.suffix})
			if err != nil {
				t.Fatal(err)
			}
			inspections, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 10})
			if err != nil || len(inspections) != 1 || item.LotID == nil {
				t.Fatalf("inspections=%+v item=%+v err=%v", inspections, item, err)
			}
			original, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspections[0].ID, biz.QualityInspectionResultReject))
			if err != nil {
				t.Fatal(err)
			}
			lotBefore := client.InventoryLot.GetX(ctx, *item.LotID)
			eventsBefore := client.InventoryLotStatusEvent.Query().Where(inventorylotstatusevent.InventoryLotID(*item.LotID)).CountX(ctx)
			input := biz.QualityInspectionCorrectionCreate{InspectionID: original.ID, CorrectionInspectionNo: "PG-RECHECK-" + f.suffix, Reason: "仪器校准失效，重新检验"}
			assertUnchanged := func() {
				t.Helper()
				got := client.QualityInspection.GetX(ctx, original.ID)
				lot := client.InventoryLot.GetX(ctx, *item.LotID)
				if got.SupersededAt != nil || got.SupersededBy != nil || got.SupersededReason != nil || got.Status != original.Status {
					t.Fatalf("failed correction changed original evidence: %+v", got)
				}
				if lot.Status != lotBefore.Status || lot.Version != lotBefore.Version || client.InventoryLotStatusEvent.Query().Where(inventorylotstatusevent.InventoryLotID(lot.ID)).CountX(ctx) != eventsBefore {
					t.Fatalf("failed correction changed lot or audit: %+v", lot)
				}
				if count := client.QualityInspection.Query().Where(qualityinspection.CorrectionOfInspectionID(original.ID)).CountX(ctx); count != 0 {
					t.Fatalf("failed correction left %d replacement inspections", count)
				}
			}
			var corrected *biz.QualityInspection
			switch mode {
			case "rollback-and-retry":
				duplicate := input
				duplicate.CorrectionInspectionNo = original.InspectionNo
				// The unique violation occurs after the lot HOLD transition and its audit insert.
				if _, err := uc.CorrectQualityInspectionResult(ctx, &duplicate, actor.ID); !errors.Is(err, biz.ErrQualityInspectionRecordConflict) {
					t.Fatalf("duplicate inspection error=%v", err)
				}
				assertUnchanged()
				corrected, err = uc.CorrectQualityInspectionResult(ctx, &input, actor.ID)
				if err != nil {
					t.Fatal(err)
				}
			case "concurrent-replay":
				holder, err := repo.beginInventoryDBTx(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer rollbackInventoryDBTx(ctx, holder, repo.log)
				if _, err := getLockedQualityInspection(ctx, holder, original.ID); err != nil {
					t.Fatal(err)
				}
				type result struct {
					inspection *biz.QualityInspection
					err        error
				}
				done := make(chan result, 2)
				for range 2 {
					go func() {
						copy := input
						inspection, err := uc.CorrectQualityInspectionResult(ctx, &copy, actor.ID)
						done <- result{inspection, err}
					}()
				}
				waitInventoryPostgresBlocked(t, ctx, data.sqldb, inventoryPostgresTxPID(t, ctx, holder), 2)
				if err := holder.sqlTx.Commit(); err != nil {
					t.Fatal(err)
				}
				holder.sqlTx = nil
				for range 2 {
					result := <-done
					if result.err != nil || result.inspection == nil {
						t.Fatalf("concurrent correction=%+v err=%v", result.inspection, result.err)
					}
					if corrected != nil && corrected.ID != result.inspection.ID {
						t.Fatal("concurrent replay created different replacement inspections")
					}
					corrected = result.inspection
				}
			case "downstream-disposition":
				_, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PG-DISPOSE-" + f.suffix,
					QualityInspectionID: original.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(5),
					Reason: "退厂", IdempotencyKey: "pg-dispose-" + f.suffix, CreatedBy: actor.ID})
				if err != nil {
					t.Fatal(err)
				}
				if _, err := uc.CorrectQualityInspectionResult(ctx, &input, actor.ID); !errors.Is(err, biz.ErrBadParam) {
					t.Fatalf("downstream correction error=%v", err)
				}
				assertUnchanged()
				return
			}
			if corrected.Status != biz.QualityInspectionStatusSubmitted || corrected.CorrectionOfInspectionID == nil || *corrected.CorrectionOfInspectionID != original.ID || len(corrected.CheckItems) != 0 {
				t.Fatalf("replacement inspection=%+v", corrected)
			}
			got, err := uc.GetQualityInspection(ctx, original.ID)
			if err != nil || got.SupersededAt == nil || got.SupersededBy == nil || *got.SupersededBy != actor.ID || got.SupersededReason == nil || *got.SupersededReason != input.Reason || !slices.Equal(got.CheckItems, original.CheckItems) || len(got.CheckItems) == 0 {
				t.Fatalf("original evidence=%+v err=%v", got, err)
			}
			lot := client.InventoryLot.GetX(ctx, *item.LotID)
			if lot.Status != biz.InventoryLotHold || lot.Version != lotBefore.Version+1 || client.InventoryLotStatusEvent.Query().Where(inventorylotstatusevent.InventoryLotID(lot.ID)).CountX(ctx) != eventsBefore+1 {
				t.Fatalf("correction must hold lot exactly once: %+v", lot)
			}
			if count := client.QualityInspection.Query().Where(qualityinspection.CorrectionOfInspectionID(original.ID)).CountX(ctx); count != 1 {
				t.Fatalf("replacement count=%d", count)
			}
			changed := input
			changed.Reason = "不同纠错意图"
			if _, err := uc.CorrectQualityInspectionResult(ctx, &changed, actor.ID); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("changed intent error=%v", err)
			}
			if _, err := uc.CorrectQualityInspectionResult(ctx, &input, actor.ID+1); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("different actor replay error=%v", err)
			}
		})
	}
}

func TestQualityInspectionPostgresCompletedCorrectionReplayUsesImmutableIntent(t *testing.T) {
	for _, outcome := range []string{biz.QualityInspectionResultPass, biz.QualityInspectionResultReject, biz.QualityInspectionResultConcession, "corrected_again", "inbound"} {
		t.Run(outcome, func(t *testing.T) {
			data, client := openInventoryPostgresTestData(t)
			f := createInventoryPostgresFixtures(t, t.Context(), client)
			actor := client.AdminUser.Create().SetUsername("pg-correction-replay-" + f.suffix).SetPasswordHash("test-password-hash").SaveX(t.Context())
			testQualityInspectionCorrectionCompletedReplay(t, data, client,
				inventoryTestFixtures{unitID: f.unitID, materialID: f.materialID, warehouseID: f.warehouseID}, actor.ID, "PG-"+f.suffix, outcome)
		})
	}
}
