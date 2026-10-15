package biz

import (
	"sort"
	"strings"
)

func boolValueFromAny(value any) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func sortedUniqueStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := map[string]struct{}{}
	out := []string{}
	for _, raw := range values {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func mapFromAnyValue(value any) (map[string]any, error) {
	if value == nil {
		return map[string]any{}, nil
	}
	out, ok := value.(map[string]any)
	if !ok {
		return nil, ErrBadParam
	}
	return cloneProcessPolicySnapshot(out), nil
}

func boolFromProcessDefinition(definition map[string]any, key string) (bool, error) {
	value, ok := definition[key]
	if !ok {
		return false, ErrBadParam
	}
	typed, ok := value.(bool)
	if !ok {
		return false, ErrBadParam
	}
	return typed, nil
}

func optionalStringPointer(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func processReferencesModule(m map[string]any, moduleKey string) bool {
	for _, key := range []string{"modules", "sourceModules", "targetModules"} {
		for _, item := range stringSliceFromAnyValue(m[key]) {
			if normalizeModuleKey(item) == moduleKey {
				return true
			}
		}
	}
	return false
}

func anyListFromMap(m map[string]any, key string) []any {
	if len(m) == 0 {
		return []any{}
	}
	return anyListValue(m[key])
}

func anyListValue(value any) []any {
	if value == nil {
		return []any{}
	}
	if items, ok := value.([]any); ok {
		return items
	}
	if items, ok := value.([]map[string]any); ok {
		out := make([]any, 0, len(items))
		for _, item := range items {
			out = append(out, item)
		}
		return out
	}
	return []any{}
}

func stringSliceFromAnyValue(value any) []string {
	switch typed := value.(type) {
	case []string:
		return normalizeStringList(typed)
	case []any:
		out := []string{}
		for _, item := range typed {
			if text, ok := item.(string); ok {
				out = append(out, text)
			}
		}
		return normalizeStringList(out)
	default:
		return []string{}
	}
}

func getStringFromAnyMap(m map[string]any, key string) string {
	if len(m) == 0 {
		return ""
	}
	if text, ok := m[key].(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func stringSliceFromSnapshot(snapshot map[string]any, key string) []string {
	if len(snapshot) == 0 {
		return nil
	}
	raw, ok := snapshot[key]
	if !ok {
		return nil
	}
	switch typed := raw.(type) {
	case []string:
		return normalizeStringList(typed)
	case []any:
		out := make([]string, 0, len(typed))
		for _, value := range typed {
			if text, ok := value.(string); ok {
				out = append(out, text)
			}
		}
		return normalizeStringList(out)
	default:
		return nil
	}
}

func adminMenuKeys(admin *AdminUser) []string {
	menus := AdminVisibleMenus(admin)
	out := make([]string, 0, len(menus))
	for _, menu := range menus {
		out = append(out, menu.Key)
	}
	return out
}

func effectiveActionKeys(admin *AdminUser) []string {
	if admin == nil {
		return []string{}
	}
	if admin.IsSuperAdmin {
		return AllPermissionKeys()
	}
	return NormalizePermissionKeys(admin.Permissions)
}
