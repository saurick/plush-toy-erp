package biz

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type PurchaseReceipt struct {
	ID               int
	ReceiptNo        string
	BusinessRecordID *int
	SupplierName     string
	Status           string
	ReceivedAt       time.Time
	PostedAt         *time.Time
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Items            []*PurchaseReceiptItem
}

type PurchaseReceiptItem struct {
	ID           int
	ReceiptID    int
	MaterialID   int
	WarehouseID  int
	UnitID       int
	LotID        *int
	LotNo        *string
	Quantity     decimal.Decimal
	UnitPrice    *decimal.Decimal
	Amount       *decimal.Decimal
	SourceLineNo *string
	Note         *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type PurchaseReceiptCreate struct {
	ReceiptNo        string
	BusinessRecordID *int
	SupplierName     string
	ReceivedAt       time.Time
	Note             *string
}

type PurchaseReceiptItemCreate struct {
	ReceiptID    int
	MaterialID   int
	WarehouseID  int
	UnitID       int
	LotID        *int
	LotNo        *string
	Quantity     decimal.Decimal
	UnitPrice    *decimal.Decimal
	Amount       *decimal.Decimal
	SourceLineNo *string
	Note         *string
}

func (uc *InventoryUsecase) CreatePurchaseReceiptDraft(ctx context.Context, in *PurchaseReceiptCreate) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseReceiptDraft(ctx, &normalized)
}

func (uc *InventoryUsecase) AddPurchaseReceiptItem(ctx context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptItemCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.AddPurchaseReceiptItem(ctx, &normalized)
}

func (uc *InventoryUsecase) PostPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || receiptID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostPurchaseReceipt(ctx, receiptID)
}

func (uc *InventoryUsecase) CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || receiptID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedPurchaseReceipt(ctx, receiptID)
}

func (uc *InventoryUsecase) GetPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetPurchaseReceipt(ctx, id)
}

func IsValidPurchaseReceiptStatus(value string) bool {
	_, ok := purchaseReceiptStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func PurchaseReceiptInboundIdempotencyKey(receiptID, itemID int) string {
	return fmt.Sprintf("%s:%d:%d:IN", PurchaseReceiptSourceType, receiptID, itemID)
}

func PurchaseReceiptReversalIdempotencyKey(receiptID, itemID int) string {
	return fmt.Sprintf("%s:%d:%d:REVERSAL", PurchaseReceiptSourceType, receiptID, itemID)
}

func normalizePurchaseReceiptCreate(in PurchaseReceiptCreate) (PurchaseReceiptCreate, error) {
	in.ReceiptNo = strings.TrimSpace(in.ReceiptNo)
	in.SupplierName = strings.TrimSpace(in.SupplierName)
	in.Note = normalizeOptionalString(in.Note)
	if in.BusinessRecordID != nil && *in.BusinessRecordID <= 0 {
		in.BusinessRecordID = nil
	}
	if in.ReceivedAt.IsZero() {
		in.ReceivedAt = time.Now()
	}
	if in.ReceiptNo == "" || in.SupplierName == "" {
		return PurchaseReceiptCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReceiptItemCreate(in PurchaseReceiptItemCreate) (PurchaseReceiptItemCreate, error) {
	in.LotNo = normalizeOptionalString(in.LotNo)
	in.SourceLineNo = normalizeOptionalString(in.SourceLineNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if in.UnitPrice != nil && in.UnitPrice.Cmp(decimal.Zero) < 0 {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if in.Amount != nil && in.Amount.Cmp(decimal.Zero) < 0 {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if in.ReceiptID <= 0 ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 ||
		in.Quantity.Cmp(decimal.Zero) <= 0 {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	return in, nil
}
