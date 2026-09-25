package biz

import (
	"context"
	"strings"
	"time"
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
	View, Keyword, Scope, Risk, Owner, DateFrom, DateTo string
	Limit, Offset, ID                                   int
	SnapshotAt                                          time.Time
	Access                                              BusinessProgressAccess
	TaskVisibility                                      *WorkflowTaskVisibilityScope
}

type BusinessProgressCounts struct {
	Total   int `json:"total"`
	Overdue int `json:"overdue"`
	DueSoon int `json:"due_soon"`
	Blocked int `json:"blocked"`
	Undated int `json:"undated"`
}

type BusinessProgressRow struct {
	ID                int     `json:"id"`
	View              string  `json:"view"`
	OrderNo           string  `json:"order_no"`
	Status            string  `json:"status"`
	Customer          string  `json:"customer"`
	Product           string  `json:"product"`
	ProductCount      int     `json:"product_count"`
	ProductID         int     `json:"product_id"`
	SalesOwner        string  `json:"sales_owner"`
	DueDate           string  `json:"due_date"`
	UpdatedAt         string  `json:"updated_at"`
	Active            bool    `json:"active"`
	Overdue           bool    `json:"overdue"`
	DueSoon           bool    `json:"due_soon"`
	Blocked           bool    `json:"blocked"`
	Unlinked          bool    `json:"unlinked"`
	Unit              string  `json:"unit"`
	OrderedQuantity   *string `json:"ordered_quantity"`
	ShippedQuantity   *string `json:"shipped_quantity"`
	CompletedQuantity *string `json:"completed_quantity"`
	CurrentOperation  string  `json:"current_operation"`
	OperationCount    int     `json:"operation_count"`
	DeliveryKnown     bool    `json:"delivery_known"`
	EngineeringTotal  int     `json:"engineering_total"`
	EngineeringReady  int     `json:"engineering_ready"`
	ProductionOrders  int     `json:"production_orders"`
	ProductionClosed  int     `json:"production_closed"`
	MaterialTotal     int     `json:"material_total"`
	MaterialPending   int     `json:"material_pending"`
	InProgressBatches int     `json:"in_progress_batches"`
	OutsourcedBatches int     `json:"outsourced_batches"`
	WaitingBatches    int     `json:"waiting_batches"`
	RejectedBatches   int     `json:"rejected_batches"`
	PlannedBatches    int     `json:"planned_batches"`
	OpenTasks         int     `json:"open_tasks"`
	BlockedTasks      int     `json:"blocked_tasks"`
	UnassignedTasks   int     `json:"unassigned_tasks"`
	AttentionTaskID   int     `json:"attention_task_id"`
	AttentionTask     string  `json:"attention_task"`
	AttentionReason   string  `json:"attention_reason"`
	AttentionOwner    string  `json:"attention_owner"`
	AttentionRole     string  `json:"attention_role"`
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
	ID       int    `json:"id"`
	Kind     string `json:"kind"`
	Number   string `json:"number"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Quantity string `json:"quantity"`
	Unit     string `json:"unit"`
	Date     string `json:"date"`
	Owner    string `json:"owner"`
	Role     string `json:"role"`
	Note     string `json:"note"`
	ParentID int    `json:"parent_id"`
}

type BusinessProgressDetail struct {
	Row        *BusinessProgressRow                `json:"row"`
	Sections   map[string][]BusinessProgressRecord `json:"sections"`
	HasMore    map[string]bool                     `json:"has_more"`
	SnapshotAt time.Time                           `json:"snapshot_at"`
	Access     BusinessProgressAccess              `json:"access"`
}

type BusinessProgressRepo interface {
	ListBusinessProgress(context.Context, BusinessProgressQuery) (*BusinessProgressBoard, error)
	GetBusinessProgress(context.Context, BusinessProgressQuery) (*BusinessProgressDetail, error)
}

type BusinessProgressUsecase struct{ repo BusinessProgressRepo }

func NewBusinessProgressUsecase(repo BusinessProgressRepo) *BusinessProgressUsecase {
	return &BusinessProgressUsecase{repo: repo}
}

func normalizeBusinessProgressQuery(q BusinessProgressQuery) (BusinessProgressQuery, error) {
	q.Keyword, q.Owner = strings.TrimSpace(q.Keyword), strings.TrimSpace(q.Owner)
	if q.View == "" {
		q.View = "orders"
	}
	if q.Scope == "" {
		q.Scope = "active"
	}
	if q.Risk == "" {
		q.Risk = "all"
	}
	if q.Limit == 0 {
		q.Limit = 20
	}
	if q.View != "orders" && q.View != "production" ||
		q.Scope != "active" && q.Scope != "all" && q.Scope != "ended" ||
		q.Risk != "all" && q.Risk != "overdue" && q.Risk != "due_soon" && q.Risk != "blocked" && q.Risk != "undated" && q.Risk != "unlinked" ||
		q.Limit < 1 || q.Limit > 100 || q.Offset < 0 || q.Offset > 1000000 || q.ID < 0 ||
		len([]rune(q.Keyword)) > 100 || len([]rune(q.Owner)) > 100 {
		return q, ErrBadParam
	}
	if q.View == "orders" && !q.Access.Sales || q.View == "production" && !q.Access.Production {
		return q, ErrForbidden
	}
	if q.Access.Tasks && q.TaskVisibility == nil {
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
	q.Scope, q.Risk, q.Keyword, q.Owner, q.DateFrom, q.DateTo, q.Offset, q.Limit = "all", "all", "", "", "", "", 0, 1
	q, err := normalizeBusinessProgressQuery(q)
	if err != nil {
		return nil, err
	}
	if q.ID <= 0 || uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	return uc.repo.GetBusinessProgress(ctx, q)
}
