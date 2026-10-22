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
	FinancePaymentKindSettlement        = "SETTLEMENT"
	FinancePaymentKindAdvance           = "ADVANCE"
	FinancePaymentKindRefund            = "REFUND"
	FinancePaymentDirectionReceipt      = "RECEIPT"
	FinancePaymentDirectionDisbursement = "DISBURSEMENT"
	FinancePaymentStatusDraft           = "DRAFT"
	FinancePaymentStatusApproved        = "APPROVED"
	FinancePaymentStatusRejected        = "REJECTED"
	FinancePaymentStatusPosted          = "POSTED"
	FinancePaymentStatusReversed        = "REVERSED"
	FinancePaymentStatusCancelled       = "CANCELLED"
	// 核销与红冲记录共用过账、冲销标记，区别于收付款源单的生命周期。
	FinanceAllocationStatusPosted   = "POSTED"
	FinanceAllocationStatusReversed = "REVERSED"
)

type FinancePayment struct {
	Kind                   string
	SourceType             *string
	SourceID               *int
	SourceNo               string
	RefundOfPaymentID      *int
	RefundOfPaymentNo      string
	PurposeNote            *string
	AllocatedAmount        decimal.Decimal
	RefundedAmount         decimal.Decimal
	AvailableAmount        decimal.Decimal
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
	ApprovedAt             *time.Time
	ApprovedBy             *int
	RejectedAt             *time.Time
	RejectedBy             *int
	RejectReason           *string
	PostedAt               *time.Time
	PostedBy               *int
	CancelledAt            *time.Time
	CancelledBy            *int
	CancelReason           *string
	ReversedAt             *time.Time
	ReversedBy             *int
	ReverseReason          *string
	CreatedBy              int
	CreatedAt              time.Time
	UpdatedAt              time.Time
	Allocations            []*FinanceAllocation
}
type FinanceAllocation struct {
	Reason                       *string
	ID                           int
	PaymentID                    int
	FinanceFactID                int
	FinanceFactNo                string
	FinanceFactType              string
	FinanceFactOriginalAmount    decimal.Decimal
	FinanceFactOutstandingAmount decimal.Decimal
	Amount                       decimal.Decimal
	Currency                     string
	Status                       string
	ReversalOfAllocationID       *int
	IdempotencyKey               string
	CreatedBy                    int
	CreatedAt                    time.Time
}
type FinanceCreditNote struct {
	ID                           int
	CreditNoteNo                 string
	FinanceFactID                int
	FinanceFactNo                string
	FinanceFactType              string
	FinanceFactOriginalAmount    decimal.Decimal
	FinanceFactOutstandingAmount decimal.Decimal
	ReversalOfCreditNoteID       *int
	Amount                       decimal.Decimal
	Currency                     string
	Status                       string
	Reason                       string
	IdempotencyKey               string
	IdempotencyPayloadHash       string
	CreatedBy                    int
	CreatedAt                    time.Time
}

