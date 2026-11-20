package data

import (
	"context"
	"errors"
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

func TestWorkflowRepo_OutsourceReturnQCDoneCreatesWarehouseInboundIdempotently(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_outsource_return_qc_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)

	sourceNo := "OUT-RET-001"
	statusKey := "qc_pending"
	qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "OUTSOURCE-RETURN-QC-DONE-001",
		TaskGroup:         "outsource_return_qc",
		TaskName:          "委外回货检验",
		SourceType:        "processing-contracts",
		SourceID:          3501,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":         "兔子挂件委外车缝",
			"supplier_name":        "联调加工厂",
			"product_no":           "SKU-001",
			"product_name":         "兔子挂件",
			"quantity":             float64(300),
			"unit":                 "pcs",
			"expected_return_date": "2026-04-28",
			"qc_type":              "outsource_return",
			"outsource_processing": true,
		},
	}, 7)
	if err != nil {
		t.Fatalf("create outsource return QC task failed: %v", err)
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              qcTask.ID,
		ExpectedVersion: qcTask.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "outsource-qc-done",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"mobile_role_key": "quality", "qc_result": "accepted"},
	}, 8, "quality"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("processing-contracts"), workflowbusinessstate.SourceID(3501)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query outsource QC business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected outsource QC done business state %#v", state)
	}
	if state.Payload["qc_task_id"] != float64(qcTask.ID) && state.Payload["qc_task_id"] != qcTask.ID {
		t.Fatalf("expected QC task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["qc_result"] != "accepted" ||
		state.Payload["qc_type"] != "outsource_return" ||
		state.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource QC state payload, got %#v", state.Payload)
	}

	downstreamTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("processing-contracts"),
			workflowtask.SourceID(3501),
			workflowtask.TaskGroup("outsource_warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query outsource warehouse inbound tasks failed: %v", err)
	}
	if len(downstreamTasks) != 1 {
		t.Fatalf("expected one outsource warehouse inbound task, got %d", len(downstreamTasks))
	}
	if downstreamTasks[0].Payload["qc_task_id"] != float64(qcTask.ID) && downstreamTasks[0].Payload["qc_task_id"] != qcTask.ID {
		t.Fatalf("expected QC task id in downstream payload, got %#v", downstreamTasks[0].Payload)
	}
	if downstreamTasks[0].Payload["qc_result"] != "accepted" ||
		downstreamTasks[0].Payload["qc_type"] != "outsource_return" ||
		downstreamTasks[0].Payload["outsource_processing"] != true ||
		downstreamTasks[0].Payload["inventory_balance_deferred"] != true ||
		downstreamTasks[0].Payload["alert_type"] != "inbound_pending" {
		t.Fatalf("unexpected outsource warehouse inbound payload %#v", downstreamTasks[0].Payload)
	}

	events, err := client.WorkflowTaskEvent.Query().Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected QC created + status + warehouse created events, got %d", len(events))
	}
	if events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" {
		t.Fatalf("expected outsource QC status event ready -> done, got %#v", events[1])
	}
	if events[2].TaskID != downstreamTasks[0].ID ||
		events[2].Payload["workflow_rule_key"] != "outsource_return_qc_done_to_outsource_warehouse_inbound" {
		t.Fatalf("expected warehouse created event with rule payload, got %#v", events[2])
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              qcTask.ID,
		ExpectedVersion: qcTask.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "outsource-qc-done",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"mobile_role_key": "quality", "qc_result": "accepted"},
	}, 8, "quality"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	count, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("processing-contracts"),
			workflowtask.SourceID(3501),
			workflowtask.TaskGroup("outsource_warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count outsource warehouse inbound tasks failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected idempotent outsource warehouse inbound task count 1, got %d", count)
	}
}

