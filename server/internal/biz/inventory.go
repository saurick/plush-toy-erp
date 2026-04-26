package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

var (
	ErrInventoryTxnNotFound        = errors.New("inventory txn not found")
	ErrInventoryBalanceNotFound    = errors.New("inventory balance not found")
	ErrInventoryLotNotFound        = errors.New("inventory lot not found")
	ErrBOMHeaderNotFound           = errors.New("bom header not found")
	ErrPurchaseReceiptNotFound     = errors.New("purchase receipt not found")
	ErrPurchaseReceiptItemNotFound = errors.New("purchase receipt item not found")
	ErrPurchaseReturnNotFound      = errors.New("purchase return not found")
	ErrPurchaseReturnItemNotFound  = errors.New("purchase return item not found")
	ErrInventoryInsufficientStock  = errors.New("inventory insufficient stock")
	ErrInventoryTxnAlreadyReversed = errors.New("inventory txn already reversed")
)

const (
	InventorySubjectMaterial = "MATERIAL"
	InventorySubjectProduct  = "PRODUCT"

	InventoryTxnIn          = "IN"
	InventoryTxnOut         = "OUT"
	InventoryTxnAdjustIn    = "ADJUST_IN"
	InventoryTxnAdjustOut   = "ADJUST_OUT"
	InventoryTxnTransferIn  = "TRANSFER_IN"
	InventoryTxnTransferOut = "TRANSFER_OUT"
	InventoryTxnReversal    = "REVERSAL"

	InventoryLotActive   = "ACTIVE"
	InventoryLotDisabled = "DISABLED"

	BOMStatusDraft    = "DRAFT"
	BOMStatusActive   = "ACTIVE"
	BOMStatusDisabled = "DISABLED"

	PurchaseReceiptSourceType      = "PURCHASE_RECEIPT"
	PurchaseReceiptStatusDraft     = "DRAFT"
	PurchaseReceiptStatusPosted    = "POSTED"
	PurchaseReceiptStatusCancelled = "CANCELLED"

	PurchaseReturnSourceType      = "PURCHASE_RETURN"
	PurchaseReturnStatusDraft     = "DRAFT"
	PurchaseReturnStatusPosted    = "POSTED"
	PurchaseReturnStatusCancelled = "CANCELLED"
)

var (
	inventorySubjectTypes = map[string]struct{}{
		InventorySubjectMaterial: {},
		InventorySubjectProduct:  {},
	}
	inventoryTxnTypes = map[string]struct{}{
		InventoryTxnIn:          {},
		InventoryTxnOut:         {},
		InventoryTxnAdjustIn:    {},
		InventoryTxnAdjustOut:   {},
		InventoryTxnTransferIn:  {},
		InventoryTxnTransferOut: {},
		InventoryTxnReversal:    {},
	}
	inventoryLotStatuses = map[string]struct{}{
		InventoryLotActive:   {},
		InventoryLotDisabled: {},
	}
	bomStatuses = map[string]struct{}{
		BOMStatusDraft:    {},
		BOMStatusActive:   {},
		BOMStatusDisabled: {},
	}
	purchaseReceiptStatuses = map[string]struct{}{
		PurchaseReceiptStatusDraft:     {},
		PurchaseReceiptStatusPosted:    {},
		PurchaseReceiptStatusCancelled: {},
	}
	purchaseReturnStatuses = map[string]struct{}{
		PurchaseReturnStatusDraft:     {},
		PurchaseReturnStatusPosted:    {},
		PurchaseReturnStatusCancelled: {},
	}
)

