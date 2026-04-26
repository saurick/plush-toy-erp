package biz

import "strings"

type AdminMenuPermissionOption struct {
	Key   string
	Label string
}

var adminMenuPermissionAliases = map[string]string{
	"/erp/flows/overview":          "/erp/docs/operation-flow-overview",
	"/erp/source-readiness":        "/erp/docs/field-linkage-guide",
	"/erp/mobile-workbenches":      "/erp/docs/operation-guide",
	"/erp/help-center":             "/erp/docs/operation-flow-overview",
	"/erp/docs/system-init":        "/erp/docs/operation-guide",
	"/erp/docs/operation-playbook": "/erp/docs/operation-flow-overview",
	"/erp/docs/field-truth":        "/erp/docs/field-linkage-guide",
	"/erp/docs/data-model":         "/erp/docs/calculation-guide",
	"/erp/docs/import-mapping":     "/erp/docs/field-linkage-guide",
	"/erp/docs/mobile-roles":       "/erp/docs/mobile-role-guide",
	"/erp/docs/print-templates":    "/erp/docs/print-snapshot-guide",
	"/erp/changes/current":         "/erp/docs/operation-guide",
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
		if normalized, ok := adminMenuPermissionAliases[key]; ok {
			key = normalized
		}
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
