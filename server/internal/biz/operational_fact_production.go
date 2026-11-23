package biz

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
)

type ProductionFact struct {
	ID          int
	FactNo      string
	FactType    string
	Status      string
	Version     int
	SubjectType string
	SubjectID   int
	// Display fields are read projections; source-line snapshots own product identity.
	SubjectName           string
	SubjectCode           string
	SKUCodeSnapshot       string
	WarehouseName         string
	WarehouseCode         string
	UnitName              string
	LotNo                 string
	ProductSkuID          *int
	WarehouseID           int
	UnitID                int
	LotID                 *int
	Quantity              decimal.Decimal
	SourceType            *string
	SourceID              *int
	SourceNo              *string
	SourceLineID          *int
	ProductionWIPBatchID  *int
	ProductionOrderID     *int
	ProductionOrderItemID *int
	IdempotencyKey        string
	OccurredAt            time.Time
	PostedAt              *time.Time
	PostedBy              *int
	PostedByName          *string
	CancelledAt           *time.Time
	CancelledBy           *int
	CancelledByName       *string
	CancelReason          *string
	Note                  *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// ProductionCompletionFromOrderCreate carries only operator-owned completion
// fields. Product, SKU, unit and source references are resolved from the
// production-order item by the server.
type ProductionCompletionFromOrderCreate struct {
	FactNo                string
	ProductionOrderID     int
	ProductionOrderItemID int
	ProductionWIPBatchID  int
	WarehouseID           int
	LotID                 *int
	NewLotNo              *string
	Quantity              decimal.Decimal
	IdempotencyKey        string
	OccurredAt            time.Time
	OccurredAtSpecified   bool
	Note                  *string
}

// ProductionFactDraftSave contains only operator-owned fields that may change
// before a production fact is posted. Fact/source identity is supplied by the
// type-specific usecase and revalidated by the repository transaction.
type ProductionFactDraftSave struct {
	ID              int
	ExpectedVersion int
	FactType        string
	SourceType      string
	FactNo          string
	WarehouseID     int
	LotID           *int
	NewLotNo        *string
	Quantity        decimal.Decimal
	OccurredAt      time.Time
	Note            *string
}

// ProductionMaterialIssueFromOrderCreate contains only operator-owned issue
// fields. Material, unit and source linkage are resolved from the immutable
// production-order material requirement inside the repository transaction.
type ProductionMaterialIssueFromOrderCreate struct {
	FactNo                               string
	ProductionOrderID                    int
	ProductionOrderItemID                int
	ProductionOrderMaterialRequirementID int
	WarehouseID                          int
	LotID                                *int
	Quantity                             decimal.Decimal
	IdempotencyKey                       string
	OccurredAt                           time.Time
	OccurredAtSpecified                  bool
	Note                                 *string
}

// ProductionReworkFromCompletionCreate contains only operator-owned fields.
// The returned product, warehouse, unit and batch are derived from a posted
// finished-goods completion fact.
type ProductionReworkFromCompletionCreate struct {
	FactNo                 string
	SourceCompletionFactID int
	Quantity               decimal.Decimal
	IdempotencyKey         string
	OccurredAt             time.Time
	OccurredAtSpecified    bool
	Reason                 string
}

type ProductionFactRepo interface {
	ProductionCompletionSourceRepo
	ProductionMaterialIssueFromOrderRepo
	ProductionFactDraftSaveRepo
	ProductionReworkFromCompletionRepo
	ProductionFactTransitionPolicyRepo
	CreateProductionFactDraft(ctx context.Context, in *OperationalFactMutation) (*ProductionFact, error)
	PostProductionFact(ctx context.Context, in *OperationalFactStatusMutation) (*ProductionFact, error)
	CancelPostedProductionFact(ctx context.Context, in *OperationalFactStatusMutation) (*ProductionFact, error)
	ListProductionFacts(ctx context.Context, filter OperationalFactFilter) ([]*ProductionFact, int, error)
}

// ProductionFactDraftSaveRepo owns protected replacement of production drafts.
type ProductionFactDraftSaveRepo interface {
	SaveProductionFactDraft(ctx context.Context, in *ProductionFactDraftSave) (*ProductionFact, error)
}

// ProductionFactTransitionPolicy is the immutable server-side classification
// used to authorize a production fact transition before mutating it.
type ProductionFactTransitionPolicy struct {
	FactType           string
	Status             string
	WasPosted          bool
	RequiresSourceTask bool
}

// ProductionFactTransitionPolicyRepo keeps fact type, current status and
// Workflow dependency classification in the repository truth. The service
// uses the result to separate production reporting from warehouse inbound.
type ProductionFactTransitionPolicyRepo interface {
	GetProductionFactTransitionPolicy(ctx context.Context, id int) (*ProductionFactTransitionPolicy, error)
}

// ProductionCompletionSourceRepo resolves the immutable production-order line
// fields used by the source-linked production fact path.
type ProductionCompletionSourceRepo interface {
	ResolveProductionCompletionSource(ctx context.Context, productionOrderID, productionOrderItemID int) (*ProductionOrderItem, error)
}

// ProductionMaterialIssueFromOrderRepo owns the source and inventory lock
// order for material issues and exposes the release snapshot projection.
type ProductionMaterialIssueFromOrderRepo interface {
	CreateProductionMaterialIssueFromOrder(ctx context.Context, in *ProductionMaterialIssueFromOrderCreate) (*ProductionFact, error)
	ListProductionOrderMaterialRequirements(ctx context.Context, productionOrderID int) ([]*ProductionOrderMaterialRequirement, error)
}

// ProductionReworkFromCompletionRepo owns the source completion lock and
// derives the outbound rework grain in the same transaction as draft create.
type ProductionReworkFromCompletionRepo interface {
	CreateProductionReworkFromCompletion(ctx context.Context, in *ProductionReworkFromCompletionCreate) (*ProductionFact, error)
}

type ProductionFactUsecaseRepo interface {
	ProductionFactRepo
	operationalItemReferenceRepo
}

type ProductionFactUsecase struct {
	repo ProductionFactUsecaseRepo
}

func NewProductionFactUsecase(repo ProductionFactUsecaseRepo) *ProductionFactUsecase {
	return &ProductionFactUsecase{repo: repo}
}

func (uc *ProductionFactUsecase) CreateProductionCompletionFromOrder(ctx context.Context, in *ProductionCompletionFromOrderCreate) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionCompletionFromOrderCreate(in)
	if err != nil {
		return nil, err
	}
	if normalized.LotID == nil && normalized.NewLotNo == nil {
		return nil, ErrOperationalInboundLotRequired
	}
	if normalized.LotID != nil && normalized.NewLotNo != nil {
		return nil, ErrBadParam
	}
	sourceRepo := uc.repo
	source, err := sourceRepo.ResolveProductionCompletionSource(ctx, normalized.ProductionOrderID, normalized.ProductionOrderItemID)
	if err != nil {
		return nil, err
	}
	if source == nil || source.ID != normalized.ProductionOrderItemID || source.ProductionOrderID != normalized.ProductionOrderID || source.ProductID <= 0 || source.UnitID <= 0 {
		return nil, ErrProductionOrderFactSourceInvalid
	}
	sourceType := ProductionOrderSourceType
	sourceID := normalized.ProductionOrderID
	sourceLineID := normalized.ProductionOrderItemID
	var productionWIPBatchID *int
	if normalized.ProductionWIPBatchID > 0 {
		value := normalized.ProductionWIPBatchID
		productionWIPBatchID = &value
	}
	occurredAt := normalized.OccurredAt
	if !normalized.OccurredAtSpecified {
		// CreateProductionFactDraft performs the shared normalization. Preserve
		// an omitted operator timestamp as an omitted idempotency intent instead
		// of turning the first generated clock value into a specified value.
		occurredAt = time.Time{}
	}
	return uc.CreateProductionFactDraft(ctx, &OperationalFactMutation{
		FactNo:               normalized.FactNo,
		FactType:             ProductionFactFinishedGoodsReceipt,
		SubjectType:          InventorySubjectProduct,
		SubjectID:            source.ProductID,
		ProductSkuID:         source.ProductSKUID,
		WarehouseID:          normalized.WarehouseID,
		UnitID:               source.UnitID,
		LotID:                normalized.LotID,
		NewLotNo:             normalized.NewLotNo,
		Quantity:             normalized.Quantity,
		SourceType:           &sourceType,
		SourceID:             &sourceID,
		SourceLineID:         &sourceLineID,
		ProductionWIPBatchID: productionWIPBatchID,
		IdempotencyKey:       normalized.IdempotencyKey,
		OccurredAt:           occurredAt,
		OccurredAtSpecified:  normalized.OccurredAtSpecified,
		Note:                 normalized.Note,
	})
}

