package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

// A shared link is a read entry, never a permission grant or an assignment.
func (d *jsonrpcDispatcher) handleWorkflowTaskLink(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	if res := rejectUnknownWorkflowTaskParams(pm, "get_task_link", "task_id", "offset"); res != nil {
		return id, res, nil
	}
	taskID, valid := getRequiredJSONRPCPositiveInt(pm, "task_id")
	offset, validOffset := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !valid || !validOffset || offset > workflowTaskBoardMaxOffset {
		return id, invalidParamResult(), nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	scope, res := d.workflowTaskReadVisibilityScope(ctx, admin)
	if res != nil {
		return id, res, nil
	}
	chain, err := d.workflowUC.GetHandlingChainPage(ctx, taskID, biz.WorkflowHandlingChainLinkView, scope, offset)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	items := workflowHandlingChainItems(chain)
	for index, item := range chain.Items {
		canHandle := false
		if item.Status == "ready" || item.Status == "blocked" {
			task, err := d.workflowUC.GetTask(ctx, item.ID)
			if err != nil {
				return id, d.mapWorkflowError(ctx, err), nil
			}
			canHandle = d.workflowTrackingTaskAccess(ctx, admin, task)["can_handle"] == true
		}
		items[index].(map[string]any)["can_handle"] = canHandle
	}
	return id, okData(map[string]any{"items": items, "truncated": chain.Truncated}), nil
}
