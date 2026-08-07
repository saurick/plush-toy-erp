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

func TestWorkflowRoleTaskViewCountsConservationContract(t *testing.T) {
	valid := biz.WorkflowRoleTaskViewCounts{
		Ready: 2, Blocked: 1, Todo: 3,
		Done: 4, Rejected: 1, History: 5, Total: 8,
		Approval: 6, Risk: 9, Overdue: 3,
	}
	if !valid.IsConserved() {
		t.Fatalf("valid counts rejected: %#v", valid)
	}
	for name, mutate := range map[string]func(*biz.WorkflowRoleTaskViewCounts){
		"negative":         func(counts *biz.WorkflowRoleTaskViewCounts) { counts.Ready = -1 },
		"todo mismatch":    func(counts *biz.WorkflowRoleTaskViewCounts) { counts.Todo++ },
		"history mismatch": func(counts *biz.WorkflowRoleTaskViewCounts) { counts.History++ },
		"total mismatch":   func(counts *biz.WorkflowRoleTaskViewCounts) { counts.Total++ },
		"overdue above risk": func(counts *biz.WorkflowRoleTaskViewCounts) {
			counts.Overdue = counts.Risk + 1
		},
	} {
		t.Run(name, func(t *testing.T) {
			candidate := valid
			mutate(&candidate)
			if candidate.IsConserved() {
				t.Fatalf("invalid counts accepted: %#v", candidate)
			}
		})
	}
	for viewKey, want := range map[string]int{
		biz.WorkflowRoleTaskViewTodo:     valid.Todo,
		biz.WorkflowRoleTaskViewHistory:  valid.History,
		biz.WorkflowRoleTaskViewRisk:     valid.Risk,
		biz.WorkflowRoleTaskViewApproval: valid.Approval,
	} {
		got, ok := valid.ViewTotal(viewKey)
		if !ok || got != want {
			t.Fatalf("view %s total=(%d,%t), want=(%d,true)", viewKey, got, ok, want)
		}
	}
}

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
			ViewKey:       biz.WorkflowRoleTaskViewTodo,
			RoleKey:       biz.SalesRoleKey,
			Limit:         100,
			BeforeID:      beforeID,
			IncludeCounts: beforeID == 0,
			SnapshotAt:    snapshotAt,
		})
		if err != nil {
			t.Fatalf("list role task page %d: %v", pageCount+1, err)
		}
		pageCount++
		if !page.SnapshotAt.Equal(snapshotAt) {
			t.Fatalf("page %d snapshot = %s, want %s", pageCount, page.SnapshotAt, snapshotAt)
		}
		if pageCount == 1 {
			want := biz.WorkflowRoleTaskViewCounts{Ready: 351, Todo: 351, Total: 351}
			if page.Counts == nil || *page.Counts != want {
				t.Fatalf("first page counts=%#v, want=%#v", page.Counts, want)
			}
		} else if page.Counts != nil {
			t.Fatalf("cursor page %d unexpectedly returned counts=%#v", pageCount, page.Counts)
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

func TestWorkflowRoleTaskViewCountsUseFullAuthorizedProjection(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_role_task_counts?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))

	snapshotAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Minute)
	atBoundary := snapshotAt
	fixtures := []struct {
		code       string
		roleKey    string
		status     string
		priority   int
		dueAt      *time.Time
		capability string
	}{
		{code: "SALES-READY", roleKey: biz.SalesRoleKey, status: "ready"},
		{code: "SALES-BLOCKED", roleKey: biz.SalesRoleKey, status: "blocked"},
		{code: "SALES-OVERDUE", roleKey: biz.SalesRoleKey, status: "ready", dueAt: &overdue},
		{code: "SALES-DUE-AT-SNAPSHOT", roleKey: biz.SalesRoleKey, status: "ready", dueAt: &atBoundary},
		{code: "SALES-HIGH-PRIORITY", roleKey: biz.SalesRoleKey, status: "ready", priority: 3},
		{code: "SALES-APPROVAL-ALLOWED", roleKey: biz.SalesRoleKey, status: "ready", capability: biz.PermissionWorkflowTaskApprove},
		{code: "SALES-APPROVAL-NOT-GRANTED", roleKey: biz.SalesRoleKey, status: "ready", capability: biz.PermissionFinancePaymentApprove},
		{code: "WAREHOUSE-OVERDUE", roleKey: biz.WarehouseRoleKey, status: "ready", dueAt: &overdue},
		{code: "SALES-DONE", roleKey: biz.SalesRoleKey, status: "done", dueAt: &overdue},
		{code: "SALES-REJECTED", roleKey: biz.SalesRoleKey, status: "rejected"},
	}
	for index, fixture := range fixtures {
		builder := client.WorkflowTask.Create().
			SetTaskCode(fixture.code).
			SetTaskGroup("role-task-counts").
			SetTaskName(fixture.code).
			SetSourceType("role-task-counts").
			SetSourceID(index + 1).
			SetTaskStatusKey(fixture.status).
			SetOwnerRoleKey(fixture.roleKey).
			SetPriority(int16(fixture.priority)).
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

	page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
		ViewKey:              biz.WorkflowRoleTaskViewTodo,
		RoleKey:              biz.SalesRoleKey,
		Limit:                1,
		IncludeCounts:        true,
		CrossRoleRiskAllowed: true,
		SnapshotAt:           snapshotAt,
		ApprovalVisibilityScopes: []biz.WorkflowApprovalVisibilityScope{{
			CapabilityKey: biz.PermissionWorkflowTaskApprove,
			VisibilityScope: &biz.WorkflowTaskVisibilityScope{
				StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
			},
		}},
	})
	if err != nil {
		t.Fatalf("list role task counts: %v", err)
	}
	want := biz.WorkflowRoleTaskViewCounts{
		Ready: 6, Blocked: 1, Todo: 7,
		Done: 1, Rejected: 1, History: 2, Total: 9,
		Approval: 1, Risk: 4, Overdue: 2,
	}
	if page.Counts == nil || *page.Counts != want {
		t.Fatalf("counts=%#v, want=%#v", page.Counts, want)
	}
	if len(page.Items) != 1 || !page.HasMore {
		t.Fatalf("page=%#v, want one item and more pages", page)
	}

	withoutApproval, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
		ViewKey:       biz.WorkflowRoleTaskViewTodo,
		RoleKey:       biz.SalesRoleKey,
		Limit:         20,
		IncludeCounts: true,
		SnapshotAt:    snapshotAt,
	})
	if err != nil {
		t.Fatalf("list role task counts without approval scope: %v", err)
	}
	if withoutApproval.Counts == nil || withoutApproval.Counts.Approval != 0 {
		t.Fatalf("counts without approval scope=%#v, want approval=0", withoutApproval.Counts)
	}
}

