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

func TestWorkflowRepo_ShipmentReleaseDoneUpsertsBusinessStateOnly(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_shipment_release_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)
	shipmentTask := createShipmentReleaseTask(t, ctx, repo, 5801, map[string]any{})

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              shipmentTask.ID,
		ExpectedVersion: shipmentTask.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "shipment-release-done",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("shipping-release"), workflowbusinessstate.SourceID(5801)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query shipment release business state failed: %v", err)
	}
	if state.BusinessStatusKey != "shipping_released" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected shipment release state %#v", state)
	}
	if state.Payload["shipment_release_task_id"] != float64(shipmentTask.ID) && state.Payload["shipment_release_task_id"] != shipmentTask.ID {
		t.Fatalf("expected shipment release task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["shipment_release_result"] != "done" ||
		state.Payload["shipment_release_deferred_inventory"] != true ||
		state.Payload["shipment_execution_required"] != true ||
		state.Payload["inventory_out_deferred"] != true ||
		state.Payload["receivable_deferred"] != true ||
		state.Payload["invoice_deferred"] != true ||
		state.Payload["decision"] != "done" ||
		state.Payload["transition_status"] != "done" {
		t.Fatalf("expected shipment release done payload, got %#v", state.Payload)
	}
	if state.Payload["shipment_result"] == "shipped" {
		t.Fatalf("shipment release state must not be shipped, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("shipping-release"), workflowtask.SourceID(5801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("shipment release done must not create downstream tasks, got %d tasks", taskCount)
	}
	receivableCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("shipping-release"),
			workflowtask.SourceID(5801),
			workflowtask.TaskGroup("receivable_registration"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count receivable tasks failed: %v", err)
	}
	invoiceCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("shipping-release"),
			workflowtask.SourceID(5801),
			workflowtask.TaskGroup("invoice_registration"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count invoice tasks failed: %v", err)
	}
	if receivableCount != 0 || invoiceCount != 0 {
		t.Fatalf("shipment release done must not derive finance tasks, got receivable=%d invoice=%d", receivableCount, invoiceCount)
	}
	inventoryTxnCount, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory txns failed: %v", err)
	}
	inventoryBalanceCount, err := client.InventoryBalance.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory balances failed: %v", err)
	}
	inventoryLotCount, err := client.InventoryLot.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory lots failed: %v", err)
	}
	if inventoryTxnCount != 0 || inventoryBalanceCount != 0 || inventoryLotCount != 0 {
		t.Fatalf("shipment release must not write inventory facts, got txns=%d balances=%d lots=%d", inventoryTxnCount, inventoryBalanceCount, inventoryLotCount)
	}

	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(shipmentTask.ID)).
		Order(ent.Asc(workflowtaskevent.FieldID)).
		All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 2 ||
		events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" ||
		events[1].Payload["inventory_out_deferred"] != true ||
		events[1].Payload["receivable_deferred"] != true ||
		events[1].Payload["invoice_deferred"] != true {
		t.Fatalf("expected shipment release status event ready -> done, got %#v", events)
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              shipmentTask.ID,
		ExpectedVersion: shipmentTask.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "shipment-release-done",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	stateCount, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("shipping-release"), workflowbusinessstate.SourceID(5801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count business states failed: %v", err)
	}
	if stateCount != 1 {
		t.Fatalf("expected business state upsert to keep one row, got %d", stateCount)
	}
	taskCount, err = client.WorkflowTask.Query().
		Where(workflowtask.SourceType("shipping-release"), workflowtask.SourceID(5801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("repeated shipment release done must not create downstream tasks, got %d tasks", taskCount)
	}
}

func TestWorkflowRepo_ShipmentReleaseBlockedAndRejectedPreserveReasonPayload(t *testing.T) {
	cases := []struct {
		status       string
		reasonKey    string
		staleKey     string
		sourceID     int
		initialState string
	}{
		{status: "blocked", reasonKey: "blocked_reason", staleKey: "rejected_reason", sourceID: 5901, initialState: "shipment_pending"},
		{status: "rejected", reasonKey: "rejected_reason", staleKey: "blocked_reason", sourceID: 5902, initialState: "blocked"},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_shipment_release_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)
			shipmentTask := createShipmentReleaseTask(t, ctx, repo, tc.sourceID, map[string]any{
				tc.staleKey: "旧原因",
			})
			if shipmentTask.BusinessStatusKey == nil || *shipmentTask.BusinessStatusKey != tc.initialState {
				_, err := client.WorkflowTask.UpdateOneID(shipmentTask.ID).
					SetBusinessStatusKey(tc.initialState).
					Save(ctx)
				if err != nil {
					t.Fatalf("prepare initial status failed: %v", err)
				}
			}

			reason := "出货放行资料待复核"
			if _, err := uc.UpdateTaskStatus(ctx, workflowRepoTestStatusMutation(shipmentTask.ID, shipmentTask.Version, "shipment-release-"+tc.status, &biz.WorkflowTaskStatusUpdate{
				ID:            shipmentTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}), 8, "warehouse"); err != nil {
				t.Fatalf("%s update failed: %v", tc.status, err)
			}

			updatedTask, err := client.WorkflowTask.Get(ctx, shipmentTask.ID)
			if err != nil {
				t.Fatalf("query updated shipment release task failed: %v", err)
			}
			if updatedTask.TaskStatusKey != tc.status ||
				updatedTask.BlockedReason == nil ||
				*updatedTask.BlockedReason != reason {
				t.Fatalf("unexpected updated shipment release task %#v", updatedTask)
			}
			if updatedTask.Payload["decision"] != tc.status ||
				updatedTask.Payload["transition_status"] != tc.status ||
				updatedTask.Payload[tc.reasonKey] != reason ||
				updatedTask.Payload["shipment_release_task_id"] != float64(shipmentTask.ID) && updatedTask.Payload["shipment_release_task_id"] != shipmentTask.ID {
				t.Fatalf("expected decision payload on shipment release task, got %#v", updatedTask.Payload)
			}
			if _, ok := updatedTask.Payload[tc.staleKey]; ok {
				t.Fatalf("expected stale %s to be cleared, got %#v", tc.staleKey, updatedTask.Payload)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("shipping-release"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query shipment release business state failed: %v", err)
			}
			if state.BusinessStatusKey != "blocked" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "warehouse" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected shipment release blocked state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason {
				t.Fatalf("expected reason payload on business state, got %#v", state.Payload)
			}
			if _, ok := state.Payload[tc.staleKey]; ok {
				t.Fatalf("expected business state stale %s to be cleared, got %#v", tc.staleKey, state.Payload)
			}

			taskCount, err := client.WorkflowTask.Query().
				Where(workflowtask.SourceType("shipping-release"), workflowtask.SourceID(tc.sourceID)).
				Count(ctx)
			if err != nil {
				t.Fatalf("count workflow tasks failed: %v", err)
			}
			if taskCount != 1 {
				t.Fatalf("shipment release %s must not create downstream tasks, got %d tasks", tc.status, taskCount)
			}

			events, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(shipmentTask.ID)).
				Order(ent.Asc(workflowtaskevent.FieldID)).
				All(ctx)
			if err != nil {
				t.Fatalf("query shipment release task events failed: %v", err)
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
