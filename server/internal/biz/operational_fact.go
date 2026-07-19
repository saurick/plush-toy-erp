package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	corestatus "server/internal/core/status"
	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

const (
	OperationalFactStatusDraft     = "DRAFT"
	OperationalFactStatusPosted    = "POSTED"
	OperationalFactStatusCancelled = "CANCELLED"
	OperationalFactStatusSettled   = "SETTLED"

	ProductionFactSourceType           = "PRODUCTION_FACT"
	ProductionFactMaterialIssue        = "MATERIAL_ISSUE"
	ProductionFactFinishedGoodsReceipt = "FINISHED_GOODS_RECEIPT"
	ProductionFactRework               = "REWORK"

	OutsourcingFactSourceType    = "OUTSOURCING_FACT"
	OutsourcingOrderSourceType   = "OUTSOURCING_ORDER"
	OutsourcingFactMaterialIssue = "MATERIAL_ISSUE"
	OutsourcingFactReturnReceipt = "RETURN_RECEIPT"

	ShipmentSourceType      = "SHIPMENT"
	ShipmentStatusDraft     = corestatus.ShipmentDraft
	ShipmentStatusShipped   = corestatus.ShipmentShipped
	ShipmentStatusCancelled = corestatus.ShipmentCancelled

	StockReservationStatusActive    = "ACTIVE"
	StockReservationStatusReleased  = "RELEASED"
	StockReservationStatusConsumed  = "CONSUMED"
	StockReservationStatusCancelled = "CANCELLED"

	FinanceFactReceivable               = "RECEIVABLE"
	FinanceFactPayable                  = "PAYABLE"
	FinanceFactInvoice                  = "INVOICE"
	FinanceFactPayment                  = "PAYMENT"
	FinanceFactReconciliation           = "RECONCILIATION"
	FinanceCounterpartyCustomer         = "CUSTOMER"
	FinanceCounterpartySupplier         = "SUPPLIER"
	FinanceCounterpartyOther            = "OTHER"
	FinanceCurrencyUSD                  = "USD"
	FinanceCurrencyCNY                  = "CNY"
	FinanceCurrencyHKD                  = "HKD"
	FinanceCollectionAdvanceReceipt     = "ADVANCE_RECEIPT"
	FinanceCollectionAccountsReceivable = "ACCOUNTS_RECEIVABLE"
	FinancePaymentTermCashOnShipment    = "CASH_ON_SHIPMENT"
	FinancePaymentTermEOM30             = "EOM_30"
	FinancePaymentTermEOM45             = "EOM_45"
	FinanceInvoiceCategoryNone          = "NONE"
	FinanceInvoiceCategoryExportGeneral = "EXPORT_GENERAL"
	FinanceInvoiceCategoryVATGeneral1   = "VAT_GENERAL_1"
	FinanceInvoiceCategoryVATSpecial3   = "VAT_SPECIAL_3"
	FinanceInvoiceCategoryVATSpecial13  = "VAT_SPECIAL_13"
)

var (
	ErrProductionFactNotFound               = errors.New("production fact not found")
	ErrProductionReworkSourceInvalid        = errors.New("production rework source invalid")
	ErrProductionReworkSourceState          = errors.New("production rework source state does not allow creation")
	ErrProductionReworkQuantityExceeded     = errors.New("production rework quantity exceeds source completion")
	ErrProductionReworkDependency           = errors.New("production completion has active rework")
	ErrOperationalInboundLotRequired        = errors.New("source-driven inbound requires an existing or new lot")
	ErrOutsourcingFactNotFound              = errors.New("outsourcing fact not found")
	ErrOutsourcingOrderFactSourceInvalid    = errors.New("outsourcing order fact source invalid")
	ErrOutsourcingOrderFactInvalidState     = errors.New("outsourcing order does not allow fact mutation")
	ErrOutsourcingOrderFactQuantityExceeded = errors.New("outsourcing fact quantity exceeds order item")
	ErrOutsourcingOrderFactDependency       = errors.New("outsourcing order has posted outsourcing facts")
	ErrOutsourcingReturnQualityDependency   = errors.New("outsourcing return has active quality inspection")
	ErrShipmentNotFound                     = errors.New("shipment not found")
	ErrShipmentItemNotFound                 = errors.New("shipment item not found")
	ErrShipmentSourceMismatch               = errors.New("shipment source mismatch")
	ErrShipmentOrderNotActive               = errors.New("shipment sales order not active")
	ErrShipmentQuantityExceeded             = errors.New("shipment quantity exceeds sales order")
	ErrShipmentReservationSplit             = errors.New("shipment requires partial reservation consumption")
	ErrShipmentFinanceDependency            = errors.New("shipment has active finance facts")
	ErrShipmentQualityPending               = errors.New("shipment has pending finished goods quality inspection")
	ErrShipmentQualityRejected              = errors.New("shipment has rejected finished goods quality inspection")
	ErrShipmentReleaseRequired              = errors.New("shipment release task is required")
	ErrShipmentReleasePending               = errors.New("shipment release task is not completed")
	ErrShipmentReleaseRejected              = errors.New("shipment release task was rejected")
	ErrShipmentReleaseAlreadySubmitted      = errors.New("shipment release was already submitted")
	ErrShipmentCancellationProcessActive    = errors.New("shipment finished goods delivery process is still active")
	ErrShipmentCancellationTaskActive       = errors.New("shipment release task is still active")
	ErrProductionExceptionTaskRequired      = errors.New("production exception task is required")
	ErrProductionExceptionTaskActive        = errors.New("production exception task is still active")
	ErrStockReservationNotFound             = errors.New("stock reservation not found")
	ErrStockReservationSourceMismatch       = errors.New("stock reservation source mismatch")
	ErrStockReservationQuantityExceeded     = errors.New("stock reservation quantity exceeds sales order")
	ErrFinanceFactNotFound                  = errors.New("finance fact not found")
	ErrFinanceFactSourceInvalid             = errors.New("finance fact source invalid")
	ErrFinanceFactSourceConflict            = errors.New("active finance fact already exists for source")
	ErrFinanceFactShipmentAmountInvalid     = errors.New("shipment finance amount snapshot is incomplete")
	ErrFinanceFactPaymentTermMissing        = errors.New("shipment sales order payment term is missing")
	ErrFinanceFactInvoiceCategoryMissing    = errors.New("invoice category is required")
	ErrFinanceFactSettlementNotAllowed      = errors.New("finance fact type cannot be settled")
)

