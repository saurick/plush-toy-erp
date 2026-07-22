package service

import (
	"context"
	"encoding/base64"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

const workflowBreakGlassMaxDuration = 2 * time.Hour
const workflowTaskBoardMaxOffset = 2_147_483_647

var workflowTaskCreateProcessRuntimeAnchorKeys = []string{
	"config_revision",
	"process_instance_id",
	"process_node_instance_id",
}

var workflowTaskCreatePublicParamKeys = map[string]struct{}{
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
		limit := getWorkflowLimit(pm)
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
		if res := rejectUnknownWorkflowTaskParams(pm, method, "view_key", "role_key", "limit", "cursor"); res != nil {
			return id, res, nil
		}
		viewKey := strings.TrimSpace(getString(pm, "view_key"))
		roleKey := biz.NormalizeRoleKey(getString(pm, "role_key"))
		if viewKey == "" || roleKey == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "岗位任务视图参数不完整"}, nil
		}
		limit, limitRes := getWorkflowRoleTaskViewLimit(pm)
		if limitRes != nil {
			return id, limitRes, nil
		}
		cursor := ""
		if rawCursor, exists := pm["cursor"]; exists {
			value, ok := rawCursor.(string)
			if !ok {
				return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "cursor 必须是文本"}, nil
			}
			cursor = value
		}
		beforeID, snapshotAt, cursorRes := decodeWorkflowRoleTaskViewCursor(cursor)
		if cursorRes != nil {
			return id, cursorRes, nil
		}
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		visibilityScope, visibilityErr := d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)
		if visibilityErr != nil {
			return id, d.mapCustomerConfigError(ctx, visibilityErr), nil
		}
		if !admin.IsSuperAdmin && (!biz.AdminHasRole(admin, roleKey) || !biz.WorkflowTaskVisibilityScopeIncludesRole(visibilityScope, roleKey)) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		crossRoleRisk := viewKey == biz.WorkflowRoleTaskViewRisk &&
			(admin.IsSuperAdmin || biz.AdminHasRole(admin, biz.PMCRoleKey) || biz.AdminHasRole(admin, biz.BossRoleKey))
		query := biz.WorkflowRoleTaskViewQuery{
			ViewKey:              viewKey,
			RoleKey:              roleKey,
			Limit:                limit,
			BeforeID:             beforeID,
			CrossRoleRiskAllowed: crossRoleRisk,
			SnapshotAt:           snapshotAt,
			VisibilityScope:      visibilityScope,
		}
		page, err := d.workflowUC.ListRoleTaskView(ctx, query)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		nextCursor := ""
		if page.HasMore && page.NextID > 0 {
			nextCursor = encodeWorkflowRoleTaskViewCursor(page.NextID, page.SnapshotAt)
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"items":       workflowTasksToAny(page.Items),
				"next_cursor": nextCursor,
				"has_more":    page.HasMore,
				"server_time": page.SnapshotAt.Unix(),
			}),
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
			"lane_key",
			"approval_only",
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
		var visibilityScope *biz.WorkflowTaskVisibilityScope
		if query.ApprovalOnly {
			if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskApprove); res != nil {
				return id, res, nil
			}
			var visibilityErr error
			visibilityScope, visibilityErr = d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskApprove)
			if visibilityErr != nil {
				return id, d.mapCustomerConfigError(ctx, visibilityErr), nil
			}
		} else {
			var visibilityResult *v1.JsonrpcResult
			visibilityScope, visibilityResult = d.workflowTaskReadVisibilityScope(ctx, admin)
			if visibilityResult != nil {
				return id, visibilityResult, nil
			}
		}
		query.VisibilityScope = visibilityScope
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
		if taskID <= 0 || limit < 1 || limit > 100 {
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
		events, err := d.workflowUC.ListTaskEvents(ctx, taskID, limit)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"items": workflowTaskEventsToAny(events)})}, nil
	case "create_task":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskCreate); res != nil {
			return id, res, nil
		}
		if res := validateWorkflowTaskWritePublicParams(method, pm); res != nil {
			return id, res, nil
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
		task, err := d.workflowUC.CreateTask(ctx, &biz.WorkflowTaskCreate{
			TaskCode:              getString(pm, "task_code"),
			TaskGroup:             getString(pm, "task_group"),
			TaskName:              getString(pm, "task_name"),
			SourceType:            getString(pm, "source_type"),
			SourceID:              getInt(pm, "source_id", 0),
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
	case "explain_action_access":
		return d.handleWorkflowTaskActionExplain(ctx, id, pm)
	case "explain_task_assignment":
		return d.handleWorkflowTaskAssignmentExplain(ctx, id, pm)
	default:
		return id, unknownWorkflowResult(method), nil
	}
}

func getWorkflowTaskBoardQuery(pm map[string]any) (biz.WorkflowTaskBoardQuery, *v1.JsonrpcResult) {
	keyword, res := getOptionalWorkflowTaskBoardString(pm, "keyword", 200)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	status, res := getOptionalWorkflowTaskBoardString(pm, "status", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	ownerRoleKey, res := getOptionalWorkflowTaskBoardString(pm, "owner_role_key", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	due, res := getOptionalWorkflowTaskBoardString(pm, "due", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	sourceType, res := getOptionalWorkflowTaskBoardString(pm, "source_type", 64)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	laneKey, res := getOptionalWorkflowTaskBoardString(pm, "lane_key", 32)
	if res != nil {
		return biz.WorkflowTaskBoardQuery{}, res
	}
	approvalOnly := false
	if raw, exists := pm["approval_only"]; exists {
		value, ok := raw.(bool)
		if !ok {
			return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "approval_only 必须是布尔值"}
		}
		approvalOnly = value
	}
	limit, ok := getOptionalWorkflowTaskBoardInteger(pm, "limit", 5, 1)
	if !ok {
		return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "limit 必须是正整数"}
	}
	if limit > 50 {
		limit = 50
	}
	offset, ok := getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !ok || offset > workflowTaskBoardMaxOffset {
		return biz.WorkflowTaskBoardQuery{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "offset 必须是非负整数"}
	}
	return biz.WorkflowTaskBoardQuery{
		Keyword:      keyword,
		Status:       status,
		OwnerRoleKey: ownerRoleKey,
		Due:          due,
		SourceType:   sourceType,
		LaneKey:      laneKey,
		ApprovalOnly: approvalOnly,
		Limit:        limit,
		Offset:       offset,
	}, nil
}

func getOptionalWorkflowTaskBoardString(pm map[string]any, key string, maxRunes int) (string, *v1.JsonrpcResult) {
	raw, exists := pm[key]
	if !exists {
		return "", nil
	}
	value, ok := raw.(string)
	if !ok || !utf8.ValidString(value) {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: key + " 必须是字符串"}
	}
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > maxRunes {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: key + " 超出长度限制"}
	}
	return value, nil
}

