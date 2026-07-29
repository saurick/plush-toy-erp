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
	Mode               RoleNavigationMode
	PrimaryMenuPaths   []string
	SecondaryMenuPaths []string
}

func NormalizeRoleNavigationSettings(
	mode RoleNavigationMode,
	primaryMenuPaths []string,
	secondaryMenuPaths []string,
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
	normalizedSecondaryPaths, err := normalizeRoleSecondaryMenuPaths(secondaryMenuPaths)
	if err != nil {
		return RoleNavigationSettings{}, err
	}
	primaryPathSet := make(map[string]struct{}, len(normalizedPaths))
	for _, path := range normalizedPaths {
		primaryPathSet[path] = struct{}{}
	}
	for _, path := range normalizedSecondaryPaths {
		if _, exists := primaryPathSet[path]; exists {
			return RoleNavigationSettings{}, ErrBadParam
		}
	}
	if normalizedMode == RoleNavigationModeRecommended {
		if len(normalizedPaths) > 0 || len(normalizedSecondaryPaths) > 0 {
			return RoleNavigationSettings{}, ErrBadParam
		}
		return RoleNavigationSettings{
			Mode:               RoleNavigationModeRecommended,
			PrimaryMenuPaths:   []string{},
			SecondaryMenuPaths: []string{},
		}, nil
	}
	if len(normalizedPaths) == 0 {
		return RoleNavigationSettings{}, ErrBadParam
	}
	return RoleNavigationSettings{
		Mode:               RoleNavigationModeCustom,
		PrimaryMenuPaths:   normalizedPaths,
		SecondaryMenuPaths: normalizedSecondaryPaths,
	}, nil
}

func NormalizePersistedRoleNavigationSettings(
	mode RoleNavigationMode,
	primaryMenuPaths []string,
	secondaryMenuPaths []string,
) RoleNavigationSettings {
	settings, err := NormalizeRoleNavigationSettings(mode, primaryMenuPaths, secondaryMenuPaths)
	if err == nil {
		return settings
	}
	return RoleNavigationSettings{
		Mode:               RoleNavigationModeRecommended,
		PrimaryMenuPaths:   []string{},
		SecondaryMenuPaths: []string{},
	}
}

func normalizeRolePrimaryMenuPaths(values []string) ([]string, error) {
	if len(values) > MaxRolePrimaryMenuPaths {
		return nil, ErrBadParam
	}
	return normalizeRoleMenuPaths(values)
}

func normalizeRoleSecondaryMenuPaths(values []string) ([]string, error) {
	if len(values) > len(BuiltinAdminMenus()) {
		return nil, ErrBadParam
	}
	return normalizeRoleMenuPaths(values)
}

func normalizeRoleMenuPaths(values []string) ([]string, error) {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		path := strings.TrimSpace(value)
		if !isValidRoleNavigationMenuPath(path) {
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

// ValidateRoleNavigationPartition verifies that a custom layout assigns every
// currently effective, non-fixed page to exactly one destination. The layout
// remains only an ordering projection; runtime authorization must still
// intersect it with the effective page set on every request.
func ValidateRoleNavigationPartition(
	settings RoleNavigationSettings,
	effectivePagePaths []string,
) error {
	normalized, err := NormalizeRoleNavigationSettings(
		settings.Mode,
		settings.PrimaryMenuPaths,
		settings.SecondaryMenuPaths,
	)
	if err != nil {
		return err
	}
	if normalized.Mode == RoleNavigationModeRecommended {
		return nil
	}
	expected := make(map[string]struct{}, len(effectivePagePaths))
	for _, value := range effectivePagePaths {
		path := strings.TrimSpace(value)
		if isValidRoleNavigationMenuPath(path) {
			expected[path] = struct{}{}
		}
	}
	actual := make(map[string]struct{}, len(normalized.PrimaryMenuPaths)+len(normalized.SecondaryMenuPaths))
	for _, path := range normalized.PrimaryMenuPaths {
		actual[path] = struct{}{}
	}
	for _, path := range normalized.SecondaryMenuPaths {
		actual[path] = struct{}{}
	}
	if len(actual) != len(expected) {
		return ErrBadParam
	}
	for path := range expected {
		if _, exists := actual[path]; !exists {
			return ErrBadParam
		}
	}
	return nil
}

func isValidRoleNavigationMenuPath(path string) bool {
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
