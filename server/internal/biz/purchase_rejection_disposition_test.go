package biz

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
)

func TestPurchaseRejectionDispositionCreateNormalizesIntent(t *testing.T) {
	repo := &purchaseRejectionDispositionUsecaseRepoStub{}
	uc := NewInventoryUsecase(repo)
	got, err := uc.CreatePurchaseRejectionDisposition(context.Background(), &PurchaseRejectionDispositionCreate{
		DispositionNo: " PRD-1 ", QualityInspectionID: 4, DispositionType: " return_to_vendor ", Quantity: decimal.NewFromInt(2), Reason: " 首次拒收 ", IdempotencyKey: " reject-1 ", CreatedBy: 7,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.DispositionNo != "PRD-1" || repo.created.DispositionType != PurchaseRejectionReturnToVendor || repo.created.Reason != "首次拒收" || repo.intentHash == "" {
		t.Fatalf("created=%#v hash=%q", repo.created, repo.intentHash)
	}
}

type purchaseRejectionDispositionUsecaseRepoStub struct {
	InventoryRepo
	created    *PurchaseRejectionDispositionCreate
	intentHash string
}

func (r *purchaseRejectionDispositionUsecaseRepoStub) CreatePurchaseRejectionDisposition(_ context.Context, in *PurchaseRejectionDispositionCreate, hash string) (*PurchaseRejectionDisposition, error) {
	r.created, r.intentHash = in, hash
	return &PurchaseRejectionDisposition{ID: 1, DispositionNo: in.DispositionNo, DispositionType: in.DispositionType, Status: PurchaseRejectionStatusDraft}, nil
}
func (r *purchaseRejectionDispositionUsecaseRepoStub) PostPurchaseRejectionDisposition(context.Context, *PurchaseRejectionDispositionMutation) (*PurchaseRejectionDisposition, error) {
	return nil, nil
}
func (r *purchaseRejectionDispositionUsecaseRepoStub) CancelPurchaseRejectionDisposition(context.Context, *PurchaseRejectionDispositionMutation) (*PurchaseRejectionDisposition, error) {
	return nil, nil
}
func (r *purchaseRejectionDispositionUsecaseRepoStub) GetPurchaseRejectionDisposition(context.Context, int) (*PurchaseRejectionDisposition, error) {
	return nil, nil
}
