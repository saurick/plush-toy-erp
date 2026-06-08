package biz

import "strings"

type AdminMenuPermissionOption struct {
	Key   string
	Label string
}

var adminMenuPermissionAliases = map[string]string{
	"/erp/flows/overview":     "/erp/dashboard",
	"/erp/source-readiness":   "/erp/dashboard",
	"/erp/mobile-workbenches": "/erp/dashboard",
	"/erp/help-center":        "/erp/dashboard",
	"/erp/changes/current":    "/erp/dashboard",
}

func normalizeAdminMenuPermissionAlias(key string) string {
	if normalized, ok := adminMenuPermissionAliases[key]; ok {
		return normalized
	}
	if strings.HasPrefix(key, "/erp/docs/") || strings.HasPrefix(key, "/erp/qa/") {
		return "/erp/dashboard"
	}
	return key
}

func adminMenuPathSet() map[string]struct{} {
	items := make(map[string]struct{}, len(builtinAdminMenus))
	for _, item := range BuiltinAdminMenus() {
		items[item.Path] = struct{}{}
	}
	return items
}

// Deprecated: menu visibility is derived from RBAC permission codes via BuiltinAdminMenus/AdminVisibleMenus.
func AdminMenuPermissionOptions() []AdminMenuPermissionOption {
	menus := BuiltinAdminMenus()
	out := make([]AdminMenuPermissionOption, 0, len(menus))
	for _, menu := range menus {
		out = append(out, AdminMenuPermissionOption{Key: menu.Path, Label: menu.Label})
	}
	return out
}

// Deprecated: menu visibility is derived from RBAC permission codes via BuiltinAdminMenus/AdminVisibleMenus.
func AllAdminMenuPermissions() []string {
	menus := BuiltinAdminMenus()
	out := make([]string, 0, len(menus))
	for _, item := range menus {
		out = append(out, item.Path)
	}
	return out
}

// Deprecated: new admins receive roles; roles grant permissions; permissions drive menus.
func DefaultAdminMenuPermissions() []string {
	out := make([]string, 0, len(builtinAdminMenus))
	for _, item := range BuiltinAdminMenus() {
		if item.Path == "/erp/system/permissions" {
			continue
		}
		out = append(out, item.Path)
	}
	return out
}

// Deprecated: this only normalizes legacy path lists for tests/tools; it is not an authority source.
func NormalizeAdminMenuPermissions(input []string) []string {
	if len(input) == 0 {
		return []string{}
	}

	selected := make(map[string]struct{}, len(input))
	known := adminMenuPathSet()
	for _, raw := range input {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		key = normalizeAdminMenuPermissionAlias(key)
		if _, ok := known[key]; !ok {
			continue
		}
		selected[key] = struct{}{}
	}

	out := make([]string, 0, len(selected))
	for _, item := range BuiltinAdminMenus() {
		if _, ok := selected[item.Path]; ok {
			out = append(out, item.Path)
		}
	}
	return out
}
