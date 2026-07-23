package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/workflowtask"

	"github.com/go-kratos/kratos/v2/log"
)

func shipmentReleaseActorForTest(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	shipmentID int,
) *ent.AdminUser {
	t.Helper()
	username := fmt.Sprintf("shipment-release-test-%d", shipmentID)
	actor, err := client.AdminUser.Query().Where(adminuser.Username(username)).Only(ctx)
	if err == nil {
		return actor
	}
	if !ent.IsNotFound(err) {
		t.Fatalf("query shipment release actor for shipment %d: %v", shipmentID, err)
	}
	return client.AdminUser.Create().
		SetUsername(username).
		SetPasswordHash("test-password-hash").
		SaveX(ctx)
}

// submitAndCompleteShipmentReleaseTaskForTest starts from the shipment domain
// entry; Workflow only records the resulting coordination task and outcome.
func submitAndCompleteShipmentReleaseTaskForTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	shipmentID int,
) {
	t.Helper()
	actor := shipmentReleaseActorForTest(t, ctx, client, shipmentID)
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	if _, _, err := operationalUC.SubmitShipmentRelease(ctx, shipmentID, actor.ID); err != nil {
		t.Fatalf("submit shipment release task for shipment %d: %v", shipmentID, err)
	}
	completeShipmentReleaseTaskForTest(t, ctx, data, client, shipmentID, actor.ID)
}

func completeProductionSchedulingTaskForTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	productionOrderID int,
	actorID int,
) {
	t.Helper()
	task := client.WorkflowTask.Query().Where(
		workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionSchedulingGroup, productionOrderID)),
	).OnlyX(ctx)
	if task.TaskStatusKey == "done" {
		return
	}
	workflowUC := biz.NewWorkflowUsecase(NewWorkflowRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID: task.ID, ExpectedVersion: task.Version, TaskStatusKey: "done",
		CommandKey: "complete_task_action", IdempotencyKey: "test-complete-production-scheduling-" + task.TaskCode,
	}, actorID, biz.PMCRoleKey); err != nil {
		t.Fatalf("complete production scheduling task %d: %v", task.ID, err)
	}
}

func completeProductionExceptionTaskForTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	productionFactID int,
	actorID int,
) {
	t.Helper()
	task := client.WorkflowTask.Query().Where(
		workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionExceptionGroup, productionFactID)),
	).OnlyX(ctx)
	if task.TaskGroup != biz.WorkflowSourceTaskProductionExceptionGroup ||
		task.SourceType != biz.WorkflowSourceTaskProductionFactSourceType ||
		task.SourceID != productionFactID ||
		task.Payload["source_task_contract"] != biz.WorkflowSourceTaskContractV1 ||
		task.Payload["source_task_producer"] != biz.WorkflowSourceTaskProductionReworkPostProducer {
		t.Fatalf("unexpected production exception source task %#v", task)
	}
	if task.TaskStatusKey == "done" {
		return
	}
	workflowUC := biz.NewWorkflowUsecase(NewWorkflowRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID: task.ID, ExpectedVersion: task.Version, TaskStatusKey: "done",
		CommandKey: "complete_task_action", IdempotencyKey: "test-complete-production-exception-" + task.TaskCode,
		Payload: map[string]any{"feedback": "已完成异常核查"},
	}, actorID, biz.ProductionRoleKey); err != nil {
		t.Fatalf("complete production exception task %d: %v", task.ID, err)
	}
}

func completeShipmentReleaseTaskForTest(
	t *testing.T,
	ctx context.Context,
	data *Data,
	client *ent.Client,
	shipmentID int,
	actorID int,
) {
	t.Helper()
	approveShipmentFinanceGateForTest(t, ctx, client, shipmentID, actorID)
	task := client.WorkflowTask.Query().Where(
		workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskShipmentReleaseGroup, shipmentID)),
	).OnlyX(ctx)
	if task.TaskStatusKey == "done" {
		return
	}
	workflowUC := biz.NewWorkflowUsecase(NewWorkflowRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID: task.ID, ExpectedVersion: task.Version, TaskStatusKey: "done",
		CommandKey: "complete_task_action", IdempotencyKey: "test-complete-shipment-release-" + task.TaskCode,
		Payload: map[string]any{"feedback": "出货资料与放行条件已核对"},
	}, actorID, biz.WarehouseRoleKey); err != nil {
		t.Fatalf("complete shipment release task %d: %v", task.ID, err)
	}
}

// approveShipmentFinanceGateForTest isolates unrelated shipment tests from the
// finance approval workflow. Dedicated process/gate tests exercise the real
// ProcessRuntime command and audit anchors.
func approveShipmentFinanceGateForTest(t *testing.T, ctx context.Context, client *ent.Client, shipmentID int, actorID int) {
	t.Helper()
	row := client.Shipment.GetX(ctx, shipmentID)
	if row.FinanceReleaseStatus == biz.ShipmentFinanceReleaseStatusApproved {
		return
	}
	client.Shipment.UpdateOneID(shipmentID).
		SetFinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusApproved).
		SetFinanceReleaseVersion(row.FinanceReleaseVersion + 1).
		SetFinanceReleasedAt(time.Now().UTC()).
		SetFinanceReleasedBy(actorID).
		SetFinanceReleaseProcessInstanceID(1).
		SetFinanceReleaseProcessNodeID(1).
		SetFinanceReleaseNote("test fixture approval").
		ExecX(ctx)
}
