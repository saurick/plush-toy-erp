package service

import (
	"context"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

type adminPermissionCacheKey struct{}

type adminPermissionCache struct {
	admin               *biz.AdminUser
	permission          []string
	effectivePermission []string
	loaded              bool
	effectiveLoaded     bool
}

func withAdminPermissionCache(ctx context.Context) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, ok := ctx.Value(adminPermissionCacheKey{}).(*adminPermissionCache); ok {
		return ctx
	}
	return context.WithValue(ctx, adminPermissionCacheKey{}, &adminPermissionCache{})
}

func getAdminPermissionCache(ctx context.Context) *adminPermissionCache {
	cache, _ := ctx.Value(adminPermissionCacheKey{}).(*adminPermissionCache)
	return cache
}

func (d *jsonrpcDispatcher) CurrentAdminPermissions(ctx context.Context) ([]string, *v1.JsonrpcResult) {
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return nil, res
	}

	cache := getAdminPermissionCache(ctx)
	if cache != nil && cache.loaded {
		return append([]string(nil), cache.permission...), nil
	}

	admin, err := d.getCurrentAdmin(ctx, claims)
	if err != nil || admin == nil {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
	}
	if !admin.IsActive() {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminDisabled.Code, Message: errcode.AdminDisabled.Message}
	}

	permissions := biz.NormalizePermissionKeys(admin.Permissions)
	if admin.IsSuperAdmin {
		permissions = biz.AllPermissionKeys()
	}
	if cache != nil {
		cache.admin = admin
		cache.permission = append([]string(nil), permissions...)
		cache.loaded = true
	}
	return permissions, nil
}

func (d *jsonrpcDispatcher) CurrentAdmin(ctx context.Context) (*biz.AdminUser, *v1.JsonrpcResult) {
	claims, res := d.requireAdmin(ctx)
	if res != nil {
		return nil, res
	}
	cache := getAdminPermissionCache(ctx)
	if cache != nil && cache.loaded && cache.admin != nil {
		return cache.admin, nil
	}
	admin, err := d.getCurrentAdmin(ctx, claims)
	if err != nil || admin == nil {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
	}
	if !admin.IsActive() {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminDisabled.Code, Message: errcode.AdminDisabled.Message}
	}
	if cache != nil {
		cache.admin = admin
		cache.permission = biz.NormalizePermissionKeys(admin.Permissions)
		if admin.IsSuperAdmin {
			cache.permission = biz.AllPermissionKeys()
		}
		cache.loaded = true
	}
	return admin, nil
}

func (d *jsonrpcDispatcher) AdminHasPermission(ctx context.Context, permissionKey string) (bool, *v1.JsonrpcResult) {
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return false, res
	}
	permissionSet := biz.PermissionKeySet(permissions)
	return biz.PermissionSetHasAny(permissionSet, permissionKey), nil
}

