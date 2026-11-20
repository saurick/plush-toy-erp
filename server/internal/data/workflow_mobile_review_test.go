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

func TestWorkflowMobileReviewFiltersRowsCountsSearchAndPaginationTogether(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:mobile_review?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshot := time.Now().UTC().Truncate(time.Second)
	for index, item := range []struct{ role, status, revision string }{
		{"sales", "ready", ""}, {"warehouse", "blocked", ""}, {"sales", "done", ""},
		{"finance", "ready", ""}, {"sales", "ready", "unpublished"},
	} {
		builder := client.WorkflowTask.Create().SetTaskCode(fmt.Sprintf("REVIEW-%d", index)).
			SetTaskGroup("review").SetTaskName("查看 " + item.role).SetSourceType("review").SetSourceID(index + 1).
			SetOwnerRoleKey(item.role).SetTaskStatusKey(item.status).SetPayload(map[string]any{}).
			SetRequiredCapabilityKey(biz.PermissionWorkflowTaskApprove).SetDueAt(snapshot.Add(-time.Hour))
		if item.revision != "" {
			builder.SetConfigRevision(item.revision)
		}
		if _, err := builder.Save(ctx); err != nil {
			t.Fatal(err)
		}
	}
	query := biz.WorkflowRoleTaskViewQuery{
		RoleKey: biz.MobileAllRolesKey, ReviewRoleKeys: []string{"sales", "warehouse"},
		ViewKey: biz.WorkflowRoleTaskViewTodo, Limit: 1, IncludeCounts: true, SnapshotAt: snapshot,
		VisibilityScope: &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true},
		ApprovalVisibilityScopes: []biz.WorkflowApprovalVisibilityScope{{
			CapabilityKey:   biz.PermissionWorkflowTaskApprove,
			VisibilityScope: &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true},
		}},
	}
	page, err := repo.ListWorkflowRoleTaskView(ctx, query)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || !page.HasMore || page.Counts == nil || !page.Counts.IsConserved() ||
		page.Counts.Todo != 2 || page.Counts.History != 1 || page.Counts.Total != 3 || page.Counts.Risk != 2 || page.Counts.Approval != 2 {
		t.Fatalf("all roles page=%#v counts=%#v", page, page.Counts)
	}
	query.BeforeID, query.IncludeCounts = page.NextID, false
	last, err := repo.ListWorkflowRoleTaskView(ctx, query)
	if err != nil || len(last.Items) != 1 || last.HasMore || last.Counts != nil || last.Items[0].ID == page.Items[0].ID {
		t.Fatalf("last page=%#v err=%v", last, err)
	}
	query.BeforeID, query.IncludeCounts, query.Limit = 0, true, 50
	query.RoleKey, query.ReviewRoleKeys, query.CrossRoleRiskAllowed = "sales", []string{"sales"}, true
	for _, view := range []string{biz.WorkflowRoleTaskViewTodo, biz.WorkflowRoleTaskViewHistory, biz.WorkflowRoleTaskViewRisk, biz.WorkflowRoleTaskViewApproval} {
		query.ViewKey = view
		page, err := repo.ListWorkflowRoleTaskView(ctx, query)
		if err != nil || len(page.Items) != 1 || page.Items[0].OwnerRoleKey != "sales" || page.Counts.Total != 2 {
			t.Fatalf("selected role view=%s page=%#v err=%v", view, page, err)
		}
	}
	query.RoleKey, query.ReviewRoleKeys, query.Keyword = biz.MobileAllRolesKey, []string{"sales", "warehouse"}, "warehouse"
	page, err = repo.ListWorkflowRoleTaskView(ctx, query)
	if err != nil || len(page.Items) != 1 || page.Counts.Total != 1 || page.Items[0].OwnerRoleKey != "warehouse" {
		t.Fatalf("search page=%#v err=%v", page, err)
	}
	query.VisibilityScope, query.ViewKey = nil, biz.WorkflowRoleTaskViewTodo
	page, err = repo.ListWorkflowRoleTaskView(ctx, query)
	if err != nil || len(page.Items) != 0 {
		t.Fatalf("missing visibility must fail closed page=%#v err=%v", page, err)
	}
}
