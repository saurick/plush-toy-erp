package biz

import (
	"context"
	"regexp"
	"strings"
	"time"
)

// Statistics are read projections; source documents and posted ledgers retain
// ownership of quantities, amounts and settlement state.
type BusinessStatisticsAccess struct {
	Sales        bool `json:"sales"`
	SalesAmounts bool `json:"sales_amounts"`
	Receivables  bool `json:"receivables"`
}

type BusinessStatisticsQuery struct {
	Report, GroupBy, Currency, Keyword, Period, DateFrom, DateTo string
	Status, SourceStatus, GroupKey, Sort, Direction              string
	Limit, Offset                                                int
	SnapshotAt                                                   time.Time
	Access                                                       BusinessStatisticsAccess
}

type BusinessStatisticsMetrics struct {
	Count                 int     `json:"count"`
	Done                  int     `json:"done"`
	Pending               int     `json:"pending"`
	Closed                int     `json:"closed"`
	Unknown               int     `json:"unknown"`
	Overdue               int     `json:"overdue"`
	Soon                  int     `json:"soon"`
	Undated               int     `json:"undated"`
	Amount                *string `json:"amount"`
	ShippedAmount         *string `json:"shipped_amount"`
	MissingAmount         int     `json:"missing_amount"`
	MissingShipmentAmount int     `json:"missing_shipment_amount"`
	Balance               *string `json:"balance"`
	NotDue                *string `json:"not_due"`
	Late7                 *string `json:"late_7"`
	Late30                *string `json:"late_30"`
	Late60                *string `json:"late_60"`
	LateMore              *string `json:"late_more"`
	UnknownDue            *string `json:"unknown_due"`
}

type BusinessStatisticsGroup struct {
	Key  string `json:"key"`
	Name string `json:"name"`
	BusinessStatisticsMetrics
}

type BusinessStatisticsBoard struct {
	Report     string                    `json:"report"`
	GroupBy    string                    `json:"group_by"`
	Currency   string                    `json:"currency"`
	DateFrom   string                    `json:"date_from"`
	DateTo     string                    `json:"date_to"`
	SnapshotAt time.Time                 `json:"snapshot_at"`
	Access     BusinessStatisticsAccess  `json:"access"`
	Counts     BusinessStatisticsMetrics `json:"counts"`
	Totals     BusinessStatisticsMetrics `json:"totals"`
	Groups     []BusinessStatisticsGroup `json:"groups"`
	Total      int                       `json:"total"`
}

type BusinessStatisticsSource struct {
	ID              int     `json:"id"`
	Number          string  `json:"number"`
	Customer        string  `json:"customer"`
	Product         string  `json:"product"`
	ProductCount    int     `json:"product_count"`
	DueDate         string  `json:"due_date"`
	Status          string  `json:"status"`
	Owner           string  `json:"owner"`
	Unit            string  `json:"unit"`
	OrderedQuantity *string `json:"ordered_quantity"`
	ShippedQuantity *string `json:"shipped_quantity"`
	Amount          *string `json:"amount"`
	SourceNumber    string  `json:"source_number"`
}

type BusinessStatisticsSources struct {
	DateFrom   string                     `json:"date_from"`
	DateTo     string                     `json:"date_to"`
	Rows       []BusinessStatisticsSource `json:"rows"`
	Total      int                        `json:"total"`
	GroupName  string                     `json:"group_name"`
	SnapshotAt time.Time                  `json:"snapshot_at"`
	Access     BusinessStatisticsAccess   `json:"access"`
}

type BusinessStatisticsRepo interface {
	Statistics(context.Context, BusinessStatisticsQuery) (*BusinessStatisticsBoard, error)
	StatisticsSources(context.Context, BusinessStatisticsQuery) (*BusinessStatisticsSources, error)
}

type BusinessStatisticsUsecase struct{ repo BusinessStatisticsRepo }

func NewBusinessStatisticsUsecase(repo BusinessStatisticsRepo) *BusinessStatisticsUsecase {
	return &BusinessStatisticsUsecase{repo: repo}
}

var statisticsGroupKey = regexp.MustCompile(`^(c:[0-9]+|p:[1-9][0-9]*|u:[1-9][0-9]*)$`)