func getOptionalWorkflowTaskBoardInteger(pm map[string]any, key string, fallback int, minimum int) (int, bool) {
	raw, exists := pm[key]
	if !exists {
		return fallback, true
	}
	const maxJSONSafeInteger = float64(9007199254740991)
	switch value := raw.(type) {
	case float64:
		if value < float64(minimum) || value > maxJSONSafeInteger || math.Trunc(value) != value {
			return 0, false
		}
		return int(value), true
	case int:
		if value < minimum || float64(value) > maxJSONSafeInteger {
			return 0, false
		}
		return value, true
	default:
		return 0, false
	}
}

func workflowTaskBoardToMap(board *biz.WorkflowTaskBoard) map[string]any {
	if board == nil {
		return nil
	}
	lanes := make([]any, 0, len(board.Lanes))
	for _, lane := range board.Lanes {
		lanes = append(lanes, map[string]any{
			"key":    lane.Key,
			"total":  lane.Total,
			"limit":  lane.Limit,
			"offset": lane.Offset,
			"tasks":  workflowTasksToAny(lane.Tasks),
		})
	}
	return map[string]any{
		"snapshot_at": board.SnapshotAt.Unix(),
		"total":       board.Total,
		"counts": map[string]any{
			"actionable": board.Counts.Actionable,
			"exception":  board.Counts.Exception,
			"due":        board.Counts.Due,
			"finished":   board.Counts.Finished,
		},
		"lanes":           lanes,
		"source_types":    toAnySliceString(board.SourceTypes),
		"owner_role_keys": toAnySliceString(board.OwnerRoleKeys),
	}
}

func validateWorkflowTaskCreatePublicParams(pm map[string]any) *v1.JsonrpcResult {
	for _, key := range workflowTaskCreateProcessRuntimeAnchorKeys {
		if _, exists := pm[key]; exists {
			return &v1.JsonrpcResult{
				Code:    errcode.InvalidParam.Code,
				Message: "create_task 不接收 " + key + "；流程运行时锚点由服务端受控生成",
			}
		}
	}
	for key := range pm {
		if _, allowed := workflowTaskCreatePublicParamKeys[key]; !allowed {
			return &v1.JsonrpcResult{
				Code:    errcode.InvalidParam.Code,
				Message: "create_task 不接收参数 " + key,
			}
		}
	}
	return nil
}

func validateWorkflowTaskWritePublicParams(method string, pm map[string]any) *v1.JsonrpcResult {
	switch method {
	case "create_task":
		return validateWorkflowTaskCreatePublicParams(pm)
	case "complete_task_action", "block_task_action", "reject_task_action", "resume_task_action":
		return rejectUnknownWorkflowTaskParams(
			pm,
			method,
			"task_id",
			"expected_version",
			"idempotency_key",
			"action_key",
			"reason",
			"payload",
			"break_glass",
			"break_glass_reason",
			"break_glass_expires_at",
		)
	case "urge_task":
		return rejectUnknownWorkflowTaskParams(
			pm,
			method,
			"task_id",
			"expected_version",
			"idempotency_key",
			"action",
			"reason",
			"payload",
		)
	default:
		return nil
	}
}

type workflowTaskActionContract struct {
	Method           string
	StatusKey        string
	DefaultBusiness  string
	AllowedActions   []string
	SuccessMessage   string
	InvalidActionMsg string
	RequireReason    bool
}

func (d *jsonrpcDispatcher) handleWorkflowTaskStatusAction(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
	contract workflowTaskActionContract,
) (string, *v1.JsonrpcResult, error) {
	if res := validateWorkflowTaskWritePublicParams(contract.Method, pm); res != nil {
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
	rawActionKey, actionKeyExists := pm["action_key"]
	actionKey, actionKeyIsString := rawActionKey.(string)
	if !actionKeyExists || !actionKeyIsString || !workflowActionKeyAllowed(actionKey, contract.AllowedActions) {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: contract.InvalidActionMsg}, nil
	}
	payload, ok := getWorkflowPayload(pm, "payload")
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
	}
	payload, payloadRes := normalizeWorkflowTaskActionPayload(contract.Method, payload)
	if payloadRes != nil {
		return id, payloadRes, nil
	}
	reason := ""
	if rawReason, exists := pm["reason"]; exists {
		value, ok := rawReason.(string)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "原因必须是文本"}, nil
		}
		reason = strings.TrimSpace(value)
	}
	if contract.RequireReason && reason == "" {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "原因不能为空"}, nil
	}
	breakGlass, breakGlassResult := getWorkflowBreakGlassGrant(pm)
	if breakGlassResult != nil {
		return id, breakGlassResult, nil
	}
	currentTask, err := d.workflowUC.GetTask(ctx, taskID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	actionPermission := biz.WorkflowStatusActionPermission(contract.StatusKey, currentTask)
	if res := d.RequireAdminRBACPermission(ctx, actionPermission); res != nil {
		return id, res, nil
	}
	admin, adminRes := d.CurrentAdmin(ctx)
	if adminRes != nil {
		return id, adminRes, nil
	}
	visibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, actionPermission)
	if !visibility.Valid {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	visibleOwnerRoleKeys := visibility.RoleKeys
	statusUpdate := &biz.WorkflowTaskStatusUpdate{
		ID:                taskID,
		ExpectedVersion:   expectedVersion,
		CommandKey:        contract.Method,
		IdempotencyKey:    idempotencyKey,
		TaskStatusKey:     contract.StatusKey,
		BusinessStatusKey: contract.DefaultBusiness,
		Reason:            reason,
		Payload:           payload,
	}
	if breakGlass != nil {
		statusUpdate.BreakGlass = &biz.WorkflowTaskBreakGlassIntent{
			ActionKey: actionKeyForBreakGlass(actionKey),
			Reason:    breakGlass.reason,
			ExpiresAt: breakGlass.expiresAt,
		}
	}
	if !workflowAdminCanViewTask(admin, currentTask, visibleOwnerRoleKeys) {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	if replayedTask, replayed, replayErr := d.workflowUC.ResolveTaskStatusMutationReplay(ctx, statusUpdate, actorID); replayErr != nil {
		return id, d.mapWorkflowError(ctx, replayErr), nil
	} else if replayed {
		if contract.StatusKey == "done" || contract.StatusKey == "rejected" {
			if res := d.settleLinkedProcessNodeAfterTask(ctx, replayedTask, actorID); res != nil {
				return id, res, nil
			}
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: contract.SuccessMessage,
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(replayedTask)}),
		}, nil
	}
	if biz.IsTerminalWorkflowTaskStatus(currentTask.TaskStatusKey) {
		return id, d.mapWorkflowError(ctx, biz.ErrWorkflowTaskSettled), nil
	}
	if !biz.CanTransitionWorkflowTaskStatus(currentTask.TaskStatusKey, contract.StatusKey) {
		return id, d.mapWorkflowError(ctx, biz.ErrBadParam), nil
	}
	canHandle := workflowAdminCanHandleTask(admin, currentTask, contract.StatusKey, visibleOwnerRoleKeys)
	useBreakGlass := false
	if breakGlass != nil {
		if res := validateWorkflowBreakGlassGrantFresh(breakGlass, time.Now()); res != nil {
			return id, res, nil
		}
		if !workflowAdminCanUseBreakGlass(admin, currentTask, contract.StatusKey) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		useBreakGlass = true
	}
	if !canHandle && !useBreakGlass {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	actorRoleKey := workflowActorRoleKeyForAdminInScope(admin, currentTask, visibleOwnerRoleKeys)
	if useBreakGlass {
		actorRoleKey = biz.AdminRoleKey
		auditEvent, err := biz.BuildWorkflowBreakGlassAuditEvent(
			admin,
			currentTask,
			actionKeyForBreakGlass(actionKey),
			contract.StatusKey,
			breakGlass.reason,
			breakGlass.expiresAt,
		)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		statusUpdate.AuditEvent = auditEvent
	}
	task, err := d.workflowUC.UpdateTaskStatus(ctx, statusUpdate, actorID, actorRoleKey)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	if contract.StatusKey == "done" || contract.StatusKey == "rejected" {
		if res := d.settleLinkedProcessNodeAfterTask(ctx, task, actorID); res != nil {
			return id, res, nil
		}
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: contract.SuccessMessage,
		Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(task)}),
	}, nil
}