type FinancePaymentCreate struct {
	Kind                string `json:",omitempty"`
	SourceType          string `json:",omitempty"`
	SourceID            int    `json:",omitempty"`
	RefundOfPaymentID   int    `json:",omitempty"`
	PurposeNote         string `json:",omitempty"`
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
type FinancePaymentTransition struct {
	ID              int
	ExpectedVersion int
	Reason          string
}
type FinancePaymentReverse struct {
	ID              int
	ExpectedVersion int
	Reason          string
}
type FinancePaymentFilter struct {
	SourceType        string
	SourceID          int
	Kind              string
	RefundOfPaymentID int
	Keyword           string
	Status            string
	Direction         string
	CounterpartyType  string
	CounterpartyID    int
	Limit             int
	Offset            int
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
	Keyword       string
	Status        string
	FinanceFactID int
	Limit         int
	Offset        int
}

type FinancePaymentRepo interface {
	CreateFinancePayment(ctx context.Context, in *FinancePaymentCreate, actorID int, payloadHash string) (*FinancePayment, error)
	CancelFinancePayment(ctx context.Context, in *FinancePaymentTransition, actorID int) (*FinancePayment, error)
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
func (uc *OperationalFactUsecase) CancelFinancePayment(ctx context.Context, in *FinancePaymentTransition, actorID int) (*FinancePayment, error) {
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, ErrBadParam
	}
	return repo.CancelFinancePayment(ctx, in, actorID)
}
func (uc *OperationalFactUsecase) PostFinancePayment(ctx context.Context, in *FinancePaymentPost, actorID int) (_ *FinancePayment, err error) {
	_, finish := startBusinessTrace(ctx, "finance.post_payment")
	defer func() { finish(err) }()
	_, ok := uc.financePaymentRepo()
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
	return nil, ErrProcessRuntimeRequired
}
func (uc *OperationalFactUsecase) ReverseFinancePayment(ctx context.Context, in *FinancePaymentReverse, actorID int) (_ *FinancePayment, err error) {
	ctx, finish := startBusinessTrace(ctx, "finance.reverse_payment")
	defer func() { finish(err) }()
	repo, ok := uc.financePaymentRepo()
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 || strings.TrimSpace(in.Reason) == "" {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if len([]rune(in.Reason)) > 255 {
		return nil, ErrBadParam
	}
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
	if len([]rune(in.CreditNoteNo)) > 64 || len([]rune(in.Reason)) > 255 || len([]rune(in.IdempotencyKey)) > 128 {
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
	filter, err := normalizeFinanceCreditNoteListFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return repo.ListFinanceCreditNotes(ctx, filter)
}

func normalizeFinanceCreditNoteListFilter(filter FinanceCreditNoteFilter) (FinanceCreditNoteFilter, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	if filter.Status != "" && filter.Status != FinanceAllocationStatusPosted && filter.Status != FinanceAllocationStatusReversed {
		return FinanceCreditNoteFilter{}, ErrBadParam
	}
	if filter.FinanceFactID < 0 || filter.Offset < 0 {
		return FinanceCreditNoteFilter{}, ErrBadParam
	}
	filter.Limit = NormalizeBusinessListLimit(filter.Limit)
	return filter, nil
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
	filter, err := normalizeFinancePaymentListFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return repo.ListFinancePayments(ctx, filter)
}

func normalizeFinancePaymentListFilter(filter FinancePaymentFilter) (FinancePaymentFilter, error) {
	filter.Kind = strings.ToUpper(strings.TrimSpace(filter.Kind))
	filter.SourceType = strings.TrimSpace(filter.SourceType)
	if (filter.Kind != "" && filter.Kind != FinancePaymentKindSettlement && filter.Kind != FinancePaymentKindAdvance && filter.Kind != FinancePaymentKindRefund) ||
		filter.SourceID < 0 || filter.RefundOfPaymentID < 0 || (filter.SourceType == "") != (filter.SourceID == 0) ||
		(filter.SourceType != "" && filter.SourceType != "sales_order" && filter.SourceType != "purchase_order" && filter.SourceType != "outsourcing_order") {
		return FinancePaymentFilter{}, ErrBadParam
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	filter.Direction = strings.ToUpper(strings.TrimSpace(filter.Direction))
	filter.CounterpartyType = strings.ToUpper(strings.TrimSpace(filter.CounterpartyType))
	if filter.Status != "" &&
		filter.Status != FinancePaymentStatusDraft &&
		filter.Status != FinancePaymentStatusApproved &&
		filter.Status != FinancePaymentStatusRejected &&
		filter.Status != FinancePaymentStatusPosted &&
		filter.Status != FinancePaymentStatusReversed &&
		filter.Status != FinancePaymentStatusCancelled {
		return FinancePaymentFilter{}, ErrBadParam
	}
	if filter.Direction != "" && filter.Direction != FinancePaymentDirectionReceipt && filter.Direction != FinancePaymentDirectionDisbursement {
		return FinancePaymentFilter{}, ErrBadParam
	}
	if filter.CounterpartyType != "" && filter.CounterpartyType != FinanceCounterpartyCustomer && filter.CounterpartyType != FinanceCounterpartySupplier {
		return FinancePaymentFilter{}, ErrBadParam
	}
	if filter.CounterpartyID < 0 || filter.Offset < 0 {
		return FinancePaymentFilter{}, ErrBadParam
	}
	filter.Limit = NormalizeBusinessListLimit(filter.Limit)
	return filter, nil
}

func (uc *OperationalFactUsecase) financePaymentRepo() (FinancePaymentRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := uc.repo.(FinancePaymentRepo)
	return repo, ok
}

func normalizeFinancePaymentCreate(in FinancePaymentCreate) (FinancePaymentCreate, string, error) {
	in.Kind = strings.ToUpper(strings.TrimSpace(in.Kind))
	if in.Kind == "" {
		in.Kind = FinancePaymentKindSettlement
	}
	in.SourceType = strings.TrimSpace(in.SourceType)
	in.PurposeNote = strings.TrimSpace(in.PurposeNote)
	in.PaymentNo = strings.TrimSpace(in.PaymentNo)
	in.Direction = strings.ToUpper(strings.TrimSpace(in.Direction))
	in.CounterpartyType = strings.ToUpper(strings.TrimSpace(in.CounterpartyType))
	in.AccountRef = strings.TrimSpace(in.AccountRef)
	in.EvidenceRef = strings.TrimSpace(in.EvidenceRef)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	var currencyOK bool
	in.Currency, currencyOK = NormalizeFinanceCurrency(in.Currency)
	validPairing := (in.Direction == FinancePaymentDirectionReceipt && in.CounterpartyType == FinanceCounterpartyCustomer) ||
		(in.Direction == FinancePaymentDirectionDisbursement && in.CounterpartyType == FinanceCounterpartySupplier)
	switch in.Kind {
	case FinancePaymentKindSettlement:
		if in.SourceType != "" || in.SourceID != 0 || in.RefundOfPaymentID != 0 {
			return FinancePaymentCreate{}, "", ErrBadParam
		}
	case FinancePaymentKindAdvance:
		validSource := (in.CounterpartyType == FinanceCounterpartyCustomer && in.SourceType == "sales_order") ||
			(in.CounterpartyType == FinanceCounterpartySupplier && (in.SourceType == "purchase_order" || in.SourceType == "outsourcing_order"))
		if !validSource || in.SourceID <= 0 || in.RefundOfPaymentID != 0 {
			return FinancePaymentCreate{}, "", ErrBadParam
		}
	case FinancePaymentKindRefund:
		validPairing = (in.Direction == FinancePaymentDirectionDisbursement && in.CounterpartyType == FinanceCounterpartyCustomer) ||
			(in.Direction == FinancePaymentDirectionReceipt && in.CounterpartyType == FinanceCounterpartySupplier)
		if in.RefundOfPaymentID <= 0 || in.SourceType != "" || in.SourceID != 0 || in.PurposeNote == "" {
			return FinancePaymentCreate{}, "", ErrBadParam
		}
	default:
		return FinancePaymentCreate{}, "", ErrBadParam
	}
	if in.PaymentNo == "" || !validPairing || in.CounterpartyID <= 0 || !in.Amount.IsPositive() || !currencyOK || in.AccountRef == "" || in.EvidenceRef == "" || in.IdempotencyKey == "" {
		return FinancePaymentCreate{}, "", ErrBadParam
	}
	if len([]rune(in.PaymentNo)) > 64 || len([]rune(in.AccountRef)) > 128 ||
		len([]rune(in.EvidenceRef)) > 255 || len([]rune(in.IdempotencyKey)) > 128 || len([]rune(in.PurposeNote)) > 255 {
		return FinancePaymentCreate{}, "", ErrBadParam
	}
	if in.OccurredAtSpecified && in.OccurredAt.IsZero() {
		return FinancePaymentCreate{}, "", ErrBadParam
	}
	// Existing settlement receipts retain their original idempotency identity.
	hashInput := in
	if hashInput.Kind == FinancePaymentKindSettlement {
		hashInput.Kind = ""
	}
	raw, err := json.Marshal(hashInput)
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
	if len([]rune(in.CreditNoteNo)) > 64 || len([]rune(in.Reason)) > 255 || len([]rune(in.IdempotencyKey)) > 128 {
		return FinanceCreditNoteCreate{}, "", ErrBadParam
	}
	raw, err := json.Marshal(in)
	if err != nil {
		return FinanceCreditNoteCreate{}, "", err
	}
	sum := sha256.Sum256(raw)
	return in, hex.EncodeToString(sum[:]), nil
}
