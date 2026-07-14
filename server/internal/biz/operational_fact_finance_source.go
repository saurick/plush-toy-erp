package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	"server/internal/core/value"
)

const FinanceFactSourceType = "FINANCE_FACT"

var (
	ErrFinanceFactSourceAmountInvalid     = errors.New("finance fact source amount is incomplete")
	ErrPurchaseReceiptFinanceDependency   = errors.New("purchase receipt has an active payable")
	ErrOutsourcingReturnFinanceDependency = errors.New("outsourcing return has an active payable")
	ErrOutsourcingReturnQualityPending    = errors.New("outsourcing return quality inspection is not accepted")
	ErrOutsourcingReturnQualityRejected   = errors.New("outsourcing return quality inspection is rejected")
	ErrFinanceReconciliationDependency    = errors.New("finance fact has an active reconciliation")
	ErrFinanceReconciliationSourceInvalid = errors.New("finance reconciliation source is invalid")
)

// FinanceFactFromPurchaseReceiptCreate contains only operator-owned fields.
// Supplier, amount, currency and source linkage are resolved while the posted
// purchase receipt is locked by the repository transaction.
type FinanceFactFromPurchaseReceiptCreate struct {
	FactNo              string
	PurchaseReceiptID   int
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Note                *string
}

// FinanceFactFromOutsourcingReturnCreate contains only operator-owned fields.
// The payable is derived from one posted outsourcing return receipt.
type FinanceFactFromOutsourcingReturnCreate struct {
	FactNo              string
	OutsourcingFactID   int
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Note                *string
}

// FinanceReconciliationFromFactCreate is the deliberately small V1 single-
// record reconciliation command. It does not model multi-document matching or
// bank-statement settlement.
type FinanceReconciliationFromFactCreate struct {
	FactNo              string
	FinanceFactID       int
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Note                *string
}

type FinanceFactFromBusinessSourceRepo interface {
	CreatePayableFromPurchaseReceipt(ctx context.Context, in *FinanceFactFromPurchaseReceiptCreate) (*FinanceFact, error)
	CreatePayableFromOutsourcingReturn(ctx context.Context, in *FinanceFactFromOutsourcingReturnCreate) (*FinanceFact, error)
	CreateReconciliationFromFinanceFact(ctx context.Context, in *FinanceReconciliationFromFactCreate) (*FinanceFact, error)
}

func (uc *OperationalFactUsecase) CreatePayableFromPurchaseReceipt(ctx context.Context, in *FinanceFactFromPurchaseReceiptCreate) (*FinanceFact, error) {
	normalized, err := normalizeFinanceFactFromPurchaseReceiptCreate(in)
	if err != nil {
		return nil, err
	}
	repo, ok := ucFinanceFactSourceRepo(uc)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreatePayableFromPurchaseReceipt(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreatePayableFromOutsourcingReturn(ctx context.Context, in *FinanceFactFromOutsourcingReturnCreate) (*FinanceFact, error) {
	normalized, err := normalizeFinanceFactFromOutsourcingReturnCreate(in)
	if err != nil {
		return nil, err
	}
	repo, ok := ucFinanceFactSourceRepo(uc)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreatePayableFromOutsourcingReturn(ctx, normalized)
}

func (uc *OperationalFactUsecase) CreateReconciliationFromFinanceFact(ctx context.Context, in *FinanceReconciliationFromFactCreate) (*FinanceFact, error) {
	normalized, err := normalizeFinanceReconciliationFromFactCreate(in)
	if err != nil {
		return nil, err
	}
	repo, ok := ucFinanceFactSourceRepo(uc)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateReconciliationFromFinanceFact(ctx, normalized)
}

func ucFinanceFactSourceRepo(uc *OperationalFactUsecase) (FinanceFactFromBusinessSourceRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := uc.repo.(FinanceFactFromBusinessSourceRepo)
	return repo, ok
}

func normalizeFinanceFactFromPurchaseReceiptCreate(in *FinanceFactFromPurchaseReceiptCreate) (*FinanceFactFromPurchaseReceiptCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	if err := normalizeFinanceSourceCommand(&out.FactNo, &out.IdempotencyKey, &out.OccurredAt, &out.OccurredAtSpecified, &out.Note, out.PurchaseReceiptID); err != nil {
		return nil, err
	}
	return &out, nil
}

func normalizeFinanceFactFromOutsourcingReturnCreate(in *FinanceFactFromOutsourcingReturnCreate) (*FinanceFactFromOutsourcingReturnCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	if err := normalizeFinanceSourceCommand(&out.FactNo, &out.IdempotencyKey, &out.OccurredAt, &out.OccurredAtSpecified, &out.Note, out.OutsourcingFactID); err != nil {
		return nil, err
	}
	return &out, nil
}

func normalizeFinanceReconciliationFromFactCreate(in *FinanceReconciliationFromFactCreate) (*FinanceReconciliationFromFactCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	if err := normalizeFinanceSourceCommand(&out.FactNo, &out.IdempotencyKey, &out.OccurredAt, &out.OccurredAtSpecified, &out.Note, out.FinanceFactID); err != nil {
		return nil, err
	}
	return &out, nil
}

func normalizeFinanceSourceCommand(
	factNo *string,
	idempotencyKey *string,
	occurredAt *time.Time,
	occurredAtSpecified *bool,
	note **string,
	sourceID int,
) error {
	if factNo == nil || idempotencyKey == nil || occurredAt == nil || occurredAtSpecified == nil || note == nil || sourceID <= 0 {
		return ErrBadParam
	}
	*factNo = strings.TrimSpace(*factNo)
	*note = normalizeOptionalString(*note)
	key, err := value.NewIdempotencyKey(*idempotencyKey)
	if err != nil || *factNo == "" {
		return ErrBadParam
	}
	*idempotencyKey = key.String()
	*occurredAt, *occurredAtSpecified = normalizeIdempotencyIntentTime(*occurredAt)
	return nil
}
