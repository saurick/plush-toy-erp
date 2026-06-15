package biz

import (
	"context"
	"fmt"
	"strings"
	"time"

	corestatus "server/internal/core/status"
	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

type PurchaseReceipt struct {
	ID           int
	ReceiptNo    string
	SupplierName string
	Status       string
	ReceivedAt   time.Time
	PostedAt     *time.Time
	Note         *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Items        []*PurchaseReceiptItem
}

type PurchaseReceiptItem struct {
	ID                  int
	ReceiptID           int
	MaterialID          int
	WarehouseID         int
	UnitID              int
	LotID               *int
	PurchaseOrderItemID *int
	LotNo               *string
	Quantity            decimal.Decimal
	UnitPrice           *decimal.Decimal
	Amount              *decimal.Decimal
	SourceLineNo        *string
	Note                *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type PurchaseReceiptCreate struct {
	ReceiptNo    string
	SupplierName string
	ReceivedAt   time.Time
	Note         *string
}

type PurchaseReceiptItemCreate struct {
	ReceiptID           int
	MaterialID          int
	WarehouseID         int
	UnitID              int
	LotID               *int
	PurchaseOrderItemID *int
	LotNo               *string
	Quantity            decimal.Decimal
	UnitPrice           *decimal.Decimal
	Amount              *decimal.Decimal
	SourceLineNo        *string
	Note                *string
}

type PurchaseReceiptFilter struct {
	Status  string
	Keyword string
	Limit   int
	Offset  int
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

func (uc *InventoryUsecase) ListPurchaseReceipts(ctx context.Context, filter PurchaseReceiptFilter) ([]*PurchaseReceipt, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListPurchaseReceipts(ctx, normalized)
}

func IsValidPurchaseReceiptStatus(value string) bool {
	return corestatus.IsPurchaseReceiptStatus(value)
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
	if in.PurchaseOrderItemID != nil && *in.PurchaseOrderItemID <= 0 {
		in.PurchaseOrderItemID = nil
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.UnitPrice); err != nil {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.Amount); err != nil {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if in.ReceiptID <= 0 ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReceiptFilter(in PurchaseReceiptFilter) (PurchaseReceiptFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Status != "" && !IsValidPurchaseReceiptStatus(in.Status) {
		return PurchaseReceiptFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}
