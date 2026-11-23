package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

var (
	ErrBOMRecordConflict  = errors.New("bom record constraint conflict")
	ErrBOMHeaderNotFound  = errors.New("bom header not found")
	ErrBOMItemNotFound    = errors.New("bom item not found")
	ErrBOMActiveImmutable = errors.New("active bom must be copied before edit")
	ErrBOMActiveConflict  = errors.New("another bom version is active")
	ErrBOMVersionConflict = errors.New("bom version conflict")
)

const (
	BOMStatusDraft    = "DRAFT"
	BOMStatusActive   = "ACTIVE"
	BOMStatusArchived = "ARCHIVED"
)

var bomStatuses = map[string]struct{}{
	BOMStatusDraft:    {},
	BOMStatusActive:   {},
	BOMStatusArchived: {},
}

type BOMHeader struct {
	ID            int
	ProductID     int
	Version       string
	Status        string
	ItemCount     *int // List-only projection; nil when the count was not loaded.
	SourceOrderNo *string
	QuantityText  *string
	SpareText     *string
	PrintDate     *time.Time
	Designer      *string
	Maker         *string
	Auditor       *string
	HairDirection *string
	Note          *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	// EditVersion is an internal optimistic-lock token derived from UpdatedAt.
	// Version remains the business-facing BOM version string.
	EditVersion int64
}

type BOMItem struct {
	ID                 int
	BOMHeaderID        int
	MaterialID         int
	Quantity           decimal.Decimal
	UnitID             int
	LossRate           decimal.Decimal
	Position           *string
	PieceCount         *string
	TotalUsageSnapshot *string
	SourceSnapshot     map[string]any
	ProcessBase        *string
	ProcessMethod      *string
	Note               *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type BOMHeaderCreate struct {
	ProductID     int
	Status        string
	SourceOrderNo *string
	QuantityText  *string
	SpareText     *string
	PrintDate     *time.Time
	Designer      *string
	Maker         *string
	Auditor       *string
	HairDirection *string
	Note          *string
}

type BOMHeaderUpdate struct {
	SourceOrderNo *string
	QuantityText  *string
	SpareText     *string
	PrintDate     *time.Time
	Designer      *string
	Maker         *string
	Auditor       *string
	HairDirection *string
	Note          *string
}

type BOMItemUpdate struct {
	MaterialID         int
	Quantity           decimal.Decimal
	UnitID             int
	LossRate           decimal.Decimal
	Position           *string
	PieceCount         *string
	TotalUsageSnapshot *string
	SourceSnapshot     map[string]any
	ProcessBase        *string
	ProcessMethod      *string
	Note               *string
}

type BOMVersionMutation struct {
	ExpectedVersion int64
	ProductID       int
	BOMHeaderUpdate
}

type BOMItemSaveMutation struct {
	ID int
	BOMItemUpdate
}

type BOMHeaderFilter struct {
	ProductID      int
	Status         string
	LifecycleScope string
	Keyword        string
	Limit          int
	Offset         int
}

type BOMVersionDetail struct {
	Header *BOMHeader
	Items  []*BOMItem
}

type BOMAggregateSaveRepo interface {
	SaveBOMWithItems(ctx context.Context, id int, in *BOMVersionMutation, items []*BOMItemSaveMutation) (*BOMVersionDetail, error)
}

type BOMRepo interface {
	ListBOMHeaders(ctx context.Context, filter BOMHeaderFilter) ([]*BOMHeader, int, error)
	GetBOMHeader(ctx context.Context, id int) (*BOMHeader, error)
	ListBOMItemsByHeader(ctx context.Context, bomHeaderID int) ([]*BOMItem, error)
	ListBOMItemsByProduct(ctx context.Context, productID int) ([]*BOMItem, error)
	GetActiveBOMByProduct(ctx context.Context, productID int) (*BOMHeader, error)
	CopyBOMVersion(ctx context.Context, sourceHeaderID int, in *BOMHeaderCreate) (*BOMVersionDetail, error)
	ActivateBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error)
	ArchiveBOMVersion(ctx context.Context, id int) (*BOMHeader, error)
	MaterialIsActive(ctx context.Context, id int) (bool, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
}

type BOMUsecase struct {
	repo BOMRepo
}

func NewBOMUsecase(repo BOMRepo) *BOMUsecase {
	return &BOMUsecase{repo: repo}
}

func (uc *BOMUsecase) SaveBOMWithItems(ctx context.Context, id int, in *BOMVersionMutation, items []*BOMItemSaveMutation) (*BOMVersionDetail, error) {
	if uc == nil || uc.repo == nil || in == nil || id < 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(BOMAggregateSaveRepo)
	if !ok {
		return nil, ErrBadParam
	}

	normalizedHeader := normalizeBOMHeaderUpdate(in.BOMHeaderUpdate)
	normalized := &BOMVersionMutation{
		ExpectedVersion: in.ExpectedVersion,
		ProductID:       in.ProductID,
		BOMHeaderUpdate: normalizedHeader,
	}
	if normalized.ProductID <= 0 {
		return nil, ErrBadParam
	}
	if id == 0 {
		if normalized.ExpectedVersion != 0 {
			return nil, ErrBadParam
		}
		if err := requireActiveReference(ctx, normalized.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
			return nil, err
		}
	} else {
		if normalized.ExpectedVersion <= 0 {
			return nil, ErrBadParam
		}
		current, err := uc.repo.GetBOMHeader(ctx, id)
		if err != nil {
			return nil, err
		}
		if current.Status != BOMStatusDraft {
			return nil, ErrBOMActiveImmutable
		}
		if current.ProductID != normalized.ProductID {
			return nil, ErrBadParam
		}
		if err := requireActiveReference(ctx, normalized.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
			return nil, err
		}
	}

	normalizedItems := make([]*BOMItemSaveMutation, 0, len(items))
	seenIDs := make(map[int]struct{}, len(items))
	for _, item := range items {
		if item == nil || item.ID < 0 {
			return nil, ErrBadParam
		}
		if item.ID > 0 {
			if id == 0 {
				return nil, ErrBadParam
			}
			if _, duplicate := seenIDs[item.ID]; duplicate {
				return nil, ErrBadParam
			}
			seenIDs[item.ID] = struct{}{}
		}
		normalizedItem, err := normalizeBOMItemUpdate(item.BOMItemUpdate)
		if err != nil {
			return nil, err
		}
		if !BOMSourceTotalIsCurrent(normalizedItem, normalized.QuantityText) {
			normalizedItem.TotalUsageSnapshot = nil
		}
		if err := uc.validateBOMItemActiveReferences(ctx, normalizedItem.MaterialID, normalizedItem.UnitID); err != nil {
			return nil, err
		}
		normalizedItems = append(normalizedItems, &BOMItemSaveMutation{
			ID:            item.ID,
			BOMItemUpdate: normalizedItem,
		})
	}
	return repo.SaveBOMWithItems(ctx, id, normalized, normalizedItems)
}

func (uc *BOMUsecase) ListBOMHeaders(ctx context.Context, filter BOMHeaderFilter) ([]*BOMHeader, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeBOMHeaderFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListBOMHeaders(ctx, normalized)
}

func (uc *BOMUsecase) GetBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	header, err := uc.repo.GetBOMHeader(ctx, id)
	if err != nil {
		return nil, err
	}
	items, err := uc.repo.ListBOMItemsByHeader(ctx, id)
	if err != nil {
		return nil, err
	}
	return &BOMVersionDetail{Header: header, Items: items}, nil
}