func normalizeWorkflowTaskActionPayload(method string, payload map[string]any) (map[string]any, *v1.JsonrpcResult) {
	invalid := func() (map[string]any, *v1.JsonrpcResult) {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务动作参数不符合约定，请刷新后重试"}
	}
	normalized := make(map[string]any, len(payload))
	for key, value := range payload {
		switch key {
		case "feedback":
			if method != "complete_task_action" {
				return invalid()
			}
			text, ok := value.(string)
			if !ok {
				return invalid()
			}
			if text = strings.TrimSpace(text); text != "" {
				normalized[key] = text
			}
		case "surface_key", "entry_path":
			text, ok := value.(string)
			if !ok {
				return invalid()
			}
			if text = strings.TrimSpace(text); text != "" {
				normalized[key] = text
			}
		case "evidence_refs":
			rawRefs, ok := value.([]any)
			if !ok {
				return invalid()
			}
			seen := make(map[string]struct{}, len(rawRefs))
			refs := make([]string, 0, len(rawRefs))
			for _, rawRef := range rawRefs {
				ref, ok := rawRef.(string)
				if !ok {
					return invalid()
				}
				ref = strings.TrimSpace(ref)
				if ref == "" {
					continue
				}
				if _, exists := seen[ref]; exists {
					continue
				}
				seen[ref] = struct{}{}
				refs = append(refs, ref)
			}
			if len(refs) > 0 {
				sort.Strings(refs)
				normalized[key] = refs
			}
		default:
			return invalid()
		}
	}
	return normalized, nil
}

func getRequiredWorkflowTaskID(pm map[string]any) (int, *v1.JsonrpcResult) {
	if _, exists := pm["id"]; exists {
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "Workflow 任务动作不接收 id，请使用 task_id"}
	}
	return getRequiredWorkflowPositiveInteger(pm, "task_id", "task_id 必须是大于 0 的安全整数")
}

func getRequiredWorkflowExpectedVersion(pm map[string]any) (int, *v1.JsonrpcResult) {
	return getRequiredWorkflowPositiveInteger(pm, "expected_version", "任务版本信息缺失或已失效，请刷新后重试")
}

func getRequiredWorkflowIdempotencyKey(pm map[string]any) (string, *v1.JsonrpcResult) {
	raw, exists := pm["idempotency_key"]
	key, ok := raw.(string)
	if !exists || !ok {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "页面已更新，请刷新后重新操作"}
	}
	key = strings.TrimSpace(key)
	if key == "" || utf8.RuneCountInString(key) > 128 {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "页面已更新，请刷新后重新操作"}
	}
	return key, nil
}

func getRequiredWorkflowPositiveInteger(pm map[string]any, key, message string) (int, *v1.JsonrpcResult) {
	const maxJSONSafeInteger = float64(9007199254740991)
	raw, exists := pm[key]
	if !exists {
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: message}
	}
	var value int
	switch typed := raw.(type) {
	case float64:
		if typed <= 0 || typed > maxJSONSafeInteger || typed != float64(int64(typed)) {
			return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: message}
		}
		value = int(typed)
	case int:
		if typed <= 0 || float64(typed) > maxJSONSafeInteger {
			return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: message}
		}
		value = typed
	default:
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: message}
	}
	return value, nil
}

func getRequiredWorkflowString(pm map[string]any, key, message string) (string, *v1.JsonrpcResult) {
	raw, exists := pm[key]
	value, ok := raw.(string)
	if !exists || !ok || strings.TrimSpace(value) == "" {
		return "", &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: message}
	}
	return strings.TrimSpace(value), nil
}

func rejectUnknownWorkflowTaskParams(pm map[string]any, method string, allowedKeys ...string) *v1.JsonrpcResult {
	allowed := make(map[string]struct{}, len(allowedKeys))
	for _, key := range allowedKeys {
		allowed[key] = struct{}{}
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: method + " 不接收参数 " + key}
		}
	}
	return nil
}

