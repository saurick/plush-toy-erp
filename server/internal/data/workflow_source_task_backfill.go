package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

// WorkflowSourceTaskBackfillResult reports active source documents inspected by
// the controlled upgrade repair. Created tasks always remain ready for a real
// role owner; the repair never fabricates done/rejected workflow outcomes.
type WorkflowSourceTaskBackfillResult struct {
	Applied                      bool `json:"applied"`
	ProductionSchedulingScanned  int  `json:"production_scheduling_scanned"`
	ProductionSchedulingCreated  int  `json:"production_scheduling_created"`
	ProductionSchedulingExisting int  `json:"production_scheduling_existing"`
	ProductionExceptionScanned   int  `json:"production_exception_scanned"`
	ProductionExceptionCreated   int  `json:"production_exception_created"`
	ProductionExceptionExisting  int  `json:"production_exception_existing"`
	FulfillmentProductionScanned int  `json:"fulfillment_production_scanned"`
	FulfillmentShipmentScanned   int  `json:"fulfillment_shipment_scanned"`
	SourceTimeIntentsNormalized  int  `json:"source_time_intents_normalized"`
}

// BackfillMissingWorkflowSourceTasks repairs scheduling/rework source bundles
// and recalculates fulfillment handoffs from their source facts. A DRAFT
// shipment gets a sales preparation task, never an inferred release approval.
//
// apply=false executes the same validation and inserts inside a transaction and
// then rolls it back, providing a faithful dry-run. Any occupied deterministic
// namespace or incomplete existing task/event/state bundle fails the whole run.
func BackfillMissingWorkflowSourceTasks(
	ctx context.Context,
	db *stdsql.DB,
	apply bool,
) (*WorkflowSourceTaskBackfillResult, error) {
	if db == nil {
		return nil, biz.ErrBadParam
	}
	sqlTx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = sqlTx.Rollback()
		}
	}()
	// A one-off repair reads several source families before updating tasks.
	// Serialize it with business writes so a completed/cancelled source cannot
	// be projected back to an older task state from an earlier snapshot.
	if _, err = sqlTx.ExecContext(ctx, "SET LOCAL lock_timeout = '5s'"); err != nil {
		return nil, err
	}
	if _, err = sqlTx.ExecContext(ctx, "LOCK TABLE production_orders, production_facts, production_wip_batches, shipments, workflow_tasks IN SHARE ROW EXCLUSIVE MODE"); err != nil {
		return nil, err
	}
	client := newBusinessEntClient(ent.Driver(entsql.NewDriver(
		dialect.Postgres,
		entsql.Conn{ExecQuerier: sqlTx},
	)))
	result, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, client)
	if err != nil {
		return nil, err
	}
	result.Applied = apply
	if !apply {
		return result, nil
	}
	if err := sqlTx.Commit(); err != nil {
		return nil, err
	}
	committed = true
	return result, nil
}

