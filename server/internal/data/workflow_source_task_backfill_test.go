package data

import (
	"context"
	"errors"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"
)

func TestWorkflowSourceTaskBackfillRecreatesReleasedProductionOrderBundle(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "workflow_source_backfill_production")
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-SOURCE-BACKFILL", 5), ActorID: f.actorID, IdempotencyKey: "source-backfill-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID, IdempotencyKey: "source-backfill-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	taskCode := biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionSchedulingGroup, released.Order.ID)
	task := f.client.WorkflowTask.Query().Where(workflowtask.TaskCode(taskCode)).OnlyX(ctx)
	f.client.WorkflowTaskEvent.Delete().Where(workflowtaskevent.TaskID(task.ID)).ExecX(ctx)
	f.client.WorkflowBusinessState.Delete().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionOrderSourceType),
		workflowbusinessstate.SourceID(released.Order.ID),
	).ExecX(ctx)
	f.client.WorkflowTask.DeleteOne(task).ExecX(ctx)

	result, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, f.client)
	if err != nil {
		t.Fatalf("reconcile missing production source task: %v", err)
	}
	if result.ProductionSchedulingScanned != 1 || result.ProductionSchedulingCreated != 1 || result.ProductionSchedulingExisting != 0 {
		t.Fatalf("unexpected production source backfill result: %#v", result)
	}
	recreated := f.client.WorkflowTask.Query().Where(workflowtask.TaskCode(taskCode)).OnlyX(ctx)
	if recreated.TaskStatusKey != "ready" || recreated.OwnerRoleKey != biz.PMCRoleKey ||
		recreated.Payload["source_task_contract"] != biz.WorkflowSourceTaskContractV1 ||
		recreated.Payload["source_task_intent_hash"] == "" {
		t.Fatalf("backfill must create a real pending scheduling task: %#v", recreated)
	}
	if count := f.client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(recreated.ID),
		workflowtaskevent.EventType("created"),
	).CountX(ctx); count != 1 {
		t.Fatalf("backfill created event count=%d, want 1", count)
	}
	if state := f.client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionOrderSourceType),
		workflowbusinessstate.SourceID(released.Order.ID),
	).OnlyX(ctx); state.BusinessStatusKey != "production_ready" {
		t.Fatalf("backfill production state=%#v", state)
	}

	replayed, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, f.client)
	if err != nil || replayed.ProductionSchedulingCreated != 0 || replayed.ProductionSchedulingExisting != 1 {
		t.Fatalf("backfill replay result=%#v err=%v", replayed, err)
	}
	completeProductionSchedulingTaskForTest(t, ctx, f.data, f.client, released.Order.ID, f.actorID)
	cancelReason := "存量排程任务已完成，订单取消"
	cancelled, err := f.uc.Cancel(ctx, &biz.ProductionOrderAction{
		ID: released.Order.ID, ExpectedVersion: released.Order.Version, ActorID: f.actorID,
		IdempotencyKey: "source-backfill-cancel", Reason: &cancelReason,
	})
	if err != nil || cancelled.Order.Status != biz.ProductionOrderStatusCancelled {
		t.Fatalf("cancel reconciled production order=%#v err=%v", cancelled, err)
	}
	cancelledTask := f.client.WorkflowTask.Query().Where(workflowtask.TaskCode(taskCode)).OnlyX(ctx)
	if cancelledTask.BusinessStatusKey == nil || *cancelledTask.BusinessStatusKey != "cancelled" {
		t.Fatalf("cancelled reconciled task projection=%#v", cancelledTask)
	}
	cancelledState := f.client.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionOrderSourceType),
		workflowbusinessstate.SourceID(released.Order.ID),
	).OnlyX(ctx)
	if cancelledState.BusinessStatusKey != "cancelled" || cancelledState.Payload["source_projection_action"] != "production_order.cancel" {
		t.Fatalf("cancelled reconciled state=%#v", cancelledState)
	}
}

func TestWorkflowSourceTaskBackfillDoesNotGuessMissingProjection(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "workflow_source_backfill_projection")
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-SOURCE-BACKFILL-PROJECTION", 5), ActorID: f.actorID, IdempotencyKey: "source-backfill-projection-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: created.Order.Version, ActorID: f.actorID, IdempotencyKey: "source-backfill-projection-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	f.client.WorkflowBusinessState.Delete().Where(
		workflowbusinessstate.SourceType(biz.WorkflowSourceTaskProductionOrderSourceType),
		workflowbusinessstate.SourceID(released.Order.ID),
	).ExecX(ctx)
	if _, err := reconcileMissingWorkflowSourceTasksWithClient(ctx, f.client); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("missing state on an existing task must require review, got %v", err)
	}
}
