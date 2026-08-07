package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	corestatus "server/internal/core/status"
	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

var (
	ErrInventoryTxnNotFound                  = errors.New("inventory txn not found")
	ErrInventoryBalanceNotFound              = errors.New("inventory balance not found")
	ErrInventoryLotNotFound                  = errors.New("inventory lot not found")
	ErrBOMHeaderNotFound                     = errors.New("bom header not found")
	ErrBOMItemNotFound                       = errors.New("bom item not found")
	ErrBOMActiveImmutable                    = errors.New("active bom must be copied before edit")
	ErrBOMActiveConflict                     = errors.New("another bom version is active")
	ErrBOMVersionConflict                    = errors.New("bom version conflict")
	ErrPurchaseReceiptNotFound               = errors.New("purchase receipt not found")
	ErrPurchaseReceiptItemNotFound           = errors.New("purchase receipt item not found")
	ErrPurchaseReturnNotFound                = errors.New("purchase return not found")
	ErrPurchaseReturnItemNotFound            = errors.New("purchase return item not found")
	ErrPurchaseReturnQualitySourceInvalid    = errors.New("purchase return quality source is invalid")
	ErrPurchaseReturnQualitySourceState      = errors.New("purchase return quality source state does not allow creation")
	ErrPurchaseReturnQualitySourceConflict   = errors.New("active purchase return already exists for quality inspection")
	ErrPurchaseReturnQuantityExceeded        = errors.New("purchase return quantity exceeds effective receipt quantity")
	ErrPurchaseReceiptAdjustmentNotFound     = errors.New("purchase receipt adjustment not found")
	ErrPurchaseReceiptAdjustmentItemNotFound = errors.New("purchase receipt adjustment item not found")
	ErrPurchaseReceiptCorrectionDependency   = errors.New("purchase receipt has active correction documents")
	ErrQualityInspectionNotFound             = errors.New("quality inspection not found")
	ErrQualityInspectionSourceConflict       = errors.New("active quality inspection already exists for source")
	ErrQualityInspectionSourceInvalid        = errors.New("quality inspection source is invalid")
	ErrQualityInspectionSourceState          = errors.New("quality inspection source state does not allow creation")
	ErrPurchaseReceiptQualityPending         = errors.New("purchase receipt quality inspection is not complete")
	ErrPurchaseReceiptQualityRejected        = errors.New("purchase receipt quality inspection is rejected")
	ErrInventoryInsufficientStock            = errors.New("inventory insufficient stock")
	ErrInventoryLotStatusBlocked             = errors.New("inventory lot status blocks stock deduction")
	ErrInventoryTxnAlreadyReversed           = errors.New("inventory txn already reversed")
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

	InventoryLotActive   = corestatus.InventoryLotActive
	InventoryLotHold     = corestatus.InventoryLotHold
	InventoryLotRejected = corestatus.InventoryLotRejected
	InventoryLotDisabled = corestatus.InventoryLotDisabled

	BOMStatusDraft    = "DRAFT"
	BOMStatusActive   = "ACTIVE"
	BOMStatusArchived = "ARCHIVED"

	PurchaseReceiptSourceType      = "PURCHASE_RECEIPT"
	PurchaseReceiptStatusDraft     = corestatus.PurchaseReceiptDraft
	PurchaseReceiptStatusPosted    = corestatus.PurchaseReceiptPosted
	PurchaseReceiptStatusCancelled = corestatus.PurchaseReceiptCancelled

	PurchaseReturnSourceType      = "PURCHASE_RETURN"
	PurchaseReturnStatusDraft     = corestatus.PurchaseReturnDraft
	PurchaseReturnStatusPosted    = corestatus.PurchaseReturnPosted
	PurchaseReturnStatusCancelled = corestatus.PurchaseReturnCancelled

	PurchaseReceiptAdjustmentSourceType      = "PURCHASE_RECEIPT_ADJUSTMENT"
	PurchaseReceiptAdjustmentStatusDraft     = corestatus.PurchaseReceiptAdjustmentDraft
	PurchaseReceiptAdjustmentStatusPosted    = corestatus.PurchaseReceiptAdjustmentPosted
	PurchaseReceiptAdjustmentStatusCancelled = corestatus.PurchaseReceiptAdjustmentCancelled

	PurchaseReceiptAdjustmentQuantityIncrease       = "QUANTITY_INCREASE"
	PurchaseReceiptAdjustmentQuantityDecrease       = "QUANTITY_DECREASE"
	PurchaseReceiptAdjustmentLotCorrectionOut       = "LOT_CORRECTION_OUT"
	PurchaseReceiptAdjustmentLotCorrectionIn        = "LOT_CORRECTION_IN"
	PurchaseReceiptAdjustmentWarehouseCorrectionOut = "WAREHOUSE_CORRECTION_OUT"
	PurchaseReceiptAdjustmentWarehouseCorrectionIn  = "WAREHOUSE_CORRECTION_IN"
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
	bomStatuses = map[string]struct{}{
		BOMStatusDraft:    {},
		BOMStatusActive:   {},
		BOMStatusArchived: {},
	}
	purchaseReceiptAdjustmentTypes = map[string]struct{}{
		PurchaseReceiptAdjustmentQuantityIncrease:       {},
		PurchaseReceiptAdjustmentQuantityDecrease:       {},
		PurchaseReceiptAdjustmentLotCorrectionOut:       {},
		PurchaseReceiptAdjustmentLotCorrectionIn:        {},
		PurchaseReceiptAdjustmentWarehouseCorrectionOut: {},
		PurchaseReceiptAdjustmentWarehouseCorrectionIn:  {},
	}
)

