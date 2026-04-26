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
		OwnerRoleKey:  biz.SalesRoleKey,
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
	}, 7, biz.SalesRoleKey)
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
	statusEvent := events[1]
	if statusEvent.EventType != "status_changed" {
		t.Fatalf("expected status_changed event, got %q", statusEvent.EventType)
	}
	if statusEvent.FromStatusKey == nil || *statusEvent.FromStatusKey != "ready" ||
		statusEvent.ToStatusKey == nil || *statusEvent.ToStatusKey != "done" {
		t.Fatalf("expected ready -> done event, got %#v -> %#v", statusEvent.FromStatusKey, statusEvent.ToStatusKey)
	}
}

func TestWorkflowRepo_GetWorkflowTaskByID(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_get?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	created, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "TASK-GET-001",
		TaskGroup:     "order_approval",
		TaskName:      "老板审批订单",
		SourceType:    "project-orders",
		SourceID:      1001,
		TaskStatusKey: "ready",
		OwnerRoleKey:  "boss",
		Payload:       map[string]any{"record_title": "企鹅抱枕"},
	}, 7)
	if err != nil {
		t.Fatalf("create task failed: %v", err)
	}

	got, err := repo.GetWorkflowTask(ctx, created.ID)
	if err != nil {
		t.Fatalf("get task failed: %v", err)
	}
	if got.ID != created.ID || got.TaskGroup != "order_approval" || got.OwnerRoleKey != "boss" {
		t.Fatalf("unexpected task %#v", got)
	}
}

func TestWorkflowRepo_UpdateTaskStatusSideEffectsAreTransactionalAndIdempotent(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_side_effects?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	approvalStatusKey := "project_pending"
	sourceNo := "PO-20260425-001"
	approvalTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "ORDER-APPROVAL-001",
		TaskGroup:         "order_approval",
		TaskName:          "老板审批订单",
		SourceType:        "project-orders",
		SourceID:          1001,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &approvalStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "boss",
		Payload:           map[string]any{"record_title": "企鹅抱枕"},
	}, 7)
	if err != nil {
		t.Fatalf("create approval task failed: %v", err)
	}

	engineeringStatusKey := "engineering_preparing"
	engineeringOwner := "engineering"
	sideEffects := &biz.WorkflowTaskStatusSideEffects{
		BusinessState: &biz.WorkflowBusinessStateUpsert{
			SourceType:        "project-orders",
			SourceID:          1001,
			SourceNo:          &sourceNo,
			BusinessStatusKey: "project_approved",
			OwnerRoleKey:      &engineeringOwner,
			Payload: map[string]any{
				"approval_task_id": approvalTask.ID,
				"approval_result":  "approved",
			},
		},
		DerivedTask: &biz.WorkflowTaskCreate{
			TaskCode:          "ENGINEERING-DATA-001",
			TaskGroup:         "engineering_data",
			TaskName:          "准备 BOM / 色卡 / 作业指导书",
			SourceType:        "project-orders",
			SourceID:          1001,
			SourceNo:          &sourceNo,
			BusinessStatusKey: &engineeringStatusKey,
			TaskStatusKey:     "ready",
			OwnerRoleKey:      "engineering",
			Priority:          2,
			Payload:           map[string]any{"next_module_key": "material-bom"},
		},
		DerivedFromTaskID: approvalTask.ID,
		WorkflowRuleKey:   "boss_approval_done_to_engineering_data",
	}

	if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:                approvalTask.ID,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Payload:           map[string]any{"approval_result": "approved"},
		SideEffects:       sideEffects,
	}, 8, "boss"); err != nil {
		t.Fatalf("update with side effects failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("project-orders"), workflowbusinessstate.SourceID(1001)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "project_approved" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "engineering" {
		t.Fatalf("unexpected business state %#v", state)
	}

	downstreamTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(1001),
			workflowtask.TaskGroup("engineering_data"),
			workflowtask.OwnerRoleKey("engineering"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query downstream tasks failed: %v", err)
	}
	if len(downstreamTasks) != 1 {
		t.Fatalf("expected one engineering task, got %d", len(downstreamTasks))
	}

	events, err := client.WorkflowTaskEvent.Query().Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected approval created + status + downstream created events, got %d", len(events))
	}
	if events[2].TaskID != downstreamTasks[0].ID ||
		events[2].Payload["workflow_rule_key"] != "boss_approval_done_to_engineering_data" {
		t.Fatalf("expected downstream created event with rule payload, got %#v", events[2])
	}

	sideEffects.DerivedTask.TaskCode = "ENGINEERING-DATA-002"
	if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:                approvalTask.ID,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Payload:           map[string]any{"approval_result": "approved"},
		SideEffects:       sideEffects,
	}, 8, "boss"); err != nil {
		t.Fatalf("repeat update with side effects failed: %v", err)
	}

	count, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(1001),
			workflowtask.TaskGroup("engineering_data"),
			workflowtask.OwnerRoleKey("engineering"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count downstream tasks failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected idempotent downstream task count 1, got %d", count)
	}
}

