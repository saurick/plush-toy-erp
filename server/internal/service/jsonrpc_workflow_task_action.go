package service

import (
	"context"
	"fmt"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	pkglogger "server/pkg/logger"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

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

func validateWorkflowTaskCreatePublicTextLengths(pm map[string]any) *v1.JsonrpcResult {
	for _, field := range []struct {
		key   string
		label string
		limit int
	}{
		{key: "task_code", label: "任务编号", limit: biz.WorkflowTaskCodeMaxLength},
		{key: "task_group", label: "任务分类", limit: biz.WorkflowTaskGroupMaxLength},
		{key: "task_name", label: "任务名称", limit: biz.WorkflowTaskNameMaxLength},
		{key: "source_type", label: "来源类型", limit: biz.WorkflowTaskSourceTypeMaxLength},
		{key: "source_no", label: "来源单号", limit: biz.WorkflowTaskSourceNoMaxLength},
		{key: "owner_role_key", label: "责任岗位", limit: biz.WorkflowTaskOwnerRoleKeyMaxLength},
		{key: "owner_pool_key", label: "责任池", limit: biz.WorkflowTaskOwnerPoolKeyMaxLength},
		{key: "required_capability_key", label: "办理能力", limit: biz.WorkflowTaskRequiredCapabilityMaxLength},
	} {
		raw, exists := pm[field.key]
		value, ok := raw.(string)
		if !exists || !ok || utf8.RuneCountInString(strings.TrimSpace(value)) <= field.limit {
			continue
		}
		return &v1.JsonrpcResult{
			Code:    errcode.InvalidParam.Code,
			Message: fmt.Sprintf("%s过长，请缩短到 %d 个字符以内后重试", field.label, field.limit),
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
	case "reassign_task":
		return rejectUnknownWorkflowTaskParams(
			pm,
			method,
			"task_id",
			"expected_version",
			"idempotency_key",
			"assignee_id",
			"reason",
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
	if (contract.StatusKey == "done" || contract.StatusKey == "rejected") &&
		(currentTask.ProcessInstanceID != nil || currentTask.ProcessNodeInstanceID != nil) {
		if d.processRuntimeUC == nil {
			return id, linkedProcessReconciliationPendingResult(), nil
		}
		if err := d.processRuntimeUC.ValidateLinkedWorkflowTaskCompletionIntent(
			ctx,
			currentTask,
			contract.StatusKey,
			payload,
			reason,
			actorID,
		); err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
	}
	ctx = pkglogger.WithTaskID(ctx, int64(taskID))
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
	sourceAccess := d.workflowTaskSourceAccess(ctx, currentTask)
	if sourceAccess.Applicable && !sourceAccess.Allowed {
		return id, &v1.JsonrpcResult{
			Code:    errcode.PermissionDenied.Code,
			Message: sourceAccess.Reason,
		}, nil
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
		case "process_decision":
			if method != "complete_task_action" {
				return invalid()
			}
			decision, ok := value.(map[string]any)
			if !ok || len(decision) == 0 || len(decision) > 2 {
				return invalid()
			}
			reasonValue, ok := decision["reason"].(string)
			reason := strings.TrimSpace(reasonValue)
			if !ok || reason == "" || utf8.RuneCountInString(reason) > 255 {
				return invalid()
			}
			normalizedDecision := map[string]any{"reason": reason}
			for decisionKey := range decision {
				if decisionKey != "reason" && decisionKey != "approved_quantity" {
					return invalid()
				}
			}
			if rawQuantity, exists := decision["approved_quantity"]; exists {
				_, ok := rawQuantity.(string)
				if !ok {
					return invalid()
				}
				quantity, ok := getRequiredJSONRPCNumeric20Scale6(decision, "approved_quantity")
				if !ok || !quantity.IsPositive() {
					return invalid()
				}
				normalizedDecision["approved_quantity"] = quantity.String()
			}
			normalized[key] = normalizedDecision
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
