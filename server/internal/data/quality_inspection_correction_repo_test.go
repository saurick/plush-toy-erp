package data

import (
	"context"
	"errors"
	"io"
	"slices"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestShipmentQualityGatesUseOnlyCurrentInspections(t *testing.T) {
	for _, result := range []string{biz.QualityInspectionResultReject, biz.QualityInspectionResultPass} {
		t.Run(result, func(t *testing.T) {
			ctx := t.Context()
			data, client := openInventoryRepoTestData(t, "shipment_current_quality_"+result)
			f := createInventoryTestFixtures(t, ctx, client)
			inv := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
			uc := biz.NewInventoryUsecase(inv)
			op := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
			lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectProduct, f.productID, "SHIP-QC-LOT")
			shipment, err := op.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{Shipment: &biz.ShipmentCreate{ShipmentNo: "SHIP-QC", IdempotencyKey: "ship-qc"}, Items: []*biz.ShipmentItemCreate{{ProductID: f.productID, WarehouseID: f.productWarehouseID, UnitID: f.unitID, LotID: &lot.ID, Quantity: decimal.NewFromInt(1)}}})
			if err != nil {
				t.Fatal(err)
			}
			assertGates := func(want error) {
				t.Helper()
				tx, err := inv.beginInventoryDBTx(ctx)
				if err != nil {
					t.Fatal(err)
				}
				err = validateShipmentFinishedGoodsQualityGate(ctx, tx, shipment.ID)
				_ = tx.sqlTx.Rollback()
				if !errors.Is(err, want) {
					t.Fatalf("direct gate: got=%v want=%v", err, want)
				}
				processTx, err := client.Tx(ctx)
				if err != nil {
					t.Fatal(err)
				}
				err = validateProcessShipmentQualityGate(ctx, processTx, shipment.ID)
				_ = processTx.Rollback()
				if !errors.Is(err, want) {
					t.Fatalf("process gate: got=%v want=%v", err, want)
				}
			}
			draft, err := uc.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{InspectionNo: "SHIP-QC-OLD", SourceID: shipment.ID, InventoryLotID: lot.ID, WarehouseID: f.productWarehouseID, SubjectID: f.productID})
			if err != nil {
				t.Fatal(err)
			}
			if _, err = uc.SubmitQualityInspection(ctx, draft.ID); err != nil {
				t.Fatal(err)
			}
			var original *biz.QualityInspection
			if result == biz.QualityInspectionResultReject {
				original, err = uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(draft.ID, result))
			} else {
				original, err = uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(draft.ID, result))
			}
			if err != nil {
				t.Fatal(err)
			}
			if result == biz.QualityInspectionResultReject {
				assertGates(biz.ErrShipmentQualityRejected)
			} else {
				assertGates(nil)
			}
			corrected, err := uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{InspectionID: original.ID, CorrectionInspectionNo: "SHIP-QC-NEW", Reason: "重新校准后复检"}, 17)
			if err != nil {
				t.Fatal(err)
			}
			assertGates(biz.ErrShipmentQualityPending)
			if _, err := uc.CancelQualityInspection(ctx, corrected.ID, stringPtr("取消复检")); !errors.Is(err, biz.ErrBadParam) {
				t.Fatalf("correction cancellation must be rejected: %v", err)
			}
			current, err := uc.GetQualityInspection(ctx, corrected.ID)
			if err != nil || current.Status != biz.QualityInspectionStatusSubmitted || !current.UpdatedAt.Equal(corrected.UpdatedAt) {
				t.Fatalf("denied cancellation changed correction: %+v %v", current, err)
			}
			assertLotStatus(t, ctx, uc, lot.ID, biz.InventoryLotHold)
			assertGates(biz.ErrShipmentQualityPending)
			_, created, err := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)).SubmitShipmentRelease(ctx, shipment.ID, 17)
			if !errors.Is(err, biz.ErrShipmentQualityPending) || created {
				t.Fatalf("unresolved correction allowed shipment release: created=%t err=%v", created, err)
			}
			if _, err = uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(corrected.ID, biz.QualityInspectionResultPass)); err != nil {
				t.Fatal(err)
			}
			assertGates(nil)
		})
	}
}

