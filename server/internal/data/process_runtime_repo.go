package data

import (
	"context"
	"errors"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/processnodeinstance"

	"github.com/go-kratos/kratos/v2/log"
)

type processRuntimeRepo struct {
	data *Data
	log  *log.Helper
}

func NewProcessRuntimeRepo(d *Data, logger log.Logger) *processRuntimeRepo {
	return &processRuntimeRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.process_runtime_repo")),
	}
}

var _ biz.ProcessRuntimeRepo = (*processRuntimeRepo)(nil)

func (r *processRuntimeRepo) CreateProcessInstance(ctx context.Context, in *biz.ProcessInstanceCreate, actorID int) (*biz.ProcessInstance, []*biz.ProcessNodeInstance, error) {
	if in == nil {
		return nil, nil, biz.ErrBadParam
	}
	existing, existingNodes, err := r.getProcessInstanceByBusinessRef(ctx, in.ProcessKey, in.BusinessRefType, in.BusinessRefID)
	if err == nil {
		if existing.IdempotencyKey == in.IdempotencyKey {
			return existing, existingNodes, nil
		}
		return nil, nil, biz.ErrProcessInstanceExists
	}
	if !errors.Is(err, biz.ErrProcessInstanceNotFound) {
		return nil, nil, err
	}

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	builder := tx.ProcessInstance.Create().
		SetProcessKey(in.ProcessKey).
		SetProcessVersion(in.ProcessVersion).
		SetNillableVariantKey(in.VariantKey).
		SetConfigRevision(in.ConfigRevision).
		SetDefinitionHash(in.DefinitionHash).
		SetModuleContractSnapshot(in.ModuleContractSnapshot).
		SetBusinessRefType(in.BusinessRefType).
		SetBusinessRefID(in.BusinessRefID).
		SetNillableBusinessRefNo(in.BusinessRefNo).
		SetNillableCorrelationKey(in.CorrelationKey).
		SetIdempotencyKey(in.IdempotencyKey).
		SetStatus(in.Status)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}
	row, err := builder.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			existing, existingNodes, findErr := r.getProcessInstanceByBusinessRef(ctx, in.ProcessKey, in.BusinessRefType, in.BusinessRefID)
			if findErr == nil && existing.IdempotencyKey == in.IdempotencyKey {
				return existing, existingNodes, nil
			}
			return nil, nil, biz.ErrProcessInstanceExists
		}
		return nil, nil, err
	}

	nodes := make([]*biz.ProcessNodeInstance, 0, len(in.Nodes))
	for _, nodeIn := range in.Nodes {
		nodeBuilder := tx.ProcessNodeInstance.Create().
			SetProcessInstanceID(row.ID).
			SetNodeKey(nodeIn.NodeKey).
			SetNodeType(nodeIn.NodeType).
			SetAttempt(nodeIn.Attempt).
			SetStatus(nodeIn.Status).
			SetNillableOwnerPoolKey(nodeIn.OwnerPoolKey).
			SetNillableRequiredCapabilityKey(nodeIn.RequiredCapabilityKey).
			SetNillableFormProfileKey(nodeIn.FormProfileKey).
			SetNillableActionSetKey(nodeIn.ActionSetKey).
			SetPolicySnapshot(nodeIn.PolicySnapshot).
			SetNillableDueAt(nodeIn.DueAt)
		node, err := nodeBuilder.Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, nil, biz.ErrProcessInstanceExists
			}
			return nil, nil, err
		}
		nodes = append(nodes, entProcessNodeInstanceToBiz(node))
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	tx = nil
	return entProcessInstanceToBiz(row), nodes, nil
}

func (r *processRuntimeRepo) getProcessInstanceByBusinessRef(ctx context.Context, processKey string, businessRefType string, businessRefID int) (*biz.ProcessInstance, []*biz.ProcessNodeInstance, error) {
	row, err := r.data.postgres.ProcessInstance.Query().
		Where(
			processinstance.ProcessKey(processKey),
			processinstance.BusinessRefType(businessRefType),
			processinstance.BusinessRefID(businessRefID),
		).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil, biz.ErrProcessInstanceNotFound
		}
		return nil, nil, err
	}
	instance := entProcessInstanceToBiz(row)
	nodes, err := r.ListProcessNodeInstances(ctx, instance.ID)
	if err != nil {
		return nil, nil, err
	}
	return instance, nodes, nil
}

func (r *processRuntimeRepo) GetProcessInstance(ctx context.Context, id int) (*biz.ProcessInstance, error) {
	row, err := r.data.postgres.ProcessInstance.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessInstanceNotFound
		}
		return nil, err
	}
	return entProcessInstanceToBiz(row), nil
}

