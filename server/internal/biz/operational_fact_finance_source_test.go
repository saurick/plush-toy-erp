package biz

import (
	"context"
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestOperationalFactUsecaseFinanceFromShipmentOwnsFactFields(t *testing.T) {
	customerID := 51
	currency := FinanceCurrencyCNY
	firstAmount := decimal.RequireFromString("100.25")
	secondAmount := decimal.RequireFromString("24.75")
	repo := &financeFromShipmentRepoStub{
		productionCompletionRepoStub: &productionCompletionRepoStub{},
		shipment: &Shipment{
			ID:         91,
			Status:     ShipmentStatusShipped,
			CustomerID: &customerID,
			Items: []*ShipmentItem{
				{AmountSnapshot: &firstAmount, CurrencySnapshot: &currency},
				{AmountSnapshot: &secondAmount, CurrencySnapshot: &currency},
			},
		},
	}
	uc := NewOperationalFactUsecase(repo)

	fact, err := uc.CreateReceivableFromShipment(context.Background(), &FinanceFactFromShipmentCreate{
		FactNo:         " AR-SHIPMENT-001 ",
		ShipmentID:     91,
		IdempotencyKey: "test-test-test",
	})
	if err != nil {
		t.Fatalf("CreateReceivableFromShipment error = %v", err)
	}
	if fact == nil || repo.createdFinance == nil {
		t.Fatalf("fact=%#v created=%#v", fact, repo.createdFinance)
	}
	created := repo.createdFinance
	if created.FactNo != "AR-SHIPMENT-001" || created.FactType != FinanceFactReceivable || created.CounterpartyType != FinanceCounterpartyCustomer || created.CounterpartyID == nil || *created.CounterpartyID != customerID {
		t.Fatalf("source-derived receivable identity = %#v", created)
	}
	if !created.Amount.Equal(decimal.NewFromInt(125)) || !created.FeeAmount.IsZero() || created.Currency != FinanceCurrencyCNY {
		t.Fatalf("source-derived receivable amount = %#v", created)
	}
	if created.SourceType == nil || *created.SourceType != ShipmentSourceType || created.SourceID == nil || *created.SourceID != 91 || created.SourceLineID != nil {
		t.Fatalf("source-derived receivable linkage = %#v", created)
	}
	if repo.createdFactType != FinanceFactReceivable || repo.createdSource == nil || repo.createdSource.FactNo != "AR-SHIPMENT-001" || repo.createdSource.OccurredAtSpecified || repo.createdSource.OccurredAt.IsZero() {
		t.Fatalf("normalized source request type=%q input=%#v", repo.createdFactType, repo.createdSource)
	}
}

func TestOperationalFactUsecaseFinanceFromShipmentRejectsCallerOwnedFactFields(t *testing.T) {
	repo := &financeFromShipmentRepoStub{productionCompletionRepoStub: &productionCompletionRepoStub{}}
	uc := NewOperationalFactUsecase(repo)
	category := FinanceInvoiceCategoryNone
	_, err := uc.CreateReceivableFromShipment(context.Background(), &FinanceFactFromShipmentCreate{
		FactNo: "AR-SHIPMENT-BAD", ShipmentID: 91, IdempotencyKey: "ar-shipment-bad", InvoiceCategory: &category,
	})
	if !errors.Is(err, ErrBadParam) || repo.createdSource != nil {
		t.Fatalf("receivable invoice field error=%v source=%#v", err, repo.createdSource)
	}
}

func TestOperationalFactUsecaseInvoiceFromShipmentRequiresCategory(t *testing.T) {
	repo := &financeFromShipmentRepoStub{productionCompletionRepoStub: &productionCompletionRepoStub{}}
	uc := NewOperationalFactUsecase(repo)
	_, err := uc.CreateInvoiceFromShipment(context.Background(), &FinanceFactFromShipmentCreate{
		FactNo: "INV-SHIPMENT-MISSING-CATEGORY", ShipmentID: 91, IdempotencyKey: "inv-shipment-missing-category",
	})
	if !errors.Is(err, ErrFinanceFactInvoiceCategoryMissing) || repo.createdSource != nil {
		t.Fatalf("missing invoice category error=%v source=%#v", err, repo.createdSource)
	}
}

func TestFinancePaymentTermSnapshotFromDays(t *testing.T) {
	tests := []struct {
		name     string
		days     *int
		wantTerm *string
		wantDays *int
		wantErr  error
	}{
		{name: "missing", wantErr: ErrFinanceFactPaymentTermMissing},
		{name: "cash", days: processTestIntPtr(0), wantTerm: stringTestPtr(FinancePaymentTermCashOnShipment), wantDays: processTestIntPtr(0)},
		{name: "thirty", days: processTestIntPtr(30), wantTerm: stringTestPtr(FinancePaymentTermEOM30), wantDays: processTestIntPtr(30)},
		{name: "forty five", days: processTestIntPtr(45), wantTerm: stringTestPtr(FinancePaymentTermEOM45), wantDays: processTestIntPtr(45)},
		{name: "custom sixty", days: processTestIntPtr(60), wantDays: processTestIntPtr(60)},
		{name: "negative", days: processTestIntPtr(-1), wantErr: ErrBadParam},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			term, days, err := FinancePaymentTermSnapshotFromDays(tt.days)
			if !errors.Is(err, tt.wantErr) || !optionalStringEqual(term, tt.wantTerm) || !optionalIntEqual(days, tt.wantDays) {
				t.Fatalf("term=%#v days=%#v err=%v", term, days, err)
			}
		})
	}
}

