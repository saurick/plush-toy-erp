package biz

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type financePaymentBehaviorRepo struct {
	OperationalFactRepo
	FinancePaymentRepo
	created     []FinancePaymentCreate
	hashes      []string
	actor       int
	transitions []FinancePaymentTransition
	reversals   []FinancePaymentReverse
	allocations []FinancePaymentAllocate
	reversed    []FinanceAllocationReverse
	postCalls   int
	err         error
}

func (r *financePaymentBehaviorRepo) CreateFinancePayment(_ context.Context, in *FinancePaymentCreate, actor int, hash string) (*FinancePayment, error) {
	r.created, r.hashes, r.actor = append(r.created, *in), append(r.hashes, hash), actor
	if r.err != nil {
		return nil, r.err
	}
	return &FinancePayment{ID: 12, Kind: in.Kind, Amount: in.Amount, Status: FinancePaymentStatusDraft}, nil
}

func (r *financePaymentBehaviorRepo) CancelFinancePayment(_ context.Context, in *FinancePaymentTransition, actor int) (*FinancePayment, error) {
	r.transitions, r.actor = append(r.transitions, *in), actor
	return nil, r.err
}

func (r *financePaymentBehaviorRepo) ReverseFinancePayment(_ context.Context, in *FinancePaymentReverse, actor int) (*FinancePayment, error) {
	r.reversals, r.actor = append(r.reversals, *in), actor
	return nil, r.err
}

func (r *financePaymentBehaviorRepo) PostFinancePayment(context.Context, *FinancePaymentPost, int) (*FinancePayment, error) {
	r.postCalls++
	return nil, nil
}

func (r *financePaymentBehaviorRepo) FinancePaymentAllocationCandidates(context.Context, int) ([]*FinanceFact, error) {
	return nil, r.err
}

func (r *financePaymentBehaviorRepo) AllocateFinancePayment(_ context.Context, in *FinancePaymentAllocate, actor int) (*FinancePayment, error) {
	r.allocations, r.actor = append(r.allocations, *in), actor
	return &FinancePayment{ID: in.ID, Version: in.ExpectedVersion + 1}, r.err
}

func (r *financePaymentBehaviorRepo) ReverseFinanceAllocation(_ context.Context, in *FinanceAllocationReverse, actor int) (*FinancePayment, error) {
	r.reversed, r.actor = append(r.reversed, *in), actor
	return nil, r.err
}

func financePaymentBehaviorInput() FinancePaymentCreate {
	return FinancePaymentCreate{
		PaymentNo: " PAY-12 ", Direction: " receipt ", CounterpartyType: " customer ",
		CounterpartyID: 5, Amount: decimal.RequireFromString("0.300001"), Currency: " cny ",
		AccountRef: " 银行账户 ", EvidenceRef: " 回单12 ", IdempotencyKey: " payment-12 ",
	}
}

func TestFinancePaymentUsecaseCreationKeepsNormalizedIntentStableAcrossRetry(t *testing.T) {
	in := financePaymentBehaviorInput()
	before := in
	storageErr := errors.New("payment storage unavailable")
	repo := &financePaymentBehaviorRepo{err: storageErr}
	uc := NewOperationalFactUsecase(repo)
	if got, err := uc.CreateFinancePayment(context.Background(), &in, 7); got != nil || !errors.Is(err, storageErr) {
		t.Fatalf("failed create must not report success: result=%v err=%v", got, err)
	}
	repo.err = nil
	got, err := uc.CreateFinancePayment(context.Background(), &in, 7)
	if err != nil || got.Status != FinancePaymentStatusDraft || !got.Amount.Equal(decimal.RequireFromString("0.300001")) || repo.actor != 7 || len(repo.created) != 2 {
		t.Fatalf("retry lost payment intent: result=%#v err=%v", got, err)
	}
	want := repo.created[0]
	if want.Kind != FinancePaymentKindSettlement || want.PaymentNo != "PAY-12" || want.Currency != FinanceCurrencyCNY || want.AccountRef != "银行账户" || want.EvidenceRef != "回单12" || want.IdempotencyKey != "payment-12" || len(repo.hashes[0]) != 64 {
		t.Fatalf("unexpected normalized payment: %#v", want)
	}
	if !reflect.DeepEqual(repo.created[0], repo.created[1]) || repo.hashes[0] != repo.hashes[1] || !reflect.DeepEqual(before, in) {
		t.Fatal("retry changed normalized intent or mutated the caller's form input")
	}
	in.Amount = decimal.RequireFromString("0.300002")
	if _, err := uc.CreateFinancePayment(context.Background(), &in, 7); err != nil || repo.hashes[2] == repo.hashes[0] {
		t.Fatalf("different amounts must not share the retry payload hash: %v", err)
	}
}

