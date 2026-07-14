package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestInventoryUsecase_PurchaseReturnFromReceiptDerivesSourceGrain(t *testing.T) {
	lotID := 31
	unitPrice := decimal.RequireFromString("2.5")
	sourceLine := "7"
	repo := &purchaseCorrectionAggregateRepoStub{receipt: &PurchaseReceipt{
		ID:           10,
		ReceiptNo:    "PR-10",
		SupplierName: "来源供应商",
		Status:       PurchaseReceiptStatusPosted,
		Items: []*PurchaseReceiptItem{{
			ID:           11,
			ReceiptID:    10,
			MaterialID:   12,
			WarehouseID:  13,
			UnitID:       14,
			LotID:        &lotID,
			UnitPrice:    &unitPrice,
			SourceLineNo: &sourceLine,
		}},
	}}
	uc := NewInventoryUsecase(repo)
	created, err := uc.CreatePurchaseReturnFromReceipt(context.Background(), &PurchaseReturnFromReceiptCreate{
		ReturnNo:          " RET-10 ",
		PurchaseReceiptID: 10,
		ReturnedAt:        time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
		IdempotencyKey:    "return-10",
		Items: []PurchaseReturnFromReceiptItemCreate{{
			PurchaseReceiptItemID: 11,
			Quantity:              decimal.RequireFromString("3"),
		}},
	})
	if err != nil {
		t.Fatalf("create source-driven return failed: %v", err)
	}
	if created == nil || repo.returnHeader == nil || len(repo.returnItems) != 1 {
		t.Fatalf("aggregate was not forwarded: created=%#v header=%#v items=%#v", created, repo.returnHeader, repo.returnItems)
	}
	item := repo.returnItems[0]
	if repo.returnHeader.ReturnNo != "RET-10" || repo.returnHeader.SupplierName != "来源供应商" || repo.returnHeader.PurchaseReceiptID == nil || *repo.returnHeader.PurchaseReceiptID != 10 {
		t.Fatalf("return header not derived from source: %#v", repo.returnHeader)
	}
	if item.PurchaseReceiptItemID == nil || *item.PurchaseReceiptItemID != 11 || item.MaterialID != 12 || item.WarehouseID != 13 || item.UnitID != 14 || item.LotID == nil || *item.LotID != lotID {
		t.Fatalf("return item grain not derived from source: %#v", item)
	}
	if item.Amount == nil || !item.Amount.Equal(decimal.RequireFromString("7.5")) {
		t.Fatalf("return amount=%v, want 7.5", item.Amount)
	}
	if len(repo.returnHeader.IdempotencyPayloadHash) != 64 || repo.returnHeader.IdempotencyKey != "return-10" {
		t.Fatalf("return idempotency bundle was not server-derived: %#v", repo.returnHeader)
	}

	_, err = uc.CreatePurchaseReturnFromReceipt(context.Background(), &PurchaseReturnFromReceiptCreate{
		ReturnNo:          "RET-DUP",
		PurchaseReceiptID: 10,
		ReturnedAt:        time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
		IdempotencyKey:    "return-dup",
		Items: []PurchaseReturnFromReceiptItemCreate{
			{PurchaseReceiptItemID: 11, Quantity: decimal.NewFromInt(1)},
			{PurchaseReceiptItemID: 11, Quantity: decimal.NewFromInt(1)},
		},
	})
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("duplicate source lines must be rejected, got %v", err)
	}
}

