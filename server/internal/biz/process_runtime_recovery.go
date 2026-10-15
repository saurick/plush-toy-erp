package biz

import (
	"context"
	"strings"
)

var processDomainCommandRecoveryBusinessRefTypes = map[string]string{
	ProcessKeyFinancePaymentApproval:      "finance_payment",
	ProcessKeyInventoryAdjustmentApproval: "inventory_operation",
	ProcessKeyProductionExceptionApproval: "production_exception_decision",
}

// GetProcessDomainCommandRecoveryContext applies the same scope policy used by
// the mutation. Recovery follows runtime evidence, so unselected graph branches
// do not make a current canonical instance unrecoverable.
func (uc *ProcessRuntimeUsecase) GetProcessDomainCommandRecoveryContext(
	ctx context.Context,
	processInstanceID int,
) (*ProcessInstance, []*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || processInstanceID <= 0 {
		return nil, nil, ErrBadParam
	}
	instance, err := uc.repo.GetProcessInstance(ctx, processInstanceID)
	if err != nil {
		return nil, nil, err
	}
	nodes, err := uc.repo.ListProcessNodeInstances(ctx, processInstanceID)
	if err != nil {
		return nil, nil, err
	}
	if err := validateProcessDomainCommandRecoveryScope(instance, nodes); err != nil {
		return nil, nil, err
	}
	return instance, nodes, nil
}

func (uc *ProcessRuntimeUsecase) RecoverCompensatedDomainCommand(
	ctx context.Context,
	in *ProcessDomainCommandRecovery,
	actorID int,
) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	normalized := *in
	normalized.Decision = strings.TrimSpace(normalized.Decision)
	normalized.ExpectedResultHash = strings.TrimSpace(normalized.ExpectedResultHash)
	normalized.ExpectedCompensationHash = strings.TrimSpace(normalized.ExpectedCompensationHash)
	if normalized.ProcessInstanceID <= 0 || normalized.ProcessNodeInstanceID <= 0 || normalized.ExpectedVersion <= 0 ||
		normalized.Decision == "" || len(normalized.Decision) > 64 ||
		len(normalized.ExpectedResultHash) != 64 || len(normalized.ExpectedCompensationHash) != 64 {
		return nil, ErrBadParam
	}
	if _, _, err := uc.GetProcessDomainCommandRecoveryContext(ctx, normalized.ProcessInstanceID); err != nil {
		return nil, err
	}
	hash, err := processCanonicalSHA256(map[string]any{
		"contract":                   "process.domain-command-recovery/v1",
		"process_instance_id":        normalized.ProcessInstanceID,
		"process_node_instance_id":   normalized.ProcessNodeInstanceID,
		"expected_version":           normalized.ExpectedVersion,
		"decision":                   normalized.Decision,
		"expected_result_hash":       normalized.ExpectedResultHash,
		"expected_compensation_hash": normalized.ExpectedCompensationHash,
	})
	if err != nil {
		return nil, err
	}
	normalized.RecoveryHash = hash
	repo, ok := uc.repo.(ProcessRuntimeCompensationRecoveryRepo)
	if !ok {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	return repo.RecoverProcessDomainCommandCompensation(ctx, &normalized, actorID)
}

func validateProcessDomainCommandRecoveryScope(instance *ProcessInstance, nodes []*ProcessNodeInstance) error {
	if instance == nil || instance.ID <= 0 || len(nodes) == 0 {
		return ErrProcessDomainCommandRecoveryRequired
	}
	expectedBusinessRefType, ok := processDomainCommandRecoveryBusinessRefTypes[strings.TrimSpace(instance.ProcessKey)]
	if !ok || strings.TrimSpace(instance.BusinessRefType) != expectedBusinessRefType || instance.BusinessRefID <= 0 {
		return ErrProcessDomainCommandRecoveryRequired
	}
	if instance.Status != ProcessStatusActive && instance.Status != ProcessStatusBlocked && instance.Status != ProcessStatusCompleted {
		return ErrProcessDomainCommandRecoveryRequired
	}
	for _, node := range nodes {
		if node == nil || node.ProcessInstanceID != instance.ID || node.Attempt <= 0 {
			return ErrProcessDomainCommandRecoveryRequired
		}
	}
	return nil
}

// ProcessRuntimePolicyUsesNonSequentialRouting remains available for callers
// that need to classify graph shape; recovery no longer rejects the whole
// instance merely because an immutable definition contains branches.
func ProcessRuntimePolicyUsesNonSequentialRouting(policy map[string]any) bool {
	for _, key := range []string{
		"branch_policy_key", "fan_out_node_keys", "join_node_key", "join_policy",
		"join_source_node_keys", "return_to_node_key", "return_outcomes", "return_max_attempts",
	} {
		if _, exists := policy[key]; exists {
			return true
		}
	}
	return false
}
