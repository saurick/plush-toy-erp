package biz

import (
	"context"
	"strings"
	"time"
)

const (
	WorkflowRoleTaskViewTodo     = "todo"
	WorkflowRoleTaskViewHistory  = "history"
	WorkflowRoleTaskViewRisk     = "risk"
	WorkflowRoleTaskViewApproval = "approval"
)

type WorkflowRoleTaskViewQuery struct {
	ViewKey                  string
	RoleKey                  string
	Limit                    int
	BeforeID                 int
	IncludeCounts            bool
	VisibleAssigneeID        *int
	VisibilityScope          *WorkflowTaskVisibilityScope
	ApprovalVisibilityScopes []WorkflowApprovalVisibilityScope
	CrossRoleRiskAllowed     bool
	SnapshotAt               time.Time
}

type WorkflowRoleTaskViewCounts struct {
	Ready    int
	Blocked  int
	Todo     int
	Done     int
	Rejected int
	History  int
	Total    int
	Approval int
	Risk     int
	Overdue  int
}

// IsConserved validates the mutually exclusive task-status partition. Approval,
// risk and overdue are overlapping attention facets, so they are deliberately
// not added to Total; only overdue is required to be a subset of risk.
func (counts WorkflowRoleTaskViewCounts) IsConserved() bool {
	values := []int{
		counts.Ready,
		counts.Blocked,
		counts.Todo,
		counts.Done,
		counts.Rejected,
		counts.History,
		counts.Total,
		counts.Approval,
		counts.Risk,
		counts.Overdue,
	}
	for _, value := range values {
		if value < 0 {
			return false
		}
	}
	return counts.Todo == counts.Ready+counts.Blocked &&
		counts.History == counts.Done+counts.Rejected &&
		counts.Total == counts.Todo+counts.History &&
		counts.Overdue <= counts.Risk
}

func (counts WorkflowRoleTaskViewCounts) ViewTotal(viewKey string) (int, bool) {
	switch strings.TrimSpace(viewKey) {
	case WorkflowRoleTaskViewTodo:
		return counts.Todo, true
	case WorkflowRoleTaskViewHistory:
		return counts.History, true
	case WorkflowRoleTaskViewRisk:
		return counts.Risk, true
	case WorkflowRoleTaskViewApproval:
		return counts.Approval, true
	default:
		return 0, false
	}
}

type WorkflowRoleTaskViewPage struct {
	Items      []*WorkflowTask
	NextID     int
	HasMore    bool
	SnapshotAt time.Time
	Counts     *WorkflowRoleTaskViewCounts
}

type WorkflowRoleTaskViewRepo interface {
	ListWorkflowRoleTaskView(context.Context, WorkflowRoleTaskViewQuery) (*WorkflowRoleTaskViewPage, error)
}

func (uc *WorkflowUsecase) ListRoleTaskView(ctx context.Context, query WorkflowRoleTaskViewQuery) (*WorkflowRoleTaskViewPage, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(WorkflowRoleTaskViewRepo)
	if !ok {
		return nil, ErrBadParam
	}
	query.ViewKey = strings.TrimSpace(query.ViewKey)
	query.RoleKey = NormalizeRoleKey(query.RoleKey)
	query.VisibilityScope = NormalizeWorkflowTaskVisibilityScope(query.VisibilityScope)
	query.ApprovalVisibilityScopes = NormalizeWorkflowApprovalVisibilityScopes(query.ApprovalVisibilityScopes)
	if query.RoleKey == "" || query.BeforeID < 0 {
		return nil, ErrBadParam
	}
	if query.BeforeID > 0 {
		query.IncludeCounts = false
	}
	switch query.ViewKey {
	case WorkflowRoleTaskViewTodo, WorkflowRoleTaskViewHistory, WorkflowRoleTaskViewRisk, WorkflowRoleTaskViewApproval:
	default:
		return nil, ErrBadParam
	}
	if query.Limit <= 0 {
		query.Limit = 50
	}
	if query.Limit > 100 {
		query.Limit = 100
	}
	if query.SnapshotAt.IsZero() {
		query.SnapshotAt = time.Now()
	}
	query.SnapshotAt = time.Unix(query.SnapshotAt.Unix(), 0).UTC()
	return repo.ListWorkflowRoleTaskView(ctx, query)
}
