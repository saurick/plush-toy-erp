package data

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

func TestWorkflowSourceTaskIntentUsesInstantAcrossTimezones(t *testing.T) {
	date := time.Date(2026, 10, 10, 8, 30, 0, 123000000, time.FixedZone("", 8*60*60))
	task := &biz.WorkflowTaskCreate{TaskCode: "time-intent", SourceID: 1, DueAt: &date, Payload: map[string]any{"value": "unchanged"}}
	want, err := workflowSourceTaskIntentHash(task)
	if err != nil {
		t.Fatal(err)
	}
	for _, offset := range []int{0, -210, 345, 480} {
		inZone := date.In(time.FixedZone("", offset*60))
		task.DueAt = &inZone
		got, err := workflowSourceTaskIntentHash(task)
		if err != nil || got != want {
			t.Fatalf("same instant at offset %d must hash equally: %v", offset, err)
		}
	}
	changed := date.Add(time.Nanosecond)
	task.DueAt = &changed
	if got, err := workflowSourceTaskIntentHash(task); err != nil || got == want {
		t.Fatalf("different instant must change intent: %v", err)
	}
}

func createSourceTimeIntentFixture(t *testing.T, ctx context.Context, client *ent.Client, task *biz.WorkflowTaskCreate, state *biz.WorkflowBusinessStateUpsert, offsetMinutes int) *ent.WorkflowTask {
	t.Helper()
	date := task.DueAt.In(time.FixedZone("", offsetMinutes*60))
	legacyHash, err := workflowSourceTaskIntentHashWithDueAt(task, &date)
	if err != nil {
		t.Fatal(err)
	}
	payload := cloneSourceWorkflowPayload(task.Payload)
	payload[workflowSourceTaskIntentHashPayloadKey] = legacyHash
	row := client.WorkflowTask.Create().SetTaskCode(task.TaskCode).SetTaskGroup(task.TaskGroup).
		SetTaskName(task.TaskName).SetSourceType(task.SourceType).SetSourceID(task.SourceID).
		SetNillableSourceNo(task.SourceNo).SetNillableBusinessStatusKey(task.BusinessStatusKey).
		SetTaskStatusKey("done").SetOwnerRoleKey(task.OwnerRoleKey).
		SetNillableDueAt(task.DueAt).SetPayload(payload).SaveX(ctx)
	client.WorkflowTaskEvent.Create().SetTaskID(row.ID).SetTaskVersion(row.Version).
		SetEventType("created").SetToStatusKey("ready").SetPayload(map[string]any{
		"source_task_contract":                 biz.WorkflowSourceTaskContractV1,
		"source_task_producer":                 task.Payload["source_task_producer"],
		workflowSourceTaskIntentHashPayloadKey: legacyHash,
	}).SaveX(ctx)
	state.Payload = cloneSourceWorkflowPayload(state.Payload)
	state.Payload[workflowSourceTaskIntentHashPayloadKey] = legacyHash
	if err := createInitialWorkflowSourceStateWithClient(ctx, client, state); err != nil {
		t.Fatal(err)
	}
	return row
}

func TestWorkflowSourceTaskBackfillNormalizesTimeWithoutChangingHistory(t *testing.T) {
	f := openProductionOrderRepoTest(t, "source_time_backfill")
	assertSourceTimeBackfill(t, f.client)
}

func TestWorkflowSourceTaskBackfillTimePostgresTransaction(t *testing.T) {
	db, _ := openPurchaseReceiptPostgresTestData(t)
	tx, err := db.sqldb.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	client := newBusinessEntClient(ent.Driver(entsql.NewDriver(dialect.Postgres, entsql.Conn{ExecQuerier: tx})))
	assertSourceTimeBackfill(t, client)
}

