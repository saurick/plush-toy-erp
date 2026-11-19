package biz

import (
	"context"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type FinanceFact struct {
	ID                int
	FactNo            string
	FactType          string
	Status            string
	Version           int
	CounterpartyType  string
	CounterpartyID    *int
	Amount            decimal.Decimal
	OutstandingAmount decimal.Decimal
	FeeAmount         decimal.Decimal
	Currency          string
	CollectionType    *string
	PaymentTerm       *string
	PaymentTermDays   *int
	DueAt             *time.Time
	InvoiceCategory   *string
	SourceType        *string
	SourceID          *int
	SourceNo          *string
	SourceLineID      *int
	IdempotencyKey    string
	OccurredAt        time.Time
	PostedAt          *time.Time
	PostedBy          *int
	PostedByName      *string
	SettledAt         *time.Time
	SettledBy         *int
	SettledByName     *string
	CancelledAt       *time.Time
	CancelledBy       *int
	CancelledByName   *string
	CancelReason      *string
	Note              *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
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
	DueAt               *time.Time
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

type FinanceFactRepo interface {
	GetFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	FinanceFactFromShipmentRepo
	FinanceFactShipmentPaymentTermRepo
	CreateFinanceFactDraft(ctx context.Context, in *FinanceFactCreate) (*FinanceFact, error)
	PostFinanceFact(ctx context.Context, in *OperationalFactStatusMutation) (*FinanceFact, error)
	SettleFinanceFact(ctx context.Context, in *OperationalFactStatusMutation) (*FinanceFact, error)
	CancelPostedFinanceFact(ctx context.Context, in *OperationalFactStatusMutation) (*FinanceFact, error)
	ListFinanceFacts(ctx context.Context, filter OperationalFactFilter) ([]*FinanceFact, int, error)
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
	repo := uc.repo
	return repo.CreateFinanceFactDraftFromShipment(ctx, factType, normalized)
}

func (uc *OperationalFactUsecase) shipmentFinancePaymentTermSnapshot(ctx context.Context, shipmentID int) (*string, *int, error) {
	if uc == nil || uc.repo == nil || shipmentID <= 0 {
		return nil, nil, ErrBadParam
	}
	repo := uc.repo
	days, err := repo.GetShipmentPaymentTermDays(ctx, shipmentID)
	if err != nil {
		return nil, nil, err
	}
	return FinancePaymentTermSnapshotFromDays(days)
}

func (uc *OperationalFactUsecase) PostFinanceFact(ctx context.Context, in *OperationalFactStatusMutation) (_ *FinanceFact, err error) {
	ctx, finish := startBusinessTrace(ctx, "finance.post_fact")
	defer func() { finish(err) }()
	normalized, err := normalizeOperationalFactStatusMutation(in, false)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	return uc.repo.PostFinanceFact(ctx, normalized)
}

func (uc *OperationalFactUsecase) SettleFinanceFact(ctx context.Context, in *OperationalFactStatusMutation) (_ *FinanceFact, err error) {
	ctx, finish := startBusinessTrace(ctx, "finance.settle_fact")
	defer func() { finish(err) }()
	normalized, err := normalizeOperationalFactStatusMutation(in, false)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	reader := uc.repo
	fact, err := reader.GetFinanceFact(ctx, normalized.ID)
	if err != nil {
		return nil, err
	}
	if fact == nil || !financeFactTypeCanSettle(fact.FactType) {
		return nil, ErrFinanceFactSettlementNotAllowed
	}
	return uc.repo.SettleFinanceFact(ctx, normalized)
}

func (uc *OperationalFactUsecase) CancelPostedFinanceFact(ctx context.Context, in *OperationalFactStatusMutation) (*FinanceFact, error) {
	normalized, err := normalizeOperationalFactStatusMutation(in, true)
	if uc == nil || uc.repo == nil || err != nil {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedFinanceFact(ctx, normalized)
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

var financeFactTypes = map[string]struct{}{
	FinanceFactReceivable:     {},
	FinanceFactPayable:        {},
	FinanceFactInvoice:        {},
	FinanceFactReconciliation: {},
}

var financeCurrencies = map[string]struct{}{
	FinanceCurrencyUSD: {},
	FinanceCurrencyCNY: {},
	FinanceCurrencyHKD: {},
}

// NormalizeFinanceCurrency keeps the supported currency set
// consistent across source documents, finance facts and payments. Callers
// that own a create-only default must apply it before this validation.
func NormalizeFinanceCurrency(raw string) (string, bool) {
	currency := strings.ToUpper(strings.TrimSpace(raw))
	_, ok := financeCurrencies[currency]
	return currency, ok
}

func normalizeSourceOrderCurrency(raw string, create bool) (string, bool) {
	if create && strings.TrimSpace(raw) == "" {
		raw = FinanceCurrencyCNY
	}
	return NormalizeFinanceCurrency(raw)
}

// FinancePaymentTermSnapshotFromDays freezes the exact source-document term.
func FinancePaymentTermSnapshotFromDays(days *int) (*string, *int, error) {
	if days == nil {
		return nil, nil, ErrFinanceFactPaymentTermMissing
	}
	dayCount := *days
	if dayCount < 0 {
		return nil, nil, ErrBadParam
	}
	term := FinancePaymentTermEOMDays
	if dayCount == 0 {
		term = FinancePaymentTermDueOnOccurrence
	}
	return &term, &dayCount, nil
}

// FinanceFactDueAtFromDays derives the due timestamp from the locked source term.
func FinanceFactDueAtFromDays(occurredAt time.Time, days *int) (*time.Time, error) {
	if occurredAt.IsZero() || days == nil || *days < 0 {
		return nil, ErrBadParam
	}
	canonicalOccurredAt := occurredAt.UTC().Truncate(time.Microsecond)
	if *days == 0 {
		return &canonicalOccurredAt, nil
	}
	// Month boundaries follow the finance business calendar; storage remains UTC.
	localOccurredAt := canonicalOccurredAt.In(financeBusinessLocation)
	dueAt := time.Date(
		localOccurredAt.Year(),
		localOccurredAt.Month()+1,
		0,
		localOccurredAt.Hour(),
		localOccurredAt.Minute(),
		localOccurredAt.Second(),
		localOccurredAt.Nanosecond(),
		financeBusinessLocation,
	).AddDate(0, 0, *days).UTC()
	return &dueAt, nil
}

func sameOptionalFinanceText(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

var financeInvoiceCategories = map[string]struct{}{
	FinanceInvoiceCategoryNone:          {},
	FinanceInvoiceCategoryExportGeneral: {},
	FinanceInvoiceCategoryVATGeneral1:   {},
	FinanceInvoiceCategoryVATSpecial3:   {},
	FinanceInvoiceCategoryVATSpecial13:  {},
}

var financeFactStatuses = map[string]struct{}{
	OperationalFactStatusDraft:     {},
	OperationalFactStatusPosted:    {},
	OperationalFactStatusCancelled: {},
	OperationalFactStatusSettled:   {},
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
	default:
		return ErrBadParam
	}
}
