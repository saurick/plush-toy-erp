package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func approximateQualityInspectionDecision(inspectionID int, result string) *biz.QualityInspectionDecision {
	operator := biz.QualityInspectionDefectRateOperatorApprox
	percent := decimal.NewFromInt(5)
	return &biz.QualityInspectionDecision{
		InspectionID:       inspectionID,
		Result:             result,
		DefectRateOperator: &operator,
		DefectRatePercent:  &percent,
	}
}

func TestInventoryRepo_QualityInspectionLifecycleAndLotStatus(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_quality_inspection_lifecycle")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	passReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-PASS", fixtures, stringPtr("QI-LIFE-LOT-PASS"), mustDecimal(t, "10"))
	passItem := passReceipt.Items[0]
	beforeQualityTxnCount := inventoryTxnCount(t, ctx, client)
	draft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-PASS", passReceipt, fixtures)
	if draft.Status != biz.QualityInspectionStatusDraft || draft.OriginalLotStatus != "" || draft.Result != nil || draft.InspectedAt != nil {
		t.Fatalf("unexpected draft state: status=%s original=%q result=%v inspected_at=%v", draft.Status, draft.OriginalLotStatus, draft.Result, draft.InspectedAt)
	}
	if draft.SourceType == nil || *draft.SourceType != biz.QualityInspectionSourcePurchaseReceipt ||
		draft.SourceID == nil || *draft.SourceID != passReceipt.ID ||
		draft.InspectionType == nil || *draft.InspectionType != biz.QualityInspectionTypeIncoming ||
		draft.SubjectType == nil || *draft.SubjectType != biz.QualityInspectionSubjectMaterial ||
		draft.SubjectID == nil || *draft.SubjectID != fixtures.materialID {
		t.Fatalf("unexpected quality inspection source anchor: %+v", draft)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if _, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:          "QI-LIFE-PASS",
		PurchaseReceiptID:     passReceipt.ID,
		PurchaseReceiptItemID: &passItem.ID,
		InventoryLotID:        *passItem.LotID,
		MaterialID:            fixtures.materialID,
		WarehouseID:           fixtures.warehouseID,
	}); !ent.IsConstraintError(err) {
		t.Fatalf("expected inspection_no unique constraint, got %v", err)
	}

	submitted, err := uc.SubmitQualityInspection(ctx, draft.ID)
	if err != nil {
		t.Fatalf("submit quality inspection failed: %v", err)
	}
	if submitted.Status != biz.QualityInspectionStatusSubmitted || submitted.OriginalLotStatus != biz.InventoryLotActive {
		t.Fatalf("unexpected submitted state: status=%s original=%q", submitted.Status, submitted.OriginalLotStatus)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotHold)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if replay, err := uc.SubmitQualityInspection(ctx, draft.ID); err != nil || replay.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("repeat submit should be idempotent submitted, row=%v err=%v", replay, err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          passItem.LotID,
		TxnType:        biz.InventoryTxnAdjustOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_quality_inspection",
		IdempotencyKey: "qi-life-hold-adjust-out",
	}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected SUBMITTED HOLD lot to block ordinary adjust-out, got %v", err)
	}

	inspectedAt := time.Date(2026, 4, 26, 10, 30, 0, 0, time.UTC)
	inspectorID := 7001
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: draft.ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("new submitted decision without defect-rate pair must fail, got %v", err)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotHold)
	passRateOperator := biz.QualityInspectionDefectRateOperatorApprox
	passRatePercent := mustDecimal(t, "5")
	passed, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID:       draft.ID,
		Result:             biz.QualityInspectionResultPass,
		InspectedAt:        inspectedAt,
		InspectorID:        &inspectorID,
		DefectRateOperator: &passRateOperator,
		DefectRatePercent:  &passRatePercent,
		DecisionNote:       stringPtr("合格"),
	})
	if err != nil {
		t.Fatalf("pass quality inspection failed: %v", err)
	}
	if passed.Status != biz.QualityInspectionStatusPassed ||
		passed.Result == nil || *passed.Result != biz.QualityInspectionResultPass ||
		passed.InspectedAt == nil || !passed.InspectedAt.Equal(inspectedAt) ||
		passed.InspectorID == nil || *passed.InspectorID != inspectorID ||
		passed.DefectRateOperator == nil || *passed.DefectRateOperator != passRateOperator ||
		passed.DefectRatePercent == nil || !passed.DefectRatePercent.Equal(passRatePercent) {
		t.Fatalf("unexpected passed state: %+v", passed)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if replay, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: draft.ID, DefectRateOperator: &passRateOperator, DefectRatePercent: &passRatePercent}); err != nil || replay.Status != biz.QualityInspectionStatusPassed {
		t.Fatalf("repeat pass should be idempotent passed, row=%v err=%v", replay, err)
	}
	if _, err := uc.CancelQualityInspection(ctx, draft.ID, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected passed inspection cancel to be rejected, got %v", err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          passItem.LotID,
		TxnType:        biz.InventoryTxnAdjustOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_quality_inspection",
		IdempotencyKey: "qi-life-active-adjust-out",
	}); err != nil {
		t.Fatalf("expected PASSED ACTIVE lot to allow ordinary adjust-out, got %v", err)
	}

	rejectReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-REJECT", fixtures, stringPtr("QI-LIFE-LOT-REJECT"), mustDecimal(t, "5"))
	rejectDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-REJECT", rejectReceipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, rejectDraft.ID); err != nil {
		t.Fatalf("submit reject fixture failed: %v", err)
	}
	rejectRateOperator := biz.QualityInspectionDefectRateOperatorGT
	rejectRatePercent := mustDecimal(t, "50")
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID, DefectRateOperator: &rejectRateOperator, DefectRatePercent: &rejectRatePercent, DecisionNote: stringPtr("拒收")}); err != nil {
		t.Fatalf("reject quality inspection failed: %v", err)
	}
	rejected, err := uc.GetQualityInspection(ctx, rejectDraft.ID)
	if err != nil {
		t.Fatalf("get rejected inspection failed: %v", err)
	}
	if rejected.Status != biz.QualityInspectionStatusRejected || rejected.Result == nil || *rejected.Result != biz.QualityInspectionResultReject ||
		rejected.DefectRateOperator == nil || *rejected.DefectRateOperator != rejectRateOperator ||
		rejected.DefectRatePercent == nil || !rejected.DefectRatePercent.Equal(rejectRatePercent) ||
		rejected.SourceNo == nil || *rejected.SourceNo != rejectReceipt.ReceiptNo {
		t.Fatalf("unexpected rejected state: %+v", rejected)
	}
	rejectItem := rejectReceipt.Items[0]
	assertLotStatus(t, ctx, uc, *rejectItem.LotID, biz.InventoryLotRejected)
	if replay, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID, DefectRateOperator: &rejectRateOperator, DefectRatePercent: &rejectRatePercent}); err != nil || replay.Status != biz.QualityInspectionStatusRejected {
		t.Fatalf("repeat reject should be idempotent rejected, row=%v err=%v", replay, err)
	}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          rejectItem.LotID,
		TxnType:        biz.InventoryTxnAdjustOut,
		Direction:      -1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_quality_inspection",
		IdempotencyKey: "qi-life-rejected-adjust-out",
	}); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected REJECTED lot to block ordinary adjust-out, got %v", err)
	}
	purchaseReturn := createLinkedPurchaseReturn(t, ctx, uc, "QI-LIFE-RETURN-REJECT", rejectReceipt.ID, rejectItem, fixtures, mustDecimal(t, "1"))
	if _, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID); err != nil {
		t.Fatalf("expected REJECTED lot to allow purchase return out, got %v", err)
	}
	if _, err := uc.CancelQualityInspection(ctx, rejectDraft.ID, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected rejected inspection cancel to be rejected, got %v", err)
	}

	cancelDraftReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-CANCEL-DRAFT", fixtures, stringPtr("QI-LIFE-LOT-CANCEL-DRAFT"), mustDecimal(t, "3"))
	cancelDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-CANCEL-DRAFT", cancelDraftReceipt, fixtures)
	cancelledDraft, err := uc.CancelQualityInspection(ctx, cancelDraft.ID, stringPtr("草稿取消"))
	if err != nil {
		t.Fatalf("cancel draft inspection failed: %v", err)
	}
	if cancelledDraft.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected cancelled draft, got %s", cancelledDraft.Status)
	}
	assertLotStatus(t, ctx, uc, *cancelDraftReceipt.Items[0].LotID, biz.InventoryLotActive)
	if replay, err := uc.CancelQualityInspection(ctx, cancelDraft.ID, nil); err != nil || replay.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("repeat cancel should be idempotent cancelled, row=%v err=%v", replay, err)
	}
	if _, err := uc.SubmitQualityInspection(ctx, cancelDraft.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled inspection submit to be rejected, got %v", err)
	}
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: cancelDraft.ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled inspection pass to be rejected, got %v", err)
	}
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: cancelDraft.ID}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancelled inspection reject to be rejected, got %v", err)
	}

	cancelSubmittedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-CANCEL-SUBMITTED", fixtures, stringPtr("QI-LIFE-LOT-CANCEL-SUBMITTED"), mustDecimal(t, "3"))
	cancelSubmitted := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-CANCEL-SUBMITTED", cancelSubmittedReceipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, cancelSubmitted.ID); err != nil {
		t.Fatalf("submit cancel fixture failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *cancelSubmittedReceipt.Items[0].LotID, biz.InventoryLotHold)
	cancelledSubmitted, err := uc.CancelQualityInspection(ctx, cancelSubmitted.ID, stringPtr("提交后取消"))
	if err != nil {
		t.Fatalf("cancel submitted inspection failed: %v", err)
	}
	if cancelledSubmitted.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("expected submitted inspection cancelled, got %s", cancelledSubmitted.Status)
	}
	assertLotStatus(t, ctx, uc, *cancelSubmittedReceipt.Items[0].LotID, biz.InventoryLotActive)

	holdReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-HOLD-ORIGINAL", fixtures, stringPtr("QI-LIFE-LOT-HOLD-ORIGINAL"), mustDecimal(t, "3"))
	changeLotToStatus(t, ctx, uc, *holdReceipt.Items[0].LotID, biz.InventoryLotHold)
	holdDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-HOLD-ORIGINAL", holdReceipt, fixtures)
	holdSubmitted, err := uc.SubmitQualityInspection(ctx, holdDraft.ID)
	if err != nil {
		t.Fatalf("submit originally HOLD inspection failed: %v", err)
	}
	if holdSubmitted.OriginalLotStatus != biz.InventoryLotHold {
		t.Fatalf("expected originally HOLD inspection to record HOLD, got %s", holdSubmitted.OriginalLotStatus)
	}
	if _, err := uc.CancelQualityInspection(ctx, holdDraft.ID, nil); err != nil {
		t.Fatalf("cancel originally HOLD inspection failed: %v", err)
	}
	assertLotStatus(t, ctx, uc, *holdReceipt.Items[0].LotID, biz.InventoryLotHold)

	conflictReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-LIFE-RECEIPT-CANCEL-CONFLICT", fixtures, stringPtr("QI-LIFE-LOT-CANCEL-CONFLICT"), mustDecimal(t, "3"))
	conflictDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-LIFE-CANCEL-CONFLICT", conflictReceipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, conflictDraft.ID); err != nil {
		t.Fatalf("submit cancel conflict fixture failed: %v", err)
	}
	forceLotStatus(t, ctx, client, *conflictReceipt.Items[0].LotID, biz.InventoryLotActive)
	if _, err := uc.CancelQualityInspection(ctx, conflictDraft.ID, nil); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected cancel with externally changed lot status to be rejected, got %v", err)
	}
}