// CurrentEffectiveAdminPermissions keeps backend RBAC as the upper bound and
// applies the active customer revision as a narrower business-action boundary.
// Control-plane permissions stay governed by RBAC so an administrator cannot
// lock the deployment out of configuration repair or audit access.
func (d *jsonrpcDispatcher) CurrentEffectiveAdminPermissions(ctx context.Context) ([]string, *v1.JsonrpcResult) {
	permissions, res := d.CurrentAdminPermissions(ctx)
	if res != nil {
		return nil, res
	}
	cache := getAdminPermissionCache(ctx)
	if cache != nil && cache.effectiveLoaded {
		return append([]string(nil), cache.effectivePermission...), nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return nil, res
	}
	requireActiveRevision := runtimeCustomerConfigRequiresActiveRevision()
	if (admin.IsSuperAdmin && !requireActiveRevision) || d == nil || d.customerConfigUC == nil {
		cacheEffectiveAdminPermissions(cache, permissions)
		return permissions, nil
	}
	customerKey, err := runtimeCustomerKey("")
	if err != nil {
		return nil, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	var actionEntitlements []string
	if requireActiveRevision {
		actionEntitlements, err = d.customerConfigUC.GetEffectiveActionEntitlementsRequiringActiveRevision(ctx, customerKey, admin)
	} else {
		actionEntitlements, err = d.customerConfigUC.GetEffectiveActionEntitlements(ctx, customerKey, admin)
	}
	if err != nil {
		if d.log == nil {
			return nil, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
		}
		return nil, d.mapCustomerConfigError(ctx, err)
	}
	effectiveActions := biz.PermissionKeySet(actionEntitlements)
	effective := make([]string, 0, len(permissions))
	for _, permissionKey := range permissions {
		if !customerConfigEntitlementApplies(permissionKey) || biz.PermissionSetHasAny(effectiveActions, permissionKey) {
			effective = append(effective, permissionKey)
		}
	}
	cacheEffectiveAdminPermissions(cache, effective)
	return effective, nil
}

func cacheEffectiveAdminPermissions(cache *adminPermissionCache, permissions []string) {
	if cache == nil {
		return
	}
	cache.effectivePermission = append([]string(nil), permissions...)
	cache.effectiveLoaded = true
}

func customerConfigEntitlementApplies(permissionKey string) bool {
	permissionKey = strings.TrimSpace(permissionKey)
	if permissionKey == "" {
		return false
	}
	definition, ok := biz.PermissionDefinitionByKey(permissionKey)
	if !ok {
		return true
	}
	return definition.Class == biz.PermissionClassBusiness
}

func (d *jsonrpcDispatcher) RequireAdminPermission(ctx context.Context, permissionKey string) *v1.JsonrpcResult {
	ok, res := d.AdminHasPermission(ctx, permissionKey)
	if res != nil {
		return res
	}
	if !ok {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	return nil
}

// RequireAdminRBACPermission checks only the authenticated administrator's
// backend RBAC upper bound. Callers must apply their own narrower customer
// contract after this check. Workflow task endpoints use it because formal
// process tasks retain the immutable customer-config revision that authorized
// their owner and action roles; applying only the currently active revision
// here would incorrectly hide or strand older in-flight tasks.
func (d *jsonrpcDispatcher) RequireAdminRBACPermission(ctx context.Context, permissionKey string) *v1.JsonrpcResult {
	permissions, res := d.CurrentAdminPermissions(ctx)
	if res != nil {
		return res
	}
	if !biz.PermissionSetHasAny(biz.PermissionKeySet(permissions), permissionKey) {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	return nil
}

func (d *jsonrpcDispatcher) RequireAdminAnyPermission(ctx context.Context, permissionKeys ...string) *v1.JsonrpcResult {
	permissions, res := d.CurrentEffectiveAdminPermissions(ctx)
	if res != nil {
		return res
	}
	permissionSet := biz.PermissionKeySet(permissions)
	if !biz.PermissionSetHasAny(permissionSet, permissionKeys...) {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	return nil
}

func adminPermissionsToAny(admin *biz.AdminUser) []any {
	if admin == nil {
		return []any{}
	}
	if admin.IsSuperAdmin {
		return toAnySliceString(biz.AllPermissionKeys())
	}
	return toAnySliceString(biz.NormalizePermissionKeys(admin.Permissions))
}

func adminRolesToAny(admin *biz.AdminUser) []any {
	if admin == nil {
		return []any{}
	}
	out := make([]any, 0, len(admin.Roles))
	for _, role := range admin.Roles {
		if role.Disabled {
			continue
		}
		out = append(out, adminRoleToMap(role, false))
	}
	return out
}

func adminMenusToAny(admin *biz.AdminUser) []any {
	menus := biz.AdminVisibleMenus(admin)
	out := make([]any, 0, len(menus))
	for _, menu := range menus {
		out = append(out, map[string]any{
			"key":          menu.Key,
			"label":        menu.Label,
			"path":         menu.Path,
			"required_any": toAnySliceString(menu.RequiredAny),
			"required_all": toAnySliceString(menu.RequiredAll),
		})
	}
	return out
}

func adminProfileToMap(admin *biz.AdminUser, includeTokenMeta map[string]any) map[string]any {
	lastLogin := int64(0)
	if admin != nil && admin.LastLoginAt != nil {
		lastLogin = admin.LastLoginAt.Unix()
	}
	out := map[string]any{
		"id":                admin.ID,
		"user_id":           admin.ID,
		"username":          admin.Username,
		"phone":             admin.Phone,
		"role":              int(biz.RoleAdmin),
		"disabled":          admin.Disabled,
		"account_status":    string(admin.AccountStatus()),
		"revoked_at":        optionalTimeUnix(admin.RevokedAt),
		"status_reason":     admin.StatusReason,
		"status_changed_at": optionalTimeUnix(admin.StatusChangedAt),
		"status_changed_by": optionalIntValue(admin.StatusChangedBy),
		"is_super_admin":    admin.IsSuperAdmin,
		"roles":             adminRolesToAny(admin),
		"permissions":       adminPermissionsToAny(admin),
		"menus":             adminMenusToAny(admin),
		"last_login_at":     lastLogin,
		"created_at":        admin.CreatedAt.Unix(),
		"updated_at":        admin.UpdatedAt.Unix(),
		"erp_preferences": map[string]any{
			"column_orders": toAnyMapStringSlice(admin.ERPPreferences.ColumnOrders),
		},
	}
	for key, value := range includeTokenMeta {
		out[key] = value
	}
	return out
}

func adminListItemToMap(admin *biz.AdminUser) map[string]any {
	if admin == nil {
		return map[string]any{}
	}
	permissionCount := len(biz.NormalizePermissionKeys(admin.Permissions))
	if admin.IsSuperAdmin {
		permissionCount = len(biz.AllPermissionKeys())
	}
	return map[string]any{
		"id":               admin.ID,
		"username":         admin.Username,
		"phone":            admin.Phone,
		"is_super_admin":   admin.IsSuperAdmin,
		"account_status":   string(admin.AccountStatus()),
		"status_reason":    admin.StatusReason,
		"roles":            adminListRolesToAny(admin),
		"permission_count": permissionCount,
	}
}

func adminListRolesToAny(admin *biz.AdminUser) []any {
	if admin == nil {
		return []any{}
	}
	out := make([]any, 0, len(admin.Roles))
	for _, role := range admin.Roles {
		if role.Disabled {
			continue
		}
		out = append(out, map[string]any{
			"role_key": role.Key,
			"name":     role.Name,
		})
	}
	return out
}

func roleOptionsToAny(items []biz.AdminRole, accessByRoleKey map[string]biz.AdminRoleAccess) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		mapped := adminRoleToMap(item, true)
		access := accessByRoleKey[biz.NormalizeRoleKey(item.Key)]
		mapped["assignable"] = access.Assignable
		mapped["assignable_by_current_admin"] = access.Assignable
		mapped["assignment_blocked_reason"] = access.AssignmentBlockedReason
		mapped["permissions_editable"] = access.PermissionsEditable
		mapped["permissions_editable_by_current_admin"] = access.PermissionsEditable
		mapped["permissions_edit_blocked_reason"] = access.PermissionsEditBlockedReason
		out = append(out, mapped)
	}
	return out
}

func adminRoleToMap(item biz.AdminRole, includePermissions bool) map[string]any {
	item.Type = biz.NormalizeRoleType(item.Type, item.Key, item.Builtin)
	isDebugRole := biz.IsDebugRole(item)
	isSystemRole := biz.IsSystemManagedRole(item)
	navigation := biz.NormalizePersistedRoleNavigationSettings(
		item.NavigationMode,
		item.PrimaryMenuPaths,
	)
	out := map[string]any{
		"id":                   item.ID,
		"role_key":             item.Key,
		"name":                 item.Name,
		"description":          item.Description,
		"builtin":              item.Builtin,
		"disabled":             item.Disabled,
		"sort_order":           item.SortOrder,
		"role_type":            string(item.Type),
		"version":              item.Version,
		"navigation_mode":      string(navigation.Mode),
		"primary_menu_paths":   toAnySliceString(navigation.PrimaryMenuPaths),
		"data_scopes":          roleDataScopesToAny(item.DataScopes),
		"permissions_editable": !item.Disabled && !isSystemRole,
		"assignable":           !item.Disabled && (!isSystemRole || isDebugRole),
		"non_production_only":  isDebugRole,
	}
	if includePermissions {
		out["permissions"] = toAnySliceString(item.Permissions)
	}
	return out
}

func roleDataScopesToAny(items []biz.RoleDataScope) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"resource_type": item.ResourceType,
			"mode":          item.Mode,
			"resource_ids":  toAnySliceInt(item.ResourceIDs),
		})
	}
	return out
}