func TestFinancePaymentUsecasePaymentKindsBindDirectionAndSource(t *testing.T) {
	for _, tc := range []struct {
		name  string
		edit  func(*FinancePaymentCreate)
		valid bool
	}{
		{"settlement receipt", func(*FinancePaymentCreate) {}, true},
		{"supplier settlement", func(in *FinancePaymentCreate) {
			in.CounterpartyType = FinanceCounterpartySupplier
			in.Direction = FinancePaymentDirectionDisbursement
		}, true},
		{"customer advance", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindAdvance
			in.SourceType = "sales_order"
			in.SourceID = 8
		}, true},
		{"supplier advance", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindAdvance
			in.CounterpartyType = FinanceCounterpartySupplier
			in.Direction = FinancePaymentDirectionDisbursement
			in.SourceType = "purchase_order"
			in.SourceID = 8
		}, true},
		{"customer refund", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindRefund
			in.Direction = FinancePaymentDirectionDisbursement
			in.RefundOfPaymentID = 9
			in.PurposeNote = "退回未核销预收款"
		}, true},
		{"supplier refund", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindRefund
			in.CounterpartyType = FinanceCounterpartySupplier
			in.RefundOfPaymentID = 9
			in.PurposeNote = "收回未核销预付款"
		}, true},
		{"wrong settlement direction", func(in *FinancePaymentCreate) { in.Direction = FinancePaymentDirectionDisbursement }, false},
		{"settlement retains advance source", func(in *FinancePaymentCreate) { in.SourceType = "sales_order"; in.SourceID = 8 }, false},
		{"advance without source", func(in *FinancePaymentCreate) { in.Kind = FinancePaymentKindAdvance }, false},
		{"customer advance with purchase source", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindAdvance
			in.SourceType = "purchase_order"
			in.SourceID = 8
		}, false},
		{"refund without original payment", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindRefund
			in.Direction = FinancePaymentDirectionDisbursement
			in.PurposeNote = "退回余款"
		}, false},
		{"refund without purpose", func(in *FinancePaymentCreate) {
			in.Kind = FinancePaymentKindRefund
			in.Direction = FinancePaymentDirectionDisbursement
			in.RefundOfPaymentID = 9
		}, false},
		{"zero amount", func(in *FinancePaymentCreate) { in.Amount = decimal.Zero }, false},
		{"negative amount", func(in *FinancePaymentCreate) { in.Amount = decimal.NewFromInt(-1) }, false},
		{"missing receipt", func(in *FinancePaymentCreate) { in.EvidenceRef = " " }, false},
		{"empty explicit time", func(in *FinancePaymentCreate) { in.OccurredAtSpecified = true; in.OccurredAt = time.Time{} }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &financePaymentBehaviorRepo{}
			in := financePaymentBehaviorInput()
			tc.edit(&in)
			_, err := NewOperationalFactUsecase(repo).CreateFinancePayment(context.Background(), &in, 7)
			if tc.valid {
				if err != nil || len(repo.created) != 1 {
					t.Fatalf("valid payment rejected: %v", err)
				}
			} else if !errors.Is(err, ErrBadParam) || len(repo.created) != 0 {
				t.Fatalf("invalid payment reached storage: err=%v calls=%d", err, len(repo.created))
			}
		})
	}
}

func TestFinancePaymentUsecasePostingCannotBypassProcessRuntime(t *testing.T) {
	repo := &financePaymentBehaviorRepo{}
	uc := NewOperationalFactUsecase(repo)
	valid := FinancePaymentPost{ID: 12, ExpectedVersion: 3, Allocations: []FinancePaymentAllocationInput{{FinanceFactID: 8, Amount: decimal.RequireFromString("0.3")}}}
	if _, err := uc.PostFinancePayment(context.Background(), &valid, 7); !errors.Is(err, ErrProcessRuntimeRequired) || repo.postCalls != 0 {
		t.Fatalf("direct posting bypassed process runtime: err=%v writes=%d", err, repo.postCalls)
	}
	valid.Allocations = append(valid.Allocations, valid.Allocations[0])
	if _, err := uc.PostFinancePayment(context.Background(), &valid, 7); !errors.Is(err, ErrBadParam) || repo.postCalls != 0 {
		t.Fatalf("duplicate allocation was accepted: %v", err)
	}
}

