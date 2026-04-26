package data

import (
	"context"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
)

type workflowRepo struct {
	data *Data
	log  *log.Helper
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

func (r *workflowRepo) ListWorkflowTasks(ctx context.Context, filter biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	query := r.data.postgres.WorkflowTask.Query()
	if filter.OwnerRoleKey != "" {
		query = query.Where(workflowtask.OwnerRoleKey(filter.OwnerRoleKey))
	}
	if filter.TaskStatusKey != "" {
		query = query.Where(workflowtask.TaskStatusKey(filter.TaskStatusKey))
	}
	if filter.SourceType != "" {
		query = query.Where(workflowtask.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		query = query.Where(workflowtask.SourceID(filter.SourceID))
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

func (r *workflowRepo) CreateWorkflowTask(ctx context.Context, in *biz.WorkflowTaskCreate, actorID int) (*biz.WorkflowTask, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

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
		SetNillableAssigneeID(in.AssigneeID).
		SetPriority(in.Priority).
		SetNillableBlockedReason(in.BlockedReason).
		SetNillableDueAt(in.DueAt).
		SetPayload(in.Payload)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}

	row, err := builder.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrWorkflowTaskExists
		}
		return nil, err
	}

	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
		SetEventType("created").
		SetToStatusKey(in.TaskStatusKey).
		SetPayload(map[string]any{})
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
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

func (r *workflowRepo) UpdateWorkflowTaskStatus(ctx context.Context, in *biz.WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	current, err := tx.WorkflowTask.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}

	now := time.Now()
	update := tx.WorkflowTask.UpdateOneID(in.ID).
		SetTaskStatusKey(in.TaskStatusKey).
		SetPayload(in.Payload)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}
	if in.BusinessStatusKey != "" {
		update.SetBusinessStatusKey(in.BusinessStatusKey)
	}

	switch in.TaskStatusKey {
	case "processing":
		if current.StartedAt == nil {
			update.SetStartedAt(now)
		}
	case "done":
		update.SetCompletedAt(now)
	case "closed":
		update.SetClosedAt(now)
	}

	if in.Reason != "" {
		update.SetBlockedReason(in.Reason)
	} else if in.TaskStatusKey != "blocked" && in.TaskStatusKey != "rejected" {
		update.ClearBlockedReason()
	}

	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}

	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
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

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entWorkflowTaskToBiz(row), nil
}

func (r *workflowRepo) UrgeWorkflowTask(ctx context.Context, in *biz.WorkflowTaskUrge, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	current, err := tx.WorkflowTask.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}

	now := time.Now()
	nextPayload := copyWorkflowPayload(current.Payload)
	for key, value := range in.Payload {
		nextPayload[key] = value
	}
	urgeCount := workflowPayloadInt(nextPayload, "urge_count") + 1
	trimmedActorRoleKey := strings.TrimSpace(actorRoleKey)

	nextPayload["urged"] = true
	nextPayload["urge_count"] = urgeCount
	nextPayload["last_urge_at"] = now.Unix()
	nextPayload["last_urge_reason"] = in.Reason
	nextPayload["last_urge_action"] = in.Action
	nextPayload["last_urge_actor_role_key"] = trimmedActorRoleKey
	nextPayload["notification_type"] = "task_urged"
	nextPayload["alert_type"] = "urged_task"

	if targetRoleKey := workflowEscalationTarget(in.Action); targetRoleKey != "" {
		nextPayload["escalated"] = true
		nextPayload["escalate_target_role_key"] = targetRoleKey
		nextPayload["notification_type"] = "urgent_escalation"
		nextPayload["alert_type"] = "urgent_escalation"
	}

	update := tx.WorkflowTask.UpdateOneID(in.ID).SetPayload(nextPayload)
	if actorID > 0 {
		update.SetUpdatedBy(actorID)
	}

	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrWorkflowTaskNotFound
		}
		return nil, err
	}

	eventPayload := copyWorkflowPayload(nextPayload)
	eventPayload["action"] = in.Action
	eventPayload["urge_count"] = urgeCount

	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
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
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entWorkflowTaskToBiz(row), nil
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
			workflowtask.TaskStatusKeyNotIn("done", "closed", "cancelled"),
		).
		Order(ent.Asc(workflowtask.FieldID)).
		First(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, false, err
	}
	if existing != nil {
		if refreshExistingPayload {
			update := tx.WorkflowTask.UpdateOneID(existing.ID).
				SetPayload(in.Payload)
			if actorID > 0 {
				update.SetUpdatedBy(actorID)
			}
			updated, err := update.Save(ctx)
			if err != nil {
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
		SetNillableAssigneeID(in.AssigneeID).
		SetPriority(in.Priority).
		SetNillableBlockedReason(in.BlockedReason).
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
	payload := row.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	return &biz.WorkflowTask{
		ID:                row.ID,
		TaskCode:          row.TaskCode,
		TaskGroup:         row.TaskGroup,
		TaskName:          row.TaskName,
		SourceType:        row.SourceType,
		SourceID:          row.SourceID,
		SourceNo:          row.SourceNo,
		BusinessStatusKey: row.BusinessStatusKey,
		TaskStatusKey:     row.TaskStatusKey,
		OwnerRoleKey:      biz.NormalizeRoleKey(row.OwnerRoleKey),
		AssigneeID:        row.AssigneeID,
		Priority:          row.Priority,
		BlockedReason:     row.BlockedReason,
		DueAt:             row.DueAt,
		StartedAt:         row.StartedAt,
		CompletedAt:       row.CompletedAt,
		ClosedAt:          row.ClosedAt,
		Payload:           payload,
		CreatedBy:         row.CreatedBy,
		UpdatedBy:         row.UpdatedBy,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
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
