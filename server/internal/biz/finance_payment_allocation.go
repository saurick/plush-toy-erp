package biz

import (
	"context"
	"strings"
)

// Allocation uses an already posted payment; it never records another cash movement.
type FinancePaymentAllocate struct {
	ID              int
	ExpectedVersion int
	IdempotencyKey  string
	Allocations     []FinancePaymentAllocationInput
}

type FinanceAllocationReverse struct {
	PaymentID       int
	AllocationID    int
	ExpectedVersion int
	Reason          string
}

type FinancePaymentAllocationRepo interface {
	FinancePaymentAllocationCandidates(context.Context, int) ([]*FinanceFact, error)
	AllocateFinancePayment(context.Context, *FinancePaymentAllocate, int) (*FinancePayment, error)
	ReverseFinanceAllocation(context.Context, *FinanceAllocationReverse, int) (*FinancePayment, error)
}

func (uc *OperationalFactUsecase) FinancePaymentAllocationCandidates(ctx context.Context, id int) ([]*FinanceFact, error) {
	if uc == nil || id <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinancePaymentAllocationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.FinancePaymentAllocationCandidates(ctx, id)
}

func (uc *OperationalFactUsecase) AllocateFinancePayment(ctx context.Context, in *FinancePaymentAllocate, actorID int) (*FinancePayment, error) {
	if uc == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinancePaymentAllocationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.IdempotencyKey == "" || len(in.IdempotencyKey) > 128 || len(in.Allocations) == 0 {
		return nil, ErrBadParam
	}
	seen := map[int]bool{}
	for _, a := range in.Allocations {
		if _, valid := parsePositiveNumeric20Scale6Contract(a.Amount.String()); !valid || a.FinanceFactID <= 0 || seen[a.FinanceFactID] {
			return nil, ErrBadParam
		}
		seen[a.FinanceFactID] = true
	}
	return repo.AllocateFinancePayment(ctx, in, actorID)
}

func (uc *OperationalFactUsecase) ReverseFinanceAllocation(ctx context.Context, in *FinanceAllocationReverse, actorID int) (*FinancePayment, error) {
	if uc == nil || in == nil || in.PaymentID <= 0 || in.AllocationID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinancePaymentAllocationRepo)
	if !ok {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, ErrBadParam
	}
	return repo.ReverseFinanceAllocation(ctx, in, actorID)
}