func getWorkflowRoleTaskViewLimit(pm map[string]any) (int, *v1.JsonrpcResult) {
	raw, exists := pm["limit"]
	if !exists {
		return 50, nil
	}
	value, ok := raw.(float64)
	if !ok || value < 1 || value > 100 || value != math.Trunc(value) {
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "limit 必须是 1 到 100 的整数"}
	}
	return int(value), nil
}

func encodeWorkflowRoleTaskViewCursor(beforeID int, snapshotAt time.Time) string {
	if beforeID <= 0 || snapshotAt.IsZero() {
		return ""
	}
	raw := strconv.Itoa(beforeID) + ":" + strconv.FormatInt(snapshotAt.Unix(), 10)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeWorkflowRoleTaskViewCursor(cursor string) (int, time.Time, *v1.JsonrpcResult) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return 0, time.Now(), nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, time.Time{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "cursor 已失效，请重新加载"}
	}
	beforeRaw, snapshotRaw, ok := strings.Cut(string(raw), ":")
	if !ok {
		return 0, time.Time{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "cursor 已失效，请重新加载"}
	}
	beforeID, beforeErr := strconv.Atoi(beforeRaw)
	snapshotUnix, snapshotErr := strconv.ParseInt(snapshotRaw, 10, 64)
	if beforeErr != nil || snapshotErr != nil || beforeID <= 0 || snapshotUnix <= 0 {
		return 0, time.Time{}, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "cursor 已失效，请重新加载"}
	}
	return beforeID, time.Unix(snapshotUnix, 0), nil
}

func (d *jsonrpcDispatcher) settleLinkedProcessNodeAfterTask(ctx context.Context, task *biz.WorkflowTask, actorID int) *v1.JsonrpcResult {
	if task == nil {
		return nil
	}
	hasProcessInstance := task.ProcessInstanceID != nil
	hasProcessNode := task.ProcessNodeInstanceID != nil
	if !hasProcessInstance && !hasProcessNode {
		return nil
	}
	if !hasProcessInstance || !hasProcessNode {
		if d != nil && d.log != nil {
			d.log.WithContext(ctx).Errorf("[workflow] linked process anchors incomplete task_id=%d actor_id=%d", task.ID, actorID)
		}
		return linkedProcessReconciliationPendingResult()
	}
	if d == nil || d.processRuntimeUC == nil {
		if d != nil && d.log != nil {
			d.log.WithContext(ctx).Errorf("[workflow] linked process runtime unavailable task_id=%d actor_id=%d", task.ID, actorID)
		}
		return linkedProcessReconciliationPendingResult()
	}
	_, err := d.processRuntimeUC.CompleteLinkedWorkflowTask(ctx, &biz.ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: task.ID,
	}, actorID)
	if err == nil {
		return nil
	}
	if d.log != nil {
		d.log.WithContext(ctx).Errorf("[workflow] linked process reconciliation pending task_id=%d actor_id=%d err=%v", task.ID, actorID, err)
	}
	return linkedProcessReconciliationPendingResult()
}

func linkedProcessReconciliationPendingResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.Internal.Code,
		Message: "任务已提交，关联流程暂未完成，请保留本次操作并重试",
	}
}

type workflowBreakGlassGrant struct {
	reason    string
	expiresAt time.Time
}

func getWorkflowBreakGlassGrant(pm map[string]any) (*workflowBreakGlassGrant, *v1.JsonrpcResult) {
	rawBreakGlass, hasBreakGlass := pm["break_glass"]
	_, hasReason := pm["break_glass_reason"]
	_, hasExpiresAt := pm["break_glass_expires_at"]
	if !hasBreakGlass {
		if hasReason || hasExpiresAt {
			return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass 必须显式为 true"}
		}
		return nil, nil
	}
	breakGlass, ok := rawBreakGlass.(bool)
	if !ok {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass 必须是布尔值"}
	}
	if !breakGlass {
		if hasReason || hasExpiresAt {
			return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass 必须显式为 true"}
		}
		return nil, nil
	}
	rawReason, exists := pm["break_glass_reason"]
	reason, ok := rawReason.(string)
	if !exists || !ok || strings.TrimSpace(reason) == "" {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass_reason 不能为空"}
	}
	reason = strings.TrimSpace(reason)
	rawExpiresAt, exists := pm["break_glass_expires_at"]
	expiresAtUnix, ok := rawExpiresAt.(float64)
	const maxJSONSafeInteger = float64(9007199254740991)
	if !exists || !ok || math.IsNaN(expiresAtUnix) || math.IsInf(expiresAtUnix, 0) ||
		expiresAtUnix <= 0 || expiresAtUnix > maxJSONSafeInteger || math.Trunc(expiresAtUnix) != expiresAtUnix {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass_expires_at 必须是大于 0 的 JSON 安全整数 Unix 秒时间戳"}
	}
	return &workflowBreakGlassGrant{reason: reason, expiresAt: time.Unix(int64(expiresAtUnix), 0)}, nil
}

func validateWorkflowBreakGlassGrantFresh(grant *workflowBreakGlassGrant, now time.Time) *v1.JsonrpcResult {
	if grant == nil {
		return nil
	}
	if !grant.expiresAt.After(now) {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass_expires_at 必须晚于当前时间"}
	}
	if grant.expiresAt.Sub(now) > workflowBreakGlassMaxDuration {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break-glass 有效期不能超过 2 小时"}
	}
	return nil
}

func workflowAdminCanUseBreakGlass(admin *biz.AdminUser, task *biz.WorkflowTask, nextStatusKey string) bool {
	if admin == nil || admin.Disabled || !admin.IsSuperAdmin || task == nil {
		return false
	}
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	return biz.CanTransitionWorkflowTaskStatus(task.TaskStatusKey, nextStatusKey)
}

func actionKeyForBreakGlass(actionKey string) string {
	return actionKey
}

func workflowActionKeyAllowed(actionKey string, allowed []string) bool {
	for _, item := range allowed {
		if actionKey == item {
			return true
		}
	}
	return false
}

func workflowActorRoleKeyForAdminInScope(admin *biz.AdminUser, task *biz.WorkflowTask, visibleOwnerRoleKeys []string) string {
	if admin == nil || task == nil {
		return ""
	}
	if workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys) {
		return task.OwnerRoleKey
	}
	if biz.AdminHasRole(admin, biz.PMCRoleKey) {
		return biz.PMCRoleKey
	}
	if biz.AdminHasRole(admin, biz.BossRoleKey) {
		return biz.BossRoleKey
	}
	if admin.IsSuperAdmin {
		return biz.AdminRoleKey
	}
	if workflowTaskAssignedToAdmin(admin, task) {
		for _, roleKey := range biz.AdminRoleKeys(admin) {
			return roleKey
		}
	}
	for _, roleKey := range biz.AdminRoleKeys(admin) {
		if biz.NormalizeRoleKey(roleKey) != biz.NormalizeRoleKey(task.OwnerRoleKey) {
			return roleKey
		}
	}
	return ""
}