func stringTestPtr(value string) *string { return &value }

func optionalStringEqual(left, right *string) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}

func optionalIntEqual(left, right *int) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}

func TestOperationalFactUsecaseSettleFinanceFactAllowsOnlyBalanceTypes(t *testing.T) {
	tests := []struct {
		factType string
		allowed  bool
	}{
		{factType: FinanceFactReceivable, allowed: true},
		{factType: FinanceFactPayable, allowed: true},
		{factType: FinanceFactReconciliation, allowed: true},
		{factType: FinanceFactInvoice, allowed: false},
		{factType: FinanceFactPayment, allowed: false},
	}
	for _, tt := range tests {
		t.Run(tt.factType, func(t *testing.T) {
			repo := &financeFromShipmentRepoStub{
				productionCompletionRepoStub: &productionCompletionRepoStub{},
				financeToRead:                &FinanceFact{ID: 1, FactType: tt.factType, Status: OperationalFactStatusPosted},
			}
			uc := NewOperationalFactUsecase(repo)
			_, err := uc.SettleFinanceFact(context.Background(), 1)
			if tt.allowed {
				if err != nil || repo.settleCalls != 1 {
					t.Fatalf("allowed settle error=%v calls=%d", err, repo.settleCalls)
				}
				return
			}
			if !errors.Is(err, ErrFinanceFactSettlementNotAllowed) || repo.settleCalls != 0 {
				t.Fatalf("disallowed settle error=%v calls=%d", err, repo.settleCalls)
			}
		})
	}
}

type financeFromShipmentRepoStub struct {
	*productionCompletionRepoStub
	shipment        *Shipment
	createdFinance  *FinanceFactCreate
	createdSource   *FinanceFactFromShipmentCreate
	createdFactType string
	financeToRead   *FinanceFact
	settleCalls     int
}

func (r *financeFromShipmentRepoStub) CreateFinanceFactDraftFromShipment(_ context.Context, factType string, in *FinanceFactFromShipmentCreate) (*FinanceFact, error) {
	copy := *in
	r.createdSource = &copy
	r.createdFactType = factType
	if r.shipment == nil || r.shipment.CustomerID == nil {
		return nil, ErrShipmentNotFound
	}
	amount := decimal.Zero
	for _, item := range r.shipment.Items {
		amount = amount.Add(*item.AmountSnapshot)
	}
	sourceType := ShipmentSourceType
	shipmentID := r.shipment.ID
	create := &FinanceFactCreate{
		FactNo: copy.FactNo, FactType: factType, CounterpartyType: FinanceCounterpartyCustomer,
		CounterpartyID: r.shipment.CustomerID, Amount: amount, FeeAmount: decimal.Zero, Currency: FinanceCurrencyCNY,
		InvoiceCategory: copy.InvoiceCategory, SourceType: &sourceType, SourceID: &shipmentID,
		IdempotencyKey: copy.IdempotencyKey, OccurredAt: copy.OccurredAt, OccurredAtSpecified: copy.OccurredAtSpecified, Note: copy.Note,
	}
	return r.CreateFinanceFactDraft(context.Background(), create)
}

func (r *financeFromShipmentRepoStub) GetShipment(context.Context, int) (*Shipment, error) {
	if r.shipment == nil {
		return nil, ErrShipmentNotFound
	}
	return r.shipment, nil
}

func (r *financeFromShipmentRepoStub) CreateFinanceFactDraft(_ context.Context, in *FinanceFactCreate) (*FinanceFact, error) {
	copy := *in
	r.createdFinance = &copy
	return &FinanceFact{
		FactNo: copy.FactNo, FactType: copy.FactType, Status: OperationalFactStatusDraft,
		CounterpartyType: copy.CounterpartyType, CounterpartyID: copy.CounterpartyID,
		Amount: copy.Amount, FeeAmount: copy.FeeAmount, Currency: copy.Currency,
		InvoiceCategory: copy.InvoiceCategory, SourceType: copy.SourceType, SourceID: copy.SourceID,
		IdempotencyKey: copy.IdempotencyKey,
	}, nil
}

func (r *financeFromShipmentRepoStub) GetFinanceFact(context.Context, int) (*FinanceFact, error) {
	if r.financeToRead == nil {
		return nil, ErrFinanceFactNotFound
	}
	return r.financeToRead, nil
}

func (r *financeFromShipmentRepoStub) SettleFinanceFact(_ context.Context, id int) (*FinanceFact, error) {
	r.settleCalls++
	copy := *r.financeToRead
	copy.ID = id
	copy.Status = OperationalFactStatusSettled
	return &copy, nil
}