func TestInventoryRepo_QualityInspectionReferenceValidation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_quality_inspection_validation")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	validReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-VALID-RECEIPT", fixtures, stringPtr("QI-VALID-LOT"), mustDecimal(t, "5"))
	validItem := validReceipt.Items[0]
	if validItem.LotID == nil {
		t.Fatalf("expected valid receipt item lot_id")
	}
	base := func(no string) *biz.QualityInspectionCreate {
		return &biz.QualityInspectionCreate{
			InspectionNo:          no,
			PurchaseReceiptID:     validReceipt.ID,
			PurchaseReceiptItemID: &validItem.ID,
			InventoryLotID:        *validItem.LotID,
			MaterialID:            fixtures.materialID,
			WarehouseID:           fixtures.warehouseID,
		}
	}
	validDraft, err := uc.CreateQualityInspectionDraft(ctx, base("QI-VALID-OK"))
	if err != nil {
		t.Fatalf("create valid quality inspection draft failed: %v", err)
	}
	if validDraft.Status != biz.QualityInspectionStatusDraft {
		t.Fatalf("expected valid draft status DRAFT, got %s", validDraft.Status)
	}

	if _, err := uc.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:      "QI-VALID-MISSING-RECEIPT",
		PurchaseReceiptID: 999999,
		InventoryLotID:    *validItem.LotID,
		MaterialID:        fixtures.materialID,
		WarehouseID:       fixtures.warehouseID,
	}); !errors.Is(err, biz.ErrPurchaseReceiptNotFound) {
		t.Fatalf("expected missing receipt to fail with ErrPurchaseReceiptNotFound, got %v", err)
	}
	draftReceipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "QI-VALID-DRAFT-RECEIPT",
		SupplierName: "待提交供应商",
		ReceivedAt:   time.Date(2026, 4, 26, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create non-posted receipt fixture failed: %v", err)
	}
	nonPosted := base("QI-VALID-NON-POSTED")
	nonPosted.PurchaseReceiptID = draftReceipt.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, nonPosted); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected non-posted receipt to fail with ErrBadParam, got %v", err)
	}
	missingItem := base("QI-VALID-MISSING-ITEM")
	missingID := 999999
	missingItem.PurchaseReceiptItemID = &missingID
	if _, err := uc.CreateQualityInspectionDraft(ctx, missingItem); !errors.Is(err, biz.ErrPurchaseReceiptItemNotFound) {
		t.Fatalf("expected missing receipt item to fail, got %v", err)
	}
	otherReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-VALID-OTHER-RECEIPT", fixtures, stringPtr("QI-VALID-OTHER-LOT"), mustDecimal(t, "5"))
	itemNotBelong := base("QI-VALID-ITEM-NOT-BELONG")
	itemNotBelong.PurchaseReceiptItemID = &otherReceipt.Items[0].ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, itemNotBelong); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item from another receipt to fail, got %v", err)
	}
	lotMissing := base("QI-VALID-MISSING-LOT")
	lotMissing.InventoryLotID = 999999
	if _, err := uc.CreateQualityInspectionDraft(ctx, lotMissing); !errors.Is(err, biz.ErrInventoryLotNotFound) {
		t.Fatalf("expected missing lot to fail, got %v", err)
	}
	productLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectProduct, fixtures.productID, "QI-VALID-PRODUCT-LOT")
	productLotInput := base("QI-VALID-PRODUCT-LOT")
	productLotInput.InventoryLotID = productLot.ID
	productLotInput.PurchaseReceiptItemID = nil
	if _, err := uc.CreateQualityInspectionDraft(ctx, productLotInput); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected product lot inspection to fail, got %v", err)
	}
	otherMaterial := createTestMaterial(t, ctx, client, fixtures.unitID, "MAT-QI-VALID-OTHER")
	otherMaterialLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, otherMaterial.ID, "QI-VALID-OTHER-MATERIAL-LOT")
	materialMismatch := base("QI-VALID-MATERIAL-MISMATCH")
	materialMismatch.PurchaseReceiptItemID = nil
	materialMismatch.InventoryLotID = otherMaterialLot.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, materialMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected lot subject/material mismatch to fail, got %v", err)
	}
	itemMaterialMismatch := base("QI-VALID-ITEM-MATERIAL-MISMATCH")
	itemMaterialMismatch.InventoryLotID = otherMaterialLot.ID
	itemMaterialMismatch.MaterialID = otherMaterial.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, itemMaterialMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item material mismatch to fail, got %v", err)
	}
	otherWarehouse := createTestWarehouse(t, ctx, client, "WH-QI-VALID-OTHER")
	warehouseMismatch := base("QI-VALID-WAREHOUSE-MISMATCH")
	warehouseMismatch.WarehouseID = otherWarehouse.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, warehouseMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item warehouse mismatch to fail, got %v", err)
	}
	lotMismatchLot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, fixtures.materialID, "QI-VALID-LOT-MISMATCH")
	lotMismatch := base("QI-VALID-LOT-MISMATCH")
	lotMismatch.InventoryLotID = lotMismatchLot.ID
	if _, err := uc.CreateQualityInspectionDraft(ctx, lotMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected receipt item lot mismatch to fail, got %v", err)
	}
	shipmentSource := base("QI-VALID-SHIPMENT-SOURCE")
	shipmentSource.SourceType = "SHIPMENT"
	shipmentSource.SourceID = 9001
	if _, err := uc.CreateQualityInspectionDraft(ctx, shipmentSource); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected shipment source to stay blocked for incoming quality path, got %v", err)
	}
	sourceMismatch := base("QI-VALID-SOURCE-MISMATCH")
	sourceMismatch.SourceID = validReceipt.ID + 1
	if _, err := uc.CreateQualityInspectionDraft(ctx, sourceMismatch); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected source id mismatch to fail, got %v", err)
	}
}

