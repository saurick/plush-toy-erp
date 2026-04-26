package biz

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type PurchaseReturn struct {
	ID                int
	ReturnNo          string
	PurchaseReceiptID *int
	BusinessRecordID  *int
	SupplierName      string
	Status            string
	ReturnedAt        time.Time
	PostedAt          *time.Time
	Note              *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Items             []*PurchaseReturnItem
}

type PurchaseReturnItem struct {
	ID                    int
	ReturnID              int
	PurchaseReceiptItemID *int
	MaterialID            int
	WarehouseID           int
	UnitID                int
	LotID                 *int
	Quantity              decimal.Decimal
	UnitPrice             *decimal.Decimal
	Amount                *decimal.Decimal
	SourceLineNo          *string
	Note                  *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type PurchaseReturnCreate struct {
	ReturnNo          string
	PurchaseReceiptID *int
	BusinessRecordID  *int
	SupplierName      string
	ReturnedAt        time.Time
	Note              *string
}

type PurchaseReturnItemCreate struct {
	ReturnID              int
	PurchaseReceiptItemID *int
	MaterialID            int
	WarehouseID           int
	UnitID                int
	LotID                 *int
	Quantity              decimal.Decimal
	UnitPrice             *decimal.Decimal
	Amount                *decimal.Decimal
	SourceLineNo          *string
	Note                  *string
}

func (uc *InventoryUsecase) CreatePurchaseReturnDraft(ctx context.Context, in *PurchaseReturnCreate) (*PurchaseReturn, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReturnCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseReturnDraft(ctx, &normalized)
}

func (uc *InventoryUsecase) AddPurchaseReturnItem(ctx context.Context, in *PurchaseReturnItemCreate) (*PurchaseReturnItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReturnItemCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.AddPurchaseReturnItem(ctx, &normalized)
}

func (uc *InventoryUsecase) PostPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error) {
	if uc == nil || uc.repo == nil || returnID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostPurchaseReturn(ctx, returnID)
}

func (uc *InventoryUsecase) CancelPostedPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error) {
	if uc == nil || uc.repo == nil || returnID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedPurchaseReturn(ctx, returnID)
}

func (uc *InventoryUsecase) GetPurchaseReturn(ctx context.Context, id int) (*PurchaseReturn, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetPurchaseReturn(ctx, id)
}

func IsValidPurchaseReturnStatus(value string) bool {
	_, ok := purchaseReturnStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func PurchaseReturnOutboundIdempotencyKey(returnID, itemID int) string {
	return fmt.Sprintf("%s:%d:%d:OUT", PurchaseReturnSourceType, returnID, itemID)
}

func PurchaseReturnReversalIdempotencyKey(returnID, itemID int) string {
	return fmt.Sprintf("%s:%d:%d:REVERSAL", PurchaseReturnSourceType, returnID, itemID)
}

func normalizePurchaseReturnCreate(in PurchaseReturnCreate) (PurchaseReturnCreate, error) {
	in.ReturnNo = strings.TrimSpace(in.ReturnNo)
	in.SupplierName = strings.TrimSpace(in.SupplierName)
	in.Note = normalizeOptionalString(in.Note)
	if in.PurchaseReceiptID != nil && *in.PurchaseReceiptID <= 0 {
		in.PurchaseReceiptID = nil
	}
	if in.BusinessRecordID != nil && *in.BusinessRecordID <= 0 {
		in.BusinessRecordID = nil
	}
	if in.ReturnedAt.IsZero() {
		in.ReturnedAt = time.Now()
	}
	if in.ReturnNo == "" || in.SupplierName == "" {
		return PurchaseReturnCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReturnItemCreate(in PurchaseReturnItemCreate) (PurchaseReturnItemCreate, error) {
	in.SourceLineNo = normalizeOptionalString(in.SourceLineNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.PurchaseReceiptItemID != nil && *in.PurchaseReceiptItemID <= 0 {
		in.PurchaseReceiptItemID = nil
	}
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if in.UnitPrice != nil && in.UnitPrice.Cmp(decimal.Zero) < 0 {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	if in.Amount != nil && in.Amount.Cmp(decimal.Zero) < 0 {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	if in.ReturnID <= 0 ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 ||
		in.Quantity.Cmp(decimal.Zero) <= 0 {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	return in, nil
}
