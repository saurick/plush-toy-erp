package service

import (
	"context"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWorkflowTask(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "list_tasks":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		limit := getWorkflowLimit(pm)
		offset := getWorkflowOffset(pm)
		tasks, total, err := d.workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
			Limit:         limit,
			Offset:        offset,
			OwnerRoleKey:  getString(pm, "owner_role_key"),
			TaskStatusKey: getString(pm, "task_status_key"),
			TaskGroup:     getString(pm, "task_group"),
			SourceType:    getString(pm, "source_type"),
			SourceID:      getInt(pm, "source_id", 0),
		})
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"tasks":  workflowTasksToAny(tasks),
				"total":  total,
				"limit":  limit,
				"offset": offset,
			}),
		}, nil
	case "create_task":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskCreate); res != nil {
			return id, res, nil
		}
		payload, ok := getWorkflowPayload(pm, "payload")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
		}
		priority, ok := getWorkflowPriority(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "priority 超出范围"}, nil
		}
		dueAt, ok := getWorkflowUnixTimePtr(pm, "due_at")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "due_at 必须是 Unix 秒时间戳"}, nil
		}
		task, err := d.workflowUC.CreateTask(ctx, &biz.WorkflowTaskCreate{
			TaskCode:          getString(pm, "task_code"),
			TaskGroup:         getString(pm, "task_group"),
			TaskName:          getString(pm, "task_name"),
			SourceType:        getString(pm, "source_type"),
			SourceID:          getInt(pm, "source_id", 0),
			SourceNo:          getWorkflowStringPtr(pm, "source_no"),
			BusinessStatusKey: getWorkflowStringPtr(pm, "business_status_key"),
			TaskStatusKey:     getString(pm, "task_status_key"),
			OwnerRoleKey:      getString(pm, "owner_role_key"),
			AssigneeID:        getWorkflowPositiveIntPtr(pm, "assignee_id"),
			Priority:          priority,
			BlockedReason:     getWorkflowStringPtr(pm, "blocked_reason"),
			DueAt:             dueAt,
			Payload:           payload,
		}, actorID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "任务已创建",
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(task)}),
		}, nil
	case "update_task_status":
		payload, ok := getWorkflowPayload(pm, "payload")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
		}
		taskID := getInt(pm, "id", 0)
		currentTask, err := d.workflowUC.GetTask(ctx, taskID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		actionPermission := biz.WorkflowStatusActionPermission(getString(pm, "task_status_key"), currentTask)
		if res := d.RequireAdminPermission(ctx, actionPermission); res != nil {
			return id, res, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		if !biz.CanAdminHandleWorkflowTask(admin, currentTask, getString(pm, "task_status_key")) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		actorRoleKey := strings.TrimSpace(getString(pm, "actor_role_key"))
		if actorRoleKey == "" {
			actorRoleKey = currentTask.OwnerRoleKey
		}
		task, err := d.workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
			ID:                taskID,
			TaskStatusKey:     getString(pm, "task_status_key"),
			BusinessStatusKey: getString(pm, "business_status_key"),
			Reason:            getString(pm, "reason"),
			Payload:           payload,
		}, actorID, actorRoleKey)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "任务状态已更新",
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(task)}),
		}, nil
	case "urge_task":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskUpdate); res != nil {
			return id, res, nil
		}
		currentTask, err := d.workflowUC.GetTask(ctx, getInt(pm, "task_id", 0))
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		if !biz.CanAdminUrgeWorkflowTask(admin, currentTask) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		payload, ok := getWorkflowPayload(pm, "payload")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
		}
		actorRoleKey := strings.TrimSpace(getString(pm, "actor_role_key"))
		if actorRoleKey == "" {
			actorRoleKey = "admin"
		}
		task, err := d.workflowUC.UrgeTask(ctx, &biz.WorkflowTaskUrge{
			ID:      getInt(pm, "task_id", 0),
			Action:  getString(pm, "action"),
			Reason:  getString(pm, "reason"),
			Payload: payload,
		}, actorID, actorRoleKey)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "任务催办已记录",
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(task)}),
		}, nil
	default:
		return id, unknownWorkflowResult(method), nil
	}
}
