package biz

import "strings"

type AdminERPPreferences struct {
	ColumnOrders map[string][]string
}

func NormalizeAdminERPPreferences(input AdminERPPreferences) AdminERPPreferences {
	out := AdminERPPreferences{
		ColumnOrders: map[string][]string{},
	}
	for rawModuleKey, rawOrder := range input.ColumnOrders {
		moduleKey := normalizeAdminERPPreferenceModuleKey(rawModuleKey)
		if moduleKey == "" {
			continue
		}
		normalizedOrder := NormalizeAdminERPColumnOrder(rawOrder)
		if len(normalizedOrder) == 0 {
			continue
		}
		out.ColumnOrders[moduleKey] = normalizedOrder
	}
	if len(out.ColumnOrders) == 0 {
		out.ColumnOrders = nil
	}
	return out
}

func NormalizeAdminERPColumnOrder(input []string) []string {
	seen := make(map[string]struct{}, len(input))
	out := make([]string, 0, len(input))
	for _, rawValue := range input {
		value := strings.TrimSpace(rawValue)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func normalizeAdminERPPreferenceModuleKey(input string) string {
	value := strings.TrimSpace(input)
	if value == "" {
		return ""
	}
	if len(value) > 128 {
		return value[:128]
	}
	return value
}
