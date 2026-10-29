package biz

import (
	"context"
	"strings"
	"time"
)

type PurchaseFollowupAccess struct {
	Quality    bool `json:"quality"`
	Commercial bool `json:"commercial"`
	Finance    bool `json:"finance"`
}

type PurchaseFollowupQuery struct {
	View, Kind, Keyword, Confirmation, StartDate, SelectedDate string
	SupplierID, OrderID, Limit, Offset                         int
	WarehouseScope                                             WarehouseDataScope
	SnapshotAt                                                 time.Time
	Access                                                     PurchaseFollowupAccess
}

type PurchaseFollowupRow struct {
	Key          string `json:"key"`
	Kind         string `json:"kind"`
	SourceType   string `json:"source_type"`
	SourceID     int    `json:"source_id"`
	SourceNo     string `json:"source_no"`
	OrderID      int    `json:"order_id"`
	OrderNo      string `json:"order_no"`
	LineID       int    `json:"line_id"`
	LineNo       string `json:"line_no"`
	SupplierID   int    `json:"supplier_id"`
	SupplierName string `json:"supplier_name"`
	MaterialCode string `json:"material_code"`
	MaterialName string `json:"material_name"`
	UnitName     string `json:"unit_name"`
	Quantity     string `json:"quantity"`
	DueDate      string `json:"due_date"`
	DateSource   string `json:"date_source"`
}

type PurchaseFollowupBoard struct {
	Rows     []*PurchaseFollowupRow `json:"rows"`
	Total    int                    `json:"total"`
	Counts   map[string]int         `json:"counts"`
	Days     map[string]int         `json:"days"`
	AsOfDate string                 `json:"as_of_date"`
	Access   PurchaseFollowupAccess `json:"access"`
}

type PurchaseFollowupRepo interface {
	ListPurchaseFollowups(context.Context, PurchaseFollowupQuery) (*PurchaseFollowupBoard, error)
}

func (uc *PurchaseOrderUsecase) ListPurchaseFollowups(ctx context.Context, q PurchaseFollowupQuery) (*PurchaseFollowupBoard, error) {
	repo, ok := uc.repo.(PurchaseFollowupRepo)
	if !ok {
		return nil, ErrBadParam
	}
	q.Keyword = strings.TrimSpace(q.Keyword)
	if q.View == "" {
		q.View = "arrival"
	}
	if q.Kind == "" {
		q.Kind = "all"
	}
	if q.Confirmation == "" {
		q.Confirmation = "all"
	}
	if q.Limit == 0 {
		q.Limit = 25
	}
	if q.Limit < 1 || q.Limit > 200 || q.Offset < 0 || q.OrderID < 0 || q.SupplierID < 0 || len([]rune(q.Keyword)) > 100 {
		return nil, ErrBadParam
	}
	if q.View != "arrival" && q.View != "exceptions" {
		return nil, ErrBadParam
	}
	if q.Confirmation != "all" && q.Confirmation != "confirmed" && q.Confirmation != "unconfirmed" {
		return nil, ErrBadParam
	}
	switch q.Kind {
	case "all", "overdue", "due_soon", "unscheduled", "scheduled", "period", "date", "pending_inspection", "rejected", "ready_inbound", "missing_price", "unsettled":
	default:
		return nil, ErrBadParam
	}
	if (q.Kind == "pending_inspection" || q.Kind == "rejected" || q.Kind == "ready_inbound") && !q.Access.Quality {
		return nil, ErrForbidden
	}
	if q.Kind == "missing_price" && !q.Access.Commercial || q.Kind == "unsettled" && !q.Access.Finance {
		return nil, ErrForbidden
	}
	if q.SnapshotAt.IsZero() {
		q.SnapshotAt = time.Now()
	}
	if q.StartDate == "" {
		q.StartDate = q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
	}
	for _, date := range []string{q.StartDate, q.SelectedDate} {
		if date == "" {
			continue
		}
		if parsed, err := time.Parse("2006-01-02", date); err != nil || parsed.Format("2006-01-02") != date {
			return nil, ErrBadParam
		}
	}
	if q.Kind == "date" && q.SelectedDate == "" {
		return nil, ErrBadParam
	}
	return repo.ListPurchaseFollowups(ctx, q)
}
