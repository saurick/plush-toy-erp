package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkflowInitiatorProcessSnapshotSurvivesReplayAndRoleChange(t *testing.T) {
	client := enttest.Open(t, dialect.SQLite, "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	t.Cleanup(func() { mustCloseEntClient(t, client) })
	admin := &biz.AdminUser{ID: 7, Roles: []biz.AdminRole{{Key: biz.SalesRoleKey}}}
	ctx := biz.WithCurrentAdmin(context.Background(), admin)
	data := &Data{postgres: client}
	logger := log.NewStdLogger(io.Discard)
	repo := NewProcessRuntimeRepo(data, logger)
	in := &biz.ProcessInstanceCreate{ProcessKey: biz.ProcessKeySalesOrderAcceptance, ProcessVersion: "v1", ConfigRevision: "rev-1", DefinitionHash: "hash", BusinessRefType: "sales_order", BusinessRefID: 99, IdempotencyKey: "initiator", Status: biz.ProcessStatusActive}
	process, _, err := repo.CreateProcessInstance(ctx, in, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	admin.Roles = []biz.AdminRole{{Key: biz.PurchaseRoleKey}}
	if _, _, err := repo.CreateProcessInstance(ctx, in, admin.ID); err != nil {
		t.Fatal(err)
	}
	if count := client.RuntimeAuditEvent.Query().CountX(ctx); count != 1 {
		t.Fatalf("replay created %d initiation records", count)
	}
	client.ProcessInstance.UpdateOneID(process.ID).SetStatus(biz.ProcessStatusCompleted).SetCompletedAt(time.Now()).SaveX(ctx)
	reader := NewWorkflowRepo(data, logger)
	q := trackingQuery(admin.ID, "started")
	entry, err := reader.GetWorkflowTracking(ctx, q, biz.WorkflowTrackingRef{Kind: "process", ID: process.ID}, 0)
	if err != nil || entry.InitiatorRoleKey != biz.SalesRoleKey || len(entry.Tasks) != 0 {
		t.Fatalf("completed process without tasks: entry=%#v err=%v", entry, err)
	}
	page, err := reader.ListWorkflowTracking(ctx, q)
	if err != nil || len(page.Items) != 1 || page.Items[0].InitiatorRoleKey != biz.SalesRoleKey {
		t.Fatalf("list=%#v err=%v", page, err)
	}
}

func TestWorkflowInitiatorAuditFailureRollsBackCreation(t *testing.T) {
	client := enttest.Open(t, dialect.SQLite, "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	t.Cleanup(func() { mustCloseEntClient(t, client) })
	want := errors.New("audit unavailable")
	client.RuntimeAuditEvent.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(context.Context, ent.Mutation) (ent.Value, error) { return nil, want })
	})
	repo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	_, _, err := repo.CreateProcessInstance(context.Background(), &biz.ProcessInstanceCreate{ProcessKey: "audit_failure", ProcessVersion: "v1", ConfigRevision: "rev-1", DefinitionHash: "hash", BusinessRefType: "sales_order", BusinessRefID: 99, IdempotencyKey: "audit-failure", Status: biz.ProcessStatusActive}, 7)
	if !errors.Is(err, want) || client.ProcessInstance.Query().CountX(context.Background()) != 0 {
		t.Fatalf("creation survived failed audit: %v", err)
	}
}