func reconcileMissingWorkflowSourceTasksWithClient(
	ctx context.Context,
	client *ent.Client,
) (*WorkflowSourceTaskBackfillResult, error) {
	if client == nil {
		return nil, biz.ErrBadParam
	}
	result := &WorkflowSourceTaskBackfillResult{}
	handoffOrderIDs := map[int]bool{}
	orders, err := client.ProductionOrder.Query().
		Where(productionorder.Status(biz.ProductionOrderStatusReleased)).
		Order(ent.Asc(productionorder.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range orders {
		handoffOrderIDs[row.ID] = true
		result.ProductionSchedulingScanned++
		aggregate, err := loadProductionOrderAggregate(ctx, client, row.ID)
		if err != nil {
			return nil, fmt.Errorf("load RELEASED production order %d: %w", row.ID, err)
		}
		task, state, err := biz.BuildProductionSchedulingSourceTask(aggregate)
		if err != nil {
			return nil, fmt.Errorf("build production scheduling task for order %d: %w", row.ID, err)
		}
		actorID := 0
		if row.ReleasedBy != nil {
			actorID = *row.ReleasedBy
		}
		created, normalized, err := reconcileExpectedWorkflowSourceTask(ctx, client, task, state, actorID)
		if err != nil {
			return nil, fmt.Errorf("reconcile production scheduling task for order %d: %w", row.ID, err)
		}
		if created {
			result.ProductionSchedulingCreated++
		} else {
			result.ProductionSchedulingExisting++
		}
		if normalized {
			result.SourceTimeIntentsNormalized++
		}
	}

	reworkRows, err := client.ProductionFact.Query().
		Where(
			productionfact.FactType(biz.ProductionFactRework),
			productionfact.Status(biz.OperationalFactStatusPosted),
		).
		Order(ent.Asc(productionfact.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range reworkRows {
		if !isProductionReworkLinkedFactRow(row) {
			return nil, fmt.Errorf("POSTED REWORK fact %d has an invalid source: %w", row.ID, biz.ErrProductionReworkSourceInvalid)
		}
		result.ProductionExceptionScanned++
		source, err := resolveProductionReworkRowSource(ctx, client, row, false)
		if err != nil {
			return nil, err
		}
		handoffOrderIDs[source.orderID] = true
		task, state, err := buildProductionExceptionSourceTaskFromFact(ctx, client, row)
		if err != nil {
			return nil, fmt.Errorf("build production exception task for fact %d: %w", row.ID, err)
		}
		created, normalized, err := reconcileExpectedWorkflowSourceTask(ctx, client, task, state, 0)
		if err != nil {
			return nil, fmt.Errorf("reconcile production exception task for fact %d: %w", row.ID, err)
		}
		if created {
			result.ProductionExceptionCreated++
		} else {
			result.ProductionExceptionExisting++
		}
		if normalized {
			result.SourceTimeIntentsNormalized++
		}
	}
	ids := make([]int, 0, len(handoffOrderIDs))
	for id := range handoffOrderIDs {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		if err := syncProductionHandoffs(ctx, client, id, 0); err != nil {
			return nil, fmt.Errorf("reconcile production handoffs for order %d: %w", id, err)
		}
		result.FulfillmentProductionScanned++
	}
	shipments, err := client.Shipment.Query().Where(shipment.Status(biz.ShipmentStatusDraft)).Order(ent.Asc(shipment.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range shipments {
		full, err := shipmentWithItems(ctx, client, row)
		if err != nil {
			return nil, err
		}
		// A repair must never create an approval for an unsubmitted shipment.
		// Existing approvals need the same timestamp conversion as scheduling.
		hasRelease, err := client.WorkflowTask.Query().Where(workflowtask.TaskCode(
			biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskShipmentReleaseGroup, row.ID),
		)).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasRelease {
			task, state, err := biz.BuildShipmentReleaseSourceTask(full)
			if err != nil {
				return nil, err
			}
			_, normalized, err := reconcileExpectedWorkflowSourceTask(ctx, client, task, state, 0)
			if err != nil {
				return nil, fmt.Errorf("reconcile shipment release task %d: %w", row.ID, err)
			}
			if normalized {
				result.SourceTimeIntentsNormalized++
			}
		}
		if err := syncShipmentHandoff(ctx, client, full); err != nil {
			return nil, fmt.Errorf("reconcile sales shipment handoff %d: %w", row.ID, err)
		}
		result.FulfillmentShipmentScanned++
	}
	return result, nil
}

func reconcileExpectedWorkflowSourceTask(
	ctx context.Context,
	client *ent.Client,
	task *biz.WorkflowTaskCreate,
	state *biz.WorkflowBusinessStateUpsert,
	actorID int,
) (bool, bool, error) {
	if client == nil || task == nil || state == nil {
		return false, false, biz.ErrBadParam
	}
	existing, err := client.WorkflowTask.Query().Where(workflowtask.TaskCode(task.TaskCode)).Only(ctx)
	if ent.IsNotFound(err) {
		_, created, createErr := ensureSourceWorkflowTaskWithClient(ctx, client, task, state, actorID)
		return created, false, createErr
	}
	if err != nil {
		return false, false, err
	}
	current := entWorkflowTaskToBiz(existing)
	if !biz.WorkflowTaskMatchesSourceProducer(current, task) {
		return false, false, biz.ErrIdempotencyConflict
	}
	intentHash := workflowSourcePayloadString(current.Payload, workflowSourceTaskIntentHashPayloadKey)
	expectedHash, err := workflowSourceTaskIntentHash(task)
	if err != nil {
		return false, false, err
	}
	createdEvent, err := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(existing.ID),
		workflowtaskevent.EventType("created"),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) || ent.IsNotSingular(err) {
			return false, false, biz.ErrIdempotencyConflict
		}
		return false, false, err
	}
	if createdEvent.TaskVersion == nil || *createdEvent.TaskVersion <= 0 ||
		workflowSourcePayloadString(createdEvent.Payload, "source_task_contract") != biz.WorkflowSourceTaskContractV1 ||
		workflowSourcePayloadString(createdEvent.Payload, "source_task_producer") != workflowSourcePayloadString(task.Payload, "source_task_producer") {
		return false, false, biz.ErrIdempotencyConflict
	}
	currentState, err := client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(state.SourceType),
		workflowbusinessstate.SourceID(state.SourceID),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, false, biz.ErrIdempotencyConflict
		}
		return false, false, err
	}
	if workflowSourcePayloadString(currentState.Payload, "source_task_contract") != biz.WorkflowSourceTaskContractV1 ||
		workflowSourcePayloadString(currentState.Payload, workflowSourceTaskIntentHashPayloadKey) != intentHash ||
		strings.TrimSpace(currentState.SourceType) != strings.TrimSpace(task.SourceType) ||
		currentState.SourceID != task.SourceID {
		return false, false, biz.ErrIdempotencyConflict
	}
	createdHash := workflowSourcePayloadString(createdEvent.Payload, workflowSourceTaskIntentHashPayloadKey)
	if createdHash != intentHash {
		if intentHash != expectedHash {
			return false, false, biz.ErrIdempotencyConflict
		}
		if err := validateSourceTimeIntentNormalization(ctx, client, existing, createdEvent, task, createdHash, intentHash); err != nil {
			return false, false, err
		}
		return false, false, nil
	}
	if intentHash == expectedHash {
		return false, false, nil
	}
	// Only a timezone serialization difference is repairable. All source
	// fields still participate in the hash; changed dates or content fail.
	offset, matches := sourceTaskTimeIntentOffset(task, intentHash)
	if !matches {
		return false, false, biz.ErrIdempotencyConflict
	}
	wasNormalized, err := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(existing.ID), workflowtaskevent.EventType(sourceTimeIntentNormalizedEvent),
	).Exist(ctx)
	if err != nil {
		return false, false, err
	}
	if wasNormalized {
		return false, false, biz.ErrIdempotencyConflict
	}
	payload := cloneSourceWorkflowPayload(existing.Payload)
	payload[workflowSourceTaskIntentHashPayloadKey] = expectedHash
	affected, err := client.WorkflowTask.Update().Where(workflowtask.ID(existing.ID), workflowtask.Version(existing.Version)).
		SetPayload(payload).AddVersion(1).Save(ctx)
	if err != nil {
		return false, false, err
	}
	if affected != 1 {
		return false, false, biz.ErrWorkflowTaskConflict
	}
	statePayload := cloneSourceWorkflowPayload(currentState.Payload)
	statePayload[workflowSourceTaskIntentHashPayloadKey] = expectedHash
	if err := client.WorkflowBusinessState.Update().Where(workflowbusinessstate.ID(currentState.ID)).SetPayload(statePayload).Exec(ctx); err != nil {
		return false, false, err
	}
	_, err = client.WorkflowTaskEvent.Create().SetTaskID(existing.ID).SetTaskVersion(existing.Version + 1).
		SetEventType(sourceTimeIntentNormalizedEvent).
		SetFromStatusKey(existing.TaskStatusKey).SetToStatusKey(existing.TaskStatusKey).
		SetReason("统一任务时间校验，原任务内容和办理记录保留").
		SetPayload(map[string]any{
			"source_task_contract":                 biz.WorkflowSourceTaskContractV1,
			"source_task_producer":                 workflowSourcePayloadString(task.Payload, "source_task_producer"),
			"previous_source_task_intent_hash":     intentHash,
			workflowSourceTaskIntentHashPayloadKey: expectedHash,
			"previous_due_at_offset_seconds":       offset,
		}).Save(ctx)
	return false, err == nil, err
}

