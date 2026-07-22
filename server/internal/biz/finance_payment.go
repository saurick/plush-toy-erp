package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	FinancePaymentDirectionReceipt      = "RECEIPT"
	FinancePaymentDirectionDisbursement = "DISBURSEMENT"
	FinancePaymentStatusDraft           = "DRAFT"
	FinancePaymentStatusPosted          = "POSTED"
	FinancePaymentStatusReversed        = "REVERSED"
	FinanceAllocationStatusPosted       = "POSTED"
	FinanceAllocationStatusReversed     = "REVERSED"
)

type FinancePayment struct {
	ID                     int
	PaymentNo              string
	Direction              string
	Status                 string
	CounterpartyType       string
	CounterpartyID         int
	Amount                 decimal.Decimal
	Currency               string
	AccountRef             string
	EvidenceRef            string
	IdempotencyKey         string
	IdempotencyPayloadHash string
	Version                int
	OccurredAt             time.Time
	PostedAt               *time.Time
	PostedBy               *int
	ReversedAt             *time.Time
	ReversedBy             *int
	ReverseReason          *string
	CreatedBy              int
	CreatedAt              time.Time
	UpdatedAt              time.Time
	Allocations            []*FinanceAllocation
}
type FinanceAllocation struct {
	ID                     int
	PaymentID              int
	FinanceFactID          int
	Amount                 decimal.Decimal
	Currency               string
	Status                 string
	ReversalOfAllocationID *int
	IdempotencyKey         string
	CreatedBy              int
	CreatedAt              time.Time
}
type FinanceCreditNote struct {
	ID                     int
	CreditNoteNo           string
	FinanceFactID          int
	ReversalOfCreditNoteID *int
	Amount                 decimal.Decimal
	Currency               string
	Status                 string
	Reason                 string
	IdempotencyKey         string
	IdempotencyPayloadHash string
	CreatedBy              int
	CreatedAt              time.Time
}

type FinancePaymentCreate struct {
	PaymentNo           string
	Direction           string
	CounterpartyType    string
	CounterpartyID      int
	Amount              decimal.Decimal
	Currency            string
	AccountRef          string
	EvidenceRef         string
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
}
type FinancePaymentAllocationInput struct {
	FinanceFactID int
	Amount        decimal.Decimal
}
type FinancePaymentPost struct {
	ID              int
	ExpectedVersion int
	Allocations     []FinancePaymentAllocationInput
}
type FinancePaymentReverse struct {
	ID              int
	ExpectedVersion int
	Reason          string
}
type FinancePaymentFilter struct {
	Status           string
	Direction        string
	CounterpartyType string
	CounterpartyID   int
	Limit            int
	Offset           int
}
type FinanceCreditNoteCreate struct {
	CreditNoteNo   string
	FinanceFactID  int
	Amount         decimal.Decimal
	Reason         string
	IdempotencyKey string
}
type FinanceCreditNoteReverse struct {
	CreditNoteID   int
	CreditNoteNo   string
	Reason         string
	IdempotencyKey string
}
type FinanceCreditNoteFilter struct {
	Status        string
	FinanceFactID int
	Limit         int
	Offset        int
}

type FinancePaymentRepo interface {
	CreateFinancePayment(ctx context.Context, in *FinancePaymentCreate, actorID int, payloadHash string) (*FinancePayment, error)
	PostFinancePayment(ctx context.Context, in *FinancePaymentPost, actorID int) (*FinancePayment, error)
	ReverseFinancePayment(ctx context.Context, in *FinancePaymentReverse, actorID int) (*FinancePayment, error)
	CreateFinanceCreditNote(ctx context.Context, in *FinanceCreditNoteCreate, actorID int, payloadHash string) (*FinanceCreditNote, error)
	ReverseFinanceCreditNote(ctx context.Context, in *FinanceCreditNoteReverse, actorID int, payloadHash string) (*FinanceCreditNote, error)
	GetFinanceCreditNote(ctx context.Context, id int) (*FinanceCreditNote, error)
	ListFinanceCreditNotes(ctx context.Context, filter FinanceCreditNoteFilter) ([]*FinanceCreditNote, int, error)
	GetFinancePayment(ctx context.Context, id int) (*FinancePayment, error)
	ListFinancePayments(ctx context.Context, filter FinancePaymentFilter) ([]*FinancePayment, int, error)
}