type InventoryLot struct {
	ID              int
	SubjectType     string
	SubjectID       int
	LotNo           string
	SupplierLotNo   *string
	ColorNo         *string
	DyeLotNo        *string
	ProductionLotNo *string
	Status          string
	ReceivedAt      *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type InventoryTxn struct {
	ID              int
	SubjectType     string
	SubjectID       int
	WarehouseID     int
	LotID           *int
	TxnType         string
	Direction       int
	Quantity        decimal.Decimal
	UnitID          int
	SourceType      string
	SourceID        *int
	SourceLineID    *int
	IdempotencyKey  string
	ReversalOfTxnID *int
	OccurredAt      time.Time
	CreatedAt       time.Time
	CreatedBy       *int
	Note            *string
}

type InventoryBalance struct {
	ID          int
	SubjectType string
	SubjectID   int
	WarehouseID int
	LotID       *int
	UnitID      int
	Quantity    decimal.Decimal
	UpdatedAt   time.Time
}

type InventoryLotCreate struct {
	SubjectType     string
	SubjectID       int
	LotNo           string
	SupplierLotNo   *string
	ColorNo         *string
	DyeLotNo        *string
	ProductionLotNo *string
	Status          string
	ReceivedAt      *time.Time
}

type InventoryTxnCreate struct {
	SubjectType     string
	SubjectID       int
	WarehouseID     int
	LotID           *int
	TxnType         string
	Direction       int
	Quantity        decimal.Decimal
	UnitID          int
	SourceType      string
	SourceID        *int
	SourceLineID    *int
	IdempotencyKey  string
	ReversalOfTxnID *int
	OccurredAt      time.Time
	CreatedBy       *int
	Note            *string
}

type InventoryBalanceKey struct {
	SubjectType string
	SubjectID   int
	WarehouseID int
	LotID       *int
	UnitID      int
}

type BOMHeader struct {
	ID            int
	ProductID     int
	Version       string
	Status        string
	EffectiveFrom *time.Time
	EffectiveTo   *time.Time
	Note          *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type BOMItem struct {
	ID          int
	BOMHeaderID int
	MaterialID  int
	Quantity    decimal.Decimal
	UnitID      int
	LossRate    decimal.Decimal
	Position    *string
	Note        *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type BOMHeaderCreate struct {
	ProductID     int
	Version       string
	Status        string
	EffectiveFrom *time.Time
	EffectiveTo   *time.Time
	Note          *string
}

type BOMItemCreate struct {
	BOMHeaderID int
	MaterialID  int
	Quantity    decimal.Decimal
	UnitID      int
	LossRate    decimal.Decimal
	Position    *string
	Note        *string
}

type InventoryTxnApplyResult struct {
	Txn              *InventoryTxn
	Balance          *InventoryBalance
	IdempotentReplay bool
}

type InventoryRepo interface {
	CreateInventoryLot(ctx context.Context, in *InventoryLotCreate) (*InventoryLot, error)
	GetInventoryLot(ctx context.Context, id int) (*InventoryLot, error)
	CreateInventoryTxn(ctx context.Context, in *InventoryTxnCreate) (*InventoryTxn, error)
	ApplyInventoryTxnAndUpdateBalance(ctx context.Context, in *InventoryTxnCreate) (*InventoryTxnApplyResult, error)
	GetInventoryBalance(ctx context.Context, key InventoryBalanceKey) (*InventoryBalance, error)
	CreateBOMHeader(ctx context.Context, in *BOMHeaderCreate) (*BOMHeader, error)
	CreateBOMItem(ctx context.Context, in *BOMItemCreate) (*BOMItem, error)
	ListBOMItemsByProduct(ctx context.Context, productID int) ([]*BOMItem, error)
	GetActiveBOMByProduct(ctx context.Context, productID int) (*BOMHeader, error)
	CreatePurchaseReceiptDraft(ctx context.Context, in *PurchaseReceiptCreate) (*PurchaseReceipt, error)
	AddPurchaseReceiptItem(ctx context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, error)
	PostPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error)
	CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error)
	GetPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error)
	CreatePurchaseReturnDraft(ctx context.Context, in *PurchaseReturnCreate) (*PurchaseReturn, error)
	AddPurchaseReturnItem(ctx context.Context, in *PurchaseReturnItemCreate) (*PurchaseReturnItem, error)
	PostPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error)
	CancelPostedPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error)
	GetPurchaseReturn(ctx context.Context, id int) (*PurchaseReturn, error)
}

type InventoryUsecase struct {
	repo InventoryRepo
}

func NewInventoryUsecase(repo InventoryRepo) *InventoryUsecase {
	return &InventoryUsecase{repo: repo}
}

func (uc *InventoryUsecase) CreateInventoryLot(ctx context.Context, in *InventoryLotCreate) (*InventoryLot, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeInventoryLotCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateInventoryLot(ctx, &normalized)
}

func (uc *InventoryUsecase) GetInventoryLot(ctx context.Context, id int) (*InventoryLot, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetInventoryLot(ctx, id)
}

func (uc *InventoryUsecase) CreateInventoryTxn(ctx context.Context, in *InventoryTxnCreate) (*InventoryTxn, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeInventoryTxnCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateInventoryTxn(ctx, &normalized)
}

func (uc *InventoryUsecase) ApplyInventoryTxnAndUpdateBalance(ctx context.Context, in *InventoryTxnCreate) (*InventoryTxnApplyResult, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeInventoryTxnCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.ApplyInventoryTxnAndUpdateBalance(ctx, &normalized)
}

func (uc *InventoryUsecase) GetInventoryBalance(ctx context.Context, key InventoryBalanceKey) (*InventoryBalance, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	key = normalizeInventoryBalanceKey(key)
	if !isValidInventoryBalanceKey(key) {
		return nil, ErrBadParam
	}
	return uc.repo.GetInventoryBalance(ctx, key)
}

func (uc *InventoryUsecase) CreateBOMHeader(ctx context.Context, in *BOMHeaderCreate) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMHeaderCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateBOMHeader(ctx, &normalized)
}

func (uc *InventoryUsecase) CreateBOMItem(ctx context.Context, in *BOMItemCreate) (*BOMItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMItemCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateBOMItem(ctx, &normalized)
}

func (uc *InventoryUsecase) ListBOMItemsByProduct(ctx context.Context, productID int) ([]*BOMItem, error) {
	if uc == nil || uc.repo == nil || productID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ListBOMItemsByProduct(ctx, productID)
}

