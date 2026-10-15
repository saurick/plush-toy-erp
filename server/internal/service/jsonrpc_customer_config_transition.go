package service

import (
	"strings"

	"server/internal/biz"
)

func customerConfigTransitionCheckInputFromParams(pm map[string]any) (biz.CustomerConfigTransitionCheckInput, bool) {
	allowed := map[string]struct{}{
		"action":                   {},
		"customer_key":             {},
		"target_revision":          {},
		"expected_config_hash":     {},
		"expected_product_version": {},
		"expected_active_revision": {},
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return biz.CustomerConfigTransitionCheckInput{}, false
		}
	}
	rawExpectedActiveRevision, exists := pm["expected_active_revision"]
	expectedActiveRevision, ok := rawExpectedActiveRevision.(string)
	if !exists || !ok {
		return biz.CustomerConfigTransitionCheckInput{}, false
	}
	in := biz.CustomerConfigTransitionCheckInput{
		Action:                 strings.TrimSpace(getString(pm, "action")),
		CustomerKey:            getString(pm, "customer_key"),
		TargetRevision:         strings.TrimSpace(getString(pm, "target_revision")),
		ExpectedConfigHash:     strings.TrimSpace(getString(pm, "expected_config_hash")),
		ExpectedProductVersion: strings.TrimSpace(getString(pm, "expected_product_version")),
		ExpectedActiveRevision: strings.TrimSpace(expectedActiveRevision),
	}
	if (in.Action != biz.CustomerConfigTransitionActivate && in.Action != biz.CustomerConfigTransitionRollback) ||
		in.TargetRevision == "" || in.ExpectedConfigHash == "" || in.ExpectedProductVersion == "" {
		return biz.CustomerConfigTransitionCheckInput{}, false
	}
	return in, true
}

type customerConfigTransitionMutationIdentity struct {
	CustomerKey            string
	TargetRevision         string
	ExpectedConfigHash     string
	ExpectedProductVersion string
	ExpectedActiveRevision string
}

func customerConfigTransitionMutationIdentityFromParams(
	pm map[string]any,
	action string,
) (customerConfigTransitionMutationIdentity, bool) {
	revisionKey := "revision"
	if action == biz.CustomerConfigTransitionRollback {
		revisionKey = "target_revision"
	} else if action != biz.CustomerConfigTransitionActivate {
		return customerConfigTransitionMutationIdentity{}, false
	}
	allowed := map[string]struct{}{
		"customer_key":             {},
		revisionKey:                {},
		"expected_config_hash":     {},
		"expected_product_version": {},
		"expected_active_revision": {},
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return customerConfigTransitionMutationIdentity{}, false
		}
	}
	rawExpectedActiveRevision, exists := pm["expected_active_revision"]
	expectedActiveRevision, ok := rawExpectedActiveRevision.(string)
	if !exists || !ok {
		return customerConfigTransitionMutationIdentity{}, false
	}
	in := customerConfigTransitionMutationIdentity{
		CustomerKey:            getString(pm, "customer_key"),
		TargetRevision:         strings.TrimSpace(getString(pm, revisionKey)),
		ExpectedConfigHash:     strings.TrimSpace(getString(pm, "expected_config_hash")),
		ExpectedProductVersion: strings.TrimSpace(getString(pm, "expected_product_version")),
		ExpectedActiveRevision: strings.TrimSpace(expectedActiveRevision),
	}
	if in.TargetRevision == "" || in.ExpectedConfigHash == "" || in.ExpectedProductVersion == "" {
		return customerConfigTransitionMutationIdentity{}, false
	}
	return in, true
}

func customerConfigTransitionCheckToMap(check *biz.CustomerConfigTransitionCheck) map[string]any {
	if check == nil {
		return map[string]any{}
	}
	blockers := make([]any, 0, len(check.Blockers))
	for _, blocker := range check.Blockers {
		blockers = append(blockers, map[string]any{
			"code":       blocker.Code,
			"scope_type": blocker.ScopeType,
			"scope_keys": toAnySliceString(blocker.ScopeKeys),
			"count":      blocker.Count,
		})
	}
	return map[string]any{
		"action":                   check.Action,
		"customer_key":             check.CustomerKey,
		"target_revision":          check.TargetRevision,
		"target_config_hash":       check.TargetConfigHash,
		"target_product_version":   check.TargetProductVersion,
		"expected_active_revision": check.ExpectedActiveRevision,
		"observed_active_revision": check.ObservedActiveRevision,
		"allowed":                  check.Allowed,
		"noop":                     check.Noop,
		"blockers":                 blockers,
	}
}
