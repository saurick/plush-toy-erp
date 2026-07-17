package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
)

const workflowSourceTaskIntentHashPayloadKey = "source_task_intent_hash"

func ensureSourceWorkflowTaskWithClient(
	ctx context.Context,
	client *ent.Client,
	task *biz.WorkflowTaskCreate,
	state *biz.WorkflowBusinessStateUpsert,
	actorID int,
) (*biz.WorkflowTask, bool, error) {
	if client == nil || task == nil || state == nil || task.TaskCode == "" ||
		!biz.IsSourceProducedWorkflowTaskGroup(task.TaskGroup) || task.SourceID <= 0 ||
		state.SourceType != task.SourceType || state.SourceID != task.SourceID {
		return nil, false, biz.ErrBadParam
	}
	intentHash, err := workflowSourceTaskIntentHash(task)
	if err != nil {
		return nil, false, err
	}
	task.Payload = cloneSourceWorkflowPayload(task.Payload)
	task.Payload[workflowSourceTaskIntentHashPayloadKey] = intentHash
	state.Payload = cloneSourceWorkflowPayload(state.Payload)
	state.Payload[workflowSourceTaskIntentHashPayloadKey] = intentHash

	existing, err := client.WorkflowTask.Query().Where(workflowtask.TaskCode(task.TaskCode)).Only(ctx)
	if err == nil {
		current := entWorkflowTaskToBiz(existing)
		if !biz.WorkflowTaskMatchesSourceProducer(current, task) ||
			workflowSourcePayloadString(current.Payload, workflowSourceTaskIntentHashPayloadKey) != intentHash {
			return nil, false, biz.ErrIdempotencyConflict
		}
		return current, false, nil
	}
	if !ent.IsNotFound(err) {
		return nil, false, err
	}

	builder := client.WorkflowTask.Create().
		SetTaskCode(task.TaskCode).
		SetTaskGroup(task.TaskGroup).
		SetTaskName(task.TaskName).
		SetSourceType(task.SourceType).
		SetSourceID(task.SourceID).
		SetNillableSourceNo(task.SourceNo).
		SetNillableBusinessStatusKey(task.BusinessStatusKey).
		SetTaskStatusKey(task.TaskStatusKey).
		SetOwnerRoleKey(task.OwnerRoleKey).
		SetNillableOwnerPoolKey(task.OwnerPoolKey).
		SetNillableRequiredCapabilityKey(task.RequiredCapabilityKey).
		SetNillableConfigRevision(task.ConfigRevision).
		SetNillableProcessInstanceID(task.ProcessInstanceID).
		SetNillableProcessNodeInstanceID(task.ProcessNodeInstanceID).
		SetNillableAssigneeID(task.AssigneeID).
		SetPriority(task.Priority).
		SetNillableBlockedReason(task.BlockedReason).
		SetCriticalPath(task.CriticalPath).
		SetNillableDueAt(task.DueAt).
		SetPayload(task.Payload)
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
	eventPayload := map[string]any{
		"source_task_contract":                 workflowSourcePayloadString(task.Payload, "source_task_contract"),
		"source_task_producer":                 workflowSourcePayloadString(task.Payload, "source_task_producer"),
		workflowSourceTaskIntentHashPayloadKey: intentHash,
	}
	eventBuilder := client.WorkflowTaskEvent.Create().
		SetTaskID(row.ID).
		SetTaskVersion(row.Version).
		SetEventType("created").
		SetToStatusKey(task.TaskStatusKey).
		SetPayload(eventPayload)
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
	}
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, false, err
	}
	if err := createInitialWorkflowSourceStateWithClient(ctx, client, state); err != nil {
		return nil, false, err
	}
	return entWorkflowTaskToBiz(row), true, nil
}

