package biz

import (
	"context"
	"errors"
	"fmt"
	"time"

	corestatus "server/internal/core/status"

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
	FinanceFactReconciliation           = "RECONCILIATION"
	FinanceCounterpartyCustomer         = "CUSTOMER"
	FinanceCounterpartySupplier         = "SUPPLIER"
	FinanceCurrencyUSD                  = "USD"
	FinanceCurrencyCNY                  = "CNY"
	FinanceCurrencyHKD                  = "HKD"
	FinanceCollectionAccountsReceivable = "ACCOUNTS_RECEIVABLE"
	FinancePaymentTermDueOnOccurrence   = "DUE_ON_OCCURRENCE"
	FinancePaymentTermEOMDays           = "EOM_DAYS"
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
	ErrProductionReworkExecutionDependency  = errors.New("production rework WIP has execution dependencies")
	ErrOperationalInboundLotRequired        = errors.New("source-driven inbound requires an existing or new lot")
	ErrOutsourcingFactNotFound              = errors.New("outsourcing fact not found")
	ErrOutsourcingOrderFactSourceInvalid    = errors.New("outsourcing order fact source invalid")
	ErrOutsourcingOrderFactInvalidState     = errors.New("outsourcing order does not allow fact mutation")
	ErrOutsourcingOrderFactQuantityExceeded = errors.New("outsourcing fact quantity exceeds order item")
	ErrOutsourcingOrderFactDependency       = errors.New("outsourcing order has posted outsourcing facts")
	ErrOutsourcingStageReturnRequired       = errors.New("outsourcing stage return must use its WIP batch")
	ErrOutsourcingReturnQualityDependency   = errors.New("outsourcing return has active quality inspection")
	ErrShipmentNotFound                     = errors.New("shipment not found")
	ErrShipmentItemNotFound                 = errors.New("shipment item not found")
	ErrShipmentSourceMismatch               = errors.New("shipment source mismatch")
	ErrShipmentOrderNotActive               = errors.New("shipment sales order not active")
	ErrShipmentQuantityExceeded             = errors.New("shipment quantity exceeds sales order")
	ErrShipmentReservationSplit             = errors.New("shipment requires partial reservation consumption")
	ErrShipmentFinanceDependency            = errors.New("shipment has active finance facts")
	ErrShipmentQualityPending               = errors.New("shipment has pending finished goods quality inspection")
	ErrShipmentPackingPending               = errors.New("shipment quantity exceeds checked and packed stock")
	ErrShipmentQualityRejected              = errors.New("shipment has rejected finished goods quality inspection")
	ErrShipmentReleaseRequired              = errors.New("shipment release task is required")
	ErrShipmentReleasePending               = errors.New("shipment release task is not completed")
	ErrShipmentReleaseRejected              = errors.New("shipment release task was rejected")
	ErrShipmentReleaseAlreadySubmitted      = errors.New("shipment release was already submitted")
	ErrShipmentFinanceReleaseRequired       = errors.New("shipment finance approval is required")
	ErrShipmentFinanceReleaseConflict       = errors.New("shipment finance approval version conflict")
	ErrShipmentDraftDependency              = errors.New("shipment draft has downstream dependencies")
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
	ErrOperationalFactVersionConflict       = errors.New("operational fact version conflict")
)

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
	NewLotNo             *string
	Quantity             decimal.Decimal
	SupplierID           *int
	SupplierName         *string
	SourceType           *string
	SourceID             *int
	SourceLineID         *int
	ProductionWIPBatchID *int
	IdempotencyKey       string
	OccurredAt           time.Time
	OccurredAtSpecified  bool
	Note                 *string
}

const ShipmentSortNetWeight = "total_net_weight_g"

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
	SortBy         string
	SortDirection  string
}

type OperationalFactStatusMutation struct {
	ID              int
	ExpectedVersion int
	ActorID         int
	Reason          string
}

// OperationalFactRepo is the combined contract of the shared data adapter.
type OperationalFactRepo interface {
	ProductionFactUsecaseRepo
	OutsourcingFactUsecaseRepo
	ShipmentUsecaseRepo
	StockReservationUsecaseRepo
	FinanceFactUsecaseRepo
}

// OperationalFactUsecase assembles the domain usecases over the shared
// repository. RPC and process-command handlers receive the owning usecase.
type OperationalFactUsecase struct {
	*ProductionFactUsecase
	*OutsourcingFactUsecase
	*ShipmentUsecase
	*StockReservationUsecase
	*FinanceFactUsecase
}

func NewOperationalFactUsecase(repo OperationalFactRepo) *OperationalFactUsecase {
	return &OperationalFactUsecase{
		ProductionFactUsecase:   NewProductionFactUsecase(repo),
		OutsourcingFactUsecase:  NewOutsourcingFactUsecase(repo),
		ShipmentUsecase:         NewShipmentUsecase(repo),
		StockReservationUsecase: NewStockReservationUsecase(repo),
		FinanceFactUsecase:      NewFinanceFactUsecase(repo),
	}
}

var postedOperationalFactStatuses = map[string]struct{}{
	OperationalFactStatusDraft:     {},
	OperationalFactStatusPosted:    {},
	OperationalFactStatusCancelled: {},
}

func OperationalFactInventoryIdempotencyKey(sourceType string, sourceID int, sourceLineID int, action string) string {
	return fmt.Sprintf("%s:%d:%d:%s", sourceType, sourceID, sourceLineID, action)
}

type operationalItemReferenceRepo interface {
	salesLineReferenceRepo
	MaterialIsActive(ctx context.Context, id int) (bool, error)
}

func validateOperationalSubjectActive(ctx context.Context, repo operationalItemReferenceRepo, subjectType string, subjectID int) error {
	switch subjectType {
	case InventorySubjectMaterial:
		return requireActiveReference(ctx, subjectID, repo.MaterialIsActive, ErrMaterialInactive)
	case InventorySubjectProduct:
		return requireActiveReference(ctx, subjectID, repo.ProductIsActive, ErrProductInactive)
	default:
		return ErrBadParam
	}
}