func TestWorkflowRepo_OrderRevisionIdempotencyAllowsNextRoundAfterDone(t *testing.T) {
	cases := []struct {
		status            string
		businessStatusKey string
		reasonKey         string
		sourceID          int
	}{
		{status: "blocked", businessStatusKey: "blocked", reasonKey: "blocked_reason", sourceID: 2101},
		{status: "rejected", businessStatusKey: "project_pending", reasonKey: "rejected_reason", sourceID: 2102},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_revision_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)

			sourceNo := "PO-REV-" + tc.status
			approvalStatusKey := "project_pending"
			approvalTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
				TaskCode:          "ORDER-APPROVAL-REV-" + tc.status,
				TaskGroup:         "order_approval",
				TaskName:          "老板审批订单",
				SourceType:        "project-orders",
				SourceID:          tc.sourceID,
				SourceNo:          &sourceNo,
				BusinessStatusKey: &approvalStatusKey,
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "boss",
				Payload:           map[string]any{"record_title": "订单补资料"},
			}, 7)
			if err != nil {
				t.Fatalf("create approval task failed: %v", err)
			}

			owner := biz.SalesRoleKey
			revisionStatusKey := "project_pending"
			reason := "资料缺失"
			workflowRuleKey := "boss_approval_rejected_to_order_revision"
			if tc.status == "blocked" {
				workflowRuleKey = "boss_approval_blocked_to_order_revision"
			}
			sideEffects := &biz.WorkflowTaskStatusSideEffects{
				BusinessState: &biz.WorkflowBusinessStateUpsert{
					SourceType:        "project-orders",
					SourceID:          tc.sourceID,
					SourceNo:          &sourceNo,
					BusinessStatusKey: tc.businessStatusKey,
					OwnerRoleKey:      &owner,
					BlockedReason:     &reason,
					Payload: map[string]any{
						"decision":          tc.status,
						"transition_status": tc.status,
						tc.reasonKey:        reason,
					},
				},
				DerivedTask: &biz.WorkflowTaskCreate{
					TaskCode:          "ORDER-REVISION-" + tc.status + "-001",
					TaskGroup:         "order_revision",
					TaskName:          "补充订单资料后重新提交",
					SourceType:        "project-orders",
					SourceID:          tc.sourceID,
					SourceNo:          &sourceNo,
					BusinessStatusKey: &revisionStatusKey,
					TaskStatusKey:     "ready",
					OwnerRoleKey:      biz.SalesRoleKey,
					Priority:          2,
					Payload: map[string]any{
						"decision":          tc.status,
						"transition_status": tc.status,
						tc.reasonKey:        reason,
					},
				},
				DerivedFromTaskID: approvalTask.ID,
				WorkflowRuleKey:   workflowRuleKey,
			}

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:                approvalTask.ID,
				TaskStatusKey:     tc.status,
				BusinessStatusKey: tc.businessStatusKey,
				Reason:            reason,
				Payload:           map[string]any{tc.reasonKey: reason},
				SideEffects:       sideEffects,
			}, 8, "boss"); err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:                approvalTask.ID,
				TaskStatusKey:     tc.status,
				BusinessStatusKey: tc.businessStatusKey,
				Reason:            reason,
				Payload:           map[string]any{tc.reasonKey: reason},
				SideEffects:       sideEffects,
			}, 8, "boss"); err != nil {
				t.Fatalf("repeat %s update failed: %v", tc.status, err)
			}

			revisionTasks, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("project-orders"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("order_revision"),
					workflowtask.OwnerRoleKey(biz.SalesRoleKey),
				).
				All(ctx)
			if err != nil {
				t.Fatalf("query revision tasks failed: %v", err)
			}
			if len(revisionTasks) != 1 {
				t.Fatalf("expected one active revision task after repeated %s, got %d", tc.status, len(revisionTasks))
			}
			if revisionTasks[0].Payload["decision"] != tc.status ||
				revisionTasks[0].Payload["transition_status"] != tc.status ||
				revisionTasks[0].Payload[tc.reasonKey] != reason {
				t.Fatalf("expected decision payload on revision task, got %#v", revisionTasks[0].Payload)
			}

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            revisionTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": biz.SalesRoleKey},
			}, 9, biz.SalesRoleKey); err != nil {
				t.Fatalf("complete revision task failed: %v", err)
			}

			sideEffects.DerivedTask.TaskCode = "ORDER-REVISION-" + tc.status + "-002"
			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:                approvalTask.ID,
				TaskStatusKey:     tc.status,
				BusinessStatusKey: tc.businessStatusKey,
				Reason:            reason,
				Payload:           map[string]any{tc.reasonKey: reason},
				SideEffects:       sideEffects,
			}, 8, "boss"); err != nil {
				t.Fatalf("next-round %s update failed: %v", tc.status, err)
			}

			count, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("project-orders"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("order_revision"),
					workflowtask.OwnerRoleKey(biz.SalesRoleKey),
				).
				Count(ctx)
			if err != nil {
				t.Fatalf("count revision tasks failed: %v", err)
			}
			if count != 2 {
				t.Fatalf("expected completed revision to allow next round, got %d revision tasks", count)
			}
		})
	}
}

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
		ID:            warehouseTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
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
		ID:            warehouseTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
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
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            warehouseTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "warehouse"); err != nil {
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
		ID:            qcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality", "qc_result": "accepted"},
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
		ID:            qcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
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

func TestWorkflowRepo_OutsourceReturnQCReworkIdempotencyAllowsNextRoundAfterDone(t *testing.T) {
	cases := []struct {
		status    string
		reasonKey string
		sourceID  int
	}{
		{status: "blocked", reasonKey: "blocked_reason", sourceID: 3601},
		{status: "rejected", reasonKey: "rejected_reason", sourceID: 3602},
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
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
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

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            reworkTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": "production"},
			}, 9, "production"); err != nil {
				t.Fatalf("complete rework task failed: %v", err)
			}

			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
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
					workflowtask.TaskGroup("outsource_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				Count(ctx)
			if err != nil {
				t.Fatalf("count rework tasks failed: %v", err)
			}
			if count != 2 {
				t.Fatalf("expected completed rework to allow next round, got %d rework tasks", count)
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
	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "blocked",
		Reason:        blockedReason,
		Payload:       map[string]any{},
	}, 8, "quality"); err != nil {
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

	rejectedReason := "复检仍开线"
	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "rejected",
		Reason:        rejectedReason,
		Payload:       map[string]any{},
	}, 8, "quality"); err != nil {
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

func TestWorkflowRepo_FinishedGoodsQCDoneCreatesInboundIdempotently(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_qc_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)

	qcTask := createFinishedGoodsQCTask(t, ctx, repo, 4501)

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality", "qc_result": "accepted"},
	}, 8, "quality"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4501)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query finished goods QC business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods QC done business state %#v", state)
	}
	if state.Payload["qc_task_id"] != float64(qcTask.ID) && state.Payload["qc_task_id"] != qcTask.ID {
		t.Fatalf("expected QC task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["qc_result"] != "accepted" ||
		state.Payload["finished_goods"] != true ||
		state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["alert_type"] != "finished_goods_inbound_pending" {
		t.Fatalf("expected finished goods QC state payload, got %#v", state.Payload)
	}

	downstreamTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4501),
			workflowtask.TaskGroup("finished_goods_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query finished goods inbound tasks failed: %v", err)
	}
	if len(downstreamTasks) != 1 {
		t.Fatalf("expected one finished goods inbound task, got %d", len(downstreamTasks))
	}
	if downstreamTasks[0].Payload["qc_task_id"] != float64(qcTask.ID) && downstreamTasks[0].Payload["qc_task_id"] != qcTask.ID {
		t.Fatalf("expected QC task id in downstream payload, got %#v", downstreamTasks[0].Payload)
	}
	if downstreamTasks[0].Payload["qc_result"] != "accepted" ||
		downstreamTasks[0].Payload["finished_goods"] != true ||
		downstreamTasks[0].Payload["inventory_balance_deferred"] != true ||
		downstreamTasks[0].Payload["alert_type"] != "finished_goods_inbound_pending" ||
		downstreamTasks[0].Payload["shipment_date"] != "2026-04-30" {
		t.Fatalf("unexpected finished goods inbound payload %#v", downstreamTasks[0].Payload)
	}

	shipmentCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4501),
			workflowtask.TaskGroup("shipment_release"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count shipment release tasks failed: %v", err)
	}
	if shipmentCount != 0 {
		t.Fatalf("finished goods QC done must not derive shipment release, got %d", shipmentCount)
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
		t.Fatalf("finished goods QC must not write inventory facts, got txns=%d balances=%d lots=%d", inventoryTxnCount, inventoryBalanceCount, inventoryLotCount)
	}

	events, err := client.WorkflowTaskEvent.Query().Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected QC created + status + inbound created events, got %d", len(events))
	}
	if events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" {
		t.Fatalf("expected finished goods QC status event ready -> done, got %#v", events[1])
	}
	if events[2].TaskID != downstreamTasks[0].ID ||
		events[2].Payload["workflow_rule_key"] != "finished_goods_qc_done_to_finished_goods_inbound" {
		t.Fatalf("expected inbound created event with rule payload, got %#v", events[2])
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 8, "quality"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	count, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4501),
			workflowtask.TaskGroup("finished_goods_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count finished goods inbound tasks failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected idempotent finished goods inbound task count 1, got %d", count)
	}
}

