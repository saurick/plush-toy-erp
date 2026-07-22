package biz

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
)

const (
	CustomerConfigTransitionActivate = "activate"
	CustomerConfigTransitionRollback = "rollback"
)

var (
	ErrCustomerConfigTransitionBlocked      = errors.New("customer config transition blocked")
	ErrCustomerConfigActiveRevisionChanged  = errors.New("customer config active revision changed")
	ErrCustomerConfigProductVersionMismatch = errors.New("customer config product version mismatch")
)

type CustomerConfigTransitionCheckInput struct {
	Action                 string
	CustomerKey            string
	TargetRevision         string
	ExpectedConfigHash     string
	ExpectedProductVersion string
	ExpectedActiveRevision string
}

type CustomerConfigTransitionBlocker struct {
	Code      string
	ScopeType string
	ScopeKeys []string
	Count     int
}

type CustomerConfigTransitionCheck struct {
	Action                 string
	CustomerKey            string
	TargetRevision         string
	TargetConfigHash       string
	TargetProductVersion   string
	ExpectedActiveRevision string
	ObservedActiveRevision string
	Allowed                bool
	Noop                   bool
	Blockers               []CustomerConfigTransitionBlocker
}

// CheckCustomerConfigTransition is a read-only preflight. The mutation still
// has to repeat the target identity and active-revision comparison while all
// customer revisions are locked in one transaction.
func (uc *CustomerConfigUsecase) CheckCustomerConfigTransition(
	ctx context.Context,
	in CustomerConfigTransitionCheckInput,
) (*CustomerConfigTransitionCheck, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	action := strings.TrimSpace(in.Action)
	customerKey := NormalizeCustomerKey(in.CustomerKey)
	targetRevision := strings.TrimSpace(in.TargetRevision)
	expectedProductVersion := strings.TrimSpace(in.ExpectedProductVersion)
	expectedActiveRevision := strings.TrimSpace(in.ExpectedActiveRevision)
	expectedConfigHash, err := normalizeCustomerConfigHash(in.ExpectedConfigHash)
	if err != nil ||
		(action != CustomerConfigTransitionActivate && action != CustomerConfigTransitionRollback) ||
		customerKey == "" || targetRevision == "" || expectedProductVersion == "" {
		return nil, ErrBadParam
	}

	out := &CustomerConfigTransitionCheck{
		Action:                 action,
		CustomerKey:            customerKey,
		TargetRevision:         targetRevision,
		ExpectedActiveRevision: expectedActiveRevision,
		Blockers:               []CustomerConfigTransitionBlocker{},
	}
	target, err := uc.repo.GetCustomerConfigRevision(ctx, customerKey, targetRevision)
	if err != nil {
		if errors.Is(err, ErrCustomerConfigNotFound) {
			out.addBlocker("target_revision_not_found", "revision", []string{targetRevision}, 0)
			return out.finalize(), nil
		}
		return nil, err
	}
	out.TargetConfigHash = target.ConfigHash
	out.TargetProductVersion = target.ProductVersion
	if NormalizeCustomerKey(target.CustomerKey) != customerKey {
		out.addBlocker("target_customer_mismatch", "revision", []string{targetRevision}, 0)
	}
	if target.ConfigHash != expectedConfigHash {
		out.addBlocker("target_config_hash_mismatch", "revision", []string{targetRevision}, 0)
	}
	if strings.TrimSpace(target.ProductVersion) != expectedProductVersion {
		out.addBlocker("target_product_version_mismatch", "revision", []string{targetRevision}, 0)
	}
	if target.ConfigHashVersion != CustomerConfigHashVersion {
		out.addBlocker("target_config_hash_version_invalid", "revision", []string{targetRevision}, 0)
	}
	if !customerConfigTransitionTargetStatusAllowed(action, target) {
		code := "target_status_invalid"
		if action == CustomerConfigTransitionRollback && target.Status == CustomerConfigStatusPublished {
			code = "rollback_target_not_activated"
		}
		out.addBlocker(code, "revision", []string{targetRevision}, 0)
	}

	active, err := uc.repo.GetActiveCustomerConfigRevision(ctx, customerKey)
	if err != nil && !errors.Is(err, ErrCustomerConfigNotFound) {
		return nil, err
	}
	if err == nil && active != nil {
		out.ObservedActiveRevision = strings.TrimSpace(active.Revision)
	}
	if action == CustomerConfigTransitionRollback && out.ObservedActiveRevision == "" {
		out.addBlocker("rollback_active_revision_required", "revision", nil, 0)
	}
	if out.ObservedActiveRevision != expectedActiveRevision {
		out.addBlocker(
			"active_revision_changed",
			"revision",
			normalizeStringList([]string{expectedActiveRevision, out.ObservedActiveRevision}),
			0,
		)
	}

	targetModules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, targetRevision)
	if err != nil {
		return nil, err
	}
	if err := ValidateCustomerConfigModuleClosure(targetModules); err != nil {
		out.addBlocker("target_module_closure_invalid", "module", nil, 0)
	}
	if active == nil || out.ObservedActiveRevision == "" || out.ObservedActiveRevision == targetRevision {
		out.Noop = out.ObservedActiveRevision == targetRevision && len(out.Blockers) == 0
		return out.finalize(), nil
	}

	activeModules, err := uc.repo.ListDeploymentModuleStates(ctx, customerKey, active.Revision)
	if err != nil {
		return nil, err
	}
	disabledModules := customerConfigTransitionDisabledModules(activeModules, targetModules)
	if len(disabledModules) > 0 {
		count, err := uc.repo.CountOpenBusinessDocumentsByModules(ctx, customerKey, disabledModules)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			out.addBlocker("open_business_documents_for_disabled_modules", "module", disabledModules, count)
		}
	}

	changedProcessKeys := customerConfigTransitionChangedProcessKeys(active.CompiledSnapshot, target.CompiledSnapshot)
	if len(changedProcessKeys) > 0 {
		count, err := uc.repo.CountInFlightProcessInstances(ctx, customerKey, active.Revision, changedProcessKeys)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			out.addBlocker("in_flight_processes_for_changed_contracts", "process", changedProcessKeys, count)
		}
	}

	responsibilityChanged, activePoolKeys, activeRoleKeys, err := uc.customerConfigTransitionResponsibilityChanged(
		ctx,
		customerKey,
		active.Revision,
		targetRevision,
	)
	if err != nil {
		return nil, err
	}
	if responsibilityChanged && (len(activePoolKeys) > 0 || len(activeRoleKeys) > 0) {
		count, err := uc.repo.CountOpenWorkflowTasksByResponsibilities(
			ctx,
			customerKey,
			active.Revision,
			activePoolKeys,
			activeRoleKeys,
		)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			responsibilityKeys := append(append([]string{}, activePoolKeys...), activeRoleKeys...)
			out.addBlocker("open_workflow_tasks_for_changed_responsibility", "responsibility", responsibilityKeys, count)
		}
	}
	return out.finalize(), nil
}

