package data

import (
	"context"
	"errors"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"
)

func materialWorkflowTask(t *testing.T, ctx context.Context, client *ent.Client, group string, requestID int, status string) *biz.WorkflowTask {
	t.Helper()
	row := client.WorkflowTask.Query().Where(workflowtask.TaskCode(biz.WorkflowSourceTaskCode(group, requestID))).OnlyX(ctx)
	task := entWorkflowTaskToBiz(row)
	if !biz.IsTrustedEngineeringMaterialTask(task) || task.TaskStatusKey != status {
		t.Fatalf("unexpected material task: %+v", task)
	}
	return task
}

func TestEngineeringMaterialWorkflowApprovalHandoffAndReplay(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_workflow_handoff")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-WORKFLOW")
	request := submitMaterialRequestFixture(t, ctx, f)
	bossTask := materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "ready")
	if _, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: f.order.ID, ExpectedVersion: request.SourceOrderVersion, ExpectedSourceHash: request.SourceHash, ActorID: 11}); err != nil {
		t.Fatal(err)
	}
	if client.WorkflowTask.Query().CountX(ctx) != 1 || client.WorkflowTaskEvent.Query().CountX(ctx) != 1 {
		t.Fatal("submit replay duplicated task or event")
	}
	board, err := NewWorkflowRepo(&Data{postgres: client}, nil).GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Limit: 20, SnapshotAt: time.Now()})
	if err != nil || board.Total != 1 || board.Lanes[0].Tasks[0].DisplayContext == nil {
		t.Fatalf("task is missing from board/source display: %+v %v", board, err)
	}
	boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE", WorkflowTaskID: bossTask.ID, ExpectedTaskVersion: bossTask.Version})
	if err != nil {
		t.Fatal(err)
	}
	materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "done")
	financeTask := materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialFinanceReviewGroup, request.ID, "ready")
	in := financeMaterialRequestInput(boss)
	in.WorkflowTaskID, in.ExpectedTaskVersion = financeTask.ID, financeTask.Version
	approved, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialFinanceReviewGroup, request.ID, "done")
	if len(approved.PurchaseOrders) != 2 {
		t.Fatalf("expected supplier grouping: %+v", approved.PurchaseOrders)
	}
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); err != nil {
		t.Fatal(err)
	}
	if client.WorkflowTask.Query().CountX(ctx) != 2 || client.WorkflowTaskEvent.Query().CountX(ctx) != 4 || client.PurchaseOrder.Query().CountX(ctx) != 2 {
		t.Fatal("finance replay duplicated task, event or purchase order")
	}
}

func TestEngineeringMaterialWorkflowRejectResubmitKeepsHistory(t *testing.T) {
	for _, stage := range []string{"BOSS", "FINANCE"} {
		t.Run(stage, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_workflow_reject_"+stage)
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-REJECT-"+stage)
			request := submitMaterialRequestFixture(t, ctx, f)
			group := biz.WorkflowMaterialBossReviewGroup
			if stage == "FINANCE" {
				var err error
				request, err = f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
				if err != nil {
					t.Fatal(err)
				}
				group = biz.WorkflowMaterialFinanceReviewGroup
			}
			reason := "请核对长毛绒损耗"
			if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 33, Action: "REJECT", ReviewStage: stage, Note: &reason}); err != nil {
				t.Fatal(err)
			}
			materialWorkflowTask(t, ctx, client, group, request.ID, "rejected")
			revision := materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialRevisionGroup, request.ID, "ready")
			if revision.Payload["business_status_reason"] != reason {
				t.Fatal("revision lost rejection reason")
			}
			preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
			if err != nil {
				t.Fatal(err)
			}
			next, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11, WorkflowTaskID: revision.ID, ExpectedTaskVersion: revision.Version})
			if err != nil {
				t.Fatal(err)
			}
			if next.ID == request.ID {
				t.Fatal("resubmit reused historical source")
			}
			materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialRevisionGroup, request.ID, "done")
			materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, next.ID, "ready")
			previous, err := f.uc.GetEngineeringMaterialRequestByID(ctx, f.order.ID, request.ID)
			if err != nil || previous.Status != biz.MaterialRequestRejected || *previous.ReviewNote != reason {
				t.Fatalf("lost history: %+v %v", previous, err)
			}
			if _, err := f.uc.GetEngineeringMaterialRequestByID(ctx, f.order.ID+1, request.ID); !errors.Is(err, biz.ErrMaterialRequestConflict) {
				t.Fatalf("source/order mismatch: %v", err)
			}
		})
	}
}

