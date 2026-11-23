package data

import (
	"context"
	"errors"
	"os"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

func deleteWorkflowSourceTaskBundleForBackfillTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	sourceType string,
	sourceID int,
	taskID int,
) {
	t.Helper()
	if data == nil || data.postgres == nil || data.sqldb == nil || sourceType == "" || sourceID <= 0 || taskID <= 0 {
		t.Fatal("invalid workflow source task backfill fixture")
	}
	stateIDs, err := data.postgres.WorkflowBusinessState.Query().Where(
		workflowbusinessstate.SourceType(sourceType),
		workflowbusinessstate.SourceID(sourceID),
	).IDs(ctx)
	if err != nil {
		t.Fatalf("resolve workflow source business state: %v", err)
	}
	if len(stateIDs) != 1 {
		t.Fatalf("workflow source business state count=%d, want=1", len(stateIDs))
	}

	// Backfill tests deliberately synthesize a historical missing bundle. Raw
	// deletion is restricted to these exact IDs so normal immutable event hooks
	// and application deletion paths remain enforced.
	tx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin workflow source backfill fixture transaction: %v", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	deletedEvents, err := deleteDebugRowsByIDs(ctx, tx, data.sqlDialect, "workflow_task_events", "task_id", []int{taskID})
	if err != nil {
		t.Fatalf("delete workflow source task events: %v", err)
	}
	if deletedEvents == 0 {
		t.Fatal("workflow source task event count=0, want>0")
	}
	deletedStates, err := deleteDebugRowsByIDs(ctx, tx, data.sqlDialect, "workflow_business_states", "id", stateIDs)
	if err != nil {
		t.Fatalf("delete workflow source business state: %v", err)
	}
	if deletedStates != 1 {
		t.Fatalf("deleted workflow source business states=%d, want=1", deletedStates)
	}
	deletedTasks, err := deleteDebugRowsByIDs(ctx, tx, data.sqlDialect, "workflow_tasks", "id", []int{taskID})
	if err != nil {
		t.Fatalf("delete workflow source task: %v", err)
	}
	if deletedTasks != 1 {
		t.Fatalf("deleted workflow source tasks=%d, want=1", deletedTasks)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit workflow source backfill fixture transaction: %v", err)
	}
	committed = true
}

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
	deleteWorkflowSourceTaskBundleForBackfillTest(
		t, ctx, f.data, biz.WorkflowSourceTaskProductionOrderSourceType, released.Order.ID, task.ID,
	)

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
	cancelUnstartedProductionWIPForTest(t, ctx, f, released.Order.ID)
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

func TestPurchaseReceiptPostgresPayableTaskBackfill(t *testing.T) {
	ctx := t.Context()
	db, client := openPayableBackfillPostgresTestData(t)
	fixture := createInventoryPostgresFixtures(t, ctx, client)
	f := partialInboundFixtureWithData(t, db, client, inventoryTestFixtures{
		unitID: fixture.unitID, materialID: fixture.materialID, warehouseID: fixture.warehouseID,
	}, "APBF-"+postgresTestSuffix())
	orderID := client.PurchaseOrderItem.GetX(ctx, *f.items[4].PurchaseOrderItemID).PurchaseOrderID
	client.PurchaseOrder.UpdateOneID(orderID).ClearPaymentTermDays().SaveX(ctx)
	f.decide(t, 4, true)
	f.decide(t, 6, true)
	receipt, err := f.inv.PostPurchaseReceipt(ctx, f.receipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Model an eligible historical source without changing immutable task events.
	client.PurchaseOrder.UpdateOneID(orderID).SetPaymentTermDays(0).SaveX(ctx)
	code := biz.WorkflowSourceTaskCode("handoff_receipt_payable", receipt.ID)
	if client.WorkflowTask.Query().Where(workflowtask.TaskCode(code)).ExistX(ctx) {
		t.Fatal("historical fixture already has an obligation")
	}
	factsBefore := client.FinanceFact.Query().CountX(ctx)
	if _, err := BackfillMissingWorkflowSourceTasks(ctx, db.sqldb, false); err != nil {
		t.Fatal(err)
	}
	if client.WorkflowTask.Query().Where(workflowtask.TaskCode(code)).ExistX(ctx) {
		t.Fatal("dry-run persisted payable task")
	}
	if _, err := BackfillMissingWorkflowSourceTasks(ctx, db.sqldb, true); err != nil {
		t.Fatal(err)
	}
	restored := assertFulfillmentTask(t, ctx, client, "receipt_payable", receipt.ID, "ready", biz.FinanceRoleKey)
	if _, err := BackfillMissingWorkflowSourceTasks(ctx, db.sqldb, true); err != nil {
		t.Fatal(err)
	}
	replay := assertFulfillmentTask(t, ctx, client, "receipt_payable", receipt.ID, "ready", biz.FinanceRoleKey)
	if replay.ID != restored.ID || replay.Version != restored.Version || client.FinanceFact.Query().CountX(ctx) != factsBefore {
		t.Fatal("repeated backfill changed the handoff or financial facts")
	}
}

func openPayableBackfillPostgresTestData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	base, _ := openPurchaseReceiptPostgresTestData(t)
	dsn := os.Getenv("PURCHASE_RECEIPT_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PURCHASE_RECEIPT_PG_DB_URL")
	}
	config, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal("parse isolated PostgreSQL connection configuration")
	}
	// Backfill scans the whole schema, so this case owns its source and task rows.
	schema := "payable_backfill_" + postgresTestSuffix()
	if _, err := base.sqldb.ExecContext(t.Context(), "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create payable backfill schema: %v", err)
	}
	t.Cleanup(func() {
		if _, err := base.sqldb.ExecContext(context.Background(), "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Errorf("drop payable backfill schema: %v", err)
		}
	})
	config.RuntimeParams["search_path"] = schema
	db := stdlib.OpenDB(*config)
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, db)))
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close payable backfill database: %v", err)
		}
	})
	if err := client.Schema.Create(t.Context()); err != nil {
		t.Fatalf("create current payable backfill tables: %v", err)
	}
	return &Data{postgres: client, sqldb: db, sqlDialect: dialect.Postgres}, client
}