func TestFinancePaymentUsecaseAllocationRejectsInvalidAmountsBeforeStorage(t *testing.T) {
	for _, amount := range []string{"0", "-1", "0.0000001", "100000000000000"} {
		t.Run(amount, func(t *testing.T) {
			repo := &financePaymentBehaviorRepo{}
			in := FinancePaymentAllocate{ID: 12, ExpectedVersion: 3, IdempotencyKey: "allocate-12", Allocations: []FinancePaymentAllocationInput{{FinanceFactID: 8, Amount: decimal.RequireFromString(amount)}}}
			if _, err := NewOperationalFactUsecase(repo).AllocateFinancePayment(context.Background(), &in, 7); !errors.Is(err, ErrBadParam) || len(repo.allocations) != 0 {
				t.Fatalf("invalid amount reached storage: %v", err)
			}
		})
	}
	repo := &financePaymentBehaviorRepo{}
	in := FinancePaymentAllocate{ID: 12, ExpectedVersion: 3, IdempotencyKey: " allocate-12 ", Allocations: []FinancePaymentAllocationInput{{FinanceFactID: 8, Amount: decimal.RequireFromString("0.1")}, {FinanceFactID: 9, Amount: decimal.RequireFromString("0.2")}}}
	if _, err := NewOperationalFactUsecase(repo).AllocateFinancePayment(context.Background(), &in, 7); err != nil || len(repo.allocations) != 1 || repo.actor != 7 || repo.allocations[0].IdempotencyKey != "allocate-12" || !repo.allocations[0].Allocations[0].Amount.Add(repo.allocations[0].Allocations[1].Amount).Equal(decimal.RequireFromString("0.3")) {
		t.Fatalf("valid allocation lost decimal precision or identity: %v", err)
	}
	in.Allocations[1].FinanceFactID = 8
	if _, err := NewOperationalFactUsecase(repo).AllocateFinancePayment(context.Background(), &in, 7); !errors.Is(err, ErrBadParam) || len(repo.allocations) != 1 {
		t.Fatalf("duplicate fact reached storage: %v", err)
	}
}

func TestFinancePaymentUsecaseCancellationAndReversalKeepAuditBoundary(t *testing.T) {
	for _, reason := range []string{"", " ", strings.Repeat("因", 256)} {
		repo := &financePaymentBehaviorRepo{}
		uc := NewOperationalFactUsecase(repo)
		_, cancelErr := uc.CancelFinancePayment(context.Background(), &FinancePaymentTransition{ID: 12, ExpectedVersion: 3, Reason: reason}, 7)
		_, reverseErr := uc.ReverseFinancePayment(context.Background(), &FinancePaymentReverse{ID: 12, ExpectedVersion: 3, Reason: reason}, 7)
		_, allocationErr := uc.ReverseFinanceAllocation(context.Background(), &FinanceAllocationReverse{PaymentID: 12, AllocationID: 8, ExpectedVersion: 3, Reason: reason}, 7)
		if !errors.Is(cancelErr, ErrBadParam) || !errors.Is(reverseErr, ErrBadParam) || !errors.Is(allocationErr, ErrBadParam) || len(repo.transitions)+len(repo.reversals)+len(repo.reversed) != 0 {
			t.Fatal("cancellation or reversal reached storage without a valid audit reason")
		}
	}
	conflict := errors.New("payment version conflict")
	repo := &financePaymentBehaviorRepo{err: conflict}
	uc := NewOperationalFactUsecase(repo)
	_, cancelErr := uc.CancelFinancePayment(context.Background(), &FinancePaymentTransition{ID: 12, ExpectedVersion: 3, Reason: " 重新登记 "}, 7)
	_, reverseErr := uc.ReverseFinancePayment(context.Background(), &FinancePaymentReverse{ID: 12, ExpectedVersion: 3, Reason: " 撤销错误入账 "}, 7)
	_, allocationErr := uc.ReverseFinanceAllocation(context.Background(), &FinanceAllocationReverse{PaymentID: 12, AllocationID: 8, ExpectedVersion: 3, Reason: " 解除错误核销 "}, 7)
	if !errors.Is(cancelErr, conflict) || !errors.Is(reverseErr, conflict) || !errors.Is(allocationErr, conflict) || repo.actor != 7 || repo.transitions[0].Reason != "重新登记" || repo.reversals[0].ExpectedVersion != 3 || repo.reversed[0].AllocationID != 8 {
		t.Fatalf("audit identity or conflict was lost: cancel=%v reverse=%v allocation=%v", cancelErr, reverseErr, allocationErr)
	}
}
