package data

import (
	"context"
	"fmt"
	"io"
	"reflect"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkflowRoleTaskOrderingAndStatusAcrossPages(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:role_task_order?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	start := time.Date(2026, 9, 1, 9, 0, 0, 123456000, time.UTC)
	created := []int{4, 2, 2, 1, 3, 5, 0}
	deadlines := []int{0, 3, 1, 1, 0, 2, 0}
	statuses := []string{"ready", "blocked", "ready", "blocked", "ready", "done", "ready"}
	ids := make([]int, len(created))
	for i := range created {
		builder := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("SORT-%d", i)).
			SetTaskGroup("role-task-sort").SetTaskName("排序测试").
			SetSourceType("role-task-sort").SetSourceID(i + 1).
			SetOwnerRoleKey(biz.SalesRoleKey).SetTaskStatusKey(statuses[i]).
			SetCreatedAt(start.Add(time.Duration(created[i]) * time.Hour)).SetPayload(map[string]any{})
		if deadlines[i] > 0 {
			builder.SetDueAt(start.Add(time.Duration(deadlines[i]) * time.Hour))
		}
		ids[i] = builder.SaveX(ctx).ID
	}
	client.WorkflowTask.Create().SetTaskCode("SORT-OTHER-ROLE").SetTaskGroup("role-task-sort").
		SetTaskName("排序测试").SetSourceType("role-task-sort").SetSourceID(8).
		SetOwnerRoleKey(biz.FinanceRoleKey).SetTaskStatusKey("ready").
		SetCreatedAt(start.Add(-time.Hour)).SetPayload(map[string]any{}).SaveX(ctx)

	for _, tt := range []struct {
		sort, status string
		positions    []int
	}{
		{"newest", "", []int{1, 5, 3, 2, 4, 7}},
		{"oldest", "", []int{7, 4, 3, 2, 5, 1}},
		{"due", "", []int{4, 3, 2, 7, 5, 1}},
		{"newest", "blocked", []int{2, 4}},
		{"due", "blocked", []int{4, 2}},
		{"oldest", "ready", []int{7, 3, 5, 1}},
	} {
		t.Run(tt.sort+"/"+tt.status, func(t *testing.T) {
			query := biz.WorkflowRoleTaskViewQuery{ViewKey: "todo", RoleKey: biz.SalesRoleKey,
				SortKey: tt.sort, StatusKey: tt.status, Limit: 2, IncludeCounts: true,
				Keyword: "排序测试", SnapshotAt: start.Add(24 * time.Hour)}
			var got []int
			for pageIndex := 0; pageIndex < 10; pageIndex++ {
				page, err := repo.ListWorkflowRoleTaskView(ctx, query)
				if err != nil {
					t.Fatal(err)
				}
				if pageIndex == 0 && (page.Counts == nil || !page.Counts.IsConserved() || page.Counts.Todo != len(tt.positions)) {
					t.Fatalf("counts do not match filtered scope: %#v", page.Counts)
				}
				for _, task := range page.Items {
					got = append(got, task.ID)
				}
				if !page.HasMore {
					break
				}
				query.BeforeID, query.BeforeTime, query.IncludeCounts = page.NextID, page.NextTime, false
			}
			want := make([]int, len(tt.positions))
			for i, position := range tt.positions {
				want[i] = ids[position-1]
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("ordered pages = %v, want %v", got, want)
			}
		})
	}
}
