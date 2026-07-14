package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowRoleTaskViewPaginatesAll351TasksWithoutLegacyCap(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_role_task_351?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))

	builders := make([]*ent.WorkflowTaskCreate, 0, 351)
	for index := 1; index <= 351; index++ {
		builders = append(builders, client.WorkflowTask.Create().
			SetTaskCode(fmt.Sprintf("ROLE-TODO-%03d", index)).
			SetTaskGroup("role-task-pagination").
			SetTaskName("岗位任务游标测试").
			SetSourceType("role-task-pagination").
			SetSourceID(index).
			SetTaskStatusKey("ready").
			SetOwnerRoleKey(biz.SalesRoleKey).
			SetPayload(map[string]any{}))
	}
	if _, err := client.WorkflowTask.CreateBulk(builders...).Save(ctx); err != nil {
		t.Fatalf("create role task fixtures: %v", err)
	}

	snapshotAt := time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC)
	seenIDs := make(map[int]struct{}, 351)
	beforeID := 0
	pageCount := 0
	for {
		page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
			ViewKey:    biz.WorkflowRoleTaskViewTodo,
			RoleKey:    biz.SalesRoleKey,
			Limit:      100,
			BeforeID:   beforeID,
			SnapshotAt: snapshotAt,
		})
		if err != nil {
			t.Fatalf("list role task page %d: %v", pageCount+1, err)
		}
		pageCount++
		if !page.SnapshotAt.Equal(snapshotAt) {
			t.Fatalf("page %d snapshot = %s, want %s", pageCount, page.SnapshotAt, snapshotAt)
		}
		for _, task := range page.Items {
			if _, exists := seenIDs[task.ID]; exists {
				t.Fatalf("task %d repeated across cursor pages", task.ID)
			}
			seenIDs[task.ID] = struct{}{}
		}
		if !page.HasMore {
			if page.NextID != 0 {
				t.Fatalf("last page next id = %d, want 0", page.NextID)
			}
			break
		}
		if len(page.Items) != 100 || page.NextID <= 0 {
			t.Fatalf("page %d is not a full cursor page: %#v", pageCount, page)
		}
		beforeID = page.NextID
	}

	if pageCount != 4 {
		t.Fatalf("page count = %d, want 4", pageCount)
	}
	if len(seenIDs) != 351 {
		t.Fatalf("visible task count = %d, want 351", len(seenIDs))
	}
}