func (r *processRuntimeRepo) GetProcessNodeInstance(ctx context.Context, id int) (*biz.ProcessNodeInstance, error) {
	row, err := r.data.postgres.ProcessNodeInstance.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessNodeInstanceNotFound
		}
		return nil, err
	}
	return entProcessNodeInstanceToBiz(row), nil
}

func (r *processRuntimeRepo) ListProcessNodeInstances(ctx context.Context, processInstanceID int) ([]*biz.ProcessNodeInstance, error) {
	rows, err := r.data.postgres.ProcessNodeInstance.Query().
		Where(processnodeinstance.ProcessInstanceID(processInstanceID)).
		Order(ent.Asc(processnodeinstance.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.ProcessNodeInstance, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProcessNodeInstanceToBiz(row))
	}
	return out, nil
}

func (r *processRuntimeRepo) CompleteProcessNodeInstance(ctx context.Context, in *biz.ProcessNodeInstanceComplete, actorID int) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ID <= 0 || in.ProcessInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	update := r.data.postgres.ProcessNodeInstance.Update().
		Where(
			processnodeinstance.ID(in.ID),
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.Version(in.ExpectedVersion),
		).
		SetStatus(biz.ProcessNodeStatusCompleted).
		SetCompletedAt(now).
		SetVersion(in.ExpectedVersion + 1)
	if in.Outcome != "" {
		update.SetOutcome(in.Outcome)
	} else {
		update.ClearOutcome()
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		if _, err := r.GetProcessNodeInstance(ctx, in.ID); err != nil {
			return nil, err
		}
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	return r.GetProcessNodeInstance(ctx, in.ID)
}

func (r *processRuntimeRepo) CompleteProcessInstance(ctx context.Context, in *biz.ProcessInstanceComplete, actorID int) (*biz.ProcessInstance, error) {
	if in == nil || in.ID <= 0 {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	update := r.data.postgres.ProcessInstance.Update().
		Where(
			processinstance.ID(in.ID),
			processinstance.Status(biz.ProcessStatusActive),
		).
		SetStatus(biz.ProcessStatusCompleted).
		SetCompletedAt(now)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		if _, err := r.GetProcessInstance(ctx, in.ID); err != nil {
			return nil, err
		}
		return nil, biz.ErrProcessInstanceSettled
	}
	return r.GetProcessInstance(ctx, in.ID)
}

func (r *processRuntimeRepo) RecordProcessInstanceLinkedBusinessRef(ctx context.Context, in *biz.ProcessInstanceLinkedBusinessRefRecord, actorID int) (*biz.ProcessInstance, error) {
	if in == nil || in.ProcessInstanceID <= 0 {
		return nil, biz.ErrBadParam
	}
	current, err := r.GetProcessInstance(ctx, in.ProcessInstanceID)
	if err != nil {
		return nil, err
	}
	snapshot, err := biz.ApplyProcessLinkedBusinessRefToSnapshot(current.ModuleContractSnapshot, in)
	if err != nil {
		return nil, err
	}
	update := r.data.postgres.ProcessInstance.UpdateOneID(in.ProcessInstanceID).
		SetModuleContractSnapshot(snapshot)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessInstanceNotFound
		}
		return nil, err
	}
	return entProcessInstanceToBiz(row), nil
}

func (r *processRuntimeRepo) BlockProcessNodeInstance(ctx context.Context, in *biz.ProcessNodeInstanceBlock, actorID int) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessNodeInstanceID <= 0 || in.ProcessInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	outcome := in.Outcome
	if outcome == "" {
		outcome = in.Reason
	}
	update := r.data.postgres.ProcessNodeInstance.Update().
		Where(
			processnodeinstance.ID(in.ProcessNodeInstanceID),
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.Status(biz.ProcessNodeStatusActive),
			processnodeinstance.Version(in.ExpectedVersion),
		).
		SetStatus(biz.ProcessNodeStatusBlocked).
		SetVersion(in.ExpectedVersion + 1)
	if outcome != "" {
		update.SetOutcome(outcome)
	} else {
		update.ClearOutcome()
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		if _, err := r.GetProcessNodeInstance(ctx, in.ProcessNodeInstanceID); err != nil {
			return nil, err
		}
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	return r.GetProcessNodeInstance(ctx, in.ProcessNodeInstanceID)
}

func (r *processRuntimeRepo) BlockProcessInstance(ctx context.Context, in *biz.ProcessInstanceBlock, actorID int) (*biz.ProcessInstance, error) {
	if in == nil || in.ID <= 0 {
		return nil, biz.ErrBadParam
	}
	update := r.data.postgres.ProcessInstance.Update().
		Where(
			processinstance.ID(in.ID),
			processinstance.Status(biz.ProcessStatusActive),
		).
		SetStatus(biz.ProcessStatusBlocked)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		if _, err := r.GetProcessInstance(ctx, in.ID); err != nil {
			return nil, err
		}
		return nil, biz.ErrProcessInstanceSettled
	}
	return r.GetProcessInstance(ctx, in.ID)
}

