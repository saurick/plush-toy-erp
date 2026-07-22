package biz

import (
	"context"
	"errors"
	"sort"
	"strings"
)

type AccessDecisionReason struct {
	Code  string
	Label string
}

type RoleEffectivePermissionDecision struct {
	PermissionKey string
	Class         PermissionClass
	RBACGranted   bool
	Effective     bool
	Reasons       []AccessDecisionReason
}

type RoleEffectivePageDecision struct {
	Key         string
	Label       string
	Path        string
	RequiredAny []string
	RequiredAll []string
	MissingAny  []string
	MissingAll  []string
	RBACGranted bool
	Effective   bool
	Reasons     []AccessDecisionReason
}

type RoleEffectiveAccessExplanation struct {
	CustomerKey       string
	RoleKey           string
	RoleName          string
	RoleType          RoleType
	RoleVersion       int
	RoleDisabled      bool
	Source            string
	IsFinal           bool
	ConfigRevision    string
	ConfigHash        string
	ConfigHashVersion int
	ProductVersion    string
	Permissions       []RoleEffectivePermissionDecision
	Pages             []RoleEffectivePageDecision
}

func (uc *CustomerConfigUsecase) ExplainRoleEffectiveAccess(
	ctx context.Context,
	customerKey string,
	role AdminRole,
	requireActiveRevision bool,
) (*RoleEffectiveAccessExplanation, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	customerKey = NormalizeCustomerKey(customerKey)
	if customerKey == "" {
		customerKey = DefaultCustomerKey
	}
	role.Key = NormalizeRoleKey(role.Key)
	role.Type = NormalizeRoleType(role.Type, role.Key, role.Builtin)
	if role.Key == "" {
		return nil, ErrRoleNotFound
	}

	out := &RoleEffectiveAccessExplanation{
		CustomerKey:  customerKey,
		RoleKey:      role.Key,
		RoleName:     role.Name,
		RoleType:     role.Type,
		RoleVersion:  role.Version,
		RoleDisabled: role.Disabled,
		Source:       "active_revision_missing",
		IsFinal:      false,
	}
	baseAdmin := &AdminUser{
		ID:          0,
		Roles:       []AdminRole{role},
		Permissions: NormalizePermissionKeys(role.Permissions),
		Disabled:    role.Disabled,
	}
	basePermissions := PermissionKeySet(baseAdmin.Permissions)

	var session *EffectiveSession
	if role.Disabled {
		out.Source = "role_disabled"
	} else if IsSystemManagedRole(role) {
		session = builtinEffectiveSession(customerKey, baseAdmin, []string{role.Key})
		out.Source = "control_plane_rbac"
		out.IsFinal = true
	} else {
		active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
		if err != nil {
			if !errors.Is(err, ErrCustomerConfigNotFound) {
				return nil, err
			}
			if !requireActiveRevision {
				session = builtinEffectiveSession(customerKey, baseAdmin, []string{role.Key})
				out.Source = "builtin_rbac_fallback"
			}
		} else {
			modules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
			if err != nil {
				return nil, err
			}
			profiles, err := uc.repo.ListRoleProfiles(ctx, customerKey, active.Revision)
			if err != nil {
				return nil, err
			}
			effectiveRoleKeys := enabledCustomerRoleKeys([]string{role.Key}, profiles)
			entitlements, err := uc.repo.ListAccessEntitlements(ctx, customerKey, active.Revision, effectiveRoleKeys)
			if err != nil {
				return nil, err
			}
			workPools, err := uc.repo.ListWorkPools(ctx, customerKey, active.Revision)
			if err != nil {
				return nil, err
			}
			memberships, err := uc.repo.ListWorkPoolMemberships(ctx, customerKey, active.Revision, effectiveRoleKeys, 0)
			if err != nil {
				return nil, err
			}
			session = buildEffectiveSessionFromRevision(customerKey, active, baseAdmin, effectiveRoleKeys, modules, profiles, entitlements, workPools, memberships)
			out.Source = session.Source
			out.IsFinal = true
			out.ConfigRevision = active.Revision
			out.ConfigHash = active.ConfigHash
			out.ConfigHashVersion = active.ConfigHashVersion
			out.ProductVersion = active.ProductVersion
		}
	}

	effectiveActions := map[string]struct{}{}
	effectivePages := map[string]struct{}{}
	if session != nil {
		effectiveActions = PermissionKeySet(session.Actions)
		for _, pageKey := range session.Pages {
			effectivePages[strings.TrimSpace(pageKey)] = struct{}{}
		}
	}
	out.Permissions = explainRolePermissions(baseAdmin.Permissions, effectiveActions, role, out.Source)
	out.Pages = explainRolePages(basePermissions, effectiveActions, effectivePages, role, out.Source)
	return out, nil
}

