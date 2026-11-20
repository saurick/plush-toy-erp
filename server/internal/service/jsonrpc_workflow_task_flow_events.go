package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) workflowTaskFlowEventResult(ctx context.Context, taskID, limit, beforeEventID int, scope *biz.WorkflowTaskVisibilityScope) *v1.JsonrpcResult {
	records, err := d.workflowUC.ListTaskFlowEvents(ctx, taskID, limit+1, beforeEventID, scope)
	if err != nil {
		return d.mapWorkflowError(ctx, err)
	}
	truncated := len(records) > limit
	if truncated {
		records = records[:limit]
	}
	items := make([]any, 0, len(records))
	for _, record := range records {
		if record == nil || record.Event == nil || record.Task == nil || record.Event.TaskID != record.Task.ID {
			return d.mapWorkflowError(ctx, biz.ErrBadParam)
		}
		item := workflowTaskEventsToAny([]*biz.WorkflowTaskEvent{record.Event})[0].(map[string]any)
		task := record.Task
		item["task"] = map[string]any{"id": task.ID, "task_name": task.TaskName, "task_group": task.TaskGroup, "owner_role_key": task.OwnerRoleKey, "required_capability_key": workflowStringValue(task.RequiredCapabilityKey), "source_type": task.SourceType, "source_id": task.SourceID}
		items = append(items, item)
	}
	return okData(map[string]any{"items": items, "truncated": truncated})
}
