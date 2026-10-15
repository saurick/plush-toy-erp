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

func TestWorkflowTaskCalendarScopeDatesAndPagination(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_calendar?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	day := time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)
	monthBoundary := time.Date(2026, 9, 30, 16, 0, 0, 0, time.UTC)
	previousMonth := monthBoundary.Add(-time.Second)
	for index := 0; index < 85; index++ {
		builder := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("CALENDAR-%d", index)).
			SetTaskGroup("calendar-test").SetTaskName("核实交期").SetSourceType("calendar-test").SetSourceID(index + 1).
			SetTaskStatusKey("ready").SetOwnerRoleKey(biz.SalesRoleKey).SetPayload(map[string]any{})
		if index != 82 {
			builder.SetDueAt(day)
		}
		switch index {
		case 1:
			builder.SetTaskStatusKey("blocked")
		case 80:
			builder.SetDueAt(monthBoundary)
		case 81:
			builder.SetDueAt(previousMonth)
		case 83:
			builder.SetTaskStatusKey("done")
		case 84:
			builder.SetOwnerRoleKey(biz.QualityRoleKey)
		}
		builder.SaveX(ctx)
	}
	scope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey}}
	loaders := map[string]func(*biz.WorkflowTaskCalendarQuery) (*biz.WorkflowTaskCalendar, error){
		"desktop": func(q *biz.WorkflowTaskCalendarQuery) (*biz.WorkflowTaskCalendar, error) {
			page, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Calendar: q, TodoOnly: true, Limit: 30, SnapshotAt: day.Add(-time.Hour), VisibilityScope: scope})
			if err != nil {
				return nil, err
			}
			return page.Calendar, nil
		},
		"mobile": func(q *biz.WorkflowTaskCalendarQuery) (*biz.WorkflowTaskCalendar, error) {
			page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{Calendar: q, ViewKey: "todo", RoleKey: biz.SalesRoleKey, Limit: 30, IncludeCounts: true, SnapshotAt: day.Add(-time.Hour), VisibilityScope: scope})
			if err != nil {
				return nil, err
			}
			return page.Calendar, nil
		},
	}
	for name, load := range loaders {
		t.Run(name, func(t *testing.T) {
			q := &biz.WorkflowTaskCalendarQuery{Month: "2026-10", Selection: "2026-10-14"}
			seen := map[int]bool{}
			for _, offset := range []int{0, 30, 60} {
				q.Offset = offset
				result, err := load(q)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(result.Days, map[string]int{"2026-10-01": 1, "2026-10-14": 80}) || result.Total != 80 || result.Overdue != 2 || result.Undated != 1 {
					t.Fatalf("wrong aggregate: %+v", result)
				}
				for _, task := range result.Tasks {
					if seen[task.ID] || task.OwnerRoleKey != biz.SalesRoleKey || task.TaskStatusKey == "done" {
						t.Fatalf("duplicate or invisible task: %+v", task)
					}
					seen[task.ID] = true
				}
			}
			if len(seen) != 80 {
				t.Fatalf("pagination lost tasks: %d", len(seen))
			}
			for selection, count := range map[string]int{"overdue": 2, "undated": 1, "2026-10-02": 0} {
				q.Selection, q.Offset = selection, 0
				result, err := load(q)
				if err != nil || result.Total != count || len(result.Tasks) != count {
					t.Fatalf("%s: %+v %v", selection, result, err)
				}
			}
		})
	}
	denied, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Calendar: &biz.WorkflowTaskCalendarQuery{Month: "2026-10", Selection: "overdue"}, TodoOnly: true, Limit: 30, SnapshotAt: day, VisibilityScope: &biz.WorkflowTaskVisibilityScope{}})
	if err != nil || denied.Calendar.Total != 0 || len(denied.Calendar.Days) != 0 || denied.Calendar.Undated != 0 {
		t.Fatalf("empty permission scope leaked calendar: %+v %v", denied, err)
	}
}
