package biz

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

func (uc *ProcessRuntimeUsecase) ExecuteDomainCommandNode(ctx context.Context, in *ProcessDomainCommandExecution, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessDomainCommandExecution(*in)
	if err != nil {
		return nil, err
	}
	instance, err := uc.repo.GetProcessInstance(ctx, normalized.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	node, err := uc.repo.GetProcessNodeInstance(ctx, normalized.ProcessNodeInstanceID)
	if err != nil {
		return nil, err
	}
	if node.ProcessInstanceID != instance.ID {
		return nil, ErrBadParam
	}
	if node.NodeType != ProcessNodeTypeDomainCommand {
		return nil, ErrBadParam
	}
	nodeCommandKey := processDomainCommandKeyFromNode(node)
	if nodeCommandKey == "" {
		return nil, ErrBadParam
	}
	if normalized.CommandKey != "" && normalized.CommandKey != nodeCommandKey {
		if node.Status != ProcessNodeStatusActive {
			return nil, ErrIdempotencyConflict
		}
		return nil, ErrBadParam
	}
	handler := uc.domainCommandHandlers[nodeCommandKey]
	if normalizer, ok := handler.(ProcessDomainCommandPayloadNormalizer); ok {
		normalized.Payload, err = normalizer.NormalizeProcessDomainCommandPayload(normalized.Payload)
		if err != nil {
			return nil, err
		}
	}
	domainCommandFingerprint, err := processDomainCommandFingerprint(nodeCommandKey, normalized.IdempotencyKey, normalized.Payload)
	if err != nil {
		return nil, err
	}
	if node.Status != ProcessNodeStatusActive {
		return uc.reconcileSettledDomainCommandNode(ctx, node, normalized.ExpectedVersion, domainCommandFingerprint, actorID)
	}
	_, durableResultProtocol := uc.repo.(ProcessRuntimeDomainCommandResultRepo)
	if durableResultProtocol {
		if err := validateActiveProcessDomainCommandProtocol(node, domainCommandFingerprint); err != nil {
			return nil, err
		}
	} else if node.DomainCommandFingerprint != nil && *node.DomainCommandFingerprint != domainCommandFingerprint {
		return nil, ErrIdempotencyConflict
	}
	if node.Version != normalized.ExpectedVersion {
		return nil, ErrProcessNodeInstanceConflict
	}
	if storedNode, found, err := uc.getStoredProcessDomainCommandResult(ctx, node, domainCommandFingerprint); err != nil {
		return nil, err
	} else if found {
		return uc.settleActiveProcessDomainCommandResult(ctx, storedNode, domainCommandFingerprint, actorID)
	}
	if handler == nil {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	commandInput := &ProcessDomainCommandInput{
		ProcessInstance: instance,
		Node:            node,
		CommandKey:      nodeCommandKey,
		IdempotencyKey:  normalized.IdempotencyKey,
		Payload:         normalized.Payload,
	}
	if err := handler.ValidateProcessDomainCommand(ctx, commandInput, actorID); err != nil {
		return nil, err
	}
	claimedNode, err := uc.repo.ClaimProcessNodeDomainCommand(ctx, &ProcessNodeDomainCommandClaim{
		ProcessInstanceID:        node.ProcessInstanceID,
		ProcessNodeInstanceID:    node.ID,
		ExpectedVersion:          node.Version,
		DomainCommandFingerprint: domainCommandFingerprint,
	})
	if err != nil {
		return nil, err
	}
	if claimedNode == nil {
		return nil, ErrProcessNodeInstanceNotFound
	}
	if claimedNode.ProcessInstanceID != node.ProcessInstanceID {
		return nil, ErrProcessNodeInstanceConflict
	}
	if claimedNode.DomainCommandFingerprint == nil || *claimedNode.DomainCommandFingerprint != domainCommandFingerprint {
		return nil, ErrIdempotencyConflict
	}
	if durableResultProtocol && (claimedNode.DomainCommandProtocolVersion == nil || *claimedNode.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent) {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	if claimedNode.Status != ProcessNodeStatusActive {
		return uc.reconcileSettledDomainCommandNode(
			ctx, claimedNode, node.Version, domainCommandFingerprint, actorID,
		)
	}
	if claimedNode.Version != node.Version {
		return nil, ErrProcessNodeInstanceConflict
	}
	node = claimedNode
	commandInput.Node = node
	if storedNode, found, err := uc.getStoredProcessDomainCommandResult(ctx, node, domainCommandFingerprint); err != nil {
		return nil, err
	} else if found {
		return uc.settleActiveProcessDomainCommandResult(ctx, storedNode, domainCommandFingerprint, actorID)
	}
	result, err := handler.ExecuteProcessDomainCommand(ctx, commandInput, actorID)
	if err != nil {
		return nil, err
	}
	if resultRepo, ok := uc.repo.(ProcessRuntimeDomainCommandResultRepo); ok {
		record, err := processDomainCommandResultRecord(node, nodeCommandKey, domainCommandFingerprint, result)
		if err != nil {
			return nil, err
		}
		if _, err := resultRepo.RecordProcessNodeDomainCommandResult(ctx, record, actorID); err != nil {
			return nil, err
		}
		storedNode, found, err := resultRepo.GetProcessNodeDomainCommandResult(ctx, node.ProcessInstanceID, node.ID, domainCommandFingerprint)
		if err != nil {
			return nil, err
		}
		if !found || storedNode == nil {
			return nil, ErrProcessDomainCommandRecoveryRequired
		}
		return uc.settleActiveProcessDomainCommandResult(ctx, storedNode, domainCommandFingerprint, actorID)
	}
	outcome := nodeCommandKey
	if result != nil && strings.TrimSpace(result.Outcome) != "" {
		outcome = strings.TrimSpace(result.Outcome)
	}
	if result != nil && strings.TrimSpace(result.BlockReason) != "" {
		blockedNode, blockErr := uc.blockActiveProcessNodeInstance(ctx, &ProcessNodeInstanceBlock{
			ProcessInstanceID:        node.ProcessInstanceID,
			ProcessNodeInstanceID:    node.ID,
			ExpectedVersion:          node.Version,
			Reason:                   strings.TrimSpace(result.BlockReason),
			Outcome:                  outcome,
			DomainCommandFingerprint: &domainCommandFingerprint,
		}, actorID)
		if blockErr == nil {
			return blockedNode, nil
		}
		return uc.reconcileConcurrentDomainCommandSettlement(
			ctx, node, ProcessNodeStatusBlocked, outcome, domainCommandFingerprint, blockErr, actorID,
		)
	}
	if result != nil {
		for _, ref := range result.LinkedBusinessRefs {
			normalizedRef, err := normalizeProcessBusinessRef(ref)
			if err != nil {
				return nil, err
			}
			if _, err := uc.repo.RecordProcessInstanceLinkedBusinessRef(ctx, &ProcessInstanceLinkedBusinessRefRecord{
				ProcessInstanceID: normalized.ProcessInstanceID,
				RefType:           normalizedRef.RefType,
				RefID:             normalizedRef.RefID,
				RefNo:             normalizedRef.RefNo,
				SourceNodeKey:     node.NodeKey,
				SourceCommandKey:  nodeCommandKey,
			}, actorID); err != nil {
				return nil, err
			}
		}
	}
	completedNode, err := uc.repo.CompleteProcessNodeInstance(ctx, &ProcessNodeInstanceComplete{
		ID:                       node.ID,
		ProcessInstanceID:        node.ProcessInstanceID,
		ExpectedVersion:          node.Version,
		Outcome:                  outcome,
		DomainCommandFingerprint: &domainCommandFingerprint,
	}, actorID)
	if err != nil {
		return uc.reconcileConcurrentDomainCommandSettlement(
			ctx, node, ProcessNodeStatusCompleted, outcome, domainCommandFingerprint, err, actorID,
		)
	}
	if err := uc.advanceAfterNodeCompletion(ctx, completedNode, actorID); err != nil {
		return nil, err
	}
	return completedNode, nil
}

func validateActiveProcessDomainCommandProtocol(node *ProcessNodeInstance, fingerprint string) error {
	if node == nil || node.NodeType != ProcessNodeTypeDomainCommand || node.Status != ProcessNodeStatusActive || strings.TrimSpace(fingerprint) == "" {
		return ErrBadParam
	}
	if node.DomainCommandFingerprint == nil {
		if node.DomainCommandProtocolVersion != nil || node.DomainCommandResultHash != nil {
			return ErrProcessDomainCommandRecoveryRequired
		}
		return nil
	}
	if *node.DomainCommandFingerprint == strings.Repeat("0", 64) ||
		node.DomainCommandProtocolVersion == nil ||
		*node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent {
		return ErrProcessDomainCommandRecoveryRequired
	}
	if *node.DomainCommandFingerprint != fingerprint {
		return ErrIdempotencyConflict
	}
	return nil
}

func validateSettledProcessDomainCommandProtocol(node *ProcessNodeInstance, fingerprint string) error {
	if node == nil || node.NodeType != ProcessNodeTypeDomainCommand || len(fingerprint) != 64 {
		return ErrBadParam
	}
	if node.Status != ProcessNodeStatusCompleted && node.Status != ProcessNodeStatusBlocked {
		return ErrProcessNodeInstanceNotActive
	}
	if node.DomainCommandFingerprint == nil || *node.DomainCommandFingerprint != fingerprint {
		return ErrIdempotencyConflict
	}
	if node.DomainCommandProtocolVersion == nil || *node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent ||
		node.DomainCommandResultRecordedAt == nil {
		return ErrProcessDomainCommandRecoveryRequired
	}
	result, err := processDomainCommandResultFromNode(node)
	if err != nil || strings.TrimSpace(result.Outcome) == "" {
		return ErrProcessDomainCommandRecoveryRequired
	}

	compensated := node.DomainCommandEffectState != nil && *node.DomainCommandEffectState == ProcessDomainCommandEffectStateCompensated
	hasCompensationEvidence := node.DomainCommandCompensation != nil || node.DomainCommandCompensationHash != nil || node.DomainCommandCompensatedAt != nil
	if compensated {
		if node.DomainCommandCompensation == nil || node.DomainCommandCompensationHash == nil || node.DomainCommandCompensatedAt == nil {
			return ErrProcessDomainCommandRecoveryRequired
		}
		compensationHash, err := processCanonicalSHA256(node.DomainCommandCompensation)
		if err != nil || compensationHash != *node.DomainCommandCompensationHash {
			return ErrProcessDomainCommandRecoveryRequired
		}
		if node.Status == ProcessNodeStatusBlocked && !processNodeOutcomeMatches(node, "domain_command.compensated") {
			return ErrProcessDomainCommandRecoveryRequired
		}
		return nil
	}
	if hasCompensationEvidence {
		return ErrProcessDomainCommandRecoveryRequired
	}

	switch node.Status {
	case ProcessNodeStatusCompleted:
		if node.DomainCommandResultState == nil || *node.DomainCommandResultState != ProcessDomainCommandResultStateSucceeded ||
			strings.TrimSpace(result.BlockReason) != "" || !processNodeOutcomeMatches(node, result.Outcome) {
			return ErrProcessDomainCommandRecoveryRequired
		}
	case ProcessNodeStatusBlocked:
		if node.DomainCommandResultState == nil || *node.DomainCommandResultState != ProcessDomainCommandResultStateBlocked ||
			strings.TrimSpace(result.BlockReason) == "" || !processNodeOutcomeMatches(node, result.Outcome) {
			return ErrProcessDomainCommandRecoveryRequired
		}
	default:
		return ErrProcessNodeInstanceNotActive
	}
	return nil
}

func (uc *ProcessRuntimeUsecase) getStoredProcessDomainCommandResult(
	ctx context.Context,
	node *ProcessNodeInstance,
	fingerprint string,
) (*ProcessNodeInstance, bool, error) {
	if uc == nil || uc.repo == nil || node == nil {
		return nil, false, ErrBadParam
	}
	resultRepo, ok := uc.repo.(ProcessRuntimeDomainCommandResultRepo)
	if !ok {
		return nil, false, nil
	}
	return resultRepo.GetProcessNodeDomainCommandResult(ctx, node.ProcessInstanceID, node.ID, fingerprint)
}

func (uc *ProcessRuntimeUsecase) settleActiveProcessDomainCommandResult(
	ctx context.Context,
	node *ProcessNodeInstance,
	fingerprint string,
	actorID int,
) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || node == nil {
		return nil, ErrBadParam
	}
	if node.Status != ProcessNodeStatusActive {
		if node.Version <= 1 {
			return nil, ErrProcessNodeInstanceConflict
		}
		return uc.reconcileSettledDomainCommandNode(ctx, node, node.Version-1, fingerprint, actorID)
	}
	result, err := processDomainCommandResultFromNode(node)
	if err != nil {
		return nil, err
	}
	outcome := strings.TrimSpace(result.Outcome)
	if outcome == "" {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	blockedReason := strings.TrimSpace(result.BlockReason)
	if node.DomainCommandEffectState != nil && *node.DomainCommandEffectState == ProcessDomainCommandEffectStateCompensated {
		outcome = "domain_command.compensated"
		blockedReason = processDomainCommandCompensationReason(node)
	}
	if blockedReason != "" {
		blockedNode, blockErr := uc.blockActiveProcessNodeInstance(ctx, &ProcessNodeInstanceBlock{
			ProcessInstanceID:        node.ProcessInstanceID,
			ProcessNodeInstanceID:    node.ID,
			ExpectedVersion:          node.Version,
			Reason:                   blockedReason,
			Outcome:                  outcome,
			DomainCommandFingerprint: &fingerprint,
		}, actorID)
		if blockErr == nil {
			return blockedNode, nil
		}
		return uc.reconcileConcurrentDomainCommandSettlement(
			ctx, node, ProcessNodeStatusBlocked, outcome, fingerprint, blockErr, actorID,
		)
	}
	if node.DomainCommandResultState == nil || *node.DomainCommandResultState != ProcessDomainCommandResultStateSucceeded {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	for _, ref := range result.LinkedBusinessRefs {
		normalizedRef, err := normalizeProcessBusinessRef(ref)
		if err != nil {
			return nil, err
		}
		if _, err := uc.repo.RecordProcessInstanceLinkedBusinessRef(ctx, &ProcessInstanceLinkedBusinessRefRecord{
			ProcessInstanceID: node.ProcessInstanceID,
			RefType:           normalizedRef.RefType,
			RefID:             normalizedRef.RefID,
			RefNo:             normalizedRef.RefNo,
			SourceNodeKey:     node.NodeKey,
			SourceCommandKey:  processDomainCommandKeyFromNode(node),
		}, actorID); err != nil {
			return nil, err
		}
	}
	completedNode, err := uc.repo.CompleteProcessNodeInstance(ctx, &ProcessNodeInstanceComplete{
		ID:                               node.ID,
		ProcessInstanceID:                node.ProcessInstanceID,
		ExpectedVersion:                  node.Version,
		Outcome:                          outcome,
		DomainCommandFingerprint:         &fingerprint,
		ExpectedDomainCommandResultHash:  node.DomainCommandResultHash,
		ExpectedDomainCommandEffectState: node.DomainCommandEffectState,
	}, actorID)
	if err != nil {
		return uc.reconcileConcurrentDomainCommandSettlement(
			ctx, node, ProcessNodeStatusCompleted, outcome, fingerprint, err, actorID,
		)
	}
	if err := uc.advanceAfterNodeCompletion(ctx, completedNode, actorID); err != nil {
		return nil, err
	}
	return completedNode, nil
}

func processDomainCommandResultRecord(
	node *ProcessNodeInstance,
	commandKey string,
	fingerprint string,
	result *ProcessDomainCommandResult,
) (*ProcessNodeDomainCommandResultRecord, error) {
	if node == nil || node.ID <= 0 || node.ProcessInstanceID <= 0 || node.Version <= 0 || strings.TrimSpace(commandKey) == "" || len(fingerprint) != 64 {
		return nil, ErrBadParam
	}
	if result == nil {
		result = &ProcessDomainCommandResult{}
	}
	outcome := strings.TrimSpace(result.Outcome)
	if outcome == "" {
		outcome = strings.TrimSpace(commandKey)
	}
	blockReason := strings.TrimSpace(result.BlockReason)
	resultState := ProcessDomainCommandResultStateSucceeded
	effectState := strings.TrimSpace(result.EffectState)
	if blockReason != "" {
		resultState = ProcessDomainCommandResultStateBlocked
		if effectState == "" {
			effectState = ProcessDomainCommandEffectStateNone
		}
	} else if effectState == "" {
		effectState = ProcessDomainCommandEffectStateUnknown
	}
	if !IsValidProcessDomainCommandEffectState(effectState) {
		return nil, ErrBadParam
	}
	refs := make([]ProcessBusinessRef, 0, len(result.LinkedBusinessRefs))
	for _, ref := range result.LinkedBusinessRefs {
		normalized, err := normalizeProcessBusinessRef(ref)
		if err != nil {
			return nil, err
		}
		refs = append(refs, normalized)
	}
	sort.Slice(refs, func(i, j int) bool {
		if refs[i].RefType != refs[j].RefType {
			return refs[i].RefType < refs[j].RefType
		}
		if refs[i].RefID != refs[j].RefID {
			return refs[i].RefID < refs[j].RefID
		}
		return processOptionalStringValue(refs[i].RefNo) < processOptionalStringValue(refs[j].RefNo)
	})
	linkedRefs := make([]map[string]any, 0, len(refs))
	for _, ref := range refs {
		item := map[string]any{"ref_type": ref.RefType, "ref_id": ref.RefID}
		if ref.RefNo != nil {
			item["ref_no"] = *ref.RefNo
		}
		linkedRefs = append(linkedRefs, item)
	}
	var effectRefType *string
	var effectRefID *int
	if result.EffectRef != nil {
		normalized, err := normalizeProcessBusinessRef(*result.EffectRef)
		if err != nil {
			return nil, err
		}
		effectRefType = &normalized.RefType
		effectRefID = &normalized.RefID
	}
	payload := map[string]any{
		"outcome":              outcome,
		"block_reason":         blockReason,
		"linked_business_refs": linkedRefs,
		"effect_state":         effectState,
		"result_version":       1,
	}
	hash, err := processCanonicalSHA256(struct {
		ResultState   string         `json:"result_state"`
		Result        map[string]any `json:"result"`
		EffectRefType *string        `json:"effect_ref_type,omitempty"`
		EffectRefID   *int           `json:"effect_ref_id,omitempty"`
	}{resultState, payload, effectRefType, effectRefID})
	if err != nil {
		return nil, err
	}
	return &ProcessNodeDomainCommandResultRecord{
		ProcessInstanceID:        node.ProcessInstanceID,
		ProcessNodeInstanceID:    node.ID,
		ExpectedVersion:          node.Version,
		DomainCommandFingerprint: fingerprint,
		ProtocolVersion:          ProcessDomainCommandProtocolVersionCurrent,
		ResultState:              resultState,
		Result:                   payload,
		ResultHash:               hash,
		EffectState:              effectState,
		EffectRefType:            effectRefType,
		EffectRefID:              effectRefID,
	}, nil
}

// BuildProcessNodeDomainCommandResultRecord lets a domain repository persist
// the command outcome in the same database transaction as its business side
// effect. The immutable fingerprint is recomputed from the claimed input so a
// repository cannot accidentally bind a result to a different intent.
func BuildProcessNodeDomainCommandResultRecord(
	in *ProcessDomainCommandInput,
	result *ProcessDomainCommandResult,
) (*ProcessNodeDomainCommandResultRecord, error) {
	if in == nil || in.Node == nil {
		return nil, ErrBadParam
	}
	fingerprint, err := processDomainCommandFingerprint(in.CommandKey, in.IdempotencyKey, in.Payload)
	if err != nil {
		return nil, err
	}
	if in.Node.DomainCommandFingerprint == nil || *in.Node.DomainCommandFingerprint != fingerprint {
		return nil, ErrIdempotencyConflict
	}
	if in.Node.DomainCommandProtocolVersion == nil || *in.Node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	return processDomainCommandResultRecord(in.Node, in.CommandKey, fingerprint, result)
}

// BuildProcessNodeDomainCommandCompensationMark creates deterministic evidence
// for a later cancellation or reversal of an already-recorded domain effect.
func BuildProcessNodeDomainCommandCompensationMark(
	node *ProcessNodeInstance,
	reason string,
) (*ProcessNodeDomainCommandCompensationMark, error) {
	if node == nil || node.ID <= 0 || node.ProcessInstanceID <= 0 || node.Version <= 0 ||
		node.DomainCommandFingerprint == nil || len(*node.DomainCommandFingerprint) != 64 ||
		node.DomainCommandProtocolVersion == nil || *node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent ||
		node.DomainCommandResultHash == nil || len(*node.DomainCommandResultHash) != 64 ||
		node.DomainCommandEffectRefType == nil || node.DomainCommandEffectRefID == nil || *node.DomainCommandEffectRefID <= 0 {
		return nil, ErrBadParam
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, ErrBadParam
	}
	compensation := map[string]any{
		"reason":           reason,
		"ref_type":         strings.TrimSpace(*node.DomainCommandEffectRefType),
		"ref_id":           *node.DomainCommandEffectRefID,
		"command_key":      processDomainCommandKeyFromNode(node),
		"evidence_version": 1,
	}
	if compensation["ref_type"] == "" || compensation["command_key"] == "" {
		return nil, ErrBadParam
	}
	hash, err := processCanonicalSHA256(compensation)
	if err != nil {
		return nil, err
	}
	return &ProcessNodeDomainCommandCompensationMark{
		ProcessInstanceID:        node.ProcessInstanceID,
		ProcessNodeInstanceID:    node.ID,
		ExpectedVersion:          node.Version,
		DomainCommandFingerprint: *node.DomainCommandFingerprint,
		ExpectedResultHash:       *node.DomainCommandResultHash,
		Compensation:             compensation,
		CompensationHash:         hash,
	}, nil
}

func processDomainCommandResultFromNode(node *ProcessNodeInstance) (*ProcessDomainCommandResult, error) {
	if node == nil || node.DomainCommandFingerprint == nil || node.DomainCommandResultState == nil || node.DomainCommandResultHash == nil || node.DomainCommandEffectState == nil || node.DomainCommandResult == nil {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	outcome, _ := node.DomainCommandResult["outcome"].(string)
	blockReason, _ := node.DomainCommandResult["block_reason"].(string)
	initialEffectState, _ := node.DomainCommandResult["effect_state"].(string)
	if !IsValidProcessDomainCommandEffectState(initialEffectState) || !IsValidProcessDomainCommandEffectState(*node.DomainCommandEffectState) {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	refs, err := processBusinessRefsFromStoredResult(node.DomainCommandResult["linked_business_refs"])
	if err != nil {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	result := &ProcessDomainCommandResult{
		Outcome:            strings.TrimSpace(outcome),
		BlockReason:        strings.TrimSpace(blockReason),
		LinkedBusinessRefs: refs,
		EffectState:        initialEffectState,
	}
	if node.DomainCommandEffectRefType != nil || node.DomainCommandEffectRefID != nil {
		if node.DomainCommandEffectRefType == nil || node.DomainCommandEffectRefID == nil {
			return nil, ErrProcessDomainCommandRecoveryRequired
		}
		result.EffectRef = &ProcessBusinessRef{RefType: *node.DomainCommandEffectRefType, RefID: *node.DomainCommandEffectRefID}
	}
	record, err := processDomainCommandResultRecord(node, processDomainCommandKeyFromNode(node), *node.DomainCommandFingerprint, result)
	if err != nil || record.ResultState != *node.DomainCommandResultState || record.ResultHash != *node.DomainCommandResultHash {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	return result, nil
}

func processBusinessRefsFromStoredResult(raw any) ([]ProcessBusinessRef, error) {
	if raw == nil {
		return []ProcessBusinessRef{}, nil
	}
	items, ok := raw.([]any)
	if !ok {
		if typed, typedOK := raw.([]map[string]any); typedOK {
			items = make([]any, 0, len(typed))
			for _, item := range typed {
				items = append(items, item)
			}
		} else {
			return nil, ErrBadParam
		}
	}
	refs := make([]ProcessBusinessRef, 0, len(items))
	for _, rawItem := range items {
		item, ok := rawItem.(map[string]any)
		if !ok {
			return nil, ErrBadParam
		}
		refType, _ := item["ref_type"].(string)
		refID, found, err := processCommandPositiveIntFromPayload(item, "ref_id")
		if err != nil || !found {
			return nil, ErrBadParam
		}
		var refNo *string
		if value, ok := item["ref_no"].(string); ok && strings.TrimSpace(value) != "" {
			trimmed := strings.TrimSpace(value)
			refNo = &trimmed
		}
		ref, err := normalizeProcessBusinessRef(ProcessBusinessRef{RefType: refType, RefID: refID, RefNo: refNo})
		if err != nil {
			return nil, err
		}
		refs = append(refs, ref)
	}
	return refs, nil
}

func IsValidProcessDomainCommandResultState(value string) bool {
	switch value {
	case ProcessDomainCommandResultStateSucceeded, ProcessDomainCommandResultStateBlocked:
		return true
	default:
		return false
	}
}

func IsValidProcessDomainCommandEffectState(value string) bool {
	switch value {
	case ProcessDomainCommandEffectStateUnknown, ProcessDomainCommandEffectStateNone, ProcessDomainCommandEffectStateApplied, ProcessDomainCommandEffectStateCompensated:
		return true
	default:
		return false
	}
}

func processCanonicalSHA256(value any) (string, error) {
	canonical, err := json.Marshal(value)
	if err != nil {
		return "", ErrBadParam
	}
	sum := sha256.Sum256(canonical)
	return fmt.Sprintf("%x", sum), nil
}

func processOptionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func processDomainCommandCompensationReason(node *ProcessNodeInstance) string {
	if node != nil && node.DomainCommandCompensation != nil {
		if reason, ok := node.DomainCommandCompensation["reason"].(string); ok && strings.TrimSpace(reason) != "" {
			return strings.TrimSpace(reason)
		}
	}
	return "领域动作已取消或冲正，流程需要人工核对"
}

func (uc *ProcessRuntimeUsecase) reconcileConcurrentDomainCommandSettlement(
	ctx context.Context,
	claimedNode *ProcessNodeInstance,
	expectedStatus string,
	expectedOutcome string,
	domainCommandFingerprint string,
	settlementErr error,
	actorID int,
) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || claimedNode == nil || settlementErr == nil {
		return nil, ErrBadParam
	}
	if !errors.Is(settlementErr, ErrProcessNodeInstanceConflict) &&
		!errors.Is(settlementErr, ErrProcessNodeInstanceSettled) &&
		!errors.Is(settlementErr, ErrProcessNodeInstanceNotActive) &&
		!errors.Is(settlementErr, ErrProcessInstanceSettled) {
		return nil, settlementErr
	}
	current, err := uc.repo.GetProcessNodeInstance(ctx, claimedNode.ID)
	if err != nil {
		return nil, err
	}
	if current.ProcessInstanceID != claimedNode.ProcessInstanceID {
		return nil, ErrProcessNodeInstanceConflict
	}
	if current.DomainCommandFingerprint == nil || *current.DomainCommandFingerprint != domainCommandFingerprint {
		return nil, ErrIdempotencyConflict
	}
	if current.Version != claimedNode.Version+1 {
		return nil, settlementErr
	}
	if current.Status != expectedStatus || !processNodeOutcomeMatches(current, expectedOutcome) {
		return nil, ErrIdempotencyConflict
	}
	return uc.reconcileSettledDomainCommandNode(ctx, current, claimedNode.Version, domainCommandFingerprint, actorID)
}

func (uc *ProcessRuntimeUsecase) reconcileSettledDomainCommandNode(ctx context.Context, node *ProcessNodeInstance, expectedVersion int, domainCommandFingerprint string, actorID int) (*ProcessNodeInstance, error) {
	if uc == nil || uc.repo == nil || node == nil || expectedVersion <= 0 {
		return nil, ErrBadParam
	}
	if node.Version != expectedVersion+1 {
		return nil, ErrProcessNodeInstanceConflict
	}
	if node.DomainCommandFingerprint == nil || *node.DomainCommandFingerprint != domainCommandFingerprint {
		return nil, ErrIdempotencyConflict
	}
	if _, durableResultProtocol := uc.repo.(ProcessRuntimeDomainCommandResultRepo); !durableResultProtocol {
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	if err := validateSettledProcessDomainCommandProtocol(node, domainCommandFingerprint); err != nil {
		return nil, err
	}
	if node.Status == ProcessNodeStatusCompleted && node.NodeType == ProcessNodeTypeDomainCommand &&
		((node.DomainCommandEffectState != nil && *node.DomainCommandEffectState == ProcessDomainCommandEffectStateCompensated) ||
			node.DomainCommandCompensationHash != nil) {
		// The original command completed before its domain effect was cancelled.
		// Keep the compensation evidence, but never replay success or advance an
		// already-diverged downstream path without an explicit recovery decision.
		return nil, ErrProcessDomainCommandRecoveryRequired
	}
	switch node.Status {
	case ProcessNodeStatusCompleted:
		activatedNodes, err := uc.reconcileNextNodesAfterCompletion(ctx, node, "", actorID)
		if err != nil {
			return nil, err
		}
		for _, activatedNode := range activatedNodes {
			if err := uc.reconcileActivatedSequentialNode(ctx, activatedNode, actorID); err != nil {
				return nil, err
			}
		}
		return node, nil
	case ProcessNodeStatusBlocked:
		if err := uc.ensureRejectedProcessBlocked(ctx, node.ProcessInstanceID, actorID); err != nil {
			return nil, err
		}
		return node, nil
	default:
		return nil, ErrProcessNodeInstanceNotActive
	}
}