func TestWorkflowRepo_OutsourceReturnQCReworkIdempotencyHonorsRejectedTerminalState(t *testing.T) {
	cases := []struct {
		status     string
		reasonKey  string
		sourceID   int
		wantRounds int
	}{
		{status: "blocked", reasonKey: "blocked_reason", sourceID: 3601, wantRounds: 2},
		{status: "rejected", reasonKey: "rejected_reason", sourceID: 3602, wantRounds: 1},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_outsource_return_qc_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)

			sourceNo := "OUT-RET-" + tc.status
			statusKey := "qc_pending"
			qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
				TaskCode:          "OUTSOURCE-RETURN-QC-" + tc.status + "-001",
				TaskGroup:         "outsource_return_qc",
				TaskName:          "委外回货检验",
				SourceType:        "inbound",
				SourceID:          tc.sourceID,
				SourceNo:          &sourceNo,
				BusinessStatusKey: &statusKey,
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "quality",
				Priority:          2,
				Payload: map[string]any{
					"record_title":         "委外回货异常",
					"product_name":         "兔子挂件",
					"quantity":             float64(300),
					"unit":                 "pcs",
					"qc_type":              "outsource_return",
					"outsource_processing": true,
				},
			}, 7)
			if err != nil {
				t.Fatalf("create outsource return QC task failed: %v", err)
			}

			reason := "回货抽检不合格"
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:              qcTask.ID,
				ExpectedVersion: qcTask.Version,
				CommandKey:      "outsource_qc_" + tc.status,
				IdempotencyKey:  "outsource-qc-" + tc.status,
				TaskStatusKey:   tc.status,
				Reason:          reason,
				Payload:         map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:              qcTask.ID,
				ExpectedVersion: qcTask.Version,
				CommandKey:      "outsource_qc_" + tc.status,
				IdempotencyKey:  "outsource-qc-" + tc.status,
				TaskStatusKey:   tc.status,
				Reason:          reason,
				Payload:         map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("repeat %s update failed: %v", tc.status, err)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("inbound"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query outsource rework business state failed: %v", err)
			}
			if state.BusinessStatusKey != "qc_failed" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "production" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected outsource rework business state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason {
				t.Fatalf("expected decision payload on business state, got %#v", state.Payload)
			}

			reworkTasks, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("inbound"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("outsource_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				All(ctx)
			if err != nil {
				t.Fatalf("query outsource rework tasks failed: %v", err)
			}
			if len(reworkTasks) != 1 {
				t.Fatalf("expected one active rework task after repeated %s, got %d", tc.status, len(reworkTasks))
			}
			if reworkTasks[0].Payload["decision"] != tc.status ||
				reworkTasks[0].Payload["transition_status"] != tc.status ||
				reworkTasks[0].Payload[tc.reasonKey] != reason ||
				reworkTasks[0].Payload["qc_type"] != "outsource_return" {
				t.Fatalf("expected decision payload on rework task, got %#v", reworkTasks[0].Payload)
			}

			createdEvents, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(reworkTasks[0].ID)).
				All(ctx)
			if err != nil {
				t.Fatalf("query rework task events failed: %v", err)
			}
			if len(createdEvents) != 1 ||
				createdEvents[0].EventType != "created" ||
				createdEvents[0].Payload["workflow_rule_key"] == "" {
				t.Fatalf("expected rework created event with workflow rule payload, got %#v", createdEvents)
			}

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(reworkTasks[0].ID, reworkTasks[0].Version, "outsource-return-rework-"+tc.status+"-complete", &biz.WorkflowTaskStatusUpdate{
				ID:            reworkTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": "production"},
			}), 9, "production"); err != nil {
				t.Fatalf("complete rework task failed: %v", err)
			}

			nextRoundVersion := qcTask.Version + 1
			if tc.status == "blocked" {
				resumed := resumeWorkflowTaskForNextRound(
					t, ctx, uc, qcTask.ID, nextRoundVersion,
					"outsource-qc-blocked-resume-next-round", 8, "quality",
				)
				nextRoundVersion = resumed.Version
			}
			_, nextRoundErr := uc.UpdateTaskStatus(ctx, workflowRepoTestStatusMutation(qcTask.ID, nextRoundVersion, "outsource-qc-"+tc.status+"-next-round", &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}), 8, "quality")
			if tc.status == "rejected" {
				if !errors.Is(nextRoundErr, biz.ErrWorkflowTaskSettled) {
					t.Fatalf("terminal rejected task must reject a new round, got %v", nextRoundErr)
				}
			} else if nextRoundErr != nil {
				t.Fatalf("next-round %s update failed: %v", tc.status, nextRoundErr)
			}

			count, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("inbound"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("outsource_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				Count(ctx)
			if err != nil {
				t.Fatalf("count rework tasks failed: %v", err)
			}
			if count != tc.wantRounds {
				t.Fatalf("expected %s source task to produce %d rework round(s), got %d", tc.status, tc.wantRounds, count)
			}
		})
	}
}