func toAnySliceInt(items []int) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out
}

func permissionOptionsToAny(items []biz.AdminPermission) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		if definition, ok := biz.PermissionDefinitionByKey(item.Key); ok {
			item.Module = definition.Module
			item.Class = definition.Class
			item.Assignable = definition.Assignable
			item.NonProductionOnly = definition.NonProductionOnly
		}
		moduleName, _ := biz.PermissionModuleName(item.Module)
		out = append(out, map[string]any{
			"id":                  item.ID,
			"permission_key":      item.Key,
			"name":                item.Name,
			"description":         item.Description,
			"module":              item.Module,
			"module_name":         moduleName,
			"action":              item.Action,
			"resource":            item.Resource,
			"builtin":             item.Builtin,
			"class":               string(item.Class),
			"assignable":          item.Assignable,
			"non_production_only": item.NonProductionOnly,
			"usage":               permissionUsageToMap(item),
		})
	}
	return out
}

func permissionUsageToMap(permission biz.AdminPermission) map[string]any {
	usage, ok := biz.PermissionUsageFor(permission.Key)
	if !ok {
		return map[string]any{
			"pages":           []any{},
			"backend_only":    false,
			"backend_methods": []any{},
			"required_any":    []any{},
			"required_all":    []any{},
			"conditions":      []any{},
		}
	}

	pages := make([]any, 0, len(usage.Surfaces))
	backendMethods := make([]any, 0)
	requiredAny := make([]string, 0)
	requiredAll := make([]string, 0)
	conditions := make([]string, 0)
	for _, surface := range usage.Surfaces {
		methods := permissionBackendMethodsToAny(surface.BackendMethods)
		backendMethods = append(backendMethods, methods...)
		requiredAny = append(requiredAny, surface.RequiredAny...)
		requiredAll = append(requiredAll, surface.RequiredAll...)
		conditions = append(conditions, surface.Conditions...)
		if strings.TrimSpace(surface.PageKey) == "" {
			continue
		}
		pages = append(pages, map[string]any{
			"key":             surface.PageKey,
			"name":            surface.PageLabel,
			"path":            surface.PagePath,
			"section_key":     surface.SectionKey,
			"section_name":    surface.SectionLabel,
			"control_key":     surface.ControlKey,
			"control_name":    surface.ControlLabel,
			"control_type":    surface.ControlType,
			"effect":          surface.Effect,
			"backend_methods": methods,
			"required_any":    toAnySliceString(surface.RequiredAny),
			"required_all":    toAnySliceString(surface.RequiredAll),
			"conditions":      toAnySliceString(surface.Conditions),
		})
	}
	return map[string]any{
		"pages":           pages,
		"backend_only":    usage.BackendOnly,
		"backend_methods": backendMethods,
		"required_any":    toAnySliceString(requiredAny),
		"required_all":    toAnySliceString(requiredAll),
		"conditions":      toAnySliceString(conditions),
	}
}