func normalizeBusinessStatisticsQuery(q BusinessStatisticsQuery) (BusinessStatisticsQuery, error) {
	q.Keyword = strings.TrimSpace(q.Keyword)
	if q.SnapshotAt.IsZero() {
		q.SnapshotAt = time.Now().UTC()
	}
	if q.Report == "" {
		q.Report = "delivery"
	}
	if q.GroupBy == "" {
		q.GroupBy = "customer"
	}
	if q.Currency == "" {
		q.Currency = FinanceCurrencyCNY
	}
	if q.Status == "" {
		q.Status = "all"
	}
	if q.SourceStatus == "" {
		q.SourceStatus = "all"
	}
	if q.Sort == "" {
		q.Sort = "count"
	}
	if q.Direction == "" {
		q.Direction = "desc"
	}
	if q.Limit == 0 {
		q.Limit = 10
	}
	if q.Period == "" {
		q.Period = "month"
	}
	if q.Report != "delivery" && q.Report != "receivables" ||
		q.GroupBy != "customer" && q.GroupBy != "product" ||
		q.Currency != FinanceCurrencyCNY && q.Currency != FinanceCurrencyUSD && q.Currency != FinanceCurrencyHKD ||
		q.Sort != "count" && q.Sort != "name" && q.Sort != "overdue" && q.Sort != "amount" ||
		q.Direction != "asc" && q.Direction != "desc" || q.Limit < 1 || q.Limit > 100 || q.Offset < 0 || q.Offset > 1000000 || len([]rune(q.Keyword)) > 100 {
		return q, ErrBadParam
	}
	if q.Report == "delivery" && !q.Access.Sales || q.Report == "receivables" && !q.Access.Receivables {
		return q, ErrForbidden
	}
	if q.Report == "delivery" && q.Sort == "amount" && !q.Access.SalesAmounts {
		return q, ErrForbidden
	}
	if q.Report == "receivables" && q.GroupBy != "customer" {
		return q, ErrBadParam
	}
	allowed := map[string]bool{"all": true, "overdue": true, "undated": true}
	if q.Report == "delivery" {
		for _, key := range []string{"done", "pending", "pending_not_late", "soon", "closed", "unknown"} {
			allowed[key] = true
		}
	} else {
		for _, key := range []string{"not_due", "late_7", "late_30", "late_60", "late_more"} {
			allowed[key] = true
		}
	}
	if !allowed[q.Status] || !allowed[q.SourceStatus] {
		return q, ErrBadParam
	}
	if q.GroupKey != "" && (!statisticsGroupKey.MatchString(q.GroupKey) || q.GroupBy == "customer" && !strings.HasPrefix(q.GroupKey, "c:") || q.GroupBy == "product" && strings.HasPrefix(q.GroupKey, "c:")) {
		return q, ErrBadParam
	}
	local := q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600))
	switch q.Period {
	case "month":
		first := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, local.Location())
		q.DateFrom, q.DateTo = first.Format("2006-01-02"), first.AddDate(0, 1, -1).Format("2006-01-02")
	case "soon":
		q.DateFrom, q.DateTo = local.Format("2006-01-02"), local.AddDate(0, 0, 6).Format("2006-01-02")
	case "all":
		q.DateFrom, q.DateTo = "", ""
	case "custom":
	default:
		return q, ErrBadParam
	}
	for _, date := range []string{q.DateFrom, q.DateTo} {
		if date != "" {
			if _, err := time.Parse("2006-01-02", date); err != nil {
				return q, ErrBadParam
			}
		}
	}
	if q.DateFrom != "" && q.DateTo != "" && q.DateFrom > q.DateTo {
		return q, ErrBadParam
	}
	// Aging is a current outstanding balance, not historical reconstruction.
	if q.Report == "receivables" {
		q.DateFrom, q.DateTo = "", ""
	}
	return q, nil
}

func (u *BusinessStatisticsUsecase) Board(ctx context.Context, q BusinessStatisticsQuery) (*BusinessStatisticsBoard, error) {
	q, err := normalizeBusinessStatisticsQuery(q)
	if err != nil {
		return nil, err
	}
	if u == nil || u.repo == nil || q.GroupKey != "" || q.SourceStatus != "all" {
		return nil, ErrBadParam
	}
	return u.repo.Statistics(ctx, q)
}
func (u *BusinessStatisticsUsecase) Sources(ctx context.Context, q BusinessStatisticsQuery) (*BusinessStatisticsSources, error) {
	q, err := normalizeBusinessStatisticsQuery(q)
	if err != nil {
		return nil, err
	}
	if u == nil || u.repo == nil || q.GroupKey == "" {
		return nil, ErrBadParam
	}
	return u.repo.StatisticsSources(ctx, q)
}
