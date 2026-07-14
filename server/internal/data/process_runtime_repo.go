package data

import (
	"bytes"
	"context"
	"encoding/json"
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
var _ biz.ProcessRuntimeDomainCommandResultRepo = (*processRuntimeRepo)(nil)

func (r *processRuntimeRepo) CreateProcessInstance(ctx context.Context, in *biz.ProcessInstanceCreate, actorID int) (*biz.ProcessInstance, []*biz.ProcessNodeInstance, error) {
	if in == nil || !biz.IsCreatableProcessStatus(in.Status) {
		return nil, nil, biz.ErrBadParam
	}
	for i := range in.Nodes {
		if !biz.IsCreatableProcessNodeStatus(in.Nodes[i].Status) {
			return nil, nil, biz.ErrBadParam
		}
	}
	existing, existingNodes, err := r.getProcessInstanceByBusinessRef(ctx, in.ProcessKey, in.BusinessRefType, in.BusinessRefID)
	if err == nil {
		if existing.IdempotencyKey == in.IdempotencyKey {
			if processInstanceMatchesCreate(existing, existingNodes, in) {
				return existing, existingNodes, nil
			}
			return nil, nil, biz.ErrIdempotencyConflict
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
				if processInstanceMatchesCreate(existing, existingNodes, in) {
					return existing, existingNodes, nil
				}
				return nil, nil, biz.ErrIdempotencyConflict
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

func processInstanceMatchesCreate(existing *biz.ProcessInstance, existingNodes []*biz.ProcessNodeInstance, in *biz.ProcessInstanceCreate) bool {
	if existing == nil || in == nil ||
		existing.ProcessKey != in.ProcessKey ||
		existing.ProcessVersion != in.ProcessVersion ||
		!processOptionalStringMatches(existing.VariantKey, in.VariantKey) ||
		existing.ConfigRevision != in.ConfigRevision ||
		existing.DefinitionHash != in.DefinitionHash ||
		existing.BusinessRefType != in.BusinessRefType ||
		existing.BusinessRefID != in.BusinessRefID ||
		!processOptionalStringMatches(existing.BusinessRefNo, in.BusinessRefNo) ||
		!processOptionalStringMatches(existing.CorrelationKey, in.CorrelationKey) ||
		existing.IdempotencyKey != in.IdempotencyKey ||
		!processInstanceStatusCanEvolveFrom(in.Status, existing.Status) ||
		!processJSONMatches(
			processCreationModuleContractSnapshot(existing.ModuleContractSnapshot),
			processCreationModuleContractSnapshot(in.ModuleContractSnapshot),
		) {
		return false
	}
	type nodeIdentity struct {
		key     string
		attempt int
	}
	initialNodes := make(map[nodeIdentity]*biz.ProcessNodeInstanceCreate, len(in.Nodes))
	maxInitialAttempt := make(map[string]int, len(in.Nodes))
	for i := range in.Nodes {
		identity := nodeIdentity{key: in.Nodes[i].NodeKey, attempt: in.Nodes[i].Attempt}
		if _, exists := initialNodes[identity]; exists {
			return false
		}
		initialNodes[identity] = &in.Nodes[i]
		if in.Nodes[i].Attempt > maxInitialAttempt[in.Nodes[i].NodeKey] {
			maxInitialAttempt[in.Nodes[i].NodeKey] = in.Nodes[i].Attempt
		}
	}
	matched := make(map[nodeIdentity]bool, len(initialNodes))
	for _, existingNode := range existingNodes {
		if existingNode == nil {
			return false
		}
		identity := nodeIdentity{key: existingNode.NodeKey, attempt: existingNode.Attempt}
		if initial, exists := initialNodes[identity]; exists {
			if matched[identity] || !processNodeInstanceMatchesCreate(existingNode, initial) {
				return false
			}
			matched[identity] = true
			continue
		}
		if maxAttempt, exists := maxInitialAttempt[existingNode.NodeKey]; !exists || existingNode.Attempt <= maxAttempt {
			return false
		}
	}
	return len(matched) == len(initialNodes)
}

func processNodeInstanceMatchesCreate(existing *biz.ProcessNodeInstance, in *biz.ProcessNodeInstanceCreate) bool {
	return existing != nil && in != nil &&
		existing.NodeKey == in.NodeKey &&
		existing.NodeType == in.NodeType &&
		existing.Attempt == in.Attempt &&
		processNodeStatusCanEvolveFrom(in.Status, existing.Status) &&
		processOptionalStringMatches(existing.OwnerPoolKey, in.OwnerPoolKey) &&
		processOptionalStringMatches(existing.RequiredCapabilityKey, in.RequiredCapabilityKey) &&
		processOptionalStringMatches(existing.FormProfileKey, in.FormProfileKey) &&
		processOptionalStringMatches(existing.ActionSetKey, in.ActionSetKey) &&
		processJSONMatches(existing.PolicySnapshot, in.PolicySnapshot) &&
		processOptionalTimeMatches(existing.DueAt, in.DueAt)
}

// linked_business_refs 是领域命令完成后追加的运行时证据，不属于实例创建意图。
func processCreationModuleContractSnapshot(snapshot map[string]any) map[string]any {
	if snapshot == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(snapshot))
	for key, value := range snapshot {
		if key != "linked_business_refs" {
			out[key] = value
		}
	}
	return out
}

func processJSONMatches(left any, right any) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftJSON, rightJSON)
}

func processOptionalStringMatches(left *string, right *string) bool {
	return (left == nil && right == nil) || (left != nil && right != nil && *left == *right)
}

func processOptionalIntMatches(left *int, right *int) bool {
	return (left == nil && right == nil) || (left != nil && right != nil && *left == *right)
}

func processOptionalTimeMatches(left *time.Time, right *time.Time) bool {
	return (left == nil && right == nil) || (left != nil && right != nil && left.Equal(*right))
}

func processInstanceStatusCanEvolveFrom(initial string, current string) bool {
	if initial == current {
		return true
	}
	return initial == biz.ProcessStatusActive &&
		(current == biz.ProcessStatusCompleted || current == biz.ProcessStatusBlocked)
}

func processNodeStatusCanEvolveFrom(initial string, current string) bool {
	if initial == current {
		return true
	}
	switch initial {
	case biz.ProcessNodeStatusWaiting:
		return current == biz.ProcessNodeStatusActive ||
			current == biz.ProcessNodeStatusCompleted ||
			current == biz.ProcessNodeStatusBlocked
	case biz.ProcessNodeStatusActive:
		return current == biz.ProcessNodeStatusCompleted ||
			current == biz.ProcessNodeStatusBlocked
	default:
		return false
	}
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

func (r *processRuntimeRepo) ClaimProcessNodeDomainCommand(ctx context.Context, in *biz.ProcessNodeDomainCommandClaim) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.DomainCommandFingerprint == "" {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.ProcessNodeInstance.UpdateOneID(in.ProcessNodeInstanceID).
		Where(
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.NodeType(biz.ProcessNodeTypeDomainCommand),
			processnodeinstance.Status(biz.ProcessNodeStatusActive),
			processnodeinstance.Version(in.ExpectedVersion),
			processnodeinstance.Or(
				processnodeinstance.And(
					processnodeinstance.DomainCommandFingerprintIsNil(),
					processnodeinstance.DomainCommandProtocolVersionIsNil(),
				),
				processnodeinstance.And(
					processnodeinstance.DomainCommandFingerprint(in.DomainCommandFingerprint),
					processnodeinstance.DomainCommandProtocolVersion(biz.ProcessDomainCommandProtocolVersionCurrent),
				),
			),
		).
		SetDomainCommandFingerprint(in.DomainCommandFingerprint).
		SetDomainCommandProtocolVersion(biz.ProcessDomainCommandProtocolVersionCurrent).
		Save(ctx)
	if err == nil {
		return entProcessNodeInstanceToBiz(row), nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	existing, err := r.GetProcessNodeInstance(ctx, in.ProcessNodeInstanceID)
	if err != nil {
		return nil, err
	}
	if existing.ProcessInstanceID != in.ProcessInstanceID {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if existing.NodeType != biz.ProcessNodeTypeDomainCommand {
		return nil, biz.ErrBadParam
	}
	if existing.DomainCommandFingerprint != nil &&
		(existing.DomainCommandProtocolVersion == nil || *existing.DomainCommandProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent) {
		return nil, biz.ErrProcessDomainCommandRecoveryRequired
	}
	if existing.DomainCommandFingerprint != nil && *existing.DomainCommandFingerprint != in.DomainCommandFingerprint {
		return nil, biz.ErrIdempotencyConflict
	}
	if existing.Status != biz.ProcessNodeStatusActive || existing.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if existing.DomainCommandFingerprint != nil {
		return existing, nil
	}
	return nil, biz.ErrProcessNodeInstanceConflict
}

func (r *processRuntimeRepo) GetProcessNodeDomainCommandResult(
	ctx context.Context,
	processInstanceID int,
	processNodeInstanceID int,
	domainCommandFingerprint string,
) (*biz.ProcessNodeInstance, bool, error) {
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || len(domainCommandFingerprint) != 64 {
		return nil, false, biz.ErrBadParam
	}
	node, err := r.GetProcessNodeInstance(ctx, processNodeInstanceID)
	if err != nil {
		return nil, false, err
	}
	if node.ProcessInstanceID != processInstanceID || node.NodeType != biz.ProcessNodeTypeDomainCommand {
		return nil, false, biz.ErrBadParam
	}
	if node.DomainCommandFingerprint == nil {
		return node, false, nil
	}
	if node.DomainCommandProtocolVersion == nil || *node.DomainCommandProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent {
		return nil, false, biz.ErrProcessDomainCommandRecoveryRequired
	}
	if *node.DomainCommandFingerprint != domainCommandFingerprint {
		return nil, false, biz.ErrIdempotencyConflict
	}
	if node.DomainCommandResultHash == nil {
		if node.DomainCommandResultState != nil || node.DomainCommandEffectState != nil || node.DomainCommandResult != nil {
			return nil, false, biz.ErrProcessDomainCommandRecoveryRequired
		}
		return node, false, nil
	}
	if node.DomainCommandResultState == nil || node.DomainCommandEffectState == nil || node.DomainCommandResult == nil || node.DomainCommandResultRecordedAt == nil {
		return nil, false, biz.ErrProcessDomainCommandRecoveryRequired
	}
	return node, true, nil
}

func (r *processRuntimeRepo) RecordProcessNodeDomainCommandResult(
	ctx context.Context,
	in *biz.ProcessNodeDomainCommandResultRecord,
	actorID int,
) (*biz.ProcessNodeInstance, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, biz.ErrBadParam
	}
	return recordProcessNodeDomainCommandResultWithClient(ctx, r.data.postgres, in, actorID)
}

func recordProcessNodeDomainCommandResultWithClient(
	ctx context.Context,
	client *ent.Client,
	in *biz.ProcessNodeDomainCommandResultRecord,
	actorID int,
) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 ||
		len(in.DomainCommandFingerprint) != 64 || in.ProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent ||
		len(in.ResultHash) != 64 || in.Result == nil || !biz.IsValidProcessDomainCommandResultState(in.ResultState) ||
		!biz.IsValidProcessDomainCommandEffectState(in.EffectState) ||
		(in.EffectRefType == nil) != (in.EffectRefID == nil) || client == nil {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	update := client.ProcessNodeInstance.Update().
		Where(
			processnodeinstance.ID(in.ProcessNodeInstanceID),
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.NodeType(biz.ProcessNodeTypeDomainCommand),
			processnodeinstance.Status(biz.ProcessNodeStatusActive),
			processnodeinstance.Version(in.ExpectedVersion),
			processnodeinstance.DomainCommandFingerprint(in.DomainCommandFingerprint),
			processnodeinstance.DomainCommandProtocolVersion(in.ProtocolVersion),
			processnodeinstance.DomainCommandResultHashIsNil(),
		).
		SetDomainCommandResultState(in.ResultState).
		SetDomainCommandResult(in.Result).
		SetDomainCommandResultHash(in.ResultHash).
		SetDomainCommandEffectState(in.EffectState).
		SetNillableDomainCommandEffectRefType(in.EffectRefType).
		SetNillableDomainCommandEffectRefID(in.EffectRefID).
		SetDomainCommandResultRecordedAt(now)
	if actorID > 0 {
		update.SetDomainCommandResultRecordedBy(actorID)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 1 {
		return getProcessNodeInstanceWithClient(ctx, client, in.ProcessNodeInstanceID)
	}
	existing, err := getProcessNodeInstanceWithClient(ctx, client, in.ProcessNodeInstanceID)
	if err != nil {
		return nil, err
	}
	if existing.ProcessInstanceID != in.ProcessInstanceID || existing.NodeType != biz.ProcessNodeTypeDomainCommand {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if existing.DomainCommandFingerprint == nil || *existing.DomainCommandFingerprint != in.DomainCommandFingerprint {
		return nil, biz.ErrIdempotencyConflict
	}
	if existing.DomainCommandProtocolVersion == nil || *existing.DomainCommandProtocolVersion != in.ProtocolVersion {
		return nil, biz.ErrProcessDomainCommandRecoveryRequired
	}
	if existing.DomainCommandResultHash == nil {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	storedInitialEffectState, _ := existing.DomainCommandResult["effect_state"].(string)
	if *existing.DomainCommandResultHash != in.ResultHash || existing.DomainCommandResultState == nil || *existing.DomainCommandResultState != in.ResultState ||
		existing.DomainCommandEffectState == nil || storedInitialEffectState != in.EffectState ||
		!processOptionalStringMatches(existing.DomainCommandEffectRefType, in.EffectRefType) ||
		!processOptionalIntMatches(existing.DomainCommandEffectRefID, in.EffectRefID) ||
		!processJSONMatches(existing.DomainCommandResult, in.Result) {
		return nil, biz.ErrIdempotencyConflict
	}
	return existing, nil
}

func (r *processRuntimeRepo) MarkProcessNodeDomainCommandCompensated(
	ctx context.Context,
	in *biz.ProcessNodeDomainCommandCompensationMark,
	actorID int,
) (*biz.ProcessNodeInstance, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, biz.ErrBadParam
	}
	return markProcessNodeDomainCommandCompensatedWithClient(ctx, r.data.postgres, in, actorID)
}

func markProcessNodeDomainCommandCompensatedWithClient(
	ctx context.Context,
	client *ent.Client,
	in *biz.ProcessNodeDomainCommandCompensationMark,
	actorID int,
) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 ||
		len(in.DomainCommandFingerprint) != 64 || len(in.ExpectedResultHash) != 64 ||
		len(in.CompensationHash) != 64 || in.Compensation == nil || client == nil {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	update := client.ProcessNodeInstance.Update().
		Where(
			processnodeinstance.ID(in.ProcessNodeInstanceID),
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.NodeType(biz.ProcessNodeTypeDomainCommand),
			processnodeinstance.Version(in.ExpectedVersion),
			processnodeinstance.DomainCommandFingerprint(in.DomainCommandFingerprint),
			processnodeinstance.DomainCommandProtocolVersion(biz.ProcessDomainCommandProtocolVersionCurrent),
			processnodeinstance.DomainCommandResultHash(in.ExpectedResultHash),
			processnodeinstance.DomainCommandCompensationHashIsNil(),
		).
		SetDomainCommandEffectState(biz.ProcessDomainCommandEffectStateCompensated).
		SetDomainCommandCompensation(in.Compensation).
		SetDomainCommandCompensationHash(in.CompensationHash).
		SetDomainCommandCompensatedAt(now)
	if actorID > 0 {
		update.SetDomainCommandCompensatedBy(actorID)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 1 {
		return getProcessNodeInstanceWithClient(ctx, client, in.ProcessNodeInstanceID)
	}
	existing, err := getProcessNodeInstanceWithClient(ctx, client, in.ProcessNodeInstanceID)
	if err != nil {
		return nil, err
	}
	if existing.ProcessInstanceID != in.ProcessInstanceID || existing.DomainCommandFingerprint == nil || *existing.DomainCommandFingerprint != in.DomainCommandFingerprint ||
		existing.DomainCommandResultHash == nil || *existing.DomainCommandResultHash != in.ExpectedResultHash {
		return nil, biz.ErrIdempotencyConflict
	}
	if existing.DomainCommandProtocolVersion == nil || *existing.DomainCommandProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent {
		return nil, biz.ErrProcessDomainCommandRecoveryRequired
	}
	if existing.DomainCommandCompensationHash == nil {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if *existing.DomainCommandCompensationHash != in.CompensationHash || existing.DomainCommandEffectState == nil ||
		*existing.DomainCommandEffectState != biz.ProcessDomainCommandEffectStateCompensated ||
		!processJSONMatches(existing.DomainCommandCompensation, in.Compensation) {
		return nil, biz.ErrIdempotencyConflict
	}
	return existing, nil
}

func getProcessNodeInstanceWithClient(ctx context.Context, client *ent.Client, id int) (*biz.ProcessNodeInstance, error) {
	if client == nil || id <= 0 {
		return nil, biz.ErrBadParam
	}
	row, err := client.ProcessNodeInstance.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessNodeInstanceNotFound
		}
		return nil, err
	}
	return entProcessNodeInstanceToBiz(row), nil
}

func markProcessDomainCommandEffectCompensatedWithClient(
	ctx context.Context,
	client *ent.Client,
	commandKey string,
	effectRefType string,
	effectRefID int,
	reason string,
	actorID int,
) error {
	if client == nil || commandKey == "" || effectRefType == "" || effectRefID <= 0 || reason == "" {
		return biz.ErrBadParam
	}
	rows, err := client.ProcessNodeInstance.Query().
		Where(
			processnodeinstance.DomainCommandProtocolVersion(biz.ProcessDomainCommandProtocolVersionCurrent),
			processnodeinstance.DomainCommandResultHashNotNil(),
			processnodeinstance.DomainCommandEffectRefType(effectRefType),
			processnodeinstance.DomainCommandEffectRefID(effectRefID),
		).
		All(ctx)
	if err != nil {
		return err
	}
	for _, row := range rows {
		node := entProcessNodeInstanceToBiz(row)
		storedCommandKey, _ := node.PolicySnapshot["command_key"].(string)
		if storedCommandKey != commandKey {
			continue
		}
		mark, err := biz.BuildProcessNodeDomainCommandCompensationMark(node, reason)
		if err != nil {
			return err
		}
		if _, err := markProcessNodeDomainCommandCompensatedWithClient(ctx, client, mark, actorID); err != nil {
			return err
		}
	}
	return nil
}

func (r *processRuntimeRepo) CompleteProcessNodeInstance(ctx context.Context, in *biz.ProcessNodeInstanceComplete, actorID int) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ID <= 0 || in.ProcessInstanceID <= 0 || in.ExpectedVersion <= 0 ||
		(in.ExpectedDomainCommandResultHash == nil) != (in.ExpectedDomainCommandEffectState == nil) {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	update := r.data.postgres.ProcessNodeInstance.Update().
		Where(
			processnodeinstance.ID(in.ID),
			processnodeinstance.ProcessInstanceID(in.ProcessInstanceID),
			processnodeinstance.Status(biz.ProcessNodeStatusActive),
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
	if in.DomainCommandFingerprint != nil {
		update.Where(processnodeinstance.DomainCommandFingerprint(*in.DomainCommandFingerprint))
		update.SetDomainCommandFingerprint(*in.DomainCommandFingerprint)
	}
	if in.ExpectedDomainCommandResultHash != nil {
		if len(*in.ExpectedDomainCommandResultHash) != 64 || !biz.IsValidProcessDomainCommandEffectState(*in.ExpectedDomainCommandEffectState) ||
			*in.ExpectedDomainCommandEffectState == biz.ProcessDomainCommandEffectStateCompensated {
			return nil, biz.ErrBadParam
		}
		update.Where(
			processnodeinstance.DomainCommandResultHash(*in.ExpectedDomainCommandResultHash),
			processnodeinstance.DomainCommandEffectState(*in.ExpectedDomainCommandEffectState),
		)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		current, err := r.GetProcessNodeInstance(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		if current.ProcessInstanceID != in.ProcessInstanceID {
			return nil, biz.ErrProcessNodeInstanceConflict
		}
		if current.Version != in.ExpectedVersion {
			return nil, biz.ErrProcessNodeInstanceConflict
		}
		if current.Status != biz.ProcessNodeStatusActive {
			switch current.Status {
			case biz.ProcessNodeStatusCompleted:
				return nil, biz.ErrProcessNodeInstanceSettled
			default:
				return nil, biz.ErrProcessNodeInstanceNotActive
			}
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
	const maxAttempts = 64
	for range maxAttempts {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		current, err := r.GetProcessInstance(ctx, in.ProcessInstanceID)
		if err != nil {
			return nil, err
		}
		snapshot, err := biz.ApplyProcessLinkedBusinessRefToSnapshot(current.ModuleContractSnapshot, in)
		if err != nil {
			return nil, err
		}
		nextUpdatedAt := time.Now()
		minimumUpdatedAt := current.UpdatedAt.Add(time.Microsecond)
		if nextUpdatedAt.Before(minimumUpdatedAt) {
			nextUpdatedAt = minimumUpdatedAt
		}
		update := r.data.postgres.ProcessInstance.Update().
			Where(
				processinstance.ID(in.ProcessInstanceID),
				processinstance.UpdatedAtEQ(current.UpdatedAt),
			).
			SetModuleContractSnapshot(snapshot).
			SetUpdatedAt(nextUpdatedAt)
		if actorID > 0 {
			update.SetUpdatedBy(actorID)
		}
		affected, err := update.Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected == 1 {
			return r.GetProcessInstance(ctx, in.ProcessInstanceID)
		}
	}
	return nil, biz.ErrProcessNodeInstanceConflict
}

func blockProcessNodeInstanceWithClient(ctx context.Context, client *ent.Client, in *biz.ProcessNodeInstanceBlock) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessNodeInstanceID <= 0 || in.ProcessInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	outcome := in.Outcome
	if outcome == "" {
		outcome = in.Reason
	}
	update := client.ProcessNodeInstance.Update().
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
	if in.DomainCommandFingerprint != nil {
		update.Where(processnodeinstance.DomainCommandFingerprint(*in.DomainCommandFingerprint))
		update.SetDomainCommandFingerprint(*in.DomainCommandFingerprint)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		if _, err := getProcessNodeInstanceWithClient(ctx, client, in.ProcessNodeInstanceID); err != nil {
			return nil, err
		}
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	return getProcessNodeInstanceWithClient(ctx, client, in.ProcessNodeInstanceID)
}

func (r *processRuntimeRepo) BlockProcessNodeAndInstance(ctx context.Context, in *biz.ProcessNodeInstanceBlock, actorID int) (*biz.ProcessNodeInstance, error) {
	if in == nil || in.ProcessNodeInstanceID <= 0 || in.ProcessInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	blockedNode, err := blockProcessNodeInstanceWithClient(ctx, tx.Client(), in)
	if err != nil {
		return nil, err
	}
	update := tx.ProcessInstance.Update().
		Where(
			processinstance.ID(in.ProcessInstanceID),
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
		row, getErr := tx.ProcessInstance.Get(ctx, in.ProcessInstanceID)
		if getErr != nil {
			if ent.IsNotFound(getErr) {
				return nil, biz.ErrProcessInstanceNotFound
			}
			return nil, getErr
		}
		if row.Status != biz.ProcessStatusActive {
			return nil, biz.ErrProcessInstanceSettled
		}
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return blockedNode, nil
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
		ID:                            row.ID,
		ProcessInstanceID:             row.ProcessInstanceID,
		NodeKey:                       row.NodeKey,
		NodeType:                      row.NodeType,
		Attempt:                       row.Attempt,
		Status:                        row.Status,
		OwnerPoolKey:                  row.OwnerPoolKey,
		RequiredCapabilityKey:         row.RequiredCapabilityKey,
		FormProfileKey:                row.FormProfileKey,
		ActionSetKey:                  row.ActionSetKey,
		PolicySnapshot:                row.PolicySnapshot,
		DueAt:                         row.DueAt,
		StartedAt:                     row.StartedAt,
		CompletedAt:                   row.CompletedAt,
		Outcome:                       row.Outcome,
		DomainCommandFingerprint:      row.DomainCommandFingerprint,
		DomainCommandProtocolVersion:  row.DomainCommandProtocolVersion,
		DomainCommandResultState:      row.DomainCommandResultState,
		DomainCommandResult:           row.DomainCommandResult,
		DomainCommandResultHash:       row.DomainCommandResultHash,
		DomainCommandEffectState:      row.DomainCommandEffectState,
		DomainCommandEffectRefType:    row.DomainCommandEffectRefType,
		DomainCommandEffectRefID:      row.DomainCommandEffectRefID,
		DomainCommandResultRecordedAt: row.DomainCommandResultRecordedAt,
		DomainCommandResultRecordedBy: row.DomainCommandResultRecordedBy,
		DomainCommandCompensation:     row.DomainCommandCompensation,
		DomainCommandCompensationHash: row.DomainCommandCompensationHash,
		DomainCommandCompensatedAt:    row.DomainCommandCompensatedAt,
		DomainCommandCompensatedBy:    row.DomainCommandCompensatedBy,
		Version:                       row.Version,
		CreatedAt:                     row.CreatedAt,
		UpdatedAt:                     row.UpdatedAt,
	}
}