const sourceTimeIntentNormalizedEvent = "source_time_normalized"

// Historical zone matching is confined to this explicit transaction-based
// repair. Runtime commands accept only the canonical UTC intent.
func sourceTaskTimeIntentOffset(task *biz.WorkflowTaskCreate, previousHash string) (int, bool) {
	if task.DueAt == nil || len(previousHash) != 64 {
		return 0, false
	}
	for minutes := -14 * 60; minutes <= 14*60; minutes++ {
		offset := minutes * 60
		date := task.DueAt.In(time.FixedZone("", offset))
		hash, err := workflowSourceTaskIntentHashWithDueAt(task, &date)
		if err == nil && hash == previousHash {
			return offset, true
		}
	}
	return 0, false
}

func validateSourceTimeIntentNormalization(ctx context.Context, client *ent.Client, task *ent.WorkflowTask, created *ent.WorkflowTaskEvent, expected *biz.WorkflowTaskCreate, previousHash, currentHash string) error {
	event, err := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType(sourceTimeIntentNormalizedEvent),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) || ent.IsNotSingular(err) {
			return biz.ErrIdempotencyConflict
		}
		return err
	}
	if event.TaskVersion == nil || *event.TaskVersion <= *created.TaskVersion || *event.TaskVersion > task.Version ||
		workflowSourcePayloadString(event.Payload, "source_task_contract") != biz.WorkflowSourceTaskContractV1 ||
		workflowSourcePayloadString(event.Payload, "source_task_producer") != workflowSourcePayloadString(expected.Payload, "source_task_producer") ||
		workflowSourcePayloadString(event.Payload, "previous_source_task_intent_hash") != previousHash ||
		workflowSourcePayloadString(event.Payload, workflowSourceTaskIntentHashPayloadKey) != currentHash {
		return biz.ErrIdempotencyConflict
	}
	offset, matches := sourceTaskTimeIntentOffset(expected, previousHash)
	if !matches || event.Payload["previous_due_at_offset_seconds"] != float64(offset) {
		return biz.ErrIdempotencyConflict
	}
	return nil
}

