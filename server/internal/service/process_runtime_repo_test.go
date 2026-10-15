package service

import (
	"context"
	"time"

	"server/internal/biz"
)

var _ biz.ProcessRuntimeRepo = (*stubProcessRuntimeJSONRPCRepo)(nil)

func (s *stubProcessRuntimeJSONRPCRepo) GetProcessNodeDomainCommandResult(ctx context.Context, processInstanceID, nodeID int, fingerprint string) (*biz.ProcessNodeInstance, bool, error) {
	node, err := s.GetProcessNodeInstance(ctx, nodeID)
	if err != nil {
		return nil, false, err
	}
	if node.ProcessInstanceID != processInstanceID {
		return nil, false, biz.ErrProcessNodeInstanceConflict
	}
	if node.DomainCommandFingerprint == nil {
		return node, false, nil
	}
	if *node.DomainCommandFingerprint != fingerprint {
		return nil, false, biz.ErrIdempotencyConflict
	}
	if node.DomainCommandProtocolVersion == nil || *node.DomainCommandProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent {
		return nil, false, biz.ErrProcessDomainCommandRecoveryRequired
	}
	return node, node.DomainCommandResultHash != nil, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) RecordProcessNodeDomainCommandResult(ctx context.Context, in *biz.ProcessNodeDomainCommandResultRecord, actorID int) (*biz.ProcessNodeInstance, error) {
	node, found, err := s.GetProcessNodeDomainCommandResult(ctx, in.ProcessInstanceID, in.ProcessNodeInstanceID, in.DomainCommandFingerprint)
	if err != nil {
		return nil, err
	}
	if found {
		if *node.DomainCommandResultHash != in.ResultHash {
			return nil, biz.ErrIdempotencyConflict
		}
		return node, nil
	}
	now := time.Now()
	node.DomainCommandProtocolVersion = &in.ProtocolVersion
	node.DomainCommandResultState = &in.ResultState
	node.DomainCommandResult = in.Result
	node.DomainCommandResultHash = &in.ResultHash
	node.DomainCommandEffectState = &in.EffectState
	node.DomainCommandEffectRefType = in.EffectRefType
	node.DomainCommandEffectRefID = in.EffectRefID
	node.DomainCommandResultRecordedAt = &now
	node.DomainCommandResultRecordedBy = &actorID
	return node, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) MarkProcessNodeDomainCommandCompensated(ctx context.Context, in *biz.ProcessNodeDomainCommandCompensationMark, actorID int) (*biz.ProcessNodeInstance, error) {
	node, found, err := s.GetProcessNodeDomainCommandResult(ctx, in.ProcessInstanceID, in.ProcessNodeInstanceID, in.DomainCommandFingerprint)
	if err != nil {
		return nil, err
	}
	if !found || *node.DomainCommandResultHash != in.ExpectedResultHash {
		return nil, biz.ErrIdempotencyConflict
	}
	if node.DomainCommandCompensationHash != nil {
		if *node.DomainCommandCompensationHash != in.CompensationHash {
			return nil, biz.ErrIdempotencyConflict
		}
		return node, nil
	}
	now := time.Now()
	state := biz.ProcessDomainCommandEffectStateCompensated
	node.DomainCommandEffectState = &state
	node.DomainCommandCompensation = in.Compensation
	node.DomainCommandCompensationHash = &in.CompensationHash
	node.DomainCommandCompensatedAt = &now
	node.DomainCommandCompensatedBy = &actorID
	return node, nil
}
