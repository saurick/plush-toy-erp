package service

import (
	"context"
	"errors"
	"sort"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleWorkflowTaskAssignmentOptions(
	ctx context.Context,
	id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	if res := rejectUnknownWorkflowTaskParams(pm, "get_task_assignment_options", "task_id"); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	taskID, taskIDRes := getRequiredWorkflowTaskID(pm)
	if taskIDRes != nil {
		return id, taskIDRes, nil
	}
	task, err := d.workflowUC.GetTask(ctx, taskID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	admin, adminRes := d.CurrentAdmin(ctx)
	if adminRes != nil {
		return id, adminRes, nil
	}
	readVisibility := d.workflowTaskRoleVisibilityForTask(
		ctx,
		admin,
		task,
		biz.PermissionWorkflowTaskRead,
	)
	if !readVisibility.Valid ||
		!workflowAdminCanViewTask(admin, task, readVisibility.RoleKeys) {
		return id, &v1.JsonrpcResult{
			Code:    errcode.PermissionDenied.Code,
			Message: errcode.PermissionDenied.Message,
		}, nil
	}
	assignAllowed, permissionResult := d.AdminHasPermission(
		ctx,
		biz.PermissionWorkflowTaskAssign,
	)
	if permissionResult != nil {
		return id, permissionResult, nil
	}
	canReassign, reasonCode, reason := workflowTaskReassignmentAccessDecision(
		admin,
		task,
		readVisibility.RoleKeys,
		assignAllowed,
	)
	candidates := []any{}
	if canReassign {
		admins, listErr := d.adminManageUC.List(ctx)
		if listErr != nil {
			return id, d.mapAdminManageError(ctx, listErr), nil
		}
		eligible := make([]*biz.AdminUser, 0, len(admins))
		for _, candidate := range admins {
			if d.workflowTaskAssignmentCandidateEligible(
				ctx,
				candidate,
				task,
			) && !workflowTaskAssignedToAdmin(candidate, task) {
				eligible = append(eligible, candidate)
			}
		}
		sort.Slice(eligible, func(i, j int) bool {
			left := strings.ToLower(strings.TrimSpace(eligible[i].Username))
			right := strings.ToLower(strings.TrimSpace(eligible[j].Username))
			if left == right {
				return eligible[i].ID < eligible[j].ID
			}
			return left < right
		})
		for _, candidate := range eligible {
			candidates = append(candidates, map[string]any{
				"admin_id":   candidate.ID,
				"username":   candidate.Username,
				"role_keys":  toAnySliceString([]string{biz.NormalizeRoleKey(task.OwnerRoleKey)}),
				"role_label": workflowTaskOwnerRoleDisplayName(task.OwnerRoleKey),
			})
		}
	}
	options := map[string]any{
		"task_id":             task.ID,
		"task_version":        task.Version,
		"task_status_key":     task.TaskStatusKey,
		"owner_role_key":      task.OwnerRoleKey,
		"owner_role_label":    workflowTaskOwnerRoleDisplayName(task.OwnerRoleKey),
		"can_reassign":        canReassign,
		"can_return_to_pool":  canReassign && task.AssigneeID != nil,
		"reason_code":         reasonCode,
		"reason":              reason,
		"candidates":          candidates,
		"current_assignee":    nil,
		"assignment_boundary": "only_assignee_changes",
	}
	if task.AssigneeID != nil && d.adminReader != nil {
		currentAssignee, currentErr := d.adminReader.GetAdminByID(ctx, *task.AssigneeID)
		if currentErr == nil && currentAssignee != nil {
			options["current_assignee"] = map[string]any{
				"admin_id": currentAssignee.ID,
				"username": currentAssignee.Username,
			}
		} else if currentErr != nil && !errors.Is(currentErr, biz.ErrAdminNotFound) {
			return id, d.mapAdminManageError(ctx, currentErr), nil
		}
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: errcode.OK.Message,
		Data:    newDataStruct(map[string]any{"assignment": options}),
	}, nil
}

func (d *jsonrpcDispatcher) handleWorkflowTaskReassignment(
	ctx context.Context,
	id string,
	pm map[string]any,
	actorID int,
) (string, *v1.JsonrpcResult, error) {
	if res := rejectUnknownWorkflowTaskParams(
		pm,
		"reassign_task",
		"task_id",
		"expected_version",
		"idempotency_key",
		"assignee_id",
		"reason",
	); res != nil {
		return id, res, nil
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskAssign); res != nil {
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
	reason, reasonRes := getRequiredWorkflowString(pm, "reason", "转交原因不能为空")
	if reasonRes != nil {
		return id, reasonRes, nil
	}
	if len([]rune(reason)) > 255 {
		return id, &v1.JsonrpcResult{
			Code:    errcode.InvalidParam.Code,
			Message: "转交原因不能超过 255 个字",
		}, nil
	}
	rawAssigneeID, assigneeIDExists := pm["assignee_id"]
	if !assigneeIDExists {
		return id, &v1.JsonrpcResult{
			Code:    errcode.InvalidParam.Code,
			Message: "必须明确选择接收人或退回岗位待办池",
		}, nil
	}
	releaseToPool := rawAssigneeID == nil
	var targetAssigneeID *int
	if !releaseToPool {
		value, valueRes := getRequiredWorkflowPositiveInteger(
			pm,
			"assignee_id",
			"接收人信息无效，请重新选择",
		)
		if valueRes != nil {
			return id, valueRes, nil
		}
		targetAssigneeID = &value
	}

	task, err := d.workflowUC.GetTask(ctx, taskID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	admin, adminRes := d.CurrentAdmin(ctx)
	if adminRes != nil {
		return id, adminRes, nil
	}
	readVisibility := d.workflowTaskRoleVisibilityForTask(
		ctx,
		admin,
		task,
		biz.PermissionWorkflowTaskRead,
	)
	if !readVisibility.Valid ||
		!workflowAdminCanViewTask(admin, task, readVisibility.RoleKeys) {
		return id, &v1.JsonrpcResult{
			Code:    errcode.PermissionDenied.Code,
			Message: errcode.PermissionDenied.Message,
		}, nil
	}
	canReassign, _, _ := workflowTaskReassignmentAccessDecision(
		admin,
		task,
		readVisibility.RoleKeys,
		true,
	)
	if !canReassign {
		return id, &v1.JsonrpcResult{
			Code:    errcode.PermissionDenied.Code,
			Message: "当前任务不能转交",
		}, nil
	}
	requiredPermissions := workflowTaskAssignmentRequiredPermissions(task)
	assignment := &biz.WorkflowTaskAssignment{
		ID:                     taskID,
		ExpectedVersion:        expectedVersion,
		CommandKey:             "reassign_task",
		IdempotencyKey:         idempotencyKey,
		TargetAssigneeID:       targetAssigneeID,
		ReleaseToPool:          releaseToPool,
		Reason:                 reason,
		RequiredOwnerRoleKey:   task.OwnerRoleKey,
		RequiredPermissionKeys: requiredPermissions,
	}
	if replayed, replayedOK, replayErr := d.workflowUC.ResolveTaskAssignmentMutationReplay(
		ctx,
		assignment,
		actorID,
	); replayErr != nil {
		return id, d.mapWorkflowError(ctx, replayErr), nil
	} else if replayedOK {
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "任务已转交",
			Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(replayed)}),
		}, nil
	}

	var targetAssignee *biz.AdminUser
	if releaseToPool {
		if task.AssigneeID == nil {
			return id, d.mapWorkflowError(ctx, biz.ErrWorkflowTaskAssignmentNoop), nil
		}
	} else {
		targetAssignee, err = d.adminReader.GetAdminByID(ctx, *targetAssigneeID)
		if err != nil {
			if errors.Is(err, biz.ErrAdminNotFound) {
				return id, d.mapWorkflowError(ctx, biz.ErrWorkflowAssigneeIneligible), nil
			}
			return id, d.mapAdminManageError(ctx, err), nil
		}
		if workflowTaskAssignedToAdmin(targetAssignee, task) ||
			!d.workflowTaskAssignmentCandidateEligible(ctx, targetAssignee, task) {
			return id, d.mapWorkflowError(ctx, biz.ErrWorkflowAssigneeIneligible), nil
		}
	}
	auditEvent, auditErr := biz.BuildWorkflowTaskAssignmentAuditEvent(
		admin,
		task,
		targetAssignee,
		releaseToPool,
		reason,
	)
	if auditErr != nil {
		return id, d.mapWorkflowError(ctx, auditErr), nil
	}
	assignment.AuditEvent = auditEvent
	actorRoleKey := workflowActorRoleKeyForAdminInScope(
		admin,
		task,
		readVisibility.RoleKeys,
	)
	updated, err := d.workflowUC.ReassignTask(
		ctx,
		assignment,
		actorID,
		actorRoleKey,
	)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	return id, &v1.JsonrpcResult{
		Code:    errcode.OK.Code,
		Message: "任务已转交",
		Data:    newDataStruct(map[string]any{"task": workflowTaskToMap(updated)}),
	}, nil
}

func workflowTaskReassignmentAccessDecision(
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	visibleOwnerRoleKeys []string,
	permissionAllowed bool,
) (bool, string, string) {
	if admin == nil || !admin.IsActive() {
		return false, "admin_inactive", "当前账号已停用，不能转交任务。"
	}
	if task == nil {
		return false, "task_missing", "任务不存在。"
	}
	if biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false, "terminal_task", "该任务已结束，不能再转交。"
	}
	if !permissionAllowed {
		return false, "missing_permission", "当前账号没有任务转交权限。"
	}
	if !workflowAdminCanViewTask(admin, task, visibleOwnerRoleKeys) {
		return false, "task_not_visible", "当前账号不能查看该任务。"
	}
	return true, "allowed", "可转给同一负责岗位的合格在职人员，或退回岗位待办池。"
}

