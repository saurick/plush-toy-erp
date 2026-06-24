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
	case "upsert_business_state":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskUpdate); res != nil {
			return id, res, nil
		}
		payload, ok := getWorkflowPayload(pm, "payload")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
		}
		state, err := d.workflowUC.UpsertBusinessState(ctx, &biz.WorkflowBusinessStateUpsert{
			SourceType:        getString(pm, "source_type"),
			SourceID:          getInt(pm, "source_id", 0),
			SourceNo:          getWorkflowStringPtr(pm, "source_no"),
			OrderID:           getWorkflowPositiveIntPtr(pm, "order_id"),
			BatchID:           getWorkflowPositiveIntPtr(pm, "batch_id"),
			BusinessStatusKey: getString(pm, "business_status_key"),
			OwnerRoleKey:      getWorkflowStringPtr(pm, "owner_role_key"),
			BlockedReason:     getWorkflowStringPtr(pm, "blocked_reason"),
			Payload:           payload,
		}, actorID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "业务状态已更新",
			Data:    newDataStruct(map[string]any{"business_state": workflowBusinessStateToMap(state)}),
		}, nil
	default:
		return id, unknownWorkflowResult(method), nil
	}
}
