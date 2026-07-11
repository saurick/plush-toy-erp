package service

import (
	"context"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

const workflowBreakGlassMaxDuration = 2 * time.Hour

var workflowTaskActionPayloadSystemKeys = map[string]struct{}{
	"business_status_key": {},
	"command_key":         {},
	"domain_command":      {},
	"domain_command_key":  {},
	"owner_role_key":      {},
	"source_id":           {},
	"source_line_id":      {},
	"source_no":           {},
	"source_type":         {},
	"task_status_key":     {},
}

var workflowTaskCreateProcessRuntimeAnchorKeys = []string{
	"config_revision",
	"process_instance_id",
	"process_node_instance_id",
}

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
		admin, adminRes := d.CurrentAdmin(ctx)
		if adminRes != nil {
			return id, adminRes, nil
		}
		limit := getWorkflowLimit(pm)
		offset := getWorkflowOffset(pm)
		filter := biz.WorkflowTaskFilter{
			Limit:         limit,
			Offset:        offset,
			OwnerRoleKey:  getString(pm, "owner_role_key"),
			TaskStatusKey: getString(pm, "task_status_key"),
			TaskGroup:     getString(pm, "task_group"),
			SourceType:    getString(pm, "source_type"),
			SourceID:      getInt(pm, "source_id", 0),
		}
		if !admin.IsSuperAdmin {
			filter.VisibleOwnerRoleKeys = d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.PermissionWorkflowTaskRead)
			filter.VisibleAssigneeID = &admin.ID
		}
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
	case "create_task":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskCreate); res != nil {
			return id, res, nil
		}
		if res := validateWorkflowTaskCreatePublicParams(pm); res != nil {
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
			BlockedReason:         getWorkflowStringPtr(pm, "blocked_reason"),
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
			AllowedActions:   []string{"complete", "done"},
			SuccessMessage:   "任务动作已完成",
			InvalidActionMsg: "complete_task_action 仅支持完成动作",
		})
	case "block_task_action":
		return d.handleWorkflowTaskStatusAction(ctx, id, pm, actorID, workflowTaskActionContract{
			Method:           "block_task_action",
			StatusKey:        "blocked",
			DefaultBusiness:  "blocked",
			AllowedActions:   []string{"block", "blocked"},
			SuccessMessage:   "任务阻塞已记录",
			InvalidActionMsg: "block_task_action 仅支持阻塞动作",
			RequireReason:    true,
		})
	case "reject_task_action":
		return d.handleWorkflowTaskStatusAction(ctx, id, pm, actorID, workflowTaskActionContract{
			Method:           "reject_task_action",
			StatusKey:        "rejected",
			AllowedActions:   []string{"reject", "rejected"},
			SuccessMessage:   "任务退回已记录",
			InvalidActionMsg: "reject_task_action 仅支持退回动作",
			RequireReason:    true,
		})
	case "urge_task":
		taskID, taskIDRes := getRequiredWorkflowTaskID(pm)
		if taskIDRes != nil {
			return id, taskIDRes, nil
		}
		if _, exists := pm["task_status_key"]; exists {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "urge_task 不接收 task_status_key"}, nil
		}
		if _, exists := pm["business_status_key"]; exists {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "business_status_key 由服务端推导"}, nil
		}
		if _, exists := pm["actor_role_key"]; exists {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "actor_role_key 由服务端推导"}, nil
		}
		if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskUpdate); res != nil {
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
		visibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.PermissionWorkflowTaskUpdate)
		if !workflowAdminCanUrgeTask(admin, currentTask, visibleOwnerRoleKeys) {
			return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
		}
		payload, ok := getWorkflowPayload(pm, "payload")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
		}
		if res := validateWorkflowTaskActionPayload(payload); res != nil {
			return id, res, nil
		}
		actorRoleKey := workflowActorRoleKeyForAdminInScope(admin, currentTask, visibleOwnerRoleKeys)
		task, err := d.workflowUC.UrgeTask(ctx, &biz.WorkflowTaskUrge{
			ID:      taskID,
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
	case "explain_action_access":
		return d.handleWorkflowTaskActionExplain(ctx, id, pm)
	case "explain_task_assignment":
		return d.handleWorkflowTaskAssignmentExplain(ctx, id, pm)
	default:
		return id, unknownWorkflowResult(method), nil
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
	return nil
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
	if _, exists := pm["task_status_key"]; exists {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: contract.Method + " 不接收 task_status_key"}, nil
	}
	if _, exists := pm["business_status_key"]; exists {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "business_status_key 由服务端推导"}, nil
	}
	if _, exists := pm["actor_role_key"]; exists {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "actor_role_key 由服务端推导"}, nil
	}
	taskID, taskIDRes := getRequiredWorkflowTaskID(pm)
	if taskIDRes != nil {
		return id, taskIDRes, nil
	}
	actionKey := strings.TrimSpace(getString(pm, "action_key"))
	if actionKey == "" {
		actionKey = strings.TrimSpace(getString(pm, "action"))
	}
	if actionKey != "" && !workflowActionKeyAllowed(actionKey, contract.AllowedActions) {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: contract.InvalidActionMsg}, nil
	}
	payload, ok := getWorkflowPayload(pm, "payload")
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "payload 必须是对象"}, nil
	}
	if res := validateWorkflowTaskActionPayload(payload); res != nil {
		return id, res, nil
	}
	reason := strings.TrimSpace(getString(pm, "reason"))
	if contract.RequireReason && reason == "" {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "原因不能为空"}, nil
	}
	breakGlass, breakGlassResult := getWorkflowBreakGlassGrant(pm, time.Now())
	if breakGlassResult != nil {
		return id, breakGlassResult, nil
	}
	currentTask, err := d.workflowUC.GetTask(ctx, taskID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	actionPermission := biz.WorkflowStatusActionPermission(contract.StatusKey, currentTask)
	if res := d.RequireAdminPermission(ctx, actionPermission); res != nil {
		return id, res, nil
	}
	admin, adminRes := d.CurrentAdmin(ctx)
	if adminRes != nil {
		return id, adminRes, nil
	}
	visibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, actionPermission)
	terminalReconcile := currentTask.TaskStatusKey == contract.StatusKey &&
		biz.IsTerminalWorkflowTaskStatus(currentTask.TaskStatusKey) &&
		currentTask.ProcessInstanceID != nil && currentTask.ProcessNodeInstanceID != nil
	if terminalReconcile && contract.RequireReason && !workflowTaskTerminalReasonMatches(currentTask, reason) {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务已按其他原因结束，请刷新后查看"}, nil
	}
	canHandle := workflowAdminCanHandleTask(admin, currentTask, contract.StatusKey, visibleOwnerRoleKeys)
	if terminalReconcile {
		canHandle = workflowAdminCanReconcileLinkedTask(admin, currentTask, visibleOwnerRoleKeys)
	}
	useBreakGlass := false
	if breakGlass != nil {
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
		if d.adminManageUC == nil {
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: "break-glass 审计不可用"}, nil
		}
		actorRoleKey = biz.AdminRoleKey
		if err := d.adminManageUC.RecordWorkflowBreakGlassAudit(
			ctx,
			admin,
			currentTask,
			actionKeyForBreakGlass(contract, actionKey),
			contract.StatusKey,
			breakGlass.reason,
			breakGlass.expiresAt,
		); err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
	}
	if terminalReconcile {
		if res := d.settleLinkedProcessNodeAfterTask(ctx, currentTask, actorID); res != nil {
			return id, res, nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: contract.SuccessMessage,
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(currentTask)}),
		}, nil
	}
	task, err := d.workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:                taskID,
		TaskStatusKey:     contract.StatusKey,
		BusinessStatusKey: contract.DefaultBusiness,
		Reason:            reason,
		Payload:           payload,
	}, actorID, actorRoleKey)
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