func (out *CustomerConfigTransitionCheck) addBlocker(code, scopeType string, scopeKeys []string, count int) {
	if out == nil {
		return
	}
	out.Blockers = append(out.Blockers, CustomerConfigTransitionBlocker{
		Code:      code,
		ScopeType: scopeType,
		ScopeKeys: normalizeStringList(scopeKeys),
		Count:     count,
	})
}

func (out *CustomerConfigTransitionCheck) finalize() *CustomerConfigTransitionCheck {
	if out == nil {
		return nil
	}
	sort.SliceStable(out.Blockers, func(i, j int) bool {
		if out.Blockers[i].Code == out.Blockers[j].Code {
			return strings.Join(out.Blockers[i].ScopeKeys, "\x00") < strings.Join(out.Blockers[j].ScopeKeys, "\x00")
		}
		return out.Blockers[i].Code < out.Blockers[j].Code
	})
	out.Allowed = len(out.Blockers) == 0
	return out
}

func customerConfigTransitionTargetStatusAllowed(action string, target *CustomerConfigRevision) bool {
	if target == nil {
		return false
	}
	switch action {
	case CustomerConfigTransitionActivate:
		return target.Status == CustomerConfigStatusPublished ||
			(target.Status == CustomerConfigStatusActive && target.ActivatedAt != nil)
	case CustomerConfigTransitionRollback:
		return target.Status == CustomerConfigStatusSuperseded &&
			target.ActivatedAt != nil
	default:
		return false
	}
}

func customerConfigTransitionDisabledModules(active, target []DeploymentModuleStateInput) []string {
	activeStates := map[string]string{}
	for _, item := range active {
		activeStates[normalizeModuleKey(item.ModuleKey)] = strings.TrimSpace(item.State)
	}
	targetStates := map[string]string{}
	for _, item := range target {
		targetStates[normalizeModuleKey(item.ModuleKey)] = strings.TrimSpace(item.State)
	}
	out := []string{}
	for moduleKey, activeState := range activeStates {
		if activeState != "enabled" && activeState != "read_only" {
			continue
		}
		targetState := targetStates[moduleKey]
		if targetState == "enabled" || targetState == "read_only" {
			continue
		}
		out = append(out, moduleKey)
	}
	return normalizeStringList(out)
}