func (d *jsonrpcDispatcher) workflowVisibleOwnerRoleKeys(ctx context.Context, admin *biz.AdminUser, requiredCapabilities ...string) []string {
	baseRoleKeys := biz.AdminRoleKeys(admin)
	if admin == nil || admin.Disabled {
		return []string{}
	}
	requireActiveRevision := runtimeCustomerConfigRequiresActiveRevision()
	if d == nil || d.customerConfigUC == nil {
		if requireActiveRevision {
			return []string{}
		}
		return baseRoleKeys
	}
	customerKey, _ := runtimeCustomerKey("")
	var roleKeys []string
	var err error
	if requireActiveRevision {
		roleKeys, err = d.customerConfigUC.WorkflowVisibleOwnerRoleKeysRequiringActiveRevision(ctx, customerKey, admin, requiredCapabilities...)
	} else {
		roleKeys, err = d.customerConfigUC.WorkflowVisibleOwnerRoleKeys(ctx, customerKey, admin, requiredCapabilities...)
	}
	if err != nil {
		if d.log != nil {
			d.log.WithContext(ctx).Warnf("[workflow] customer config visibility unavailable admin_id=%d fixed_customer=%t err=%v", admin.ID, requireActiveRevision, err)
		}
		if requireActiveRevision {
			return []string{}
		}
		return baseRoleKeys
	}
	return roleKeys
}

type workflowTaskActionExplainContract struct {
	ActionKey          string
	StatusKey          string
	RequiredPermission string
	Urge               bool
}

func (d *jsonrpcDispatcher) handleWorkflowTaskActionExplain(
	ctx context.Context,
	id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	if res := rejectUnknownWorkflowTaskParams(pm, "explain_action_access", "task_id", "action_key"); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	taskID, taskIDRes := getRequiredWorkflowTaskID(pm)
	if taskIDRes != nil {
		return id, taskIDRes, nil
	}
	currentTask, err := d.workflowUC.GetTask(ctx, taskID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	admin, adminRes := d.CurrentAdmin(ctx)
	if adminRes != nil {
		return id, adminRes, nil
	}
	readVisibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskRead)
	if !readVisibility.Valid {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	readVisibleOwnerRoleKeys := readVisibility.RoleKeys
	if !workflowAdminCanViewTask(admin, currentTask, readVisibleOwnerRoleKeys) {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}

	rawActionKey, hasActionKey := pm["action_key"]
	if !hasActionKey {
		actions := make([]any, 0, 5)
		for _, contract := range workflowTaskActionExplainContracts(currentTask) {
			actions = append(actions, d.workflowTaskActionAccessToMap(ctx, admin, currentTask, contract))
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"task_id": currentTask.ID,
				"actions": actions,
			}),
		}, nil
	}
	actionKey, ok := rawActionKey.(string)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "action_key 必须是明确的动作"}, nil
	}

	contract, ok := workflowTaskActionExplainContractFor(actionKey, currentTask)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "action_key 不支持"}, nil
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data:    newDataStruct(map[string]any{"action": d.workflowTaskActionAccessToMap(ctx, admin, currentTask, contract)}),
	}, nil
}

func (d *jsonrpcDispatcher) handleWorkflowTaskAssignmentExplain(
	ctx context.Context,
	id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	if res := rejectUnknownWorkflowTaskParams(pm, "explain_task_assignment", "task_id"); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	taskID, taskIDRes := getRequiredWorkflowTaskID(pm)
	if taskIDRes != nil {
		return id, taskIDRes, nil
	}
	currentTask, err := d.workflowUC.GetTask(ctx, taskID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	admin, adminRes := d.CurrentAdmin(ctx)
	if adminRes != nil {
		return id, adminRes, nil
	}
	readVisibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskRead)
	if !readVisibility.Valid {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	readVisibleOwnerRoleKeys := readVisibility.RoleKeys
	if !workflowAdminCanViewTask(admin, currentTask, readVisibleOwnerRoleKeys) {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}

	assigned := workflowTaskAssignedToAdmin(admin, currentTask)
	ownerMatched := workflowEffectiveOwnerRoleMatched(admin, currentTask, readVisibleOwnerRoleKeys)
	workPoolMatched := workflowWorkPoolEntitlementMatched(admin, currentTask, readVisibleOwnerRoleKeys)
	canHandle := workflowAdminCanHandleTask(admin, currentTask, "done", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.WorkflowStatusActionPermission("done", currentTask)).RoleKeys) ||
		workflowAdminCanHandleTask(admin, currentTask, "blocked", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.WorkflowStatusActionPermission("blocked", currentTask)).RoleKeys) ||
		workflowAdminCanHandleTask(admin, currentTask, "rejected", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.WorkflowStatusActionPermission("rejected", currentTask)).RoleKeys) ||
		workflowAdminCanHandleTask(admin, currentTask, "ready", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskUpdate).RoleKeys)
	canUrge := workflowAdminCanUrgeTask(admin, currentTask, d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskUpdate).RoleKeys)
	reasonCode := "not_assigned_or_owner"
	reason := "当前账号不是该任务的指定处理人，也不属于任务责任角色。"
	if biz.IsTerminalWorkflowTaskStatus(currentTask.TaskStatusKey) {
		reasonCode = "terminal_task"
		reason = "该任务已结束，只能查看上下文。"
	} else if assigned {
		reasonCode = "assigned_to_current_admin"
		reason = "当前账号是该任务的指定处理人。"
	} else if ownerMatched {
		reasonCode = "owner_role_matched"
		reason = "当前账号属于该任务责任角色。"
	} else if workPoolMatched {
		reasonCode = "work_pool_role_matched"
		reason = "当前账号属于该任务责任池。"
	} else if canUrge {
		reasonCode = "can_urge_only"
		reason = "当前账号可催办或升级该任务，但不能代替责任角色完成处理。"
	}
	readConfiguredCandidates := d.workflowTaskConfiguredCandidateExplanation(ctx, currentTask, biz.PermissionWorkflowTaskRead)

	assignment := map[string]any{
		"task_id":                                     currentTask.ID,
		"owner_role_key":                              currentTask.OwnerRoleKey,
		"owner_pool_key":                              workflowStringValue(currentTask.OwnerPoolKey),
		"required_capability_key":                     workflowStringValue(currentTask.RequiredCapabilityKey),
		"config_revision":                             workflowStringValue(currentTask.ConfigRevision),
		"configured_candidate_owner_pool_key":         workflowTaskOwnerPoolKey(currentTask),
		"configured_read_candidate_owner_role_keys":   toAnySliceString(readConfiguredCandidates.CandidateOwnerRoleKeys),
		"configured_candidate_config_revision":        workflowConfiguredCandidateConfigRevisionValue(currentTask, readConfiguredCandidates),
		"admin_role_keys":                             toAnySliceString(biz.AdminRoleKeys(admin)),
		"visible_owner_role_keys":                     toAnySliceString(readVisibleOwnerRoleKeys),
		"read_candidate_owner_role_keys":              toAnySliceString(readVisibleOwnerRoleKeys),
		"action_required_permissions":                 workflowTaskActionRequiredPermissionsMap(currentTask),
		"action_candidate_owner_role_keys":            d.workflowTaskActionCandidateOwnerRoleKeysMap(ctx, admin, currentTask),
		"action_configured_candidate_owner_role_keys": d.workflowTaskActionConfiguredCandidateOwnerRoleKeysMap(ctx, currentTask),
		"action_configured_candidate_sources":         d.workflowTaskActionConfiguredCandidateSourcesMap(ctx, currentTask),
		"action_domain_command_entries":               workflowTaskActionDomainCommandEntriesMap(currentTask),
		"action_work_pool_scope_matches":              d.workflowTaskActionWorkPoolScopeMatchesMap(ctx, admin, currentTask),
		"visible":                                     true,
		"assigned_to_current_admin":                   assigned,
		"owner_role_matched":                          ownerMatched,
		"work_pool_role_matched":                      workPoolMatched,
		"work_pool_entitlement_matched":               workPoolMatched,
		"work_pool_entitlement_scope_matched":         workPoolMatched,
		"can_handle":                                  canHandle,
		"can_urge":                                    canUrge,
		"actor_role_key":                              workflowActorRoleKeyForAdminInScope(admin, currentTask, readVisibleOwnerRoleKeys),
		"reason_code":                                 reasonCode,
		"reason":                                      reason,
	}
	if currentTask.AssigneeID != nil {
		assignment["assignee_id"] = *currentTask.AssigneeID
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data:    newDataStruct(map[string]any{"assignment": assignment}),
	}, nil
}

