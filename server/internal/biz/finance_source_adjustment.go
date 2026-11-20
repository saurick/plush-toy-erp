package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// Source adjustments reuse the immutable finance adjustment ledger. Warehouse
// posting only creates a discrepancy; finance explicitly confirms its money effect.
type FinanceSourceAdjustment struct {
	SourceType        string          `json:"source_type"`
	SourceID          int             `json:"source_id"`
	SourceNo          string          `json:"source_no"`
	FinanceFactID     int             `json:"finance_fact_id"`
	FinanceFactNo     string          `json:"finance_fact_no"`
	CounterpartyID    int             `json:"counterparty_id"`
	CounterpartyName  string          `json:"counterparty_name"`
	Currency          string          `json:"currency"`
	BalanceDirection  string          `json:"balance_direction"`
	Amount            decimal.Decimal `json:"amount"`
	OutstandingAmount decimal.Decimal `json:"outstanding_amount"`
	OccurredAt        time.Time       `json:"occurred_at"`
}

type FinanceSourceAdjustmentFilter struct{ FinanceFactID, Limit, Offset int }
type FinanceSourceAdjustmentCreate struct {
	SourceType     string
	SourceID       int
	CreditNoteNo   string
	Reason         string
	IdempotencyKey string
}

type FinanceSourceAdjustmentRepo interface {
	ListFinanceSourceAdjustments(context.Context, FinanceSourceAdjustmentFilter) ([]*FinanceSourceAdjustment, int, error)
	CreateFinanceSourceAdjustment(context.Context, *FinanceSourceAdjustmentCreate, int, string) (*FinanceCreditNote, error)
}

func (uc *OperationalFactUsecase) ListFinanceSourceAdjustments(ctx context.Context, filter FinanceSourceAdjustmentFilter) ([]*FinanceSourceAdjustment, int, error) {
	repo, ok := uc.repo.(FinanceSourceAdjustmentRepo)
	if !ok || filter.FinanceFactID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	filter.Limit = NormalizeBusinessListLimit(filter.Limit)
	return repo.ListFinanceSourceAdjustments(ctx, filter)
}

func (uc *OperationalFactUsecase) CreateFinanceSourceAdjustment(ctx context.Context, in *FinanceSourceAdjustmentCreate, actorID int) (_ *FinanceCreditNote, err error) {
	ctx, finish := startBusinessTrace(ctx, "finance.adjust_payable_from_source")
	defer func() { finish(err) }()
	repo, ok := uc.repo.(FinanceSourceAdjustmentRepo)
	if !ok || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	n := *in
	n.SourceType = strings.TrimSpace(n.SourceType)
	n.CreditNoteNo, n.Reason, n.IdempotencyKey = strings.TrimSpace(n.CreditNoteNo), strings.TrimSpace(n.Reason), strings.TrimSpace(n.IdempotencyKey)
	if (n.SourceType != PurchaseReturnSourceType && n.SourceType != PurchaseReceiptAdjustmentSourceType) || n.SourceID <= 0 || n.CreditNoteNo == "" || len([]rune(n.CreditNoteNo)) > 64 || n.Reason == "" || len([]rune(n.Reason)) > 255 || n.IdempotencyKey == "" || len([]rune(n.IdempotencyKey)) > 128 {
		return nil, ErrBadParam
	}
	raw, err := json.Marshal(n)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	return repo.CreateFinanceSourceAdjustment(ctx, &n, actorID, hex.EncodeToString(sum[:]))
}
