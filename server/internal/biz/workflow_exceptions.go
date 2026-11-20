package biz

import (
	"context"
	"strings"
)

// Exceptions are a read projection of quality and disposition facts. Task state
// can describe work remaining, but cannot establish that an incident is closed.
type WorkflowExceptionQuery struct {
	WorkflowTaskDiscoveryFilter
	Keyword, State, OwnerRoleKey string
	View                         string
	Limit, Offset                int
	Visibility                   *WorkflowTaskVisibilityScope
	TrackingRef                  *WorkflowTrackingRef
}

type WorkflowExceptionItem struct {
	Key         string                   `json:"key"`
	Number      string                   `json:"number"`
	Reason      string                   `json:"reason"`
	State       string                   `json:"state"`
	Disposition string                   `json:"disposition"`
	BatchNo     string                   `json:"batch_no"`
	OccurredAt  string                   `json:"occurred_at"`
	TaskIDs     []int                    `json:"task_ids"`
	Tasks       []*WorkflowTask          `json:"-"`
	Orders      []WorkflowExceptionOrder `json:"orders"`
}

type WorkflowExceptionOrder struct {
	ID     int    `json:"id"`
	Number string `json:"number"`
}

type WorkflowExceptionBoard struct {
	Items          []WorkflowExceptionItem  `json:"items"`
	Tasks          []*WorkflowTask          `json:"-"`
	Orders         []WorkflowExceptionOrder `json:"orders"`
	ViewTotal      int                      `json:"view_total"`
	Total          int                      `json:"total"`
	Open           int                      `json:"open"`
	Closed         int                      `json:"closed"`
	PendingTasks   int                      `json:"pending_tasks"`
	AffectedOrders int                      `json:"affected_orders"`
	Limit          int                      `json:"limit"`
	Offset         int                      `json:"offset"`
}

type WorkflowExceptionReader interface {
	ListWorkflowExceptions(context.Context, WorkflowExceptionQuery) (*WorkflowExceptionBoard, error)
}

func (uc *WorkflowUsecase) ListExceptions(ctx context.Context, q WorkflowExceptionQuery) (*WorkflowExceptionBoard, error) {
	if q.TrackingRef != nil && (q.TrackingRef.ID <= 0 || (q.TrackingRef.Kind != "process" && q.TrackingRef.Kind != "task")) {
		return nil, ErrBadParam
	}
	if uc == nil || q.Visibility == nil || !ValidWorkflowTaskDiscoveryFilter(q.WorkflowTaskDiscoveryFilter) || q.Offset < 0 || q.Limit < 1 || q.Limit > 100 || len([]rune(q.Keyword)) > 100 || strings.TrimSpace(q.Keyword) != q.Keyword || (q.State != "" && q.State != "open" && q.State != "closed") || (q.View != "" && q.View != "tasks" && q.View != "orders") {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(WorkflowExceptionReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.ListWorkflowExceptions(ctx, q)
}