func TestWorkflowRepo_FinishedGoodsQCReworkIdempotencyAllowsNextRoundAfterDone(t *testing.T) {
	cases := []struct {
		status    string
		reasonKey string
		sourceID  int
	}{
		{status: "blocked", reasonKey: "blocked_reason", sourceID: 4601},
		{status: "rejected", reasonKey: "rejected_reason", sourceID: 4602},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_qc_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)
			qcTask := createFinishedGoodsQCTask(t, ctx, repo, tc.sourceID)

			reason := "成品抽检不合格"
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("repeat %s update failed: %v", tc.status, err)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query finished goods rework business state failed: %v", err)
			}
			if state.BusinessStatusKey != "qc_failed" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "production" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected finished goods rework business state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason ||
				state.Payload["finished_goods"] != true {
				t.Fatalf("expected decision payload on business state, got %#v", state.Payload)
			}

			reworkTasks, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("production-progress"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("finished_goods_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				All(ctx)
			if err != nil {
				t.Fatalf("query finished goods rework tasks failed: %v", err)
			}
			if len(reworkTasks) != 1 {
				t.Fatalf("expected one active rework task after repeated %s, got %d", tc.status, len(reworkTasks))
			}
			if reworkTasks[0].Payload["decision"] != tc.status ||
				reworkTasks[0].Payload["transition_status"] != tc.status ||
				reworkTasks[0].Payload[tc.reasonKey] != reason ||
				reworkTasks[0].Payload["finished_goods"] != true {
				t.Fatalf("expected decision payload on rework task, got %#v", reworkTasks[0].Payload)
			}

			createdEvents, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(reworkTasks[0].ID), workflowtaskevent.EventType("created")).
				All(ctx)
			if err != nil {
				t.Fatalf("query rework task events failed: %v", err)
			}
			if len(createdEvents) != 1 ||
				createdEvents[0].Payload["workflow_rule_key"] == "" {
				t.Fatalf("expected one rework created event with workflow rule payload, got %#v", createdEvents)
			}

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            reworkTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": "production"},
			}, 9, "production"); err != nil {
				t.Fatalf("complete rework task failed: %v", err)
			}

			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("next-round %s update failed: %v", tc.status, err)
			}

			count, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("production-progress"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("finished_goods_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				Count(ctx)
			if err != nil {
				t.Fatalf("count rework tasks failed: %v", err)
			}
			if count != 2 {
				t.Fatalf("expected completed rework to allow next round, got %d rework tasks", count)
			}
		})
	}
}

