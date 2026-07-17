package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactRepo_CancelDraftShipmentRespectsReleaseTaskLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_draft_cancellation")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	operationalUC := biz.NewOperationalFactUsecase(repo)
	workflowUC := biz.NewWorkflowUsecase(NewWorkflowRepo(data, log.NewStdLogger(io.Discard)))

	createDraft := func(suffix string) *biz.Shipment {
		t.Helper()
		created, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{
				ShipmentNo:     "SHP-CANCEL-" + suffix,
				IdempotencyKey: "shipment-cancel/" + suffix,
			},
			Items: []*biz.ShipmentItemCreate{{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				Quantity:    decimal.NewFromInt(1),
			}},
		})
		if err != nil {
			t.Fatalf("create draft shipment %s: %v", suffix, err)
		}
		return created
	}

	updateReleaseTask := func(shipmentID int, nextStatus string) (*biz.WorkflowTask, int) {
		t.Helper()
		actor := shipmentReleaseActorForTest(t, ctx, client, shipmentID)
		if _, _, err := operationalUC.SubmitShipmentRelease(ctx, shipmentID, actor.ID); err != nil {
			t.Fatalf("submit release task for shipment %d: %v", shipmentID, err)
		}
		row := client.WorkflowTask.Query().Where(
			workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskShipmentReleaseGroup, shipmentID)),
		).OnlyX(ctx)
		commandKey := "complete_task_action"
		reason := ""
		switch nextStatus {
		case "blocked":
			commandKey = "block_task_action"
			reason = "放行资料待补齐"
		case "rejected":
			commandKey = "reject_task_action"
			reason = "放行条件不成立"
		default:
		}
		updated, err := workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
			ID:              row.ID,
			ExpectedVersion: row.Version,
			TaskStatusKey:   nextStatus,
			CommandKey:      commandKey,
			IdempotencyKey:  "shipment-cancel-task/" + nextStatus + "/" + row.TaskCode,
			Reason:          reason,
			Payload:         map[string]any{"feedback": "测试放行结论"},
		}, actor.ID, biz.WarehouseRoleKey)
		if err != nil {
			t.Fatalf("move release task %d to %s: %v", row.ID, nextStatus, err)
		}
		return updated, actor.ID
	}

	t.Run("draft without release task cancels directly", func(t *testing.T) {
		shipment := createDraft("NO-TASK")
		actor := shipmentReleaseActorForTest(t, ctx, client, shipment.ID)
		cancelled, err := operationalUC.CancelShippedShipmentWithActor(ctx, shipment.ID, actor.ID)
		if err != nil {
			t.Fatalf("cancel draft without release task: %v", err)
		}
		if cancelled.Status != biz.ShipmentStatusCancelled || cancelled.ShippedAt != nil {
			t.Fatalf("cancelled draft = %#v", cancelled)
		}
		if count := client.WorkflowTask.Query().Where(
			workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskShipmentReleaseGroup, shipment.ID)),
		).CountX(ctx); count != 0 {
			t.Fatalf("draft cancellation must not create a release task, count=%d", count)
		}
		if replay, replayErr := operationalUC.CancelShippedShipmentWithActor(ctx, shipment.ID, actor.ID); replayErr != nil || replay.Status != biz.ShipmentStatusCancelled {
			t.Fatalf("repeat draft cancellation = %#v, err=%v", replay, replayErr)
		}
	})

	for _, activeStatus := range []string{"ready", "blocked"} {
		t.Run("active release task "+activeStatus+" fails closed", func(t *testing.T) {
			shipment := createDraft("ACTIVE-" + activeStatus)
			actor := shipmentReleaseActorForTest(t, ctx, client, shipment.ID)
			if _, _, err := operationalUC.SubmitShipmentRelease(ctx, shipment.ID, actor.ID); err != nil {
				t.Fatalf("submit release task: %v", err)
			}
			if activeStatus == "blocked" {
				updateReleaseTaskRow := client.WorkflowTask.Query().Where(
					workflowtask.TaskCode(biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskShipmentReleaseGroup, shipment.ID)),
				).OnlyX(ctx)
				if _, err := workflowUC.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
					ID: updateReleaseTaskRow.ID, ExpectedVersion: updateReleaseTaskRow.Version,
					TaskStatusKey: "blocked", CommandKey: "block_task_action",
					IdempotencyKey: "shipment-cancel-task/blocked/" + updateReleaseTaskRow.TaskCode,
					Reason:         "放行资料待补齐", Payload: map[string]any{},
				}, actor.ID, biz.WarehouseRoleKey); err != nil {
					t.Fatalf("block release task: %v", err)
				}
			}
			if _, err := operationalUC.CancelShippedShipmentWithActor(ctx, shipment.ID, actor.ID); !errors.Is(err, biz.ErrShipmentCancellationTaskActive) {
				t.Fatalf("cancel with %s task err=%v, want ErrShipmentCancellationTaskActive", activeStatus, err)
			}
			current, err := operationalUC.GetShipment(ctx, shipment.ID)
			if err != nil || current.Status != biz.ShipmentStatusDraft {
				t.Fatalf("active task cancellation changed source: %#v err=%v", current, err)
			}
		})
	}

	for _, terminalStatus := range []string{"done", "rejected"} {
		t.Run("terminal release task "+terminalStatus+" preserves task outcome", func(t *testing.T) {
			shipment := createDraft("TERMINAL-" + terminalStatus)
			terminalTask, actorID := updateReleaseTask(shipment.ID, terminalStatus)
			cancelled, err := operationalUC.CancelShippedShipmentWithActor(ctx, shipment.ID, actorID)
			if err != nil {
				t.Fatalf("cancel draft with %s task: %v", terminalStatus, err)
			}
			if cancelled.Status != biz.ShipmentStatusCancelled || cancelled.ShippedAt != nil {
				t.Fatalf("cancelled draft with %s task = %#v", terminalStatus, cancelled)
			}
			persistedTask := client.WorkflowTask.GetX(ctx, terminalTask.ID)
			if persistedTask.TaskStatusKey != terminalStatus || persistedTask.BusinessStatusKey == nil || *persistedTask.BusinessStatusKey != "cancelled" {
				t.Fatalf("terminal task outcome was rewritten: %#v", persistedTask)
			}
			if terminalStatus == "rejected" && (persistedTask.BlockedReason == nil || *persistedTask.BlockedReason != "放行条件不成立" || persistedTask.Payload["rejected_reason"] != "放行条件不成立") {
				t.Fatalf("rejected task lost its rejection evidence: %#v", persistedTask)
			}
			if reversed, ok := persistedTask.Payload["inventory_out_reversed"].(bool); !ok || reversed {
				t.Fatalf("draft cancellation inventory projection = %#v", persistedTask.Payload)
			}
			state := client.WorkflowBusinessState.Query().Where(
				workflowbusinessstate.SourceType(biz.WorkflowSourceTaskShipmentSourceType),
				workflowbusinessstate.SourceID(shipment.ID),
			).OnlyX(ctx)
			if state.BusinessStatusKey != "cancelled" || state.Payload["source_projection_action"] != "shipment.cancel" {
				t.Fatalf("cancelled source projection = %#v", state)
			}
			event := client.WorkflowTaskEvent.Query().Where(
				workflowtaskevent.TaskID(terminalTask.ID),
				workflowtaskevent.EventType("source_state_changed"),
			).OnlyX(ctx)
			if event.ActorID == nil || *event.ActorID != actorID {
				t.Fatalf("source cancellation actor = %#v, want %d", event.ActorID, actorID)
			}
		})
	}

	if count := client.InventoryTxn.Query().CountX(ctx); count != 0 {
		t.Fatalf("draft cancellation paths must not write inventory transactions, count=%d", count)
	}
}
