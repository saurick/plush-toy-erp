package data

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowWorkbenchReturnsExactCountsAndOnlyTheRequestedPage(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_workbench?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshotAt := time.Date(2026, 8, 9, 10, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Hour)
	soon := snapshotAt.Add(time.Hour)
	later := snapshotAt.Add(4 * time.Hour)

	fixtures := []struct {
		code       string
		name       string
		roleKey    string
		status     string
		dueAt      *time.Time
		capability string
		priority   int16
	}{
		{code: "SALES-ACTION-1", name: "先处理", roleKey: biz.SalesRoleKey, status: "ready", dueAt: &soon},
		{code: "SALES-ACTION-2", name: "后处理", roleKey: biz.SalesRoleKey, status: "ready", dueAt: &later},
		{code: "SALES-APPROVAL", name: "销售审批", roleKey: biz.SalesRoleKey, status: "ready", capability: biz.PermissionWorkflowTaskApprove},
		{code: "SALES-BLOCKED", name: "销售阻塞", roleKey: biz.SalesRoleKey, status: "blocked"},
		{code: "WAREHOUSE-OVERDUE", name: "跨岗逾期", roleKey: biz.WarehouseRoleKey, status: "ready", dueAt: &overdue},
		{code: "WAREHOUSE-HIDDEN", name: "跨岗常规", roleKey: biz.WarehouseRoleKey, status: "ready", dueAt: &later},
		{code: "SALES-DONE", name: "已结束", roleKey: biz.SalesRoleKey, status: "done"},
	}
	for index, fixture := range fixtures {
		builder := client.WorkflowTask.Create().
			SetTaskCode(fixture.code).
			SetTaskGroup("workbench-test").
			SetTaskName(fixture.name).
			SetSourceType("workbench-test").
			SetSourceID(index + 1).
			SetTaskStatusKey(fixture.status).
			SetOwnerRoleKey(fixture.roleKey).
			SetPriority(fixture.priority).
			SetPayload(map[string]any{})
		if fixture.dueAt != nil {
			builder.SetDueAt(*fixture.dueAt)
		}
		if fixture.capability != "" {
			builder.SetRequiredCapabilityKey(fixture.capability)
		}
		if _, err := builder.Save(ctx); err != nil {
			t.Fatalf("create fixture %s: %v", fixture.code, err)
		}
	}

	query := biz.WorkflowWorkbenchQuery{
		QueueKey: biz.WorkflowWorkbenchQueueActionable,
		Limit:    2,
		Offset:   0,
		VisibilityScope: &biz.WorkflowTaskVisibilityScope{
			StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
		},
		RiskVisibilityScope: &biz.WorkflowTaskVisibilityScope{
			StandaloneAllowAllOwnerRoles: true,
		},
		ApprovalVisibilityScopes: []biz.WorkflowApprovalVisibilityScope{{
			CapabilityKey: biz.PermissionWorkflowTaskApprove,
			VisibilityScope: &biz.WorkflowTaskVisibilityScope{
				StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
			},
		}},
		SnapshotAt: snapshotAt,
	}
	page, err := repo.GetWorkflowWorkbench(ctx, query)
	if err != nil {
		t.Fatalf("get actionable workbench: %v", err)
	}
	wantCounts := biz.WorkflowWorkbenchCounts{Actionable: 3, Risk: 2, Approval: 1}
	if page.Counts != wantCounts || page.Total != wantCounts.Actionable || len(page.Items) != 2 {
		t.Fatalf("actionable page=%#v, want counts=%#v total=3 items=2", page, wantCounts)
	}
	if page.Items[0].TaskCode != "SALES-ACTION-1" || page.Items[1].TaskCode != "SALES-ACTION-2" {
		t.Fatalf("actionable order=%v,%v", page.Items[0].TaskCode, page.Items[1].TaskCode)
	}

	query.QueueKey = biz.WorkflowWorkbenchQueueRisk
	query.Limit = 8
	riskPage, err := repo.GetWorkflowWorkbench(ctx, query)
	if err != nil {
		t.Fatalf("get risk workbench: %v", err)
	}
	if riskPage.Counts != wantCounts || riskPage.Total != 2 || len(riskPage.Items) != 2 || riskPage.Items[0].TaskCode != "WAREHOUSE-OVERDUE" {
		t.Fatalf("risk page=%#v", riskPage)
	}

	query.QueueKey = biz.WorkflowWorkbenchQueueApproval
	approvalPage, err := repo.GetWorkflowWorkbench(ctx, query)
	if err != nil {
		t.Fatalf("get approval workbench: %v", err)
	}
	if approvalPage.Counts != wantCounts || approvalPage.Total != 1 || len(approvalPage.Items) != 1 || approvalPage.Items[0].TaskCode != "SALES-APPROVAL" {
		t.Fatalf("approval page=%#v", approvalPage)
	}
}