func TestInventoryRepo_FinishedGoodsQualityInspectionReferenceValidation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_finished_goods_quality_inspection_validation")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	productLot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectProduct, fixtures.productID, "QI-FG-VALID-LOT")
	shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "QI-FG-VALID-SHIP",
			IdempotencyKey: "QI-FG-VALID-SHIP",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				LotID:       &productLot.ID,
				Quantity:    mustDecimal(t, "3"),
			},
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				LotID:       &productLot.ID,
				Quantity:    mustDecimal(t, "2"),
			},
		},
	})
	if err != nil {
		t.Fatalf("create shipment fixture failed: %v", err)
	}
	if len(shipment.Items) != 2 {
		t.Fatalf("expected duplicate shipment tuple fixture to keep two source rows, got %+v", shipment.Items)
	}
	beforeQualityTxnCount := inventoryTxnCount(t, ctx, client)

	createInput := &biz.QualityInspectionCreate{
		InspectionNo:   "QI-FG-VALID",
		SourceID:       shipment.ID,
		InventoryLotID: productLot.ID,
		WarehouseID:    fixtures.warehouseID,
		SubjectID:      fixtures.productID,
	}
	draft, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, createInput)
	if err != nil {
		t.Fatalf("create finished goods quality inspection draft failed: %v", err)
	}
	replayed, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, createInput)
	if err != nil || replayed.ID != draft.ID {
		t.Fatalf("same finished goods inspection intent must replay id=%d, row=%+v err=%v", draft.ID, replayed, err)
	}
	changedIntent := *createInput
	changedIntent.DecisionNote = stringPtr("变更后的重复请求")
	if _, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &changedIntent); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("same inspection number with changed intent must conflict, got %v", err)
	}
	conflictInput := *createInput
	conflictInput.InspectionNo = "QI-FG-GRAIN-CONFLICT"
	if _, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &conflictInput); !errors.Is(err, biz.ErrQualityInspectionSourceConflict) {
		t.Fatalf("same active shipment quality grain must conflict, got %v", err)
	}
	if cancelled, err := inventoryUC.CancelQualityInspection(ctx, draft.ID, stringPtr("撤销后重新送检")); err != nil || cancelled.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("cancel finished goods inspection before rebuild row=%+v err=%v", cancelled, err)
	}
	rebuildInput := *createInput
	rebuildInput.InspectionNo = "QI-FG-REBUILT"
	draft, err = inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &rebuildInput)
	if err != nil {
		t.Fatalf("cancelled finished goods inspection must allow rebuilt draft: %v", err)
	}
	if draft.ID == replayed.ID {
		t.Fatalf("rebuilt finished goods inspection must create a new row, got id=%d", draft.ID)
	}
	if draft.Status != biz.QualityInspectionStatusDraft ||
		draft.PurchaseReceiptID != 0 ||
		draft.PurchaseReceiptItemID != nil ||
		draft.MaterialID != 0 {
		t.Fatalf("unexpected finished goods draft anchors: %+v", draft)
	}
	if draft.SourceType == nil || *draft.SourceType != biz.QualityInspectionSourceShipment ||
		draft.SourceID == nil || *draft.SourceID != shipment.ID ||
		draft.InspectionType == nil || *draft.InspectionType != biz.QualityInspectionTypeFinishedGoods ||
		draft.SubjectType == nil || *draft.SubjectType != biz.QualityInspectionSubjectProduct ||
		draft.SubjectID == nil || *draft.SubjectID != fixtures.productID {
		t.Fatalf("unexpected finished goods source anchor: %+v", draft)
	}
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)

	submitted, err := inventoryUC.SubmitQualityInspection(ctx, draft.ID)
	if err != nil {
		t.Fatalf("submit finished goods quality inspection failed: %v", err)
	}
	if submitted.Status != biz.QualityInspectionStatusSubmitted ||
		submitted.OriginalLotStatus != biz.InventoryLotActive {
		t.Fatalf("unexpected submitted finished goods inspection: %+v", submitted)
	}
	assertLotStatus(t, ctx, inventoryUC, productLot.ID, biz.InventoryLotHold)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)

	items, total, err := inventoryUC.ListFinishedGoodsQualityInspections(ctx, biz.QualityInspectionFilter{
		SourceID:  shipment.ID,
		SubjectID: fixtures.productID,
		Status:    biz.QualityInspectionStatusSubmitted,
	})
	if err != nil {
		t.Fatalf("list finished goods quality inspections failed: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != draft.ID {
		t.Fatalf("expected one finished goods quality inspection, total=%d items=%+v", total, items)
	}
	if _, _, err := inventoryUC.ListQualityInspections(ctx, biz.QualityInspectionFilter{
		SourceType: biz.QualityInspectionSourceShipment,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("ordinary quality list must reject shipment source, got %v", err)
	}
	if _, err := inventoryUC.CreateQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:   "QI-FG-INCOMING-BLOCKED",
		SourceType:     biz.QualityInspectionSourceShipment,
		SourceID:       shipment.ID,
		InventoryLotID: productLot.ID,
		WarehouseID:    fixtures.warehouseID,
		SubjectID:      fixtures.productID,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("incoming quality path must reject shipment source, got %v", err)
	}

	materialLot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectMaterial, fixtures.materialID, "QI-FG-MATERIAL-LOT")
	if _, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:   "QI-FG-MATERIAL-LOT",
		SourceID:       shipment.ID,
		InventoryLotID: materialLot.ID,
		WarehouseID:    fixtures.warehouseID,
		SubjectID:      fixtures.productID,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("finished goods quality must reject material lot, got %v", err)
	}

	otherProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-QI-FG-OTHER")
	otherProductLot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectProduct, otherProduct.ID, "QI-FG-OTHER-PRODUCT-LOT")
	if _, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:   "QI-FG-NO-SHIPMENT-ITEM",
		SourceID:       shipment.ID,
		InventoryLotID: otherProductLot.ID,
		WarehouseID:    fixtures.warehouseID,
		SubjectID:      otherProduct.ID,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("finished goods quality must require matching shipment item, got %v", err)
	}

	shippedLot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectProduct, fixtures.productID, "QI-FG-SHIPPED-LOT")
	if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		LotID:          &shippedLot.ID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       mustDecimal(t, "1"),
		UnitID:         fixtures.unitID,
		SourceType:     "test_finished_goods_quality",
		IdempotencyKey: "qi-fg-shipped-lot-in",
	}); err != nil {
		t.Fatalf("seed shipped shipment lot inventory failed: %v", err)
	}
	shippedShipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "QI-FG-SHIPPED-SHIP",
			IdempotencyKey: "QI-FG-SHIPPED-SHIP",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				LotID:       &shippedLot.ID,
				Quantity:    mustDecimal(t, "1"),
			},
		},
	})
	if err != nil {
		t.Fatalf("create shipped shipment fixture failed: %v", err)
	}
	submitAndCompleteShipmentReleaseTaskForTest(t, ctx, data, client, shippedShipment.ID)
	if _, err := operationalUC.ShipShipment(ctx, shippedShipment.ID); err != nil {
		t.Fatalf("ship shipment fixture failed: %v", err)
	}
	if _, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo:   "QI-FG-SHIPPED-SHIP",
		SourceID:       shippedShipment.ID,
		InventoryLotID: shippedLot.ID,
		WarehouseID:    fixtures.warehouseID,
		SubjectID:      fixtures.productID,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("finished goods quality must reject non-draft shipment, got %v", err)
	}
}

