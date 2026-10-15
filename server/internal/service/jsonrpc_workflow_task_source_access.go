package service

import (
	"context"

	"server/internal/biz"
)

const (
	workflowTaskSourceAccessNotApplicableCode = "source_access_not_applicable"
	workflowTaskSourceAccessAllowedCode       = "source_access_allowed"
	workflowTaskSourceAccessMissingCode       = "source_read_permission_missing"
	workflowTaskSourceAccessUnresolvedCode    = "source_access_contract_unresolved"
	workflowTaskSourceAccessCheckFailedCode   = "source_access_check_failed"
)

type workflowTaskSourceAccessDecision struct {
	Applicable bool
	Resolved   bool
	Allowed    bool
	ReasonCode string
	Reason     string
}

func (d *jsonrpcDispatcher) workflowTaskSourceAccess(
	ctx context.Context,
	task *biz.WorkflowTask,
) workflowTaskSourceAccessDecision {
	admin, adminResult := d.CurrentAdmin(ctx)
	if adminResult != nil {
		return workflowTaskSourceAccessCheckFailed()
	}
	permissions, permissionResult := d.CurrentEffectiveAdminPermissions(ctx)
	if permissionResult != nil {
		return workflowTaskSourceAccessCheckFailed()
	}
	return d.workflowTaskSourceAccessWithPermissions(ctx, admin, task, permissions)
}

func (d *jsonrpcDispatcher) workflowTaskSourceAccessForCandidate(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
) workflowTaskSourceAccessDecision {
	permissions, err := d.workflowTaskEffectivePermissionsForAdmin(ctx, admin)
	if err != nil {
		return workflowTaskSourceAccessCheckFailed()
	}
	return d.workflowTaskSourceAccessWithPermissions(ctx, admin, task, permissions)
}

func (d *jsonrpcDispatcher) workflowTaskSourceAccessWithPermissions(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
	permissions []string,
) workflowTaskSourceAccessDecision {
	contract := biz.ResolveWorkflowTaskSourceAccessContract(task)
	if !contract.Applicable {
		return workflowTaskSourceAccessDecision{
			Resolved:   contract.Resolved,
			Allowed:    true,
			ReasonCode: workflowTaskSourceAccessNotApplicableCode,
			Reason:     "当前任务没有需要核对的相关单据。",
		}
	}
	if !contract.Resolved {
		return workflowTaskSourceAccessDecision{
			Applicable: true,
			ReasonCode: workflowTaskSourceAccessUnresolvedCode,
			Reason:     "当前任务的相关单据访问规则尚未配置，暂不能办理；请联系管理员处理。",
		}
	}
	permissionSet := biz.PermissionKeySet(permissions)
	if !workflowTaskSourceRequiredAllAllowed(permissionSet, contract.RequiredAll) ||
		!workflowTaskSourceRequiredAnyAllowed(permissionSet, contract.RequiredAny) {
		return workflowTaskSourceAccessMissing()
	}
	if workflowTaskHasRuntimeAnchorForSourceAccess(task) {
		if d == nil || d.processRuntimeUC == nil {
			return workflowTaskSourceAccessCheckFailed()
		}
		if _, err := d.processRuntimeUC.GetProcessTaskContext(ctx, task); err != nil {
			return workflowTaskSourceAccessCheckFailed()
		}
	}
	switch contract.Kind {
	case biz.WorkflowTaskSourceAccessKindInventoryOperation:
		if access := d.workflowTaskInventoryOperationSourceAccess(
			ctx,
			admin,
			task,
		); !access.Allowed {
			return access
		}
	}
	return workflowTaskSourceAccessDecision{
		Applicable: true,
		Resolved:   true,
		Allowed:    true,
		ReasonCode: workflowTaskSourceAccessAllowedCode,
		Reason:     "当前账号可以查看该任务的相关单据。",
	}
}