func permissionBackendMethodsToAny(items []biz.PermissionBackendMethod) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"domain": item.Domain,
			"method": item.Method,
		})
	}
	return out
}

func runtimeAuditEventsToAny(items []biz.RuntimeAuditEvent) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":             item.ID,
			"event_type":     item.EventType,
			"event_key":      item.EventKey,
			"source":         item.Source,
			"payload":        item.Payload,
			"risk_level":     item.RiskLevel,
			"action_label":   item.ActionLabel,
			"summary":        item.Summary,
			"actor_key":      item.ActorKey,
			"target_type":    item.TargetType,
			"target_key":     item.TargetKey,
			"created_at":     item.CreatedAt.Unix(),
			"created_at_iso": item.CreatedAt.Format(time.RFC3339),
		})
	}
	return out
}

func menuOptionsToAny(items []biz.AdminMenu) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"key":          item.Key,
			"label":        item.Label,
			"path":         item.Path,
			"required_any": toAnySliceString(item.RequiredAny),
			"required_all": toAnySliceString(item.RequiredAll),
		})
	}
	return out
}

func roleEffectiveAccessExplanationToMap(item *biz.RoleEffectiveAccessExplanation) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	permissions := make([]any, 0, len(item.Permissions))
	for _, decision := range item.Permissions {
		permissions = append(permissions, map[string]any{
			"permission_key": decision.PermissionKey,
			"class":          string(decision.Class),
			"rbac_granted":   decision.RBACGranted,
			"effective":      decision.Effective,
			"reasons":        accessDecisionReasonsToAny(decision.Reasons),
		})
	}
	pages := make([]any, 0, len(item.Pages))
	for _, decision := range item.Pages {
		pages = append(pages, map[string]any{
			"key":          decision.Key,
			"label":        decision.Label,
			"path":         decision.Path,
			"required_any": toAnySliceString(decision.RequiredAny),
			"required_all": toAnySliceString(decision.RequiredAll),
			"missing_any":  toAnySliceString(decision.MissingAny),
			"missing_all":  toAnySliceString(decision.MissingAll),
			"rbac_granted": decision.RBACGranted,
			"effective":    decision.Effective,
			"reasons":      accessDecisionReasonsToAny(decision.Reasons),
		})
	}
	return map[string]any{
		"customer_key":        item.CustomerKey,
		"role_key":            item.RoleKey,
		"role_name":           item.RoleName,
		"role_type":           string(item.RoleType),
		"role_version":        item.RoleVersion,
		"role_disabled":       item.RoleDisabled,
		"source":              item.Source,
		"is_final":            item.IsFinal,
		"config_revision":     item.ConfigRevision,
		"config_hash":         item.ConfigHash,
		"config_hash_version": item.ConfigHashVersion,
		"product_version":     item.ProductVersion,
		"permissions":         permissions,
		"pages":               pages,
	}
}

func accessDecisionReasonsToAny(items []biz.AccessDecisionReason) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{"code": item.Code, "label": item.Label})
	}
	return out
}
