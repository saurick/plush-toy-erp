package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPurchaseReturnFromRejectedQualityInspectionDerivesSourceAndPosts(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_return_quality_source")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-QI-RETURN-SOURCE", fixtures, stringPtr("PR-QI-RETURN-LOT"), decimal.NewFromInt(10))
	inspection := createRejectedPurchaseReceiptInspection(t, ctx, uc, receipt, "QI-RETURN-SOURCE")

	in := &biz.PurchaseReturnFromQualityInspectionCreate{
		ReturnNo:            "RET-QI-SOURCE",
		QualityInspectionID: inspection.ID,
		Quantity:            decimal.NewFromInt(3),
		ReturnedAt:          time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC),
		Reason:              "来料尺寸不合格",
		Note:                stringPtr("退回供应商复核"),
		IdempotencyKey:      "RET-QI-SOURCE",
	}
	purchaseReturn, err := uc.CreatePurchaseReturnFromQualityInspection(ctx, in)
	if err != nil {
		t.Fatalf("create purchase return from rejected inspection: %v", err)
	}
	if purchaseReturn.QualityInspectionID == nil || *purchaseReturn.QualityInspectionID != inspection.ID ||
		purchaseReturn.PurchaseReceiptID == nil || *purchaseReturn.PurchaseReceiptID != receipt.ID ||
		purchaseReturn.ReturnReason == nil || *purchaseReturn.ReturnReason != in.Reason ||
		purchaseReturn.SupplierName != receipt.SupplierName || len(purchaseReturn.Items) != 1 {
		t.Fatalf("purchase return source was not derived: %#v", purchaseReturn)
	}
	item := purchaseReturn.Items[0]
	sourceItem := receipt.Items[0]
	if item.PurchaseReceiptItemID == nil || *item.PurchaseReceiptItemID != sourceItem.ID ||
		item.MaterialID != sourceItem.MaterialID || item.WarehouseID != sourceItem.WarehouseID || item.UnitID != sourceItem.UnitID ||
		item.LotID == nil || sourceItem.LotID == nil || *item.LotID != *sourceItem.LotID || item.Quantity.Cmp(in.Quantity) != 0 {
		t.Fatalf("purchase return item source was not derived: %#v", item)
	}
	replayed, err := uc.CreatePurchaseReturnFromQualityInspection(ctx, in)
	if err != nil || replayed.ID != purchaseReturn.ID {
		t.Fatalf("same-intent quality return replay = %#v err=%v", replayed, err)
	}
	conflict := *in
	conflict.ReturnNo = "RET-QI-SOURCE-OTHER"
	conflict.IdempotencyKey = "RET-QI-SOURCE-OTHER"
	if _, err := uc.CreatePurchaseReturnFromQualityInspection(ctx, &conflict); !errors.Is(err, biz.ErrPurchaseReturnQualitySourceConflict) {
		t.Fatalf("second active return error = %v, want quality source conflict", err)
	}
	listed, total, err := uc.ListPurchaseReturns(ctx, biz.PurchaseReturnFilter{QualityInspectionID: inspection.ID, Limit: 20})
	if err != nil || total != 1 || len(listed) != 1 || listed[0].ID != purchaseReturn.ID {
		t.Fatalf("list return by quality source total=%d rows=%#v err=%v", total, listed, err)
	}
	posted, err := uc.PostPurchaseReturn(ctx, purchaseReturn.ID)
	if err != nil || posted.Status != biz.PurchaseReturnStatusPosted {
		t.Fatalf("post quality-sourced purchase return = %#v err=%v", posted, err)
	}
	balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial,
		SubjectID:   sourceItem.MaterialID,
		WarehouseID: sourceItem.WarehouseID,
		LotID:       sourceItem.LotID,
		UnitID:      sourceItem.UnitID,
	})
	if err != nil || balance.Quantity.Cmp(decimal.NewFromInt(7)) != 0 {
		t.Fatalf("quality return inventory balance=%#v err=%v", balance, err)
	}
}

