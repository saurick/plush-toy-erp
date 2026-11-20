package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	corevalue "server/internal/core/value"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/tasknumber"
)

func numberedTask(client *ent.Client, code string, at time.Time) *ent.WorkflowTaskCreate {
	return client.WorkflowTask.Create().SetTaskCode(code).SetTaskGroup("engineering_check").
		SetTaskName("同名任务").SetTaskStatusKey("ready").SetOwnerRoleKey("engineering").SetCreatedAt(at)
}

func workflowTaskFixtureNumber(t *testing.T, tx *stdsql.Tx) string {
	t.Helper()
	var createdAt time.Time
	if err := tx.QueryRowContext(t.Context(), "SELECT CURRENT_TIMESTAMP").Scan(&createdAt); err != nil {
		t.Fatal(err)
	}
	client := newBusinessEntClient(ent.Driver(entsql.NewDriver(dialect.Postgres, entsql.Conn{ExecQuerier: tx})))
	number, err := tasknumber.Allocate(t.Context(), client, createdAt)
	if err != nil {
		t.Fatal(err)
	}
	return number
}

func TestWorkflowTaskNumberAllocationAndRollback(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_numbers?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	at := time.Date(2026, 10, 18, 15, 59, 59, 0, time.UTC)
	numberedTask(client, "other-day", at.AddDate(0, 0, -1)).SaveX(ctx)
	first := numberedTask(client, "first", at).SaveX(ctx)
	if first.TaskNo != "RW20261018-0001" {
		t.Fatalf("public number must not use task primary key %d: %s", first.ID, first.TaskNo)
	}
	updated := client.WorkflowTask.UpdateOneID(first.ID).SetTaskStatusKey("done").SaveX(ctx)
	if updated.TaskNo != first.TaskNo {
		t.Fatal("task completion renumbered the task")
	}
	tx, err := client.Tx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	rolledBack := numberedTask(tx.Client(), "rollback", at).SaveX(ctx)
	if rolledBack.TaskNo != "RW20261018-0002" {
		t.Fatal(rolledBack.TaskNo)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	next := numberedTask(client, "next", at).SaveX(ctx)
	if next.TaskNo != rolledBack.TaskNo {
		t.Fatalf("counter and task did not roll back together: %s", next.TaskNo)
	}
	newDay := numberedTask(client, "new-day", at.Add(time.Second)).SaveX(ctx)
	if newDay.TaskNo != "RW20261019-0001" {
		t.Fatal(newDay.TaskNo)
	}
	client.WorkflowTaskNumberCounter.UpdateOneID("20261019").SetLastValue(9999).SaveX(ctx)
	if got := numberedTask(client, "overflow", at.Add(time.Second)).SaveX(ctx).TaskNo; got != "RW20261019-10000" {
		t.Fatal(got)
	}
}

func TestWorkflowTaskNumberExactSearchAcrossDesktopAndMobile(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_number_search?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	at := time.Date(2026, 10, 18, 8, 0, 0, 0, time.UTC)
	first := numberedTask(client, "first", at).SaveX(ctx)
	second := numberedTask(client, "second", at).SetTaskName("引用 " + first.TaskNo).SaveX(ctx)
	private := numberedTask(client, "private", at).SetOwnerRoleKey("finance").SaveX(ctx)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	for _, keyword := range []string{first.TaskNo, " " + strings.ToLower(first.TaskNo) + " "} {
		rows, err := client.WorkflowTask.Query().Where(workflowTaskKeywordPredicate(keyword)).All(ctx)
		if err != nil || len(rows) != 1 || rows[0].ID != first.ID {
			t.Fatalf("full number must not match a different task's name %d: %v %v", second.ID, rows, err)
		}
		board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Keyword: keyword, OwnerRoleKey: "engineering", Status: "all", Limit: 50, SnapshotAt: at})
		if err != nil || board.Total != 1 {
			t.Fatalf("desktop number query: %+v %v", board, err)
		}
		mobile, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{Keyword: keyword, RoleKey: "engineering", ViewKey: "todo", Limit: 50, SnapshotAt: at})
		if err != nil || len(mobile.Items) != 1 || mobile.Items[0].TaskNo != first.TaskNo {
			t.Fatalf("mobile number query: %+v %v", mobile, err)
		}
	}
	filtered, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{Keyword: private.TaskNo, RoleKey: "engineering", ViewKey: "todo", Limit: 50, SnapshotAt: at})
	if err != nil || len(filtered.Items) != 0 {
		t.Fatalf("number search bypassed role visibility: %+v %v", filtered, err)
	}
	if ids := client.WorkflowTask.Query().Where(workflowTaskKeywordPredicate("RW20261018-000")).IDsX(ctx); len(ids) != 1 || ids[0] != second.ID {
		t.Fatalf("partial number must only match ordinary title text, not task numbers: %v", ids)
	}
	if count := client.WorkflowTask.Query().Where(workflowTaskKeywordPredicate("同名任务")).CountX(ctx); count != 2 {
		t.Fatalf("ordinary keyword search changed: %d", count)
	}
	if count := client.WorkflowTask.Query().Where(workflowtask.TaskNoEQ(first.TaskNo)).CountX(ctx); count != 1 {
		t.Fatal("task number index identity is inconsistent")
	}
}

