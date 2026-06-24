package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleWorkflow(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)

	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	claims, res := d.requireAdmin(ctx)
	if res != nil {
		l.Warnf("[workflow] requireAdmin denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}
	if d.workflowUC == nil {
		l.Errorf("[workflow] usecase is nil method=%s id=%s", method, id)
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "metadata":
		return d.handleWorkflowMetadata(ctx, id)
	case "list_tasks", "create_task", "update_task_status", "urge_task":
		return d.handleWorkflowTask(ctx, method, id, pm, claims.UserID)
	case "list_business_states", "upsert_business_state":
		return d.handleWorkflowBusinessState(ctx, method, id, pm, claims.UserID)
	default:
		return id, unknownWorkflowResult(method), nil
	}
}
