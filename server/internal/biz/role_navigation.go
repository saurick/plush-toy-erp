package biz

import (
	"strings"
	"unicode"
)

type RoleNavigationMode string

const (
	RoleNavigationModeRecommended RoleNavigationMode = "recommended"
	RoleNavigationModeCustom      RoleNavigationMode = "custom"

	MaxRolePrimaryMenuPaths = 5
)

var fixedRoleNavigationPaths = map[string]struct{}{
	"/erp/dashboard":          {},
	"/erp/task-board":         {},
	"/erp/business-dashboard": {},
	"/erp/help-center":        {},
}

type RoleNavigationSettings struct {
	Mode             RoleNavigationMode
	PrimaryMenuPaths []string
}

func NormalizeRoleNavigationSettings(
	mode RoleNavigationMode,
	primaryMenuPaths []string,
) (RoleNavigationSettings, error) {
	normalizedMode := RoleNavigationMode(strings.TrimSpace(string(mode)))
	switch normalizedMode {
	case "":
		normalizedMode = RoleNavigationModeRecommended
	case RoleNavigationModeRecommended, RoleNavigationModeCustom:
	default:
		return RoleNavigationSettings{}, ErrBadParam
	}

	normalizedPaths, err := normalizeRolePrimaryMenuPaths(primaryMenuPaths)
	if err != nil {
		return RoleNavigationSettings{}, err
	}
	if normalizedMode == RoleNavigationModeRecommended {
		if len(normalizedPaths) > 0 {
			return RoleNavigationSettings{}, ErrBadParam
		}
		return RoleNavigationSettings{
			Mode:             RoleNavigationModeRecommended,
			PrimaryMenuPaths: []string{},
		}, nil
	}
	if len(normalizedPaths) == 0 {
		return RoleNavigationSettings{}, ErrBadParam
	}
	return RoleNavigationSettings{
		Mode:             RoleNavigationModeCustom,
		PrimaryMenuPaths: normalizedPaths,
	}, nil
}

func NormalizePersistedRoleNavigationSettings(
	mode RoleNavigationMode,
	primaryMenuPaths []string,
) RoleNavigationSettings {
	settings, err := NormalizeRoleNavigationSettings(mode, primaryMenuPaths)
	if err == nil {
		return settings
	}
	return RoleNavigationSettings{
		Mode:             RoleNavigationModeRecommended,
		PrimaryMenuPaths: []string{},
	}
}

func normalizeRolePrimaryMenuPaths(values []string) ([]string, error) {
	if len(values) > MaxRolePrimaryMenuPaths {
		return nil, ErrBadParam
	}
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		path := strings.TrimSpace(value)
		if !isValidRolePrimaryMenuPath(path) {
			return nil, ErrBadParam
		}
		if _, exists := seen[path]; exists {
			return nil, ErrBadParam
		}
		seen[path] = struct{}{}
		out = append(out, path)
	}
	return out, nil
}

func isValidRolePrimaryMenuPath(path string) bool {
	if len(path) <= len("/erp/") || len(path) > 256 {
		return false
	}
	if !strings.HasPrefix(path, "/erp/") {
		return false
	}
	if _, fixed := fixedRoleNavigationPaths[path]; fixed {
		return false
	}
	knownPath := false
	for _, menu := range BuiltinAdminMenus() {
		if menu.Path == path {
			knownPath = true
			break
		}
	}
	if !knownPath {
		return false
	}
	for _, char := range strings.TrimPrefix(path, "/erp/") {
		if unicode.IsLower(char) || unicode.IsDigit(char) {
			continue
		}
		switch char {
		case '/', '-', '_':
			continue
		default:
			return false
		}
	}
	return true
}
