package service

import (
	"context"
	"math"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
	"strings"
	"time"
)

const workflowBreakGlassMaxDuration = 2 * time.Hour

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
	ownerPoolKey := workflowTaskOwnerPoolKey(task)
	if workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys) &&
		(biz.AdminHasRole(admin, task.OwnerRoleKey) ||
			!biz.IsApprovalSettingsPoolKey(ownerPoolKey)) {
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
		if workflowOwnerRoleVisible(roleKey, visibleOwnerRoleKeys) {
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
	sourceAccess := d.workflowTaskSourceAccess(ctx, currentTask)

	rawActionKey, hasActionKey := pm["action_key"]
	if !hasActionKey {
		actions := make([]any, 0, 5)
		for _, contract := range workflowTaskActionExplainContracts(currentTask) {
			actions = append(actions, d.workflowTaskActionAccessToMapWithSource(ctx, admin, currentTask, contract, sourceAccess))
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"task_id":       currentTask.ID,
				"source_access": workflowTaskSourceAccessToMap(sourceAccess),
				"actions":       actions,
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
		Data: newDataStruct(map[string]any{
			"source_access": workflowTaskSourceAccessToMap(sourceAccess),
			"action":        d.workflowTaskActionAccessToMapWithSource(ctx, admin, currentTask, contract, sourceAccess),
		}),
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
	sourceAccess := d.workflowTaskSourceAccess(ctx, currentTask)
	canHandle := sourceAccess.Allowed &&
		(workflowAdminCanHandleTask(admin, currentTask, "done", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.WorkflowStatusActionPermission("done", currentTask)).RoleKeys) ||
			workflowAdminCanHandleTask(admin, currentTask, "blocked", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.WorkflowStatusActionPermission("blocked", currentTask)).RoleKeys) ||
			workflowAdminCanHandleTask(admin, currentTask, "rejected", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.WorkflowStatusActionPermission("rejected", currentTask)).RoleKeys) ||
			workflowAdminCanHandleTask(admin, currentTask, "ready", d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskUpdate).RoleKeys))
	canUrge := workflowAdminCanUrgeTask(admin, currentTask, d.workflowTaskRoleVisibilityForTask(ctx, admin, currentTask, biz.PermissionWorkflowTaskUpdate).RoleKeys)
	reasonCode := "not_assigned_or_owner"
	reason := "当前账号不是该任务的指定处理人，也不属于任务责任角色。"
	if biz.IsTerminalWorkflowTaskStatus(currentTask.TaskStatusKey) {
		reasonCode = "terminal_task"
		reason = "该任务已结束，只能查看上下文。"
	} else if sourceAccess.Applicable && !sourceAccess.Allowed {
		reasonCode = sourceAccess.ReasonCode
		reason = sourceAccess.Reason
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
		"source_access":                               workflowTaskSourceAccessToMap(sourceAccess),
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
	return d.workflowTaskActionAccessToMapWithSource(
		ctx,
		admin,
		task,
		contract,
		d.workflowTaskSourceAccess(ctx, task),
	)
}

func (d *jsonrpcDispatcher) workflowTaskActionAccessToMapWithSource(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	contract workflowTaskActionExplainContract,
	sourceAccess workflowTaskSourceAccessDecision,
) map[string]any {
	visibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, task, contract.RequiredPermission)
	visibleOwnerRoleKeys := visibility.RoleKeys
	permissionAllowed, permissionResult := d.AdminHasPermission(ctx, contract.RequiredPermission)
	if permissionResult != nil || !visibility.Valid {
		permissionAllowed = false
	}
	allowed, reasonCode, reason := workflowTaskActionAccessDecision(
		admin,
		task,
		contract,
		visibleOwnerRoleKeys,
		permissionAllowed,
		sourceAccess,
	)
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
	sourceAccess workflowTaskSourceAccessDecision,
) (bool, string, string) {
	if admin == nil || admin.Disabled {
		return false, "admin_disabled", "当前账号已停用，不能处理任务。"
	}
	if task == nil {
		return false, "task_missing", "任务不存在。"
	}
	if !contract.Urge && biz.IsEngineeringMaterialTaskGroup(task.TaskGroup) {
		return false, "source_form_required", "请打开材料汇总表，在表内提交或审批用料。"
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
	if !contract.Urge && sourceAccess.Applicable && !sourceAccess.Allowed {
		return false, sourceAccess.ReasonCode, sourceAccess.Reason
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
	if biz.IsWorkflowFollowupCreator(task, admin.ID) {
		return true
	}
	if admin.IsSuperAdmin {
		return true
	}
	if workflowTaskAssignedToAdmin(admin, task) &&
		workflowAssignedRuntimeTaskScopeMatched(task, visibleOwnerRoleKeys) {
		return true
	}
	if workflowReleasedAssigneeFallbackMatched(admin, task, visibleOwnerRoleKeys) {
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
		return *task.AssigneeID == admin.ID &&
			workflowAssignedRuntimeTaskScopeMatched(task, visibleOwnerRoleKeys)
	}
	if workflowReleasedAssigneeFallbackMatched(admin, task, visibleOwnerRoleKeys) {
		return true
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
	if biz.IsWorkflowFollowupCreator(task, admin.ID) {
		return true
	}
	if admin.IsSuperAdmin || biz.AdminHasRole(admin, biz.PMCRoleKey) || biz.AdminHasRole(admin, biz.BossRoleKey) {
		return true
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID &&
			workflowAssignedRuntimeTaskScopeMatched(task, visibleOwnerRoleKeys)
	}
	if workflowReleasedAssigneeFallbackMatched(admin, task, visibleOwnerRoleKeys) {
		return true
	}
	return workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowAssignedRuntimeTaskScopeMatched(
	task *biz.WorkflowTask,
	visibleOwnerRoleKeys []string,
) bool {
	_, hasRuntimeAnchor, completeRuntimeAnchor := workflowTaskRuntimeConfigRevision(task)
	if !hasRuntimeAnchor {
		return true
	}
	return completeRuntimeAnchor &&
		workflowOwnerRoleVisible(task.OwnerRoleKey, visibleOwnerRoleKeys)
}

func workflowReleasedAssigneeFallbackMatched(
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	visibleOwnerRoleKeys []string,
) bool {
	if admin == nil || task == nil || task.AssigneeID != nil ||
		task.Payload["assignee_released_to_pool"] != true {
		return false
	}
	_, _, completeRuntimeAnchor := workflowTaskRuntimeConfigRevision(task)
	if !completeRuntimeAnchor {
		return false
	}
	for _, roleKey := range biz.AdminRoleKeys(admin) {
		if workflowOwnerRoleVisible(roleKey, visibleOwnerRoleKeys) {
			return true
		}
	}
	return false
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
