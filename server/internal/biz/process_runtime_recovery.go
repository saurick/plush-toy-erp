package biz

import (
	"context"
	"strings"
)

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