type InventoryLot struct {
	ID              int
	SubjectType     string
	SubjectID       int
	ProductSkuID    *int
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
	ProductSkuID    *int
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
	ID                     int
	SubjectType            string
	SubjectID              int
	ProductSkuID           *int
	WarehouseID            int
	LotID                  *int
	UnitID                 int
	Quantity               decimal.Decimal
	ActiveReservedQuantity decimal.Decimal
	AvailableQuantity      decimal.Decimal
	UpdatedAt              time.Time
}

type InventoryLotCreate struct {
	SubjectType     string
	SubjectID       int
	ProductSkuID    *int
	LotNo           string
	SupplierLotNo   *string
	ColorNo         *string
	DyeLotNo        *string
	ProductionLotNo *string
	Status          string
	ReceivedAt      *time.Time
}

type InventoryTxnCreate struct {
	SubjectType         string
	SubjectID           int
	ProductSkuID        *int
	WarehouseID         int
	LotID               *int
	TxnType             string
	Direction           int
	Quantity            decimal.Decimal
	UnitID              int
	SourceType          string
	SourceID            *int
	SourceLineID        *int
	IdempotencyKey      string
	ReversalOfTxnID     *int
	OccurredAt          time.Time
	OccurredAtSpecified bool
	CreatedBy           *int
	Note                *string
}

type InventoryBalanceKey struct {
	SubjectType  string
	SubjectID    int
	ProductSkuID *int
	WarehouseID  int
	LotID        *int
	UnitID       int
}

type InventoryBalanceFilter struct {
	SubjectType  string
	SubjectID    int
	ProductSkuID int
	WarehouseID  int
	LotID        int
	Keyword      string
	Limit        int
	Offset       int
}

type InventoryLotFilter struct {
	SubjectType  string
	SubjectID    int
	ProductSkuID int
	WarehouseID  int
	Status       string
	Keyword      string
	DateFrom     *time.Time
	DateTo       *time.Time
	Limit        int
	Offset       int
}

type InventoryTxnFilter struct {
	SubjectType  string
	SubjectID    int
	ProductSkuID int
	WarehouseID  int
	LotID        int
	TxnType      string
	SourceType   string
	SourceID     int
	Keyword      string
	DateFrom     *time.Time
	DateTo       *time.Time
	Limit        int
	Offset       int
}

type BOMHeader struct {
	ID            int
	ProductID     int
	Version       string
	Status        string
	ItemCount     *int // List-only projection; nil when the count was not loaded.
	EffectiveFrom *time.Time
	EffectiveTo   *time.Time
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
	ID                      int
	BOMHeaderID             int
	MaterialID              int
	Quantity                decimal.Decimal
	UnitID                  int
	LossRate                decimal.Decimal
	Position                *string
	PieceCount              *string
	TotalUsageSnapshot      *string
	ProcessBase             *string
	ProcessMethod           *string
	ProductionOperationCode *string
	Note                    *string
	CreatedAt               time.Time
	UpdatedAt               time.Time
}

