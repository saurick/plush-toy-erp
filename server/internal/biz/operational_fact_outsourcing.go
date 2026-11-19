package biz

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
)

type OutsourcingFact struct {
	ID           int
	FactNo       string
	FactType     string
	Status       string
	Version      int
	SubjectType  string
	SubjectID    int
	SubjectName  string
	SubjectCode  string
	ProductSkuID *int
	// SKUCodeSnapshot is a read projection from the immutable source order line.
	// It is not persisted on outsourcing_facts and must not be inferred from an ID.
	SKUCodeSnapshot *string
	WarehouseID     int
	UnitID          int
	LotID           *int
	// LotNo identifies the inventory lot linked to a readable outsourcing fact.
	LotNo                    *string
	Quantity                 decimal.Decimal
	SupplierID               *int
	SupplierName             *string
	SourceType               *string
	SourceID                 *int
	SourceNo                 *string
	SourceLineID             *int
	IdempotencyKey           string
	OccurredAt               time.Time
	PostedAt                 *time.Time
	PostedBy                 *int
	PostedByName             *string
	CancelledAt              *time.Time
	CancelledBy              *int
	CancelledByName          *string
	CancelReason             *string
	Note                     *string
	CreatedAt                time.Time
	UpdatedAt                time.Time
	ReturnedToVendorQuantity decimal.Decimal
}

// OutsourcingFactFromOrderCreate contains only operator-owned fields. The
// fact type, supplier, subject, unit and source linkage are resolved from the
// locked outsourcing-order item by the repository transaction.
type OutsourcingFactFromOrderCreate struct {
	FactNo                 string
	OutsourcingOrderID     int
	OutsourcingOrderItemID int
	WarehouseID            int
	LotID                  *int
	NewLotNo               *string
	Quantity               decimal.Decimal
	IdempotencyKey         string
	OccurredAt             time.Time
	OccurredAtSpecified    bool
	Note                   *string
}

// OutsourcingFactDraftSave keeps the source order and line immutable while a
// DRAFT fact's operator-entered warehouse, lot, quantity, time and note change.
type OutsourcingFactDraftSave struct {
	ID              int
	ExpectedVersion int
	FactType        string
	WarehouseID     int
	LotID           *int
	NewLotNo        *string
	Quantity        decimal.Decimal
	OccurredAt      time.Time
	Note            *string
}

type OutsourcingFactRepo interface {
	OutsourcingFactFromOrderRepo
	OutsourcingFactDraftSaveRepo
	CreateOutsourcingFactDraft(ctx context.Context, in *OperationalFactMutation) (*OutsourcingFact, error)
	PostOutsourcingFact(ctx context.Context, in *OperationalFactStatusMutation) (*OutsourcingFact, error)
	CancelPostedOutsourcingFact(ctx context.Context, in *OperationalFactStatusMutation) (*OutsourcingFact, error)
	ListOutsourcingFacts(ctx context.Context, filter OperationalFactFilter) ([]*OutsourcingFact, int, error)
}

// OutsourcingFactDraftSaveRepo is the protected DRAFT update capability for
// source-derived outsourcing facts.
type OutsourcingFactDraftSaveRepo interface {
	SaveOutsourcingFactDraft(ctx context.Context, in *OutsourcingFactDraftSave) (*OutsourcingFact, error)
}

// OutsourcingFactFromOrderRepo owns source locking, source-field derivation
// and draft insertion in one transaction. The generic create path remains an
// internal repository capability and is not a public API.
type OutsourcingFactFromOrderRepo interface {
	CreateOutsourcingMaterialIssueFromOrder(ctx context.Context, in *OutsourcingFactFromOrderCreate) (*OutsourcingFact, error)
	CreateOutsourcingReturnReceiptFromOrder(ctx context.Context, in *OutsourcingFactFromOrderCreate) (*OutsourcingFact, error)
}

