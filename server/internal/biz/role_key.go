package biz

import "strings"

const BusinessRoleKey = "business"

func NormalizeRoleKey(roleKey string) string {
	return strings.TrimSpace(roleKey)
}

func NormalizeOptionalRoleKey(roleKey *string) *string {
	if roleKey == nil {
		return nil
	}
	normalized := NormalizeRoleKey(*roleKey)
	if normalized == "" {
		return nil
	}
	return &normalized
}