type BOMHeaderCreate struct {
	ProductID     int
	Version       string
	Status        string
	EffectiveFrom *time.Time
	EffectiveTo   *time.Time
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
	Version       string
	EffectiveFrom *time.Time
	EffectiveTo   *time.Time
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

type BOMItemCreate struct {
	BOMHeaderID             int
	MaterialID              int
	Quantity                decimal.Decimal
	UnitID                  int
	LossRate                decimal.Decimal
	Position                *string
	PieceCount              *string
	TotalUsageSnapshot      *string
	ProcessBase             *string
	ProcessMethod           *string
	ProductionOperationCode *string
	Note                    *string
}

type BOMItemUpdate struct {
	MaterialID              int
	Quantity                decimal.Decimal
	UnitID                  int
	LossRate                decimal.Decimal
	Position                *string
	PieceCount              *string
	TotalUsageSnapshot      *string
	ProcessBase             *string
	ProcessMethod           *string
	ProductionOperationCode *string
	Note                    *string
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
	ProductID int
	Status    string
	Keyword   string
	Limit     int
	Offset    int
}

type BOMVersionDetail struct {
	Header *BOMHeader
	Items  []*BOMItem
}

type BOMAggregateSaveRepo interface {
	SaveBOMWithItems(ctx context.Context, id int, in *BOMVersionMutation, items []*BOMItemSaveMutation) (*BOMVersionDetail, error)
}

type InventoryTxnApplyResult struct {
	Txn              *InventoryTxn
	Balance          *InventoryBalance
	IdempotentReplay bool
}

type InventoryRepo interface {
	GetSupplier(ctx context.Context, id int) (*Supplier, error)
	MaterialIsActive(ctx context.Context, id int) (bool, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
	WarehouseIsActive(ctx context.Context, id int) (bool, error)
	CreateInventoryLot(ctx context.Context, in *InventoryLotCreate) (*InventoryLot, error)
	GetInventoryLot(ctx context.Context, id int) (*InventoryLot, error)
	ChangeInventoryLotStatus(ctx context.Context, lotID int, newStatus string, reason string) (*InventoryLot, error)
	CreateInventoryTxn(ctx context.Context, in *InventoryTxnCreate) (*InventoryTxn, error)
	ApplyInventoryTxnAndUpdateBalance(ctx context.Context, in *InventoryTxnCreate) (*InventoryTxnApplyResult, error)
	GetInventoryBalance(ctx context.Context, key InventoryBalanceKey) (*InventoryBalance, error)
	ListInventoryBalances(ctx context.Context, filter InventoryBalanceFilter) ([]*InventoryBalance, int, error)
	ListInventoryLots(ctx context.Context, filter InventoryLotFilter) ([]*InventoryLot, int, error)
	ListInventoryTxns(ctx context.Context, filter InventoryTxnFilter) ([]*InventoryTxn, int, error)
	CreateBOMHeader(ctx context.Context, in *BOMHeaderCreate) (*BOMHeader, error)
	CreateBOMItem(ctx context.Context, in *BOMItemCreate) (*BOMItem, error)
	UpdateBOMDraftHeader(ctx context.Context, id int, in *BOMHeaderUpdate) (*BOMHeader, error)
	UpdateBOMDraftItem(ctx context.Context, id int, in *BOMItemUpdate) (*BOMItem, error)
	DeleteBOMDraftItem(ctx context.Context, id int) error
	ListBOMHeaders(ctx context.Context, filter BOMHeaderFilter) ([]*BOMHeader, int, error)
	GetBOMHeader(ctx context.Context, id int) (*BOMHeader, error)
	ListBOMItemsByHeader(ctx context.Context, bomHeaderID int) ([]*BOMItem, error)
	ListBOMItemsByProduct(ctx context.Context, productID int) ([]*BOMItem, error)
	GetActiveBOMByProduct(ctx context.Context, productID int) (*BOMHeader, error)
	CopyBOMVersion(ctx context.Context, sourceHeaderID int, in *BOMHeaderCreate) (*BOMVersionDetail, error)
	ActivateBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error)
	ArchiveBOMVersion(ctx context.Context, id int) (*BOMHeader, error)
	CreatePurchaseReceiptDraft(ctx context.Context, in *PurchaseReceiptCreate) (*PurchaseReceipt, error)
	CreatePurchaseReceiptWithItems(ctx context.Context, in *PurchaseReceiptCreate, items []*PurchaseReceiptItemCreate) (*PurchaseReceipt, error)
	ResolvePurchaseReceiptFromPurchaseOrderReplay(ctx context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, bool, error)
	CreatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, error)
	ResolvePurchaseReceiptItemReplay(ctx context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, bool, error)
	AddPurchaseReceiptItem(ctx context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, error)
	PostPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error)
	CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error)
	GetPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error)
	ListPurchaseReceipts(ctx context.Context, filter PurchaseReceiptFilter) ([]*PurchaseReceipt, int, error)
	CreatePurchaseReturnDraft(ctx context.Context, in *PurchaseReturnCreate) (*PurchaseReturn, error)
	ResolvePurchaseReturnReplay(ctx context.Context, in *PurchaseReturnCreate) (*PurchaseReturn, bool, error)
	CreatePurchaseReturnWithItems(ctx context.Context, in *PurchaseReturnCreate, items []*PurchaseReturnItemCreate) (*PurchaseReturn, error)
	AddPurchaseReturnItem(ctx context.Context, in *PurchaseReturnItemCreate) (*PurchaseReturnItem, error)
	PostPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error)
	CancelPostedPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error)
	GetPurchaseReturn(ctx context.Context, id int) (*PurchaseReturn, error)
	ListPurchaseReturns(ctx context.Context, filter PurchaseReturnFilter) ([]*PurchaseReturn, int, error)
	CreatePurchaseReceiptAdjustmentDraft(ctx context.Context, in *PurchaseReceiptAdjustmentCreate) (*PurchaseReceiptAdjustment, error)
	ResolvePurchaseReceiptAdjustmentReplay(ctx context.Context, in *PurchaseReceiptAdjustmentCreate) (*PurchaseReceiptAdjustment, bool, error)
	CreatePurchaseReceiptAdjustmentWithItems(ctx context.Context, in *PurchaseReceiptAdjustmentCreate, items []*PurchaseReceiptAdjustmentItemCreate) (*PurchaseReceiptAdjustment, error)
	AddPurchaseReceiptAdjustmentItem(ctx context.Context, in *PurchaseReceiptAdjustmentItemCreate) (*PurchaseReceiptAdjustmentItem, error)
	PostPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*PurchaseReceiptAdjustment, error)
	CancelPostedPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*PurchaseReceiptAdjustment, error)
	GetPurchaseReceiptAdjustment(ctx context.Context, id int) (*PurchaseReceiptAdjustment, error)
	ListPurchaseReceiptAdjustments(ctx context.Context, filter PurchaseReceiptAdjustmentFilter) ([]*PurchaseReceiptAdjustment, int, error)
	CreateQualityInspectionDraft(ctx context.Context, in *QualityInspectionCreate) (*QualityInspection, error)
	CreateFinishedGoodsQualityInspectionDraft(ctx context.Context, in *QualityInspectionCreate) (*QualityInspection, error)
	SubmitQualityInspection(ctx context.Context, inspectionID int) (*QualityInspection, error)
	PassQualityInspection(ctx context.Context, in *QualityInspectionDecision) (*QualityInspection, error)
	RejectQualityInspection(ctx context.Context, in *QualityInspectionDecision) (*QualityInspection, error)
	CancelQualityInspection(ctx context.Context, inspectionID int, decisionNote *string) (*QualityInspection, error)
	GetQualityInspection(ctx context.Context, id int) (*QualityInspection, error)
	ListQualityInspections(ctx context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error)
	EvaluatePurchaseReceiptQualityGate(ctx context.Context, receiptID int) (*PurchaseReceiptQualityGate, error)
}

