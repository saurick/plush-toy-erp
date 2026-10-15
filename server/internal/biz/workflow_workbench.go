package biz

import (
	"context"
	"strings"
	"time"
)

const (
	WorkflowWorkbenchQueueActionable = "actionable"
	WorkflowWorkbenchQueueRisk       = "risk"
	WorkflowWorkbenchQueueApproval   = "approval"

	workflowWorkbenchDefaultLimit = 8
	workflowWorkbenchMaxLimit     = 50
)

type WorkflowWorkbenchQuery struct {
	QueueKey                 string
	Limit                    int
	Offset                   int
	VisibilityScope          *WorkflowTaskVisibilityScope
	RiskVisibilityScope      *WorkflowTaskVisibilityScope
	ApprovalVisibilityScopes []WorkflowApprovalVisibilityScope
	SnapshotAt               time.Time
}

type WorkflowWorkbenchCounts struct {
	Actionable int
	Risk       int
	Approval   int
}

func (counts WorkflowWorkbenchCounts) QueueTotal(queueKey string) (int, bool) {
	switch strings.TrimSpace(queueKey) {
	case WorkflowWorkbenchQueueActionable:
		return counts.Actionable, true
	case WorkflowWorkbenchQueueRisk:
		return counts.Risk, true
	case WorkflowWorkbenchQueueApproval:
		return counts.Approval, true
	default:
		return 0, false
	}
}

type WorkflowWorkbenchPage struct {
	SnapshotAt time.Time
	QueueKey   string
	Total      int
	Limit      int
	Offset     int
	Items      []*WorkflowTask
	Counts     WorkflowWorkbenchCounts
}

type WorkflowWorkbenchRepo interface {
	GetWorkflowWorkbench(context.Context, WorkflowWorkbenchQuery) (*WorkflowWorkbenchPage, error)
}

func (uc *WorkflowUsecase) GetWorkflowWorkbench(ctx context.Context, query WorkflowWorkbenchQuery) (*WorkflowWorkbenchPage, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(WorkflowWorkbenchRepo)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowWorkbenchQuery(query)
	if err != nil {
		return nil, err
	}
	return repo.GetWorkflowWorkbench(ctx, normalized)
}

func normalizeWorkflowWorkbenchQuery(query WorkflowWorkbenchQuery) (WorkflowWorkbenchQuery, error) {
	query.QueueKey = strings.TrimSpace(query.QueueKey)
	query.VisibilityScope = NormalizeWorkflowTaskVisibilityScope(query.VisibilityScope)
	query.RiskVisibilityScope = NormalizeWorkflowTaskVisibilityScope(query.RiskVisibilityScope)
	query.ApprovalVisibilityScopes = NormalizeWorkflowApprovalVisibilityScopes(query.ApprovalVisibilityScopes)
	if _, ok := (WorkflowWorkbenchCounts{}).QueueTotal(query.QueueKey); !ok {
		return WorkflowWorkbenchQuery{}, ErrBadParam
	}
	if query.Limit <= 0 {
		query.Limit = workflowWorkbenchDefaultLimit
	}
	if query.Limit > workflowWorkbenchMaxLimit {
		query.Limit = workflowWorkbenchMaxLimit
	}
	if query.Offset < 0 {
		return WorkflowWorkbenchQuery{}, ErrBadParam
	}
	if query.SnapshotAt.IsZero() {
		query.SnapshotAt = time.Now()
	}
	query.SnapshotAt = time.Unix(query.SnapshotAt.Unix(), 0).UTC()
	return query, nil
}
