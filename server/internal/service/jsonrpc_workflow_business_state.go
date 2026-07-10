package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWorkflowBusinessState(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_business_states":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		limit := getWorkflowLimit(pm)
		offset := getWorkflowOffset(pm)
		states, total, err := d.workflowUC.ListBusinessStates(ctx, biz.WorkflowBusinessStateFilter{
			Limit:             limit,
			Offset:            offset,
			SourceType:        getString(pm, "source_type"),
			SourceID:          getInt(pm, "source_id", 0),
			BusinessStatusKey: getString(pm, "business_status_key"),
			OwnerRoleKey:      getString(pm, "owner_role_key"),
		})
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"business_states": workflowBusinessStatesToAny(states),
				"total":           total,
				"limit":           limit,
				"offset":          offset,
			}),
		}, nil
	default:
		return id, unknownWorkflowResult(method), nil
	}
}
