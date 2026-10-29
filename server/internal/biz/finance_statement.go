package biz

import (
	"context"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

var financeBusinessLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

func FinanceDateRange(dateFrom, dateTo string) (time.Time, time.Time, error) {
	from, err := time.ParseInLocation("2006-01-02", dateFrom, financeBusinessLocation)
	if err != nil {
		return time.Time{}, time.Time{}, ErrBadParam
	}
	to, err := time.ParseInLocation("2006-01-02", dateTo, financeBusinessLocation)
	if err != nil || to.Before(from) {
		return time.Time{}, time.Time{}, ErrBadParam
	}
	return from.UTC(), to.AddDate(0, 0, 1).UTC(), nil
}

type FinanceStatementQuery struct {
	CounterpartyType, Currency, DateFrom, DateTo string
	CounterpartyID, Limit, Offset                int
	SnapshotAt                                   time.Time
}
type FinanceStatementEntry struct {
	Key      string          `json:"key"`
	Date     string          `json:"date"`
	Kind     string          `json:"kind"`
	Number   string          `json:"number"`
	SourceID int             `json:"source_id"`
	Amount   decimal.Decimal `json:"amount"`
	Balance  decimal.Decimal `json:"balance"`
}
type FinanceStatement struct {
	CounterpartyType string                   `json:"counterparty_type"`
	CounterpartyID   int                      `json:"counterparty_id"`
	Currency         string                   `json:"currency"`
	DateFrom         string                   `json:"date_from"`
	DateTo           string                   `json:"date_to"`
	SnapshotAt       time.Time                `json:"snapshot_at"`
	Opening          decimal.Decimal          `json:"opening"`
	Increase         decimal.Decimal          `json:"increase"`
	Decrease         decimal.Decimal          `json:"decrease"`
	Closing          decimal.Decimal          `json:"closing"`
	Entries          []*FinanceStatementEntry `json:"entries"`
	Total            int                      `json:"total"`
}
type FinanceStatementRepo interface {
	GetFinanceStatement(context.Context, FinanceStatementQuery) (*FinanceStatement, error)
}

func (uc *OperationalFactUsecase) GetFinanceStatement(ctx context.Context, q FinanceStatementQuery) (*FinanceStatement, error) {
	repo, ok := uc.repo.(FinanceStatementRepo)
	if !ok {
		return nil, ErrBadParam
	}
	q.CounterpartyType = strings.ToUpper(strings.TrimSpace(q.CounterpartyType))
	if q.CounterpartyID <= 0 || q.Offset < 0 || (q.CounterpartyType != FinanceCounterpartyCustomer && q.CounterpartyType != FinanceCounterpartySupplier) {
		return nil, ErrBadParam
	}
	q.Currency, ok = NormalizeFinanceCurrency(q.Currency)
	if !ok {
		return nil, ErrBadParam
	}
	if _, _, err := FinanceDateRange(q.DateFrom, q.DateTo); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if q.SnapshotAt.IsZero() {
		q.SnapshotAt = now
	}
	if q.SnapshotAt.After(now.Add(time.Minute)) {
		return nil, ErrBadParam
	}
	q.Limit = NormalizeBusinessListLimit(q.Limit)
	return repo.GetFinanceStatement(ctx, q)
}

type FinancePaymentTotal struct {
	Currency  string          `json:"currency"`
	Direction string          `json:"direction"`
	Status    string          `json:"status"`
	Amount    decimal.Decimal `json:"amount"`
	Count     int             `json:"count"`
}
type FinancePaymentTotalsRepo interface {
	FinancePaymentTotals(context.Context, FinancePaymentFilter) ([]*FinancePaymentTotal, error)
}

func (uc *OperationalFactUsecase) FinancePaymentTotals(ctx context.Context, filter FinancePaymentFilter) ([]*FinancePaymentTotal, error) {
	repo, ok := uc.repo.(FinancePaymentTotalsRepo)
	if !ok {
		return nil, ErrBadParam
	}
	filter, err := normalizeFinancePaymentListFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.FinancePaymentTotals(ctx, filter)
}
