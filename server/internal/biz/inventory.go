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
	ErrPurchaseReceiptNotFound               = errors.New("purchase receipt not found")
	ErrPurchaseReceiptItemNotFound           = errors.New("purchase receipt item not found")
	ErrPurchaseReturnNotFound                = errors.New("purchase return not found")
	ErrPurchaseReturnItemNotFound            = errors.New("purchase return item not found")
	ErrPurchaseReceiptAdjustmentNotFound     = errors.New("purchase receipt adjustment not found")
	ErrPurchaseReceiptAdjustmentItemNotFound = errors.New("purchase receipt adjustment item not found")
	ErrQualityInspectionNotFound             = errors.New("quality inspection not found")
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
	BOMStatusDisabled = "DISABLED"

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
		BOMStatusDisabled: {},
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
	ID                     int
	SubjectType            string
	SubjectID              int
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

type InventoryBalanceFilter struct {
	SubjectType string
	SubjectID   int
	WarehouseID int
	LotID       int
	Keyword     string
	Limit       int
	Offset      int
}

type InventoryLotFilter struct {
	SubjectType string
	SubjectID   int
	Status      string
	Keyword     string
	Limit       int
	Offset      int
}

type InventoryTxnFilter struct {
	SubjectType string
	SubjectID   int
	WarehouseID int
	LotID       int
	TxnType     string
	SourceType  string
	SourceID    int
	Keyword     string
	Limit       int
	Offset      int
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

type BOMHeaderUpdate struct {
	Version       string
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

type BOMItemUpdate struct {
	MaterialID int
	Quantity   decimal.Decimal
	UnitID     int
	LossRate   decimal.Decimal
	Position   *string
	Note       *string
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

type InventoryTxnApplyResult struct {
	Txn              *InventoryTxn
	Balance          *InventoryBalance
	IdempotentReplay bool
}

type InventoryRepo interface {
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
	CreatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, error)
	AddPurchaseReceiptItem(ctx context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, error)
	PostPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error)
	CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error)
	GetPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error)
	ListPurchaseReceipts(ctx context.Context, filter PurchaseReceiptFilter) ([]*PurchaseReceipt, int, error)
	CreatePurchaseReturnDraft(ctx context.Context, in *PurchaseReturnCreate) (*PurchaseReturn, error)
	AddPurchaseReturnItem(ctx context.Context, in *PurchaseReturnItemCreate) (*PurchaseReturnItem, error)
	PostPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error)
	CancelPostedPurchaseReturn(ctx context.Context, returnID int) (*PurchaseReturn, error)
	GetPurchaseReturn(ctx context.Context, id int) (*PurchaseReturn, error)
	CreatePurchaseReceiptAdjustmentDraft(ctx context.Context, in *PurchaseReceiptAdjustmentCreate) (*PurchaseReceiptAdjustment, error)
	AddPurchaseReceiptAdjustmentItem(ctx context.Context, in *PurchaseReceiptAdjustmentItemCreate) (*PurchaseReceiptAdjustmentItem, error)
	PostPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*PurchaseReceiptAdjustment, error)
	CancelPostedPurchaseReceiptAdjustment(ctx context.Context, adjustmentID int) (*PurchaseReceiptAdjustment, error)
	GetPurchaseReceiptAdjustment(ctx context.Context, id int) (*PurchaseReceiptAdjustment, error)
	CreateQualityInspectionDraft(ctx context.Context, in *QualityInspectionCreate) (*QualityInspection, error)
	SubmitQualityInspection(ctx context.Context, inspectionID int) (*QualityInspection, error)
	PassQualityInspection(ctx context.Context, in *QualityInspectionDecision) (*QualityInspection, error)
	RejectQualityInspection(ctx context.Context, in *QualityInspectionDecision) (*QualityInspection, error)
	CancelQualityInspection(ctx context.Context, inspectionID int, decisionNote *string) (*QualityInspection, error)
	GetQualityInspection(ctx context.Context, id int) (*QualityInspection, error)
	ListQualityInspections(ctx context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error)
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
	return uc.repo.UpdateBOMDraftItem(ctx, id, &normalized)
}

func (uc *InventoryUsecase) DeleteBOMDraftItem(ctx context.Context, id int) error {
	if uc == nil || uc.repo == nil || id <= 0 {
		return ErrBadParam
	}
	return uc.repo.DeleteBOMDraftItem(ctx, id)
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
	normalized.Status = BOMStatusDraft
	return uc.repo.CopyBOMVersion(ctx, sourceHeaderID, &normalized)
}

func (uc *InventoryUsecase) ActivateBOMVersion(ctx context.Context, id int) (*BOMVersionDetail, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ActivateBOMVersion(ctx, id)
}

func (uc *InventoryUsecase) ArchiveBOMVersion(ctx context.Context, id int) (*BOMHeader, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
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

func normalizeInventoryBalanceFilter(in InventoryBalanceFilter) (InventoryBalanceFilter, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.SubjectType != "" && !IsValidInventorySubjectType(in.SubjectType) {
		return InventoryBalanceFilter{}, ErrBadParam
	}
	normalizeInventoryListPagination(&in.Limit, &in.Offset)
	return in, nil
}

func normalizeInventoryLotFilter(in InventoryLotFilter) (InventoryLotFilter, error) {
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.SubjectType != "" && !IsValidInventorySubjectType(in.SubjectType) {
		return InventoryLotFilter{}, ErrBadParam
	}
	if in.Status != "" && !IsValidInventoryLotStatus(in.Status) {
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
	if in.SubjectType != "" && !IsValidInventorySubjectType(in.SubjectType) {
		return InventoryTxnFilter{}, ErrBadParam
	}
	if in.TxnType != "" && !IsValidInventoryTxnType(in.TxnType) {
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

func normalizeBOMHeaderUpdate(in BOMHeaderUpdate) (BOMHeaderUpdate, error) {
	in.Version = strings.TrimSpace(in.Version)
	in.Note = normalizeOptionalString(in.Note)
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
