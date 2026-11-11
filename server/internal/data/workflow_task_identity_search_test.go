package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestWorkflowOutsourcingFactIdentitySearchRespectsVisibility(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "workflow_outsourcing_identity_search")
	fixture := createInventoryTestFixtures(t, ctx, client)
	const keyword = "RETURN-STYLE-LOOKUP"
	client.Product.UpdateOneID(fixture.productID).SetStyleNo(keyword).SaveX(ctx)
	fact := client.OutsourcingFact.Create().SetFactNo("RETURN-SEARCH-001").
		SetFactType(biz.OutsourcingFactReturnReceipt).SetSubjectType(biz.InventorySubjectProduct).
		SetSubjectID(fixture.productID).SetWarehouseID(fixture.productWarehouseID).
		SetUnitID(fixture.unitID).SetQuantity(decimal.NewFromInt(1)).SetIdempotencyKey("return-search").SaveX(ctx)
	if err := syncFulfillmentTask(ctx, client, "outsourcing_inbound", fact.ID, fact.FactNo, "/erp/warehouse/inbound", "ready", "", 0); err != nil {
		t.Fatal(err)
	}
	bound := assertFulfillmentTask(t, ctx, client, "outsourcing_inbound", fact.ID, "ready", biz.WarehouseRoleKey)
	// A source ID on its own must not make source identities searchable.
	client.WorkflowTask.Create().SetTaskCode("UNBOUND-RETURN").SetTaskName("普通跟进").SetTaskGroup(biz.WorkflowFollowupTaskGroup).
		SetSourceType("outsourcing_fact").SetSourceID(fact.ID).SetOwnerRoleKey(biz.WarehouseRoleKey).SetTaskStatusKey("ready").SaveX(ctx)

	// The fixture holds one SQLite connection. After setup it rejects writes,
	// including any accidental change made during task display hydration.
	if _, err := data.sqldb.ExecContext(ctx, "PRAGMA query_only = ON"); err != nil {
		t.Fatal(err)
	}
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	snapshot := time.Now()
	for _, tc := range []struct {
		role string
		want int
	}{{biz.WarehouseRoleKey, 1}, {biz.SalesRoleKey, 0}} {
		t.Run(tc.role, func(t *testing.T) {
			scope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{tc.role}}
			checkTasks := func(entry string, items []*biz.WorkflowTask, total int) {
				t.Helper()
				if total != tc.want || len(items) != tc.want {
					t.Fatalf("%s: got total=%d, rows=%d; want %d", entry, total, len(items), tc.want)
				}
				if tc.want > 0 && items[0].ID != bound.ID {
					t.Fatalf("%s: returned task %d without the expected source binding", entry, items[0].ID)
				}
			}
			items, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Keyword: keyword, Limit: 1, VisibilityScope: scope})
			if err != nil {
				t.Fatal(err)
			}
			checkTasks("list", items, total)

			board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{
				Keyword: keyword, LaneKey: biz.WorkflowTaskBoardLaneAll, Limit: 1, SnapshotAt: snapshot, VisibilityScope: scope,
			})
			if err != nil {
				t.Fatal(err)
			}
			if len(board.Lanes) != 1 || board.Counts.Actionable != tc.want {
				t.Fatalf("board: got %d lanes and %d actionable tasks", len(board.Lanes), board.Counts.Actionable)
			}
			checkTasks("board", board.Lanes[0].Tasks, board.Total)

			roleView, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
				RoleKey: tc.role, ViewKey: biz.WorkflowRoleTaskViewTodo, Keyword: keyword, Limit: 1,
				SnapshotAt: snapshot, VisibilityScope: scope, IncludeCounts: true,
			})
			if err != nil {
				t.Fatal(err)
			}
			checkTasks("role view", roleView.Items, roleView.Counts.Todo)

			tracking, err := repo.ListWorkflowTracking(ctx, biz.WorkflowTrackingQuery{
				ActorID: 7, Scope: "visible", Keyword: keyword, Limit: 1, VisibilityScope: scope,
			})
			if err != nil {
				t.Fatal(err)
			}
			if tracking.Total != tc.want || len(tracking.Items) != tc.want {
				t.Fatalf("tracking: got total=%d, rows=%d; want %d", tracking.Total, len(tracking.Items), tc.want)
			}
			if tc.want > 0 && tracking.Items[0].Ref != (biz.WorkflowTrackingRef{Kind: "task", ID: bound.ID}) {
				t.Fatalf("tracking: unexpected reference %+v", tracking.Items[0].Ref)
			}
		})
	}
}
