package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

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