func (d *jsonrpcDispatcher) workflowTaskEffectivePermissionsForAdmin(
	ctx context.Context,
	admin *biz.AdminUser,
) ([]string, error) {
	if admin == nil || !admin.IsActive() {
		return nil, biz.ErrForbidden
	}
	base := biz.NormalizePermissionKeys(admin.Permissions)
	if admin.IsSuperAdmin {
		base = biz.AllPermissionKeys()
	}
	if d == nil || d.customerConfigUC == nil {
		return base, nil
	}
	customerKey, err := runtimeCustomerKey("")
	if err != nil {
		return nil, err
	}
	if runtimeCustomerConfigRequiresActiveRevision() {
		return d.customerConfigUC.GetEffectiveActionEntitlementsRequiringActiveRevision(
			ctx,
			customerKey,
			admin,
		)
	}
	return d.customerConfigUC.GetEffectiveActionEntitlements(ctx, customerKey, admin)
}

func (d *jsonrpcDispatcher) workflowTaskInventoryOperationSourceAccess(
	ctx context.Context,
	admin *biz.AdminUser,
	task *biz.WorkflowTask,
) workflowTaskSourceAccessDecision {
	if d == nil || d.adminManageUC == nil || d.inventoryUC == nil ||
		admin == nil || task == nil || task.SourceID <= 0 {
		return workflowTaskSourceAccessCheckFailed()
	}
	scope, err := d.adminManageUC.EffectiveWarehouseDataScope(ctx, admin)
	if err != nil {
		return workflowTaskSourceAccessCheckFailed()
	}
	item, err := d.inventoryUC.GetInventoryOperation(ctx, task.SourceID)
	if err != nil || item == nil ||
		item.OperationType != biz.InventoryOperationManualAdjustment ||
		validateInventoryOperationScope(item, biz.NormalizeWarehouseDataScope(scope)) != nil {
		return workflowTaskSourceAccessCheckFailed()
	}
	return workflowTaskSourceAccessAllowed()
}

func workflowTaskHasRuntimeAnchorForSourceAccess(task *biz.WorkflowTask) bool {
	return task != nil &&
		(task.ConfigRevision != nil ||
			task.ProcessInstanceID != nil ||
			task.ProcessNodeInstanceID != nil)
}

func workflowTaskSourceRequiredAllAllowed(permissionSet map[string]struct{}, required []string) bool {
	for _, permissionKey := range required {
		if !biz.PermissionSetHasAny(permissionSet, permissionKey) {
			return false
		}
	}
	return true
}

func workflowTaskSourceRequiredAnyAllowed(permissionSet map[string]struct{}, required []string) bool {
	return len(required) == 0 || biz.PermissionSetHasAny(permissionSet, required...)
}

func workflowTaskSourceAccessAllowed() workflowTaskSourceAccessDecision {
	return workflowTaskSourceAccessDecision{
		Applicable: true,
		Resolved:   true,
		Allowed:    true,
		ReasonCode: workflowTaskSourceAccessAllowedCode,
		Reason:     "当前账号可以查看该任务的相关单据。",
	}
}

func workflowTaskSourceAccessMissing() workflowTaskSourceAccessDecision {
	return workflowTaskSourceAccessDecision{
		Applicable: true,
		Resolved:   true,
		ReasonCode: workflowTaskSourceAccessMissingCode,
		Reason:     "当前账号不能查看该任务的相关单据，因此不能办理；可催办责任人或联系管理员调整岗位权限。",
	}
}

func workflowTaskSourceAccessCheckFailed() workflowTaskSourceAccessDecision {
	return workflowTaskSourceAccessDecision{
		Applicable: true,
		Resolved:   true,
		ReasonCode: workflowTaskSourceAccessCheckFailedCode,
		Reason:     "暂时无法核对该任务的相关单据，当前不能办理；请刷新后重试或联系管理员。",
	}
}

func workflowTaskSourceAccessToMap(access workflowTaskSourceAccessDecision) map[string]any {
	return map[string]any{
		"applicable":  access.Applicable,
		"resolved":    access.Resolved,
		"allowed":     access.Allowed,
		"reason_code": access.ReasonCode,
		"reason":      access.Reason,
	}
}