func TestWorkflowRepo_FinishedGoodsQCBlockedThenRejectedReusesActiveReworkAndRefreshesPayload(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_qc_blocked_then_rejected?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)
	qcTask := createFinishedGoodsQCTask(t, ctx, repo, 4701)

	blockedReason := "车缝开线待判责"
	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "blocked",
		Reason:        blockedReason,
		Payload:       map[string]any{},
	}, 8, "quality"); err != nil {
		t.Fatalf("blocked update failed: %v", err)
	}

	reworkTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4701),
			workflowtask.TaskGroup("finished_goods_rework"),
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

	rejectedReason := "复检尺寸偏差"
	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "rejected",
		Reason:        rejectedReason,
		Payload:       map[string]any{},
	}, 8, "quality"); err != nil {
		t.Fatalf("rejected update failed: %v", err)
	}

	reworkTasks, err = client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4701),
			workflowtask.TaskGroup("finished_goods_rework"),
			workflowtask.OwnerRoleKey("production"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework tasks after rejected failed: %v", err)
	}
	if len(reworkTasks) != 1 || reworkTasks[0].ID != reworkTaskID {
		t.Fatalf("expected active rework task to be reused, got %#v", reworkTasks)
	}
	if reworkTasks[0].Payload["decision"] != "rejected" ||
		reworkTasks[0].Payload["transition_status"] != "rejected" ||
		reworkTasks[0].Payload["rejected_reason"] != rejectedReason {
		t.Fatalf("expected reused active rework task to refresh rejected payload, got %#v", reworkTasks[0].Payload)
	}
	if _, ok := reworkTasks[0].Payload["blocked_reason"]; ok {
		t.Fatalf("expected reused active rework task to clear blocked_reason, got %#v", reworkTasks[0].Payload)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4701)).
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
	if _, ok := state.Payload["blocked_reason"]; ok {
		t.Fatalf("expected business state to clear blocked_reason, got %#v", state.Payload)
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

func TestWorkflowRepo_FinishedGoodsInboundDoneUpsertsBusinessStateOnly(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_inbound_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)
	inboundTask := createFinishedGoodsInboundTask(t, ctx, repo, 4801, map[string]any{})

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            inboundTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4801)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query finished goods inbound business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods inbound state %#v", state)
	}
	if state.Payload["inbound_task_id"] != float64(inboundTask.ID) && state.Payload["inbound_task_id"] != inboundTask.ID {
		t.Fatalf("expected inbound task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["inbound_result"] != "done" ||
		state.Payload["finished_goods"] != true ||
		state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["shipment_release_deferred"] != true ||
		state.Payload["decision"] != "done" ||
		state.Payload["transition_status"] != "done" {
		t.Fatalf("expected finished goods inbound done payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(4801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("finished goods inbound done must not create downstream tasks, got %d tasks", taskCount)
	}
	shipmentCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4801),
			workflowtask.TaskGroup("shipment_release"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count shipment release tasks failed: %v", err)
	}
	if shipmentCount != 0 {
		t.Fatalf("finished goods inbound done must not derive shipment release, got %d", shipmentCount)
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
		t.Fatalf("finished goods inbound must not write inventory facts, got txns=%d balances=%d lots=%d", inventoryTxnCount, inventoryBalanceCount, inventoryLotCount)
	}

	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(inboundTask.ID)).
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
		events[1].Payload["shipment_release_deferred"] != true {
		t.Fatalf("expected finished goods inbound status event ready -> done, got %#v", events)
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            inboundTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	stateCount, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count business states failed: %v", err)
	}
	if stateCount != 1 {
		t.Fatalf("expected business state upsert to keep one row, got %d", stateCount)
	}
	taskCount, err = client.WorkflowTask.Query().
		Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(4801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("repeated finished goods inbound done must not create downstream tasks, got %d tasks", taskCount)
	}
}

