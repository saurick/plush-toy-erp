package biz

import (
	"context"
	"strings"
	"time"
)

const (
	BusinessProgressSortOrderNo   = "order_no"
	BusinessProgressSortDueDate   = "due_date"
	BusinessProgressSortProduct   = "product"
	BusinessProgressSortRemaining = "remaining_quantity"
	BusinessProgressSortCompleted = "completed_quantity"
)

// BusinessProgress is a read projection of source documents and posted facts.
// It never stores or accepts a separately editable completion percentage.
type BusinessProgressAccess struct {
	Sales      bool `json:"sales"`
	Production bool `json:"production"`
	Tasks      bool `json:"tasks"`
	WIP        bool `json:"wip"`
}

type BusinessProgressQuery struct {
	View, Keyword, Scope, DueStatus, Owner, DateFrom, DateTo string
	Display, DeliveryStatus                                  string
	SortBy, SortDirection                                    string
	OwnerName                                                string
	TaskStatus, TaskRole                                     string
	BlockedOnly, UnlinkedOnly                                bool
	Limit, Offset, ID, CustomerID                            int
	SnapshotAt                                               time.Time
	Access                                                   BusinessProgressAccess
	TaskVisibility                                           *WorkflowTaskVisibilityScope
}

type BusinessProgressCounts struct {
	Total    int                             `json:"total"`
	Overdue  int                             `json:"overdue"`
	DueSoon  int                             `json:"due_soon"`
	Blocked  int                             `json:"blocked"`
	Undated  int                             `json:"undated"`
	Unlinked int                             `json:"unlinked"`
	Delivery *BusinessProgressDeliveryCounts `json:"delivery,omitempty"`
}

type BusinessProgressDeliveryCounts struct {
	Closed    int `json:"closed"`
	Unknown   int `json:"unknown"`
	Delivered int `json:"delivered"`
}

type BusinessProgressLine struct {
	OrderID           int     `json:"sales_order_id"`
	LineNo            int     `json:"line_no"`
	CustomerProductNo string  `json:"customer_product_no"`
	DeliveryStatus    string  `json:"delivery_status"`
	RemainingQuantity *string `json:"remaining_quantity"`
}

type BusinessProgressRow struct {
	DeliveredLineCount *int                  `json:"delivered_line_count,omitempty"`
	RemainingQuantity  *string               `json:"remaining_quantity,omitempty"`
	ID                 int                   `json:"id"`
	View               string                `json:"view"`
	OrderNo            string                `json:"order_no"`
	Status             string                `json:"status"`
	Customer           string                `json:"customer"`
	Product            string                `json:"product"`
	ProductCount       int                   `json:"product_count"`
	LinkedProductCount int                   `json:"linked_product_count,omitempty"`
	ProductTypeCount   int                   `json:"product_type_count,omitempty"`
	ProductMatchCount  int                   `json:"product_match_count,omitempty"`
	ProductID          int                   `json:"product_id"`
	SalesOwner         string                `json:"sales_owner"`
	DueDate            string                `json:"due_date"`
	UpdatedAt          string                `json:"updated_at"`
	Active             bool                  `json:"active"`
	Overdue            bool                  `json:"overdue"`
	DueSoon            bool                  `json:"due_soon"`
	Blocked            bool                  `json:"blocked"`
	Unlinked           bool                  `json:"unlinked"`
	Unit               string                `json:"unit"`
	OrderedQuantity    *string               `json:"ordered_quantity"`
	ShippedQuantity    *string               `json:"shipped_quantity"`
	CompletedQuantity  *string               `json:"completed_quantity"`
	CurrentOperation   string                `json:"current_operation"`
	OperationCount     int                   `json:"operation_count"`
	DeliveryKnown      bool                  `json:"delivery_known"`
	EngineeringTotal   int                   `json:"engineering_total"`
	EngineeringReady   int                   `json:"engineering_ready"`
	ProductionOrders   int                   `json:"production_orders"`
	ProductionClosed   int                   `json:"production_closed"`
	MaterialTotal      int                   `json:"material_total"`
	MaterialPending    int                   `json:"material_pending"`
	InProgressBatches  int                   `json:"in_progress_batches"`
	OutsourcedBatches  int                   `json:"outsourced_batches"`
	WaitingBatches     int                   `json:"waiting_batches"`
	RejectedBatches    int                   `json:"rejected_batches"`
	PlannedBatches     int                   `json:"planned_batches"`
	OpenTasks          int                   `json:"open_tasks"`
	BlockedTasks       int                   `json:"blocked_tasks"`
	UnassignedTasks    int                   `json:"unassigned_tasks"`
	AttentionTaskID    int                   `json:"attention_task_id"`
	AttentionTask      string                `json:"attention_task"`
	AttentionReason    string                `json:"attention_reason"`
	AttentionOwner     string                `json:"attention_owner"`
	AttentionRole      string                `json:"attention_role"`
	Line               *BusinessProgressLine `json:"line,omitempty"`
}