func explainRolePermissions(permissionKeys []string, effective map[string]struct{}, role AdminRole, source string) []RoleEffectivePermissionDecision {
	keys := NormalizePermissionKeys(permissionKeys)
	out := make([]RoleEffectivePermissionDecision, 0, len(keys))
	for _, key := range keys {
		class := PermissionClassBusiness
		if definition, ok := PermissionDefinitionByKey(key); ok {
			class = definition.Class
		}
		_, isEffective := effective[key]
		if class == PermissionClassControlPlane && !role.Disabled {
			isEffective = true
		}
		decision := RoleEffectivePermissionDecision{
			PermissionKey: key,
			Class:         class,
			RBACGranted:   true,
			Effective:     isEffective,
		}
		if !isEffective {
			decision.Reasons = roleAccessReasons(role, source, "customer_entitlement_or_module_restricted")
		}
		out = append(out, decision)
	}
	return out
}

func explainRolePages(basePermissions, effectiveActions, effectivePages map[string]struct{}, role AdminRole, source string) []RoleEffectivePageDecision {
	menus := BuiltinAdminMenus()
	out := make([]RoleEffectivePageDecision, 0, len(menus))
	for _, menu := range menus {
		rbacGranted := AdminMenuRequirementsSatisfied(basePermissions, menu)
		_, isEffective := effectivePages[menu.Key]
		missingAny := missingPermissions(effectiveActions, menu.RequiredAny, true)
		missingAll := missingPermissions(effectiveActions, menu.RequiredAll, false)
		decision := RoleEffectivePageDecision{
			Key:         menu.Key,
			Label:       menu.Label,
			Path:        menu.Path,
			RequiredAny: append([]string(nil), menu.RequiredAny...),
			RequiredAll: append([]string(nil), menu.RequiredAll...),
			MissingAny:  missingAny,
			MissingAll:  missingAll,
			RBACGranted: rbacGranted,
			Effective:   isEffective,
		}
		switch {
		case role.Disabled:
			decision.Reasons = roleAccessReasons(role, source, "role_disabled")
		case !rbacGranted:
			decision.Reasons = []AccessDecisionReason{{Code: "missing_rbac_permission", Label: "岗位基础权限不足"}}
		case !isEffective && (len(missingAny) > 0 || len(missingAll) > 0):
			decision.Reasons = roleAccessReasons(role, source, "customer_entitlement_or_module_restricted")
		case !isEffective:
			decision.Reasons = roleAccessReasons(role, source, "page_not_configured_or_projected")
		}
		out = append(out, decision)
	}
	return out
}

func missingPermissions(permissionSet map[string]struct{}, required []string, anyMode bool) []string {
	if len(required) == 0 {
		return []string{}
	}
	missing := make([]string, 0, len(required))
	found := false
	for _, key := range required {
		if _, ok := permissionSet[key]; ok {
			found = true
			continue
		}
		missing = append(missing, key)
	}
	if anyMode && found {
		return []string{}
	}
	sort.Strings(missing)
	return missing
}

func roleAccessReasons(role AdminRole, source, fallbackCode string) []AccessDecisionReason {
	switch {
	case role.Disabled:
		return []AccessDecisionReason{{Code: "role_disabled", Label: "岗位已停用"}}
	case source == "active_revision_missing":
		return []AccessDecisionReason{{Code: "active_revision_missing", Label: "当前客户没有已启用配置版本"}}
	case source == "builtin_rbac_fallback":
		return []AccessDecisionReason{{Code: "product_core_preview", Label: "仅为产品核心权限预览，不是客户最终权限"}}
	case fallbackCode == "page_not_configured_or_projected":
		return []AccessDecisionReason{{Code: fallbackCode, Label: "页面未被当前客户版本启用或未投影给该岗位"}}
	default:
		return []AccessDecisionReason{{Code: fallbackCode, Label: "当前客户权限、模块状态或岗位撤销规则未放行"}}
	}
}
