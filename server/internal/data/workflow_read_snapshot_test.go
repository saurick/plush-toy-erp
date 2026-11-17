package data

import (
	"context"
	"errors"
	"github.com/go-kratos/kratos/v2/log"
	"io"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowtask"
	"testing"
	"time"
)

func TestWorkflowPostgresSharedSearchSnapshot(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	data.sqldb.SetMaxOpenConns(1)
	data.sqldb.SetMaxIdleConns(1)
	ctx := t.Context()
	keyword := "read-search-" + postgresTestSuffix()
	now := time.Now().UTC()
	day := time.Date(2026, 11, 17, 1, 0, 0, 0, time.UTC)
	ids := []int{}
	for i := 0; i < 35; i++ {
		task := client.WorkflowTask.Create().SetTaskCode(keyword + "-" + time.Unix(int64(i), 0).Format("150405")).SetTaskName(keyword).SetTaskGroup(keyword).
			SetTaskStatusKey("ready").SetOwnerRoleKey(biz.WarehouseRoleKey).SetDueAt(day.Add(time.Duration(i) * time.Second)).SaveX(ctx)
		ids = append(ids, task.ID)
	}
	t.Cleanup(func() { client.WorkflowTask.Delete().Where(workflowtask.IDIn(ids...)).ExecX(context.Background()) })
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	scope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{biz.WarehouseRoleKey}}
	loaders := map[string]func() error{
		"board": func() error {
			p, e := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Keyword: keyword, LaneKey: "all", Sort: "smart", Limit: 20, SnapshotAt: now, VisibilityScope: scope})
			if e == nil && (p.Total != 35 || len(p.Lanes[0].Tasks) != 20) {
				t.Fatal("board changed result scope")
			}
			return e
		},
		"list": func() error {
			p, n, e := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: keyword, Limit: 20, VisibilityScope: scope})
			if e == nil && (n != 35 || len(p) != 20) {
				t.Fatal("list changed result scope")
			}
			return e
		},
		"status_counts": func() error {
			p, e := repo.CountWorkflowTasksByStatus(ctx, biz.WorkflowTaskFilter{Keyword: keyword, VisibilityScope: scope})
			if e == nil && p["ready"] != 35 {
				t.Fatal("status counts lost records")
			}
			return e
		},
		"mobile_counts": func() error {
			p, e := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{Keyword: keyword, RoleKey: biz.WarehouseRoleKey, ViewKey: "todo", Limit: 20, IncludeCounts: true, SnapshotAt: now, VisibilityScope: scope})
			if e == nil && (len(p.Items) != 20 || p.Counts.Total != 35) {
				t.Fatal("mobile counts changed scope")
			}
			return e
		},
		"mobile_page": func() error {
			p, e := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{Keyword: keyword, RoleKey: biz.WarehouseRoleKey, ViewKey: "todo", Limit: 20, SnapshotAt: now, VisibilityScope: scope})
			if e == nil && len(p.Items) != 20 {
				t.Fatal("mobile page lost rows")
			}
			return e
		},
		"tracking": func() error {
			p, e := repo.ListWorkflowTracking(ctx, biz.WorkflowTrackingQuery{Keyword: keyword, ActorID: 1, Scope: "visible", Limit: 20, VisibilityScope: scope})
			if e == nil && (p.Total != 35 || len(p.Items) != 20) {
				t.Fatal("tracking changed scope")
			}
			return e
		},
	}
	for name, load := range loaders {
		t.Run(name, func(t *testing.T) {
			if _, e := data.sqldb.ExecContext(ctx, "SET jit = on"); e != nil {
				t.Fatal(e)
			}
			if e := load(); e != nil {
				t.Fatal(e)
			}
			var setting string
			if e := data.sqldb.QueryRowContext(ctx, "SHOW jit").Scan(&setting); e != nil || setting != "on" {
				t.Fatalf("JIT escaped transaction: %s %v", setting, e)
			}
		})
	}
	t.Run("calendar", func(t *testing.T) {
		q := &biz.WorkflowTaskCalendarQuery{Month: "2026-11", Selection: "2026-11-17"}
		load := func() *biz.WorkflowTaskCalendar {
			p, e := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Keyword: keyword, TodoOnly: true, Limit: 20, Calendar: q, SnapshotAt: now, VisibilityScope: scope})
			if e != nil {
				t.Fatal(e)
			}
			return p.Calendar
		}
		first := load()
		if first.Total != 35 || first.Days["2026-11-17"] != 35 || len(first.Revision) != 64 {
			t.Fatalf("calendar counts or fingerprint changed: %+v", first)
		}
		q.Offset, q.Revision = 20, first.Revision
		second := load()
		if second.Offset != 20 || len(second.Tasks) != 15 {
			t.Fatal("stable calendar lost second page")
		}
		client.WorkflowTask.UpdateOneID(ids[0]).SetDueAt(day.AddDate(0, 0, 1)).AddVersion(1).SaveX(ctx)
		changed := load()
		if changed.Offset != 0 || changed.Total != 34 || changed.Revision == first.Revision {
			t.Fatal("calendar failed to restart after a changed due date")
		}
	})
	t.Run("rollback", func(t *testing.T) {
		expected := errors.New("read failed")
		if e := repo.readWorkflowSnapshot(ctx, keyword, func(*ent.Client) error { return expected }); !errors.Is(e, expected) {
			t.Fatal(e)
		}
		var setting string
		if e := data.sqldb.QueryRowContext(ctx, "SHOW jit").Scan(&setting); e != nil || setting != "on" {
			t.Fatalf("JIT leaked after rollback: %s %v", setting, e)
		}
	})
}
