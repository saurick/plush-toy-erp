package biz

import "strings"

const (
	LifecycleScopeCurrent = "current"
	LifecycleScopeHistory = "history"
	LifecycleScopeAll     = "all"
)

// NormalizeLifecycleScope keeps the empty value as the legacy, unscoped list
// contract while validating the three explicit read-only lifecycle views.
func NormalizeLifecycleScope(value string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "", LifecycleScopeCurrent, LifecycleScopeHistory, LifecycleScopeAll:
		return normalized, true
	default:
		return "", false
	}
}

func LifecycleScopeAllowsStatus(scope, status string, current, history []string) bool {
	if status == "" || scope == "" || scope == LifecycleScopeAll {
		return true
	}
	for _, candidate := range LifecycleStatusesForScope(scope, current, history) {
		if candidate == status {
			return true
		}
	}
	return false
}

func LifecycleStatusesForScope(scope string, current, history []string) []string {
	switch scope {
	case LifecycleScopeCurrent:
		return current
	case LifecycleScopeHistory:
		return history
	default:
		return nil
	}
}

// LifecycleActiveState maps a master-data lifecycle view to its existing
// is_active truth. Empty/all do not add an active-state predicate.
func LifecycleActiveState(scope string) (bool, bool) {
	switch scope {
	case LifecycleScopeCurrent:
		return true, true
	case LifecycleScopeHistory:
		return false, true
	default:
		return false, false
	}
}