func TestQualityInspectionCorrectionSupersedesResultAndReopensHold(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quality_inspection_correction")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "QI-CORR-R1", SupplierName: "纠错供应商"})
	if err != nil {
		t.Fatal(err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID: receipt.ID, MaterialID: fixtures.materialID, WarehouseID: fixtures.warehouseID,
		UnitID: fixtures.unitID, LotNo: stringPtr("QI-CORR-LOT"), Quantity: decimal.NewFromInt(5), IdempotencyKey: "qi-corr-item",
	})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 10})
	if err != nil || len(inspections) != 1 {
		t.Fatalf("inspections=%#v err=%v", inspections, err)
	}
	original, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspections[0].ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	corrected, err := uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{
		InspectionID: original.ID, CorrectionInspectionNo: "QI-CORR-R2", Reason: "复核发现仪器校准失效",
	}, 17)
	if err != nil {
		t.Fatal(err)
	}
	if corrected.Status != biz.QualityInspectionStatusSubmitted || corrected.CorrectionOfInspectionID == nil || *corrected.CorrectionOfInspectionID != original.ID {
		t.Fatalf("corrected=%+v", corrected)
	}
	gotOriginal, err := uc.GetQualityInspection(ctx, original.ID)
	if err != nil || gotOriginal.SupersededAt == nil || gotOriginal.SupersededBy == nil || *gotOriginal.SupersededBy != 17 || gotOriginal.SupersededReason == nil {
		t.Fatalf("original=%+v err=%v", gotOriginal, err)
	}
	if len(original.CheckItems) == 0 || !slices.Equal(gotOriginal.CheckItems, original.CheckItems) || len(corrected.CheckItems) != 0 {
		t.Fatal("correction must preserve original evidence and require a fresh inspection")
	}
	if gotOriginal.CorrectedInspectionID == nil || *gotOriginal.CorrectedInspectionID != corrected.ID ||
		gotOriginal.CorrectedInspectionNo == nil || *gotOriginal.CorrectedInspectionNo != corrected.InspectionNo ||
		corrected.CorrectionOfInspectionNo == nil || *corrected.CorrectionOfInspectionNo != original.InspectionNo {
		t.Fatalf("missing bidirectional correction links: original=%+v corrected=%+v", gotOriginal, corrected)
	}
	filter := biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 10}
	currentRows, currentTotal, err := uc.ListQualityInspections(ctx, filter)
	if err != nil || currentTotal != 1 || len(currentRows) != 1 || currentRows[0].ID != corrected.ID {
		t.Fatalf("default list included superseded original: %+v %d %v", currentRows, currentTotal, err)
	}
	counts, err := uc.CountQualityInspectionsByStatus(ctx, filter)
	if err != nil || counts[biz.QualityInspectionStatusRejected] != 0 || counts[biz.QualityInspectionStatusSubmitted] != 1 {
		t.Fatalf("default counts include old result: %+v %v", counts, err)
	}
	filter.IncludeSuperseded = true
	history, total, err := uc.ListQualityInspections(ctx, filter)
	if err != nil || total != 2 || len(history) != 2 {
		t.Fatalf("historical list missing original: %+v %d %v", history, total, err)
	}
	counts, err = uc.CountQualityInspectionsByStatus(ctx, filter)
	if err != nil || counts[biz.QualityInspectionStatusRejected] != 1 || counts[biz.QualityInspectionStatusSubmitted] != 1 {
		t.Fatalf("historical counts must match historical list: %+v %v", counts, err)
	}
	assertLotStatus(t, ctx, uc, *item.LotID, biz.InventoryLotHold)

	replay, err := uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{
		InspectionID: original.ID, CorrectionInspectionNo: "QI-CORR-R2", Reason: "复核发现仪器校准失效",
	}, 17)
	if err != nil || replay.ID != corrected.ID {
		t.Fatalf("replay=%+v err=%v", replay, err)
	}
	_, err = uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{
		InspectionID: original.ID, CorrectionInspectionNo: "QI-CORR-R3", Reason: "不同纠错意图",
	}, 17)
	if !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed correction err=%v", err)
	}
	if _, err := uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(corrected.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatal(err)
	}
	completed, err := uc.GetQualityInspection(ctx, corrected.ID)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{
		InspectionID: original.ID, CorrectionInspectionNo: "QI-CORR-R2", Reason: "复核发现仪器校准失效",
	}, 17)
	if err != nil || replayed.ID != completed.ID || replayed.Status != completed.Status || !replayed.UpdatedAt.Equal(completed.UpdatedAt) {
		t.Fatalf("completed correction replay=%+v err=%v", replayed, err)
	}
	gate, err := uc.EvaluatePurchaseReceiptQualityGate(ctx, receipt.ID)
	if err != nil || gate.Outcome != biz.PurchaseReceiptQualityGateReady {
		t.Fatalf("corrected gate=%+v err=%v", gate, err)
	}

}

func TestQualityInspectionCorrectionBlocksDownstreamDisposition(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "quality_inspection_correction_dependency")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "QI-CORR-BLOCK-R1", SupplierName: "纠错供应商"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: fixtures.materialID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, LotNo: stringPtr("QI-CORR-BLOCK-LOT"), Quantity: decimal.NewFromInt(5), IdempotencyKey: "qi-corr-block-item"})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, _ := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 10})
	rejected, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspections[0].ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	_, err = uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "QI-CORR-PRD", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(5), Reason: "退厂", IdempotencyKey: "qi-corr-prd", CreatedBy: 1})
	if err != nil {
		t.Fatal(err)
	}
	_, err = uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{InspectionID: rejected.ID, CorrectionInspectionNo: "QI-CORR-BLOCK-R2", Reason: "试图越过处置"}, 17)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("downstream disposition correction err=%v", err)
	}
}
