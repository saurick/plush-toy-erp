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

func TestWorkflowRepo_PurchaseIQCDoneSideEffectsAreTransactionalAndIdempotent(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_purchase_iqc_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)

	sourceNo := "PUR-ARR-001"
	statusKey := "iqc_pending"
	iqcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "PURCHASE-IQC-DONE-001",
		TaskGroup:         "purchase_iqc",
		TaskName:          "IQC 来料检验",
		SourceType:        "accessories-purchase",
		SourceID:          3101,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"supplier_name": "联调供应商",
			"material_name": "PP 棉",
			"quantity":      float64(120),
			"unit":          "kg",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create IQC task failed: %v", err)
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            iqcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 8, "quality"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(3101)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query IQC business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected IQC done business state %#v", state)
	}
	if state.Payload["iqc_task_id"] != float64(iqcTask.ID) && state.Payload["iqc_task_id"] != iqcTask.ID {
		t.Fatalf("expected IQC task id in state payload, got %#v", state.Payload)
	}

	downstreamTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("accessories-purchase"),
			workflowtask.SourceID(3101),
			workflowtask.TaskGroup("warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query warehouse inbound tasks failed: %v", err)
	}
	if len(downstreamTasks) != 1 {
		t.Fatalf("expected one warehouse inbound task, got %d", len(downstreamTasks))
	}
	if downstreamTasks[0].Payload["qc_result"] != "pass" ||
		downstreamTasks[0].Payload["alert_type"] != "inbound_pending" {
		t.Fatalf("unexpected warehouse inbound payload %#v", downstreamTasks[0].Payload)
	}

	events, err := client.WorkflowTaskEvent.Query().Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected IQC created + status + warehouse created events, got %d", len(events))
	}
	if events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" {
		t.Fatalf("expected IQC status event ready -> done, got %#v", events[1])
	}
	if events[2].TaskID != downstreamTasks[0].ID ||
		events[2].Payload["workflow_rule_key"] != "purchase_iqc_done_to_warehouse_inbound" {
		t.Fatalf("expected warehouse created event with rule payload, got %#v", events[2])
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            iqcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 8, "quality"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	count, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("accessories-purchase"),
			workflowtask.SourceID(3101),
			workflowtask.TaskGroup("warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count warehouse inbound tasks failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected idempotent warehouse inbound task count 1, got %d", count)
	}
}

func TestWorkflowRepo_PurchaseIQCExceptionIdempotencyAllowsNextRoundAfterDone(t *testing.T) {
	cases := []struct {
		status    string
		reasonKey string
		sourceID  int
	}{
		{status: "blocked", reasonKey: "blocked_reason", sourceID: 3201},
		{status: "rejected", reasonKey: "rejected_reason", sourceID: 3202},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_purchase_iqc_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)

			sourceNo := "PUR-ARR-" + tc.status
			statusKey := "iqc_pending"
			iqcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
				TaskCode:          "PURCHASE-IQC-" + tc.status + "-001",
				TaskGroup:         "purchase_iqc",
				TaskName:          "IQC 来料检验",
				SourceType:        "inbound",
				SourceID:          tc.sourceID,
				SourceNo:          &sourceNo,
				BusinessStatusKey: &statusKey,
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "quality",
				Priority:          2,
				Payload:           map[string]any{"record_title": "采购到货异常"},
			}, 7)
			if err != nil {
				t.Fatalf("create IQC task failed: %v", err)
			}

			reason := "来料破包"
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            iqcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            iqcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("repeat %s update failed: %v", tc.status, err)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("inbound"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query IQC exception business state failed: %v", err)
			}
			if state.BusinessStatusKey != "qc_failed" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != biz.PurchaseRoleKey ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected IQC exception business state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason {
				t.Fatalf("expected decision payload on business state, got %#v", state.Payload)
			}

			exceptionTasks, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("inbound"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("purchase_quality_exception"),
					workflowtask.OwnerRoleKey(biz.PurchaseRoleKey),
				).
				All(ctx)
			if err != nil {
				t.Fatalf("query exception tasks failed: %v", err)
			}
			if len(exceptionTasks) != 1 {
				t.Fatalf("expected one active exception task after repeated %s, got %d", tc.status, len(exceptionTasks))
			}
			if exceptionTasks[0].Payload["decision"] != tc.status ||
				exceptionTasks[0].Payload["transition_status"] != tc.status ||
				exceptionTasks[0].Payload[tc.reasonKey] != reason {
				t.Fatalf("expected decision payload on exception task, got %#v", exceptionTasks[0].Payload)
			}

			createdEvents, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(exceptionTasks[0].ID)).
				All(ctx)
			if err != nil {
				t.Fatalf("query exception task events failed: %v", err)
			}
			if len(createdEvents) != 1 ||
				createdEvents[0].EventType != "created" ||
				createdEvents[0].Payload["workflow_rule_key"] == "" {
				t.Fatalf("expected exception created event with workflow rule payload, got %#v", createdEvents)
			}

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            exceptionTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": biz.PurchaseRoleKey},
			}, 9, biz.PurchaseRoleKey); err != nil {
				t.Fatalf("complete exception task failed: %v", err)
			}

			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            iqcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("next-round %s update failed: %v", tc.status, err)
			}

			count, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("inbound"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("purchase_quality_exception"),
					workflowtask.OwnerRoleKey(biz.PurchaseRoleKey),
				).
				Count(ctx)
			if err != nil {
				t.Fatalf("count exception tasks failed: %v", err)
			}
			if count != 2 {
				t.Fatalf("expected completed exception to allow next round, got %d exception tasks", count)
			}
		})
	}
}