func (uc *InventoryUsecase) GetActiveBOMByProduct(ctx context.Context, productID int) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || productID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetActiveBOMByProduct(ctx, productID)
}

func normalizeInventoryLotCreate(in InventoryLotCreate) (InventoryLotCreate, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.LotNo = strings.TrimSpace(in.LotNo)
	in.SupplierLotNo = normalizeOptionalString(in.SupplierLotNo)
	in.ColorNo = normalizeOptionalString(in.ColorNo)
	in.DyeLotNo = normalizeOptionalString(in.DyeLotNo)
	in.ProductionLotNo = normalizeOptionalString(in.ProductionLotNo)
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	if in.Status == "" {
		in.Status = InventoryLotActive
	}
	if !IsValidInventorySubjectType(in.SubjectType) ||
		in.SubjectID <= 0 ||
		in.LotNo == "" ||
		!IsValidInventoryLotStatus(in.Status) {
		return InventoryLotCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeInventoryTxnCreate(in InventoryTxnCreate) (InventoryTxnCreate, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.TxnType = strings.ToUpper(strings.TrimSpace(in.TxnType))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Note = normalizeOptionalString(in.Note)
	if in.OccurredAt.IsZero() {
		in.OccurredAt = time.Now()
	}
	if in.SourceID != nil && *in.SourceID <= 0 {
		in.SourceID = nil
	}
	if in.SourceLineID != nil && *in.SourceLineID <= 0 {
		in.SourceLineID = nil
	}
	if in.CreatedBy != nil && *in.CreatedBy <= 0 {
		in.CreatedBy = nil
	}
	if in.ReversalOfTxnID != nil && *in.ReversalOfTxnID <= 0 {
		in.ReversalOfTxnID = nil
	}
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if !IsValidInventorySubjectType(in.SubjectType) ||
		!IsValidInventoryTxnType(in.TxnType) ||
		in.SubjectID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 ||
		in.SourceType == "" ||
		in.IdempotencyKey == "" ||
		in.Quantity.Cmp(decimal.Zero) <= 0 {
		return InventoryTxnCreate{}, ErrBadParam
	}
	if in.Direction != 1 && in.Direction != -1 {
		return InventoryTxnCreate{}, ErrBadParam
	}
	if !inventoryTxnDirectionMatchesType(in.TxnType, in.Direction) {
		return InventoryTxnCreate{}, ErrBadParam
	}
	if in.TxnType == InventoryTxnReversal && in.ReversalOfTxnID == nil {
		return InventoryTxnCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeInventoryBalanceKey(key InventoryBalanceKey) InventoryBalanceKey {
	key.SubjectType = strings.ToUpper(strings.TrimSpace(key.SubjectType))
	if key.LotID != nil && *key.LotID <= 0 {
		key.LotID = nil
	}
	return key
}

func isValidInventoryBalanceKey(key InventoryBalanceKey) bool {
	return IsValidInventorySubjectType(key.SubjectType) &&
		key.SubjectID > 0 &&
		key.WarehouseID > 0 &&
		key.UnitID > 0
}

func IsValidInventorySubjectType(value string) bool {
	_, ok := inventorySubjectTypes[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsValidInventoryTxnType(value string) bool {
	_, ok := inventoryTxnTypes[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsValidInventoryLotStatus(value string) bool {
	_, ok := inventoryLotStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsValidBOMStatus(value string) bool {
	_, ok := bomStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func inventoryTxnDirectionMatchesType(txnType string, direction int) bool {
	switch txnType {
	case InventoryTxnIn, InventoryTxnAdjustIn, InventoryTxnTransferIn:
		return direction == 1
	case InventoryTxnOut, InventoryTxnAdjustOut, InventoryTxnTransferOut:
		return direction == -1
	case InventoryTxnReversal:
		return direction == 1 || direction == -1
	default:
		return false
	}
}

func normalizeBOMHeaderCreate(in BOMHeaderCreate) (BOMHeaderCreate, error) {
	in.Version = strings.TrimSpace(in.Version)
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	if in.Status == "" {
		in.Status = BOMStatusDraft
	}
	in.Note = normalizeOptionalString(in.Note)
	if in.ProductID <= 0 ||
		in.Version == "" ||
		!IsValidBOMStatus(in.Status) {
		return BOMHeaderCreate{}, ErrBadParam
	}
	if in.EffectiveFrom != nil && in.EffectiveTo != nil && !in.EffectiveFrom.Before(*in.EffectiveTo) {
		return BOMHeaderCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeBOMItemCreate(in BOMItemCreate) (BOMItemCreate, error) {
	in.Position = normalizeOptionalString(in.Position)
	in.Note = normalizeOptionalString(in.Note)
	if in.BOMHeaderID <= 0 ||
		in.MaterialID <= 0 ||
		in.UnitID <= 0 ||
		in.Quantity.Cmp(decimal.Zero) <= 0 ||
		in.LossRate.Cmp(decimal.Zero) < 0 {
		return BOMItemCreate{}, ErrBadParam
	}
	return in, nil
}