func workflowTaskActionExplainContracts(task *biz.WorkflowTask) []workflowTaskActionExplainContract {
	return []workflowTaskActionExplainContract{
		{
			ActionKey:          "complete",
			StatusKey:          "done",
			RequiredPermission: biz.WorkflowStatusActionPermission("done", task),
		},
		{
			ActionKey:          "block",
			StatusKey:          "blocked",
			RequiredPermission: biz.WorkflowStatusActionPermission("blocked", task),
		},
		{
			ActionKey:          "reject",
			StatusKey:          "rejected",
			RequiredPermission: biz.WorkflowStatusActionPermission("rejected", task),
		},
		{
			ActionKey:          "resume",
			StatusKey:          "ready",
			RequiredPermission: biz.PermissionWorkflowTaskUpdate,
		},
		{
			ActionKey:          "urge",
			RequiredPermission: biz.PermissionWorkflowTaskUpdate,
			Urge:               true,
		},
	}
}

func workflowTaskActionRequiredPermissionsMap(task *biz.WorkflowTask) map[string]any {
	out := map[string]any{}
	for _, contract := range workflowTaskActionExplainContracts(task) {
		out[contract.ActionKey] = contract.RequiredPermission
	}
	return out
}

func workflowTaskActionExplainContractFor(actionKey string, task *biz.WorkflowTask) (workflowTaskActionExplainContract, bool) {
	for _, contract := range workflowTaskActionExplainContracts(task) {
		if contract.ActionKey == actionKey {
			return contract, true
		}
	}
	return workflowTaskActionExplainContract{}, false
}

func (d *jsonrpcDispatcher) workflowTaskActionAccessToMap(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	contract workflowTaskActionExplainContract,
) map[string]any {
	visibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, task, contract.RequiredPermission)
	visibleOwnerRoleKeys := visibility.RoleKeys
	permissionAllowed, permissionResult := d.AdminHasPermission(ctx, contract.RequiredPermission)
	if permissionResult != nil || !visibility.Valid {
		permissionAllowed = false
	}
	allowed, reasonCode, reason := workflowTaskActionAccessDecision(admin, task, contract, visibleOwnerRoleKeys, permissionAllowed)
	ownerMatched := workflowEffectiveOwnerRoleMatched(admin, task, visibleOwnerRoleKeys)
	workPoolMatched := workflowWorkPoolEntitlementMatched(admin, task, visibleOwnerRoleKeys)
	configuredCandidates := d.workflowTaskConfiguredCandidateExplanation(ctx, task, contract.RequiredPermission)
	return map[string]any{
		"task_id":                              task.ID,
		"action_key":                           contract.ActionKey,
		"status_key":                           contract.StatusKey,
		"required_permission":                  contract.RequiredPermission,
		"owner_role_key":                       task.OwnerRoleKey,
		"owner_pool_key":                       workflowStringValue(task.OwnerPoolKey),
		"required_capability_key":              workflowStringValue(task.RequiredCapabilityKey),
		"config_revision":                      workflowStringValue(task.ConfigRevision),
		"admin_role_keys":                      toAnySliceString(biz.AdminRoleKeys(admin)),
		"visible_owner_role_keys":              toAnySliceString(visibleOwnerRoleKeys),
		"candidate_owner_role_keys":            toAnySliceString(visibleOwnerRoleKeys),
		"configured_candidate_owner_pool_key":  workflowTaskOwnerPoolKey(task),
		"configured_required_capability_key":   workflowTaskRequiredCapabilityForExplain(task, contract.RequiredPermission),
		"configured_candidate_config_revision": workflowConfiguredCandidateConfigRevisionValue(task, configuredCandidates),
		"configured_candidate_owner_role_keys": toAnySliceString(configuredCandidates.CandidateOwnerRoleKeys),
		"configured_membership_role_keys":      toAnySliceString(configuredCandidates.MembershipRoleKeys),
		"configured_entitled_role_keys":        toAnySliceString(configuredCandidates.EntitledRoleKeys),
		"configured_candidate_source":          configuredCandidates.Source,
		"domain_command_entry":                 workflowTaskDomainCommandEntryToMap(task, contract),
		"owner_role_matched":                   ownerMatched,
		"work_pool_role_matched":               workPoolMatched,
		"work_pool_entitlement_matched":        workPoolMatched,
		"work_pool_entitlement_scope_matched":  workPoolMatched,
		"allowed":                              allowed,
		"actor_role_key":                       workflowActorRoleKeyForAdminInScope(admin, task, visibleOwnerRoleKeys),
		"reason_code":                          reasonCode,
		"reason":                               reason,
	}
}

