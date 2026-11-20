package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWorkflowHandlingChain(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	if res := rejectUnknownWorkflowTaskParams(pm, "get_task_handling_chain", "task_id", "view", "offset"); res != nil {
		return id, res, nil
	}
	taskID, valid := getRequiredJSONRPCPositiveInt(pm, "task_id")
	if !valid {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务参数不完整"}, nil
	}
	view := biz.WorkflowHandlingChainTaskView
	if raw, exists := pm["view"]; exists {
		value, ok := raw.(string)
		view = biz.WorkflowHandlingChainView(value)
		if !ok || (view != biz.WorkflowHandlingChainTaskView && view != biz.WorkflowHandlingChainOrderView) {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务链查看范围无效"}, nil
		}
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	scope, res := d.workflowTaskReadVisibilityScope(ctx, admin)
	if res != nil {
		return id, res, nil
	}
	offset, valid := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !valid || offset > workflowTaskBoardMaxOffset {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务链分页条件无效"}, nil
	}
	chain, err := d.workflowUC.GetHandlingChainPage(ctx, taskID, view, scope, offset)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	items := workflowHandlingChainItems(chain)
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"items": items, "truncated": chain.Truncated})}, nil
}

func workflowHandlingChainItems(chain *biz.WorkflowHandlingChain) []any {
	items := make([]any, 0, len(chain.Items))
	for _, item := range chain.Items {
		items = append(items, map[string]any{"discovery": workflowTaskDiscoveryToMap(item.Discovery), "assignee_id": item.AssigneeID, "id": item.ID, "task_name": item.Name, "task_group": item.Group, "task_status_key": item.Status, "owner_role_key": item.OwnerRoleKey, "source_type": item.SourceType, "source_no": item.SourceNo, "process_instance_id": item.ProcessInstanceID, "operation_code": item.OperationCode, "batch_no": item.BatchNo, "exception_id": item.ExceptionID, "exception_no": item.ExceptionNo, "exception_operation_code": item.ExceptionOperationCode})
	}
	return items
}
