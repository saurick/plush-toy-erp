package data

import (
	"context"
	"fmt"
	"io"
	"reflect"
	"sort"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
)

func TestWorkflowTaskFilterParity(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:task_filter_parity?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	now := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	for i, hours := range []int{-1, 0, 24, 25, 100} {
		for _, role := range []string{"sales", "finance"} {
			for _, source := range []string{"sales_order", "purchase_order"} {
				b := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("PARITY-%d-%s-%s", i, role, source)).SetTaskGroup("filter-parity").SetTaskName("筛选一致性").SetSourceType(source).SetSourceID(i + 1).SetOwnerRoleKey(role).SetTaskStatusKey("ready").SetCreatedAt(now.Add(-time.Hour)).SetPayload(map[string]any{})
				if hours != 100 {
					b.SetDueAt(now.Add(time.Duration(hours) * time.Hour))
				}
				b.SaveX(ctx)
			}
		}
	}
	for _, due := range []string{"all", "overdue", "dueSoon", "noDue"} {
		t.Run(due, func(t *testing.T) {
			board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{OwnerRoleKey: "sales", Due: due, SourceType: "sales_order", Status: "all", Limit: 50, SnapshotAt: now})
			if err != nil {
				t.Fatal(err)
			}
			mobile, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{RoleKey: "sales", ViewKey: "todo", Due: due, SourceType: "sales_order", IncludeCounts: true, Limit: 50, SnapshotAt: now})
			if err != nil {
				t.Fatal(err)
			}
			var desktopIDs, mobileIDs []int
			for _, lane := range board.Lanes {
				for _, task := range lane.Tasks {
					desktopIDs = append(desktopIDs, task.ID)
				}
			}
			for _, task := range mobile.Items {
				mobileIDs = append(mobileIDs, task.ID)
			}
			sort.Ints(desktopIDs)
			sort.Ints(mobileIDs)
			if !reflect.DeepEqual(desktopIDs, mobileIDs) || len(mobileIDs) == 0 || mobile.Counts.Todo != len(mobileIDs) {
				t.Fatalf("desktop=%v mobile=%v counts=%+v", desktopIDs, mobileIDs, mobile.Counts)
			}
			expected := map[string]int{"all": 5, "overdue": 1, "dueSoon": 2, "noDue": 1}[due]
			if len(mobileIDs) != expected {
				t.Fatalf("got %d want %d", len(mobileIDs), expected)
			}
		})
	}
	from, before, err := biz.WorkflowRoleTaskHistoryDateBounds("custom", "2026-10-16", "2026-10-16", now)
	if err != nil {
		t.Fatal(err)
	}
	for i, at := range []time.Time{from.Add(-time.Nanosecond), *from, before.Add(-time.Nanosecond), *before} {
		client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("PARITY-HISTORY-%d", i)).SetTaskGroup("filter-parity").SetTaskName("历史筛选").SetSourceType("sales_order").SetSourceID(i + 1).SetOwnerRoleKey("sales").SetTaskStatusKey("done").SetCompletedAt(at).SetPayload(map[string]any{}).SaveX(ctx)
	}
	board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{OwnerRoleKey: "sales", LaneKey: "finished", Status: "all", Limit: 50, SnapshotAt: now, CompletedFrom: from, CompletedBefore: before})
	if err != nil {
		t.Fatal(err)
	}
	mobile, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{RoleKey: "sales", ViewKey: "history", SortKey: "completed", Limit: 50, IncludeCounts: true, SnapshotAt: now, CompletedFrom: from, CompletedBefore: before})
	if err != nil {
		t.Fatal(err)
	}
	if board.Counts.Finished != 2 || len(mobile.Items) != 2 || mobile.Counts.History != 2 {
		t.Fatalf("date bounds differ: board=%+v mobile=%+v", board.Counts, mobile.Counts)
	}
}
