package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestIncomingAcceptancePartialEvidenceAndCorrection(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "incoming_acceptance")
	runIncomingAcceptanceFlow(t, data, client)
}

func TestPurchaseReceiptPostgresIncomingAcceptance(t *testing.T) {
	data, client := openPurchaseOperationalPostgresTestData(t)
	runIncomingAcceptanceFlow(t, data, client)
}

func runIncomingAcceptanceFlow(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	f := createInventoryPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{unitID: f.unitID, materialID: f.materialID, productID: f.productID, warehouseID: f.warehouseID, productWarehouseID: f.productWarehouseID}
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "IQC-"+f.suffix, decimal.NewFromInt(10))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	declared := decimal.NewFromInt(5)
	in := &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: orderItem.PurchaseOrderID, ReceiptNo: "IQC-" + f.suffix, IdempotencyKey: "iqc-" + f.suffix, Lines: []biz.PurchaseReceiptOrderLine{
		{PurchaseOrderItemID: orderItem.ID, WarehouseID: f.warehouseID, Quantity: decimal.NewFromInt(4), DeclaredQuantity: &declared},
		{PurchaseOrderItemID: orderItem.ID, WarehouseID: f.warehouseID, Quantity: decimal.NewFromInt(2)},
	}}
	before := inventoryTxnCount(t, ctx, client)
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if len(receipt.Items) != 2 || receipt.Items[0].DeclaredQuantity == nil || !receipt.Items[0].DeclaredQuantity.Equal(declared) || receipt.Items[1].DeclaredQuantity != nil {
		t.Fatalf("actual/declared evidence: %+v", receipt.Items)
	}
	assertInventoryTxnCount(t, ctx, client, before)
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); !errors.Is(err, biz.ErrPurchaseReceiptQualityPending) {
		t.Fatalf("unchecked receipt posted: %v", err)
	}
	replayed, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
	if err != nil || replayed.ID != receipt.ID {
		t.Fatalf("replay: %v", err)
	}
	changed := *in
	changed.Lines = append([]biz.PurchaseReceiptOrderLine(nil), in.Lines...)
	changed.Lines[0].Quantity = decimal.NewFromInt(3)
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed replay: %v", err)
	}
	for _, qi := range receipt.QualityInspections {
		decision := approximateQualityInspectionDecision(qi.ID, biz.QualityInspectionResultPass)
		decision.CheckItems = nil
		if _, err := uc.PassQualityInspection(ctx, decision); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("missing evidence: %v", err)
		}
		decision.CheckItems = incomingEvidenceForTest(biz.QualityInspectionResultPass)
		decision.CheckItems[0].Name = "自定义：克重与幅宽"
		decision.CheckItems[0].Scope = "SAMPLE"
		decision.CheckItems[0].Note = "首中尾各抽一段"
		passed, err := uc.PassQualityInspection(ctx, decision)
		if err != nil || len(passed.CheckItems) != 1 || passed.CheckItems[0].Name != decision.CheckItems[0].Name {
			t.Fatalf("persist checks: %+v %v", passed, err)
		}
		if _, err := uc.PassQualityInspection(ctx, decision); err != nil {
			t.Fatalf("repeat decision: %v", err)
		}
		decision.CheckItems[0].Observation = "不同的记录"
		if _, err := uc.PassQualityInspection(ctx, decision); !errors.Is(err, biz.ErrIdempotencyConflict) {
			t.Fatalf("cannot overwrite evidence on retry: %v", err)
		}
	}
	assertInventoryTxnCount(t, ctx, client, before)
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatal(err)
	}
	assertInventoryTxnCount(t, ctx, client, before+2)
	all := biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}
	if _, err := uc.CancelPurchaseReceiptDraft(ctx, receipt.ID, 1, all); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("draft permission reversed posted receipt: %v", err)
	}
	remaining := &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: orderItem.PurchaseOrderID, ReceiptNo: "IQC-NEXT-" + f.suffix, AllRemaining: true, WarehouseID: f.warehouseID}
	next, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, remaining)
	if err != nil || len(next.Items) != 1 || next.Items[0].Quantity.String() != "4" {
		t.Fatalf("partial remainder: %+v %v", next, err)
	}
	if _, err := uc.CancelPurchaseReceiptDraft(ctx, next.ID, 1, biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}); err == nil {
		t.Fatal("scope denied cancellation must fail")
	}
	if _, err := uc.CancelPurchaseReceiptDraft(ctx, next.ID, 1, all); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CancelPurchaseReceiptDraft(ctx, next.ID, 1, all); err != nil {
		t.Fatalf("cancel retry: %v", err)
	}
	qi, err := uc.GetQualityInspection(ctx, next.QualityInspections[0].ID)
	if err != nil || qi.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("cancel didn't close submitted check: %+v %v", qi, err)
	}
	remaining.ReceiptNo = "IQC-CORRECTED-" + f.suffix
	corrected, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, remaining)
	if err != nil || corrected.Items[0].Quantity.String() != "4" {
		t.Fatalf("cancel didn't release reservation: %v", err)
	}
	assertInventoryTxnCount(t, ctx, client, before+2)

	// Downstream lines bind to the receipt item, even when the order line repeats.
	returned, err := uc.CreatePurchaseReturnFromReceipt(ctx, &biz.PurchaseReturnFromReceiptCreate{
		ReturnNo: "IQC-RETURN-" + f.suffix, PurchaseReceiptID: receipt.ID, IdempotencyKey: "iqc-return-" + f.suffix,
		ReturnedAt: time.Now().UTC(),
		Items: []biz.PurchaseReturnFromReceiptItemCreate{
			{PurchaseReceiptItemID: receipt.Items[0].ID, Quantity: decimal.NewFromInt(1)},
			{PurchaseReceiptItemID: receipt.Items[1].ID, Quantity: decimal.NewFromInt(1)},
		},
	})
	if err != nil || len(returned.Items) != 2 {
		t.Fatalf("split-roll return: %+v %v", returned, err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, returned.ID); err != nil {
		t.Fatal(err)
	}
	adjustment, err := uc.CreatePurchaseReceiptAdjustmentFromReceipt(ctx, &biz.PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo: "IQC-ADJUST-" + f.suffix, PurchaseReceiptID: receipt.ID, IdempotencyKey: "iqc-adjust-" + f.suffix,
		AdjustedAt: time.Now().UTC(),
		Items: []biz.PurchaseReceiptAdjustmentFromReceiptItemCreate{
			{PurchaseReceiptItemID: receipt.Items[0].ID, AdjustType: biz.PurchaseReceiptAdjustmentQuantityDecrease, Quantity: decimal.RequireFromString("0.25")},
			{PurchaseReceiptItemID: receipt.Items[1].ID, AdjustType: biz.PurchaseReceiptAdjustmentQuantityDecrease, Quantity: decimal.RequireFromString("0.25")},
		},
	})
	if err != nil || len(adjustment.Items) != 2 {
		t.Fatalf("split-roll adjustment: %+v %v", adjustment, err)
	}
	if _, err := uc.PostPurchaseReceiptAdjustment(ctx, adjustment.ID); err != nil {
		t.Fatal(err)
	}
	assertInventoryTxnCount(t, ctx, client, before+6)
}