func (uc *OperationalFactUsecase) CreateFinancePayment(ctx context.Context, in *FinancePaymentCreate, actorID int) (*FinancePayment, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	normalized, hash, err := normalizeFinancePaymentCreate(*in)
	if err != nil {
		return nil, err
	}
	return repo.CreateFinancePayment(ctx, &normalized, actorID, hash)
}
func (uc *OperationalFactUsecase) PostFinancePayment(ctx context.Context, in *FinancePaymentPost, actorID int) (*FinancePayment, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 || len(in.Allocations) == 0 {
		return nil, ErrBadParam
	}
	sort.Slice(in.Allocations, func(i, j int) bool { return in.Allocations[i].FinanceFactID < in.Allocations[j].FinanceFactID })
	seen := map[int]struct{}{}
	for _, a := range in.Allocations {
		if a.FinanceFactID <= 0 || !a.Amount.IsPositive() {
			return nil, ErrBadParam
		}
		if _, exists := seen[a.FinanceFactID]; exists {
			return nil, ErrBadParam
		}
		seen[a.FinanceFactID] = struct{}{}
	}
	return repo.PostFinancePayment(ctx, in, actorID)
}
func (uc *OperationalFactUsecase) ReverseFinancePayment(ctx context.Context, in *FinancePaymentReverse, actorID int) (*FinancePayment, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 || strings.TrimSpace(in.Reason) == "" {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	return repo.ReverseFinancePayment(ctx, in, actorID)
}
func (uc *OperationalFactUsecase) CreateFinanceCreditNote(ctx context.Context, in *FinanceCreditNoteCreate, actorID int) (*FinanceCreditNote, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	n, h, err := normalizeFinanceCreditNoteCreate(*in)
	if err != nil {
		return nil, err
	}
	return repo.CreateFinanceCreditNote(ctx, &n, actorID, h)
}
func (uc *OperationalFactUsecase) ReverseFinanceCreditNote(ctx context.Context, in *FinanceCreditNoteReverse, actorID int) (*FinanceCreditNote, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || in.CreditNoteID <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	in.CreditNoteNo = strings.TrimSpace(in.CreditNoteNo)
	in.Reason = strings.TrimSpace(in.Reason)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.CreditNoteNo == "" || in.Reason == "" || in.IdempotencyKey == "" {
		return nil, ErrBadParam
	}
	raw, _ := json.Marshal(in)
	sum := sha256.Sum256(raw)
	return repo.ReverseFinanceCreditNote(ctx, in, actorID, hex.EncodeToString(sum[:]))
}
func (uc *OperationalFactUsecase) GetFinanceCreditNote(ctx context.Context, id int) (*FinanceCreditNote, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetFinanceCreditNote(ctx, id)
}
func (uc *OperationalFactUsecase) ListFinanceCreditNotes(ctx context.Context, filter FinanceCreditNoteFilter) ([]*FinanceCreditNote, int, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok {
		return nil, 0, ErrBadParam
	}
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	if filter.Status != "" && filter.Status != "POSTED" && filter.Status != "REVERSED" {
		return nil, 0, ErrBadParam
	}
	if filter.FinanceFactID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	return repo.ListFinanceCreditNotes(ctx, filter)
}
func (uc *OperationalFactUsecase) GetFinancePayment(ctx context.Context, id int) (*FinancePayment, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetFinancePayment(ctx, id)
}
func (uc *OperationalFactUsecase) ListFinancePayments(ctx context.Context, filter FinancePaymentFilter) ([]*FinancePayment, int, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok {
		return nil, 0, ErrBadParam
	}
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	filter.Direction = strings.ToUpper(strings.TrimSpace(filter.Direction))
	filter.CounterpartyType = strings.ToUpper(strings.TrimSpace(filter.CounterpartyType))
	if filter.Status != "" && filter.Status != FinancePaymentStatusDraft && filter.Status != FinancePaymentStatusPosted && filter.Status != FinancePaymentStatusReversed {
		return nil, 0, ErrBadParam
	}
	if filter.Direction != "" && filter.Direction != FinancePaymentDirectionReceipt && filter.Direction != FinancePaymentDirectionDisbursement {
		return nil, 0, ErrBadParam
	}
	if filter.CounterpartyType != "" && filter.CounterpartyType != FinanceCounterpartyCustomer && filter.CounterpartyType != FinanceCounterpartySupplier {
		return nil, 0, ErrBadParam
	}
	if filter.CounterpartyID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	return repo.ListFinancePayments(ctx, filter)
}
func (uc *OperationalFactUsecase) financePaymentRepo() (FinancePaymentRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := uc.repo.(FinancePaymentRepo)
	return repo, ok
}

func normalizeFinancePaymentCreate(in FinancePaymentCreate) (FinancePaymentCreate, string, error) {
	in.PaymentNo = strings.TrimSpace(in.PaymentNo)
	in.Direction = strings.ToUpper(strings.TrimSpace(in.Direction))
	in.CounterpartyType = strings.ToUpper(strings.TrimSpace(in.CounterpartyType))
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	in.AccountRef = strings.TrimSpace(in.AccountRef)
	in.EvidenceRef = strings.TrimSpace(in.EvidenceRef)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.PaymentNo == "" || (in.Direction != FinancePaymentDirectionReceipt && in.Direction != FinancePaymentDirectionDisbursement) || (in.CounterpartyType != FinanceCounterpartyCustomer && in.CounterpartyType != FinanceCounterpartySupplier) || in.CounterpartyID <= 0 || !in.Amount.IsPositive() || (in.Currency != "CNY" && in.Currency != "USD" && in.Currency != "HKD") || in.AccountRef == "" || in.EvidenceRef == "" || in.IdempotencyKey == "" {
		return FinancePaymentCreate{}, "", ErrBadParam
	}
	if in.OccurredAtSpecified && in.OccurredAt.IsZero() {
		return FinancePaymentCreate{}, "", ErrBadParam
	}
	raw, err := json.Marshal(in)
	if err != nil {
		return FinancePaymentCreate{}, "", err
	}
	sum := sha256.Sum256(raw)
	return in, hex.EncodeToString(sum[:]), nil
}
func normalizeFinanceCreditNoteCreate(in FinanceCreditNoteCreate) (FinanceCreditNoteCreate, string, error) {
	in.CreditNoteNo = strings.TrimSpace(in.CreditNoteNo)
	in.Reason = strings.TrimSpace(in.Reason)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.CreditNoteNo == "" || in.FinanceFactID <= 0 || !in.Amount.IsPositive() || in.Reason == "" || in.IdempotencyKey == "" {
		return FinanceCreditNoteCreate{}, "", ErrBadParam
	}
	raw, err := json.Marshal(in)
	if err != nil {
		return FinanceCreditNoteCreate{}, "", err
	}
	sum := sha256.Sum256(raw)
	return in, hex.EncodeToString(sum[:]), nil
}