type BusinessProgressBoard struct {
	Rows       []*BusinessProgressRow `json:"rows"`
	Total      int                    `json:"total"`
	Counts     BusinessProgressCounts `json:"counts"`
	SnapshotAt time.Time              `json:"snapshot_at"`
	Access     BusinessProgressAccess `json:"access"`
}

// Detail records contain navigation context only; editable documents remain on
// their domain pages. Sections are independently bounded and report truncation.
type BusinessProgressRecord struct {
	ID        int    `json:"id"`
	Kind      string `json:"kind"`
	TaskGroup string `json:"task_group,omitempty"`
	Number    string `json:"number"`
	Label     string `json:"label"`
	Status    string `json:"status"`
	Quantity  string `json:"quantity"`
	Unit      string `json:"unit"`
	Date      string `json:"date"`
	Owner     string `json:"owner"`
	Role      string `json:"role"`
	Note      string `json:"note"`
	ProductID int    `json:"product_id"`
	ParentID  int    `json:"parent_id"`
}

type BusinessProgressDetail struct {
	TaskTotal  int                                 `json:"task_total"`
	Row        *BusinessProgressRow                `json:"row"`
	Sections   map[string][]BusinessProgressRecord `json:"sections"`
	HasMore    map[string]bool                     `json:"has_more"`
	SnapshotAt time.Time                           `json:"snapshot_at"`
	Access     BusinessProgressAccess              `json:"access"`
}

type BusinessProgressTaskPage struct {
	Rows  []BusinessProgressRecord `json:"rows"`
	Total int                      `json:"total"`
}

type BusinessProgressOwnerOptions struct {
	Names []string `json:"names"`
}

type BusinessProgressRepo interface {
	GetSalesDeliveryProgress(context.Context, BusinessProgressQuery) (*SalesDeliveryProgress, error)
	ListBusinessProgressOwners(context.Context, BusinessProgressQuery) (*BusinessProgressOwnerOptions, error)
	ListBusinessProgressTasks(context.Context, BusinessProgressQuery) (*BusinessProgressTaskPage, error)
	ListBusinessProgress(context.Context, BusinessProgressQuery) (*BusinessProgressBoard, error)
	GetBusinessProgress(context.Context, BusinessProgressQuery) (*BusinessProgressDetail, error)
}

type BusinessProgressUsecase struct{ repo BusinessProgressRepo }

func NewBusinessProgressUsecase(repo BusinessProgressRepo) *BusinessProgressUsecase {
	return &BusinessProgressUsecase{repo: repo}
}

func (uc *BusinessProgressUsecase) Tasks(ctx context.Context, q BusinessProgressQuery) (*BusinessProgressTaskPage, error) {
	q, err := normalizeBusinessProgressQuery(q)
	if err != nil {
		return nil, err
	}
	if !q.Access.Tasks {
		return nil, ErrForbidden
	}
	if q.ID <= 0 || (q.TaskStatus != "" && q.TaskStatus != "all" && q.TaskStatus != "open" && q.TaskStatus != "ended") ||
		len([]rune(q.TaskRole)) > 64 || strings.TrimSpace(q.TaskRole) != q.TaskRole || uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	return uc.repo.ListBusinessProgressTasks(ctx, q)
}

