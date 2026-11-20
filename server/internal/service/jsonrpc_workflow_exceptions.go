package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWorkflowExceptions(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	if res := rejectUnknownWorkflowTaskParams(pm, "list_exceptions", "keyword", "state", "view", "owner_role_key", "module_key", "chain_key", "stage_key", "assignee", "limit", "offset", "tracking_kind", "tracking_id"); res != nil {
		return id, res, nil
	}
	query := biz.WorkflowExceptionQuery{}
	_, hasTrackingKind := pm["tracking_kind"]
	_, hasTrackingID := pm["tracking_id"]
	if hasTrackingKind || hasTrackingID {
		kind, res := getOptionalWorkflowTaskBoardString(pm, "tracking_kind", 16)
		refID, valid := getRequiredJSONRPCPositiveInt(pm, "tracking_id")
		if res != nil || !valid || (kind != "process" && kind != "task") {
			return id, invalidParamResult(), nil
		}
		query.TrackingRef = &biz.WorkflowTrackingRef{Kind: kind, ID: refID}
	}
	discovery, res := getWorkflowTaskDiscoveryFilter(pm)
	if res != nil {
		return id, res, nil
	}
	query.WorkflowTaskDiscoveryFilter = discovery
	for name, target := range map[string]*string{"keyword": &query.Keyword, "state": &query.State, "view": &query.View, "owner_role_key": &query.OwnerRoleKey} {
		value, res := getOptionalWorkflowTaskBoardString(pm, name, 100)
		if res != nil {
			return id, res, nil
		}
		*target = value
	}
	limit, valid := getOptionalWorkflowTaskBoardInteger(pm, "limit", 20, 1)
	offset, offsetValid := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !valid || !offsetValid || limit > 100 || offset > workflowTaskBoardMaxOffset {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "异常列表分页条件无效"}, nil
	}
	query.Limit, query.Offset = limit, offset
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	scope, res := d.workflowTaskReadVisibilityScope(ctx, admin)
	if res != nil {
		return id, res, nil
	}
	query.Visibility = scope
	board, err := d.workflowUC.ListExceptions(ctx, query)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	items := make([]any, 0, len(board.Items))
	taskSummaries := func(tasks []*biz.WorkflowTask) []any {
		values := make([]any, 0, len(tasks))
		for _, task := range tasks {
			full := workflowTaskToMap(task)
			summary := map[string]any{}
			for _, key := range []string{"id", "task_name", "task_group", "task_status_key", "owner_role_key", "assignee_id", "source_type", "source_no", "discovery"} {
				summary[key] = full[key]
			}
			values = append(values, summary)
		}
		return values
	}
	orderSummaries := func(orders []biz.WorkflowExceptionOrder) []any {
		values := make([]any, 0, len(orders))
		for _, order := range orders {
			values = append(values, map[string]any{"id": order.ID, "number": order.Number})
		}
		return values
	}
	for _, item := range board.Items {
		tasks := taskSummaries(item.Tasks)
		ids := make([]any, 0, len(item.TaskIDs))
		for _, id := range item.TaskIDs {
			ids = append(ids, id)
		}
		orders := orderSummaries(item.Orders)
		items = append(items, map[string]any{"key": item.Key, "number": item.Number, "reason": item.Reason, "state": item.State, "disposition": item.Disposition, "batch_no": item.BatchNo, "occurred_at": item.OccurredAt, "task_ids": ids, "tasks": tasks, "orders": orders})
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"items": items, "tasks": taskSummaries(board.Tasks), "orders": orderSummaries(board.Orders), "view_total": board.ViewTotal, "total": board.Total, "open": board.Open, "closed": board.Closed, "pending_tasks": board.PendingTasks, "affected_orders": board.AffectedOrders, "limit": board.Limit, "offset": board.Offset})}, nil
}