type ProductionFact struct {
	ID             int
	FactNo         string
	FactType       string
	Status         string
	SubjectType    string
	SubjectID      int
	ProductSkuID   *int
	WarehouseID    int
	UnitID         int
	LotID          *int
	Quantity       decimal.Decimal
	SourceType     *string
	SourceID       *int
	SourceNo       *string
	SourceLineID   *int
	IdempotencyKey string
	OccurredAt     time.Time
	PostedAt       *time.Time
	Note           *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type OutsourcingFact struct {
	ID           int
	FactNo       string
	FactType     string
	Status       string
	SubjectType  string
	SubjectID    int
	ProductSkuID *int
	// SKUCodeSnapshot is a read projection from the immutable source order line.
	// It is not persisted on outsourcing_facts and must not be inferred from an ID.
	SKUCodeSnapshot *string
	WarehouseID     int
	UnitID          int
	LotID           *int
	Quantity        decimal.Decimal
	SupplierID      *int
	SupplierName    *string
	SourceType      *string
	SourceID        *int
	SourceNo        *string
	SourceLineID    *int
	IdempotencyKey  string
	OccurredAt      time.Time
	PostedAt        *time.Time
	Note            *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Shipment struct {
	ID               int
	ShipmentNo       string
	SalesOrderID     *int
	CustomerID       *int
	CustomerSnapshot *string
	Status           string
	IdempotencyKey   string
	PlannedShipAt    *time.Time
	ShippedAt        *time.Time
	TotalNetWeightG  *decimal.Decimal
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Items            []*ShipmentItem
}

type ShipmentItem struct {
	ID                     int
	ShipmentID             int
	SalesOrderItemID       *int
	ProductID              int
	ProductSkuID           *int
	WarehouseID            int
	UnitID                 int
	LotID                  *int
	Quantity               decimal.Decimal
	UnitNetWeightGSnapshot *decimal.Decimal
	UnitPriceSnapshot      *decimal.Decimal
	AmountSnapshot         *decimal.Decimal
	CurrencySnapshot       *string
	Note                   *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type StockReservation struct {
	ID               int
	ReservationNo    string
	Status           string
	SalesOrderID     *int
	SalesOrderItemID *int
	ProductID        int
	ProductSkuID     *int
	WarehouseID      int
	UnitID           int
	LotID            *int
	Quantity         decimal.Decimal
	IdempotencyKey   string
	ReservedAt       time.Time
	ReleasedAt       *time.Time
	ConsumedAt       *time.Time
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type FinanceFact struct {
	ID               int
	FactNo           string
	FactType         string
	Status           string
	CounterpartyType string
	CounterpartyID   *int
	Amount           decimal.Decimal
	FeeAmount        decimal.Decimal
	Currency         string
	CollectionType   *string
	PaymentTerm      *string
	PaymentTermDays  *int
	InvoiceCategory  *string
	SourceType       *string
	SourceID         *int
	SourceNo         *string
	SourceLineID     *int
	IdempotencyKey   string
	OccurredAt       time.Time
	PostedAt         *time.Time
	SettledAt        *time.Time
	CancelledAt      *time.Time
	CancelledBy      *int
	CancelledByName  *string
	CancelReason     *string
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type OperationalFactMutation struct {
	FactNo       string
	FactType     string
	SubjectType  string
	SubjectID    int
	ProductSkuID *int
	WarehouseID  int
	UnitID       int
	LotID        *int
	// NewLotNo is accepted only by source-driven inbound commands. The data
	// layer resolves or creates the derived subject lot in the same transaction
	// and persists only LotID on the fact.
	NewLotNo            *string
	Quantity            decimal.Decimal
	SupplierID          *int
	SupplierName        *string
	SourceType          *string
	SourceID            *int
	SourceLineID        *int
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Note                *string
}

// ProductionCompletionFromOrderCreate carries only operator-owned completion
// fields. Product, SKU, unit and source references are resolved from the
// production-order item by the server.
type ProductionCompletionFromOrderCreate struct {
	FactNo                string
	ProductionOrderID     int
	ProductionOrderItemID int
	WarehouseID           int
	LotID                 *int
	NewLotNo              *string
	Quantity              decimal.Decimal
	IdempotencyKey        string
	OccurredAt            time.Time
	OccurredAtSpecified   bool
	Note                  *string
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

type ShipmentCreate struct {
	ShipmentNo       string
	SalesOrderID     *int
	CustomerID       *int
	CustomerSnapshot *string
	IdempotencyKey   string
	PlannedShipAt    *time.Time
	TotalNetWeightG  *decimal.Decimal
	Note             *string
}

type ShipmentItemCreate struct {
	SalesOrderItemID *int
	ProductID        int
	ProductSkuID     *int
	WarehouseID      int
	UnitID           int
	LotID            *int
	Quantity         decimal.Decimal
	Note             *string
}

type ShipmentCreateWithItems struct {
	Shipment *ShipmentCreate
	Items    []*ShipmentItemCreate
}

type StockReservationCreate struct {
	ReservationNo       string
	SalesOrderID        *int
	SalesOrderItemID    *int
	ProductID           int
	ProductSkuID        *int
	WarehouseID         int
	UnitID              int
	LotID               *int
	Quantity            decimal.Decimal
	IdempotencyKey      string
	ReservedAt          time.Time
	ReservedAtSpecified bool
	Note                *string
}

// StockReservationFromSalesOrderCreate contains only operator-owned fields.
// Product, SKU and unit are resolved from the locked sales-order item by the
// repository transaction.
type StockReservationFromSalesOrderCreate struct {
	ReservationNo       string
	SalesOrderID        int
	SalesOrderItemID    int
	WarehouseID         int
	LotID               *int
	Quantity            decimal.Decimal
	IdempotencyKey      string
	ReservedAt          time.Time
	ReservedAtSpecified bool
	Note                *string
}

type FinanceFactCreate struct {
	FactNo              string
	FactType            string
	CounterpartyType    string
	CounterpartyID      *int
	Amount              decimal.Decimal
	FeeAmount           decimal.Decimal
	Currency            string
	CollectionType      *string
	PaymentTerm         *string
	PaymentTermDays     *int
	InvoiceCategory     *string
	SourceType          *string
	SourceID            *int
	SourceLineID        *int
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Note                *string
}

// FinanceFactFromShipmentCreate contains only operator-owned fields. The
// finance type, customer, amount, currency and source linkage are resolved
// from the shipped shipment by the server.
type FinanceFactFromShipmentCreate struct {
	FactNo              string
	ShipmentID          int
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Note                *string
	InvoiceCategory     *string
}

type OperationalFactFilter struct {
	Status         string
	FactType       string
	Keyword        string
	DateField      string
	DateFrom       *time.Time
	DateTo         *time.Time
	SubjectType    string
	SubjectID      int
	WarehouseID    int
	LotID          int
	SourceType     string
	SourceID       int
	CustomerID     int
	ProductID      int
	ProductSkuID   int
	CounterpartyID int
	Limit          int
	Offset         int
}

type OperationalFactRepo interface {
	CustomerIsActive(ctx context.Context, id int) (bool, error)
	MaterialIsActive(ctx context.Context, id int) (bool, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)
	ProductSKUIsActive(ctx context.Context, id int) (bool, error)
	SupplierIsActive(ctx context.Context, id int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
	WarehouseIsActive(ctx context.Context, id int) (bool, error)
	CreateProductionFactDraft(ctx context.Context, in *OperationalFactMutation) (*ProductionFact, error)
	PostProductionFact(ctx context.Context, id int) (*ProductionFact, error)
	CancelPostedProductionFact(ctx context.Context, id int) (*ProductionFact, error)
	ListProductionFacts(ctx context.Context, filter OperationalFactFilter) ([]*ProductionFact, int, error)

	CreateOutsourcingFactDraft(ctx context.Context, in *OperationalFactMutation) (*OutsourcingFact, error)
	PostOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error)
	CancelPostedOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error)
	ListOutsourcingFacts(ctx context.Context, filter OperationalFactFilter) ([]*OutsourcingFact, int, error)

	CreateShipmentDraftWithItems(ctx context.Context, in *ShipmentCreateWithItems) (*Shipment, error)
	ShipShipment(ctx context.Context, id int) (*Shipment, error)
	CancelShippedShipment(ctx context.Context, id int) (*Shipment, error)
	GetShipment(ctx context.Context, id int) (*Shipment, error)
	ListShipments(ctx context.Context, filter OperationalFactFilter) ([]*Shipment, int, error)

	CreateStockReservation(ctx context.Context, in *StockReservationCreate) (*StockReservation, error)
	CreateStockReservationFromSalesOrder(ctx context.Context, in *StockReservationFromSalesOrderCreate) (*StockReservation, error)
	ReleaseStockReservation(ctx context.Context, id int) (*StockReservation, error)
	ListStockReservations(ctx context.Context, filter OperationalFactFilter) ([]*StockReservation, int, error)

	CreateFinanceFactDraft(ctx context.Context, in *FinanceFactCreate) (*FinanceFact, error)
	PostFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	SettleFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	CancelPostedFinanceFact(ctx context.Context, id int, actorID int, reason string) (*FinanceFact, error)
	ListFinanceFacts(ctx context.Context, filter OperationalFactFilter) ([]*FinanceFact, int, error)
}

// OperationalFactCancellationActorRepo is the authenticated path for shipment
// cancellation and, when already shipped, inventory compensation evidence.
type OperationalFactCancellationActorRepo interface {
	CancelShippedShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error)
}

// OperationalFactShipmentActorRepo is the authenticated direct-shipping path.
// It keeps the base repository contract stable for isolated adapters while the
// service fails closed if an implementation cannot preserve the actor.
type OperationalFactShipmentActorRepo interface {
	ShipShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error)
}

// ProductionFactPostingActorRepo preserves the authenticated actor on source-
// generated Workflow task events without widening the base repository contract
// used by isolated test doubles.
type ProductionFactPostingActorRepo interface {
	PostProductionFactWithActor(ctx context.Context, id int, actorID int) (*ProductionFact, error)
	CancelPostedProductionFactWithActor(ctx context.Context, id int, actorID int) (*ProductionFact, error)
}

// ProductionFactSourceTaskDependencyRepo lets the service apply the Workflow
// module gate only to the production fact types that atomically create a
// source task. The repository remains the truth for source classification.
type ProductionFactSourceTaskDependencyRepo interface {
	ProductionFactRequiresSourceTask(ctx context.Context, id int) (bool, error)
}

// ShipmentReleaseSourceRepo owns the DRAFT shipment lock and creates the
// source-generated release task, event and coordination state atomically.
type ShipmentReleaseSourceRepo interface {
	SubmitShipmentRelease(ctx context.Context, id int, actorID int) (*WorkflowTask, bool, error)
	ValidateShipmentReleaseForShipping(ctx context.Context, id int) error
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

// FinanceFactFromShipmentRepo owns the source lock, snapshot validation and
// finance-fact insert in one transaction so shipment cancellation cannot race
// a stale source read.
type FinanceFactFromShipmentRepo interface {
	CreateFinanceFactDraftFromShipment(ctx context.Context, factType string, in *FinanceFactFromShipmentCreate) (*FinanceFact, error)
}

// FinanceFactShipmentPaymentTermRepo resolves the authoritative sales-order
// payment-term snapshot for process-command producers. The repository repeats
// the same validation while holding the shipment lock before persisting.
type FinanceFactShipmentPaymentTermRepo interface {
	GetShipmentPaymentTermDays(ctx context.Context, shipmentID int) (*int, error)
}

// OutsourcingFactFromOrderRepo owns source locking, source-field derivation
// and draft insertion in one transaction. The generic create path remains an
// internal repository capability and is not a public API.
type OutsourcingFactFromOrderRepo interface {
	CreateOutsourcingMaterialIssueFromOrder(ctx context.Context, in *OutsourcingFactFromOrderCreate) (*OutsourcingFact, error)
	CreateOutsourcingReturnReceiptFromOrder(ctx context.Context, in *OutsourcingFactFromOrderCreate) (*OutsourcingFact, error)
}

type OperationalFactUsecase struct {
	repo OperationalFactRepo
}

func NewOperationalFactUsecase(repo OperationalFactRepo) *OperationalFactUsecase {
	return &OperationalFactUsecase{repo: repo}
}

func (uc *OperationalFactUsecase) CreateProductionCompletionFromOrder(ctx context.Context, in *ProductionCompletionFromOrderCreate) (*ProductionFact, error) {
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
	sourceRepo, ok := uc.repo.(ProductionCompletionSourceRepo)
	if !ok {
		return nil, ErrBadParam
	}
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
	occurredAt := normalized.OccurredAt
	if !normalized.OccurredAtSpecified {
		// CreateProductionFactDraft performs the shared normalization. Preserve
		// an omitted operator timestamp as an omitted idempotency intent instead
		// of turning the first generated clock value into a specified value.
		occurredAt = time.Time{}
	}
	return uc.CreateProductionFactDraft(ctx, &OperationalFactMutation{
		FactNo:              normalized.FactNo,
		FactType:            ProductionFactFinishedGoodsReceipt,
		SubjectType:         InventorySubjectProduct,
		SubjectID:           source.ProductID,
		ProductSkuID:        source.ProductSKUID,
		WarehouseID:         normalized.WarehouseID,
		UnitID:              source.UnitID,
		LotID:               normalized.LotID,
		NewLotNo:            normalized.NewLotNo,
		Quantity:            normalized.Quantity,
		SourceType:          &sourceType,
		SourceID:            &sourceID,
		SourceLineID:        &sourceLineID,
		IdempotencyKey:      normalized.IdempotencyKey,
		OccurredAt:          occurredAt,
		OccurredAtSpecified: normalized.OccurredAtSpecified,
		Note:                normalized.Note,
	})
}

func (uc *OperationalFactUsecase) CreateProductionMaterialIssueFromOrder(ctx context.Context, in *ProductionMaterialIssueFromOrderCreate) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionMaterialIssueFromOrderCreate(in)
	if err != nil {
		return nil, err
	}
	repo, ok := uc.repo.(ProductionMaterialIssueFromOrderRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateProductionMaterialIssueFromOrder(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateProductionReworkFromCompletion(ctx context.Context, in *ProductionReworkFromCompletionCreate) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionReworkFromCompletionCreate(in)
	if err != nil {
		return nil, err
	}
	repo, ok := uc.repo.(ProductionReworkFromCompletionRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateProductionReworkFromCompletion(ctx, normalized)
}

func (uc *OperationalFactUsecase) ListProductionOrderMaterialRequirements(ctx context.Context, productionOrderID int) ([]*ProductionOrderMaterialRequirement, error) {
	if uc == nil || uc.repo == nil || productionOrderID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionMaterialIssueFromOrderRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.ListProductionOrderMaterialRequirements(ctx, productionOrderID)
}

func (uc *OperationalFactUsecase) CreateProductionFactDraft(ctx context.Context, in *OperationalFactMutation) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOperationalFactMutation(in, productionFactTypes)
	if err != nil {
		return nil, err
	}
	productionOrderLinked := normalized.SourceType != nil && *normalized.SourceType == ProductionOrderSourceType
	if !productionOrderLinked {
		if err := uc.validateOperationalSubjectActive(ctx, normalized.SubjectType, normalized.SubjectID); err != nil {
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

func (uc *OperationalFactUsecase) PostProductionFact(ctx context.Context, id int) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostProductionFact(ctx, id)
}

func (uc *OperationalFactUsecase) PostProductionFactWithActor(ctx context.Context, id int, actorID int) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	if repo, ok := uc.repo.(ProductionFactPostingActorRepo); ok {
		return repo.PostProductionFactWithActor(ctx, id, actorID)
	}
	return uc.repo.PostProductionFact(ctx, id)
}

func (uc *OperationalFactUsecase) CancelPostedProductionFact(ctx context.Context, id int) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedProductionFact(ctx, id)
}

func (uc *OperationalFactUsecase) CancelPostedProductionFactWithActor(ctx context.Context, id int, actorID int) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	if repo, ok := uc.repo.(ProductionFactPostingActorRepo); ok {
		return repo.CancelPostedProductionFactWithActor(ctx, id, actorID)
	}
	return uc.repo.CancelPostedProductionFact(ctx, id)
}

func (uc *OperationalFactUsecase) ListProductionFacts(ctx context.Context, filter OperationalFactFilter) ([]*ProductionFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeProductionFactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListProductionFacts(ctx, normalized)
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
	repo, ok := uc.repo.(OutsourcingFactFromOrderRepo)
	if !ok {
		return nil, ErrBadParam
	}
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
	repo, ok := uc.repo.(OutsourcingFactFromOrderRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateOutsourcingReturnReceiptFromOrder(ctx, normalized)
}

func (uc *OperationalFactUsecase) PostOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostOutsourcingFact(ctx, id)
}

func (uc *OperationalFactUsecase) CancelPostedOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedOutsourcingFact(ctx, id)
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

func (uc *OperationalFactUsecase) CreateShipmentDraftWithItems(ctx context.Context, in *ShipmentCreateWithItems) (*Shipment, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeShipmentCreateWithItems(in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateShipmentHeaderActiveReferences(ctx, normalized.Shipment); err != nil {
		return nil, err
	}
	for _, item := range normalized.Items {
		if err := uc.validateShipmentItemActiveReferences(ctx, item); err != nil {
			return nil, err
		}
	}
	return uc.repo.CreateShipmentDraftWithItems(ctx, normalized)
}

func (uc *OperationalFactUsecase) SubmitShipmentRelease(ctx context.Context, id int, actorID int) (*WorkflowTask, bool, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, false, ErrBadParam
	}
	repo, ok := uc.repo.(ShipmentReleaseSourceRepo)
	if !ok {
		return nil, false, ErrBadParam
	}
	return repo.SubmitShipmentRelease(ctx, id, actorID)
}

func (uc *OperationalFactUsecase) ProductionFactRequiresSourceTask(ctx context.Context, id int) (bool, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return false, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionFactSourceTaskDependencyRepo)
	if !ok {
		return false, nil
	}
	return repo.ProductionFactRequiresSourceTask(ctx, id)
}

func (uc *OperationalFactUsecase) ValidateShipmentReleaseForShipping(ctx context.Context, id int) error {
	if uc == nil || uc.repo == nil || id <= 0 {
		return ErrBadParam
	}
	repo, ok := uc.repo.(ShipmentReleaseSourceRepo)
	if !ok {
		// Test doubles and adapters predating the source-task contract do not own
		// the production data transaction. The concrete repository always does.
		return nil
	}
	return repo.ValidateShipmentReleaseForShipping(ctx, id)
}

func (uc *OperationalFactUsecase) ShipShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ShipShipment(ctx, id)
}

func (uc *OperationalFactUsecase) ShipShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(OperationalFactShipmentActorRepo)
	if !ok {
		return nil, ErrActorAwareShipmentUnavailable
	}
	return repo.ShipShipmentWithActor(ctx, id, actorID)
}

func (uc *OperationalFactUsecase) GetShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetShipment(ctx, id)
}

