package data

import (
	"errors"
	"io"
	"reflect"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorylotstatusevent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestQualityInspectionCorrectionCompletedReplayUsesImmutableIntent(t *testing.T) {
	for _, outcome := range []string{biz.QualityInspectionResultPass, biz.QualityInspectionResultReject, biz.QualityInspectionResultConcession, "corrected_again", "inbound"} {
		t.Run(outcome, func(t *testing.T) {
			data, client := openInventoryRepoTestData(t, "correction_replay_"+outcome)
			fixtures := createInventoryTestFixtures(t, t.Context(), client)
			testQualityInspectionCorrectionCompletedReplay(t, data, client, fixtures, 17, outcome, outcome)
		})
	}
}

func testQualityInspectionCorrectionCompletedReplay(t *testing.T, data *Data, client *ent.Client, fixtures inventoryTestFixtures, actorID int, key, outcome string) {
	t.Helper()
	ctx := t.Context()
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "PR-QC-REPLAY-" + key, SupplierName: "模拟纠错供应商"})
	if err != nil {
		t.Fatal(err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: fixtures.materialID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, LotNo: stringPtr("QC-REPLAY-" + key), Quantity: decimal.NewFromInt(5), IdempotencyKey: "qc-replay-" + key})
	if err != nil {
		t.Fatal(err)
	}
	inspection := client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receipt.ID)).OnlyX(ctx)
	if _, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatal(err)
	}
	input := biz.QualityInspectionCorrectionCreate{InspectionID: inspection.ID, CorrectionInspectionNo: "QC-RECHECK-" + key, Reason: "仪器校准失效，重新检验"}
	corrected, err := uc.CorrectQualityInspectionResult(ctx, &input, actorID)
	if err != nil {
		t.Fatal(err)
	}
	result := outcome
	if outcome == "corrected_again" || outcome == "inbound" {
		result = biz.QualityInspectionResultPass
	}
	decision := approximateQualityInspectionDecision(corrected.ID, result)
	decision.DecisionNote = stringPtr("复检完成后的判定说明")
	if result == biz.QualityInspectionResultReject {
		_, err = uc.RejectQualityInspection(ctx, decision)
	} else {
		_, err = uc.PassQualityInspection(ctx, decision)
	}
	if err != nil {
		t.Fatal(err)
	}
	if outcome == "corrected_again" {
		if _, err := uc.CorrectQualityInspectionResult(ctx, &biz.QualityInspectionCorrectionCreate{InspectionID: corrected.ID, CorrectionInspectionNo: "QC-AGAIN-" + key, Reason: "再次复核检验条件"}, actorID); err != nil {
			t.Fatal(err)
		}
	}
	if outcome == "inbound" {
		if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
			t.Fatal(err)
		}
	}
	before := entQualityInspectionToBiz(client.QualityInspection.GetX(ctx, corrected.ID))
	originalBefore, err := uc.GetQualityInspection(ctx, inspection.ID)
	if err != nil {
		t.Fatal(err)
	}
	if before.DecisionNote == nil || *before.DecisionNote == input.Reason || originalBefore.SupersededReason == nil || *originalBefore.SupersededReason != input.Reason {
		t.Fatal("fixture must distinguish the frozen correction reason from the later decision note")
	}
	lotBefore := client.InventoryLot.GetX(ctx, *item.LotID)
	eventsBefore := client.InventoryLotStatusEvent.Query().Where(inventorylotstatusevent.InventoryLotID(lotBefore.ID)).CountX(ctx)
	inspectionsBefore := client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receipt.ID)).CountX(ctx)
	txnsBefore := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(receipt.ID)).CountX(ctx)
	for _, padded := range []bool{false, true} {
		retry := input
		if padded {
			retry.CorrectionInspectionNo = " " + retry.CorrectionInspectionNo + " "
			retry.Reason = " " + retry.Reason + " "
		}
		replayed, err := uc.CorrectQualityInspectionResult(ctx, &retry, actorID)
		if err != nil || !reflect.DeepEqual(replayed, before) {
			t.Fatalf("completed correction replay must return the original child unchanged: replay=%+v want=%+v err=%v", replayed, before, err)
		}
	}
	for _, change := range []string{"reason", "decision_note_as_reason", "inspection_no", "actor"} {
		retry, retryActor := input, actorID
		switch change {
		case "reason":
			retry.Reason = "不同纠错原因"
		case "decision_note_as_reason":
			retry.Reason = *before.DecisionNote
		case "inspection_no":
			retry.CorrectionInspectionNo += "-OTHER"
		case "actor":
			retryActor++
		}
		if _, err := uc.CorrectQualityInspectionResult(ctx, &retry, retryActor); !errors.Is(err, biz.ErrIdempotencyConflict) {
			t.Fatalf("changed %s must conflict: %v", change, err)
		}
	}
	after := entQualityInspectionToBiz(client.QualityInspection.GetX(ctx, corrected.ID))
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("replay changed child inspection: %+v", after)
	}
	originalAfter, err := uc.GetQualityInspection(ctx, inspection.ID)
	if err != nil || !reflect.DeepEqual(originalAfter, originalBefore) {
		t.Fatalf("replay changed original evidence: %+v err=%v", originalAfter, err)
	}
	lotAfter := client.InventoryLot.GetX(ctx, lotBefore.ID)
	if lotAfter.Status != lotBefore.Status || lotAfter.Version != lotBefore.Version || !lotAfter.UpdatedAt.Equal(lotBefore.UpdatedAt) ||
		client.InventoryLotStatusEvent.Query().Where(inventorylotstatusevent.InventoryLotID(lotBefore.ID)).CountX(ctx) != eventsBefore ||
		client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receipt.ID)).CountX(ctx) != inspectionsBefore ||
		client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(receipt.ID)).CountX(ctx) != txnsBefore {
		t.Fatal("correction replay must preserve lot, audit, inspection count and stock facts")
	}
}