func (uc *ProductionFactUsecase) CreateProductionMaterialIssueFromOrder(ctx context.Context, in *ProductionMaterialIssueFromOrderCreate) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionMaterialIssueFromOrderCreate(in)
	if err != nil {
		return nil, err
	}
	repo := uc.repo
	return repo.CreateProductionMaterialIssueFromOrder(ctx, normalized)
}

func (uc *ProductionFactUsecase) SaveProductionMaterialIssueDraft(ctx context.Context, in *ProductionFactDraftSave) (*ProductionFact, error) {
	return uc.saveProductionFactDraft(ctx, in, ProductionFactMaterialIssue, ProductionOrderSourceType)
}

func (uc *ProductionFactUsecase) SaveProductionCompletionDraft(ctx context.Context, in *ProductionFactDraftSave) (*ProductionFact, error) {
	return uc.saveProductionFactDraft(ctx, in, ProductionFactFinishedGoodsReceipt, ProductionOrderSourceType)
}

func (uc *ProductionFactUsecase) SaveProductionReworkFromCompletionDraft(ctx context.Context, in *ProductionFactDraftSave) (*ProductionFact, error) {
	return uc.saveProductionFactDraft(ctx, in, ProductionFactRework, ProductionFactSourceType)
}

func (uc *ProductionFactUsecase) saveProductionFactDraft(ctx context.Context, in *ProductionFactDraftSave, factType, sourceType string) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionFactDraftSave(in, factType, sourceType)
	if err != nil {
		return nil, err
	}
	repo := uc.repo
	return repo.SaveProductionFactDraft(ctx, normalized)
}