func (uc *BOMUsecase) ListBOMItemsByProduct(ctx context.Context, productID int) ([]*BOMItem, error) {
	if uc == nil || uc.repo == nil || productID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ListBOMItemsByProduct(ctx, productID)
}

func (uc *BOMUsecase) GetActiveBOMByProduct(ctx context.Context, productID int) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || productID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetActiveBOMByProduct(ctx, productID)
}

func (uc *BOMUsecase) CopyBOMVersion(ctx context.Context, sourceHeaderID int, in *BOMHeaderCreate) (*BOMVersionDetail, error) {
	if uc == nil || uc.repo == nil || in == nil || sourceHeaderID <= 0 {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMHeaderCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
		return nil, err
	}
	normalized.Status = BOMStatusDraft
	return uc.repo.CopyBOMVersion(ctx, sourceHeaderID, &normalized)
}

func (uc *BOMUsecase) ActivateBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	detail, err := uc.GetBOMVersion(ctx, id)
	if err != nil {
		return nil, err
	}
	if detail == nil || detail.Header == nil || len(detail.Items) == 0 {
		return nil, ErrBadParam
	}
	if detail.Header.Status == BOMStatusActive {
		return detail, nil
	}
	if !CanTransitionBOMStatus(detail.Header.Status, BOMStatusActive) {
		return nil, ErrBadParam
	}
	if err := requireActiveReference(ctx, detail.Header.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
		return nil, err
	}
	for _, item := range detail.Items {
		if item == nil {
			return nil, ErrBadParam
		}
		if err := uc.validateBOMItemActiveReferences(ctx, item.MaterialID, item.UnitID); err != nil {
			return nil, err
		}
	}
	return uc.repo.ActivateBOMVersion(ctx, id)
}

func (uc *BOMUsecase) ArchiveBOMVersion(ctx context.Context, id int) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	header, err := uc.repo.GetBOMHeader(ctx, id)
	if err != nil {
		return nil, err
	}
	if header.Status == BOMStatusArchived {
		return header, nil
	}
	if !CanTransitionBOMStatus(header.Status, BOMStatusArchived) {
		return nil, ErrBadParam
	}
	return uc.repo.ArchiveBOMVersion(ctx, id)
}

func IsValidBOMStatus(value string) bool {
	return IsKnownBOMStatus(value)
}