func TestWorkflowRepo_FinishedGoodsInboundBlockedAndRejectedPreserveReasonPayload(t *testing.T) {
	cases := []struct {
		status       string
		reasonKey    string
		staleKey     string
		sourceID     int
		initialState string
	}{
		{status: "blocked", reasonKey: "blocked_reason", staleKey: "rejected_reason", sourceID: 4901, initialState: "warehouse_inbound_pending"},
		{status: "rejected", reasonKey: "rejected_reason", staleKey: "blocked_reason", sourceID: 4902, initialState: "blocked"},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_inbound_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)
			inboundTask := createFinishedGoodsInboundTask(t, ctx, repo, tc.sourceID, map[string]any{
				tc.staleKey: "旧原因",
			})
			if inboundTask.BusinessStatusKey == nil || *inboundTask.BusinessStatusKey != tc.initialState {
				_, err := client.WorkflowTask.UpdateOneID(inboundTask.ID).
					SetBusinessStatusKey(tc.initialState).
					Save(ctx)
				if err != nil {
					t.Fatalf("prepare initial status failed: %v", err)
				}
			}

			reason := "成品入库数量待复核"
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            inboundTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "warehouse"); err != nil {
				t.Fatalf("%s update failed: %v", tc.status, err)
			}

			updatedTask, err := client.WorkflowTask.Get(ctx, inboundTask.ID)
			if err != nil {
				t.Fatalf("query updated inbound task failed: %v", err)
			}
			if updatedTask.TaskStatusKey != tc.status ||
				updatedTask.BlockedReason == nil ||
				*updatedTask.BlockedReason != reason {
				t.Fatalf("unexpected updated finished goods inbound task %#v", updatedTask)
			}
			if updatedTask.Payload["decision"] != tc.status ||
				updatedTask.Payload["transition_status"] != tc.status ||
				updatedTask.Payload[tc.reasonKey] != reason ||
				updatedTask.Payload["finished_goods"] != true {
				t.Fatalf("expected decision payload on inbound task, got %#v", updatedTask.Payload)
			}
			if _, ok := updatedTask.Payload[tc.staleKey]; ok {
				t.Fatalf("expected stale %s to be cleared, got %#v", tc.staleKey, updatedTask.Payload)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query finished goods inbound business state failed: %v", err)
			}
			if state.BusinessStatusKey != "blocked" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "warehouse" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected finished goods inbound blocked state %#v", state)
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
				Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(tc.sourceID)).
				Count(ctx)
			if err != nil {
				t.Fatalf("count workflow tasks failed: %v", err)
			}
			if taskCount != 1 {
				t.Fatalf("finished goods inbound %s must not create downstream tasks, got %d tasks", tc.status, taskCount)
			}

			events, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(inboundTask.ID)).
				Order(ent.Asc(workflowtaskevent.FieldID)).
				All(ctx)
			if err != nil {
				t.Fatalf("query finished goods inbound task events failed: %v", err)
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
		ID:            shipmentTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
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
		ID:            shipmentTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
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
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            shipmentTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "warehouse"); err != nil {
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

func TestWorkflowRepo_UpsertWorkflowBusinessStateUpdatesExisting(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_business_state?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	owner := "engineering"
	state, err := repo.UpsertWorkflowBusinessState(ctx, &biz.WorkflowBusinessStateUpsert{
		SourceType:        "project-orders",
		SourceID:          1001,
		BusinessStatusKey: "project_approved",
		OwnerRoleKey:      &owner,
		Payload:           map[string]any{"approval_result": "approved"},
	}, 7)
	if err != nil {
		t.Fatalf("upsert create failed: %v", err)
	}
	if state.ID <= 0 {
		t.Fatalf("expected state id")
	}

	blockedOwner := biz.SalesRoleKey
	reason := "缺少款图"
	updated, err := repo.UpsertWorkflowBusinessState(ctx, &biz.WorkflowBusinessStateUpsert{
		SourceType:        "project-orders",
		SourceID:          1001,
		BusinessStatusKey: "blocked",
		OwnerRoleKey:      &blockedOwner,
		BlockedReason:     &reason,
		Payload:           map[string]any{"rejected_reason": reason},
	}, 8)
	if err != nil {
		t.Fatalf("upsert update failed: %v", err)
	}
	if updated.ID != state.ID || updated.BusinessStatusKey != "blocked" {
		t.Fatalf("expected same state updated to blocked, got %#v", updated)
	}
	if updated.OwnerRoleKey == nil || *updated.OwnerRoleKey != biz.SalesRoleKey ||
		updated.BlockedReason == nil ||
		*updated.BlockedReason != reason {
		t.Fatalf("unexpected updated state %#v", updated)
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

func createFinishedGoodsQCTask(t *testing.T, ctx context.Context, repo *workflowRepo, sourceID int) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "FG-QC-001"
	statusKey := "qc_pending"
	qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "FINISHED-GOODS-QC-001",
		TaskGroup:         "finished_goods_qc",
		TaskName:          "成品抽检",
		SourceType:        "production-progress",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          3,
		Payload: map[string]any{
			"record_title":          "小熊公仔完工",
			"source_no":             "SO-2026-101",
			"customer_name":         "成慧怡",
			"style_no":              "ST-001",
			"product_no":            "SKU-101",
			"product_name":          "小熊公仔",
			"quantity":              float64(1200),
			"unit":                  "只",
			"due_date":              "2026-04-28",
			"shipment_date":         "2026-04-30",
			"packaging_requirement": "彩盒 12 只/箱",
			"shipping_requirement":  "客户唛头",
			"finished_goods":        true,
		},
	}, 7)
	if err != nil {
		t.Fatalf("create finished goods QC task failed: %v", err)
	}
	return qcTask
}

