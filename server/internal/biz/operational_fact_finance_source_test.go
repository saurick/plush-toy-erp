package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestOperationalFactUsecaseFinanceFromShipmentNormalizesOperatorFields(t *testing.T) {
	note := "  客户确认  "
	repo := &financeFromShipmentRepoStub{
		productionCompletionRepoStub: &productionCompletionRepoStub{},
		createdResult:                &FinanceFact{ID: 1, FactNo: "AR-SHIPMENT-001", FactType: FinanceFactReceivable},
	}
	uc := NewOperationalFactUsecase(repo)

	fact, err := uc.CreateReceivableFromShipment(context.Background(), &FinanceFactFromShipmentCreate{
		FactNo:         " AR-SHIPMENT-001 ",
		ShipmentID:     91,
		IdempotencyKey: " test-test-test ",
		Note:           &note,
	})
	if err != nil {
		t.Fatalf("CreateReceivableFromShipment error = %v", err)
	}
	if fact == nil || fact.ID != 1 || repo.createdSource == nil {
		t.Fatalf("fact=%#v source=%#v", fact, repo.createdSource)
	}
	if repo.createdFactType != FinanceFactReceivable || repo.createdSource.FactNo != "AR-SHIPMENT-001" ||
		repo.createdSource.ShipmentID != 91 || repo.createdSource.IdempotencyKey != "test-test-test" ||
		repo.createdSource.Note == nil || *repo.createdSource.Note != "客户确认" {
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
		{name: "due on occurrence", days: processTestIntPtr(0), wantTerm: stringTestPtr(FinancePaymentTermDueOnOccurrence), wantDays: processTestIntPtr(0)},
		{name: "thirty", days: processTestIntPtr(30), wantTerm: stringTestPtr(FinancePaymentTermEOMDays), wantDays: processTestIntPtr(30)},
		{name: "forty five", days: processTestIntPtr(45), wantTerm: stringTestPtr(FinancePaymentTermEOMDays), wantDays: processTestIntPtr(45)},
		{name: "custom sixty", days: processTestIntPtr(60), wantTerm: stringTestPtr(FinancePaymentTermEOMDays), wantDays: processTestIntPtr(60)},
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

func TestFinanceFactDueAtFromDaysUsesCanonicalMonthEnd(t *testing.T) {
	tests := []struct {
		name       string
		occurredAt time.Time
		days       int
		want       time.Time
	}{
		{
			name:       "due on occurrence canonicalizes to UTC microseconds",
			occurredAt: time.Date(2026, time.August, 11, 23, 45, 0, 123456789, time.FixedZone("CST", 8*60*60)),
			days:       0,
			want:       time.Date(2026, time.August, 11, 15, 45, 0, 123456000, time.UTC),
		},
		{
			name:       "positive days start from canonical UTC month end",
			occurredAt: time.Date(2026, time.August, 11, 23, 45, 0, 123456789, time.FixedZone("CST", 8*60*60)),
			days:       30,
			want:       time.Date(2026, time.September, 30, 15, 45, 0, 123456000, time.UTC),
		},
		{
			name:       "leap year month end",
			occurredAt: time.Date(2028, time.February, 10, 8, 30, 0, 999, time.UTC),
			days:       1,
			want:       time.Date(2028, time.March, 1, 8, 30, 0, 0, time.UTC),
		},
		{
			name:       "december rolls into next year",
			occurredAt: time.Date(2026, time.December, 15, 9, 0, 0, 0, time.UTC),
			days:       45,
			want:       time.Date(2027, time.February, 14, 9, 0, 0, 0, time.UTC),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dueAt, err := FinanceFactDueAtFromDays(tt.occurredAt, &tt.days)
			if err != nil || dueAt == nil || !dueAt.Equal(tt.want) {
				t.Fatalf("dueAt=%v want=%v err=%v", dueAt, tt.want, err)
			}
		})
	}
	if _, err := FinanceFactDueAtFromDays(time.Time{}, processTestIntPtr(1)); !errors.Is(err, ErrBadParam) {
		t.Fatalf("zero occurrence error=%v", err)
	}
	if _, err := FinanceFactDueAtFromDays(time.Now(), nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing days error=%v", err)
	}
	if _, err := FinanceFactDueAtFromDays(time.Now(), processTestIntPtr(-1)); !errors.Is(err, ErrBadParam) {
		t.Fatalf("negative days error=%v", err)
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
		{factType: FinanceFactReceivable, allowed: false},
		{factType: FinanceFactPayable, allowed: false},
		{factType: FinanceFactReconciliation, allowed: true},
		{factType: FinanceFactInvoice, allowed: false},
	}
	for _, tt := range tests {
		t.Run(tt.factType, func(t *testing.T) {
			repo := &financeFromShipmentRepoStub{
				productionCompletionRepoStub: &productionCompletionRepoStub{},
				financeToRead:                &FinanceFact{ID: 1, FactType: tt.factType, Status: OperationalFactStatusPosted},
			}
			uc := NewOperationalFactUsecase(repo)
			_, err := uc.SettleFinanceFact(context.Background(), &OperationalFactStatusMutation{ID: 1, ExpectedVersion: 1, ActorID: 7})
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
	createdResult   *FinanceFact
	createdSource   *FinanceFactFromShipmentCreate
	createdFactType string
	financeToRead   *FinanceFact
	settleCalls     int
}

func (r *financeFromShipmentRepoStub) CreateFinanceFactDraftFromShipment(_ context.Context, factType string, in *FinanceFactFromShipmentCreate) (*FinanceFact, error) {
	copy := *in
	r.createdSource = &copy
	r.createdFactType = factType
	if r.createdResult == nil {
		return nil, ErrBadParam
	}
	result := *r.createdResult
	return &result, nil
}

func (r *financeFromShipmentRepoStub) GetShipment(context.Context, int) (*Shipment, error) {
	return nil, ErrShipmentNotFound
}

func (r *financeFromShipmentRepoStub) CreateFinanceFactDraft(context.Context, *FinanceFactCreate) (*FinanceFact, error) {
	return nil, ErrBadParam
}

func (r *financeFromShipmentRepoStub) GetFinanceFact(context.Context, int) (*FinanceFact, error) {
	if r.financeToRead == nil {
		return nil, ErrFinanceFactNotFound
	}
	return r.financeToRead, nil
}

func (r *financeFromShipmentRepoStub) SettleFinanceFact(_ context.Context, in *OperationalFactStatusMutation) (*FinanceFact, error) {
	r.settleCalls++
	copy := *r.financeToRead
	copy.ID = in.ID
	copy.Status = OperationalFactStatusSettled
	return &copy, nil
}
