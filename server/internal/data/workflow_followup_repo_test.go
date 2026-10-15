package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkflowFollowupLifecycleReceiptAndCreatorVisibility(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:followup_lifecycle?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	customer := createSalesOrderTestCustomer(t, ctx, client, "FOLLOWUP-C", true)
	order := client.SalesOrder.Create().SetOrderNo("SO-FOLLOWUP").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	createWorkflowAssignmentRoleWithPermissions(t, ctx, client, biz.QualityRoleKey,
		append(workflowAssignmentRequiredPermissions(), biz.PermissionSalesOrderRead)...)
	assignee := createWorkflowAssignmentTarget(t, ctx, client, biz.QualityRoleKey, "followup_quality", false)
	input := biz.WorkflowFollowupCreate{SourceType: "sales_order", SourceID: order.ID, TaskName: "核实包装差异", Description: "请反馈包装稿与实物的差异", OwnerRoleKey: biz.QualityRoleKey, AssigneeID: &assignee, DueAt: time.Now().Add(time.Hour), IdempotencyKey: "followup-lifecycle"}
	prepare := func() *biz.WorkflowTaskCreate {
		t.Helper()
		value, err := biz.PrepareWorkflowFollowupCreate(input, 7)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	task, err := uc.CreateTask(ctx, prepare(), 7)
	if err != nil {
		t.Fatal(err)
	}
	if task.SourceNo == nil || *task.SourceNo != order.OrderNo || task.ConfigRevision != nil || task.ProcessInstanceID != nil || task.Payload["description"] != input.Description {
		t.Fatalf("unexpected source/task: %#v", task)
	}
	creatorID := 7
	rows, count, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{SourceType: input.SourceType, SourceID: input.SourceID, Limit: 10, VisibilityScope: &biz.WorkflowTaskVisibilityScope{FollowupCreatorID: &creatorID}})
	if err != nil || count != 1 || len(rows) != 1 {
		t.Fatalf("creator list count=%d rows=%d err=%v", count, len(rows), err)
	}
	strangerID := 8
	_, count, err = repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Limit: 10, VisibilityScope: &biz.WorkflowTaskVisibilityScope{FollowupCreatorID: &strangerID}})
	if err != nil || count != 0 {
		t.Fatalf("stranger list count=%d err=%v", count, err)
	}
	status := func(reason, key string) *biz.WorkflowTaskStatusUpdate {
		return &biz.WorkflowTaskStatusUpdate{ID: task.ID, ExpectedVersion: task.Version, CommandKey: "complete_task_action", IdempotencyKey: key, TaskStatusKey: "done", Reason: reason}
	}
	if _, err = uc.UpdateTaskStatus(ctx, status("", "followup-empty-feedback"), assignee, biz.QualityRoleKey); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("empty feedback=%v", err)
	}
	done, err := uc.UpdateTaskStatus(ctx, status("已核对，包装稿与实物一致", "followup-complete"), assignee, biz.QualityRoleKey)
	if err != nil || done.Payload["feedback"] != "已核对，包装稿与实物一致" || done.Payload["description"] != input.Description {
		t.Fatalf("complete=%#v err=%v", done, err)
	}
	if got := client.SalesOrder.GetX(ctx, order.ID).LifecycleStatus; got != "draft" {
		t.Fatalf("task wrote source status: %s", got)
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 || client.Shipment.Query().CountX(ctx) != 0 {
		t.Fatal("task completion wrote facts")
	}
	client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus("closed").ExecX(ctx)
	client.AdminUser.UpdateOneID(assignee).SetDisabled(true).ExecX(ctx)
	replay, found, err := uc.ResolveFollowupCreate(ctx, prepare(), 7)
	if err != nil || !found || replay.ID != task.ID || replay.TaskStatusKey != "ready" {
		t.Fatalf("create receipt replay=%#v found=%t err=%v", replay, found, err)
	}
	input.Description = "不同意图"
	if _, _, err = uc.ResolveFollowupCreate(ctx, prepare(), 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed intent=%v", err)
	}
	input.IdempotencyKey = "followup-closed"
	if _, err = uc.CreateTask(ctx, prepare(), 7); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("closed source=%v", err)
	}
	client.SalesOrder.UpdateOneID(order.ID).SetLifecycleStatus("draft").ExecX(ctx)
	if _, err = uc.CreateTask(ctx, prepare(), 7); !errors.Is(err, biz.ErrWorkflowAssigneeIneligible) {
		t.Fatalf("disabled recipient=%v", err)
	}
	input.AssigneeID = nil
	if _, err = uc.CreateTask(ctx, prepare(), 7); !errors.Is(err, biz.ErrWorkflowAssigneeIneligible) {
		t.Fatalf("empty role pool=%v", err)
	}
	client.AdminUser.UpdateOneID(assignee).SetDisabled(false).ExecX(ctx)
	if _, err = uc.CreateTask(ctx, prepare(), 7); err != nil {
		t.Fatalf("eligible role pool=%v", err)
	}
	if got := client.WorkflowTask.Query().CountX(ctx); got != 2 {
		t.Fatalf("task count=%d", got)
	}
}
