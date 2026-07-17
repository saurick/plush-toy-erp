package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
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
}

// BackfillMissingWorkflowSourceTasks reconciles only the two source transitions
// that were already terminal before source-task production was introduced:
// RELEASED production orders and POSTED REWORK facts. DRAFT shipments are not
// inferred as submitted; users must still submit those from the shipment page.
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
	client := ent.NewClient(ent.Driver(entsql.NewDriver(
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
	orders, err := client.ProductionOrder.Query().
		Where(productionorder.Status(biz.ProductionOrderStatusReleased)).
		Order(ent.Asc(productionorder.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range orders {
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
		created, err := reconcileExpectedWorkflowSourceTask(ctx, client, task, state, actorID)
		if err != nil {
			return nil, fmt.Errorf("reconcile production scheduling task for order %d: %w", row.ID, err)
		}
		if created {
			result.ProductionSchedulingCreated++
		} else {
			result.ProductionSchedulingExisting++
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
		task, state, err := buildProductionExceptionSourceTaskFromFact(ctx, client, row)
		if err != nil {
			return nil, fmt.Errorf("build production exception task for fact %d: %w", row.ID, err)
		}
		created, err := reconcileExpectedWorkflowSourceTask(ctx, client, task, state, 0)
		if err != nil {
			return nil, fmt.Errorf("reconcile production exception task for fact %d: %w", row.ID, err)
		}
		if created {
			result.ProductionExceptionCreated++
		} else {
			result.ProductionExceptionExisting++
		}
	}
	return result, nil
}

func reconcileExpectedWorkflowSourceTask(
	ctx context.Context,
	client *ent.Client,
	task *biz.WorkflowTaskCreate,
	state *biz.WorkflowBusinessStateUpsert,
	actorID int,
) (bool, error) {
	if client == nil || task == nil || state == nil {
		return false, biz.ErrBadParam
	}
	existing, err := client.WorkflowTask.Query().Where(workflowtask.TaskCode(task.TaskCode)).Only(ctx)
	if ent.IsNotFound(err) {
		_, created, createErr := ensureSourceWorkflowTaskWithClient(ctx, client, task, state, actorID)
		return created, createErr
	}
	if err != nil {
		return false, err
	}
	current := entWorkflowTaskToBiz(existing)
	if !workflowSourceTaskMatchesExpectedIntent(current, task) {
		return false, biz.ErrIdempotencyConflict
	}
	intentHash := workflowSourcePayloadString(current.Payload, workflowSourceTaskIntentHashPayloadKey)
	createdEvent, err := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(existing.ID),
		workflowtaskevent.EventType("created"),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) || ent.IsNotSingular(err) {
			return false, biz.ErrIdempotencyConflict
		}
		return false, err
	}
	if createdEvent.TaskVersion == nil || *createdEvent.TaskVersion <= 0 ||
		workflowSourcePayloadString(createdEvent.Payload, "source_task_contract") != biz.WorkflowSourceTaskContractV1 ||
		workflowSourcePayloadString(createdEvent.Payload, "source_task_producer") != workflowSourcePayloadString(task.Payload, "source_task_producer") ||
		workflowSourcePayloadString(createdEvent.Payload, workflowSourceTaskIntentHashPayloadKey) != intentHash {
		return false, biz.ErrIdempotencyConflict
	}
	currentState, err := client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(state.SourceType),
		workflowbusinessstate.SourceID(state.SourceID),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrIdempotencyConflict
		}
		return false, err
	}
	if workflowSourcePayloadString(currentState.Payload, "source_task_contract") != biz.WorkflowSourceTaskContractV1 ||
		workflowSourcePayloadString(currentState.Payload, workflowSourceTaskIntentHashPayloadKey) != intentHash ||
		strings.TrimSpace(currentState.SourceType) != strings.TrimSpace(task.SourceType) ||
		currentState.SourceID != task.SourceID {
		return false, biz.ErrIdempotencyConflict
	}
	return false, nil
}

func buildProductionExceptionSourceTaskFromFact(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
) (*biz.WorkflowTaskCreate, *biz.WorkflowBusinessStateUpsert, error) {
	if client == nil || row == nil || !isProductionReworkLinkedFactRow(row) || row.SourceID == nil {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	source, err := client.ProductionFact.Get(ctx, *row.SourceID)
	if err != nil {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	orderID, itemID, err := productionCompletionSourceCoordinates(source)
	if err != nil {
		return nil, nil, err
	}
	order, err := client.ProductionOrder.Get(ctx, orderID)
	if err != nil {
		return nil, nil, err
	}
	item, err := client.ProductionOrderItem.Get(ctx, itemID)
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
	return biz.BuildProductionExceptionSourceTask(biz.ProductionExceptionSourceTaskInput{
		FactID:                 row.ID,
		FactNo:                 row.FactNo,
		SourceCompletionFactID: source.ID,
		ProductionOrderID:      order.ID,
		ProductionOrderNo:      order.OrderNo,
		ProductionOrderItemID:  item.ID,
		ProductName:            productName,
		UnitName:               unitName,
		Quantity:               row.Quantity.String(),
		Reason:                 reason,
		OccurredAt:             row.OccurredAt,
	})
}
