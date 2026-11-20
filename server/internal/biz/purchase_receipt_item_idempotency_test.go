package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestNormalizePurchaseReceiptItemCreateRequiresServerBoundIdempotencyIntent(t *testing.T) {
	base := PurchaseReceiptItemCreate{
		ReceiptID:              11,
		MaterialID:             12,
		WarehouseID:            13,
		UnitID:                 14,
		Quantity:               decimal.RequireFromString("1.00"),
		IdempotencyPayloadHash: "client-must-not-control-this",
	}

	if _, err := normalizePurchaseReceiptItemCreate(base); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing idempotency key error = %v, want ErrBadParam", err)
	}

	base.IdempotencyKey = "  receipt-item-attempt-1  "
	normalized, err := normalizePurchaseReceiptItemCreate(base)
	if err != nil {
		t.Fatalf("normalizePurchaseReceiptItemCreate() error = %v", err)
	}
	if normalized.IdempotencyKey != "receipt-item-attempt-1" {
		t.Fatalf("idempotency key = %q", normalized.IdempotencyKey)
	}
	if len(normalized.IdempotencyPayloadHash) != 64 || normalized.IdempotencyPayloadHash == base.IdempotencyPayloadHash {
		t.Fatalf("server payload hash = %q", normalized.IdempotencyPayloadHash)
	}

	equivalent := base
	equivalent.IdempotencyKey = normalized.IdempotencyKey
	equivalent.Quantity = decimal.RequireFromString("1.0000")
	equivalentNormalized, err := normalizePurchaseReceiptItemCreate(equivalent)
	if err != nil {
		t.Fatalf("normalize equivalent payload error = %v", err)
	}
	if equivalentNormalized.IdempotencyPayloadHash != normalized.IdempotencyPayloadHash {
		t.Fatalf("equivalent decimal payload hashes differ: %q != %q", equivalentNormalized.IdempotencyPayloadHash, normalized.IdempotencyPayloadHash)
	}

	changed := base
	changed.IdempotencyKey = normalized.IdempotencyKey
	changed.Quantity = decimal.RequireFromString("2")
	changedNormalized, err := normalizePurchaseReceiptItemCreate(changed)
	if err != nil {
		t.Fatalf("normalize changed payload error = %v", err)
	}
	if changedNormalized.IdempotencyPayloadHash == normalized.IdempotencyPayloadHash {
		t.Fatal("changed quantity must change the idempotency intent hash")
	}
}

func TestNormalizePurchaseReceiptItemCreateUsesPurchaseOrderLineAsSourceLineTruth(t *testing.T) {
	orderItemID := 22
	firstSourceLine := "client-old-line"
	secondSourceLine := "client-new-line"
	base := PurchaseReceiptItemCreate{
		ReceiptID:           11,
		MaterialID:          12,
		WarehouseID:         13,
		UnitID:              14,
		PurchaseOrderItemID: &orderItemID,
		SourceLineNo:        &firstSourceLine,
		Quantity:            decimal.NewFromInt(1),
		IdempotencyKey:      "receipt-item-attempt-2",
	}
	first, err := normalizePurchaseReceiptItemCreate(base)
	if err != nil {
		t.Fatalf("normalize first linked line error = %v", err)
	}
	base.SourceLineNo = &secondSourceLine
	second, err := normalizePurchaseReceiptItemCreate(base)
	if err != nil {
		t.Fatalf("normalize second linked line error = %v", err)
	}
	if first.SourceLineNo != nil || second.SourceLineNo != nil {
		t.Fatal("linked purchase-order line must not retain a client source_line_no snapshot")
	}
	if first.IdempotencyPayloadHash != second.IdempotencyPayloadHash {
		t.Fatal("client source_line_no must not change a linked purchase-order line intent")
	}
}

func TestAddPurchaseReceiptItemReplaysBeforeCurrentReferenceValidation(t *testing.T) {
	replayed := &PurchaseReceiptItem{ID: 77, ReceiptID: 11}
	repo := &purchaseReceiptItemReplayRepoStub{replayed: replayed}
	uc := NewInventoryUsecase(repo)

	got, err := uc.AddPurchaseReceiptItem(context.Background(), &PurchaseReceiptItemCreate{
		ReceiptID:      11,
		MaterialID:     12,
		WarehouseID:    13,
		UnitID:         14,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "receipt-item-attempt-3",
	})
	if err != nil {
		t.Fatalf("AddPurchaseReceiptItem() error = %v", err)
	}
	if got != replayed {
		t.Fatalf("AddPurchaseReceiptItem() = %#v, want replay %#v", got, replayed)
	}
	if repo.activeReferenceCalled || repo.addCalled {
		t.Fatalf("replay called active validation=%v add=%v", repo.activeReferenceCalled, repo.addCalled)
	}
	if repo.resolveInput == nil || len(repo.resolveInput.IdempotencyPayloadHash) != 64 {
		t.Fatalf("resolver received input = %#v", repo.resolveInput)
	}
}

type purchaseReceiptItemReplayRepoStub struct {
	InventoryRepo
	replayed              *PurchaseReceiptItem
	resolveInput          *PurchaseReceiptItemCreate
	activeReferenceCalled bool
	addCalled             bool
}

func (r *purchaseReceiptItemReplayRepoStub) ResolvePurchaseReceiptItemReplay(_ context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, bool, error) {
	copied := *in
	r.resolveInput = &copied
	return r.replayed, true, nil
}

func (r *purchaseReceiptItemReplayRepoStub) MaterialIsActive(context.Context, int) (bool, error) {
	r.activeReferenceCalled = true
	return false, errors.New("active reference validation must not run during replay")
}

func (r *purchaseReceiptItemReplayRepoStub) WarehouseIsActive(context.Context, int) (bool, error) {
	r.activeReferenceCalled = true
	return false, errors.New("active reference validation must not run during replay")
}

func (r *purchaseReceiptItemReplayRepoStub) UnitIsActive(context.Context, int) (bool, error) {
	r.activeReferenceCalled = true
	return false, errors.New("active reference validation must not run during replay")
}

func (r *purchaseReceiptItemReplayRepoStub) AddPurchaseReceiptItem(context.Context, *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, error) {
	r.addCalled = true
	return nil, errors.New("add must not run during replay")
}