func validateWorkflowTaskActionPayload(payload map[string]any) *v1.JsonrpcResult {
	for key := range payload {
		if _, blocked := workflowTaskActionPayloadSystemKeys[strings.TrimSpace(key)]; blocked {
			return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务动作参数包含系统字段，请刷新后重试"}
		}
	}
	return nil
}

func getRequiredWorkflowTaskID(pm map[string]any) (int, *v1.JsonrpcResult) {
	if _, exists := pm["id"]; exists {
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "Workflow 任务动作不接收 id，请使用 task_id"}
	}
	taskID := getInt(pm, "task_id", 0)
	if taskID <= 0 {
		return 0, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "task_id 必须大于 0"}
	}
	return taskID, nil
}

func (d *jsonrpcDispatcher) settleLinkedProcessNodeAfterTask(ctx context.Context, task *biz.WorkflowTask, actorID int) *v1.JsonrpcResult {
	if d == nil || d.processRuntimeUC == nil || task == nil {
		return nil
	}
	if task.ProcessInstanceID == nil || task.ProcessNodeInstanceID == nil {
		return nil
	}
	_, err := d.processRuntimeUC.CompleteLinkedWorkflowTask(ctx, &biz.ProcessLinkedWorkflowTaskCompletion{
		WorkflowTaskID: task.ID,
	}, actorID)
	if err == nil {
		return nil
	}
	return d.mapWorkflowError(ctx, err)
}

func workflowAdminCanReconcileLinkedTask(admin *biz.AdminUser, task *biz.WorkflowTask, visibleOwnerRoleKeys []string) bool {
	if admin == nil || admin.Disabled || task == nil ||
		task.ProcessInstanceID == nil || task.ProcessNodeInstanceID == nil ||
		!biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID
	}
	return workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowTaskTerminalReasonMatches(task *biz.WorkflowTask, reason string) bool {
	reason = strings.TrimSpace(reason)
	if task == nil || reason == "" {
		return false
	}
	if task.BlockedReason != nil && strings.TrimSpace(*task.BlockedReason) == reason {
		return true
	}
	if task.Payload == nil {
		return false
	}
	for _, key := range []string{"rejected_reason", "reason"} {
		if value, ok := task.Payload[key].(string); ok && strings.TrimSpace(value) == reason {
			return true
		}
	}
	return false
}