func normalizeBusinessProgressQuery(q BusinessProgressQuery) (BusinessProgressQuery, error) {
	q.Keyword, q.Owner = strings.TrimSpace(q.Keyword), strings.TrimSpace(q.Owner)
	if q.View == "" {
		q.View = "orders"
	}
	if q.Scope == "" {
		q.Scope = "active"
	}
	if q.DueStatus == "" {
		q.DueStatus = "all"
	}
	if q.Limit == 0 {
		q.Limit = 20
	}
	if q.Display == "lines" && q.DeliveryStatus == "" {
		q.DeliveryStatus = "all"
	}
	switch q.SortBy {
	case "":
		if q.SortDirection != "" {
			return q, ErrBadParam
		}
	case BusinessProgressSortOrderNo, BusinessProgressSortDueDate:
	case BusinessProgressSortRemaining:
		if q.View != "orders" {
			return q, ErrBadParam
		}
	case BusinessProgressSortCompleted:
		if q.View != "production" {
			return q, ErrBadParam
		}
	case BusinessProgressSortProduct:
		if q.Display != "lines" {
			return q, ErrBadParam
		}
	default:
		return q, ErrBadParam
	}
	if q.SortBy != "" && q.SortDirection != "asc" && q.SortDirection != "desc" {
		return q, ErrBadParam
	}
	if q.View != "orders" && q.View != "production" ||
		q.Scope != "active" && q.Scope != "all" && q.Scope != "ended" ||
		q.DueStatus != "all" && q.DueStatus != "overdue" && q.DueStatus != "due_soon" && q.DueStatus != "undated" ||
		q.Scope == "ended" && (q.DueStatus == "overdue" || q.DueStatus == "due_soon" || q.BlockedOnly) ||
		q.View != "production" && q.UnlinkedOnly ||
		q.DueStatus == "undated" && (q.DateFrom != "" || q.DateTo != "") ||
		q.Display != "" && (q.Display != "lines" || q.View != "orders" || q.DueStatus != "all") ||
		q.Display != "lines" && q.DeliveryStatus != "" ||
		q.CustomerID < 0 || q.View != "orders" && q.CustomerID != 0 ||
		q.Limit < 1 || q.Limit > WorkCenterMaxLimit || q.Offset < 0 || q.Offset > 1000000 || q.ID < 0 ||
		len([]rune(q.Keyword)) > 100 || len([]rune(q.Owner)) > 100 || len([]rune(q.OwnerName)) > 128 {
		return q, ErrBadParam
	}
	if q.Display == "lines" {
		switch q.DeliveryStatus {
		case "all", "overdue", "due_soon", "closed", "unknown", "undated", "delivered":
		default:
			return q, ErrBadParam
		}
		if q.DeliveryStatus == "undated" && (q.DateFrom != "" || q.DateTo != "") {
			return q, ErrBadParam
		}
	}
	if q.View == "orders" && !q.Access.Sales || q.View == "production" && !q.Access.Production {
		return q, ErrForbidden
	}
	if q.Access.Tasks && q.TaskVisibility == nil || q.BlockedOnly && !q.Access.Tasks {
		return q, ErrForbidden
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
	if q.SnapshotAt.IsZero() {
		q.SnapshotAt = time.Now().UTC()
	}
	return q, nil
}

func (uc *BusinessProgressUsecase) Owners(ctx context.Context, q BusinessProgressQuery) (*BusinessProgressOwnerOptions, error) {
	q, err := normalizeBusinessProgressQuery(q)
	if err != nil {
		return nil, err
	}
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	return uc.repo.ListBusinessProgressOwners(ctx, q)
}

func (uc *BusinessProgressUsecase) List(ctx context.Context, q BusinessProgressQuery) (*BusinessProgressBoard, error) {
	q, err := normalizeBusinessProgressQuery(q)
	if err != nil {
		return nil, err
	}
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	return uc.repo.ListBusinessProgress(ctx, q)
}

func (uc *BusinessProgressUsecase) Detail(ctx context.Context, q BusinessProgressQuery) (*BusinessProgressDetail, error) {
	if q.Display != "" || q.DeliveryStatus != "" || q.CustomerID != 0 || q.SortBy != "" || q.SortDirection != "" {
		return nil, ErrBadParam
	}
	q.Scope, q.DueStatus, q.Keyword, q.Owner, q.DateFrom, q.DateTo, q.Offset, q.Limit = "all", "all", "", "", "", "", 0, 1
	q.BlockedOnly, q.UnlinkedOnly = false, false
	q, err := normalizeBusinessProgressQuery(q)
	if err != nil {
		return nil, err
	}
	if q.ID <= 0 || uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	return uc.repo.GetBusinessProgress(ctx, q)
}
