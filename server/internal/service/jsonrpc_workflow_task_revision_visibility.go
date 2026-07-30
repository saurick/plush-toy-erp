package service

import (
	"context"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

type workflowTaskRoleVisibility struct {
	RoleKeys []string
	Valid    bool
}

func (d *jsonrpcDispatcher) requireActiveMobileRoleAccess(
	ctx context.Context,
	admin *biz.AdminUser,
	roleKey string,
) *v1.JsonrpcResult {
	permissionKey := biz.MobileRoleAccessPermission(roleKey)
	if permissionKey == "" || !biz.AdminCanAccessMobileRole(admin, roleKey) {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	if d == nil || d.customerConfigUC == nil {
		return nil
	}
	session, err := d.currentWorkflowEffectiveSession(ctx, admin)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	for _, actionKey := range session.Actions {
		if strings.TrimSpace(actionKey) == permissionKey {
			return nil
		}
	}
	return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
}

func (d *jsonrpcDispatcher) requireEffectiveWorkflowWorkbenchRead(ctx context.Context) *v1.JsonrpcResult {
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return res
	}
	if !biz.PermissionSetHasAll(
		biz.PermissionKeySet(permissions),
		biz.PermissionERPWorkbenchRead,
		biz.PermissionWorkflowTaskRead,
	) {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	return nil
}

func (d *jsonrpcDispatcher) requireEffectiveWorkflowWorkbenchRole(
	ctx context.Context,
	admin *biz.AdminUser,
	roleKey string,
) *v1.JsonrpcResult {
	roleKey = biz.NormalizeRoleKey(roleKey)
	if roleKey == "" || admin == nil || !admin.IsActive() {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	if d == nil || d.customerConfigUC == nil {
		if biz.AdminHasRole(admin, roleKey) {
			return nil
		}
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	session, err := d.currentWorkflowEffectiveSession(ctx, admin)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	for _, effectiveRoleKey := range session.Roles {
		if biz.NormalizeRoleKey(effectiveRoleKey) == roleKey {
			return nil
		}
	}
	return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
}

func (d *jsonrpcDispatcher) currentWorkflowEffectiveSession(
	ctx context.Context,
	admin *biz.AdminUser,
) (*biz.EffectiveSession, error) {
	customerKey, err := runtimeCustomerKey("")
	if err != nil {
		return nil, err
	}
	if runtimeCustomerConfigRequiresActiveRevision() {
		return d.customerConfigUC.GetEffectiveSessionRequiringActiveRevision(ctx, customerKey, admin)
	}
	return d.customerConfigUC.GetEffectiveSession(ctx, customerKey, admin)
}

func (d *jsonrpcDispatcher) workflowTaskQueryVisibilityScope(
	ctx context.Context,
	admin *biz.AdminUser,
	requiredCapabilities ...string,
) (*biz.WorkflowTaskVisibilityScope, error) {
	if admin == nil || admin.Disabled {
		return nil, biz.ErrForbidden
	}
	customerKey, err := runtimeCustomerKey("")
	if err != nil {
		return nil, err
	}
	scope := &biz.WorkflowTaskVisibilityScope{}
	if !admin.IsSuperAdmin {
		adminID := admin.ID
		scope.VisibleAssigneeID = &adminID
	}
	if d == nil || d.customerConfigUC == nil {
		if admin.IsSuperAdmin {
			scope.StandaloneAllowAllOwnerRoles = true
		} else if !runtimeCustomerConfigRequiresActiveRevision() {
			scope.StandaloneVisibleOwnerRoleKeys = biz.AdminRoleKeys(admin)
		}
		return biz.NormalizeWorkflowTaskVisibilityScope(scope), nil
	}

	revisionScopes, err := d.customerConfigUC.WorkflowTaskRevisionRoleScopes(
		ctx,
		customerKey,
		admin,
		requiredCapabilities...,
	)
	if err != nil {
		return nil, err
	}
	scope.RevisionRoleScopes = revisionScopes
	activeFound := false
	for _, revisionScope := range revisionScopes {
		if revisionScope.Status != biz.CustomerConfigStatusActive {
			continue
		}
		activeFound = true
		scope.StandaloneAllowAllOwnerRoles = revisionScope.AllowAllOwnerRoles
		scope.StandaloneVisibleOwnerRoleKeys = append(
			scope.StandaloneVisibleOwnerRoleKeys,
			revisionScope.VisibleOwnerRoleKeys...,
		)
	}
	if !activeFound && !runtimeCustomerConfigRequiresActiveRevision() {
		if admin.IsSuperAdmin {
			scope.StandaloneAllowAllOwnerRoles = true
		} else {
			scope.StandaloneVisibleOwnerRoleKeys = biz.AdminRoleKeys(admin)
		}
	}
	return biz.NormalizeWorkflowTaskVisibilityScope(scope), nil
}

func (d *jsonrpcDispatcher) workflowApprovalTaskVisibilityScopes(
	ctx context.Context,
	admin *biz.AdminUser,
) ([]biz.WorkflowApprovalVisibilityScope, *v1.JsonrpcResult) {
	permissions, res := d.CurrentAdminPermissions(ctx)
	if res != nil {
		return nil, res
	}
	permissionSet := biz.PermissionKeySet(permissions)
	scopes := make([]biz.WorkflowApprovalVisibilityScope, 0, len(biz.WorkflowApprovalCapabilityKeys()))
	for _, capabilityKey := range biz.WorkflowApprovalCapabilityKeys() {
		if !biz.PermissionSetHasAny(permissionSet, capabilityKey) {
			continue
		}
		scope, err := d.workflowTaskQueryVisibilityScope(ctx, admin, capabilityKey)
		if err != nil {
			return nil, d.mapCustomerConfigError(ctx, err)
		}
		scopes = append(scopes, biz.WorkflowApprovalVisibilityScope{
			CapabilityKey:   capabilityKey,
			VisibilityScope: scope,
		})
	}
	scopes = biz.NormalizeWorkflowApprovalVisibilityScopes(scopes)
	if len(scopes) == 0 {
		return nil, &v1.JsonrpcResult{
			Code:    errcode.PermissionDenied.Code,
			Message: errcode.PermissionDenied.Message,
		}
	}
	return scopes, nil
}

func expandWorkflowTaskVisibilityForSupervision(
	scope *biz.WorkflowTaskVisibilityScope,
	canSupervise bool,
) *biz.WorkflowTaskVisibilityScope {
	normalized := biz.NormalizeWorkflowTaskVisibilityScope(scope)
	if normalized == nil || !canSupervise {
		return normalized
	}
	normalized.VisibleAssigneeID = nil
	normalized.StandaloneAllowAllOwnerRoles = true
	normalized.StandaloneVisibleOwnerRoleKeys = nil
	for index := range normalized.RevisionRoleScopes {
		normalized.RevisionRoleScopes[index].AllowAllOwnerRoles = true
		normalized.RevisionRoleScopes[index].VisibleOwnerRoleKeys = nil
	}
	return biz.NormalizeWorkflowTaskVisibilityScope(normalized)
}

func (d *jsonrpcDispatcher) workflowTaskReadVisibilityScope(
	ctx context.Context,
	admin *biz.AdminUser,
) (*biz.WorkflowTaskVisibilityScope, *v1.JsonrpcResult) {
	scope, err := d.workflowTaskQueryVisibilityScope(ctx, admin, biz.PermissionWorkflowTaskRead)
	if err != nil {
		return nil, d.mapCustomerConfigError(ctx, err)
	}
	canSupervise, permissionResult := d.AdminHasPermission(ctx, biz.PermissionWorkflowTaskSupervise)
	if permissionResult != nil {
		return nil, permissionResult
	}
	return expandWorkflowTaskVisibilityForSupervision(scope, canSupervise), nil
}

func (d *jsonrpcDispatcher) workflowTaskRoleVisibilityForTask(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	requiredCapabilities ...string,
) workflowTaskRoleVisibility {
	if admin == nil || admin.Disabled || task == nil {
		return workflowTaskRoleVisibility{}
	}
	revision, hasRuntimeAnchor, completeRuntimeAnchor := workflowTaskRuntimeConfigRevision(task)
	if hasRuntimeAnchor {
		if !completeRuntimeAnchor || d == nil || d.customerConfigUC == nil {
			if d != nil && d.log != nil {
				d.log.WithContext(ctx).Warnf("[workflow] formal process task has invalid runtime revision anchor task_id=%d", task.ID)
			}
			return workflowTaskRoleVisibility{}
		}
		if admin.IsSuperAdmin {
			return workflowTaskRoleVisibility{
				RoleKeys: []string{biz.NormalizeRoleKey(task.OwnerRoleKey)},
				Valid:    true,
			}
		}
		customerKey, err := runtimeCustomerKey("")
		if err != nil {
			return workflowTaskRoleVisibility{}
		}
		var roleKeys []string
		ownerPoolKey := ""
		if task.OwnerPoolKey != nil {
			ownerPoolKey = strings.TrimSpace(*task.OwnerPoolKey)
		}
		if ownerPoolKey != "" {
			roleKeys, err = d.customerConfigUC.WorkflowVisibleOwnerRoleKeysAtRevisionForPool(
				ctx, customerKey, revision, ownerPoolKey, admin, requiredCapabilities...,
			)
		} else {
			roleKeys, err = d.customerConfigUC.WorkflowVisibleOwnerRoleKeysAtRevision(
				ctx, customerKey, revision, admin, requiredCapabilities...,
			)
		}
		if err != nil {
			if d.log != nil {
				d.log.WithContext(ctx).Warnf("[workflow] stored customer config visibility unavailable task_id=%d config_revision=%s err=%v", task.ID, revision, err)
			}
			return workflowTaskRoleVisibility{}
		}
		return workflowTaskRoleVisibility{RoleKeys: roleKeys, Valid: len(roleKeys) > 0}
	}
	return workflowTaskRoleVisibility{
		RoleKeys: d.workflowVisibleOwnerRoleKeys(ctx, admin, requiredCapabilities...),
		Valid:    true,
	}
}

func workflowTaskRuntimeConfigRevision(task *biz.WorkflowTask) (revision string, hasRuntimeAnchor bool, completeRuntimeAnchor bool) {
	if task == nil {
		return "", false, false
	}
	if task.ConfigRevision != nil {
		revision = strings.TrimSpace(*task.ConfigRevision)
	}
	hasRuntimeAnchor = task.ConfigRevision != nil || task.ProcessInstanceID != nil || task.ProcessNodeInstanceID != nil
	completeRuntimeAnchor = revision != "" &&
		task.ProcessInstanceID != nil && *task.ProcessInstanceID > 0 &&
		task.ProcessNodeInstanceID != nil && *task.ProcessNodeInstanceID > 0
	return revision, hasRuntimeAnchor, completeRuntimeAnchor
}

func workflowTaskConfigRevision(task *biz.WorkflowTask) string {
	if task == nil || task.ConfigRevision == nil {
		return ""
	}
	return *task.ConfigRevision
}