func (d *jsonrpcDispatcher) workflowTaskAssignmentCandidateEligible(
	ctx context.Context,
	candidate *biz.AdminUser,
	task *biz.WorkflowTask,
) bool {
	if candidate == nil ||
		!candidate.IsActive() ||
		task == nil ||
		!biz.AdminHasRole(candidate, task.OwnerRoleKey) {
		return false
	}
	for _, permissionKey := range workflowTaskAssignmentRequiredPermissions(task) {
		visibility := d.workflowTaskRoleVisibilityForTask(
			ctx,
			candidate,
			task,
			permissionKey,
		)
		if !visibility.Valid ||
			!workflowOwnerRoleVisible(task.OwnerRoleKey, visibility.RoleKeys) {
			return false
		}
	}
	return true
}

func workflowTaskAssignmentRequiredPermissions(task *biz.WorkflowTask) []string {
	return biz.NormalizePermissionKeys([]string{
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.WorkflowStatusActionPermission("done", task),
	})
}

func workflowTaskOwnerRoleDisplayName(roleKey string) string {
	for _, definition := range biz.BuiltinRoles() {
		if biz.NormalizeRoleKey(definition.Key) == biz.NormalizeRoleKey(roleKey) {
			return definition.Name
		}
	}
	return biz.NormalizeRoleKey(roleKey)
}
