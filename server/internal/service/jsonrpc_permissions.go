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
	if admin.Disabled {
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
	if admin.Disabled {
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
	if admin.IsSuperAdmin || d == nil || d.customerConfigUC == nil {
		cacheEffectiveAdminPermissions(cache, permissions)
		return permissions, nil
	}
	customerKey, err := runtimeCustomerKey("")
	if err != nil {
		return nil, &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	actionEntitlements, err := d.customerConfigUC.GetEffectiveActionEntitlements(ctx, customerKey, admin)
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
	return permissionKey != "" &&
		!strings.HasPrefix(permissionKey, "system.") &&
		!strings.HasPrefix(permissionKey, "customer_config.") &&
		!strings.HasPrefix(permissionKey, "debug.") &&
		permissionKey != biz.PermissionERPBusinessChainDebugRead
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
		out = append(out, map[string]any{
			"id":          role.ID,
			"role_key":    role.Key,
			"name":        role.Name,
			"description": role.Description,
			"builtin":     role.Builtin,
			"disabled":    role.Disabled,
			"sort_order":  role.SortOrder,
		})
	}
	return out
}

func adminMenusToAny(admin *biz.AdminUser) []any {
	menus := biz.AdminVisibleMenus(admin)
	out := make([]any, 0, len(menus))
	for _, menu := range menus {
		out = append(out, map[string]any{
			"key":                  menu.Key,
			"label":                menu.Label,
			"path":                 menu.Path,
			"required_permissions": toAnySliceString(menu.RequiredPermissions),
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
		"id":             admin.ID,
		"user_id":        admin.ID,
		"username":       admin.Username,
		"phone":          admin.Phone,
		"role":           int(biz.RoleAdmin),
		"disabled":       admin.Disabled,
		"is_super_admin": admin.IsSuperAdmin,
		"roles":          adminRolesToAny(admin),
		"permissions":    adminPermissionsToAny(admin),
		"menus":          adminMenusToAny(admin),
		"last_login_at":  lastLogin,
		"created_at":     admin.CreatedAt.Unix(),
		"updated_at":     admin.UpdatedAt.Unix(),
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
	lastLogin := int64(0)
	if admin.LastLoginAt != nil {
		lastLogin = admin.LastLoginAt.Unix()
	}
	return map[string]any{
		"id":             admin.ID,
		"username":       admin.Username,
		"phone":          admin.Phone,
		"is_super_admin": admin.IsSuperAdmin,
		"disabled":       admin.Disabled,
		"last_login_at":  lastLogin,
		"created_at":     admin.CreatedAt.Unix(),
		"updated_at":     admin.UpdatedAt.Unix(),
		"roles":          adminRolesToAny(admin),
		"permissions":    adminPermissionsToAny(admin),
		"menus":          adminMenusToAny(admin),
	}
}

func roleOptionsToAny(items []biz.AdminRole) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":          item.ID,
			"role_key":    item.Key,
			"name":        item.Name,
			"description": item.Description,
			"builtin":     item.Builtin,
			"disabled":    item.Disabled,
			"sort_order":  item.SortOrder,
			"permissions": toAnySliceString(item.Permissions),
		})
	}
	return out
}

func permissionOptionsToAny(items []biz.AdminPermission) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":             item.ID,
			"permission_key": item.Key,
			"name":           item.Name,
			"description":    item.Description,
			"module":         item.Module,
			"action":         item.Action,
			"resource":       item.Resource,
			"builtin":        item.Builtin,
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
			"key":                  item.Key,
			"label":                item.Label,
			"path":                 item.Path,
			"required_permissions": toAnySliceString(item.RequiredPermissions),
		})
	}
	return out
}