func IsKnownBOMStatus(value string) bool {
	_, ok := bomStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsCreatableBOMStatus(value string) bool {
	return strings.ToUpper(strings.TrimSpace(value)) == BOMStatusDraft
}

func CanTransitionBOMStatus(currentStatus, newStatus string) bool {
	currentStatus = strings.ToUpper(strings.TrimSpace(currentStatus))
	newStatus = strings.ToUpper(strings.TrimSpace(newStatus))
	switch currentStatus {
	case BOMStatusDraft:
		return newStatus == BOMStatusActive || newStatus == BOMStatusArchived
	case BOMStatusActive:
		return newStatus == BOMStatusArchived
	case BOMStatusArchived:
		return newStatus == BOMStatusActive
	default:
		return false
	}
}

func (uc *BOMUsecase) validateBOMItemActiveReferences(ctx context.Context, materialID int, unitID int) error {
	if err := requireActiveReference(ctx, materialID, uc.repo.MaterialIsActive, ErrMaterialInactive); err != nil {
		return err
	}
	return requireActiveReference(ctx, unitID, uc.repo.UnitIsActive, ErrUnitInactive)
}

func normalizeBOMHeaderCreate(in BOMHeaderCreate) (BOMHeaderCreate, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	if in.Status == "" {
		in.Status = BOMStatusDraft
	}
	in.Note = normalizeOptionalString(in.Note)
	in.SourceOrderNo = normalizeOptionalString(in.SourceOrderNo)
	in.QuantityText = normalizeOptionalString(in.QuantityText)
	in.SpareText = normalizeOptionalString(in.SpareText)
	in.Designer = normalizeOptionalString(in.Designer)
	in.Maker = normalizeOptionalString(in.Maker)
	in.Auditor = normalizeOptionalString(in.Auditor)
	in.HairDirection = normalizeOptionalString(in.HairDirection)
	if in.ProductID <= 0 ||
		!IsCreatableBOMStatus(in.Status) {
		return BOMHeaderCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeBOMHeaderUpdate(in BOMHeaderUpdate) BOMHeaderUpdate {
	in.Note = normalizeOptionalString(in.Note)
	in.SourceOrderNo = normalizeOptionalString(in.SourceOrderNo)
	in.QuantityText = normalizeOptionalString(in.QuantityText)
	in.SpareText = normalizeOptionalString(in.SpareText)
	in.Designer = normalizeOptionalString(in.Designer)
	in.Maker = normalizeOptionalString(in.Maker)
	in.Auditor = normalizeOptionalString(in.Auditor)
	in.HairDirection = normalizeOptionalString(in.HairDirection)
	return in
}

func normalizeBOMItemUpdate(in BOMItemUpdate) (BOMItemUpdate, error) {
	in.Position = normalizeOptionalString(in.Position)
	in.PieceCount = normalizeOptionalString(in.PieceCount)
	in.TotalUsageSnapshot = normalizeOptionalString(in.TotalUsageSnapshot)
	in.ProcessBase = normalizeOptionalString(in.ProcessBase)
	in.ProcessMethod = normalizeOptionalString(in.ProcessMethod)
	in.Note = normalizeOptionalString(in.Note)
	var err error
	in.SourceSnapshot, err = normalizeBOMSourceSnapshot(in.SourceSnapshot)
	if err != nil {
		return BOMItemUpdate{}, err
	}
	if in.TotalUsageSnapshot != nil {
		if _, ok := ParseBOMDecimal(*in.TotalUsageSnapshot); !ok {
			return BOMItemUpdate{}, ErrBadParam
		}
	}
	if in.MaterialID <= 0 ||
		in.UnitID <= 0 ||
		in.LossRate.Cmp(decimal.Zero) < 0 {
		return BOMItemUpdate{}, ErrBadParam
	}
	if _, ok := ParseBOMDecimal(in.Quantity.String()); !ok {
		return BOMItemUpdate{}, ErrBadParam
	}
	if _, ok := ParseBOMDecimal(in.LossRate.String()); !ok {
		return BOMItemUpdate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return BOMItemUpdate{}, ErrBadParam
	}
	return in, nil
}

func normalizeBOMHeaderFilter(filter BOMHeaderFilter) (BOMHeaderFilter, error) {
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	var scopeOK bool
	filter.LifecycleScope, scopeOK = NormalizeLifecycleScope(filter.LifecycleScope)
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if !scopeOK || (filter.Status != "" && !IsValidBOMStatus(filter.Status)) {
		return BOMHeaderFilter{}, ErrBadParam
	}
	if !LifecycleScopeAllowsStatus(
		filter.LifecycleScope,
		filter.Status,
		[]string{BOMStatusDraft, BOMStatusActive},
		[]string{BOMStatusArchived},
	) {
		return BOMHeaderFilter{}, ErrBadParam
	}
	filter.Limit = NormalizeBusinessListLimit(filter.Limit)
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return filter, nil
}