// InventoryWarehouseAccessRepo applies warehouse predicates before counting
// and pagination. Authenticated entry points must use these methods instead of
// the unrestricted repository methods used by trusted fact-posting internals.
type InventoryWarehouseAccessRepo interface {
	ListInventoryBalancesForAccess(ctx context.Context, filter InventoryBalanceFilter, scope WarehouseDataScope) ([]*InventoryBalance, int, error)
	ListInventoryLotsForAccess(ctx context.Context, filter InventoryLotFilter, scope WarehouseDataScope) ([]*InventoryLot, int, error)
	ListInventoryTxnsForAccess(ctx context.Context, filter InventoryTxnFilter, scope WarehouseDataScope) ([]*InventoryTxn, int, error)
}

// PurchaseReceiptCancellationActorRepo keeps the authenticated operator on the
// process-command compensation written with a posted receipt reversal.
type PurchaseReceiptCancellationActorRepo interface {
	CancelPostedPurchaseReceiptWithActor(ctx context.Context, receiptID int, actorID int) (*PurchaseReceipt, error)
}

// QualityInspectionSourceRepo owns source locking, source-field derivation and
// draft insertion in one transaction. The generic technical create shape is an
// internal capability and must not be exposed as a caller-controlled API.
type QualityInspectionSourceRepo interface {
	CreateQualityInspectionFromPurchaseReceipt(ctx context.Context, in *QualityInspectionFromPurchaseReceiptCreate) (*QualityInspection, error)
	CreateQualityInspectionFromOutsourcingReturn(ctx context.Context, in *QualityInspectionFromOutsourcingReturnCreate) (*QualityInspection, error)
}