func TestWorkflowInitiatorTaskCreationUsesRequestIdentityAndPreservesReplay(t *testing.T) {
	client := enttest.Open(t, dialect.SQLite, "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	t.Cleanup(func() { mustCloseEntClient(t, client) })
	admin := &biz.AdminUser{ID: 7, Roles: []biz.AdminRole{{Key: biz.SalesRoleKey}}}
	ctx := biz.WithCurrentAdmin(context.Background(), admin)
	uc := biz.NewWorkflowUsecase(NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))
	in := &biz.WorkflowTaskCreate{IdempotencyKey: "initiate-task", TaskCode: "INITIATE-TASK", TaskGroup: "generic", TaskName: "跟进", SourceType: "generic-source", SourceID: 1, OwnerRoleKey: biz.BossRoleKey, Payload: map[string]any{}}
	first, err := uc.CreateTask(ctx, in, 7)
	if err != nil {
		t.Fatal(err)
	}
	admin.Roles = []biz.AdminRole{{Key: biz.PurchaseRoleKey}}
	if _, err := uc.CreateTask(ctx, in, 7); err != nil {
		t.Fatal(err)
	}
	events := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(first.ID)).AllX(ctx)
	if len(events) != 1 || stringValue(events[0].ActorRoleKey) != biz.SalesRoleKey {
		t.Fatalf("creation identity changed or used the next owner: %#v", events)
	}
	admin.IsSuperAdmin = true
	source := &biz.WorkflowTaskCreate{TaskCode: "SOURCE-INITIATOR", TaskGroup: biz.WorkflowSourceTaskProductionSchedulingGroup, TaskName: "排产", SourceType: biz.WorkflowSourceTaskProductionOrderSourceType, SourceID: 9, OwnerRoleKey: biz.PMCRoleKey, TaskStatusKey: "ready", Payload: map[string]any{}}
	tx, err := client.Tx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	task, _, err := ensureSourceWorkflowTaskRecordWithClient(ctx, tx.Client(), source, 7)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	event := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID)).OnlyX(ctx)
	if stringValue(event.ActorRoleKey) != biz.AdminRoleKey {
		t.Fatalf("source task lost administrator identity: %#v", event)
	}
}

func TestWorkflowInitiatorReadUsesOnlyOriginalMatchingCreationEvidence(t *testing.T) {
	client, reader, process, linkedTask := trackingFixture(t)
	ctx := context.Background()
	client.WorkflowTaskEvent.Create().SetTaskID(linkedTask.ID).SetEventType("created").SetActorID(7).SetActorRoleKey(biz.SalesRoleKey).SaveX(ctx)
	entry, err := reader.GetWorkflowTracking(ctx, trackingQuery(7, "started"), biz.WorkflowTrackingRef{Kind: "process", ID: process.ID}, 0)
	if err != nil || entry.InitiatorRoleKey != "" {
		t.Fatalf("task creator must not imply process initiator: %#v err=%v", entry, err)
	}
	for _, test := range []struct {
		name  string
		actor int
		role  string
		want  string
	}{
		{"recorded", 7, biz.SalesRoleKey, biz.SalesRoleKey},
		{"old missing role", 7, "", ""},
		{"other actor", 8, biz.BossRoleKey, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			task := client.WorkflowTask.Create().SetTaskCode(test.name).SetTaskGroup(biz.WorkflowFollowupTaskGroup).SetTaskName("演示业务").SetSourceType("sales_order").SetSourceID(1).SetOwnerRoleKey(biz.BossRoleKey).SetTaskStatusKey("ready").SetCreatedBy(7).SaveX(ctx)
			client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("created").SetActorID(test.actor).SetActorRoleKey(test.role).SaveX(ctx)
			for i := 0; i <= biz.WorkflowTaskEventPageMaxLimit; i++ {
				client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("status_changed").SetActorID(7).SetActorRoleKey(biz.PurchaseRoleKey).SaveX(ctx)
			}
			q := trackingQuery(7, "started")
			ref := biz.WorkflowTrackingRef{Kind: "task", ID: task.ID}
			entry, err := reader.GetWorkflowTracking(ctx, q, ref, 0)
			if err != nil || !entry.EventsTruncated || entry.InitiatorRoleKey != test.want {
				t.Fatalf("latest history changed initiator: %#v err=%v", entry, err)
			}
			page, err := reader.ListWorkflowTracking(ctx, q)
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, item := range page.Items {
				if item.Ref == ref {
					found = true
					if item.InitiatorRoleKey != test.want {
						t.Fatalf("list and detail disagree: %#v", item)
					}
				}
			}
			if !found {
				t.Fatal("task missing from list")
			}
		})
	}
}
