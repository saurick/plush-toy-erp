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

func TestPurchaseRejectionDispositionPostsWithoutInventoryAndCancelsDraftReceipt(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_rejection_disposition")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{ReceiptNo: "PR-REJECT-1", SupplierName: "拒收供应商"})
	if err != nil {
		t.Fatal(err)
	}
	item, err := uc.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: receipt.ID, MaterialID: fixtures.materialID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, LotNo: stringPtr("REJECT-LOT-1"), Quantity: decimal.NewFromInt(5), IdempotencyKey: "reject-item-1"})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, err := uc.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, SourceType: biz.QualityInspectionSourcePurchaseReceipt, InspectionType: biz.QualityInspectionTypeIncoming, Limit: 10})
	if err != nil || len(inspections) != 1 || inspections[0].Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("generated inspections=%#v err=%v", inspections, err)
	}
	inspection := inspections[0]
	decision := approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject)
	rejected, err := uc.RejectQualityInspection(ctx, decision)
	if err != nil {
		t.Fatal(err)
	}
	in := &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-1", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(5), Reason: "首次来料不合格退厂", IdempotencyKey: "prd-1", CreatedBy: 1}
	created, err := uc.CreatePurchaseRejectionDisposition(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := uc.CreatePurchaseRejectionDisposition(ctx, in)
	if err != nil || replay.ID != created.ID {
		t.Fatalf("replay=%#v err=%v", replay, err)
	}
	before, _ := client.InventoryTxn.Query().Count(ctx)
	posted, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2})
	if err != nil || posted.Status != biz.PurchaseRejectionStatusPosted {
		t.Fatalf("posted=%#v err=%v", posted, err)
	}
	if replay, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2}); err != nil || replay.ID != posted.ID {
		t.Fatalf("post replay=%#v err=%v", replay, err)
	}
	if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 9}); !errors.Is(err, biz.ErrPurchaseRejectionConflict) {
		t.Fatalf("different-actor post replay err=%v", err)
	}
	if _, err := uc.PostPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: posted.Version + 1, ActorID: 2}); !errors.Is(err, biz.ErrPurchaseRejectionConflict) {
		t.Fatalf("stale post err=%v", err)
	}
	after, _ := client.InventoryTxn.Query().Count(ctx)
	if after != before {
		t.Fatalf("disposition wrote inventory before=%d after=%d", before, after)
	}
	gotReceipt, err := uc.GetPurchaseReceipt(ctx, receipt.ID)
	if err != nil || gotReceipt.Status != biz.PurchaseReceiptStatusCancelled {
		t.Fatalf("receipt=%#v err=%v", gotReceipt, err)
	}
	lot, err := uc.GetInventoryLot(ctx, *item.LotID)
	if err != nil || lot.Status != biz.InventoryLotDisabled {
		t.Fatalf("lot=%#v err=%v", lot, err)
	}
	if _, err := uc.CancelPurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionMutation{ID: posted.ID, ExpectedVersion: posted.Version, ActorID: 3, Reason: "错误撤销"}); !errors.Is(err, biz.ErrPurchaseRejectionSourceState) {
		t.Fatalf("posted cancellation err=%v", err)
	}
}

func TestPurchaseRejectionDispositionRejectsPostedReceiptSource(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "purchase_rejection_posted_source")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-POSTED-REJECT", fixtures, stringPtr("POSTED-REJECT-LOT"), decimal.NewFromInt(2))
	rejected := createRejectedPurchaseReceiptInspection(t, ctx, uc, receipt, "QI-POSTED-REJECT")
	_, err := uc.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-POSTED", QualityInspectionID: rejected.ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "不得复用已入库退货", IdempotencyKey: "prd-posted", CreatedBy: 1})
	if !errors.Is(err, biz.ErrPurchaseRejectionSourceState) {
		t.Fatalf("posted source err=%v", err)
	}
}
