package biz

import (
	"context"
	"strings"
	"time"
)

const (
	WorkflowRoleTaskViewTodo    = "todo"
	WorkflowRoleTaskViewHistory = "history"
	WorkflowRoleTaskViewRisk    = "risk"
)

type WorkflowRoleTaskViewQuery struct {
	ViewKey              string
	RoleKey              string
	Limit                int
	BeforeID             int
	VisibleAssigneeID    *int
	VisibilityScope      *WorkflowTaskVisibilityScope
	CrossRoleRiskAllowed bool
	SnapshotAt           time.Time
}

type WorkflowRoleTaskViewPage struct {
	Items      []*WorkflowTask
	NextID     int
	HasMore    bool
	SnapshotAt time.Time
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
	if query.RoleKey == "" || query.BeforeID < 0 {
		return nil, ErrBadParam
	}
	switch query.ViewKey {
	case WorkflowRoleTaskViewTodo, WorkflowRoleTaskViewHistory, WorkflowRoleTaskViewRisk:
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
	return repo.ListWorkflowRoleTaskView(ctx, query)
}