func (uc *OperationalFactUsecase) CreateOutsourcingFactDraft(ctx context.Context, in *OperationalFactMutation) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOperationalFactMutation(in, outsourcingFactTypes)
	if err != nil {
		return nil, err
	}
	normalized.SupplierName = normalizeOptionalString(normalized.SupplierName)
	if err := uc.validateOperationalSubjectActive(ctx, normalized.SubjectType, normalized.SubjectID); err != nil {
		return nil, err
	}
	if err := requireOptionalActiveReference(ctx, normalized.ProductSkuID, uc.repo.ProductSKUIsActive, ErrProductSKUInactive); err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.UnitID, uc.repo.UnitIsActive, ErrUnitInactive); err != nil {
		return nil, err
	}
	if err := requireOptionalActiveReference(ctx, normalized.SupplierID, uc.repo.SupplierIsActive, ErrSupplierInactive); err != nil {
		return nil, err
	}
	return uc.repo.CreateOutsourcingFactDraft(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateOutsourcingMaterialIssueFromOrder(ctx context.Context, in *OutsourcingFactFromOrderCreate) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOutsourcingFactFromOrderCreate(in)
	if err != nil {
		return nil, err
	}
	if normalized.NewLotNo != nil {
		return nil, ErrBadParam
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	repo := uc.repo
	return repo.CreateOutsourcingMaterialIssueFromOrder(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateOutsourcingReturnReceiptFromOrder(ctx context.Context, in *OutsourcingFactFromOrderCreate) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOutsourcingFactFromOrderCreate(in)
	if err != nil {
		return nil, err
	}
	if normalized.LotID == nil && normalized.NewLotNo == nil {
		return nil, ErrOperationalInboundLotRequired
	}
	if normalized.LotID != nil && normalized.NewLotNo != nil {
		return nil, ErrBadParam
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	repo := uc.repo
	return repo.CreateOutsourcingReturnReceiptFromOrder(ctx, normalized)
}

func (uc *OperationalFactUsecase) SaveOutsourcingMaterialIssueDraft(ctx context.Context, in *OutsourcingFactDraftSave) (*OutsourcingFact, error) {
	return uc.saveOutsourcingFactDraft(ctx, in, OutsourcingFactMaterialIssue)
}

func (uc *OperationalFactUsecase) SaveOutsourcingReturnReceiptDraft(ctx context.Context, in *OutsourcingFactDraftSave) (*OutsourcingFact, error) {
	return uc.saveOutsourcingFactDraft(ctx, in, OutsourcingFactReturnReceipt)
}

func (uc *OperationalFactUsecase) saveOutsourcingFactDraft(ctx context.Context, in *OutsourcingFactDraftSave, factType string) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOutsourcingFactDraftSave(in, factType)
	if err != nil {
		return nil, err
	}
	repo := uc.repo
	return repo.SaveOutsourcingFactDraft(ctx, normalized)
}

func (uc *OperationalFactUsecase) PostOutsourcingFact(ctx context.Context, in *OperationalFactStatusMutation) (_ *OutsourcingFact, err error) {
	ctx, finish := startBusinessTrace(ctx, "outsourcing.post_fact")
	defer func() { finish(err) }()
	normalized, err := normalizeOperationalFactStatusMutation(in, false)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	return uc.repo.PostOutsourcingFact(ctx, normalized)
}

func (uc *OperationalFactUsecase) CancelPostedOutsourcingFact(ctx context.Context, in *OperationalFactStatusMutation) (*OutsourcingFact, error) {
	normalized, err := normalizeOperationalFactStatusMutation(in, true)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedOutsourcingFact(ctx, normalized)
}

func (uc *OperationalFactUsecase) ListOutsourcingFacts(ctx context.Context, filter OperationalFactFilter) ([]*OutsourcingFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeOutsourcingFactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListOutsourcingFacts(ctx, normalized)
}

var outsourcingFactTypes = map[string]struct{}{
	OutsourcingFactMaterialIssue: {},
	OutsourcingFactReturnReceipt: {},
}