func (d *jsonrpcDispatcher) workflowTaskActionCandidateOwnerRoleKeysMap(ctx context.Context, admin *biz.AdminUser, task *biz.WorkflowTask) map[string]any {
	out := map[string]any{}
	for _, contract := range workflowTaskActionExplainContracts(task) {
		out[contract.ActionKey] = toAnySliceString(d.workflowTaskRoleVisibilityForTask(ctx, admin, task, contract.RequiredPermission).RoleKeys)
	}
	return out
}

func (d *jsonrpcDispatcher) workflowTaskActionConfiguredCandidateOwnerRoleKeysMap(ctx context.Context, task *biz.WorkflowTask) map[string]any {
	out := map[string]any{}
	for _, contract := range workflowTaskActionExplainContracts(task) {
		out[contract.ActionKey] = d.workflowTaskConfiguredCandidateOwnerRoleKeys(ctx, task, contract.RequiredPermission)
	}
	return out
}

func (d *jsonrpcDispatcher) workflowTaskActionConfiguredCandidateSourcesMap(ctx context.Context, task *biz.WorkflowTask) map[string]any {
	out := map[string]any{}
	for _, contract := range workflowTaskActionExplainContracts(task) {
		out[contract.ActionKey] = d.workflowTaskConfiguredCandidateSource(ctx, task, contract.RequiredPermission)
	}
	return out
}

func workflowTaskActionDomainCommandEntriesMap(task *biz.WorkflowTask) map[string]any {
	out := map[string]any{}
	for _, contract := range workflowTaskActionExplainContracts(task) {
		out[contract.ActionKey] = workflowTaskDomainCommandEntryToMap(task, contract)
	}
	return out
}

func workflowTaskDomainCommandEntryToMap(task *biz.WorkflowTask, contract workflowTaskActionExplainContract) map[string]any {
	blockedReasons := []string{"domain_command_contract_not_configured"}
	source := "workflow_action_only"
	if contract.ActionKey == "complete" {
		source = "guarded_no_domain_command_contract"
		blockedReasons = append(blockedReasons,
			"domain_usecase_binding_missing",
			"domain_command_idempotency_missing",
			"domain_audit_contract_missing",
		)
	} else if contract.Urge {
		blockedReasons = append(blockedReasons, "urge_action_never_posts_domain_fact")
	} else {
		blockedReasons = append(blockedReasons, "non_complete_action_never_posts_domain_fact")
	}
	if workflowPayloadStringValue(task, "command_key") != "" || workflowPayloadStringValue(task, "domain_command_key") != "" {
		blockedReasons = append(blockedReasons, "workflow_payload_command_key_ignored")
	}
	return map[string]any{
		"enabled":           false,
		"will_write_fact":   false,
		"source":            source,
		"command_key":       nil,
		"blocked_reasons":   toAnySliceString(blockedReasons),
		"required_contract": toAnySliceString(workflowDomainCommandRequiredContract()),
	}
}

func workflowDomainCommandRequiredContract() []string {
	return []string{
		"domain_command_key",
		"domain_usecase_binding",
		"stable_business_ref",
		"idempotency_key",
		"rbac_permission",
		"append_only_audit",
		"duplicate_submit_test",
		"cancel_or_reversal_policy",
	}
}

func workflowPayloadStringValue(task *biz.WorkflowTask, key string) string {
	if task == nil || task.Payload == nil {
		return ""
	}
	value, ok := task.Payload[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(getString(map[string]any{"value": value}, "value"))
	}
}

func (d *jsonrpcDispatcher) workflowTaskConfiguredCandidateOwnerRoleKeys(ctx context.Context, task *biz.WorkflowTask, requiredCapability string) []any {
	return toAnySliceString(d.workflowTaskConfiguredCandidateExplanation(ctx, task, requiredCapability).CandidateOwnerRoleKeys)
}

func (d *jsonrpcDispatcher) workflowTaskConfiguredCandidateSource(ctx context.Context, task *biz.WorkflowTask, requiredCapability string) string {
	return d.workflowTaskConfiguredCandidateExplanation(ctx, task, requiredCapability).Source
}

func workflowConfiguredCandidateConfigRevisionValue(task *biz.WorkflowTask, explanation *biz.WorkflowTaskCandidateExplanation) any {
	if explanation.ConfigRevision != "" {
		return explanation.ConfigRevision
	}
	if task == nil {
		return nil
	}
	return workflowStringValue(task.ConfigRevision)
}

func (d *jsonrpcDispatcher) workflowTaskConfiguredCandidateExplanation(ctx context.Context, task *biz.WorkflowTask, requiredCapability string) *biz.WorkflowTaskCandidateExplanation {
	ownerPoolKey := workflowTaskOwnerPoolKey(task)
	capabilityKey := workflowTaskRequiredCapabilityForExplain(task, requiredCapability)
	out := &biz.WorkflowTaskCandidateExplanation{
		ConfigRevision:         strings.TrimSpace(workflowTaskConfigRevision(task)),
		OwnerPoolKey:           ownerPoolKey,
		RequiredCapabilities:   []string{capabilityKey},
		CandidateOwnerRoleKeys: []string{},
		MembershipRoleKeys:     []string{},
		EntitledRoleKeys:       []string{},
		Source:                 "customer_config_unavailable",
	}
	if ownerPoolKey == "" {
		out.Source = "missing_owner_pool_key"
		return out
	}
	if d.customerConfigUC == nil {
		return out
	}
	customerKey, _ := runtimeCustomerKey("")
	revision, hasRuntimeAnchor, completeRuntimeAnchor := workflowTaskRuntimeConfigRevision(task)
	if hasRuntimeAnchor && !completeRuntimeAnchor {
		out.Source = "missing_config_revision"
		return out
	}
	var explanation *biz.WorkflowTaskCandidateExplanation
	var err error
	if completeRuntimeAnchor {
		explanation, err = d.customerConfigUC.WorkflowCandidateOwnerRoleKeysAtRevision(ctx, customerKey, revision, ownerPoolKey, capabilityKey)
	} else {
		explanation, err = d.customerConfigUC.WorkflowCandidateOwnerRoleKeys(ctx, customerKey, ownerPoolKey, capabilityKey)
	}
	if err != nil {
		if d.log != nil {
			d.log.WithContext(ctx).Warnf("[workflow] configured candidate explain failed owner_pool_key=%s capability=%s config_revision=%s err=%v", ownerPoolKey, capabilityKey, revision, err)
		}
		out.Source = "customer_config_error"
		return out
	}
	return explanation
}

