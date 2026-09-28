package service

import (
	"context"
	"sort"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func followupSourceParams(pm map[string]any) (string, int, bool) {
	sourceType, ok := pm["source_type"].(string)
	rawID, idOK := pm["source_id"].(float64)
	sourceID := getInt(pm, "source_id", 0)
	_, supported := biz.WorkflowFollowupSourceSpecFor(sourceType)
	return sourceType, sourceID, ok && idOK && supported && sourceID > 0 && rawID == float64(sourceID)
}

func (d *jsonrpcDispatcher) requireFollowupSourceAccess(ctx context.Context, sourceType string) *v1.JsonrpcResult {
	spec, ok := biz.WorkflowFollowupSourceSpecFor(sourceType)
	if !ok {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前单据暂不支持新建跟进任务"}
	}
	if res := d.RequireAdminPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return res
	}
	if res := d.RequireAdminAnyPermission(ctx, spec.ReadPermissions...); res != nil {
		return res
	}
	return d.requireCustomerConfigModulesEnabled(ctx, "", spec.ModuleKey, workflowModuleKeyTasks)
}

func (d *jsonrpcDispatcher) workflowFollowupCandidates(ctx context.Context, source *biz.WorkflowFollowupSource) ([]any, map[string][]int, error) {
	if d.adminManageUC == nil {
		return nil, nil, biz.ErrBadParam
	}
	admins, err := d.adminManageUC.List(ctx)
	if err != nil {
		return nil, nil, err
	}
	spec, _ := biz.WorkflowFollowupSourceSpecFor(source.Type)
	members := map[string][]any{}
	ids := map[string][]int{}
	for _, admin := range admins {
		if !biz.AdminHasPermission(admin, biz.PermissionWorkflowTaskRead) ||
			!biz.AdminHasPermission(admin, biz.PermissionWorkflowTaskUpdate) ||
			!biz.AdminHasPermission(admin, biz.PermissionWorkflowTaskComplete) ||
			!biz.AdminHasAnyPermission(admin, spec.ReadPermissions...) {
			continue
		}
		for _, role := range biz.AdminRoleKeys(admin) {
			task := &biz.WorkflowTask{TaskGroup: biz.WorkflowFollowupTaskGroup, SourceType: source.Type, SourceID: source.ID, TaskStatusKey: "ready", OwnerRoleKey: role}
			if !d.workflowTaskAssignmentCandidateEligible(ctx, admin, task) {
				continue
			}
			members[role] = append(members[role], map[string]any{"admin_id": admin.ID, "display_name": biz.AdminDisplayName(admin)})
			ids[role] = append(ids[role], admin.ID)
		}
	}
	keys := make([]string, 0, len(members))
	for key := range members {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	roles := []any{}
	for _, key := range keys {
		sort.Slice(members[key], func(i, j int) bool {
			return members[key][i].(map[string]any)["display_name"].(string) < members[key][j].(map[string]any)["display_name"].(string)
		})
		roles = append(roles, map[string]any{"role_key": key, "label": workflowTaskOwnerRoleDisplayName(key), "assignees": members[key]})
	}
	return roles, ids, nil
}

func (d *jsonrpcDispatcher) handleWorkflowFollowup(ctx context.Context, method, id string, pm map[string]any, actorID int) (string, *v1.JsonrpcResult, error) {
	keys := []string{"source_type", "source_id"}
	if method == "create_followup_task" {
		keys = append(keys, "task_name", "description", "owner_role_key", "assignee_id", "due_at", "priority", "idempotency_key")
	}
	if res := rejectUnknownWorkflowTaskParams(pm, method, keys...); res != nil {
		return id, res, nil
	}
	sourceType, sourceID, ok := followupSourceParams(pm)
	if !ok {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请重新选择有效的业务单据"}, nil
	}
	if res := d.requireFollowupSourceAccess(ctx, sourceType); res != nil {
		return id, res, nil
	}
	source, err := d.workflowUC.GetFollowupSource(ctx, sourceType, sourceID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	spec, _ := biz.WorkflowFollowupSourceSpecFor(sourceType)
	canCreate, permissionRes := d.AdminHasPermission(ctx, biz.PermissionWorkflowTaskCreate)
	if permissionRes != nil {
		return id, permissionRes, nil
	}
	if method == "get_task_create_options" {
		allowed := canCreate && spec.CanCreate(source.Status)
		reason := ""
		roles := []any{}
		if !canCreate {
			reason = "当前账号没有新建跟进任务权限"
		} else if !allowed {
			reason = "当前单据已结束，不能再新建跟进任务；已有任务仍可查看"
		}
		if allowed {
			roles, _, err = d.workflowFollowupCandidates(ctx, source)
			if err != nil {
				return id, d.mapWorkflowError(ctx, err), nil
			}
			if len(roles) == 0 {
				allowed = false
				reason = "暂无可办理当前单据任务的岗位人员，请联系管理员配置"
			}
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"source_type": source.Type, "source_id": source.ID, "source_no": source.No, "source_label": spec.Label,
			"source_status": source.Status, "can_create": allowed, "reason": reason, "roles": roles,
		})}, nil
	}
	if !canCreate {
		return id, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}, nil
	}
	dueAt, dueOK := getWorkflowUnixTimePtr(pm, "due_at")
	priority, priorityOK := getWorkflowPriority(pm)
	assignee := getWorkflowPositiveIntPtr(pm, "assignee_id")
	if raw, exists := pm["priority"]; exists {
		value, valid := raw.(float64)
		priorityOK = priorityOK && valid && value == float64(priority)
	}
	if raw := pm["assignee_id"]; raw != nil {
		value, valid := raw.(float64)
		if !valid || assignee == nil || value != float64(*assignee) {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请选择有效的办理人"}, nil
		}
	}
	if !dueOK || dueAt == nil || !priorityOK || (pm["assignee_id"] != nil && assignee == nil) {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "请检查办理人、截止时间和优先级"}, nil
	}
	input, err := biz.PrepareWorkflowFollowupCreate(biz.WorkflowFollowupCreate{
		SourceType: sourceType, SourceID: sourceID, TaskName: getString(pm, "task_name"), Description: getString(pm, "description"),
		OwnerRoleKey: getString(pm, "owner_role_key"), AssigneeID: assignee, DueAt: *dueAt, Priority: priority, IdempotencyKey: getString(pm, "idempotency_key"),
	}, actorID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	// Resolve a lost response before checking mutable source state or recipient availability.
	if replayed, found, replayErr := d.workflowUC.ResolveFollowupCreate(ctx, input, actorID); replayErr != nil {
		return id, d.mapWorkflowError(ctx, replayErr), nil
	} else if found {
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: "跟进任务已创建", Data: newDataStruct(map[string]any{"task": workflowTaskToMap(replayed)})}, nil
	}
	if !spec.CanCreate(source.Status) {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前单据已结束，不能再新建跟进任务"}, nil
	}
	if !dueAt.After(time.Now()) {
		return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "截止时间须晚于当前时间"}, nil
	}
	_, eligible, err := d.workflowFollowupCandidates(ctx, source)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	ids := eligible[input.OwnerRoleKey]
	valid := len(ids) > 0 && assignee == nil
	for _, candidateID := range ids {
		if assignee != nil && candidateID == *assignee {
			valid = true
		}
	}
	if !valid {
		return id, d.mapWorkflowError(ctx, biz.ErrWorkflowAssigneeIneligible), nil
	}
	task, err := d.workflowUC.CreateTask(ctx, input, actorID)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: "跟进任务已创建", Data: newDataStruct(map[string]any{"task": workflowTaskToMap(task)})}, nil
}
