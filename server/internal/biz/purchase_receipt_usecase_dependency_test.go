package biz

import (
	"context"
	"testing"
	"time"
)

type receiptOnlyRepo struct {
	PurchaseReceiptRepo
	receipt         *PurchaseReceipt
	created         *PurchaseReceiptFromPurchaseOrderCreate
	creates         int
	warehouseChecks int
	active          bool
}

func (*receiptOnlyRepo) GetSupplier(context.Context, int) (*Supplier, error) {
	return nil, ErrSupplierNotFound
}
func (*receiptOnlyRepo) MaterialIsActive(context.Context, int) (bool, error) { return true, nil }
func (*receiptOnlyRepo) ProductIsActive(context.Context, int) (bool, error)  { return true, nil }
func (*receiptOnlyRepo) UnitIsActive(context.Context, int) (bool, error)     { return true, nil }
func (r *receiptOnlyRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	r.warehouseChecks++
	return r.active, nil
}
func (r *receiptOnlyRepo) ResolvePurchaseReceiptFromPurchaseOrderReplay(context.Context, *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, bool, error) {
	return r.receipt, r.receipt != nil, nil
}
func (r *receiptOnlyRepo) CreatePurchaseReceiptFromPurchaseOrder(_ context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, error) {
	r.creates++
	copy := *in
	r.created = &copy
	r.receipt = &PurchaseReceipt{ID: 7, ReceiptNo: in.ReceiptNo, Status: PurchaseReceiptStatusDraft}
	return r.receipt, nil
}

func TestPurchaseReceiptUsecaseFocusedDependencyPreservesReplayBeforeReferenceValidation(t *testing.T) {
	repo := &receiptOnlyRepo{active: true}
	if _, broad := any(repo).(InventoryRepo); broad {
		t.Fatal("receipt fixture must not require BOM, ledger or quality capabilities")
	}
	uc := NewPurchaseReceiptUsecase(repo)
	note := "  source arrival  "
	in := &PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: 8, ReceiptNo: " PR-7 ", WarehouseID: 4,
		AllRemaining: true, ReceivedAt: time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC),
		IdempotencyKey: "focused-receipt", Note: &note,
	}
	first, err := uc.CreatePurchaseReceiptFromPurchaseOrder(t.Context(), in)
	if err != nil || first == nil || repo.creates != 1 || repo.warehouseChecks != 1 {
		t.Fatalf("first receipt=%+v creates=%d checks=%d err=%v", first, repo.creates, repo.warehouseChecks, err)
	}
	if repo.created.ReceiptNo != "PR-7" || repo.created.Note == nil || *repo.created.Note != "source arrival" || repo.created.IdempotencyPayloadHash == "" || note != "  source arrival  " {
		t.Fatalf("receipt intent normalization changed: %+v", repo.created)
	}
	repo.active = false
	replayed, err := uc.CreatePurchaseReceiptFromPurchaseOrder(t.Context(), in)
	if err != nil || replayed != first || repo.creates != 1 || repo.warehouseChecks != 1 {
		t.Fatalf("settled receipt was revalidated or repeated: %+v %v", replayed, err)
	}
}