func createInitialWorkflowSourceStateWithClient(ctx context.Context, client *ent.Client, in *biz.WorkflowBusinessStateUpsert) error {
	if client == nil || in == nil || in.SourceID <= 0 || strings.TrimSpace(in.SourceType) == "" ||
		strings.TrimSpace(in.BusinessStatusKey) == "" {
		return biz.ErrBadParam
	}
	existing, err := client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(in.SourceType),
		workflowbusinessstate.SourceID(in.SourceID),
	).Only(ctx)
	if err == nil {
		if existing.BusinessStatusKey == in.BusinessStatusKey &&
			workflowSourcePayloadString(existing.Payload, "source_task_contract") == biz.WorkflowSourceTaskContractV1 &&
			workflowSourcePayloadString(existing.Payload, workflowSourceTaskIntentHashPayloadKey) == workflowSourcePayloadString(in.Payload, workflowSourceTaskIntentHashPayloadKey) {
			return nil
		}
		return biz.ErrIdempotencyConflict
	}
	if !ent.IsNotFound(err) {
		return err
	}
	builder := client.WorkflowBusinessState.Create().
		SetSourceType(in.SourceType).
		SetSourceID(in.SourceID).
		SetNillableSourceNo(in.SourceNo).
		SetNillableOrderID(in.OrderID).
		SetNillableBatchID(in.BatchID).
		SetBusinessStatusKey(in.BusinessStatusKey).
		SetNillableOwnerRoleKey(in.OwnerRoleKey).
		SetNillableBlockedReason(in.BlockedReason).
		SetPayload(in.Payload)
	if _, err := builder.Save(ctx); err != nil {
		if ent.IsConstraintError(err) {
			return biz.ErrWorkflowBusinessStateFound
		}
		return err
	}
	return nil
}

func getSourceWorkflowTaskWithClient(ctx context.Context, client *ent.Client, taskGroup string, sourceID int) (*biz.WorkflowTask, error) {
	if client == nil || sourceID <= 0 || !biz.IsSourceProducedWorkflowTaskGroup(taskGroup) {
		return nil, biz.ErrBadParam
	}
	taskCode := biz.WorkflowSourceTaskCode(taskGroup, sourceID)
	row, err := client.WorkflowTask.Query().Where(workflowtask.TaskCode(taskCode)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrWorkflowTaskNotFound
	}
	if err != nil {
		return nil, err
	}
	return entWorkflowTaskToBiz(row), nil
}

func workflowSourceTaskMatchesExpectedIntent(current *biz.WorkflowTask, expected *biz.WorkflowTaskCreate) bool {
	if !biz.WorkflowTaskMatchesSourceProducer(current, expected) {
		return false
	}
	expectedHash, err := workflowSourceTaskIntentHash(expected)
	if err != nil {
		return false
	}
	return workflowSourcePayloadString(current.Payload, workflowSourceTaskIntentHashPayloadKey) == expectedHash
}

func requireShipmentReleaseTaskDone(
	ctx context.Context,
	tx *inventoryDBTx,
	expected *biz.WorkflowTaskCreate,
) error {
	if tx == nil || tx.client == nil || expected == nil || expected.SourceID <= 0 ||
		expected.TaskGroup != biz.WorkflowSourceTaskShipmentReleaseGroup {
		return biz.ErrBadParam
	}
	current, err := getSourceWorkflowTaskWithClient(ctx, tx.client, expected.TaskGroup, expected.SourceID)
	if errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		return biz.ErrShipmentReleaseRequired
	}
	if err != nil {
		return err
	}
	if !workflowSourceTaskMatchesExpectedIntent(current, expected) {
		return fmt.Errorf("source task intent no longer matches source document: %w", biz.ErrIdempotencyConflict)
	}
	if err := lockOperationalFactRow(ctx, tx, "workflow_tasks", current.ID, biz.ErrShipmentReleaseRequired); err != nil {
		return err
	}
	current, err = getSourceWorkflowTaskWithClient(ctx, tx.client, expected.TaskGroup, expected.SourceID)
	if err != nil {
		return err
	}
	if !workflowSourceTaskMatchesExpectedIntent(current, expected) {
		return biz.ErrIdempotencyConflict
	}
	switch strings.TrimSpace(current.TaskStatusKey) {
	case "done":
		return nil
	case "rejected":
		return biz.ErrShipmentReleaseRejected
	default:
		return biz.ErrShipmentReleasePending
	}
}