func (r *processRuntimeRepo) ActivateProcessNodeInstance(ctx context.Context, in *biz.ProcessNodeInstanceActivate, actorID int) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ID <= 0 || in.ProcessInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	affected, err := r.data.postgres.ProcessNodeInstance.Update().
		Where(
			processnodeinstance.ID(in.ID),
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.Status(biz.ProcessNodeStatusWaiting),
			processnodeinstance.Version(in.ExpectedVersion),
		).
		SetStatus(biz.ProcessNodeStatusActive).
		SetStartedAt(now).
		SetVersion(in.ExpectedVersion + 1).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		if _, err := r.GetProcessNodeInstance(ctx, in.ID); err != nil {
			return nil, err
		}
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	return r.GetProcessNodeInstance(ctx, in.ID)
}

func (r *processRuntimeRepo) CreateProcessNodeInstanceAttempt(ctx context.Context, in *biz.ProcessNodeInstanceAttemptCreate, actorID int) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessInstanceID <= 0 || in.Attempt <= 0 {
		return nil, biz.ErrBadParam
	}
	nodeIn := biz.ProcessNodeInstanceCreate{
		NodeKey:               in.NodeKey,
		NodeType:              in.NodeType,
		Attempt:               in.Attempt,
		Status:                biz.ProcessNodeStatusWaiting,
		OwnerPoolKey:          in.OwnerPoolKey,
		RequiredCapabilityKey: in.RequiredCapabilityKey,
		FormProfileKey:        in.FormProfileKey,
		ActionSetKey:          in.ActionSetKey,
		PolicySnapshot:        in.PolicySnapshot,
		DueAt:                 in.DueAt,
	}
	normalized, err := biz.NormalizeProcessNodeInstanceCreateForRepo(nodeIn)
	if err != nil {
		return nil, err
	}
	builder := r.data.postgres.ProcessNodeInstance.Create().
		SetProcessInstanceID(in.ProcessInstanceID).
		SetNodeKey(normalized.NodeKey).
		SetNodeType(normalized.NodeType).
		SetAttempt(normalized.Attempt).
		SetStatus(normalized.Status).
		SetNillableOwnerPoolKey(normalized.OwnerPoolKey).
		SetNillableRequiredCapabilityKey(normalized.RequiredCapabilityKey).
		SetNillableFormProfileKey(normalized.FormProfileKey).
		SetNillableActionSetKey(normalized.ActionSetKey).
		SetPolicySnapshot(normalized.PolicySnapshot).
		SetNillableDueAt(normalized.DueAt)
	row, err := builder.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrProcessInstanceExists
		}
		return nil, err
	}
	return entProcessNodeInstanceToBiz(row), nil
}

func entProcessInstanceToBiz(row *ent.ProcessInstance) *biz.ProcessInstance {
	if row == nil {
		return nil
	}
	return &biz.ProcessInstance{
		ID:                     row.ID,
		ProcessKey:             row.ProcessKey,
		ProcessVersion:         row.ProcessVersion,
		VariantKey:             row.VariantKey,
		ConfigRevision:         row.ConfigRevision,
		DefinitionHash:         row.DefinitionHash,
		ModuleContractSnapshot: row.ModuleContractSnapshot,
		BusinessRefType:        row.BusinessRefType,
		BusinessRefID:          row.BusinessRefID,
		BusinessRefNo:          row.BusinessRefNo,
		CorrelationKey:         row.CorrelationKey,
		IdempotencyKey:         row.IdempotencyKey,
		Status:                 row.Status,
		StartedAt:              row.StartedAt,
		CompletedAt:            row.CompletedAt,
		CreatedBy:              row.CreatedBy,
		UpdatedBy:              row.UpdatedBy,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func entProcessNodeInstanceToBiz(row *ent.ProcessNodeInstance) *biz.ProcessNodeInstance {
	if row == nil {
		return nil
	}
	return &biz.ProcessNodeInstance{
		ID:                    row.ID,
		ProcessInstanceID:     row.ProcessInstanceID,
		NodeKey:               row.NodeKey,
		NodeType:              row.NodeType,
		Attempt:               row.Attempt,
		Status:                row.Status,
		OwnerPoolKey:          row.OwnerPoolKey,
		RequiredCapabilityKey: row.RequiredCapabilityKey,
		FormProfileKey:        row.FormProfileKey,
		ActionSetKey:          row.ActionSetKey,
		PolicySnapshot:        row.PolicySnapshot,
		DueAt:                 row.DueAt,
		StartedAt:             row.StartedAt,
		CompletedAt:           row.CompletedAt,
		Outcome:               row.Outcome,
		Version:               row.Version,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}
