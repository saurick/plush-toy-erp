package data

import (
	"context"
	"fmt"
	"io"
	"slices"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkflowTaskTitleSearchAcrossBoardAndRoleViews(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_title_search?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshot := time.Now()
	expected := map[string]map[string][]int{}
	for _, keyword := range []string{"发料", "入库", "包装", "不存在的任务标题"} {
		expected[keyword] = map[string][]int{"ready": {}, "done": {}}
	}
	fixtures := []struct {
		kind     string
		keywords []string
	}{
		{"outsourcing_issue", []string{"发料"}},
		{"production_cutting_issue", []string{"发料"}},
		{"receipt_inbound", []string{"入库"}},
		{"outsourcing_inbound", []string{"入库"}},
		{"production_inbound", []string{"入库"}},
		{"production_packaging_transfer", []string{"入库", "包装"}},
		{"production_packaging_execute", []string{"包装"}},
		{"production_return", nil},
		{"", []string{"包装"}},
	}
	for index, fixture := range fixtures {
		name := "核对包装要求"
		if fixture.kind != "" {
			spec, ok := biz.FulfillmentTaskSpecFor("handoff_" + fixture.kind)
			if !ok {
				t.Fatalf("missing task definition: %s", fixture.kind)
			}
			name = spec.Name
		}
		for _, status := range []string{"ready", "done"} {
			// Only the title contains the keyword; source and discovery matches
			// must not conceal a regression in task-name searching.
			builder := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("TITLE-%d-%s", index, status)).
				SetTaskGroup("generic").SetTaskName(name).SetOwnerRoleKey(biz.WarehouseRoleKey).SetTaskStatusKey(status)
			if status == "done" {
				builder.SetCompletedAt(snapshot.Add(-time.Hour))
			}
			row := builder.SaveX(ctx)
			for _, keyword := range fixture.keywords {
				expected[keyword][status] = append(expected[keyword][status], row.ID)
			}
		}
	}
	client.WorkflowTask.Create().SetTaskCode("TITLE-OTHER-ROLE").SetTaskGroup("generic").
		SetTaskName("核对发料入库包装资料").SetOwnerRoleKey(biz.FinanceRoleKey).SetTaskStatusKey("ready").SaveX(ctx)

	assertIDs := func(t *testing.T, got, want []int) {
		t.Helper()
		slices.Sort(got)
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Fatalf("search lost, duplicated or exposed tasks: got %v, want %v", got, want)
		}
	}
	for _, keyword := range []string{"发料", "入库", "包装", "不存在的任务标题"} {
		t.Run(keyword, func(t *testing.T) {
			want := append(slices.Clone(expected[keyword]["ready"]), expected[keyword]["done"]...)
			var boardIDs []int
			for offset := 0; offset < max(len(want), 1); offset += 2 {
				board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{
					Keyword: keyword, LaneKey: biz.WorkflowTaskBoardLaneAll, Limit: 2, Offset: offset,
					VisibleOwnerRoleKeys: []string{biz.WarehouseRoleKey}, SnapshotAt: snapshot,
				})
				if err != nil {
					t.Fatal(err)
				}
				if board.Total != len(want) || board.Counts.Actionable != len(expected[keyword]["ready"]) ||
					board.Counts.Finished != len(expected[keyword]["done"]) || len(board.Lanes) != 1 {
					t.Fatalf("title search counts must cover all pages: %+v", board)
				}
				for _, task := range board.Lanes[0].Tasks {
					boardIDs = append(boardIDs, task.ID)
				}
			}
			assertIDs(t, boardIDs, want)
			for _, view := range []struct{ key, status string }{
				{biz.WorkflowRoleTaskViewTodo, "ready"}, {biz.WorkflowRoleTaskViewHistory, "done"},
			} {
				t.Run(view.key, func(t *testing.T) {
					var ids []int
					var beforeTime *time.Time
					beforeID := 0
					for pageIndex := 0; ; pageIndex++ {
						if pageIndex > len(expected[keyword][view.status]) {
							t.Fatal("title search cursor did not finish")
						}
						page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
							RoleKey: biz.WarehouseRoleKey, ViewKey: view.key, Keyword: keyword,
							Limit: 1, BeforeID: beforeID, BeforeTime: beforeTime, IncludeCounts: beforeID == 0, SnapshotAt: snapshot,
						})
						if err != nil {
							t.Fatal(err)
						}
						if beforeID == 0 && (page.Counts == nil || page.Counts.Todo != len(expected[keyword]["ready"]) ||
							page.Counts.History != len(expected[keyword]["done"])) {
							t.Fatalf("role-view counts lost title search: %+v", page.Counts)
						}
						for _, task := range page.Items {
							ids = append(ids, task.ID)
						}
						if !page.HasMore {
							break
						}
						beforeID = page.NextID
						beforeTime = page.NextTime
					}
					assertIDs(t, ids, slices.Clone(expected[keyword][view.status]))
				})
			}
		})
	}
}
