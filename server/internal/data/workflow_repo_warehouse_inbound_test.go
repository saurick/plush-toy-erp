package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowRepo_WarehouseInboundDoneUpsertsBusinessStateOnly(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_warehouse_inbound_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)

	sourceNo := "PUR-IN-001"
	statusKey := "warehouse_inbound_pending"
	warehouseTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "WAREHOUSE-INBOUND-DONE-001",
		TaskGroup:         "warehouse_inbound",
		TaskName:          "确认入库",
		SourceType:        "accessories-purchase",
		SourceID:          3301,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"material_name": "PP 棉",
			"quantity":      float64(120),
			"unit":          "kg",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create warehouse inbound task failed: %v", err)
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              warehouseTask.ID,
		ExpectedVersion: warehouseTask.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "warehouse-inbound-done",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(3301)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query warehouse inbound business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected warehouse inbound done business state %#v", state)
	}
	if state.Payload["warehouse_task_id"] != float64(warehouseTask.ID) && state.Payload["warehouse_task_id"] != warehouseTask.ID {
		t.Fatalf("expected warehouse task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["inbound_result"] != "done" ||
		state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["decision"] != "done" ||
		state.Payload["transition_status"] != "done" {
		t.Fatalf("expected inbound_done payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("accessories-purchase"), workflowtask.SourceID(3301)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("warehouse inbound done must not create downstream tasks, got %d tasks", taskCount)
	}

	events, err := client.WorkflowTaskEvent.Query().Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected warehouse task created + status events, got %d", len(events))
	}
	if events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" {
		t.Fatalf("expected warehouse inbound status event ready -> done, got %#v", events[1])
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              warehouseTask.ID,
		ExpectedVersion: warehouseTask.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "warehouse-inbound-done",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	stateCount, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(3301)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count business states failed: %v", err)
	}
	if stateCount != 1 {
		t.Fatalf("expected business state upsert to keep one row, got %d", stateCount)
	}
	taskCount, err = client.WorkflowTask.Query().
		Where(workflowtask.SourceType("accessories-purchase"), workflowtask.SourceID(3301)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("repeated warehouse inbound done must not create downstream tasks, got %d tasks", taskCount)
	}
}

func TestWorkflowRepo_WarehouseInboundBlockedAndRejectedPreserveReasonPayload(t *testing.T) {
	cases := []struct {
		status    string
		reasonKey string
		sourceID  int
	}{
		{status: "blocked", reasonKey: "blocked_reason", sourceID: 3401},
		{status: "rejected", reasonKey: "rejected_reason", sourceID: 3402},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_warehouse_inbound_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)

			sourceNo := "PUR-IN-" + tc.status
			statusKey := "warehouse_inbound_pending"
			warehouseTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
				TaskCode:          "WAREHOUSE-INBOUND-" + tc.status + "-001",
				TaskGroup:         "warehouse_inbound",
				TaskName:          "确认入库",
				SourceType:        "inbound",
				SourceID:          tc.sourceID,
				SourceNo:          &sourceNo,
				BusinessStatusKey: &statusKey,
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Priority:          2,
				Payload:           map[string]any{"record_title": "采购入库异常"},
			}, 7)
			if err != nil {
				t.Fatalf("create warehouse inbound task failed: %v", err)
			}

			reason := "库位未确认"
			if tc.status == "rejected" {
				reason = "到货数量与单据不符"
			}
			if _, err := uc.UpdateTaskStatus(ctx, workflowRepoTestStatusMutation(warehouseTask.ID, warehouseTask.Version, "warehouse-inbound-"+tc.status, &biz.WorkflowTaskStatusUpdate{
				ID:            warehouseTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}), 8, "warehouse"); err != nil {
				t.Fatalf("%s update failed: %v", tc.status, err)
			}

			updatedTask, err := client.WorkflowTask.Get(ctx, warehouseTask.ID)
			if err != nil {
				t.Fatalf("query updated task failed: %v", err)
			}
			if updatedTask.TaskStatusKey != tc.status ||
				updatedTask.BlockedReason == nil ||
				*updatedTask.BlockedReason != reason {
				t.Fatalf("unexpected updated warehouse task %#v", updatedTask)
			}
			if updatedTask.Payload["decision"] != tc.status ||
				updatedTask.Payload["transition_status"] != tc.status ||
				updatedTask.Payload[tc.reasonKey] != reason {
				t.Fatalf("expected decision payload on warehouse task, got %#v", updatedTask.Payload)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("inbound"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query warehouse inbound business state failed: %v", err)
			}
			if state.BusinessStatusKey != "blocked" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "warehouse" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected warehouse inbound blocked state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason {
				t.Fatalf("expected reason payload on business state, got %#v", state.Payload)
			}

			taskCount, err := client.WorkflowTask.Query().
				Where(workflowtask.SourceType("inbound"), workflowtask.SourceID(tc.sourceID)).
				Count(ctx)
			if err != nil {
				t.Fatalf("count workflow tasks failed: %v", err)
			}
			if taskCount != 1 {
				t.Fatalf("warehouse inbound %s must not create downstream tasks, got %d tasks", tc.status, taskCount)
			}

			events, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(warehouseTask.ID)).
				Order(ent.Asc(workflowtaskevent.FieldID)).
				All(ctx)
			if err != nil {
				t.Fatalf("query warehouse task events failed: %v", err)
			}
			if len(events) != 2 ||
				events[1].EventType != "status_changed" ||
				events[1].Reason == nil ||
				*events[1].Reason != reason ||
				events[1].Payload[tc.reasonKey] != reason {
				t.Fatalf("expected status event with reason payload, got %#v", events)
			}
		})
	}
}
