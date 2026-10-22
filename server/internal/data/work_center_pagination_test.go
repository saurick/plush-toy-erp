package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkCenterPaginationReturnsHundredRowsAndExactLastPage(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:work_center_pagination?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	for i := 0; i < 106; i++ {
		role := biz.SalesRoleKey
		if i == 105 {
			role = biz.WarehouseRoleKey
		}
		client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("PAGINATION-%03d", i)).
			SetTaskGroup("generic").SetTaskName("核对工作资料").
			SetSourceType("pagination").SetSourceID(i + 1).
			SetTaskStatusKey("ready").SetOwnerRoleKey(role).
			SetPayload(map[string]any{}).SaveX(ctx)
	}
	scope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey}}
	snapshot := time.Now()
	for _, kind := range []string{"workbench", "task_board"} {
		t.Run(kind, func(t *testing.T) {
			seen := map[int]bool{}
			for _, offset := range []int{0, 100} {
				var tasks []*biz.WorkflowTask
				var total, limit, actualOffset int
				if kind == "workbench" {
					page, err := uc.GetWorkflowWorkbench(ctx, biz.WorkflowWorkbenchQuery{
						QueueKey: biz.WorkflowWorkbenchQueueActionable, Limit: 100, Offset: offset,
						VisibilityScope: scope, RiskVisibilityScope: scope, SnapshotAt: snapshot,
					})
					if err != nil {
						t.Fatal(err)
					}
					tasks, total, limit, actualOffset = page.Items, page.Total, page.Limit, page.Offset
				} else {
					board, err := uc.GetTaskBoard(ctx, biz.WorkflowTaskBoardQuery{
						LaneKey: biz.WorkflowTaskBoardLaneActionable, Limit: 100, Offset: offset,
						VisibilityScope: scope, SnapshotAt: snapshot,
					})
					if err != nil {
						t.Fatal(err)
					}
					if len(board.Lanes) != 1 {
						t.Fatalf("focused lanes=%d, want 1", len(board.Lanes))
					}
					lane := board.Lanes[0]
					tasks, total, limit, actualOffset = lane.Tasks, lane.Total, lane.Limit, lane.Offset
				}
				want := min(100, 105-offset)
				if total != 105 || limit != 100 || actualOffset != offset || len(tasks) != want {
					t.Fatalf("offset=%d: total=%d limit=%d offset=%d rows=%d, want 105/100/%d/%d", offset, total, limit, actualOffset, len(tasks), offset, want)
				}
				for _, task := range tasks {
					if task.OwnerRoleKey != biz.SalesRoleKey || seen[task.ID] {
						t.Fatalf("hidden or duplicate task: id=%d role=%s", task.ID, task.OwnerRoleKey)
					}
					seen[task.ID] = true
				}
			}
		})
	}
}
