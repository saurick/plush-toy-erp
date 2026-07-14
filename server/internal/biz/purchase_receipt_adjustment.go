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

type PurchaseReceiptAdjustment struct {
	ID                int
	AdjustmentNo      string
	PurchaseReceiptID int
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
	AdjustmentNo           string
	PurchaseReceiptID      int
	Reason                 *string
	AdjustedAt             time.Time
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
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

// PurchaseReceiptAdjustmentFromReceiptCreate is the formal aggregate command.
// Material, unit and source grain are derived from the posted receipt item;
// callers provide a destination only for correction-in lines.
type PurchaseReceiptAdjustmentFromReceiptCreate struct {
	AdjustmentNo           string
	PurchaseReceiptID      int
	Reason                 *string
	AdjustedAt             time.Time
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
	Items                  []PurchaseReceiptAdjustmentFromReceiptItemCreate
}

type PurchaseReceiptAdjustmentFromReceiptItemCreate struct {
	PurchaseReceiptItemID int
	AdjustType            string
	Quantity              decimal.Decimal
	WarehouseID           int
	LotID                 *int
	CorrectionGroup       *string
	Note                  *string
}

type PurchaseReceiptAdjustmentFilter struct {
	Status            string
	Keyword           string
	PurchaseReceiptID int
	AdjustType        string
	MaterialID        int
	WarehouseID       int
	LotID             int
	DateFrom          *time.Time
	DateTo            *time.Time
	Limit             int
	Offset            int
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

func (uc *InventoryUsecase) CreatePurchaseReceiptAdjustmentFromReceipt(ctx context.Context, in *PurchaseReceiptAdjustmentFromReceiptCreate) (*PurchaseReceiptAdjustment, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptAdjustmentFromReceiptCreate(*in)
	if err != nil {
		return nil, err
	}
	replayInput := &PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:           normalized.AdjustmentNo,
		PurchaseReceiptID:      normalized.PurchaseReceiptID,
		Reason:                 normalized.Reason,
		AdjustedAt:             normalized.AdjustedAt,
		Note:                   normalized.Note,
		IdempotencyKey:         normalized.IdempotencyKey,
		IdempotencyPayloadHash: normalized.IdempotencyPayloadHash,
	}
	if replayed, found, err := uc.repo.ResolvePurchaseReceiptAdjustmentReplay(ctx, replayInput); err != nil || found {
		return replayed, err
	}
	receipt, err := uc.repo.GetPurchaseReceipt(ctx, normalized.PurchaseReceiptID)
	if err != nil {
		return nil, err
	}
	if receipt == nil || receipt.Status != PurchaseReceiptStatusPosted {
		return nil, ErrBadParam
	}
	header, err := normalizePurchaseReceiptAdjustmentCreate(PurchaseReceiptAdjustmentCreate{
		AdjustmentNo:      normalized.AdjustmentNo,
		PurchaseReceiptID: normalized.PurchaseReceiptID,
		Reason:            normalized.Reason,
		AdjustedAt:        normalized.AdjustedAt,
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
	seen := make(map[string]struct{}, len(normalized.Items))
	items := make([]*PurchaseReceiptAdjustmentItemCreate, 0, len(normalized.Items))
	for _, requested := range normalized.Items {
		requested.AdjustType = strings.ToUpper(strings.TrimSpace(requested.AdjustType))
		source, ok := receiptItems[requested.PurchaseReceiptItemID]
		if requested.PurchaseReceiptItemID <= 0 || !ok {
			return nil, ErrPurchaseReceiptItemNotFound
		}
		key := fmt.Sprintf("%d:%s", requested.PurchaseReceiptItemID, requested.AdjustType)
		if _, duplicate := seen[key]; duplicate {
			return nil, ErrBadParam
		}
		seen[key] = struct{}{}
		warehouseID := source.WarehouseID
		lotID := source.LotID
		switch requested.AdjustType {
		case PurchaseReceiptAdjustmentQuantityIncrease,
			PurchaseReceiptAdjustmentQuantityDecrease,
			PurchaseReceiptAdjustmentLotCorrectionOut,
			PurchaseReceiptAdjustmentWarehouseCorrectionOut:
			if requested.WarehouseID > 0 || requested.LotID != nil {
				return nil, ErrBadParam
			}
		case PurchaseReceiptAdjustmentLotCorrectionIn:
			if requested.WarehouseID > 0 || requested.LotID == nil || *requested.LotID <= 0 {
				return nil, ErrBadParam
			}
			lotID = requested.LotID
		case PurchaseReceiptAdjustmentWarehouseCorrectionIn:
			if requested.WarehouseID <= 0 || requested.LotID != nil {
				return nil, ErrBadParam
			}
			warehouseID = requested.WarehouseID
		default:
			return nil, ErrBadParam
		}
		sourceLineNo := purchaseReceiptAdjustmentSourceLineNo(source, requested.AdjustType)
		item := PurchaseReceiptAdjustmentItemCreate{
			PurchaseReceiptItemID: source.ID,
			AdjustType:            requested.AdjustType,
			MaterialID:            source.MaterialID,
			WarehouseID:           warehouseID,
			UnitID:                source.UnitID,
			LotID:                 lotID,
			Quantity:              requested.Quantity,
			SourceLineNo:          &sourceLineNo,
			CorrectionGroup:       requested.CorrectionGroup,
			Note:                  requested.Note,
		}
		normalized, err := normalizePurchaseReceiptAdjustmentItemCreateForAdjustment(item, false)
		if err != nil {
			return nil, err
		}
		items = append(items, &normalized)
	}
	if err := validatePurchaseReceiptAdjustmentAggregate(items); err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseReceiptAdjustmentWithItems(ctx, &header, items)
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

func (uc *InventoryUsecase) ListPurchaseReceiptAdjustments(ctx context.Context, filter PurchaseReceiptAdjustmentFilter) ([]*PurchaseReceiptAdjustment, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptAdjustmentFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListPurchaseReceiptAdjustments(ctx, normalized)
}

func IsValidPurchaseReceiptAdjustmentStatus(value string) bool {
	return corestatus.IsPurchaseReceiptAdjustmentStatus(value)
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
	if in.AdjustedAt.IsZero() {
		in.AdjustedAt = time.Now()
	}
	if in.AdjustmentNo == "" || in.PurchaseReceiptID <= 0 {
		return PurchaseReceiptAdjustmentCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReceiptAdjustmentItemCreate(in PurchaseReceiptAdjustmentItemCreate) (PurchaseReceiptAdjustmentItemCreate, error) {
	return normalizePurchaseReceiptAdjustmentItemCreateForAdjustment(in, true)
}

func normalizePurchaseReceiptAdjustmentItemCreateForAdjustment(in PurchaseReceiptAdjustmentItemCreate, requireAdjustmentID bool) (PurchaseReceiptAdjustmentItemCreate, error) {
	in.AdjustType = strings.ToUpper(strings.TrimSpace(in.AdjustType))
	in.SourceLineNo = normalizeOptionalString(in.SourceLineNo)
	in.CorrectionGroup = normalizeOptionalString(in.CorrectionGroup)
	in.Note = normalizeOptionalString(in.Note)
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if (requireAdjustmentID && in.AdjustmentID <= 0) ||
		in.PurchaseReceiptItemID <= 0 ||
		!IsValidPurchaseReceiptAdjustmentType(in.AdjustType) ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 {
		return PurchaseReceiptAdjustmentItemCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
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

func purchaseReceiptAdjustmentSourceLineNo(source *PurchaseReceiptItem, adjustType string) string {
	base := fmt.Sprintf("%d", source.ID)
	if source.SourceLineNo != nil && strings.TrimSpace(*source.SourceLineNo) != "" {
		base = strings.TrimSpace(*source.SourceLineNo)
	}
	suffix := ":" + strings.ToUpper(strings.TrimSpace(adjustType))
	if len(base)+len(suffix) > 64 {
		base = base[:64-len(suffix)]
	}
	return base + suffix
}

func validatePurchaseReceiptAdjustmentAggregate(items []*PurchaseReceiptAdjustmentItemCreate) error {
	groups := make(map[string][]*PurchaseReceiptAdjustmentItemCreate)
	for _, item := range items {
		if item == nil {
			return ErrBadParam
		}
		if isPurchaseReceiptCorrectionType(item.AdjustType) {
			if item.CorrectionGroup == nil {
				return ErrBadParam
			}
			groups[*item.CorrectionGroup] = append(groups[*item.CorrectionGroup], item)
		} else if item.CorrectionGroup != nil {
			return ErrBadParam
		}
	}
	for _, pair := range groups {
		if len(pair) != 2 || pair[0].PurchaseReceiptItemID != pair[1].PurchaseReceiptItemID || pair[0].Quantity.Cmp(pair[1].Quantity) != 0 {
			return ErrBadParam
		}
		a, b := pair[0].AdjustType, pair[1].AdjustType
		lotPair := (a == PurchaseReceiptAdjustmentLotCorrectionOut && b == PurchaseReceiptAdjustmentLotCorrectionIn) ||
			(a == PurchaseReceiptAdjustmentLotCorrectionIn && b == PurchaseReceiptAdjustmentLotCorrectionOut)
		warehousePair := (a == PurchaseReceiptAdjustmentWarehouseCorrectionOut && b == PurchaseReceiptAdjustmentWarehouseCorrectionIn) ||
			(a == PurchaseReceiptAdjustmentWarehouseCorrectionIn && b == PurchaseReceiptAdjustmentWarehouseCorrectionOut)
		if !lotPair && !warehousePair {
			return ErrBadParam
		}
	}
	return nil
}

func normalizePurchaseReceiptAdjustmentFilter(in PurchaseReceiptAdjustmentFilter) (PurchaseReceiptAdjustmentFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.AdjustType = strings.ToUpper(strings.TrimSpace(in.AdjustType))
	if in.Status != "" && !IsValidPurchaseReceiptAdjustmentStatus(in.Status) {
		return PurchaseReceiptAdjustmentFilter{}, ErrBadParam
	}
	if in.AdjustType != "" && !IsValidPurchaseReceiptAdjustmentType(in.AdjustType) {
		return PurchaseReceiptAdjustmentFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return PurchaseReceiptAdjustmentFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}