func TestPurchaseReturnFromQualityInspectionRejectsWrongStateAndExcessQuantity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_return_quality_source_rejections")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))

	passedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-QI-RETURN-PASSED", fixtures, stringPtr("PR-QI-RETURN-PASSED-LOT"), decimal.NewFromInt(5))
	passedDraft, err := uc.CreateQualityInspectionFromPurchaseReceipt(ctx, &biz.QualityInspectionFromPurchaseReceiptCreate{
		InspectionNo:          "QI-RETURN-PASSED",
		PurchaseReceiptID:     passedReceipt.ID,
		PurchaseReceiptItemID: passedReceipt.Items[0].ID,
	})
	if err != nil {
		t.Fatalf("create passed-state quality draft: %v", err)
	}
	if _, err := uc.SubmitQualityInspection(ctx, passedDraft.ID); err != nil {
		t.Fatalf("submit passed-state quality draft: %v", err)
	}
	if _, err := uc.PassQualityInspection(ctx, approximateQualityInspectionDecision(passedDraft.ID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatalf("pass quality inspection: %v", err)
	}
	if _, err := uc.CreatePurchaseReturnFromQualityInspection(ctx, &biz.PurchaseReturnFromQualityInspectionCreate{
		ReturnNo:            "RET-QI-PASSED",
		QualityInspectionID: passedDraft.ID,
		Quantity:            decimal.NewFromInt(1),
		ReturnedAt:          time.Date(2026, 7, 14, 10, 0, 0, 0, time.UTC),
		Reason:              "不应创建",
		IdempotencyKey:      "RET-QI-PASSED",
	}); !errors.Is(err, biz.ErrPurchaseReturnQualitySourceState) {
		t.Fatalf("passed inspection return error = %v, want source state", err)
	}

	rejectedReceipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-QI-RETURN-EXCESS", fixtures, stringPtr("PR-QI-RETURN-EXCESS-LOT"), decimal.NewFromInt(5))
	rejected := createRejectedPurchaseReceiptInspection(t, ctx, uc, rejectedReceipt, "QI-RETURN-EXCESS")
	if _, err := uc.CreatePurchaseReturnFromQualityInspection(ctx, &biz.PurchaseReturnFromQualityInspectionCreate{
		ReturnNo:            "RET-QI-EXCESS",
		QualityInspectionID: rejected.ID,
		Quantity:            decimal.NewFromInt(6),
		ReturnedAt:          time.Date(2026, 7, 14, 11, 0, 0, 0, time.UTC),
		Reason:              "超量退货",
		IdempotencyKey:      "RET-QI-EXCESS",
	}); !errors.Is(err, biz.ErrPurchaseReturnQuantityExceeded) {
		t.Fatalf("excess quality return error = %v, want quantity exceeded", err)
	}
}

func createRejectedPurchaseReceiptInspection(
	t *testing.T,
	ctx context.Context,
	uc *biz.InventoryUsecase,
	receipt *biz.PurchaseReceipt,
	inspectionNo string,
) *biz.QualityInspection {
	t.Helper()
	if receipt == nil || len(receipt.Items) != 1 {
		t.Fatalf("rejected quality fixture receipt is incomplete: %#v", receipt)
	}
	draft, err := uc.CreateQualityInspectionFromPurchaseReceipt(ctx, &biz.QualityInspectionFromPurchaseReceiptCreate{
		InspectionNo:          inspectionNo,
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: receipt.Items[0].ID,
	})
	if err != nil {
		t.Fatalf("create rejected quality draft: %v", err)
	}
	if _, err := uc.SubmitQualityInspection(ctx, draft.ID); err != nil {
		t.Fatalf("submit rejected quality draft: %v", err)
	}
	decision := approximateQualityInspectionDecision(draft.ID, biz.QualityInspectionResultReject)
	decision.DecisionNote = stringPtr("来料不合格")
	rejected, err := uc.RejectQualityInspection(ctx, decision)
	if err != nil {
		t.Fatalf("reject quality inspection: %v", err)
	}
	return rejected
}