func TestWorkflowRepo_OutsourceReturnQCBlockedThenRejectedReusesActiveRework(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_outsource_return_qc_blocked_then_rejected?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)

	sourceNo := "OUT-RET-BLOCK-REJECT"
	statusKey := "qc_pending"
	qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "OUTSOURCE-RETURN-QC-BLOCK-REJECT-001",
		TaskGroup:         "outsource_return_qc",
		TaskName:          "委外回货检验",
		SourceType:        "processing-contracts",
		SourceID:          3701,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":         "委外回货异常",
			"product_name":         "兔子挂件",
			"quantity":             float64(300),
			"unit":                 "pcs",
			"qc_type":              "outsource_return",
			"outsource_processing": true,
		},
	}, 7)
	if err != nil {
		t.Fatalf("create outsource return QC task failed: %v", err)
	}

	blockedReason := "回货待判责"
	blocked, err := uc.UpdateTaskStatus(ctx, workflowRepoTestStatusMutation(qcTask.ID, qcTask.Version, "outsource-qc-blocked-then-rejected-blocked", &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "blocked",
		Reason:        blockedReason,
		Payload:       map[string]any{},
	}), 8, "quality")
	if err != nil {
		t.Fatalf("blocked update failed: %v", err)
	}

	reworkTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("processing-contracts"),
			workflowtask.SourceID(3701),
			workflowtask.TaskGroup("outsource_rework"),
			workflowtask.OwnerRoleKey("production"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework tasks failed: %v", err)
	}
	if len(reworkTasks) != 1 {
		t.Fatalf("expected one rework task after blocked, got %d", len(reworkTasks))
	}
	reworkTaskID := reworkTasks[0].ID
	resumed := resumeWorkflowTaskForNextRound(
		t, ctx, uc, qcTask.ID, blocked.Version,
		"outsource-qc-blocked-then-rejected-resume", 8, "quality",
	)

	rejectedReason := "复检仍开线"
	if _, err := uc.UpdateTaskStatus(ctx, workflowRepoTestStatusMutation(qcTask.ID, resumed.Version, "outsource-qc-blocked-then-rejected-rejected", &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "rejected",
		Reason:        rejectedReason,
		Payload:       map[string]any{},
	}), 8, "quality"); err != nil {
		t.Fatalf("rejected update failed: %v", err)
	}

	reworkTasks, err = client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("processing-contracts"),
			workflowtask.SourceID(3701),
			workflowtask.TaskGroup("outsource_rework"),
			workflowtask.OwnerRoleKey("production"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework tasks after rejected failed: %v", err)
	}
	if len(reworkTasks) != 1 || reworkTasks[0].ID != reworkTaskID {
		t.Fatalf("expected active rework task to be reused, got %#v", reworkTasks)
	}
	if reworkTasks[0].Payload["decision"] != "blocked" ||
		reworkTasks[0].Payload["blocked_reason"] != blockedReason {
		t.Fatalf("expected reused active rework task to keep original assignment payload, got %#v", reworkTasks[0].Payload)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("processing-contracts"), workflowbusinessstate.SourceID(3701)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "qc_failed" ||
		state.Payload["decision"] != "rejected" ||
		state.Payload["transition_status"] != "rejected" ||
		state.Payload["rejected_reason"] != rejectedReason {
		t.Fatalf("expected latest rejected decision on business state, got %#v", state)
	}

	updatedQCTask, err := client.WorkflowTask.Get(ctx, qcTask.ID)
	if err != nil {
		t.Fatalf("query updated QC task failed: %v", err)
	}
	if updatedQCTask.TaskStatusKey != "rejected" ||
		updatedQCTask.Payload["decision"] != "rejected" ||
		updatedQCTask.Payload["rejected_reason"] != rejectedReason {
		t.Fatalf("expected latest rejected decision on QC task, got %#v", updatedQCTask)
	}
	if _, ok := updatedQCTask.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected QC task payload to clear stale blocked_reason, got %#v", updatedQCTask.Payload)
	}

	createdEvents, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(reworkTaskID), workflowtaskevent.EventType("created")).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework created events failed: %v", err)
	}
	if len(createdEvents) != 1 {
		t.Fatalf("expected one created event for reused active rework task, got %d", len(createdEvents))
	}
}