func createFinishedGoodsInboundTask(t *testing.T, ctx context.Context, repo *workflowRepo, sourceID int, payloadOverrides map[string]any) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "FG-IN-001"
	statusKey := "warehouse_inbound_pending"
	payload := map[string]any{
		"record_title":               "小熊公仔入库",
		"source_no":                  "SO-2026-101",
		"customer_name":              "成慧怡",
		"style_no":                   "ST-001",
		"product_no":                 "SKU-101",
		"product_name":               "小熊公仔",
		"quantity":                   float64(1200),
		"unit":                       "只",
		"due_date":                   "2026-04-28",
		"shipment_date":              "2026-04-30",
		"packaging_requirement":      "彩盒 12 只/箱",
		"shipping_requirement":       "客户唛头",
		"finished_goods":             true,
		"inventory_balance_deferred": true,
	}
	for key, value := range payloadOverrides {
		payload[key] = value
	}
	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "FINISHED-GOODS-INBOUND-001",
		TaskGroup:         "finished_goods_inbound",
		TaskName:          "成品入库",
		SourceType:        "production-progress",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          3,
		Payload:           payload,
	}, 7)
	if err != nil {
		t.Fatalf("create finished goods inbound task failed: %v", err)
	}
	return task
}

func createShipmentReleaseTask(t *testing.T, ctx context.Context, repo *workflowRepo, sourceID int, payloadOverrides map[string]any) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "SHIP-REL-001"
	statusKey := "shipment_pending"
	payload := map[string]any{
		"record_title":          "小熊公仔出货放行",
		"source_no":             "SO-2026-101",
		"customer_name":         "成慧怡",
		"style_no":              "ST-001",
		"product_no":            "SKU-101",
		"product_name":          "小熊公仔",
		"quantity":              float64(1200),
		"unit":                  "只",
		"due_date":              "2026-04-28",
		"shipment_date":         "2026-04-30",
		"warehouse_location":    "FG-A-01",
		"packaging_requirement": "彩盒 12 只/箱",
		"shipping_requirement":  "客户唛头",
		"finished_goods":        true,
		"shipment_release":      true,
	}
	for key, value := range payloadOverrides {
		payload[key] = value
	}
	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "SHIPMENT-RELEASE-001",
		TaskGroup:         "shipment_release",
		TaskName:          "出货放行 / 出货准备",
		SourceType:        "shipping-release",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          3,
		Payload:           payload,
	}, 7)
	if err != nil {
		t.Fatalf("create shipment release task failed: %v", err)
	}
	return task
}