// PurchaseReturnFromQualityInspectionRepo owns the inspection-first lock order
// and derives the receipt, supplier, material, warehouse, unit and lot in one
// transaction.
type PurchaseReturnFromQualityInspectionRepo interface {
	CreatePurchaseReturnFromQualityInspection(ctx context.Context, in *PurchaseReturnFromQualityInspectionCreate) (*PurchaseReturn, error)
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

func (uc *InventoryUsecase) ChangeInventoryLotStatus(ctx context.Context, lotID int, newStatus string, reason string) (*InventoryLot, error) {
	if uc == nil || uc.repo == nil || lotID <= 0 {
		return nil, ErrBadParam
	}
	newStatus = strings.ToUpper(strings.TrimSpace(newStatus))
	reason = strings.TrimSpace(reason)
	if !IsValidInventoryLotStatus(newStatus) {
		return nil, ErrBadParam
	}
	return uc.repo.ChangeInventoryLotStatus(ctx, lotID, newStatus, reason)
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

func (uc *InventoryUsecase) CreateInventoryTxnForAccess(ctx context.Context, in *InventoryTxnCreate, scope WarehouseDataScope) (*InventoryTxn, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeInventoryTxnCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := ValidateWarehouseDataScopeAccess(scope, normalized.WarehouseID); err != nil {
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

func (uc *InventoryUsecase) ApplyInventoryTxnAndUpdateBalanceForAccess(ctx context.Context, in *InventoryTxnCreate, scope WarehouseDataScope) (*InventoryTxnApplyResult, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeInventoryTxnCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := ValidateWarehouseDataScopeAccess(scope, normalized.WarehouseID); err != nil {
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

func (uc *InventoryUsecase) GetInventoryBalanceForAccess(ctx context.Context, key InventoryBalanceKey, scope WarehouseDataScope) (*InventoryBalance, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	key = normalizeInventoryBalanceKey(key)
	if !isValidInventoryBalanceKey(key) {
		return nil, ErrBadParam
	}
	if err := ValidateWarehouseDataScopeAccess(scope, key.WarehouseID); err != nil {
		return nil, err
	}
	return uc.repo.GetInventoryBalance(ctx, key)
}

func (uc *InventoryUsecase) ListInventoryBalances(ctx context.Context, filter InventoryBalanceFilter) ([]*InventoryBalance, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeInventoryBalanceFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListInventoryBalances(ctx, normalized)
}

func (uc *InventoryUsecase) ListInventoryBalancesForAccess(ctx context.Context, filter InventoryBalanceFilter, scope WarehouseDataScope) ([]*InventoryBalance, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeInventoryBalanceFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	scope = NormalizeWarehouseDataScope(scope)
	if err := ValidateWarehouseDataScopeAccess(scope, normalized.WarehouseID); err != nil {
		return nil, 0, err
	}
	repo, ok := uc.repo.(InventoryWarehouseAccessRepo)
	if !ok {
		return nil, 0, ErrDataScopeForbidden
	}
	return repo.ListInventoryBalancesForAccess(ctx, normalized, scope)
}

func (uc *InventoryUsecase) ListInventoryLots(ctx context.Context, filter InventoryLotFilter) ([]*InventoryLot, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeInventoryLotFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListInventoryLots(ctx, normalized)
}

func (uc *InventoryUsecase) ListInventoryLotsForAccess(ctx context.Context, filter InventoryLotFilter, scope WarehouseDataScope) ([]*InventoryLot, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeInventoryLotFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	scope = NormalizeWarehouseDataScope(scope)
	if err := ValidateWarehouseDataScopeAccess(scope, normalized.WarehouseID); err != nil {
		return nil, 0, err
	}
	repo, ok := uc.repo.(InventoryWarehouseAccessRepo)
	if !ok {
		return nil, 0, ErrDataScopeForbidden
	}
	return repo.ListInventoryLotsForAccess(ctx, normalized, scope)
}

func (uc *InventoryUsecase) ListInventoryTxns(ctx context.Context, filter InventoryTxnFilter) ([]*InventoryTxn, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeInventoryTxnFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListInventoryTxns(ctx, normalized)
}

func (uc *InventoryUsecase) ListInventoryTxnsForAccess(ctx context.Context, filter InventoryTxnFilter, scope WarehouseDataScope) ([]*InventoryTxn, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeInventoryTxnFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	scope = NormalizeWarehouseDataScope(scope)
	if err := ValidateWarehouseDataScopeAccess(scope, normalized.WarehouseID); err != nil {
		return nil, 0, err
	}
	repo, ok := uc.repo.(InventoryWarehouseAccessRepo)
	if !ok {
		return nil, 0, ErrDataScopeForbidden
	}
	return repo.ListInventoryTxnsForAccess(ctx, normalized, scope)
}

func (uc *InventoryUsecase) CreateBOMHeader(ctx context.Context, in *BOMHeaderCreate) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMHeaderCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
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
	if err := uc.validateBOMItemActiveReferences(ctx, normalized.MaterialID, normalized.UnitID); err != nil {
		return nil, err
	}
	return uc.repo.CreateBOMItem(ctx, &normalized)
}

func (uc *InventoryUsecase) UpdateBOMDraftHeader(ctx context.Context, id int, in *BOMHeaderUpdate) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || in == nil || id <= 0 {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMHeaderUpdate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateBOMDraftHeader(ctx, id, &normalized)
}

func (uc *InventoryUsecase) UpdateBOMDraftItem(ctx context.Context, id int, in *BOMItemUpdate) (*BOMItem, error) {
	if uc == nil || uc.repo == nil || in == nil || id <= 0 {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMItemUpdate(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateBOMItemActiveReferences(ctx, normalized.MaterialID, normalized.UnitID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateBOMDraftItem(ctx, id, &normalized)
}

func (uc *InventoryUsecase) DeleteBOMDraftItem(ctx context.Context, id int) error {
	if uc == nil || uc.repo == nil || id <= 0 {
		return ErrBadParam
	}
	return uc.repo.DeleteBOMDraftItem(ctx, id)
}

func (uc *InventoryUsecase) SaveBOMWithItems(ctx context.Context, id int, in *BOMVersionMutation, items []*BOMItemSaveMutation) (*BOMVersionDetail, error) {
	if uc == nil || uc.repo == nil || in == nil || id < 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(BOMAggregateSaveRepo)
	if !ok {
		return nil, ErrBadParam
	}

	normalizedHeader, err := normalizeBOMHeaderUpdate(in.BOMHeaderUpdate)
	if err != nil {
		return nil, err
	}
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

func (uc *InventoryUsecase) ListBOMHeaders(ctx context.Context, filter BOMHeaderFilter) ([]*BOMHeader, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if filter.Status != "" && !IsValidBOMStatus(filter.Status) {
		return nil, 0, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return uc.repo.ListBOMHeaders(ctx, filter)
}

func (uc *InventoryUsecase) GetBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error) {
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

func (uc *InventoryUsecase) CopyBOMVersion(ctx context.Context, sourceHeaderID int, in *BOMHeaderCreate) (*BOMVersionDetail, error) {
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

func (uc *InventoryUsecase) ActivateBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error) {
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

func (uc *InventoryUsecase) ArchiveBOMVersion(ctx context.Context, id int) (*BOMHeader, error) {
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
	if in.ProductSkuID != nil && (*in.ProductSkuID <= 0 || in.SubjectType != InventorySubjectProduct) {
		return InventoryLotCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeInventoryTxnCreate(in InventoryTxnCreate) (InventoryTxnCreate, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.TxnType = strings.ToUpper(strings.TrimSpace(in.TxnType))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.Note = normalizeOptionalString(in.Note)
	idempotencyKey, err := value.NewIdempotencyKey(in.IdempotencyKey)
	if err != nil {
		return InventoryTxnCreate{}, ErrBadParam
	}
	in.IdempotencyKey = idempotencyKey.String()
	in.OccurredAt, in.OccurredAtSpecified = normalizeIdempotencyIntentTime(in.OccurredAt)
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
	if in.ProductSkuID != nil && (*in.ProductSkuID <= 0 || in.SubjectType != InventorySubjectProduct) {
		return InventoryTxnCreate{}, ErrBadParam
	}
	if !IsValidInventorySubjectType(in.SubjectType) ||
		!IsValidInventoryTxnType(in.TxnType) ||
		in.SubjectID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 ||
		in.SourceType == "" {
		return InventoryTxnCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
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

func normalizeIdempotencyIntentTime(value time.Time) (time.Time, bool) {
	if value.IsZero() {
		return time.Now(), false
	}
	return value.UTC().Truncate(time.Microsecond), true
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
		(key.ProductSkuID == nil || (*key.ProductSkuID > 0 && key.SubjectType == InventorySubjectProduct)) &&
		key.WarehouseID > 0 &&
		key.UnitID > 0
}

func normalizeInventoryBalanceFilter(in InventoryBalanceFilter) (InventoryBalanceFilter, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if (in.SubjectType != "" && !IsValidInventorySubjectType(in.SubjectType)) || in.ProductSkuID < 0 {
		return InventoryBalanceFilter{}, ErrBadParam
	}
	normalizeInventoryListPagination(&in.Limit, &in.Offset)
	return in, nil
}

func normalizeInventoryLotFilter(in InventoryLotFilter) (InventoryLotFilter, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if (in.SubjectType != "" && !IsValidInventorySubjectType(in.SubjectType)) || in.ProductSkuID < 0 {
		return InventoryLotFilter{}, ErrBadParam
	}
	if in.Status != "" && !IsValidInventoryLotStatus(in.Status) {
		return InventoryLotFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return InventoryLotFilter{}, ErrBadParam
	}
	normalizeInventoryListPagination(&in.Limit, &in.Offset)
	return in, nil
}

func normalizeInventoryTxnFilter(in InventoryTxnFilter) (InventoryTxnFilter, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.TxnType = strings.ToUpper(strings.TrimSpace(in.TxnType))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if (in.SubjectType != "" && !IsValidInventorySubjectType(in.SubjectType)) || in.ProductSkuID < 0 {
		return InventoryTxnFilter{}, ErrBadParam
	}
	if in.TxnType != "" && !IsValidInventoryTxnType(in.TxnType) {
		return InventoryTxnFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return InventoryTxnFilter{}, ErrBadParam
	}
	normalizeInventoryListPagination(&in.Limit, &in.Offset)
	return in, nil
}

func normalizeInventoryListPagination(limit *int, offset *int) {
	if *limit <= 0 || *limit > 200 {
		*limit = 50
	}
	if *offset < 0 {
		*offset = 0
	}
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
	return corestatus.IsInventoryLotStatus(value)
}

func IsInventoryLotStatusTransitionAllowed(currentStatus, newStatus string, hasPositiveBalance bool) bool {
	return corestatus.CanChangeInventoryLotStatus(currentStatus, newStatus, hasPositiveBalance)
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

func (uc *InventoryUsecase) validateBOMItemActiveReferences(ctx context.Context, materialID int, unitID int) error {
	if err := requireActiveReference(ctx, materialID, uc.repo.MaterialIsActive, ErrMaterialInactive); err != nil {
		return err
	}
	return requireActiveReference(ctx, unitID, uc.repo.UnitIsActive, ErrUnitInactive)
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
	in.SourceOrderNo = normalizeOptionalString(in.SourceOrderNo)
	in.QuantityText = normalizeOptionalString(in.QuantityText)
	in.SpareText = normalizeOptionalString(in.SpareText)
	in.Designer = normalizeOptionalString(in.Designer)
	in.Maker = normalizeOptionalString(in.Maker)
	in.Auditor = normalizeOptionalString(in.Auditor)
	in.HairDirection = normalizeOptionalString(in.HairDirection)
	if in.ProductID <= 0 ||
		in.Version == "" ||
		!IsCreatableBOMStatus(in.Status) {
		return BOMHeaderCreate{}, ErrBadParam
	}
	if in.EffectiveFrom != nil && in.EffectiveTo != nil && !in.EffectiveFrom.Before(*in.EffectiveTo) {
		return BOMHeaderCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeBOMHeaderUpdate(in BOMHeaderUpdate) (BOMHeaderUpdate, error) {
	in.Version = strings.TrimSpace(in.Version)
	in.Note = normalizeOptionalString(in.Note)
	in.SourceOrderNo = normalizeOptionalString(in.SourceOrderNo)
	in.QuantityText = normalizeOptionalString(in.QuantityText)
	in.SpareText = normalizeOptionalString(in.SpareText)
	in.Designer = normalizeOptionalString(in.Designer)
	in.Maker = normalizeOptionalString(in.Maker)
	in.Auditor = normalizeOptionalString(in.Auditor)
	in.HairDirection = normalizeOptionalString(in.HairDirection)
	if in.Version == "" {
		return BOMHeaderUpdate{}, ErrBadParam
	}
	if in.EffectiveFrom != nil && in.EffectiveTo != nil && !in.EffectiveFrom.Before(*in.EffectiveTo) {
		return BOMHeaderUpdate{}, ErrBadParam
	}
	return in, nil
}

func normalizeBOMItemCreate(in BOMItemCreate) (BOMItemCreate, error) {
	in.Position = normalizeOptionalString(in.Position)
	in.PieceCount = normalizeOptionalString(in.PieceCount)
	in.TotalUsageSnapshot = normalizeOptionalString(in.TotalUsageSnapshot)
	in.ProcessBase = normalizeOptionalString(in.ProcessBase)
	in.ProcessMethod = normalizeOptionalString(in.ProcessMethod)
	in.ProductionOperationCode = normalizeOptionalString(in.ProductionOperationCode)
	if in.ProductionOperationCode != nil {
		value := strings.ToUpper(*in.ProductionOperationCode)
		if value != ProductionWIPOperationFabricProcessing {
			return BOMItemCreate{}, ErrBadParam
		}
		in.ProductionOperationCode = &value
	}
	in.Note = normalizeOptionalString(in.Note)
	if in.BOMHeaderID <= 0 ||
		in.MaterialID <= 0 ||
		in.UnitID <= 0 ||
		in.LossRate.Cmp(decimal.Zero) < 0 {
		return BOMItemCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return BOMItemCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeBOMItemUpdate(in BOMItemUpdate) (BOMItemUpdate, error) {
	in.Position = normalizeOptionalString(in.Position)
	in.PieceCount = normalizeOptionalString(in.PieceCount)
	in.TotalUsageSnapshot = normalizeOptionalString(in.TotalUsageSnapshot)
	in.ProcessBase = normalizeOptionalString(in.ProcessBase)
	in.ProcessMethod = normalizeOptionalString(in.ProcessMethod)
	in.ProductionOperationCode = normalizeOptionalString(in.ProductionOperationCode)
	if in.ProductionOperationCode != nil {
		value := strings.ToUpper(*in.ProductionOperationCode)
		if value != ProductionWIPOperationFabricProcessing {
			return BOMItemUpdate{}, ErrBadParam
		}
		in.ProductionOperationCode = &value
	}
	in.Note = normalizeOptionalString(in.Note)
	if in.MaterialID <= 0 ||
		in.UnitID <= 0 ||
		in.LossRate.Cmp(decimal.Zero) < 0 {
		return BOMItemUpdate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return BOMItemUpdate{}, ErrBadParam
	}
	return in, nil
}