func TestInventoryRepo_QualityInspectionSubmittedUniquenessAndProtection(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_repo_quality_inspection_uniqueness")

	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(
		data,
		log.NewStdLogger(io.Discard),
	))

	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-UNIQ-RECEIPT", fixtures, stringPtr("QI-UNIQ-LOT"), mustDecimal(t, "8"))
	first := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-FIRST", receipt, fixtures)
	second := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-SECOND", receipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, first.ID); err != nil {
		t.Fatalf("submit first inspection failed: %v", err)
	}
	if _, err := uc.SubmitQualityInspection(ctx, second.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected second submitted inspection for same lot to be rejected, got %v", err)
	}
	if _, err := uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(first.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatalf("pass first inspection failed: %v", err)
	}
	third := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-THIRD", receipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, third.ID); err != nil {
		t.Fatalf("expected historical PASSED inspection to allow new submitted inspection, got %v", err)
	}
	if _, err := uc.CancelQualityInspection(ctx, third.ID, nil); err != nil {
		t.Fatalf("expected submitted third inspection to cancel, got %v", err)
	}
	fourth := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-FOURTH", receipt, fixtures)
	if _, err := uc.SubmitQualityInspection(ctx, fourth.ID); err != nil {
		t.Fatalf("expected historical CANCELLED inspection to allow new submitted inspection, got %v", err)
	}
	if _, err := uc.CancelQualityInspection(ctx, fourth.ID, nil); err != nil {
		t.Fatalf("cancel fourth inspection failed: %v", err)
	}

	disabledReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-UNIQ-DISABLED-RECEIPT", fixtures, stringPtr("QI-UNIQ-DISABLED-LOT"), mustDecimal(t, "2"))
	disabledDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-DISABLED", disabledReceipt, fixtures)
	forceLotStatus(t, ctx, client, *disabledReceipt.Items[0].LotID, biz.InventoryLotDisabled)
	if _, err := uc.SubmitQualityInspection(ctx, disabledDraft.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected DISABLED lot submit to be rejected, got %v", err)
	}
	rejectedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "QI-UNIQ-REJECTED-RECEIPT", fixtures, stringPtr("QI-UNIQ-REJECTED-LOT"), mustDecimal(t, "2"))
	rejectedDraft := createQualityInspectionDraftFromReceipt(t, ctx, uc, "QI-UNIQ-REJECTED", rejectedReceipt, fixtures)
	changeLotToStatus(t, ctx, uc, *rejectedReceipt.Items[0].LotID, biz.InventoryLotRejected)
	if _, err := uc.SubmitQualityInspection(ctx, rejectedDraft.ID); !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
		t.Fatalf("expected REJECTED lot submit to be rejected, got %v", err)
	}

	if err := client.QualityInspection.DeleteOneID(first.ID).Exec(ctx); err == nil {
		t.Fatalf("expected quality inspection delete to be rejected")
	}
	if _, err := client.QualityInspection.UpdateOneID(first.ID).SetStatus(biz.QualityInspectionStatusDraft).Save(ctx); err == nil {
		t.Fatalf("expected direct status update to be rejected")
	}
	if _, err := client.QualityInspection.UpdateOneID(first.ID).SetInspectionNo("QI-UNIQ-FIRST-CHANGED").Save(ctx); err == nil {
		t.Fatalf("expected direct inspection_no update to be rejected")
	}
	if _, err := client.QualityInspection.UpdateOneID(first.ID).SetInspectorID(9001).Save(ctx); err == nil {
		t.Fatalf("expected direct inspector_id update on terminal inspection to be rejected")
	}
}
