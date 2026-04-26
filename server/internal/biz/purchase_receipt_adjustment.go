package biz

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type PurchaseReceiptAdjustment struct {
	ID                int
	AdjustmentNo      string
	PurchaseReceiptID int
	BusinessRecordID  *int
	Reason            *string
	Status            string
	AdjustedAt        time.Time
	PostedAt          *time.Time
	Note              *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Items             []*PurchaseReceiptAdjustmentItem
}

type PurchaseReceiptAdjustmentItem struct {
	ID                    int
	AdjustmentID          int
	PurchaseReceiptItemID int
	AdjustType            string
	MaterialID            int
	WarehouseID           int
	UnitID                int
	LotID                 *int
	Quantity              decimal.Decimal
	SourceLineNo          *string
	CorrectionGroup       *string
	Note                  *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type PurchaseReceiptAdjustmentCreate struct {
	AdjustmentNo      string
	PurchaseReceiptID int
	BusinessRecordID  *int
	Reason            *string
	AdjustedAt        time.Time
	Note              *string
}

type PurchaseReceiptAdjustmentItemCreate struct {
	AdjustmentID          int
	PurchaseReceiptItemID int
	AdjustType            string
	MaterialID            int
	WarehouseID           int
	UnitID                int
	LotID                 *int
	Quantity              decimal.Decimal
	SourceLineNo          *string
	CorrectionGroup       *string
	Note                  *string
}

func (uc *InventoryUsecase) CreatePurchaseReceiptAdjustmentDraft(ctx context.Context, in *PurchaseReceiptAdjustmentCreate) (*PurchaseReceiptAdjustment, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptAdjustmentCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseReceiptAdjustmentDraft(ctx, &normalized)
}

func (uc *InventoryUsecase) AddPurchaseReceiptAdjustmentItem(ctx context.Context, in *PurchaseReceiptAdjustmentItemCreate) (*PurchaseReceiptAdjustmentItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptAdjustmentItemCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.AddPurchaseReceiptAdjustmentItem(ctx, &normalized)
}

func (uc *InventoryUsecase) PostPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*PurchaseReceiptAdjustment, error) {
	if uc == nil || uc.repo == nil || adjustmentID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostPurchaseReceiptAdjustment(ctx, adjustmentID)
}

func (uc *InventoryUsecase) CancelPostedPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*PurchaseReceiptAdjustment, error) {
	if uc == nil || uc.repo == nil || adjustmentID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedPurchaseReceiptAdjustment(ctx, adjustmentID)
}

func (uc *InventoryUsecase) GetPurchaseReceiptAdjustment(ctx context.Context, id int) (*PurchaseReceiptAdjustment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetPurchaseReceiptAdjustment(ctx, id)
}

func IsValidPurchaseReceiptAdjustmentStatus(value string) bool {
	_, ok := purchaseReceiptAdjustmentStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsValidPurchaseReceiptAdjustmentType(value string) bool {
	_, ok := purchaseReceiptAdjustmentTypes[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func PurchaseReceiptAdjustmentIdempotencyKey(adjustmentID, itemID int, txnType string) string {
	return fmt.Sprintf("%s:%d:%d:%s", PurchaseReceiptAdjustmentSourceType, adjustmentID, itemID, strings.ToUpper(strings.TrimSpace(txnType)))
}

func PurchaseReceiptAdjustmentReversalIdempotencyKey(adjustmentID, itemID, originalTxnID int) string {
	return fmt.Sprintf("%s:%d:%d:REVERSAL:%d", PurchaseReceiptAdjustmentSourceType, adjustmentID, itemID, originalTxnID)
}

func normalizePurchaseReceiptAdjustmentCreate(in PurchaseReceiptAdjustmentCreate) (PurchaseReceiptAdjustmentCreate, error) {
	in.AdjustmentNo = strings.TrimSpace(in.AdjustmentNo)
	in.Reason = normalizeOptionalString(in.Reason)
	in.Note = normalizeOptionalString(in.Note)
	if in.BusinessRecordID != nil && *in.BusinessRecordID <= 0 {
		in.BusinessRecordID = nil
	}
	if in.AdjustedAt.IsZero() {
		in.AdjustedAt = time.Now()
	}
	if in.AdjustmentNo == "" || in.PurchaseReceiptID <= 0 {
		return PurchaseReceiptAdjustmentCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReceiptAdjustmentItemCreate(in PurchaseReceiptAdjustmentItemCreate) (PurchaseReceiptAdjustmentItemCreate, error) {
	in.AdjustType = strings.ToUpper(strings.TrimSpace(in.AdjustType))
	in.SourceLineNo = normalizeOptionalString(in.SourceLineNo)
	in.CorrectionGroup = normalizeOptionalString(in.CorrectionGroup)
	in.Note = normalizeOptionalString(in.Note)
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if in.AdjustmentID <= 0 ||
		in.PurchaseReceiptItemID <= 0 ||
		!IsValidPurchaseReceiptAdjustmentType(in.AdjustType) ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 ||
		in.Quantity.Cmp(decimal.Zero) <= 0 {
		return PurchaseReceiptAdjustmentItemCreate{}, ErrBadParam
	}
	if isPurchaseReceiptCorrectionType(in.AdjustType) && in.CorrectionGroup == nil {
		return PurchaseReceiptAdjustmentItemCreate{}, ErrBadParam
	}
	return in, nil
}

func isPurchaseReceiptCorrectionType(adjustType string) bool {
	switch strings.ToUpper(strings.TrimSpace(adjustType)) {
	case PurchaseReceiptAdjustmentLotCorrectionOut,
		PurchaseReceiptAdjustmentLotCorrectionIn,
		PurchaseReceiptAdjustmentWarehouseCorrectionOut,
		PurchaseReceiptAdjustmentWarehouseCorrectionIn:
		return true
	default:
		return false
	}
}
