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