func TestInventoryUsecase_PurchaseReceiptAdjustmentFromReceiptDerivesAndValidatesGrain(t *testing.T) {
	lotID := 41
	repo := &purchaseCorrectionAggregateRepoStub{receipt: &PurchaseReceipt{
		ID:           20,
		ReceiptNo:    "PR-20",
		SupplierName: "调整供应商",
		Status:       PurchaseReceiptStatusPosted,
		Items: []*PurchaseReceiptItem{{
			ID:          21,
			ReceiptID:   20,
			MaterialID:  22,
			WarehouseID: 23,
			UnitID:      24,
			LotID:       &lotID,
		}},
	}}
	uc := NewInventoryUsecase(repo)
	created, err := uc.CreatePurchaseReceiptAdjustmentFromReceipt(context.Background(), &PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo:      "ADJ-20",
		PurchaseReceiptID: 20,
		AdjustedAt:        time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
		IdempotencyKey:    "adjustment-20",
		Items: []PurchaseReceiptAdjustmentFromReceiptItemCreate{{
			PurchaseReceiptItemID: 21,
			AdjustType:            PurchaseReceiptAdjustmentQuantityDecrease,
			Quantity:              decimal.NewFromInt(2),
		}},
	})
	if err != nil {
		t.Fatalf("create source-driven adjustment failed: %v", err)
	}
	if created == nil || repo.adjustmentHeader == nil || len(repo.adjustmentItems) != 1 {
		t.Fatalf("adjustment aggregate was not forwarded: created=%#v header=%#v items=%#v", created, repo.adjustmentHeader, repo.adjustmentItems)
	}
	item := repo.adjustmentItems[0]
	if item.MaterialID != 22 || item.WarehouseID != 23 || item.UnitID != 24 || item.LotID == nil || *item.LotID != lotID {
		t.Fatalf("adjustment grain not derived from source: %#v", item)
	}
	if len(repo.adjustmentHeader.IdempotencyPayloadHash) != 64 || repo.adjustmentHeader.IdempotencyKey != "adjustment-20" {
		t.Fatalf("adjustment idempotency bundle was not server-derived: %#v", repo.adjustmentHeader)
	}

	group := "LOT-FIX"
	_, err = uc.CreatePurchaseReceiptAdjustmentFromReceipt(context.Background(), &PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo:      "ADJ-INCOMPLETE",
		PurchaseReceiptID: 20,
		AdjustedAt:        time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
		IdempotencyKey:    "adjustment-incomplete",
		Items: []PurchaseReceiptAdjustmentFromReceiptItemCreate{{
			PurchaseReceiptItemID: 21,
			AdjustType:            PurchaseReceiptAdjustmentLotCorrectionOut,
			Quantity:              decimal.NewFromInt(1),
			CorrectionGroup:       &group,
		}},
	})
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("incomplete correction pair must be rejected, got %v", err)
	}
}

func TestPurchaseCorrectionIntentHashesCanonicalizeOrderAndTransportFormatting(t *testing.T) {
	instant := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	returnA, err := normalizePurchaseReturnFromReceiptCreate(PurchaseReturnFromReceiptCreate{
		ReturnNo:          " RET-HASH ",
		PurchaseReceiptID: 10,
		ReturnedAt:        instant,
		IdempotencyKey:    " return-hash ",
		Items: []PurchaseReturnFromReceiptItemCreate{
			{PurchaseReceiptItemID: 12, Quantity: decimal.RequireFromString("2.000000")},
			{PurchaseReceiptItemID: 11, Quantity: decimal.RequireFromString("1.0")},
		},
	})
	if err != nil {
		t.Fatalf("normalize first return intent: %v", err)
	}
	returnB, err := normalizePurchaseReturnFromReceiptCreate(PurchaseReturnFromReceiptCreate{
		ReturnNo:          "RET-HASH",
		PurchaseReceiptID: 10,
		ReturnedAt:        instant.In(time.FixedZone("UTC+8", 8*60*60)),
		IdempotencyKey:    "return-hash",
		Items: []PurchaseReturnFromReceiptItemCreate{
			{PurchaseReceiptItemID: 11, Quantity: decimal.RequireFromString("1")},
			{PurchaseReceiptItemID: 12, Quantity: decimal.RequireFromString("2")},
		},
	})
	if err != nil || returnA.IdempotencyPayloadHash != returnB.IdempotencyPayloadHash {
		t.Fatalf("equivalent return intents must hash equally: a=%s b=%s err=%v", returnA.IdempotencyPayloadHash, returnB.IdempotencyPayloadHash, err)
	}

	group := "LOT-HASH"
	destinationLotID := 99
	adjustmentA, err := normalizePurchaseReceiptAdjustmentFromReceiptCreate(PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo:      " ADJ-HASH ",
		PurchaseReceiptID: 20,
		AdjustedAt:        instant,
		IdempotencyKey:    " adjustment-hash ",
		Items: []PurchaseReceiptAdjustmentFromReceiptItemCreate{
			{PurchaseReceiptItemID: 21, AdjustType: PurchaseReceiptAdjustmentLotCorrectionIn, Quantity: decimal.RequireFromString("1.000"), LotID: &destinationLotID, CorrectionGroup: &group},
			{PurchaseReceiptItemID: 21, AdjustType: PurchaseReceiptAdjustmentLotCorrectionOut, Quantity: decimal.RequireFromString("1"), CorrectionGroup: &group},
		},
	})
	if err != nil {
		t.Fatalf("normalize first adjustment intent: %v", err)
	}
	adjustmentB, err := normalizePurchaseReceiptAdjustmentFromReceiptCreate(PurchaseReceiptAdjustmentFromReceiptCreate{
		AdjustmentNo:      "ADJ-HASH",
		PurchaseReceiptID: 20,
		AdjustedAt:        instant.In(time.FixedZone("UTC-5", -5*60*60)),
		IdempotencyKey:    "adjustment-hash",
		Items: []PurchaseReceiptAdjustmentFromReceiptItemCreate{
			{PurchaseReceiptItemID: 21, AdjustType: PurchaseReceiptAdjustmentLotCorrectionOut, Quantity: decimal.RequireFromString("1.0"), CorrectionGroup: &group},
			{PurchaseReceiptItemID: 21, AdjustType: PurchaseReceiptAdjustmentLotCorrectionIn, Quantity: decimal.RequireFromString("1"), LotID: &destinationLotID, CorrectionGroup: &group},
		},
	})
	if err != nil || adjustmentA.IdempotencyPayloadHash != adjustmentB.IdempotencyPayloadHash {
		t.Fatalf("equivalent adjustment intents must hash equally: a=%s b=%s err=%v", adjustmentA.IdempotencyPayloadHash, adjustmentB.IdempotencyPayloadHash, err)
	}
}