func TestEngineeringMaterialWorkflowRejectsStaleOrAssignedTaskAndRollsBack(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_workflow_guard")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-GUARD")
	request := submitMaterialRequestFixture(t, ctx, f)
	task := materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "ready")
	in := &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE", WorkflowTaskID: task.ID, ExpectedTaskVersion: task.Version + 1}
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); !errors.Is(err, biz.ErrMaterialRequestConflict) {
		t.Fatalf("stale task: %v", err)
	}
	in.WorkflowTaskID, in.ExpectedTaskVersion = 0, 0
	client.WorkflowTask.UpdateOneID(task.ID).SetAssigneeID(44).SaveX(ctx)
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("source form bypassed assignment: %v", err)
	}
	client.WorkflowTask.UpdateOneID(task.ID).ClearAssigneeID().SaveX(ctx)
	client.WorkflowTaskEvent.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
			return nil, errors.New("event persistence failed")
		})
	})
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, in); err == nil {
		t.Fatal("expected event failure")
	}
	current, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, false)
	if err != nil || current.Status != biz.MaterialRequestSubmitted {
		t.Fatalf("source write did not roll back: %+v %v", current, err)
	}
	materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "ready")
	if client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID)).CountX(ctx) != 1 {
		t.Fatal("failed review persisted audit event")
	}
}

func TestEngineeringMaterialWorkflowOrderSettlementWithdrawsPendingTasks(t *testing.T) {
	for _, action := range []string{biz.SourceOrderActionCancel, biz.SourceOrderActionClose} {
		t.Run(action, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_workflow_settle_"+action)
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-SETTLE-"+action)
			request := submitMaterialRequestFixture(t, ctx, f)
			in := &biz.SourceOrderLifecycleAction{ID: f.order.ID, ExpectedVersion: f.order.Version, ActorID: 22, IdempotencyKey: "material-settle-" + action, Reason: "模拟订单结束"}
			other := client.WorkflowTask.Create().SetTaskCode("material-unrelated-" + action).SetTaskGroup("manual").SetTaskName("独立协作").SetSourceType(biz.WorkflowMaterialRequestSourceType).SetSourceID(request.ID).SetTaskStatusKey("ready").SetOwnerRoleKey(biz.SalesRoleKey).SetPayload(map[string]any{}).SaveX(ctx)
			var err error
			if action == biz.SourceOrderActionClose {
				in.CloseMode = biz.SourceOrderCloseModeShort
				_, err = f.uc.CloseSalesOrderWithAction(ctx, in)
			} else {
				_, err = f.uc.CancelSalesOrderWithAction(ctx, in)
			}
			if err != nil {
				t.Fatal(err)
			}
			materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialBossReviewGroup, request.ID, "withdrawn")
			if client.WorkflowTask.GetX(ctx, other.ID).TaskStatusKey != "ready" {
				t.Fatal("order settlement changed an unrelated task")
			}
			if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"}); !errors.Is(err, biz.ErrMaterialRequestNotReady) {
				t.Fatalf("ended order still approved: %v", err)
			}
		})
	}
}

func TestEngineeringMaterialWorkflowFinanceAuditFailureRollsBackPurchaseOrders(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_finance_atomic")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-FINANCE-ATOMIC")
	request := submitMaterialRequestFixture(t, ctx, f)
	boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	client.WorkflowTaskEvent.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
			return nil, errors.New("finance event persistence failed")
		})
	})
	if _, err := f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(boss)); err == nil {
		t.Fatal("expected transaction failure")
	}
	current, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, false)
	if err != nil || current.Status != biz.MaterialRequestBossApproved || current.Items[0].PurchaseQuantity != nil {
		t.Fatalf("finance source write survived rollback: %+v %v", current, err)
	}
	materialWorkflowTask(t, ctx, client, biz.WorkflowMaterialFinanceReviewGroup, request.ID, "ready")
	if client.PurchaseOrder.Query().CountX(ctx) != 0 || client.PurchaseOrderItem.Query().CountX(ctx) != 0 {
		t.Fatal("failed finance approval left purchase commitments")
	}
}