func customerConfigTransitionChangedProcessKeys(active, target map[string]any) []string {
	activeDefinitions := customerConfigTransitionProcessDefinitions(active)
	targetDefinitions := customerConfigTransitionProcessDefinitions(target)
	keys := make([]string, 0, len(activeDefinitions)+len(targetDefinitions))
	for key := range activeDefinitions {
		keys = append(keys, key)
	}
	for key := range targetDefinitions {
		keys = append(keys, key)
	}
	keys = normalizeStringList(keys)
	changed := []string{}
	for _, key := range keys {
		activePayload, activeOK := activeDefinitions[key]
		targetPayload, targetOK := targetDefinitions[key]
		if !activeOK || !targetOK || !bytes.Equal(activePayload, targetPayload) {
			changed = append(changed, key)
		}
	}
	return changed
}

func customerConfigTransitionProcessDefinitions(snapshot map[string]any) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	if len(snapshot) == 0 {
		return out
	}
	raw, ok := snapshot["processDefinitions"].(map[string]any)
	if !ok {
		return out
	}
	for processKey, definition := range raw {
		processKey = strings.TrimSpace(processKey)
		payload, err := json.Marshal(definition)
		if processKey == "" || err != nil {
			continue
		}
		out[processKey] = payload
	}
	return out
}

type customerConfigTransitionResponsibility struct {
	RoleProfiles        []json.RawMessage `json:"role_profiles"`
	WorkPools           []json.RawMessage `json:"work_pools"`
	WorkPoolMemberships []json.RawMessage `json:"work_pool_memberships"`
}

func (uc *CustomerConfigUsecase) customerConfigTransitionResponsibilityChanged(
	ctx context.Context,
	customerKey, activeRevision, targetRevision string,
) (bool, []string, []string, error) {
	active, activePools, activeRoles, err := uc.loadCustomerConfigTransitionResponsibility(ctx, customerKey, activeRevision)
	if err != nil {
		return false, nil, nil, err
	}
	target, _, _, err := uc.loadCustomerConfigTransitionResponsibility(ctx, customerKey, targetRevision)
	if err != nil {
		return false, nil, nil, err
	}
	activePayload, err := json.Marshal(active)
	if err != nil {
		return false, nil, nil, err
	}
	targetPayload, err := json.Marshal(target)
	if err != nil {
		return false, nil, nil, err
	}
	return !bytes.Equal(activePayload, targetPayload), activePools, activeRoles, nil
}

func (uc *CustomerConfigUsecase) loadCustomerConfigTransitionResponsibility(
	ctx context.Context,
	customerKey, revision string,
) (customerConfigTransitionResponsibility, []string, []string, error) {
	roles, err := uc.repo.ListRoleProfiles(ctx, customerKey, revision)
	if err != nil {
		return customerConfigTransitionResponsibility{}, nil, nil, err
	}
	roleKeys := []string{}
	for _, item := range roles {
		roleKeys = append(roleKeys, item.RoleKey)
	}
	pools, err := uc.repo.ListWorkPools(ctx, customerKey, revision)
	if err != nil {
		return customerConfigTransitionResponsibility{}, nil, nil, err
	}
	poolKeys := []string{}
	for _, item := range pools {
		poolKeys = append(poolKeys, item.PoolKey)
	}
	poolKeys = normalizeStringList(poolKeys)
	memberships, err := uc.repo.ListWorkPoolMembershipsByPools(ctx, customerKey, revision, poolKeys)
	if err != nil {
		return customerConfigTransitionResponsibility{}, nil, nil, err
	}
	canonicalRoles, err := canonicalCustomerConfigList(roles)
	if err != nil {
		return customerConfigTransitionResponsibility{}, nil, nil, err
	}
	canonicalPools, err := canonicalCustomerConfigList(pools)
	if err != nil {
		return customerConfigTransitionResponsibility{}, nil, nil, err
	}
	canonicalMemberships, err := canonicalCustomerConfigList(memberships)
	if err != nil {
		return customerConfigTransitionResponsibility{}, nil, nil, err
	}
	return customerConfigTransitionResponsibility{
		RoleProfiles:        canonicalRoles,
		WorkPools:           canonicalPools,
		WorkPoolMemberships: canonicalMemberships,
	}, poolKeys, NormalizeAdminRoleKeys(roleKeys), nil
}
