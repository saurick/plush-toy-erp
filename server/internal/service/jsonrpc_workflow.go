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
	if workflowMethodRequiresEnabledModule(method) {
		if res := validateWorkflowTaskWritePublicParams(method, pm); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, "", workflowModuleKeyTasks); res != nil {
			return id, res, nil
		}
	}

	switch method {
	case "metadata":
		return d.handleWorkflowMetadata(ctx, id)
	case "list_tasks", "list_role_tasks", "get_task_board", "list_task_events", "get_task_assignment_options", "create_task", "complete_task_action", "block_task_action", "reject_task_action", "resume_task_action", "urge_task", "reassign_task", "explain_action_access", "explain_task_assignment":
		return d.handleWorkflowTask(ctx, method, id, pm, claims.UserID)
	case "list_business_states":
		return d.handleWorkflowBusinessState(ctx, method, id, pm, claims.UserID)
	default:
		return id, unknownWorkflowResult(method), nil
	}
}

const workflowModuleKeyTasks = "workflow_tasks"

func workflowMethodRequiresEnabledModule(method string) bool {
	switch method {
	case "create_task", "complete_task_action", "block_task_action", "reject_task_action", "resume_task_action", "urge_task", "reassign_task":
		return true
	default:
		return false
	}
}
