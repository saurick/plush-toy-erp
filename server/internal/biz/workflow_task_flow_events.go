package biz

import "context"

// Flow records retain the exact originating task. They are a read projection,
// not a new workflow state or a source document's ledger.
type WorkflowTaskFlowEvent struct {
	Event *WorkflowTaskEvent
	Task  *WorkflowTask
}

type WorkflowTaskFlowEventReader interface {
	ListWorkflowTaskFlowEvents(context.Context, int, int, int, *WorkflowTaskVisibilityScope) ([]*WorkflowTaskFlowEvent, error)
}

func (uc *WorkflowUsecase) ListTaskFlowEvents(ctx context.Context, taskID, limit, beforeEventID int, scope *WorkflowTaskVisibilityScope) ([]*WorkflowTaskFlowEvent, error) {
	if uc == nil || scope == nil || taskID <= 0 || limit < 1 || limit > WorkflowTaskEventPageMaxLimit+1 || beforeEventID < 0 {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(WorkflowTaskFlowEventReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.ListWorkflowTaskFlowEvents(ctx, taskID, limit, beforeEventID, scope)
}