func TestWorkflowPostgresTaskNumberConcurrentAllocation(t *testing.T) {
	db, client := openPurchaseReceiptPostgresTestData(t)
	ctx := context.Background()
	const writers = 12
	start := make(chan struct{})
	results := make(chan string, writers)
	failures := make(chan error, writers)
	var group sync.WaitGroup
	for i := range writers {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			<-start
			tx, err := db.postgres.Tx(ctx)
			if err != nil {
				failures <- err
				return
			}
			defer func() { _ = tx.Rollback() }()
			task, err := numberedTask(tx.Client(), fmt.Sprintf("number-race-%s-%d", postgresTestSuffix(), index), time.Date(2046, 1, 2, 0, 0, 0, 0, time.UTC)).Save(ctx)
			if err == nil {
				err = tx.Commit()
			}
			if err != nil {
				failures <- err
				return
			}
			results <- task.TaskNo
		}(i)
	}
	close(start)
	group.Wait()
	close(results)
	close(failures)
	for err := range failures {
		t.Error(err)
	}
	seen := map[string]bool{}
	for number := range results {
		if err := corevalue.ValidateWorkflowTaskNumber(number); err != nil || seen[number] {
			t.Fatalf("invalid or duplicate task number %s: %v", number, err)
		}
		seen[number] = true
	}
	if len(seen) != writers {
		t.Fatalf("allocated %d unique numbers for %d writers", len(seen), writers)
	}
	if count := client.WorkflowTask.Query().Where(workflowtask.TaskNoIn(keysForTaskNumbers(seen)...)).CountX(ctx); count != writers {
		t.Fatalf("persisted %d of %d task numbers", count, writers)
	}
}

func TestWorkflowTaskNumberEnrichesFrozenReceiptWithoutChangingItsResult(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_number_receipt?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	row := numberedTask(client, "legacy-receipt", time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)).SaveX(ctx)
	result, err := workflowTaskMutationResultMap(entWorkflowTaskToBiz(row))
	if err != nil {
		t.Fatal(err)
	}
	delete(result["task"].(map[string]any), "task_no")
	hash := strings.Repeat("a", 64)
	event := client.WorkflowTaskEvent.Create().SetTaskID(row.ID).SetTaskVersion(row.Version).
		SetEventType("created").SetToStatusKey("ready").SetActorID(7).
		SetCommandKey("create_task").SetIdempotencyKey("legacy-create").SetIntentHash(hash).
		SetMutationResult(result).SaveX(ctx)
	client.WorkflowTask.UpdateOneID(row.ID).SetTaskStatusKey("done").AddVersion(1).SaveX(ctx)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	replayed, found, err := repo.ResolveWorkflowTaskMutation(ctx, row.ID, "legacy-create", hash, "create_task", 7)
	if err != nil || !found || replayed.TaskNo != row.TaskNo || replayed.TaskStatusKey != "ready" || replayed.Version != row.Version {
		t.Fatalf("receipt must retain its original result with immutable number added: %+v %v %v", replayed, found, err)
	}
	stored := client.WorkflowTaskEvent.GetX(ctx, event.ID)
	if !reflect.DeepEqual(stored.MutationResult, event.MutationResult) {
		t.Fatal("number enrichment rewrote a frozen receipt")
	}
}

func keysForTaskNumbers(seen map[string]bool) []string {
	keys := make([]string, 0, len(seen))
	for number := range seen {
		keys = append(keys, number)
	}
	return keys
}
