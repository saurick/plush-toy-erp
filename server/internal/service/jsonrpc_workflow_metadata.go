package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWorkflowMetadata(ctx context.Context, id string) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	taskStates, businessStates, planningPhases := d.workflowUC.Metadata()
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data: newDataStruct(map[string]any{
			"task_states":     workflowStateOptionsToAny(taskStates),
			"business_states": workflowStateOptionsToAny(businessStates),
			"planning_phases": workflowStateOptionsToAny(planningPhases),
		}),
	}, nil
}