type purchaseCorrectionAggregateRepoStub struct {
	InventoryRepo
	receipt          *PurchaseReceipt
	returnHeader     *PurchaseReturnCreate
	returnItems      []*PurchaseReturnItemCreate
	adjustmentHeader *PurchaseReceiptAdjustmentCreate
	adjustmentItems  []*PurchaseReceiptAdjustmentItemCreate
}

func (r *purchaseCorrectionAggregateRepoStub) GetPurchaseReceipt(_ context.Context, id int) (*PurchaseReceipt, error) {
	if r.receipt == nil || r.receipt.ID != id {
		return nil, ErrPurchaseReceiptNotFound
	}
	return r.receipt, nil
}

func (r *purchaseCorrectionAggregateRepoStub) ResolvePurchaseReturnReplay(_ context.Context, _ *PurchaseReturnCreate) (*PurchaseReturn, bool, error) {
	return nil, false, nil
}

func (r *purchaseCorrectionAggregateRepoStub) ResolvePurchaseReceiptAdjustmentReplay(_ context.Context, _ *PurchaseReceiptAdjustmentCreate) (*PurchaseReceiptAdjustment, bool, error) {
	return nil, false, nil
}

func (r *purchaseCorrectionAggregateRepoStub) CreatePurchaseReturnWithItems(_ context.Context, in *PurchaseReturnCreate, items []*PurchaseReturnItemCreate) (*PurchaseReturn, error) {
	r.returnHeader = in
	r.returnItems = items
	return &PurchaseReturn{ID: 101, ReturnNo: in.ReturnNo, Status: PurchaseReturnStatusDraft, Items: []*PurchaseReturnItem{{ID: 102}}}, nil
}

func (r *purchaseCorrectionAggregateRepoStub) CreatePurchaseReceiptAdjustmentWithItems(_ context.Context, in *PurchaseReceiptAdjustmentCreate, items []*PurchaseReceiptAdjustmentItemCreate) (*PurchaseReceiptAdjustment, error) {
	r.adjustmentHeader = in
	r.adjustmentItems = items
	return &PurchaseReceiptAdjustment{ID: 201, AdjustmentNo: in.AdjustmentNo, Status: PurchaseReceiptAdjustmentStatusDraft, Items: []*PurchaseReceiptAdjustmentItem{{ID: 202}}}, nil
}
