package biz

import (
	"context"
	"errors"
	"sort"
	"strings"
)

// GetEffectiveActionEntitlements returns the active customer revision's
// business-action ceiling for an administrator. Module state is intentionally
// evaluated by the domain API's module gate so callers can distinguish
// read-only/disabled modules from missing role capability.
func (uc *CustomerConfigUsecase) GetEffectiveActionEntitlements(ctx context.Context, customerKey string, admin *AdminUser) ([]string, error) {
	return uc.getEffectiveActionEntitlements(ctx, customerKey, admin, true)
}

// GetEffectiveActionEntitlementsRequiringActiveRevision prevents a deployment
// pinned to a real customer key from widening business actions to builtin RBAC
// when that customer's active revision is missing.
func (uc *CustomerConfigUsecase) GetEffectiveActionEntitlementsRequiringActiveRevision(ctx context.Context, customerKey string, admin *AdminUser) ([]string, error) {
	return uc.getEffectiveActionEntitlements(ctx, customerKey, admin, false)
}

func (uc *CustomerConfigUsecase) getEffectiveActionEntitlements(ctx context.Context, customerKey string, admin *AdminUser, allowBuiltinFallback bool) ([]string, error) {
	if uc == nil || uc.repo == nil || admin == nil || admin.Disabled {
		return nil, ErrForbidden
	}
	baseActions := PermissionKeySet(effectiveActionKeys(admin))
	if admin.IsSuperAdmin && allowBuiltinFallback {
		return sortedPermissionKeys(baseActions), nil
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil {
		if errors.Is(err, ErrCustomerConfigNotFound) {
			if allowBuiltinFallback {
				return sortedPermissionKeys(baseActions), nil
			}
			// Keep system/customer-config repair permissions in the service RBAC
			// layer, but expose no customer-scoped business action entitlement.
			return []string{}, nil
		}
		return nil, err
	}
	if admin.IsSuperAdmin {
		return sortedPermissionKeys(baseActions), nil
	}
	roleProfiles, err := uc.repo.ListRoleProfiles(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	roleKeys := enabledCustomerRoleKeys(AdminRoleKeys(admin), roleProfiles)
	entitlements, err := uc.repo.ListAccessEntitlements(ctx, customerKey, active.Revision, roleKeys)
	if err != nil {
		return nil, err
	}
	return sortedPermissionKeys(customerConfigRoleActionSet(baseActions, roleKeys, roleProfiles, entitlements, customerKey, nil)), nil
}

// EnsureProcessDomainCommandAllowedAtRevision authorizes a running process
// against the immutable customer revision captured when that process started.
// Backend RBAC remains the upper bound; customer entitlements and module state
// can only narrow it at the same formally activated revision.
func (uc *CustomerConfigUsecase) EnsureProcessDomainCommandAllowedAtRevision(
	ctx context.Context,
	customerKey string,
	revision string,
	admin *AdminUser,
	commandKey string,
) error {
	if uc == nil || uc.repo == nil || admin == nil || !admin.IsActive() {
		return ErrForbidden
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	revision = strings.TrimSpace(revision)
	commandKey = strings.TrimSpace(commandKey)
	permissionKey := processDomainCommandRequiredPermission(commandKey)
	if revision == "" || permissionKey == "" {
		return ErrBadParam
	}
	if !AdminHasPermission(admin, permissionKey) {
		return ErrNoPermission
	}
	stored, err := uc.repo.GetCustomerConfigRevision(ctx, customerKey, revision)
	if err != nil {
		return err
	}
	if stored == nil || stored.CustomerKey != customerKey || stored.Revision != revision ||
		stored.ActivatedAt == nil || !customerConfigRevisionCanAuthorizeRuntimeTask(stored.Status) {
		return ErrCustomerConfigNotFound
	}
	modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, revision)
	if err != nil {
		return err
	}
	requiredModules := processDomainCommandReferencedModuleKeys(commandKey)
	if len(requiredModules) == 0 {
		return ErrBadParam
	}
	if err := ensureCustomerConfigModuleKeysEnabled(requiredModules, modules); err != nil {
		return err
	}
	if admin.IsSuperAdmin {
		return nil
	}
	roleProfiles, err := uc.repo.ListRoleProfiles(ctx, customerKey, revision)
	if err != nil {
		return err
	}
	roleKeys := enabledCustomerRoleKeys(AdminRoleKeys(admin), roleProfiles)
	entitlements, err := uc.repo.ListAccessEntitlements(ctx, customerKey, revision, roleKeys)
	if err != nil {
		return err
	}
	actions := customerConfigRoleActionSet(
		PermissionKeySet(effectiveActionKeys(admin)),
		roleKeys,
		roleProfiles,
		entitlements,
		customerKey,
		nil,
	)
	if !PermissionSetHasAny(actions, permissionKey) {
		return ErrNoPermission
	}
	return nil
}

func processDomainCommandRequiredPermission(commandKey string) string {
	switch strings.TrimSpace(commandKey) {
	case ProcessDomainCommandSalesOrderSubmit:
		return PermissionSalesOrderSubmit
	case ProcessDomainCommandPurchaseReceiptCreate:
		return PermissionPurchaseReceiptCreate
	case ProcessDomainCommandIncomingQualityGate, ProcessDomainCommandFinishedGoodsQualityDecide:
		return PermissionQualityInspectionUpdate
	case ProcessDomainCommandInventoryPostInbound:
		return PermissionWarehouseInboundConfirm
	case ProcessDomainCommandShipmentFinanceRelease, ProcessDomainCommandFinanceReceivableLead:
		return PermissionFinanceReceivableConfirm
	case ProcessDomainCommandShipmentShip:
		return PermissionShipmentShip
	default:
		return ""
	}
}

func customerConfigRoleActionSet(
	baseActions map[string]struct{},
	roleKeys []string,
	roleProfiles []RoleProfileInput,
	entitlements []AccessEntitlementInput,
	customerKey string,
	allowed func(string) bool,
) map[string]struct{} {
	actionSet := map[string]struct{}{}
	entitlementsByRole := map[string][]AccessEntitlementInput{}
	for _, item := range entitlements {
		if roleKey := NormalizeRoleKey(item.RoleKey); roleKey != "" {
			entitlementsByRole[roleKey] = append(entitlementsByRole[roleKey], item)
		}
	}
	profileByRole := customerRoleProfileMap(roleProfiles)
	for _, roleKey := range roleKeys {
		roleActionSet := map[string]struct{}{}
		for _, item := range entitlementsByRole[roleKey] {
			if _, allowedByRBAC := baseActions[item.CapabilityKey]; item.Enabled && allowedByRBAC && workflowEntitlementScopeMatchesCustomer(item, customerKey) && (allowed == nil || allowed(item.CapabilityKey)) {
				roleActionSet[item.CapabilityKey] = struct{}{}
			}
		}
		profile := profileByRole[roleKey]
		for _, capabilityKey := range profile.Revokes {
			delete(roleActionSet, capabilityKey)
		}
		for capabilityKey := range roleActionSet {
			actionSet[capabilityKey] = struct{}{}
		}
	}
	return actionSet
}

func sortedPermissionKeys(permissionSet map[string]struct{}) []string {
	out := make([]string, 0, len(permissionSet))
	for permissionKey := range permissionSet {
		out = append(out, permissionKey)
	}
	sort.Strings(out)
	return out
}