func assertSourceTimeBackfill(t *testing.T, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	firstID := int(time.Now().UnixMicro())
	date := time.Date(2026, 10, 10, 8, 0, 0, 0, time.UTC)
	for i, offset := range []int{480, -210, 345} {
		source := &biz.ProductionOrderAggregate{
			Order: &biz.ProductionOrder{ID: firstID + i, OrderNo: "MO-TIME", Status: biz.ProductionOrderStatusReleased, PlannedStartAt: &date},
			Items: []*biz.ProductionOrderItem{{ID: i + 1}},
		}
		task, state, err := biz.BuildProductionSchedulingSourceTask(source)
		if err != nil {
			t.Fatal(err)
		}
		row := createSourceTimeIntentFixture(t, ctx, client, task, state, offset)
		createdEvent := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(row.ID)).OnlyX(ctx)
		originalEventJSON, err := json.Marshal(createdEvent)
		if err != nil {
			t.Fatal(err)
		}
		if workflowSourceTaskMatchesExpectedIntent(entWorkflowTaskToBiz(row), task) {
			t.Fatal("runtime must reject the old representation before explicit repair")
		}
		created, normalized, err := reconcileExpectedWorkflowSourceTask(ctx, client, task, state, 0)
		if err != nil || created || !normalized {
			t.Fatalf("normalize offset %d: created=%v normalized=%v err=%v", offset, created, normalized, err)
		}
		updated := client.WorkflowTask.GetX(ctx, row.ID)
		if updated.TaskStatusKey != row.TaskStatusKey || updated.OwnerRoleKey != row.OwnerRoleKey || !workflowSourceTaskMatchesExpectedIntent(entWorkflowTaskToBiz(updated), task) {
			t.Fatal("normalization must preserve completion and make canonical runtime validation succeed")
		}
		afterEvent := client.WorkflowTaskEvent.GetX(ctx, createdEvent.ID)
		afterEventJSON, err := json.Marshal(afterEvent)
		if err != nil || string(originalEventJSON) != string(afterEventJSON) {
			t.Fatal("original creation event changed")
		}
		beforeReplay, err := json.Marshal(updated)
		if err != nil {
			t.Fatal(err)
		}
		created, normalized, err = reconcileExpectedWorkflowSourceTask(ctx, client, task, state, 0)
		if err != nil || created || normalized {
			t.Fatalf("replay must be unchanged: %v", err)
		}
		if count := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(row.ID)).CountX(ctx); count != 2 {
			t.Fatalf("normalization event count=%d, want two events including original", count)
		}
		afterReplay, err := json.Marshal(client.WorkflowTask.GetX(ctx, row.ID))
		if err != nil || string(beforeReplay) != string(afterReplay) {
			t.Fatal("replay changed task")
		}
	}
}

func TestWorkflowSourceTaskBackfillRejectsNonTimeChangesAndMissingAudit(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "source_time_conflict")
	date := time.Date(2026, 10, 10, 8, 0, 0, 0, time.UTC)
	task, state, err := biz.BuildShipmentReleaseSourceTask(&biz.Shipment{
		ID: 100, ShipmentNo: "SHIP-TIME", Status: biz.ShipmentStatusDraft,
		PlannedShipAt: &date, Items: []*biz.ShipmentItem{{ID: 101}},
	})
	if err != nil {
		t.Fatal(err)
	}
	row := createSourceTimeIntentFixture(t, ctx, f.client, task, state, 480)
	task.Payload["line_count"] = 2
	if _, _, err := reconcileExpectedWorkflowSourceTask(ctx, f.client, task, state, 0); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("content changes must fail: %v", err)
	}
	if f.client.WorkflowTask.GetX(ctx, row.ID).Version != row.Version {
		t.Fatal("conflict changed task")
	}
	task.Payload["line_count"] = 1
	canonicalHash, err := workflowSourceTaskIntentHash(task)
	if err != nil {
		t.Fatal(err)
	}
	payload := cloneSourceWorkflowPayload(row.Payload)
	payload[workflowSourceTaskIntentHashPayloadKey] = canonicalHash
	f.client.WorkflowTask.Update().Where(workflowtask.ID(row.ID)).SetPayload(payload).ExecX(ctx)
	f.client.WorkflowBusinessState.Update().Where(workflowbusinessstate.SourceID(task.SourceID)).SetPayload(payload).ExecX(ctx)
	if _, _, err := reconcileExpectedWorkflowSourceTask(ctx, f.client, task, state, 0); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed digest without normalization audit must fail: %v", err)
	}
}