func shipmentReleaseTaskForCancellation(
	ctx context.Context,
	tx *inventoryDBTx,
	expected *biz.WorkflowTaskCreate,
) (*biz.WorkflowTask, bool, error) {
	if tx == nil || tx.client == nil || expected == nil || expected.SourceID <= 0 ||
		expected.TaskGroup != biz.WorkflowSourceTaskShipmentReleaseGroup {
		return nil, false, biz.ErrBadParam
	}
	current, err := getSourceWorkflowTaskWithClient(ctx, tx.client, expected.TaskGroup, expected.SourceID)
	if errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if !workflowSourceTaskMatchesExpectedIntent(current, expected) {
		return nil, true, fmt.Errorf("source task intent no longer matches source document: %w", biz.ErrIdempotencyConflict)
	}
	if err := lockOperationalFactRow(ctx, tx, "workflow_tasks", current.ID, biz.ErrWorkflowTaskNotFound); err != nil {
		return nil, true, err
	}
	current, err = getSourceWorkflowTaskWithClient(ctx, tx.client, expected.TaskGroup, expected.SourceID)
	if err != nil {
		return nil, true, err
	}
	if !workflowSourceTaskMatchesExpectedIntent(current, expected) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	switch strings.TrimSpace(current.TaskStatusKey) {
	case "done", "rejected":
		return current, true, nil
	default:
		return nil, true, biz.ErrShipmentCancellationTaskActive
	}
}

func requireProductionSchedulingTaskTerminal(
	ctx context.Context,
	tx *inventoryDBTx,
	expected *biz.WorkflowTaskCreate,
	allowRejected bool,
) error {
	if tx == nil || tx.client == nil || expected == nil || expected.SourceID <= 0 ||
		expected.TaskGroup != biz.WorkflowSourceTaskProductionSchedulingGroup {
		return biz.ErrBadParam
	}
	task, err := getSourceWorkflowTaskWithClient(ctx, tx.client, expected.TaskGroup, expected.SourceID)
	if errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		return biz.ErrProductionOrderSchedulingTaskRequired
	}
	if err != nil {
		return err
	}
	if !workflowSourceTaskMatchesExpectedIntent(task, expected) || task.OwnerRoleKey != biz.PMCRoleKey {
		return biz.ErrProductionOrderSchedulingTaskRequired
	}
	if err := lockOperationalFactRow(ctx, tx, "workflow_tasks", task.ID, biz.ErrProductionOrderSchedulingTaskRequired); err != nil {
		return err
	}
	task, err = getSourceWorkflowTaskWithClient(ctx, tx.client, expected.TaskGroup, expected.SourceID)
	if err != nil {
		return err
	}
	if !workflowSourceTaskMatchesExpectedIntent(task, expected) {
		return biz.ErrIdempotencyConflict
	}
	switch strings.TrimSpace(task.TaskStatusKey) {
	case "done":
		return nil
	case "rejected":
		if allowRejected {
			return nil
		}
	}
	return biz.ErrProductionOrderSchedulingTaskActive
}