func (uc *OperationalFactUsecase) CancelShippedShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelShippedShipment(ctx, id)
}

func (uc *OperationalFactUsecase) CancelShippedShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(OperationalFactCancellationActorRepo)
	if !ok {
		return nil, ErrActorAwareCancellationUnavailable
	}
	return repo.CancelShippedShipmentWithActor(ctx, id, actorID)
}

func (uc *OperationalFactUsecase) ListShipments(ctx context.Context, filter OperationalFactFilter) ([]*Shipment, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeShipmentFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListShipments(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateStockReservation(ctx context.Context, in *StockReservationCreate) (*StockReservation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeStockReservationCreate(in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateStockReservationActiveReferences(ctx, normalized); err != nil {
		return nil, err
	}
	return uc.repo.CreateStockReservation(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateStockReservationFromSalesOrder(ctx context.Context, in *StockReservationFromSalesOrderCreate) (*StockReservation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeStockReservationFromSalesOrderCreate(in)
	if err != nil {
		return nil, err
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	return uc.repo.CreateStockReservationFromSalesOrder(ctx, normalized)
}

func (uc *OperationalFactUsecase) ReleaseStockReservation(ctx context.Context, id int) (*StockReservation, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ReleaseStockReservation(ctx, id)
}

func (uc *OperationalFactUsecase) ListStockReservations(ctx context.Context, filter OperationalFactFilter) ([]*StockReservation, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeStockReservationFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListStockReservations(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateFinanceFactDraft(ctx context.Context, in *FinanceFactCreate) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinanceFactCreate(in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateFinanceFactSource(ctx, normalized); err != nil {
		return nil, err
	}
	if err := uc.validateFinanceCounterpartyActiveReferences(ctx, normalized); err != nil {
		return nil, err
	}
	return uc.repo.CreateFinanceFactDraft(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateReceivableFromShipment(ctx context.Context, in *FinanceFactFromShipmentCreate) (*FinanceFact, error) {
	if in != nil && in.InvoiceCategory != nil {
		return nil, ErrBadParam
	}
	return uc.createFinanceFactFromShipment(ctx, FinanceFactReceivable, in)
}

func (uc *OperationalFactUsecase) CreateInvoiceFromShipment(ctx context.Context, in *FinanceFactFromShipmentCreate) (*FinanceFact, error) {
	return uc.createFinanceFactFromShipment(ctx, FinanceFactInvoice, in)
}

func (uc *OperationalFactUsecase) createFinanceFactFromShipment(ctx context.Context, factType string, in *FinanceFactFromShipmentCreate) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinanceFactFromShipmentCreate(in)
	if err != nil {
		return nil, err
	}
	if factType == FinanceFactReceivable && normalized.InvoiceCategory != nil {
		return nil, ErrBadParam
	}
	if factType == FinanceFactInvoice && normalized.InvoiceCategory == nil {
		return nil, ErrFinanceFactInvoiceCategoryMissing
	}
	repo, ok := uc.repo.(FinanceFactFromShipmentRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateFinanceFactDraftFromShipment(ctx, factType, normalized)
}

func (uc *OperationalFactUsecase) shipmentFinancePaymentTermSnapshot(ctx context.Context, shipmentID int) (*string, *int, error) {
	if uc == nil || uc.repo == nil || shipmentID <= 0 {
		return nil, nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinanceFactShipmentPaymentTermRepo)
	if !ok {
		return nil, nil, ErrBadParam
	}
	days, err := repo.GetShipmentPaymentTermDays(ctx, shipmentID)
	if err != nil {
		return nil, nil, err
	}
	return FinancePaymentTermSnapshotFromDays(days)
}

func (uc *OperationalFactUsecase) PostFinanceFact(ctx context.Context, id int) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostFinanceFact(ctx, id)
}

func (uc *OperationalFactUsecase) SettleFinanceFact(ctx context.Context, id int) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(interface {
		GetFinanceFact(context.Context, int) (*FinanceFact, error)
	})
	if !ok {
		return nil, ErrBadParam
	}
	fact, err := reader.GetFinanceFact(ctx, id)
	if err != nil {
		return nil, err
	}
	if fact == nil || !financeFactTypeCanSettle(fact.FactType) {
		return nil, ErrFinanceFactSettlementNotAllowed
	}
	return uc.repo.SettleFinanceFact(ctx, id)
}

func (uc *OperationalFactUsecase) CancelPostedFinanceFact(ctx context.Context, id int, actorID int, reason string) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	normalizedReason := strings.TrimSpace(reason)
	if normalizedReason == "" || len([]rune(normalizedReason)) > 255 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedFinanceFact(ctx, id, actorID, normalizedReason)
}

func (uc *OperationalFactUsecase) ListFinanceFacts(ctx context.Context, filter OperationalFactFilter) ([]*FinanceFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeFinanceFactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListFinanceFacts(ctx, normalized)
}

var productionFactTypes = map[string]struct{}{
	ProductionFactMaterialIssue:        {},
	ProductionFactFinishedGoodsReceipt: {},
	ProductionFactRework:               {},
}

var outsourcingFactTypes = map[string]struct{}{
	OutsourcingFactMaterialIssue: {},
	OutsourcingFactReturnReceipt: {},
}

var financeFactTypes = map[string]struct{}{
	FinanceFactReceivable:     {},
	FinanceFactPayable:        {},
	FinanceFactInvoice:        {},
	FinanceFactPayment:        {},
	FinanceFactReconciliation: {},
}

var financeCounterpartyTypes = map[string]struct{}{
	FinanceCounterpartyCustomer: {},
	FinanceCounterpartySupplier: {},
	FinanceCounterpartyOther:    {},
}

var financeCurrencies = map[string]struct{}{
	FinanceCurrencyUSD: {},
	FinanceCurrencyCNY: {},
	FinanceCurrencyHKD: {},
}

var financeCollectionTypes = map[string]struct{}{
	FinanceCollectionAdvanceReceipt:     {},
	FinanceCollectionAccountsReceivable: {},
}

var financePaymentTerms = map[string]int{
	FinancePaymentTermCashOnShipment: 0,
	FinancePaymentTermEOM30:          30,
	FinancePaymentTermEOM45:          45,
}

// FinancePaymentTermSnapshotFromDays freezes the exact sales-order term.
// Known terms keep their display code; non-standard terms intentionally keep
// only the exact day count instead of being guessed into a different enum.
func FinancePaymentTermSnapshotFromDays(days *int) (*string, *int, error) {
	if days == nil {
		return nil, nil, ErrFinanceFactPaymentTermMissing
	}
	dayCount := *days
	if dayCount < 0 {
		return nil, nil, ErrBadParam
	}
	var term string
	switch dayCount {
	case 0:
		term = FinancePaymentTermCashOnShipment
	case 30:
		term = FinancePaymentTermEOM30
	case 45:
		term = FinancePaymentTermEOM45
	default:
		return nil, &dayCount, nil
	}
	return &term, &dayCount, nil
}

var financeInvoiceCategories = map[string]struct{}{
	FinanceInvoiceCategoryNone:          {},
	FinanceInvoiceCategoryExportGeneral: {},
	FinanceInvoiceCategoryVATGeneral1:   {},
	FinanceInvoiceCategoryVATSpecial3:   {},
	FinanceInvoiceCategoryVATSpecial13:  {},
}

var postedOperationalFactStatuses = map[string]struct{}{
	OperationalFactStatusDraft:     {},
	OperationalFactStatusPosted:    {},
	OperationalFactStatusCancelled: {},
}

var financeFactStatuses = map[string]struct{}{
	OperationalFactStatusDraft:     {},
	OperationalFactStatusPosted:    {},
	OperationalFactStatusCancelled: {},
	OperationalFactStatusSettled:   {},
}

var shipmentStatuses = map[string]struct{}{
	ShipmentStatusDraft:     {},
	ShipmentStatusShipped:   {},
	ShipmentStatusCancelled: {},
}

var stockReservationStatuses = map[string]struct{}{
	StockReservationStatusActive:    {},
	StockReservationStatusReleased:  {},
	StockReservationStatusConsumed:  {},
	StockReservationStatusCancelled: {},
}

func normalizeOperationalFactMutation(in *OperationalFactMutation, allowedTypes map[string]struct{}) (*OperationalFactMutation, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.FactType = strings.ToUpper(strings.TrimSpace(out.FactType))
	out.SubjectType = strings.ToUpper(strings.TrimSpace(out.SubjectType))
	out.SourceType = normalizeOptionalUpperString(out.SourceType)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.ProductSkuID != nil && (*out.ProductSkuID <= 0 || out.SubjectType != InventorySubjectProduct) {
		return nil, ErrBadParam
	}
	if out.SupplierID != nil && *out.SupplierID <= 0 {
		out.SupplierID = nil
	}
	if out.SourceID != nil && *out.SourceID <= 0 {
		out.SourceID = nil
	}
	if out.SourceLineID != nil && *out.SourceLineID <= 0 {
		out.SourceLineID = nil
	}
	if _, ok := allowedTypes[out.FactType]; !ok {
		return nil, ErrBadParam
	}
	if _, ok := inventorySubjectTypes[out.SubjectType]; !ok {
		return nil, ErrBadParam
	}
	if out.FactNo == "" ||
		out.SubjectID <= 0 ||
		out.WarehouseID <= 0 ||
		out.UnitID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionCompletionFromOrderCreate(in *ProductionCompletionFromOrderCreate) (*ProductionCompletionFromOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.NewLotNo = normalizeOptionalString(out.NewLotNo)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.NewLotNo != nil && (len([]rune(*out.NewLotNo)) > 64 || out.LotID != nil) {
		return nil, ErrBadParam
	}
	if out.FactNo == "" || out.ProductionOrderID <= 0 || out.ProductionOrderItemID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeOutsourcingFactFromOrderCreate(in *OutsourcingFactFromOrderCreate) (*OutsourcingFactFromOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.NewLotNo = normalizeOptionalString(out.NewLotNo)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.NewLotNo != nil && (len([]rune(*out.NewLotNo)) > 64 || out.LotID != nil) {
		return nil, ErrBadParam
	}
	if out.FactNo == "" || out.OutsourcingOrderID <= 0 || out.OutsourcingOrderItemID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionMaterialIssueFromOrderCreate(in *ProductionMaterialIssueFromOrderCreate) (*ProductionMaterialIssueFromOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.FactNo == "" || out.ProductionOrderID <= 0 || out.ProductionOrderItemID <= 0 ||
		out.ProductionOrderMaterialRequirementID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeProductionReworkFromCompletionCreate(in *ProductionReworkFromCompletionCreate) (*ProductionReworkFromCompletionCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Reason = strings.TrimSpace(out.Reason)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.FactNo == "" || out.SourceCompletionFactID <= 0 || out.Reason == "" || len([]rune(out.Reason)) > 255 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeShipmentCreate(in *ShipmentCreate) (*ShipmentCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ShipmentNo = strings.TrimSpace(out.ShipmentNo)
	out.CustomerSnapshot = normalizeOptionalString(out.CustomerSnapshot)
	out.Note = normalizeOptionalString(out.Note)
	if !validNetWeightG(out.TotalNetWeightG) {
		return nil, ErrBadParam
	}
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.CustomerID != nil && *out.CustomerID <= 0 {
		out.CustomerID = nil
	}
	if out.PlannedShipAt != nil {
		plannedShipAt := out.PlannedShipAt.UTC().Truncate(time.Microsecond)
		out.PlannedShipAt = &plannedShipAt
	}
	if out.ShipmentNo == "" {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeShipmentItemCreate(in *ShipmentItemCreate) (*ShipmentItemCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.Note = normalizeOptionalString(out.Note)
	if out.SalesOrderItemID != nil && *out.SalesOrderItemID <= 0 {
		out.SalesOrderItemID = nil
	}
	if out.ProductSkuID != nil && *out.ProductSkuID <= 0 {
		out.ProductSkuID = nil
	}
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.ProductID <= 0 || out.WarehouseID <= 0 || out.UnitID <= 0 {
		return nil, ErrBadParam
	}
	if !validShipmentNetWeightQuantity(out.Quantity) {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeShipmentCreateWithItems(in *ShipmentCreateWithItems) (*ShipmentCreateWithItems, error) {
	if in == nil || len(in.Items) == 0 {
		return nil, ErrBadParam
	}
	shipment, err := normalizeShipmentCreate(in.Shipment)
	if err != nil {
		return nil, err
	}
	items := make([]*ShipmentItemCreate, 0, len(in.Items))
	for _, item := range in.Items {
		if item == nil {
			return nil, ErrBadParam
		}
		normalizedItem, err := normalizeShipmentItemCreate(item)
		if err != nil {
			return nil, err
		}
		items = append(items, normalizedItem)
	}
	return &ShipmentCreateWithItems{Shipment: shipment, Items: items}, nil
}

func normalizeStockReservationCreate(in *StockReservationCreate) (*StockReservationCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ReservationNo = strings.TrimSpace(out.ReservationNo)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.SalesOrderItemID != nil && *out.SalesOrderItemID <= 0 {
		out.SalesOrderItemID = nil
	}
	if out.ProductSkuID != nil && *out.ProductSkuID <= 0 {
		return nil, ErrBadParam
	}
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	out.ReservedAt, out.ReservedAtSpecified = normalizeIdempotencyIntentTime(out.ReservedAt)
	if out.ReservationNo == "" || out.ProductID <= 0 || out.WarehouseID <= 0 || out.UnitID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeStockReservationFromSalesOrderCreate(in *StockReservationFromSalesOrderCreate) (*StockReservationFromSalesOrderCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ReservationNo = strings.TrimSpace(out.ReservationNo)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	out.ReservedAt, out.ReservedAtSpecified = normalizeIdempotencyIntentTime(out.ReservedAt)
	if out.ReservationNo == "" || out.SalesOrderID <= 0 || out.SalesOrderItemID <= 0 || out.WarehouseID <= 0 {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(out.Quantity); err != nil {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeFinanceFactCreate(in *FinanceFactCreate) (*FinanceFactCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.FactType = strings.ToUpper(strings.TrimSpace(out.FactType))
	out.CounterpartyType = strings.ToUpper(strings.TrimSpace(out.CounterpartyType))
	out.Currency = strings.ToUpper(strings.TrimSpace(out.Currency))
	out.CollectionType = normalizeOptionalUpperString(out.CollectionType)
	out.PaymentTerm = normalizeOptionalUpperString(out.PaymentTerm)
	out.InvoiceCategory = normalizeOptionalUpperString(out.InvoiceCategory)
	out.SourceType = normalizeOptionalUpperString(out.SourceType)
	out.Note = normalizeOptionalString(out.Note)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.CounterpartyID != nil && *out.CounterpartyID <= 0 {
		out.CounterpartyID = nil
	}
	if out.SourceID != nil && *out.SourceID <= 0 {
		out.SourceID = nil
	}
	if out.SourceLineID != nil && *out.SourceLineID <= 0 {
		out.SourceLineID = nil
	}
	if out.Currency == "" {
		out.Currency = "CNY"
	}
	if _, ok := financeCurrencies[out.Currency]; !ok {
		return nil, ErrBadParam
	}
	if out.CollectionType != nil {
		if _, ok := financeCollectionTypes[*out.CollectionType]; !ok {
			return nil, ErrBadParam
		}
	}
	if out.PaymentTerm != nil {
		defaultDays, ok := financePaymentTerms[*out.PaymentTerm]
		if !ok {
			return nil, ErrBadParam
		}
		if out.PaymentTermDays == nil {
			out.PaymentTermDays = &defaultDays
		}
	}
	if out.PaymentTermDays != nil && *out.PaymentTermDays < 0 {
		return nil, ErrBadParam
	}
	if out.InvoiceCategory != nil {
		if _, ok := financeInvoiceCategories[*out.InvoiceCategory]; !ok {
			return nil, ErrBadParam
		}
	}
	if _, ok := financeFactTypes[out.FactType]; !ok {
		return nil, ErrBadParam
	}
	if _, ok := financeCounterpartyTypes[out.CounterpartyType]; !ok {
		return nil, ErrBadParam
	}
	if out.FactNo == "" {
		return nil, ErrBadParam
	}
	if _, err := value.NewPositiveMoney(out.Amount); err != nil {
		return nil, ErrBadParam
	}
	if _, err := value.NewNonNegativeMoney(out.FeeAmount); err != nil {
		return nil, ErrBadParam
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func normalizeFinanceFactFromShipmentCreate(in *FinanceFactFromShipmentCreate) (*FinanceFactFromShipmentCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.Note = normalizeOptionalString(out.Note)
	out.InvoiceCategory = normalizeOptionalUpperString(out.InvoiceCategory)
	idempotencyKey, err := value.NewIdempotencyKey(out.IdempotencyKey)
	if err != nil {
		return nil, ErrBadParam
	}
	out.IdempotencyKey = idempotencyKey.String()
	if out.FactNo == "" || out.ShipmentID <= 0 {
		return nil, ErrBadParam
	}
	if out.InvoiceCategory != nil {
		if _, ok := financeInvoiceCategories[*out.InvoiceCategory]; !ok {
			return nil, ErrBadParam
		}
	}
	out.OccurredAt, out.OccurredAtSpecified = normalizeIdempotencyIntentTime(out.OccurredAt)
	return &out, nil
}

func financeFactTypeCanSettle(factType string) bool {
	switch strings.ToUpper(strings.TrimSpace(factType)) {
	case FinanceFactReceivable, FinanceFactPayable, FinanceFactReconciliation:
		return true
	default:
		return false
	}
}

func (uc *OperationalFactUsecase) validateFinanceFactSource(ctx context.Context, in *FinanceFactCreate) error {
	if in == nil {
		return ErrBadParam
	}
	switch in.FactType {
	case FinanceFactReceivable, FinanceFactInvoice:
		if in.SourceType == nil || *in.SourceType != ShipmentSourceType || in.SourceID == nil || *in.SourceID <= 0 {
			return ErrBadParam
		}
		shipment, err := uc.repo.GetShipment(ctx, *in.SourceID)
		if err != nil {
			return err
		}
		if shipment.Status != ShipmentStatusShipped {
			return ErrBadParam
		}
		if shipment.CustomerID == nil || *shipment.CustomerID <= 0 ||
			in.CounterpartyType != FinanceCounterpartyCustomer ||
			in.CounterpartyID == nil || *in.CounterpartyID != *shipment.CustomerID {
			return ErrBadParam
		}
	}
	return nil
}

func (uc *OperationalFactUsecase) validateFinanceCounterpartyActiveReferences(ctx context.Context, in *FinanceFactCreate) error {
	if in == nil {
		return ErrBadParam
	}
	if in.FactType == FinanceFactReceivable || in.FactType == FinanceFactInvoice {
		return nil
	}
	if in.CounterpartyID == nil {
		return nil
	}
	switch in.CounterpartyType {
	case FinanceCounterpartyCustomer:
		return requireActiveReference(ctx, *in.CounterpartyID, uc.repo.CustomerIsActive, ErrCustomerInactive)
	case FinanceCounterpartySupplier:
		return requireActiveReference(ctx, *in.CounterpartyID, uc.repo.SupplierIsActive, ErrSupplierInactive)
	case FinanceCounterpartyOther:
		return nil
	default:
		return ErrBadParam
	}
}

func normalizeOperationalFactFilter(in OperationalFactFilter) OperationalFactFilter {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.FactType = strings.ToUpper(strings.TrimSpace(in.FactType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.DateField = strings.ToLower(strings.TrimSpace(in.DateField))
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in
}

func normalizeProductionFactFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateOperationalFactStatusAndType(in, postedOperationalFactStatuses, productionFactTypes); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "occurred_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func normalizeOutsourcingFactFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateOperationalFactStatusAndType(in, postedOperationalFactStatuses, outsourcingFactTypes); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "occurred_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func normalizeShipmentFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateFilterValue(in.Status, shipmentStatuses); err != nil {
		return OperationalFactFilter{}, err
	}
	switch in.DateField {
	case "", "planned_ship_at", "shipped_at":
	default:
		return OperationalFactFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = "planned_ship_at"
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return OperationalFactFilter{}, ErrBadParam
	}
	return in, nil
}

func normalizeStockReservationFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateFilterValue(in.Status, stockReservationStatuses); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "reserved_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func normalizeFinanceFactFilter(in OperationalFactFilter) (OperationalFactFilter, error) {
	in = normalizeOperationalFactFilter(in)
	if err := validateOperationalFactStatusAndType(in, financeFactStatuses, financeFactTypes); err != nil {
		return OperationalFactFilter{}, err
	}
	var err error
	in, err = normalizeOperationalFactDateRange(in, "occurred_at")
	if err != nil {
		return OperationalFactFilter{}, err
	}
	return in, nil
}

func validateOperationalFactStatusAndType(in OperationalFactFilter, allowedStatuses map[string]struct{}, allowedTypes map[string]struct{}) error {
	if err := validateFilterValue(in.Status, allowedStatuses); err != nil {
		return err
	}
	return validateFilterValue(in.FactType, allowedTypes)
}

func normalizeOperationalFactDateRange(in OperationalFactFilter, defaultDateField string) (OperationalFactFilter, error) {
	switch in.DateField {
	case "", defaultDateField:
	default:
		return OperationalFactFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = defaultDateField
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return OperationalFactFilter{}, ErrBadParam
	}
	return in, nil
}

func validateFilterValue(value string, allowed map[string]struct{}) error {
	if value == "" {
		return nil
	}
	if _, ok := allowed[value]; !ok {
		return ErrBadParam
	}
	return nil
}

func normalizeOptionalUpperString(value *string) *string {
	value = normalizeOptionalString(value)
	if value == nil {
		return nil
	}
	upper := strings.ToUpper(*value)
	return &upper
}

func OperationalFactInventoryIdempotencyKey(sourceType string, sourceID int, sourceLineID int, action string) string {
	return fmt.Sprintf("%s:%d:%d:%s", sourceType, sourceID, sourceLineID, action)
}

func (uc *OperationalFactUsecase) validateOperationalSubjectActive(ctx context.Context, subjectType string, subjectID int) error {
	switch subjectType {
	case InventorySubjectMaterial:
		return requireActiveReference(ctx, subjectID, uc.repo.MaterialIsActive, ErrMaterialInactive)
	case InventorySubjectProduct:
		return requireActiveReference(ctx, subjectID, uc.repo.ProductIsActive, ErrProductInactive)
	default:
		return ErrBadParam
	}
}

func (uc *OperationalFactUsecase) validateShipmentHeaderActiveReferences(ctx context.Context, in *ShipmentCreate) error {
	if in == nil {
		return ErrBadParam
	}
	if in.SalesOrderID != nil {
		return nil
	}
	return requireOptionalActiveReference(ctx, in.CustomerID, uc.repo.CustomerIsActive, ErrCustomerInactive)
}

func (uc *OperationalFactUsecase) validateShipmentItemActiveReferences(ctx context.Context, in *ShipmentItemCreate) error {
	if in == nil {
		return ErrBadParam
	}
	if in.SalesOrderItemID == nil {
		if err := requireActiveReference(ctx, in.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
			return err
		}
		if err := requireOptionalActiveReference(ctx, in.ProductSkuID, uc.repo.ProductSKUIsActive, ErrProductSKUInactive); err != nil {
			return err
		}
		if err := requireActiveReference(ctx, in.UnitID, uc.repo.UnitIsActive, ErrUnitInactive); err != nil {
			return err
		}
	}
	return requireActiveReference(ctx, in.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive)
}

func (uc *OperationalFactUsecase) validateStockReservationActiveReferences(ctx context.Context, in *StockReservationCreate) error {
	if in == nil {
		return ErrBadParam
	}
	if in.SalesOrderItemID == nil {
		if err := requireActiveReference(ctx, in.ProductID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
			return err
		}
		if err := requireOptionalActiveReference(ctx, in.ProductSkuID, uc.repo.ProductSKUIsActive, ErrProductSKUInactive); err != nil {
			return err
		}
		if err := requireActiveReference(ctx, in.UnitID, uc.repo.UnitIsActive, ErrUnitInactive); err != nil {
			return err
		}
	}
	return requireActiveReference(ctx, in.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive)
}