func workflowTaskOwnerPoolKey(task *biz.WorkflowTask) string {
	if task == nil {
		return ""
	}
	if task.OwnerPoolKey != nil {
		if value := strings.TrimSpace(*task.OwnerPoolKey); value != "" {
			return value
		}
	}
	return biz.NormalizeRoleKey(task.OwnerRoleKey)
}

func workflowTaskRequiredCapabilityForExplain(task *biz.WorkflowTask, fallback string) string {
	if value := strings.TrimSpace(fallback); value != "" {
		return value
	}
	if task != nil && task.RequiredCapabilityKey != nil {
		if value := strings.TrimSpace(*task.RequiredCapabilityKey); value != "" {
			return value
		}
	}
	return ""
}

func (d *jsonrpcDispatcher) workflowTaskActionWorkPoolScopeMatchesMap(ctx context.Context, admin *biz.AdminUser, task *biz.WorkflowTask) map[string]any {
	out := map[string]any{}
	for _, contract := range workflowTaskActionExplainContracts(task) {
		visibleOwnerRoleKeys := d.workflowTaskRoleVisibilityForTask(ctx, admin, task, contract.RequiredPermission).RoleKeys
		out[contract.ActionKey] = workflowWorkPoolEntitlementMatched(admin, task, visibleOwnerRoleKeys)
	}
	return out
}

func workflowWorkPoolEntitlementMatched(admin *biz.AdminUser, task *biz.WorkflowTask, visibleOwnerRoleKeys []string) bool {
	if admin == nil || task == nil || biz.AdminHasRole(admin, task.OwnerRoleKey) {
		return false
	}
	return workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowEffectiveOwnerRoleMatched(admin *biz.AdminUser, task *biz.WorkflowTask, visibleOwnerRoleKeys []string) bool {
	return admin != nil && task != nil &&
		biz.AdminHasRole(admin, task.OwnerRoleKey) &&
		workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowTaskActionAccessDecision(
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	contract workflowTaskActionExplainContract,
	visibleOwnerRoleKeys []string,
	permissionAllowed bool,
) (bool, string, string) {
	if admin == nil || admin.Disabled {
		return false, "admin_disabled", "当前账号已停用，不能处理任务。"
	}
	if task == nil {
		return false, "task_missing", "任务不存在。"
	}
	if biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false, "terminal_task", "该任务已结束，只能查看上下文。"
	}
	if !contract.Urge && !biz.CanTransitionWorkflowTaskStatus(task.TaskStatusKey, contract.StatusKey) {
		return false, "transition_not_allowed", "当前任务状态不允许执行该动作。"
	}
	if !permissionAllowed {
		return false, "missing_permission", "当前账号缺少执行该动作所需权限。"
	}
	if contract.Urge {
		if workflowAdminCanUrgeTask(admin, task, visibleOwnerRoleKeys) {
			return true, "allowed", "当前账号可催办该任务。"
		}
		return false, "not_owner_or_assignee", "当前账号不是任务责任角色、指定处理人、PMC、老板或 super admin。"
	}
	if workflowAdminCanHandleTask(admin, task, contract.StatusKey, visibleOwnerRoleKeys) {
		return true, "allowed", "当前账号可执行该任务动作。"
	}
	return false, "not_owner_or_assignee", "当前账号不属于任务责任角色，也不是该任务的指定处理人。"
}

func workflowAdminCanViewTask(admin *biz.AdminUser, task *biz.WorkflowTask, visibleOwnerRoleKeys []string) bool {
	if admin == nil || admin.Disabled || task == nil {
		return false
	}
	if admin.IsSuperAdmin {
		return true
	}
	if workflowTaskAssignedToAdmin(admin, task) {
		return true
	}
	if (biz.AdminHasRole(admin, biz.PMCRoleKey) && workflowOwnerRoleVisible(biz.PMCRoleKey, visibleOwnerRoleKeys)) ||
		(biz.AdminHasRole(admin, biz.BossRoleKey) && workflowOwnerRoleVisible(biz.BossRoleKey, visibleOwnerRoleKeys)) {
		return true
	}
	return workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowAdminCanHandleTask(admin *biz.AdminUser, task *biz.WorkflowTask, nextStatusKey string, visibleOwnerRoleKeys []string) bool {
	if admin == nil || admin.Disabled || task == nil {
		return false
	}
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	if !biz.CanTransitionWorkflowTaskStatus(task.TaskStatusKey, nextStatusKey) {
		return false
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID
	}
	return workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowAdminCanUrgeTask(admin *biz.AdminUser, task *biz.WorkflowTask, visibleOwnerRoleKeys []string) bool {
	if admin == nil || admin.Disabled || task == nil {
		return false
	}
	if biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	if admin.IsSuperAdmin || biz.AdminHasRole(admin, biz.PMCRoleKey) || biz.AdminHasRole(admin, biz.BossRoleKey) {
		return true
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID
	}
	return workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowOwnerRoleVisible(ownerRoleKey string, visibleOwnerRoleKeys []string) bool {
	ownerRoleKey = biz.NormalizeRoleKey(ownerRoleKey)
	if ownerRoleKey == "" {
		return false
	}
	for _, roleKey := range biz.NormalizeAdminRoleKeys(visibleOwnerRoleKeys) {
		if roleKey == ownerRoleKey {
			return true
		}
	}
	return false
}

func workflowTaskAssignedToAdmin(admin *biz.AdminUser, task *biz.WorkflowTask) bool {
	return admin != nil && task != nil && task.AssigneeID != nil && *task.AssigneeID == admin.ID
}
