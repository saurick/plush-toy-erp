package data

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
)

type workflowRepo struct {
	data *Data
	log  *log.Helper
}

const workflowTaskMutationResultContractV1 = "workflow.task-mutation-result/v1"

type workflowTaskMutationResultEnvelopeV1 struct {
	Contract string                            `json:"contract"`
	Task     *workflowTaskMutationResultTaskV1 `json:"task"`
}

type workflowTaskMutationResultTaskV1 struct {
	ID                    int            `json:"id"`
	TaskCode              string         `json:"task_code"`
	TaskGroup             string         `json:"task_group"`
	TaskName              string         `json:"task_name"`
	SourceType            string         `json:"source_type"`
	SourceID              int            `json:"source_id"`
	SourceNo              *string        `json:"source_no,omitempty"`
	BusinessStatusKey     *string        `json:"business_status_key,omitempty"`
	TaskStatusKey         string         `json:"task_status_key"`
	OwnerRoleKey          string         `json:"owner_role_key"`
	OwnerPoolKey          *string        `json:"owner_pool_key,omitempty"`
	RequiredCapabilityKey *string        `json:"required_capability_key,omitempty"`
	ConfigRevision        *string        `json:"config_revision,omitempty"`
	ProcessInstanceID     *int           `json:"process_instance_id,omitempty"`
	ProcessNodeInstanceID *int           `json:"process_node_instance_id,omitempty"`
	AssigneeID            *int           `json:"assignee_id,omitempty"`
	Priority              int16          `json:"priority"`
	BlockedReason         *string        `json:"blocked_reason,omitempty"`
	CriticalPath          bool           `json:"critical_path"`
	UrgeCount             int            `json:"urge_count"`
	LastUrgedAt           *time.Time     `json:"last_urged_at,omitempty"`
	LastUrgedBy           *int           `json:"last_urged_by,omitempty"`
	LastUrgedByRoleKey    *string        `json:"last_urged_by_role_key,omitempty"`
	EscalatedAt           *time.Time     `json:"escalated_at,omitempty"`
	EscalateTargetRoleKey *string        `json:"escalate_target_role_key,omitempty"`
	DueAt                 *time.Time     `json:"due_at,omitempty"`
	CompletedAt           *time.Time     `json:"completed_at,omitempty"`
	Payload               map[string]any `json:"payload"`
	Version               int            `json:"version"`
	CreatedBy             *int           `json:"created_by,omitempty"`
	UpdatedBy             *int           `json:"updated_by,omitempty"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
}

func NewWorkflowRepo(d *Data, logger log.Logger) *workflowRepo {
	return &workflowRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.workflow_repo")),
	}
}

var _ biz.WorkflowRepo = (*workflowRepo)(nil)

func (r *workflowRepo) GetWorkflowTask(ctx context.Context, id int) (*biz.WorkflowTask, error) {
	row, err := r.data.postgres.WorkflowTask.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}
	return entWorkflowTaskToBiz(row), nil
}

func (r *workflowRepo) GetWorkflowTaskByTaskCode(ctx context.Context, taskCode string) (*biz.WorkflowTask, error) {
	taskCode = strings.TrimSpace(taskCode)
	if taskCode == "" {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.WorkflowTask.Query().
		Where(workflowtask.TaskCode(taskCode)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}
	return entWorkflowTaskToBiz(row), nil
}

func (r *workflowRepo) ResolveWorkflowTaskMutation(
	ctx context.Context,
	taskID int,
	idempotencyKey string,
	intentHash string,
	commandKey string,
	actorID int,
) (*biz.WorkflowTask, bool, error) {
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	intentHash = strings.TrimSpace(intentHash)
	commandKey = strings.TrimSpace(commandKey)
	if taskID <= 0 || idempotencyKey == "" || !workflowTaskIntentHashValid(intentHash) || commandKey == "" || actorID <= 0 {
		return nil, false, biz.ErrBadParam
	}
	event, err := r.data.postgres.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(taskID),
			workflowtaskevent.IdempotencyKey(idempotencyKey),
		).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return workflowTaskMutationReceiptResult(event, intentHash, commandKey, actorID)
}

func (r *workflowRepo) ListWorkflowTasks(ctx context.Context, filter biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	query := r.data.postgres.WorkflowTask.Query()
	if filter.VisibilityScope != nil {
		query = query.Where(workflowTaskRevisionVisibilityPredicate(filter.VisibilityScope, filter.OwnerRoleKey))
	} else if scopePredicate := workflowTaskVisibilityPredicate(filter); scopePredicate != nil {
		query = query.Where(scopePredicate)
	} else if filter.OwnerRoleKey != "" {
		query = query.Where(workflowtask.OwnerRoleKey(filter.OwnerRoleKey))
	}
	if filter.Keyword != "" {
		query = query.Where(workflowTaskKeywordPredicate(filter.Keyword))
	}
	if filter.TaskStatusKey != "" {
		query = query.Where(workflowtask.TaskStatusKey(filter.TaskStatusKey))
	}
	if filter.TaskGroup != "" {
		query = query.Where(workflowtask.TaskGroup(filter.TaskGroup))
	}
	if filter.SourceType != "" {
		query = query.Where(workflowtask.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		query = query.Where(workflowtask.SourceID(filter.SourceID))
	}
	if filter.DueFrom != nil {
		query = query.Where(workflowtask.DueAtGTE(*filter.DueFrom))
	}
	if filter.DueTo != nil {
		query = query.Where(workflowtask.DueAtLTE(*filter.DueTo))
	}

	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}

	rows, err := query.
		Order(ent.Desc(workflowtask.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}

	out := make([]*biz.WorkflowTask, 0, len(rows))
	for _, row := range rows {
		out = append(out, entWorkflowTaskToBiz(row))
	}
	return out, total, nil
}

func workflowTaskVisibilityPredicate(filter biz.WorkflowTaskFilter) predicate.WorkflowTask {
	visible := make([]predicate.WorkflowTask, 0, 2)
	if filter.OwnerRoleKey != "" {
		for _, roleKey := range filter.VisibleOwnerRoleKeys {
			if roleKey == filter.OwnerRoleKey {
				visible = append(visible, workflowtask.OwnerRoleKey(filter.OwnerRoleKey))
				break
			}
		}
	} else if len(filter.VisibleOwnerRoleKeys) > 0 {
		visible = append(visible, workflowtask.OwnerRoleKeyIn(filter.VisibleOwnerRoleKeys...))
	}
	if filter.VisibleAssigneeID != nil && *filter.VisibleAssigneeID > 0 {
		assigned := workflowtask.AssigneeID(*filter.VisibleAssigneeID)
		if filter.OwnerRoleKey != "" {
			assigned = workflowtask.And(assigned, workflowtask.OwnerRoleKey(filter.OwnerRoleKey))
		}
		visible = append(visible, assigned)
	}
	switch len(visible) {
	case 0:
		return nil
	case 1:
		return visible[0]
	default:
		return workflowtask.Or(visible...)
	}
}

func (r *workflowRepo) CreateWorkflowTask(ctx context.Context, in *biz.WorkflowTaskCreate, actorID int) (*biz.WorkflowTask, error) {
	if in == nil || in.TaskStatusKey != strings.TrimSpace(in.TaskStatusKey) ||
		!biz.IsCreatableWorkflowTaskState(in.TaskStatusKey) || in.BlockedReason != nil {
		return nil, biz.ErrBadParam
	}
	publicCreate := strings.TrimSpace(in.IdempotencyKey) != ""
	if publicCreate && (actorID <= 0 || in.IdempotencyKey != strings.TrimSpace(in.IdempotencyKey) ||
		!workflowTaskIntentHashValid(in.IntentHash)) {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)
	if publicCreate {
		if replayed, found, err := resolveWorkflowTaskCreateInTx(ctx, tx, actorID, in.IdempotencyKey, in.IntentHash); err != nil || found {
			return replayed, err
		}
	}

	builder := tx.WorkflowTask.Create().
		SetTaskCode(in.TaskCode).
		SetTaskGroup(in.TaskGroup).
		SetTaskName(in.TaskName).
		SetSourceType(in.SourceType).
		SetSourceID(in.SourceID).
		SetNillableSourceNo(in.SourceNo).
		SetNillableBusinessStatusKey(in.BusinessStatusKey).
		SetTaskStatusKey(in.TaskStatusKey).
		SetOwnerRoleKey(in.OwnerRoleKey).
		SetNillableOwnerPoolKey(in.OwnerPoolKey).
		SetNillableRequiredCapabilityKey(in.RequiredCapabilityKey).
		SetNillableConfigRevision(in.ConfigRevision).
		SetNillableProcessInstanceID(in.ProcessInstanceID).
		SetNillableProcessNodeInstanceID(in.ProcessNodeInstanceID).
		SetNillableAssigneeID(in.AssigneeID).
		SetPriority(in.Priority).
		SetNillableBlockedReason(in.BlockedReason).
		SetCriticalPath(in.CriticalPath).
		SetNillableDueAt(in.DueAt).
		SetPayload(in.Payload)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}
	if publicCreate {
		builder.SetCreateIdempotencyKey(in.IdempotencyKey).SetCreateIntentHash(in.IntentHash)
	}

	row, err := builder.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if publicCreate {
				_ = tx.Rollback()
				if replayed, found, replayErr := r.resolveWorkflowTaskCreate(ctx, actorID, in.IdempotencyKey, in.IntentHash); replayErr != nil || found {
					return replayed, replayErr
				}
			}
			return nil, biz.ErrWorkflowTaskExists
		}
		return nil, err
	}

	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
		SetTaskVersion(row.Version).
		SetEventType("created").
		SetToStatusKey(in.TaskStatusKey).
		SetPayload(map[string]any{})
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
	}
	if publicCreate {
		mutationResult, resultErr := workflowTaskMutationResultMap(entWorkflowTaskToBiz(row))
		if resultErr != nil {
			return nil, resultErr
		}
		eventBuilder.
			SetCommandKey("create_task").
			SetIdempotencyKey(in.IdempotencyKey).
			SetIntentHash(in.IntentHash).
			SetMutationResult(mutationResult)
	}
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entWorkflowTaskToBiz(row), nil
}

func resolveWorkflowTaskCreateInTx(
	ctx context.Context,
	tx *ent.Tx,
	actorID int,
	idempotencyKey string,
	intentHash string,
) (*biz.WorkflowTask, bool, error) {
	row, err := tx.WorkflowTask.Query().Where(
		workflowtask.CreatedBy(actorID),
		workflowtask.CreateIdempotencyKey(idempotencyKey),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.CreateIntentHash == nil || *row.CreateIntentHash != intentHash {
		return nil, false, biz.ErrIdempotencyConflict
	}
	event, err := tx.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(row.ID),
		workflowtaskevent.EventType("created"),
	).Only(ctx)
	if err != nil {
		return nil, false, err
	}
	return workflowTaskMutationReceiptResult(event, intentHash, "create_task", actorID)
}

func (r *workflowRepo) resolveWorkflowTaskCreate(
	ctx context.Context,
	actorID int,
	idempotencyKey string,
	intentHash string,
) (*biz.WorkflowTask, bool, error) {
	row, err := r.data.postgres.WorkflowTask.Query().Where(
		workflowtask.CreatedBy(actorID),
		workflowtask.CreateIdempotencyKey(idempotencyKey),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.CreateIntentHash == nil || *row.CreateIntentHash != intentHash {
		return nil, false, biz.ErrIdempotencyConflict
	}
	event, err := r.data.postgres.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(row.ID),
		workflowtaskevent.EventType("created"),
	).Only(ctx)
	if err != nil {
		return nil, false, err
	}
	return workflowTaskMutationReceiptResult(event, intentHash, "create_task", actorID)
}

func (r *workflowRepo) UpdateWorkflowTaskStatus(ctx context.Context, in *biz.WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 ||
		!workflowTaskMutationIdentityValid(in.CommandKey, in.IdempotencyKey, in.IntentHash) {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)
	if replayed, found, err := resolveWorkflowTaskMutationInTx(ctx, tx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID); err != nil || found {
		return replayed, err
	}

	current, err := tx.WorkflowTask.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}
	expectedVersion := in.ExpectedVersion
	if current.Version != expectedVersion {
		return nil, workflowTaskMutationConflict(current.TaskStatusKey)
	}
	if biz.IsTerminalWorkflowTaskStatus(current.TaskStatusKey) {
		return nil, biz.ErrWorkflowTaskSettled
	}
	if !biz.CanTransitionWorkflowTaskStatus(current.TaskStatusKey, in.TaskStatusKey) {
		return nil, biz.ErrBadParam
	}
	if (in.TaskStatusKey == "ready" || in.TaskStatusKey == "blocked" || in.TaskStatusKey == "rejected") && strings.TrimSpace(in.Reason) == "" {
		return nil, biz.ErrBadParam
	}
	resumePreservesBusinessProjection := current.TaskStatusKey == "blocked" && in.TaskStatusKey == "ready"
	if resumePreservesBusinessProjection && (strings.TrimSpace(in.BusinessStatusKey) != "" || in.SideEffects != nil) {
		return nil, biz.ErrBadParam
	}

	now := time.Now()
	update := tx.WorkflowTask.Update().
		Where(
			workflowtask.IDEQ(in.ID),
			workflowtask.VersionEQ(expectedVersion),
			workflowtask.TaskStatusKeyEQ(current.TaskStatusKey),
			workflowtask.TaskStatusKeyNotIn("done", "rejected"),
		).
		SetTaskStatusKey(in.TaskStatusKey).
		SetPayload(in.Payload).
		AddVersion(1)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	// Resuming a collaboration task never invents a previous business phase. The
	// source usecase must move the business projection in a later explicit action.
	if !resumePreservesBusinessProjection && in.BusinessStatusKey != "" {
		update.SetBusinessStatusKey(in.BusinessStatusKey)
	}

	switch in.TaskStatusKey {
	case "done", "rejected":
		update.SetCompletedAt(now)
	}

	switch in.TaskStatusKey {
	case "blocked", "rejected":
		if in.Reason != "" {
			update.SetBlockedReason(in.Reason)
		} else {
			update.ClearBlockedReason()
		}
	default:
		update.ClearBlockedReason()
	}

	updatedCount, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if updatedCount == 0 {
		if replayed, found, replayErr := resolveWorkflowTaskMutationInTx(ctx, tx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID); replayErr != nil || found {
			return replayed, replayErr
		}
		latest, getErr := tx.WorkflowTask.Get(ctx, in.ID)
		if getErr != nil {
			if ent.IsNotFound(getErr) {
				return nil, biz.ErrWorkflowTaskNotFound
			}
			return nil, getErr
		}
		return nil, workflowTaskMutationConflict(latest.TaskStatusKey)
	}
	row, err := tx.WorkflowTask.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}

	resultTask := entWorkflowTaskToBiz(row)
	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
		SetTaskVersion(row.Version).
		SetEventType("status_changed").
		SetFromStatusKey(current.TaskStatusKey).
		SetToStatusKey(in.TaskStatusKey).
		SetPayload(in.Payload)
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
	}
	if actorRoleKey != "" {
		eventBuilder.SetActorRoleKey(actorRoleKey)
	}
	if in.Reason != "" {
		eventBuilder.SetReason(in.Reason)
	}
	mutationResult, resultErr := workflowTaskMutationResultMap(resultTask)
	if resultErr != nil {
		return nil, resultErr
	}
	eventBuilder.
		SetCommandKey(strings.TrimSpace(in.CommandKey)).
		SetIdempotencyKey(strings.TrimSpace(in.IdempotencyKey)).
		SetIntentHash(strings.TrimSpace(in.IntentHash)).
		SetMutationResult(mutationResult)
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, err
	}

	if effects := in.SideEffects; effects != nil {
		if effects.BusinessState != nil {
			if _, err := upsertWorkflowBusinessStateInTx(ctx, tx, effects.BusinessState); err != nil {
				return nil, err
			}
		}
		if effects.DerivedTask != nil {
			eventPayload := map[string]any{
				"derived_from_task_id": effects.DerivedFromTaskID,
				"workflow_rule_key":    effects.WorkflowRuleKey,
			}
			if _, _, err := ensureActiveWorkflowTaskInTx(ctx, tx, effects.DerivedTask, actorID, actorRoleKey, eventPayload, effects.RefreshExistingDerivedTaskPayload); err != nil {
				return nil, err
			}
		}
	}
	if in.AuditEvent != nil {
		if err := createRuntimeAuditEventInTx(ctx, tx, in.AuditEvent); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return resultTask, nil
}

func (r *workflowRepo) UrgeWorkflowTask(ctx context.Context, in *biz.WorkflowTaskUrge, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 ||
		!workflowTaskMutationIdentityValid(in.CommandKey, in.IdempotencyKey, in.IntentHash) {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)
	if replayed, found, err := resolveWorkflowTaskMutationInTx(ctx, tx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID); err != nil || found {
		return replayed, err
	}

	current, err := tx.WorkflowTask.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}
	expectedVersion := in.ExpectedVersion
	if current.Version != expectedVersion {
		return nil, workflowTaskMutationConflict(current.TaskStatusKey)
	}

	now := time.Now()
	nextPayload := copyWorkflowPayload(current.Payload)
	for key, value := range in.Payload {
		nextPayload[key] = value
	}
	urgeCount := current.UrgeCount + 1
	trimmedActorRoleKey := biz.NormalizeRoleKey(actorRoleKey)
	targetRoleKey := workflowEscalationTarget(in.Action)

	nextPayload["urged"] = true
	nextPayload["urge_count"] = urgeCount
	nextPayload["last_urge_at"] = now.Unix()
	nextPayload["last_urge_reason"] = in.Reason
	nextPayload["last_urge_action"] = in.Action
	nextPayload["last_urge_actor_role_key"] = trimmedActorRoleKey
	nextPayload["notification_type"] = "task_urged"
	nextPayload["alert_type"] = "urged_task"

	if targetRoleKey != "" {
		nextPayload["escalated"] = true
		nextPayload["escalate_target_role_key"] = targetRoleKey
		nextPayload["notification_type"] = "urgent_escalation"
		nextPayload["alert_type"] = "urgent_escalation"
	}

	update := tx.WorkflowTask.Update().
		Where(
			workflowtask.IDEQ(in.ID),
			workflowtask.VersionEQ(expectedVersion),
			workflowtask.TaskStatusKeyEQ(current.TaskStatusKey),
			workflowtask.TaskStatusKeyNotIn("done", "rejected"),
		).
		SetPayload(nextPayload).
		AddUrgeCount(1).
		SetLastUrgedAt(now).
		SetLastUrgedBy(actorID).
		AddVersion(1)
	if trimmedActorRoleKey != "" {
		update.SetLastUrgedByRoleKey(trimmedActorRoleKey)
	} else {
		update.ClearLastUrgedByRoleKey()
	}
	if targetRoleKey != "" {
		update.SetEscalatedAt(now).SetEscalateTargetRoleKey(targetRoleKey)
	}
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}

	updatedCount, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if updatedCount == 0 {
		if replayed, found, replayErr := resolveWorkflowTaskMutationInTx(ctx, tx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID); replayErr != nil || found {
			return replayed, replayErr
		}
		latest, getErr := tx.WorkflowTask.Get(ctx, in.ID)
		if getErr != nil {
			if ent.IsNotFound(getErr) {
				return nil, biz.ErrWorkflowTaskNotFound
			}
			return nil, getErr
		}
		return nil, workflowTaskMutationConflict(latest.TaskStatusKey)
	}
	row, err := tx.WorkflowTask.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}

	resultTask := entWorkflowTaskToBiz(row)
	eventPayload := copyWorkflowPayload(nextPayload)
	eventPayload["action"] = in.Action
	eventPayload["urge_count"] = urgeCount

	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
		SetTaskVersion(row.Version).
		SetEventType(in.Action).
		SetFromStatusKey(current.TaskStatusKey).
		SetToStatusKey(current.TaskStatusKey).
		SetReason(in.Reason).
		SetPayload(eventPayload)
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
	}
	if trimmedActorRoleKey != "" {
		eventBuilder.SetActorRoleKey(trimmedActorRoleKey)
	}
	mutationResult, resultErr := workflowTaskMutationResultMap(resultTask)
	if resultErr != nil {
		return nil, resultErr
	}
	eventBuilder.
		SetCommandKey(strings.TrimSpace(in.CommandKey)).
		SetIdempotencyKey(strings.TrimSpace(in.IdempotencyKey)).
		SetIntentHash(strings.TrimSpace(in.IntentHash)).
		SetMutationResult(mutationResult)
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return resultTask, nil
}

func resolveWorkflowTaskMutationInTx(
	ctx context.Context,
	tx *ent.Tx,
	taskID int,
	idempotencyKey string,
	intentHash string,
	commandKey string,
	actorID int,
) (*biz.WorkflowTask, bool, error) {
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	intentHash = strings.TrimSpace(intentHash)
	commandKey = strings.TrimSpace(commandKey)
	if taskID <= 0 || idempotencyKey == "" || !workflowTaskIntentHashValid(intentHash) || commandKey == "" || actorID <= 0 {
		return nil, false, biz.ErrBadParam
	}
	event, err := tx.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(taskID),
			workflowtaskevent.IdempotencyKey(idempotencyKey),
		).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return workflowTaskMutationReceiptResult(event, intentHash, commandKey, actorID)
}

func workflowTaskMutationReceiptResult(event *ent.WorkflowTaskEvent, intentHash string, commandKey string, actorID int) (*biz.WorkflowTask, bool, error) {
	if event == nil || event.TaskVersion == nil || event.IdempotencyKey == nil || event.IntentHash == nil || event.CommandKey == nil ||
		*event.IdempotencyKey != strings.TrimSpace(*event.IdempotencyKey) || strings.TrimSpace(*event.IdempotencyKey) == "" ||
		!workflowTaskIntentHashValid(*event.IntentHash) ||
		strings.TrimSpace(*event.CommandKey) == "" || len(event.MutationResult) == 0 {
		return nil, false, fmt.Errorf("workflow task mutation receipt is incomplete")
	}
	intentHash = strings.TrimSpace(intentHash)
	if !workflowTaskIntentHashValid(intentHash) {
		return nil, false, biz.ErrBadParam
	}
	if *event.IntentHash != intentHash {
		return nil, false, biz.ErrIdempotencyConflict
	}
	commandKey = strings.TrimSpace(commandKey)
	storedCommandKey := *event.CommandKey
	if event.ActorID == nil || *event.ActorID != actorID ||
		storedCommandKey != strings.TrimSpace(storedCommandKey) || storedCommandKey != commandKey || event.ToStatusKey == nil {
		return nil, false, fmt.Errorf("workflow task mutation receipt identity is inconsistent")
	}
	storedStatusKey := *event.ToStatusKey
	if storedStatusKey != strings.TrimSpace(storedStatusKey) || !biz.IsKnownWorkflowTaskState(storedStatusKey) {
		return nil, false, fmt.Errorf("workflow task mutation receipt status is invalid")
	}
	task, err := workflowTaskMutationResultFromMap(event.MutationResult)
	if err != nil {
		return nil, false, err
	}
	if task.ID != event.TaskID || task.Version != *event.TaskVersion || task.TaskStatusKey != storedStatusKey {
		return nil, false, fmt.Errorf("workflow task mutation receipt result does not match event")
	}
	return task, true, nil
}

func workflowTaskMutationIdentityValid(commandKey string, idempotencyKey string, intentHash string) bool {
	commandKey = strings.TrimSpace(commandKey)
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	intentHash = strings.TrimSpace(intentHash)
	return commandKey != "" && idempotencyKey != "" && workflowTaskIntentHashValid(intentHash)
}

func workflowTaskIntentHashValid(intentHash string) bool {
	if len(intentHash) != 64 {
		return false
	}
	for index := range intentHash {
		if (intentHash[index] < '0' || intentHash[index] > '9') &&
			(intentHash[index] < 'a' || intentHash[index] > 'f') {
			return false
		}
	}
	return true
}

func workflowTaskMutationResultMap(task *biz.WorkflowTask) (map[string]any, error) {
	if task == nil {
		return nil, biz.ErrBadParam
	}
	taskSnapshot := workflowTaskMutationResultTaskV1FromBiz(task)
	if _, err := taskSnapshot.toBiz(); err != nil {
		return nil, err
	}
	envelope := workflowTaskMutationResultEnvelopeV1{
		Contract: workflowTaskMutationResultContractV1,
		Task:     taskSnapshot,
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		return nil, err
	}
	result := map[string]any{}
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func workflowTaskMutationResultFromMap(result map[string]any) (*biz.WorkflowTask, error) {
	if len(result) == 0 {
		return nil, fmt.Errorf("workflow task mutation result is empty")
	}
	contract, ok := result["contract"].(string)
	if !ok || contract != workflowTaskMutationResultContractV1 {
		return nil, fmt.Errorf("workflow task mutation result contract is unsupported")
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	var envelope workflowTaskMutationResultEnvelopeV1
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		return nil, err
	}
	if envelope.Contract != workflowTaskMutationResultContractV1 || envelope.Task == nil {
		return nil, fmt.Errorf("workflow task mutation result envelope is invalid")
	}
	task, err := envelope.Task.toBiz()
	if err != nil {
		return nil, err
	}
	return task, nil
}

func workflowTaskMutationResultTaskV1FromBiz(task *biz.WorkflowTask) *workflowTaskMutationResultTaskV1 {
	if task == nil {
		return nil
	}
	payload := task.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	return &workflowTaskMutationResultTaskV1{
		ID:                    task.ID,
		TaskCode:              task.TaskCode,
		TaskGroup:             task.TaskGroup,
		TaskName:              task.TaskName,
		SourceType:            task.SourceType,
		SourceID:              task.SourceID,
		SourceNo:              task.SourceNo,
		BusinessStatusKey:     task.BusinessStatusKey,
		TaskStatusKey:         task.TaskStatusKey,
		OwnerRoleKey:          task.OwnerRoleKey,
		OwnerPoolKey:          task.OwnerPoolKey,
		RequiredCapabilityKey: task.RequiredCapabilityKey,
		ConfigRevision:        task.ConfigRevision,
		ProcessInstanceID:     task.ProcessInstanceID,
		ProcessNodeInstanceID: task.ProcessNodeInstanceID,
		AssigneeID:            task.AssigneeID,
		Priority:              task.Priority,
		BlockedReason:         task.BlockedReason,
		CriticalPath:          task.CriticalPath,
		UrgeCount:             task.UrgeCount,
		LastUrgedAt:           task.LastUrgedAt,
		LastUrgedBy:           task.LastUrgedBy,
		LastUrgedByRoleKey:    task.LastUrgedByRoleKey,
		EscalatedAt:           task.EscalatedAt,
		EscalateTargetRoleKey: task.EscalateTargetRoleKey,
		DueAt:                 task.DueAt,
		CompletedAt:           task.CompletedAt,
		Payload:               payload,
		Version:               task.Version,
		CreatedBy:             task.CreatedBy,
		UpdatedBy:             task.UpdatedBy,
		CreatedAt:             task.CreatedAt,
		UpdatedAt:             task.UpdatedAt,
	}
}

func (task workflowTaskMutationResultTaskV1) toBiz() (*biz.WorkflowTask, error) {
	taskStatusKey := strings.TrimSpace(task.TaskStatusKey)
	if task.ID <= 0 || task.Version <= 0 || task.SourceID <= 0 ||
		strings.TrimSpace(task.TaskCode) == "" || strings.TrimSpace(task.TaskGroup) == "" ||
		strings.TrimSpace(task.TaskName) == "" || strings.TrimSpace(task.SourceType) == "" ||
		task.TaskStatusKey != taskStatusKey || !biz.IsKnownWorkflowTaskState(taskStatusKey) || strings.TrimSpace(task.OwnerRoleKey) == "" ||
		task.CreatedAt.IsZero() || task.UpdatedAt.IsZero() {
		return nil, fmt.Errorf("workflow task mutation result is invalid")
	}
	if task.BusinessStatusKey != nil {
		businessStatusKey := strings.TrimSpace(*task.BusinessStatusKey)
		if *task.BusinessStatusKey != businessStatusKey ||
			businessStatusKey == "" ||
			!biz.IsValidWorkflowBusinessState(businessStatusKey) {
			return nil, fmt.Errorf("workflow task mutation result business status is invalid")
		}
	}
	payload := task.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	return &biz.WorkflowTask{
		ID:                    task.ID,
		TaskCode:              task.TaskCode,
		TaskGroup:             task.TaskGroup,
		TaskName:              task.TaskName,
		SourceType:            task.SourceType,
		SourceID:              task.SourceID,
		SourceNo:              task.SourceNo,
		BusinessStatusKey:     task.BusinessStatusKey,
		TaskStatusKey:         task.TaskStatusKey,
		OwnerRoleKey:          task.OwnerRoleKey,
		OwnerPoolKey:          task.OwnerPoolKey,
		RequiredCapabilityKey: task.RequiredCapabilityKey,
		ConfigRevision:        task.ConfigRevision,
		ProcessInstanceID:     task.ProcessInstanceID,
		ProcessNodeInstanceID: task.ProcessNodeInstanceID,
		AssigneeID:            task.AssigneeID,
		Priority:              task.Priority,
		BlockedReason:         task.BlockedReason,
		CriticalPath:          task.CriticalPath,
		UrgeCount:             task.UrgeCount,
		LastUrgedAt:           task.LastUrgedAt,
		LastUrgedBy:           task.LastUrgedBy,
		LastUrgedByRoleKey:    task.LastUrgedByRoleKey,
		EscalatedAt:           task.EscalatedAt,
		EscalateTargetRoleKey: task.EscalateTargetRoleKey,
		DueAt:                 task.DueAt,
		CompletedAt:           task.CompletedAt,
		Payload:               payload,
		Version:               task.Version,
		CreatedBy:             task.CreatedBy,
		UpdatedBy:             task.UpdatedBy,
		CreatedAt:             task.CreatedAt,
		UpdatedAt:             task.UpdatedAt,
	}, nil
}

func (r *workflowRepo) ListWorkflowBusinessStates(ctx context.Context, filter biz.WorkflowBusinessStateFilter) ([]*biz.WorkflowBusinessState, int, error) {
	query := r.data.postgres.WorkflowBusinessState.Query()
	if filter.SourceType != "" {
		query = query.Where(workflowbusinessstate.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		query = query.Where(workflowbusinessstate.SourceID(filter.SourceID))
	}
	if filter.BusinessStatusKey != "" {
		query = query.Where(workflowbusinessstate.BusinessStatusKey(filter.BusinessStatusKey))
	}
	if filter.OwnerRoleKey != "" {
		query = query.Where(workflowbusinessstate.OwnerRoleKey(filter.OwnerRoleKey))
	}

	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}

	rows, err := query.
		Order(ent.Desc(workflowbusinessstate.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}

	out := make([]*biz.WorkflowBusinessState, 0, len(rows))
	for _, row := range rows {
		out = append(out, entWorkflowBusinessStateToBiz(row))
	}
	return out, total, nil
}

func (r *workflowRepo) UpsertWorkflowBusinessState(ctx context.Context, in *biz.WorkflowBusinessStateUpsert, actorID int) (*biz.WorkflowBusinessState, error) {
	existing, err := r.data.postgres.WorkflowBusinessState.Query().
		Where(
			workflowbusinessstate.SourceType(in.SourceType),
			workflowbusinessstate.SourceID(in.SourceID),
		).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}

	if existing == nil {
		builder := r.data.postgres.WorkflowBusinessState.Create().
			SetSourceType(in.SourceType).
			SetSourceID(in.SourceID).
			SetNillableSourceNo(in.SourceNo).
			SetNillableOrderID(in.OrderID).
			SetNillableBatchID(in.BatchID).
			SetBusinessStatusKey(in.BusinessStatusKey).
			SetNillableOwnerRoleKey(in.OwnerRoleKey).
			SetNillableBlockedReason(in.BlockedReason).
			SetStatusChangedAt(time.Now()).
			SetPayload(in.Payload)
		row, err := builder.Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, biz.ErrWorkflowBusinessStateFound
			}
			return nil, err
		}
		return entWorkflowBusinessStateToBiz(row), nil
	}

	update := r.data.postgres.WorkflowBusinessState.UpdateOneID(existing.ID).
		SetBusinessStatusKey(in.BusinessStatusKey).
		SetStatusChangedAt(time.Now()).
		SetPayload(in.Payload)
	if in.SourceNo != nil {
		update.SetSourceNo(*in.SourceNo)
	} else {
		update.ClearSourceNo()
	}
	if in.OrderID != nil {
		update.SetOrderID(*in.OrderID)
	} else {
		update.ClearOrderID()
	}
	if in.BatchID != nil {
		update.SetBatchID(*in.BatchID)
	} else {
		update.ClearBatchID()
	}
	if in.OwnerRoleKey != nil {
		update.SetOwnerRoleKey(*in.OwnerRoleKey)
	} else {
		update.ClearOwnerRoleKey()
	}
	if in.BlockedReason != nil {
		update.SetBlockedReason(*in.BlockedReason)
	} else {
		update.ClearBlockedReason()
	}

	row, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	_ = actorID
	return entWorkflowBusinessStateToBiz(row), nil
}

func upsertWorkflowBusinessStateInTx(ctx context.Context, tx *ent.Tx, in *biz.WorkflowBusinessStateUpsert) (*ent.WorkflowBusinessState, error) {
	existing, err := tx.WorkflowBusinessState.Query().
		Where(
			workflowbusinessstate.SourceType(in.SourceType),
			workflowbusinessstate.SourceID(in.SourceID),
		).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}

	now := time.Now()
	if existing == nil {
		builder := tx.WorkflowBusinessState.Create().
			SetSourceType(in.SourceType).
			SetSourceID(in.SourceID).
			SetNillableSourceNo(in.SourceNo).
			SetNillableOrderID(in.OrderID).
			SetNillableBatchID(in.BatchID).
			SetBusinessStatusKey(in.BusinessStatusKey).
			SetNillableOwnerRoleKey(in.OwnerRoleKey).
			SetNillableBlockedReason(in.BlockedReason).
			SetStatusChangedAt(now).
			SetPayload(in.Payload)
		row, err := builder.Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, biz.ErrWorkflowBusinessStateFound
			}
			return nil, err
		}
		return row, nil
	}

	update := tx.WorkflowBusinessState.UpdateOneID(existing.ID).
		SetBusinessStatusKey(in.BusinessStatusKey).
		SetStatusChangedAt(now).
		SetPayload(in.Payload)
	if in.SourceNo != nil {
		update.SetSourceNo(*in.SourceNo)
	} else {
		update.ClearSourceNo()
	}
	if in.OrderID != nil {
		update.SetOrderID(*in.OrderID)
	} else {
		update.ClearOrderID()
	}
	if in.BatchID != nil {
		update.SetBatchID(*in.BatchID)
	} else {
		update.ClearBatchID()
	}
	if in.OwnerRoleKey != nil {
		update.SetOwnerRoleKey(*in.OwnerRoleKey)
	} else {
		update.ClearOwnerRoleKey()
	}
	if in.BlockedReason != nil {
		update.SetBlockedReason(*in.BlockedReason)
	} else {
		update.ClearBlockedReason()
	}

	return update.Save(ctx)
}

func ensureActiveWorkflowTaskInTx(
	ctx context.Context,
	tx *ent.Tx,
	in *biz.WorkflowTaskCreate,
	actorID int,
	actorRoleKey string,
	eventPayload map[string]any,
	refreshExistingPayload bool,
) (*ent.WorkflowTask, bool, error) {
	existing, err := tx.WorkflowTask.Query().
		Where(
			workflowtask.SourceType(in.SourceType),
			workflowtask.SourceID(in.SourceID),
			workflowtask.TaskGroup(in.TaskGroup),
			workflowtask.OwnerRoleKey(in.OwnerRoleKey),
			workflowtask.TaskStatusKeyNotIn("done", "rejected"),
		).
		Order(ent.Asc(workflowtask.FieldID)).
		First(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, false, err
	}
	if existing != nil {
		if refreshExistingPayload {
			update := tx.WorkflowTask.Update().
				Where(
					workflowtask.IDEQ(existing.ID),
					workflowtask.VersionEQ(existing.Version),
					workflowtask.TaskStatusKeyEQ(existing.TaskStatusKey),
					workflowtask.TaskStatusKeyNotIn("done", "rejected"),
				).
				SetPayload(in.Payload).
				SetNillableOwnerPoolKey(in.OwnerPoolKey).
				SetNillableRequiredCapabilityKey(in.RequiredCapabilityKey).
				SetNillableConfigRevision(in.ConfigRevision).
				SetNillableProcessInstanceID(in.ProcessInstanceID).
				SetNillableProcessNodeInstanceID(in.ProcessNodeInstanceID).
				AddVersion(1)
			if actorID > 0 {
				update.SetUpdatedBy(actorID)
			}
			updatedCount, err := update.Save(ctx)
			if err != nil {
				return nil, false, err
			}
			if updatedCount == 0 {
				return nil, false, biz.ErrWorkflowTaskConflict
			}
			updated, err := tx.WorkflowTask.Get(ctx, existing.ID)
			if err != nil {
				return nil, false, err
			}
			if eventPayload == nil {
				eventPayload = map[string]any{}
			}
			eventBuilder := tx.WorkflowTaskEvent.Create().
				SetTaskID(updated.ID).
				SetTaskVersion(updated.Version).
				SetEventType("payload_refreshed").
				SetFromStatusKey(updated.TaskStatusKey).
				SetToStatusKey(updated.TaskStatusKey).
				SetPayload(eventPayload)
			if actorID > 0 {
				eventBuilder.SetActorID(actorID)
			}
			if strings.TrimSpace(actorRoleKey) != "" {
				eventBuilder.SetActorRoleKey(strings.TrimSpace(actorRoleKey))
			}
			if _, err := eventBuilder.Save(ctx); err != nil {
				return nil, false, err
			}
			return updated, false, nil
		}
		return existing, false, nil
	}

	builder := tx.WorkflowTask.Create().
		SetTaskCode(in.TaskCode).
		SetTaskGroup(in.TaskGroup).
		SetTaskName(in.TaskName).
		SetSourceType(in.SourceType).
		SetSourceID(in.SourceID).
		SetNillableSourceNo(in.SourceNo).
		SetNillableBusinessStatusKey(in.BusinessStatusKey).
		SetTaskStatusKey(in.TaskStatusKey).
		SetOwnerRoleKey(in.OwnerRoleKey).
		SetNillableOwnerPoolKey(in.OwnerPoolKey).
		SetNillableRequiredCapabilityKey(in.RequiredCapabilityKey).
		SetNillableConfigRevision(in.ConfigRevision).
		SetNillableProcessInstanceID(in.ProcessInstanceID).
		SetNillableProcessNodeInstanceID(in.ProcessNodeInstanceID).
		SetNillableAssigneeID(in.AssigneeID).
		SetPriority(in.Priority).
		SetNillableBlockedReason(in.BlockedReason).
		SetCriticalPath(in.CriticalPath).
		SetNillableDueAt(in.DueAt).
		SetPayload(in.Payload)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}
	row, err := builder.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, false, biz.ErrWorkflowTaskExists
		}
		return nil, false, err
	}

	if eventPayload == nil {
		eventPayload = map[string]any{}
	}
	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
		SetTaskVersion(row.Version).
		SetEventType("created").
		SetToStatusKey(in.TaskStatusKey).
		SetPayload(eventPayload)
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
	}
	if strings.TrimSpace(actorRoleKey) != "" {
		eventBuilder.SetActorRoleKey(strings.TrimSpace(actorRoleKey))
	}
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, false, err
	}
	return row, true, nil
}

func entWorkflowTaskToBiz(row *ent.WorkflowTask) *biz.WorkflowTask {
	if row == nil {
		return nil
	}
	payload := make(map[string]any, len(row.Payload))
	for key, value := range row.Payload {
		payload[key] = value
	}
	blockedReason := row.BlockedReason
	if row.TaskStatusKey != "blocked" && row.TaskStatusKey != "rejected" {
		blockedReason = nil
		delete(payload, "blocked_reason")
		delete(payload, "rejected_reason")
	}
	return &biz.WorkflowTask{
		ID:                    row.ID,
		TaskCode:              row.TaskCode,
		TaskGroup:             row.TaskGroup,
		TaskName:              row.TaskName,
		SourceType:            row.SourceType,
		SourceID:              row.SourceID,
		SourceNo:              row.SourceNo,
		BusinessStatusKey:     row.BusinessStatusKey,
		TaskStatusKey:         row.TaskStatusKey,
		OwnerRoleKey:          biz.NormalizeRoleKey(row.OwnerRoleKey),
		OwnerPoolKey:          row.OwnerPoolKey,
		RequiredCapabilityKey: row.RequiredCapabilityKey,
		ConfigRevision:        row.ConfigRevision,
		ProcessInstanceID:     row.ProcessInstanceID,
		ProcessNodeInstanceID: row.ProcessNodeInstanceID,
		AssigneeID:            row.AssigneeID,
		Priority:              row.Priority,
		BlockedReason:         blockedReason,
		CriticalPath:          row.CriticalPath,
		UrgeCount:             row.UrgeCount,
		LastUrgedAt:           row.LastUrgedAt,
		LastUrgedBy:           row.LastUrgedBy,
		LastUrgedByRoleKey:    biz.NormalizeOptionalRoleKey(row.LastUrgedByRoleKey),
		EscalatedAt:           row.EscalatedAt,
		EscalateTargetRoleKey: biz.NormalizeOptionalRoleKey(row.EscalateTargetRoleKey),
		DueAt:                 row.DueAt,
		CompletedAt:           row.CompletedAt,
		Payload:               payload,
		Version:               row.Version,
		CreatedBy:             row.CreatedBy,
		UpdatedBy:             row.UpdatedBy,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}

func workflowTaskMutationConflict(statusKey string) error {
	if biz.IsTerminalWorkflowTaskStatus(statusKey) {
		return biz.ErrWorkflowTaskSettled
	}
	return biz.ErrWorkflowTaskConflict
}

func entWorkflowBusinessStateToBiz(row *ent.WorkflowBusinessState) *biz.WorkflowBusinessState {
	if row == nil {
		return nil
	}
	payload := row.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	return &biz.WorkflowBusinessState{
		ID:                row.ID,
		SourceType:        row.SourceType,
		SourceID:          row.SourceID,
		SourceNo:          row.SourceNo,
		OrderID:           row.OrderID,
		BatchID:           row.BatchID,
		BusinessStatusKey: row.BusinessStatusKey,
		OwnerRoleKey:      biz.NormalizeOptionalRoleKey(row.OwnerRoleKey),
		BlockedReason:     row.BlockedReason,
		StatusChangedAt:   row.StatusChangedAt,
		Payload:           payload,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}

func rollbackEntTx(ctx context.Context, tx *ent.Tx, logger *log.Helper) {
	if tx == nil {
		return
	}
	if err := tx.Rollback(); err != nil && logger != nil {
		logger.WithContext(ctx).Warnf("rollback ent tx failed err=%v", err)
	}
}

func copyWorkflowPayload(payload map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range payload {
		out[key] = value
	}
	return out
}

func workflowPayloadInt(payload map[string]any, key string) int {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return 0
	}
	switch value := raw.(type) {
	case int:
		return value
	case int8:
		return int(value)
	case int16:
		return int(value)
	case int32:
		return int(value)
	case int64:
		return int(value)
	case float32:
		return int(value)
	case float64:
		return int(value)
	default:
		return 0
	}
}

func workflowEscalationTarget(action string) string {
	switch strings.TrimSpace(action) {
	case "escalate_to_pmc":
		return "pmc"
	case "escalate_to_boss":
		return "boss"
	default:
		return ""
	}
}