func TestWorkflowRoleTaskViewCountsConserveForAllNineMobileRoles(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_role_task_nine_roles?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	roleKeys := []string{
		biz.BossRoleKey,
		biz.SalesRoleKey,
		biz.PurchaseRoleKey,
		biz.ProductionRoleKey,
		biz.WarehouseRoleKey,
		biz.QualityRoleKey,
		biz.FinanceRoleKey,
		biz.PMCRoleKey,
		biz.EngineeringRoleKey,
	}
	statuses := []string{"ready", "blocked", "done", "rejected"}
	for roleIndex, roleKey := range roleKeys {
		for statusIndex, status := range statuses {
			if _, err := client.WorkflowTask.Create().
				SetTaskCode(fmt.Sprintf("ROLE-%s-%s", roleKey, status)).
				SetTaskGroup("role-task-nine-role-counts").
				SetTaskName(roleKey + " " + status).
				SetSourceType("role-task-nine-role-counts").
				SetSourceID(roleIndex*len(statuses) + statusIndex + 1).
				SetTaskStatusKey(status).
				SetOwnerRoleKey(roleKey).
				SetPayload(map[string]any{}).
				Save(ctx); err != nil {
				t.Fatalf("create %s %s fixture: %v", roleKey, status, err)
			}
		}
	}
	want := biz.WorkflowRoleTaskViewCounts{
		Ready: 1, Blocked: 1, Todo: 2,
		Done: 1, Rejected: 1, History: 2, Total: 4,
		Risk: 1,
	}
	for _, roleKey := range roleKeys {
		page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
			ViewKey:       biz.WorkflowRoleTaskViewTodo,
			RoleKey:       roleKey,
			Limit:         20,
			IncludeCounts: true,
			SnapshotAt:    time.Date(2026, 8, 6, 9, 0, 0, 0, time.UTC),
		})
		if err != nil {
			t.Fatalf("list %s counts: %v", roleKey, err)
		}
		if page.Counts == nil || *page.Counts != want || !page.Counts.IsConserved() {
			t.Fatalf("role %s counts=%#v, want=%#v", roleKey, page.Counts, want)
		}
	}
}

func TestWorkflowRoleTaskApprovalViewUsesRegisteredCapabilitiesAndPairedScope(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_role_task_approval?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))

	fixtures := []struct {
		code       string
		capability string
		status     string
	}{
		{code: "GENERIC-VISIBLE", capability: biz.PermissionWorkflowTaskApprove, status: "ready"},
		{code: "FINANCE-HIDDEN", capability: biz.PermissionFinancePaymentApprove, status: "ready"},
		{code: "ORDINARY-HIDDEN", capability: biz.PermissionWorkflowTaskComplete, status: "ready"},
		{code: "FINISHED-HIDDEN", capability: biz.PermissionWorkflowTaskApprove, status: "done"},
	}
	for index, fixture := range fixtures {
		if _, err := client.WorkflowTask.Create().
			SetTaskCode(fixture.code).
			SetTaskGroup("role-approval").
			SetTaskName(fixture.code).
			SetSourceType("role-approval").
			SetSourceID(index + 1).
			SetTaskStatusKey(fixture.status).
			SetOwnerRoleKey(biz.SalesRoleKey).
			SetRequiredCapabilityKey(fixture.capability).
			SetPayload(map[string]any{}).
			Save(ctx); err != nil {
			t.Fatalf("create fixture %s: %v", fixture.code, err)
		}
	}

	page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
		ViewKey:    biz.WorkflowRoleTaskViewApproval,
		RoleKey:    biz.SalesRoleKey,
		Limit:      20,
		SnapshotAt: time.Now(),
		ApprovalVisibilityScopes: []biz.WorkflowApprovalVisibilityScope{{
			CapabilityKey: biz.PermissionWorkflowTaskApprove,
			VisibilityScope: &biz.WorkflowTaskVisibilityScope{
				StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
			},
		}},
	})
	if err != nil {
		t.Fatalf("list approval role view: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].TaskCode != "GENERIC-VISIBLE" {
		t.Fatalf("unexpected approval role page=%#v", page.Items)
	}
}
