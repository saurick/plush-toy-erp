package data

import (
	"context"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/engineeringmaterialrequest"
	"server/internal/data/model/ent/workflowtask"
)

func (r *salesOrderRepo) GetEngineeringMaterialRequestByID(ctx context.Context, orderID, requestID int) (*biz.EngineeringMaterialRequest, error) {
	row, err := r.data.postgres.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.ID(requestID), engineeringmaterialrequest.SalesOrderID(orderID)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrMaterialRequestConflict
	}
	if err != nil {
		return nil, err
	}
	return loadEngineeringMaterialRequest(ctx, r.data.postgres, row)
}

func ensureEngineeringMaterialTask(ctx context.Context, client *ent.Client, request *biz.EngineeringMaterialRequest, actorID int) (*biz.WorkflowTask, error) {
	if request.Status == biz.MaterialRequestApproved {
		return nil, nil
	}
	task, err := biz.BuildEngineeringMaterialTask(request)
	if err != nil {
		return nil, err
	}
	current, _, err := ensureSourceWorkflowTaskRecordWithClient(ctx, client, task, actorID)
	return current, err
}

func (r *salesOrderRepo) getEngineeringMaterialTask(ctx context.Context, client *ent.Client, request *biz.EngineeringMaterialRequest) (*biz.WorkflowTask, error) {
	expected, err := biz.BuildEngineeringMaterialTask(request)
	if err != nil {
		return nil, err
	}
	query := client.WorkflowTask.Query().Where(workflowtask.TaskCode(expected.TaskCode))
	if r.data.sqlDialect == dialect.Postgres {
		query.Where(func(s *sql.Selector) { s.ForUpdate() })
	}
	row, err := query.Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrMaterialRequestConflict
	}
	if err != nil {
		return nil, err
	}
	// Approval uses the frozen source and task identity. The creation intent is
	// historical evidence; later changes to display text must not recreate it.
	task := entWorkflowTaskToBiz(row)
	if !biz.IsTrustedEngineeringMaterialTask(task) || !biz.WorkflowTaskMatchesSourceProducer(task, expected) ||
		!sameOptionalString(task.SourceNo, expected.SourceNo) || workflowPayloadInt(task.Payload, "sales_order_id") != request.SalesOrderID {
		return nil, biz.ErrMaterialRequestConflict
	}
	return task, nil
}

func (r *salesOrderRepo) requireEngineeringMaterialTask(ctx context.Context, client *ent.Client, request *biz.EngineeringMaterialRequest, actorID, taskID, expectedVersion int) (*biz.WorkflowTask, error) {
	task, err := r.getEngineeringMaterialTask(ctx, client, request)
	if err != nil {
		return nil, err
	}
	if task.TaskStatusKey != "ready" ||
		(taskID > 0 && (taskID != task.ID || expectedVersion != task.Version)) {
		return nil, biz.ErrMaterialRequestConflict
	}
	if task.AssigneeID != nil && *task.AssigneeID != actorID {
		return nil, biz.ErrForbidden
	}
	return task, nil
}

func settleEngineeringMaterialTask(ctx context.Context, client *ent.Client, task *biz.WorkflowTask, status string, actorID int, reason *string) error {
	if task == nil || !biz.IsTrustedEngineeringMaterialTask(task) || !biz.IsTerminalWorkflowTaskStatus(status) {
		return biz.ErrBadParam
	}
	update := client.WorkflowTask.Update().Where(workflowtask.ID(task.ID), workflowtask.Version(task.Version), workflowtask.TaskStatusKey(task.TaskStatusKey)).
		SetTaskStatusKey(status).SetCompletedAt(time.Now()).SetUpdatedBy(actorID).AddVersion(1)
	if status == "rejected" || status == "withdrawn" {
		update.SetNillableBlockedReason(reason)
	} else {
		update.ClearBlockedReason()
	}
	count, err := update.Save(ctx)
	if err != nil {
		return err
	}
	if count != 1 {
		return biz.ErrMaterialRequestConflict
	}
	_, err = client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetTaskVersion(task.Version + 1).
		SetEventType("status_changed").SetFromStatusKey(task.TaskStatusKey).SetToStatusKey(status).
		SetActorID(actorID).SetNillableReason(reason).
		SetPayload(map[string]any{"source_task_contract": biz.WorkflowSourceTaskContractV1, "source_action": "engineering_material_request." + status, "engineering_material_request_id": task.SourceID}).Save(ctx)
	return err
}

func (r *salesOrderRepo) settleMaterialRevisionForResubmit(ctx context.Context, client *ent.Client, orderID, actorID, taskID, expectedVersion int) error {
	previous, err := client.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(orderID), engineeringmaterialrequest.Status(biz.MaterialRequestRejected)).Order(ent.Desc(engineeringmaterialrequest.FieldID)).First(ctx)
	if ent.IsNotFound(err) {
		if taskID > 0 {
			return biz.ErrMaterialRequestConflict
		}
		return nil
	}
	if err != nil {
		return err
	}
	request, err := loadEngineeringMaterialRequest(ctx, client, previous)
	if err != nil {
		return err
	}
	task, err := r.requireEngineeringMaterialTask(ctx, client, request, actorID, taskID, expectedVersion)
	if err != nil {
		return err
	}
	return settleEngineeringMaterialTask(ctx, client, task, "done", actorID, nil)
}

func withdrawEngineeringMaterialTasks(ctx context.Context, client *ent.Client, orderID, actorID int, reason string) error {
	requestIDs, err := client.EngineeringMaterialRequest.Query().Where(engineeringmaterialrequest.SalesOrderID(orderID)).IDs(ctx)
	if err != nil || len(requestIDs) == 0 {
		return err
	}
	rows, err := client.WorkflowTask.Query().Where(
		workflowtask.SourceType(biz.WorkflowMaterialRequestSourceType),
		workflowtask.SourceIDIn(requestIDs...),
		workflowtask.TaskGroupIn(biz.WorkflowMaterialBossReviewGroup, biz.WorkflowMaterialFinanceReviewGroup, biz.WorkflowMaterialRevisionGroup),
		workflowtask.TaskStatusKeyIn("ready", "blocked"),
	).All(ctx)
	if err != nil {
		return err
	}
	if strings.TrimSpace(reason) == "" {
		reason = "销售订单已结束"
	}
	for _, row := range rows {
		if err := settleEngineeringMaterialTask(ctx, client, entWorkflowTaskToBiz(row), "withdrawn", actorID, &reason); err != nil {
			return err
		}
	}
	return nil
}