type workflowBreakGlassGrant struct {
	reason    string
	expiresAt time.Time
}

func getWorkflowBreakGlassGrant(pm map[string]any, now time.Time) (*workflowBreakGlassGrant, *v1.JsonrpcResult) {
	if !getBool(pm, "break_glass", false) {
		return nil, nil
	}
	reason := strings.TrimSpace(getString(pm, "break_glass_reason"))
	if reason == "" {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass_reason 不能为空"}
	}
	expiresAt, ok := getWorkflowUnixTimePtr(pm, "break_glass_expires_at")
	if !ok || expiresAt == nil {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass_expires_at 必须是 Unix 秒时间戳"}
	}
	if !expiresAt.After(now) {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break_glass_expires_at 必须晚于当前时间"}
	}
	if expiresAt.Sub(now) > workflowBreakGlassMaxDuration {
		return nil, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "break-glass 有效期不能超过 2 小时"}
	}
	return &workflowBreakGlassGrant{reason: reason, expiresAt: *expiresAt}, nil
}

func workflowAdminCanUseBreakGlass(admin *biz.AdminUser, task *biz.WorkflowTask, nextStatusKey string) bool {
	if admin == nil || admin.Disabled || !admin.IsSuperAdmin || task == nil {
		return false
	}
	if biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	return nextStatusKey != "" && biz.IsValidWorkflowTaskState(nextStatusKey)
}

func actionKeyForBreakGlass(contract workflowTaskActionContract, actionKey string) string {
	actionKey = strings.TrimSpace(actionKey)
	if actionKey != "" {
		return actionKey
	}
	if len(contract.AllowedActions) > 0 {
		return contract.AllowedActions[0]
	}
	return contract.Method
}

func workflowActionKeyAllowed(actionKey string, allowed []string) bool {
	actionKey = strings.TrimSpace(actionKey)
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
	if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
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
	readVisibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.PermissionWorkflowTaskRead)
	if !workflowAdminCanViewTask(admin, currentTask, readVisibleOwnerRoleKeys) {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}

	actionKey := strings.TrimSpace(getString(pm, "action_key"))
	if actionKey == "" {
		actionKey = strings.TrimSpace(getString(pm, "action"))
	}
	if actionKey == "" {
		actions := make([]any, 0, 4)
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
	if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
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
	readVisibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.PermissionWorkflowTaskRead)
	if !workflowAdminCanViewTask(admin, currentTask, readVisibleOwnerRoleKeys) {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}

	assigned := workflowTaskAssignedToAdmin(admin, currentTask)
	ownerMatched := workflowEffectiveOwnerRoleMatched(admin, currentTask, readVisibleOwnerRoleKeys)
	workPoolMatched := workflowWorkPoolEntitlementMatched(admin, currentTask, readVisibleOwnerRoleKeys)
	canHandle := workflowAdminCanHandleTask(admin, currentTask, "done", d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.WorkflowStatusActionPermission("done", currentTask))) ||
		workflowAdminCanHandleTask(admin, currentTask, "blocked", d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.WorkflowStatusActionPermission("blocked", currentTask))) ||
		workflowAdminCanHandleTask(admin, currentTask, "rejected", d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.WorkflowStatusActionPermission("rejected", currentTask)))
	canUrge := workflowAdminCanUrgeTask(admin, currentTask, d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.PermissionWorkflowTaskUpdate))
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
	actionKey = strings.TrimSpace(actionKey)
	switch actionKey {
	case "complete", "done":
		return workflowTaskActionExplainContracts(task)[0], true
	case "block", "blocked":
		return workflowTaskActionExplainContracts(task)[1], true
	case "reject", "rejected":
		return workflowTaskActionExplainContracts(task)[2], true
	case "urge", "urge_task", "urge_role", "urge_assignee", "escalate_to_pmc", "escalate_to_boss":
		return workflowTaskActionExplainContracts(task)[3], true
	default:
		return workflowTaskActionExplainContract{}, false
	}
}

func (d *jsonrpcDispatcher) workflowTaskActionAccessToMap(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	contract workflowTaskActionExplainContract,
) map[string]any {
	visibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, contract.RequiredPermission)
	permissionAllowed, permissionResult := d.AdminHasPermission(ctx, contract.RequiredPermission)
	if permissionResult != nil {
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
		out[contract.ActionKey] = toAnySliceString(d.workflowVisibleOwnerRoleKeys(ctx, admin, contract.RequiredPermission))
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
	explanation, err := d.customerConfigUC.WorkflowCandidateOwnerRoleKeys(ctx, customerKey, ownerPoolKey, capabilityKey)
	if err != nil {
		d.log.WithContext(ctx).Warnf("[workflow] configured candidate explain fallback owner_pool_key=%s capability=%s err=%v", ownerPoolKey, capabilityKey, err)
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
		visibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, contract.RequiredPermission)
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
	if biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	if nextStatusKey == "" || !biz.IsValidWorkflowTaskState(nextStatusKey) {
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