func transitionSourceWorkflowProjection(
	ctx context.Context,
	client *ent.Client,
	expected *biz.WorkflowTaskCreate,
	nextBusinessStatus string,
	ownerRoleKey string,
	actorID int,
	sourceAction string,
	payloadPatch map[string]any,
) error {
	if client == nil || expected == nil || expected.SourceID <= 0 ||
		!biz.IsSourceProducedWorkflowTaskGroup(expected.TaskGroup) ||
		!biz.IsValidWorkflowBusinessState(strings.TrimSpace(nextBusinessStatus)) ||
		strings.TrimSpace(ownerRoleKey) == "" || strings.TrimSpace(sourceAction) == "" {
		return biz.ErrBadParam
	}
	current, err := getSourceWorkflowTaskWithClient(ctx, client, expected.TaskGroup, expected.SourceID)
	if err != nil {
		return err
	}
	if !workflowSourceTaskMatchesExpectedIntent(current, expected) {
		return biz.ErrIdempotencyConflict
	}
	intentHash := workflowSourcePayloadString(current.Payload, workflowSourceTaskIntentHashPayloadKey)
	state, err := client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(expected.SourceType),
		workflowbusinessstate.SourceID(expected.SourceID),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrIdempotencyConflict
		}
		return err
	}
	if workflowSourcePayloadString(state.Payload, "source_task_contract") != biz.WorkflowSourceTaskContractV1 ||
		workflowSourcePayloadString(state.Payload, workflowSourceTaskIntentHashPayloadKey) != intentHash {
		return fmt.Errorf("source task business-state projection lost its contract or intent hash: %w", biz.ErrIdempotencyConflict)
	}

	fromBusinessStatus := ""
	if current.BusinessStatusKey != nil {
		fromBusinessStatus = strings.TrimSpace(*current.BusinessStatusKey)
	}
	taskPayload := cloneSourceWorkflowPayload(current.Payload)
	statePayload := cloneSourceWorkflowPayload(state.Payload)
	for key, value := range payloadPatch {
		taskPayload[key] = value
		statePayload[key] = value
	}
	taskPayload["source_projection_action"] = strings.TrimSpace(sourceAction)
	statePayload["source_projection_action"] = strings.TrimSpace(sourceAction)
	now := time.Now().UTC()
	updateTask := client.WorkflowTask.Update().
		Where(workflowtask.ID(current.ID)).
		SetBusinessStatusKey(strings.TrimSpace(nextBusinessStatus)).
		SetOwnerRoleKey(strings.TrimSpace(ownerRoleKey)).
		SetPayload(taskPayload).
		AddVersion(1)
	if strings.TrimSpace(current.TaskStatusKey) != "rejected" {
		updateTask.ClearBlockedReason()
	}
	if actorID > 0 {
		updateTask.SetUpdatedBy(actorID)
	}
	updatedCount, err := updateTask.Save(ctx)
	if err != nil {
		return err
	}
	if updatedCount != 1 {
		return biz.ErrWorkflowTaskConflict
	}
	updatedTask, err := client.WorkflowTask.Get(ctx, current.ID)
	if err != nil {
		return err
	}
	eventPayload := map[string]any{
		"source_task_contract":                 biz.WorkflowSourceTaskContractV1,
		"source_task_producer":                 workflowSourcePayloadString(current.Payload, "source_task_producer"),
		workflowSourceTaskIntentHashPayloadKey: intentHash,
		"source_action":                        strings.TrimSpace(sourceAction),
		"from_business_status_key":             fromBusinessStatus,
		"to_business_status_key":               strings.TrimSpace(nextBusinessStatus),
	}
	event := client.WorkflowTaskEvent.Create().
		SetTaskID(current.ID).
		SetTaskVersion(updatedTask.Version).
		SetEventType("source_state_changed").
		SetPayload(eventPayload)
	if actorID > 0 {
		event.SetActorID(actorID)
	}
	if _, err := event.Save(ctx); err != nil {
		return err
	}
	updatedCount, err = client.WorkflowBusinessState.Update().
		Where(workflowbusinessstate.ID(state.ID)).
		SetBusinessStatusKey(strings.TrimSpace(nextBusinessStatus)).
		SetOwnerRoleKey(strings.TrimSpace(ownerRoleKey)).
		ClearBlockedReason().
		SetStatusChangedAt(now).
		SetPayload(statePayload).
		Save(ctx)
	if err != nil {
		return err
	}
	if updatedCount != 1 {
		return biz.ErrWorkflowBusinessStateFound
	}
	return nil
}

func workflowSourceTaskIntentHash(task *biz.WorkflowTaskCreate) (string, error) {
	if task == nil {
		return "", biz.ErrBadParam
	}
	payload, err := json.Marshal(struct {
		TaskCode          string         `json:"task_code"`
		TaskGroup         string         `json:"task_group"`
		TaskName          string         `json:"task_name"`
		SourceType        string         `json:"source_type"`
		SourceID          int            `json:"source_id"`
		SourceNo          *string        `json:"source_no,omitempty"`
		BusinessStatusKey *string        `json:"business_status_key,omitempty"`
		OwnerRoleKey      string         `json:"owner_role_key"`
		DueAt             any            `json:"due_at,omitempty"`
		Payload           map[string]any `json:"payload"`
	}{
		TaskCode: task.TaskCode, TaskGroup: task.TaskGroup, TaskName: task.TaskName,
		SourceType: task.SourceType, SourceID: task.SourceID, SourceNo: task.SourceNo,
		BusinessStatusKey: task.BusinessStatusKey, OwnerRoleKey: task.OwnerRoleKey,
		DueAt: task.DueAt, Payload: task.Payload,
	})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

func cloneSourceWorkflowPayload(payload map[string]any) map[string]any {
	out := make(map[string]any, len(payload)+1)
	for key, value := range payload {
		out[key] = value
	}
	return out
}

func workflowSourcePayloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(strings.TrimSpace(toString(value)))
}

func toString(value any) string {
	text, _ := value.(string)
	return text
}
