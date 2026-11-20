package biz

import "context"

type WorkflowHandlingChainView string

const (
	WorkflowHandlingChainTaskView  WorkflowHandlingChainView = "task"
	WorkflowHandlingChainOrderView WorkflowHandlingChainView = "order"
	// Link view uses the original task only as a relation anchor; returned tasks
	// remain constrained by the reader's current visibility.
	WorkflowHandlingChainLinkView WorkflowHandlingChainView = "link"
)

// The chain is a bounded, permission-scoped read of existing tasks and source
// relationships. It owns no workflow state and exposes no source payloads.
type WorkflowHandlingChainItem struct {
	Discovery                                    *WorkflowTaskDiscovery
	AssigneeID                                   int
	ID, ProcessInstanceID, ExceptionID           int
	Name, Group, Status, OwnerRoleKey            string
	SourceType, SourceNo, OperationCode, BatchNo string
	ExceptionNo, ExceptionOperationCode          string
}

type WorkflowHandlingChain struct {
	Items     []WorkflowHandlingChainItem
	Truncated bool
}

type WorkflowHandlingChainReader interface {
	GetWorkflowHandlingChain(context.Context, int, WorkflowHandlingChainView, *WorkflowTaskVisibilityScope) (*WorkflowHandlingChain, error)
}

func (uc *WorkflowUsecase) GetHandlingChain(ctx context.Context, taskID int, view WorkflowHandlingChainView, scope *WorkflowTaskVisibilityScope) (*WorkflowHandlingChain, error) {
	if uc == nil || taskID <= 0 || scope == nil || (view != WorkflowHandlingChainTaskView && view != WorkflowHandlingChainOrderView && view != WorkflowHandlingChainLinkView) {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(WorkflowHandlingChainReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.GetWorkflowHandlingChain(ctx, taskID, view, scope)
}

// Pagination continues the same permission-scoped relation; each read reflects
// current source state and consumers deduplicate tasks when appending pages.
type WorkflowHandlingChainPageReader interface {
	GetWorkflowHandlingChainPage(context.Context, int, WorkflowHandlingChainView, *WorkflowTaskVisibilityScope, int) (*WorkflowHandlingChain, error)
}

func (uc *WorkflowUsecase) GetHandlingChainPage(ctx context.Context, taskID int, view WorkflowHandlingChainView, scope *WorkflowTaskVisibilityScope, offset int) (*WorkflowHandlingChain, error) {
	if offset == 0 {
		return uc.GetHandlingChain(ctx, taskID, view, scope)
	}
	if uc == nil || scope == nil || taskID <= 0 || offset < 0 || (view != WorkflowHandlingChainTaskView && view != WorkflowHandlingChainOrderView && view != WorkflowHandlingChainLinkView) {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(WorkflowHandlingChainPageReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.GetWorkflowHandlingChainPage(ctx, taskID, view, scope, offset)
}
