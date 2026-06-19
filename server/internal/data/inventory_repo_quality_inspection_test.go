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
)

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
	passed, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: draft.ID,
		Result:       biz.QualityInspectionResultPass,
		InspectedAt:  inspectedAt,
		InspectorID:  &inspectorID,
		DecisionNote: stringPtr("合格"),
	})
	if err != nil {
		t.Fatalf("pass quality inspection failed: %v", err)
	}
	if passed.Status != biz.QualityInspectionStatusPassed ||
		passed.Result == nil || *passed.Result != biz.QualityInspectionResultPass ||
		passed.InspectedAt == nil || !passed.InspectedAt.Equal(inspectedAt) ||
		passed.InspectorID == nil || *passed.InspectorID != inspectorID {
		t.Fatalf("unexpected passed state: %+v", passed)
	}
	assertLotStatus(t, ctx, uc, *passItem.LotID, biz.InventoryLotActive)
	assertInventoryTxnCount(t, ctx, client, beforeQualityTxnCount)
	if replay, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: draft.ID}); err != nil || replay.Status != biz.QualityInspectionStatusPassed {
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
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID, DecisionNote: stringPtr("拒收")}); err != nil {
		t.Fatalf("reject quality inspection failed: %v", err)
	}
	rejected, err := uc.GetQualityInspection(ctx, rejectDraft.ID)
	if err != nil {
		t.Fatalf("get rejected inspection failed: %v", err)
	}
	if rejected.Status != biz.QualityInspectionStatusRejected || rejected.Result == nil || *rejected.Result != biz.QualityInspectionResultReject {
		t.Fatalf("unexpected rejected state: %+v", rejected)
	}
	rejectItem := rejectReceipt.Items[0]
	assertLotStatus(t, ctx, uc, *rejectItem.LotID, biz.InventoryLotRejected)
	if replay, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: rejectDraft.ID}); err != nil || replay.Status != biz.QualityInspectionStatusRejected {
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
	if _, err := uc.PassQualityInspection(ctx, &biz.QualityInspectionDecision{InspectionID: first.ID}); err != nil {
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
