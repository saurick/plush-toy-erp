package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowRepo_CreateAndUpdateTaskStatus(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "TASK-001",
		TaskGroup:     "project-orders",
		TaskName:      "确认客户资料",
		SourceType:    "project-orders",
		SourceID:      1001,
		TaskStatusKey: "ready",
		OwnerRoleKey:  "merchandiser",
		Payload:       map[string]any{"note": "首批联调任务"},
	}, 7)
	if err != nil {
		t.Fatalf("create task failed: %v", err)
	}
	if task.ID <= 0 {
		t.Fatalf("expected task id")
	}

	updated, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Payload:           map[string]any{"done_by": "test"},
	}, 7, "merchandiser")
	if err != nil {
		t.Fatalf("update task failed: %v", err)
	}
	if updated.TaskStatusKey != "done" {
		t.Fatalf("expected done, got %q", updated.TaskStatusKey)
	}
	if updated.CompletedAt == nil {
		t.Fatalf("expected completed_at set")
	}
	if updated.BusinessStatusKey == nil || *updated.BusinessStatusKey != "project_approved" {
		t.Fatalf("expected business status synced, got %#v", updated.BusinessStatusKey)
	}

	events, err := client.WorkflowTaskEvent.Query().All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 task events, got %d", len(events))
	}
}

func TestWorkflowRepo_UrgeWorkflowTaskWritesEventAndPayload(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_urge_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "TASK-URGE-001",
		TaskGroup:     "shipment_release",
		TaskName:      "出货放行 / 出货准备",
		SourceType:    "shipping-release",
		SourceID:      1002,
		TaskStatusKey: "ready",
		OwnerRoleKey:  "warehouse",
		Payload:       map[string]any{"urge_count": float64(1)},
	}, 7)
	if err != nil {
		t.Fatalf("create task failed: %v", err)
	}

	updated, err := repo.UrgeWorkflowTask(ctx, &biz.WorkflowTaskUrge{
		ID:     task.ID,
		Action: "escalate_to_boss",
		Reason: "客户交期风险，请确认出货",
		Payload: map[string]any{
			"source_no": "SHIP-001",
		},
	}, 8, "pmc")
	if err != nil {
		t.Fatalf("urge task failed: %v", err)
	}
	if updated.TaskStatusKey != "ready" {
		t.Fatalf("urge should not change task status, got %q", updated.TaskStatusKey)
	}
	if updated.UpdatedBy == nil || *updated.UpdatedBy != 8 {
		t.Fatalf("expected updated_by=8, got %#v", updated.UpdatedBy)
	}
	if updated.Payload["urged"] != true {
		t.Fatalf("expected urged payload flag, got %#v", updated.Payload["urged"])
	}
	if workflowPayloadInt(updated.Payload, "urge_count") != 2 {
		t.Fatalf("expected urge_count=2, got %#v", updated.Payload["urge_count"])
	}
	if updated.Payload["last_urge_reason"] != "客户交期风险，请确认出货" {
		t.Fatalf("expected last urge reason, got %#v", updated.Payload["last_urge_reason"])
	}
	if updated.Payload["last_urge_action"] != "escalate_to_boss" {
		t.Fatalf("expected last urge action, got %#v", updated.Payload["last_urge_action"])
	}
	if updated.Payload["last_urge_actor_role_key"] != "pmc" {
		t.Fatalf("expected last urge actor role, got %#v", updated.Payload["last_urge_actor_role_key"])
	}
	if updated.Payload["escalated"] != true {
		t.Fatalf("expected escalated flag, got %#v", updated.Payload["escalated"])
	}
	if updated.Payload["escalate_target_role_key"] != "boss" {
		t.Fatalf("expected boss escalation target, got %#v", updated.Payload["escalate_target_role_key"])
	}
	if updated.Payload["notification_type"] != "urgent_escalation" ||
		updated.Payload["alert_type"] != "urgent_escalation" {
		t.Fatalf("expected urgent escalation alert payload, got %#v", updated.Payload)
	}

	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID)).
		Order(ent.Asc(workflowtaskevent.FieldID)).
		All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected created + escalation events, got %d", len(events))
	}
	urgeEvent := events[1]
	if urgeEvent.EventType != "escalate_to_boss" {
		t.Fatalf("expected escalation event type, got %q", urgeEvent.EventType)
	}
	if urgeEvent.FromStatusKey == nil || *urgeEvent.FromStatusKey != "ready" ||
		urgeEvent.ToStatusKey == nil || *urgeEvent.ToStatusKey != "ready" {
		t.Fatalf("expected status snapshot ready -> ready, got %#v -> %#v", urgeEvent.FromStatusKey, urgeEvent.ToStatusKey)
	}
	if urgeEvent.ActorRoleKey == nil || *urgeEvent.ActorRoleKey != "pmc" {
		t.Fatalf("expected actor role pmc, got %#v", urgeEvent.ActorRoleKey)
	}
	if urgeEvent.ActorID == nil || *urgeEvent.ActorID != 8 {
		t.Fatalf("expected actor id 8, got %#v", urgeEvent.ActorID)
	}
	if urgeEvent.Reason == nil || *urgeEvent.Reason != "客户交期风险，请确认出货" {
		t.Fatalf("expected event reason, got %#v", urgeEvent.Reason)
	}
	if urgeEvent.Payload["action"] != "escalate_to_boss" {
		t.Fatalf("expected event payload action, got %#v", urgeEvent.Payload["action"])
	}
}