func buildProductionExceptionSourceTaskFromFact(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
) (*biz.WorkflowTaskCreate, *biz.WorkflowBusinessStateUpsert, error) {
	if client == nil || row == nil || !isProductionReworkLinkedFactRow(row) || row.SourceID == nil {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	source, err := resolveProductionReworkRowSource(ctx, client, row, false)
	if err != nil {
		return nil, nil, err
	}
	order, err := client.ProductionOrder.Get(ctx, source.orderID)
	if err != nil {
		return nil, nil, err
	}
	item, err := client.ProductionOrderItem.Get(ctx, source.itemID)
	if err != nil {
		return nil, nil, err
	}
	reason := ""
	if row.Note != nil {
		reason = strings.TrimSpace(*row.Note)
	}
	productName := ""
	if item.ProductNameSnapshot != nil {
		productName = strings.TrimSpace(*item.ProductNameSnapshot)
	}
	unitName := ""
	if item.UnitNameSnapshot != nil {
		unitName = strings.TrimSpace(*item.UnitNameSnapshot)
	}
	input := biz.ProductionExceptionSourceTaskInput{
		FactID:                row.ID,
		FactNo:                row.FactNo,
		ProductionOrderID:     order.ID,
		ProductionOrderNo:     order.OrderNo,
		ProductionOrderItemID: item.ID,
		ProductName:           productName,
		UnitName:              unitName,
		Quantity:              row.Quantity.String(),
		Reason:                reason,
		OccurredAt:            row.OccurredAt,
	}
	if source.sourceCompletion == nil {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	input.SourceCompletionFactID = source.sourceCompletion.ID
	return biz.BuildProductionExceptionSourceTask(input)
}
