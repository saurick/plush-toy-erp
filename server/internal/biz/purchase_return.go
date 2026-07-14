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

type PurchaseReturn struct {
	ID                  int
	ReturnNo            string
	PurchaseReceiptID   *int
	QualityInspectionID *int
	SupplierName        string
	ReturnReason        *string
	Status              string
	ReturnedAt          time.Time
	PostedAt            *time.Time
	Note                *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	Items               []*PurchaseReturnItem
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
	ReturnNo               string
	PurchaseReceiptID      *int
	QualityInspectionID    *int
	SupplierName           string
	ReturnReason           *string
	ReturnedAt             time.Time
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
}

// PurchaseReturnFromQualityInspectionCreate contains only operator-owned
// fields. Receipt and item grain are derived from the locked rejected incoming
// inspection.
type PurchaseReturnFromQualityInspectionCreate struct {
	ReturnNo               string
	QualityInspectionID    int
	Quantity               decimal.Decimal
	ReturnedAt             time.Time
	Reason                 string
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
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

// PurchaseReturnFromReceiptCreate is the source-driven aggregate command used
// by the formal API. Technical grain fields are derived from the posted receipt
// item so callers cannot return a different material, warehouse, unit or lot.
type PurchaseReturnFromReceiptCreate struct {
	ReturnNo               string
	PurchaseReceiptID      int
	ReturnedAt             time.Time
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
	Items                  []PurchaseReturnFromReceiptItemCreate
}

type PurchaseReturnFromReceiptItemCreate struct {
	PurchaseReceiptItemID int
	Quantity              decimal.Decimal
	Note                  *string
}

type PurchaseReturnFilter struct {
	Status              string
	Keyword             string
	SupplierName        string
	PurchaseReceiptID   int
	QualityInspectionID int
	MaterialID          int
	WarehouseID         int
	LotID               int
	DateFrom            *time.Time
	DateTo              *time.Time
	Limit               int
	Offset              int
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

func (uc *InventoryUsecase) CreatePurchaseReturnFromReceipt(ctx context.Context, in *PurchaseReturnFromReceiptCreate) (*PurchaseReturn, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReturnFromReceiptCreate(*in)
	if err != nil {
		return nil, err
	}
	receiptID := normalized.PurchaseReceiptID
	replayInput := &PurchaseReturnCreate{
		ReturnNo:               normalized.ReturnNo,
		PurchaseReceiptID:      &receiptID,
		ReturnedAt:             normalized.ReturnedAt,
		Note:                   normalized.Note,
		IdempotencyKey:         normalized.IdempotencyKey,
		IdempotencyPayloadHash: normalized.IdempotencyPayloadHash,
	}
	if replayed, found, err := uc.repo.ResolvePurchaseReturnReplay(ctx, replayInput); err != nil || found {
		return replayed, err
	}
	receipt, err := uc.repo.GetPurchaseReceipt(ctx, normalized.PurchaseReceiptID)
	if err != nil {
		return nil, err
	}
	if receipt == nil || receipt.Status != PurchaseReceiptStatusPosted {
		return nil, ErrBadParam
	}
	header, err := normalizePurchaseReturnCreate(PurchaseReturnCreate{
		ReturnNo:          normalized.ReturnNo,
		PurchaseReceiptID: &receiptID,
		SupplierName:      receipt.SupplierName,
		ReturnedAt:        normalized.ReturnedAt,
		Note:              normalized.Note,
	})
	if err != nil {
		return nil, err
	}
	header.IdempotencyKey = normalized.IdempotencyKey
	header.IdempotencyPayloadHash = normalized.IdempotencyPayloadHash
	receiptItems := make(map[int]*PurchaseReceiptItem, len(receipt.Items))
	for _, item := range receipt.Items {
		if item != nil {
			receiptItems[item.ID] = item
		}
	}
	seen := make(map[int]struct{}, len(normalized.Items))
	items := make([]*PurchaseReturnItemCreate, 0, len(normalized.Items))
	for _, requested := range normalized.Items {
		if requested.PurchaseReceiptItemID <= 0 {
			return nil, ErrBadParam
		}
		if _, duplicate := seen[requested.PurchaseReceiptItemID]; duplicate {
			return nil, ErrBadParam
		}
		seen[requested.PurchaseReceiptItemID] = struct{}{}
		source, ok := receiptItems[requested.PurchaseReceiptItemID]
		if !ok {
			return nil, ErrPurchaseReceiptItemNotFound
		}
		sourceID := source.ID
		item := PurchaseReturnItemCreate{
			PurchaseReceiptItemID: &sourceID,
			MaterialID:            source.MaterialID,
			WarehouseID:           source.WarehouseID,
			UnitID:                source.UnitID,
			LotID:                 source.LotID,
			Quantity:              requested.Quantity,
			UnitPrice:             source.UnitPrice,
			SourceLineNo:          source.SourceLineNo,
			Note:                  requested.Note,
		}
		if source.UnitPrice != nil {
			amount := source.UnitPrice.Mul(requested.Quantity)
			item.Amount = &amount
		}
		normalized, err := normalizePurchaseReturnItemCreateForReturn(item, false)
		if err != nil {
			return nil, err
		}
		items = append(items, &normalized)
	}
	return uc.repo.CreatePurchaseReturnWithItems(ctx, &header, items)
}

func (uc *InventoryUsecase) CreatePurchaseReturnFromQualityInspection(ctx context.Context, in *PurchaseReturnFromQualityInspectionCreate) (*PurchaseReturn, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReturnFromQualityInspectionCreate(*in)
	if err != nil {
		return nil, err
	}
	repo, ok := uc.repo.(PurchaseReturnFromQualityInspectionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreatePurchaseReturnFromQualityInspection(ctx, &normalized)
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

func (uc *InventoryUsecase) ListPurchaseReturns(ctx context.Context, filter PurchaseReturnFilter) ([]*PurchaseReturn, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizePurchaseReturnFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListPurchaseReturns(ctx, normalized)
}

func IsValidPurchaseReturnStatus(value string) bool {
	return corestatus.IsPurchaseReturnStatus(value)
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
	in.ReturnReason = normalizeOptionalString(in.ReturnReason)
	if in.PurchaseReceiptID != nil && *in.PurchaseReceiptID <= 0 {
		in.PurchaseReceiptID = nil
	}
	if in.QualityInspectionID != nil && *in.QualityInspectionID <= 0 {
		in.QualityInspectionID = nil
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
	return normalizePurchaseReturnItemCreateForReturn(in, true)
}

func normalizePurchaseReturnItemCreateForReturn(in PurchaseReturnItemCreate, requireReturnID bool) (PurchaseReturnItemCreate, error) {
	in.SourceLineNo = normalizeOptionalString(in.SourceLineNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.PurchaseReceiptItemID != nil && *in.PurchaseReceiptItemID <= 0 {
		in.PurchaseReceiptItemID = nil
	}
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.UnitPrice); err != nil {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.Amount); err != nil {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	if (requireReturnID && in.ReturnID <= 0) ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return PurchaseReturnItemCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReturnFilter(in PurchaseReturnFilter) (PurchaseReturnFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.SupplierName = strings.TrimSpace(in.SupplierName)
	if in.Status != "" && !IsValidPurchaseReturnStatus(in.Status) {
		return PurchaseReturnFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return PurchaseReturnFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}
