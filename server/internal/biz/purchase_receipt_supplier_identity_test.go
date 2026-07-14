package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestInventoryUsecase_PurchaseReceiptSupplierIdentityValidation(t *testing.T) {
	ctx := context.Background()
	supplierID := 8
	repo := &purchaseReceiptSupplierIdentityRepoStub{
		supplier: &Supplier{ID: supplierID, Name: "来源供应商", IsActive: true},
	}
	uc := NewInventoryUsecase(repo)

	created, err := uc.CreatePurchaseReceiptDraft(ctx, &PurchaseReceiptCreate{
		ReceiptNo:    "PR-SUPPLIER-NIL",
		SupplierName: "手工快照",
		ReceivedAt:   time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
	})
	if err != nil || created.SupplierID != nil || repo.supplierLookups != 0 {
		t.Fatalf("manual receipt without supplier identity = receipt=%#v lookups=%d err=%v", created, repo.supplierLookups, err)
	}

	created, err = uc.CreatePurchaseReceiptDraft(ctx, &PurchaseReceiptCreate{
		ReceiptNo:    "PR-SUPPLIER-LINKED",
		SupplierID:   &supplierID,
		SupplierName: "来源供应商",
		ReceivedAt:   time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
	})
	if err != nil || created.SupplierID == nil || *created.SupplierID != supplierID || repo.supplierLookups != 1 {
		t.Fatalf("linked manual receipt = receipt=%#v lookups=%d err=%v", created, repo.supplierLookups, err)
	}

	if _, err := uc.CreatePurchaseReceiptDraft(ctx, &PurchaseReceiptCreate{
		ReceiptNo:    "PR-SUPPLIER-MISMATCH",
		SupplierID:   &supplierID,
		SupplierName: "伪造快照",
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("mismatched supplier snapshot error=%v, want ErrBadParam", err)
	}

	repo.supplier.IsActive = false
	if _, err := uc.CreatePurchaseReceiptDraft(ctx, &PurchaseReceiptCreate{
		ReceiptNo:    "PR-SUPPLIER-INACTIVE",
		SupplierID:   &supplierID,
		SupplierName: "来源供应商",
	}); !errors.Is(err, ErrSupplierInactive) {
		t.Fatalf("inactive supplier error=%v, want ErrSupplierInactive", err)
	}

	missingID := 999
	if _, err := uc.CreatePurchaseReceiptDraft(ctx, &PurchaseReceiptCreate{
		ReceiptNo:    "PR-SUPPLIER-MISSING",
		SupplierID:   &missingID,
		SupplierName: "不存在",
	}); !errors.Is(err, ErrSupplierNotFound) {
		t.Fatalf("missing supplier error=%v, want ErrSupplierNotFound", err)
	}
}

type purchaseReceiptSupplierIdentityRepoStub struct {
	InventoryRepo
	supplier        *Supplier
	supplierLookups int
}

func (r *purchaseReceiptSupplierIdentityRepoStub) GetSupplier(_ context.Context, id int) (*Supplier, error) {
	r.supplierLookups++
	if r.supplier == nil || r.supplier.ID != id {
		return nil, ErrSupplierNotFound
	}
	copy := *r.supplier
	return &copy, nil
}

func (r *purchaseReceiptSupplierIdentityRepoStub) CreatePurchaseReceiptDraft(_ context.Context, in *PurchaseReceiptCreate) (*PurchaseReceipt, error) {
	return &PurchaseReceipt{
		ID:           1,
		ReceiptNo:    in.ReceiptNo,
		SupplierID:   in.SupplierID,
		SupplierName: in.SupplierName,
		Status:       PurchaseReceiptStatusDraft,
	}, nil
}