func (uc *ProductionFactUsecase) CreateProductionReworkFromCompletion(ctx context.Context, in *ProductionReworkFromCompletionCreate) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionReworkFromCompletionCreate(in)
	if err != nil {
		return nil, err
	}
	repo := uc.repo
	return repo.CreateProductionReworkFromCompletion(ctx, normalized)
}

func (uc *ProductionFactUsecase) ListProductionOrderMaterialRequirements(ctx context.Context, productionOrderID int) ([]*ProductionOrderMaterialRequirement, error) {
	if uc == nil || uc.repo == nil || productionOrderID <= 0 {
		return nil, ErrBadParam
	}
	repo := uc.repo
	return repo.ListProductionOrderMaterialRequirements(ctx, productionOrderID)
}

func (uc *ProductionFactUsecase) CreateProductionFactDraft(ctx context.Context, in *OperationalFactMutation) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOperationalFactMutation(in, productionFactTypes)
	if err != nil {
		return nil, err
	}
	productionOrderLinked := normalized.SourceType != nil && *normalized.SourceType == ProductionOrderSourceType
	if !productionOrderLinked {
		if err := validateOperationalSubjectActive(ctx, uc.repo, normalized.SubjectType, normalized.SubjectID); err != nil {
			return nil, err
		}
		if err := requireOptionalActiveReference(ctx, normalized.ProductSkuID, uc.repo.ProductSKUIsActive, ErrProductSKUInactive); err != nil {
			return nil, err
		}
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.UnitID, uc.repo.UnitIsActive, ErrUnitInactive); err != nil {
		return nil, err
	}
	return uc.repo.CreateProductionFactDraft(ctx, normalized)
}

func (uc *ProductionFactUsecase) PostProductionFact(ctx context.Context, in *OperationalFactStatusMutation) (_ *ProductionFact, err error) {
	ctx, finish := startBusinessTrace(ctx, "production.post_fact")
	defer func() { finish(err) }()
	normalized, err := normalizeOperationalFactStatusMutation(in, false)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	return uc.repo.PostProductionFact(ctx, normalized)
}

func (uc *ProductionFactUsecase) CancelPostedProductionFact(ctx context.Context, in *OperationalFactStatusMutation) (*ProductionFact, error) {
	normalized, err := normalizeOperationalFactStatusMutation(in, true)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedProductionFact(ctx, normalized)
}

func (uc *ProductionFactUsecase) ListProductionFacts(ctx context.Context, filter OperationalFactFilter) ([]*ProductionFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeProductionFactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListProductionFacts(ctx, normalized)
}

func (uc *ProductionFactUsecase) GetProductionFactTransitionPolicy(ctx context.Context, id int) (*ProductionFactTransitionPolicy, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	repo := uc.repo
	policy, err := repo.GetProductionFactTransitionPolicy(ctx, id)
	if err != nil {
		return nil, err
	}
	if policy == nil {
		return nil, ErrBadParam
	}
	if _, ok := productionFactTypes[policy.FactType]; !ok {
		return nil, ErrBadParam
	}
	if _, ok := postedOperationalFactStatuses[policy.Status]; !ok {
		return nil, ErrBadParam
	}
	copy := *policy
	return &copy, nil
}

var productionFactTypes = map[string]struct{}{
	ProductionFactMaterialIssue:        {},
	ProductionFactFinishedGoodsReceipt: {},
	ProductionFactRework:               {},
}
