package service

import (
	"context"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	pkglogger "server/pkg/logger"
	"strings"
)

var workflowTaskCreateProcessRuntimeAnchorKeys = []string{
	"config_revision",
	"process_instance_id",
	"process_node_instance_id",
}

var workflowTaskCreatePublicParamKeys = map[string]struct{}{
	"idempotency_key":         {},
	"task_code":               {},
	"task_group":              {},
	"task_name":               {},
	"source_type":             {},
	"source_id":               {},
	"source_no":               {},
	"business_status_key":     {},
	"task_status_key":         {},
	"owner_role_key":          {},
	"owner_pool_key":          {},
	"required_capability_key": {},
	"assignee_id":             {},
	"priority":                {},
	"due_at":                  {},
	"payload":                 {},
}

func (d *jsonrpcDispatcher) handleWorkflowTask(
	ctx context.Context,
	method, id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "get_task":
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownWorkflowTaskParams(pm, method, "task_id"); res != nil {
			return id, res, nil
		}
		taskID, res := getRequiredWorkflowTaskID(pm)
		if res != nil {
			return id, res, nil
		}
		task, err := d.workflowUC.GetTask(ctx, taskID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		visibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, task, biz.PermissionWorkflowTaskRead)
		if !visibility.Valid || !workflowAdminCanViewTask(admin, task, visibility.RoleKeys) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"task": workflowTaskToMap(task)})}, nil
	case "list_tasks":
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownWorkflowTaskParams(
			pm,
			method,
			"keyword",
			"owner_role_key",
			"task_status_key",
			"task_group",
			"source_type",
			"source_id",
			"due_from",
			"due_to",
			"limit",
			"offset",
		); res != nil {
			return id, res, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		limit := getWorkflowTaskLimit(pm)
		offset := getWorkflowOffset(pm)
		keyword, keywordRes := getOptionalWorkflowTaskBoardString(pm, "keyword", 200)
		if keywordRes != nil {
			return id, keywordRes, nil
		}
		dueFrom, dueFromOK := getWorkflowUnixTimePtr(pm, "due_from")
		if !dueFromOK {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "due_from 必须是 Unix 秒时间戳"}, nil
		}
		dueTo, dueToOK := getWorkflowUnixTimePtr(pm, "due_to")
		if !dueToOK {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "due_to 必须是 Unix 秒时间戳"}, nil
		}
		filter := biz.WorkflowTaskFilter{
			Limit:         limit,
			Offset:        offset,
			Keyword:       keyword,
			OwnerRoleKey:  getString(pm, "owner_role_key"),
			TaskStatusKey: getString(pm, "task_status_key"),
			TaskGroup:     getString(pm, "task_group"),
			SourceType:    getString(pm, "source_type"),
			SourceID:      getInt(pm, "source_id", 0),
			DueFrom:       dueFrom,
			DueTo:         dueTo,
		}
		visibilityScope, visibilityResult := d.workflowTaskReadVisibilityScope(ctx, admin)
		if visibilityResult != nil {
			return id, visibilityResult, nil
		}
		filter.VisibilityScope = visibilityScope
		tasks, total, err := d.workflowUC.ListTasks(ctx, filter)
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
	case "list_role_tasks":
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		request, requestRes := parseWorkflowRoleTaskViewRequest(pm, method)
		if requestRes != nil {
			return id, requestRes, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		reviewRoles, reviewScopeKey, res := d.resolveActiveMobileRoleAccess(ctx, admin, request.RoleKey)
		if res != nil {
			return id, res, nil
		}
		request.ReviewRoleKeys = reviewRoles
		request.ReviewScopeKey = reviewScopeKey
		visibilityScope, visibilityErr := d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)
		if visibilityErr != nil {
			return id, d.mapCustomerConfigError(ctx, visibilityErr), nil
		}
		if !admin.IsSuperAdmin && (!biz.AdminHasRole(admin, request.RoleKey) || !biz.WorkflowTaskVisibilityScopeIncludesRole(visibilityScope, request.RoleKey)) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		var approvalVisibilityScopes []biz.WorkflowApprovalVisibilityScope
		if request.BeforeID == 0 {
			var approvalRes *v1.JsonrpcResult
			approvalVisibilityScopes, approvalRes = d.workflowAvailableApprovalTaskVisibilityScopes(ctx, admin)
			if approvalRes != nil {
				return id, approvalRes, nil
			}
			if request.ViewKey == biz.WorkflowRoleTaskViewApproval && len(approvalVisibilityScopes) == 0 {
				return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
			}
		} else if request.ViewKey == biz.WorkflowRoleTaskViewApproval {
			var approvalRes *v1.JsonrpcResult
			approvalVisibilityScopes, approvalRes = d.workflowApprovalTaskVisibilityScopes(ctx, admin)
			if approvalRes != nil {
				return id, approvalRes, nil
			}
		}
		return id, d.queryWorkflowRoleTaskView(
			ctx,
			request,
			visibilityScope,
			approvalVisibilityScopes,
			request.BeforeID == 0,
		), nil
	case "list_workbench_role_tasks":
		if res := d.requireEffectiveWorkflowWorkbenchRead(ctx); res != nil {
			return id, res, nil
		}
		request, requestRes := parseWorkflowRoleTaskViewRequest(pm, method)
		if requestRes != nil {
			return id, requestRes, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		if res := d.requireEffectiveWorkflowWorkbenchRole(ctx, admin, request.RoleKey); res != nil {
			return id, res, nil
		}
		visibilityScope, visibilityRes := d.workflowTaskReadVisibilityScope(ctx, admin)
		if visibilityRes != nil {
			return id, visibilityRes, nil
		}
		var approvalVisibilityScopes []biz.WorkflowApprovalVisibilityScope
		if request.ViewKey == biz.WorkflowRoleTaskViewApproval {
			var approvalRes *v1.JsonrpcResult
			approvalVisibilityScopes, approvalRes = d.workflowApprovalTaskVisibilityScopes(ctx, admin)
			if approvalRes != nil {
				return id, approvalRes, nil
			}
		}
		return id, d.queryWorkflowRoleTaskView(
			ctx,
			request,
			visibilityScope,
			approvalVisibilityScopes,
			false,
		), nil
	case "get_workbench":
		if res := d.requireEffectiveWorkflowWorkbenchRead(ctx); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownWorkflowTaskParams(pm, method, "queue_key", "limit", "offset"); res != nil {
			return id, res, nil
		}
		query, queryRes := getWorkflowWorkbenchQuery(pm)
		if queryRes != nil {
			return id, queryRes, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		visibilityScope, visibilityErr := d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)
		if visibilityErr != nil {
			return id, d.mapCustomerConfigError(ctx, visibilityErr), nil
		}
		canSupervise, permissionRes := d.AdminHasPermission(ctx, biz.PermissionWorkflowTaskSupervise)
		if permissionRes != nil {
			return id, permissionRes, nil
		}
		approvalVisibilityScopes, approvalRes := d.workflowAvailableApprovalTaskVisibilityScopes(ctx, admin)
		if approvalRes != nil {
			return id, approvalRes, nil
		}
		query.VisibilityScope = visibilityScope
		query.RiskVisibilityScope = expandWorkflowTaskVisibilityForSupervision(visibilityScope, canSupervise)
		query.ApprovalVisibilityScopes = approvalVisibilityScopes
		workbench, err := d.workflowUC.GetWorkflowWorkbench(ctx, query)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(workflowWorkbenchToMap(workbench)),
		}, nil
	case "get_task_board":
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownWorkflowTaskParams(
			pm,
			method,
			"keyword",
			"status",
			"owner_role_key",
			"due",
			"source_type",
			"period", "date_from", "date_to",
			"module_key", "stage_key", "chain_key", "assignee",
			"lane_key",
			"sort",
			"approval_only",
			"todo_only",
			"calendar_month", "calendar_selection", "calendar_offset", "calendar_revision",
			"limit",
			"offset",
		); res != nil {
			return id, res, nil
		}
		query, queryRes := getWorkflowTaskBoardQuery(pm)
		if queryRes != nil {
			return id, queryRes, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		if query.TodoOnly {
			// Personal reminders use responsibility scope, not supervisory or creator visibility.
			visibilityScope, visibilityErr := d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)
			if visibilityErr != nil {
				return id, d.mapCustomerConfigError(ctx, visibilityErr), nil
			}
			query.VisibilityScope = visibilityScope
		} else if query.ApprovalOnly {
			approvalVisibilityScopes, approvalRes := d.workflowApprovalTaskVisibilityScopes(ctx, admin)
			if approvalRes != nil {
				return id, approvalRes, nil
			}
			query.ApprovalVisibilityScopes = approvalVisibilityScopes
		} else {
			visibilityScope, visibilityResult := d.workflowTaskReadVisibilityScope(ctx, admin)
			if visibilityResult != nil {
				return id, visibilityResult, nil
			}
			query.VisibilityScope = visibilityScope
		}
		board, err := d.workflowUC.GetTaskBoard(ctx, query)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(workflowTaskBoardToMap(board)),
		}, nil
	case "list_task_events":
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownWorkflowTaskParams(pm, method, "task_id", "limit"); res != nil {
			return id, res, nil
		}
		taskID := getInt(pm, "task_id", 0)
		limit := getInt(pm, "limit", 50)
		if taskID <= 0 || limit < 1 || limit > biz.WorkflowTaskEventPageMaxLimit {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务轨迹参数不完整"}, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		task, err := d.workflowUC.GetTask(ctx, taskID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		visibilityScope, visibilityResult := d.workflowTaskReadVisibilityScope(ctx, admin)
		if visibilityResult != nil {
			return id, visibilityResult, nil
		}
		if !biz.WorkflowTaskVisibilityScopeIncludesTask(visibilityScope, task) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		events, err := d.workflowUC.ListTaskEvents(ctx, taskID, limit+1)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		truncated := len(events) > limit
		if truncated {
			events = events[:limit]
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"items":     workflowTaskEventsToAny(events),
			"truncated": truncated,
		})}, nil
	case "get_task_process_context":
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownWorkflowTaskParams(pm, method, "task_id"); res != nil {
			return id, res, nil
		}
		taskID := getInt(pm, "task_id", 0)
		if taskID <= 0 {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务流程参数不完整"}, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		task, err := d.workflowUC.GetTask(ctx, taskID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		visibilityScope, visibilityResult := d.workflowTaskReadVisibilityScope(ctx, admin)
		if visibilityResult != nil {
			return id, visibilityResult, nil
		}
		if !biz.WorkflowTaskVisibilityScopeIncludesTask(visibilityScope, task) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		if task.ProcessInstanceID == nil || task.ProcessNodeInstanceID == nil {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前任务未关联正式流程"}, nil
		}
		if d.processRuntimeUC == nil {
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		}
		processContext, err := d.processRuntimeUC.GetProcessTaskContext(ctx, task)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"process_context": workflowProcessTaskContextToMap(processContext)}),
		}, nil
	case "get_task_assignment_options":
		return d.handleWorkflowTaskAssignmentOptions(ctx, id, pm)
	case "create_task":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskCreate); res != nil {
			return id, res, nil
		}
		if res := validateWorkflowTaskWritePublicParams(method, pm); res != nil {
			return id, res, nil
		}
		if res := validateWorkflowTaskCreatePublicTextLengths(pm); res != nil {
			return id, res, nil
		}
		idempotencyKey, ok := pm["idempotency_key"].(string)
		if !ok || strings.TrimSpace(idempotencyKey) == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "idempotency_key 必须是非空文本"}, nil
		}
		if err := biz.ValidatePublicWorkflowTaskNamespace(getString(pm, "task_group"), getString(pm, "task_code")); err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
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
		sourceID, validSourceID := getRequiredJSONRPCPositiveInt(pm, "source_id")
		if !validSourceID {
			return id, invalidParamResult(), nil
		}
		task, err := d.workflowUC.CreateTask(ctx, &biz.WorkflowTaskCreate{
			IdempotencyKey:        idempotencyKey,
			TaskCode:              getString(pm, "task_code"),
			TaskGroup:             getString(pm, "task_group"),
			TaskName:              getString(pm, "task_name"),
			SourceType:            getString(pm, "source_type"),
			SourceID:              sourceID,
			SourceNo:              getWorkflowStringPtr(pm, "source_no"),
			BusinessStatusKey:     getWorkflowStringPtr(pm, "business_status_key"),
			TaskStatusKey:         getString(pm, "task_status_key"),
			OwnerRoleKey:          getString(pm, "owner_role_key"),
			OwnerPoolKey:          getWorkflowStringPtr(pm, "owner_pool_key"),
			RequiredCapabilityKey: getWorkflowStringPtr(pm, "required_capability_key"),
			AssigneeID:            getWorkflowPositiveIntPtr(pm, "assignee_id"),
			Priority:              priority,
			DueAt:                 dueAt,
			Payload:               payload,
		}, actorID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "任务已创建",
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(task)}),
		}, nil
	case "complete_task_action":
		return d.handleWorkflowTaskStatusAction(ctx, id, pm, actorID, workflowTaskActionContract{
			Method:           "complete_task_action",
			StatusKey:        "done",
			AllowedActions:   []string{"complete"},
			SuccessMessage:   "任务动作已完成",
			InvalidActionMsg: "complete_task_action 仅支持完成动作",
		})
	case "block_task_action":
		return d.handleWorkflowTaskStatusAction(ctx, id, pm, actorID, workflowTaskActionContract{
			Method:           "block_task_action",
			StatusKey:        "blocked",
			DefaultBusiness:  "blocked",
			AllowedActions:   []string{"block"},
			SuccessMessage:   "任务阻塞已记录",
			InvalidActionMsg: "block_task_action 仅支持阻塞动作",
			RequireReason:    true,
		})
	case "reject_task_action":
		return d.handleWorkflowTaskStatusAction(ctx, id, pm, actorID, workflowTaskActionContract{
			Method:           "reject_task_action",
			StatusKey:        "rejected",
			AllowedActions:   []string{"reject"},
			SuccessMessage:   "任务退回已记录",
			InvalidActionMsg: "reject_task_action 仅支持退回动作",
			RequireReason:    true,
		})
	case "resume_task_action":
		return d.handleWorkflowTaskStatusAction(ctx, id, pm, actorID, workflowTaskActionContract{
			Method:           "resume_task_action",
			StatusKey:        "ready",
			AllowedActions:   []string{"resume"},
			SuccessMessage:   "任务已解除阻塞，可继续处理",
			InvalidActionMsg: "resume_task_action 仅支持解除阻塞动作",
			RequireReason:    true,
		})
	case "urge_task":
		if res := validateWorkflowTaskWritePublicParams(method, pm); res != nil {
			return id, res, nil
		}
		taskID, taskIDRes := getRequiredWorkflowTaskID(pm)
		if taskIDRes != nil {
			return id, taskIDRes, nil
		}
		expectedVersion, expectedVersionRes := getRequiredWorkflowExpectedVersion(pm)
		if expectedVersionRes != nil {
			return id, expectedVersionRes, nil
		}
		idempotencyKey, idempotencyKeyRes := getRequiredWorkflowIdempotencyKey(pm)
		if idempotencyKeyRes != nil {
			return id, idempotencyKeyRes, nil
		}
		rawAction, actionExists := pm["action"]
		action, actionIsString := rawAction.(string)
		if !actionExists || !actionIsString || action != strings.TrimSpace(action) || !biz.IsValidWorkflowTaskUrgeAction(action) {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "action 必须是明确的催办动作"}, nil
		}
		reason, reasonResult := getRequiredWorkflowString(pm, "reason", "催办原因不能为空")
		if reasonResult != nil {
			return id, reasonResult, nil
		}
		if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskUpdate); res != nil {
			return id, res, nil
		}
		currentTask, err := d.workflowUC.GetTask(ctx, taskID)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		visibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskUpdate)
		if !visibility.Valid {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		visibleOwnerRoleKeys := visibility.RoleKeys
		payload, ok := getWorkflowPayload(pm, "payload")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
		}
		payload, payloadRes := normalizeWorkflowTaskActionPayload(method, payload)
		if payloadRes != nil {
			return id, payloadRes, nil
		}
		actorRoleKey := workflowActorRoleKeyForAdminInScope(admin, currentTask, visibleOwnerRoleKeys)
		urge := &biz.WorkflowTaskUrge{
			ID:              taskID,
			ExpectedVersion: expectedVersion,
			CommandKey:      "urge_task",
			IdempotencyKey:  idempotencyKey,
			Action:          action,
			Reason:          reason,
			Payload:         payload,
		}
		if !workflowAdminCanViewTask(admin, currentTask, visibleOwnerRoleKeys) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		ctx = pkglogger.WithTaskID(ctx, int64(taskID))
		if replayedTask, replayed, replayErr := d.workflowUC.ResolveTaskUrgeMutationReplay(ctx, urge, actorID); replayErr != nil {
			return id, d.mapWorkflowError(ctx, replayErr), nil
		} else if replayed {
			return id, &v1.JsonrpcResult{
				Code:    errcode.OK.Code,
				Message: "任务催办已记录",
				Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(replayedTask)}),
			}, nil
		}
		if biz.IsTerminalWorkflowTaskStatus(currentTask.TaskStatusKey) {
			return id, d.mapWorkflowError(ctx, biz.ErrWorkflowTaskSettled), nil
		}
		if !workflowAdminCanUrgeTask(admin, currentTask, visibleOwnerRoleKeys) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		task, err := d.workflowUC.UrgeTask(ctx, urge, actorID, actorRoleKey)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "任务催办已记录",
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(task)}),
		}, nil
	case "reassign_task":
		return d.handleWorkflowTaskReassignment(ctx, id, pm, actorID)
	case "explain_action_access":
		return d.handleWorkflowTaskActionExplain(ctx, id, pm)
	case "explain_task_assignment":
		return d.handleWorkflowTaskAssignmentExplain(ctx, id, pm)
	default:
		return id, unknownWorkflowResult(method), nil
	}
}
