package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

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
	ownerPoolKey := "sales-order-followup"
	requiredCapabilityKey := biz.PermissionWorkflowTaskComplete
	configRevision := "customer-config-yoyoosun-rev-20260629"
	processInstanceID, processNodeInstanceID := createWorkflowTaskRuntimeAnchorFixture(
		t, ctx, client, "workflow-create-and-update", 1001,
	)

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:              "TASK-001",
		TaskGroup:             "project-orders",
		TaskName:              "确认客户资料",
		SourceType:            "project-orders",
		SourceID:              1001,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          biz.SalesRoleKey,
		OwnerPoolKey:          &ownerPoolKey,
		RequiredCapabilityKey: &requiredCapabilityKey,
		ConfigRevision:        &configRevision,
		ProcessInstanceID:     &processInstanceID,
		ProcessNodeInstanceID: &processNodeInstanceID,
		Payload:               map[string]any{"note": "首批联调任务"},
	}, 7)
	if err != nil {
		t.Fatalf("create task failed: %v", err)
	}
	if task.ID <= 0 {
		t.Fatalf("expected task id")
	}
	if task.Version != 1 {
		t.Fatalf("new task version must start at 1, got %d", task.Version)
	}
	if task.OwnerPoolKey == nil || *task.OwnerPoolKey != ownerPoolKey {
		t.Fatalf("expected owner pool persisted, got %#v", task.OwnerPoolKey)
	}
	if task.RequiredCapabilityKey == nil || *task.RequiredCapabilityKey != requiredCapabilityKey {
		t.Fatalf("expected required capability persisted, got %#v", task.RequiredCapabilityKey)
	}
	if task.ConfigRevision == nil || *task.ConfigRevision != configRevision {
		t.Fatalf("expected config revision persisted, got %#v", task.ConfigRevision)
	}
	if task.ProcessInstanceID == nil || *task.ProcessInstanceID != processInstanceID {
		t.Fatalf("expected process instance id persisted, got %#v", task.ProcessInstanceID)
	}
	if task.ProcessNodeInstanceID == nil || *task.ProcessNodeInstanceID != processNodeInstanceID {
		t.Fatalf("expected process node instance id persisted, got %#v", task.ProcessNodeInstanceID)
	}

	updated, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, task.Version, "create-and-update-done", &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		ExpectedVersion:   task.Version,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Reason:            "资料已核对并完成",
		Payload: map[string]any{
			"done_by":         "test",
			"blocked_reason":  "历史阻塞原因",
			"rejected_reason": "历史退回原因",
		},
	}), 7, biz.SalesRoleKey)
	if err != nil {
		t.Fatalf("update task failed: %v", err)
	}
	if updated.TaskStatusKey != "done" {
		t.Fatalf("expected done, got %q", updated.TaskStatusKey)
	}
	if updated.Version != task.Version+1 {
		t.Fatalf("status update must increment version once, got %d", updated.Version)
	}
	if updated.CompletedAt == nil {
		t.Fatalf("expected completed_at set")
	}
	if updated.BusinessStatusKey == nil || *updated.BusinessStatusKey != "project_approved" {
		t.Fatalf("expected business status synced, got %#v", updated.BusinessStatusKey)
	}
	if updated.BlockedReason != nil {
		t.Fatalf("completion reason must not persist as blocked reason, got %#v", updated.BlockedReason)
	}
	if _, exists := updated.Payload["blocked_reason"]; exists {
		t.Fatalf("completed task projection must clear stale payload blocked_reason, got %#v", updated.Payload)
	}
	if _, exists := updated.Payload["rejected_reason"]; exists {
		t.Fatalf("completed task projection must clear stale payload rejected_reason, got %#v", updated.Payload)
	}

	events, err := client.WorkflowTaskEvent.Query().All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 task events, got %d", len(events))
	}
	if events[0].TaskVersion == nil || *events[0].TaskVersion != 1 {
		t.Fatalf("created event must record task version 1, got %#v", events[0].TaskVersion)
	}
	statusEvent := events[1]
	if statusEvent.EventType != "status_changed" {
		t.Fatalf("expected status_changed event, got %q", statusEvent.EventType)
	}
	if statusEvent.FromStatusKey == nil || *statusEvent.FromStatusKey != "ready" ||
		statusEvent.ToStatusKey == nil || *statusEvent.ToStatusKey != "done" {
		t.Fatalf("expected ready -> done event, got %#v -> %#v", statusEvent.FromStatusKey, statusEvent.ToStatusKey)
	}
	if statusEvent.TaskVersion == nil || *statusEvent.TaskVersion != updated.Version {
		t.Fatalf("status event must record version %d, got %#v", updated.Version, statusEvent.TaskVersion)
	}
	if statusEvent.Reason == nil || *statusEvent.Reason != "资料已核对并完成" {
		t.Fatalf("status event must retain the completion reason, got %#v", statusEvent.Reason)
	}
}

func TestWorkflowRepo_TaskStatusReasonEventAndCompletionCleanup(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_status_reason_cleanup?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "TASK-REASON-CLEANUP-001",
		TaskGroup:     "order_approval",
		TaskName:      "老板审批订单",
		SourceType:    "project-orders",
		SourceID:      2001,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.BossRoleKey,
		Payload:       map[string]any{"record_title": "订单资料确认"},
	}, 7)
	if err != nil {
		t.Fatalf("create task failed: %v", err)
	}

	blockedReason := "缺少客户确认的包装方式"
	blocked, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, task.Version, "status-reason-blocked", &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		ExpectedVersion:   task.Version,
		TaskStatusKey:     "blocked",
		BusinessStatusKey: "blocked",
		Reason:            blockedReason,
		Payload: map[string]any{
			"mobile_action": "blocked",
			"evidence_refs": []any{"photo://packaging"},
		},
		SideEffects: &biz.WorkflowTaskStatusSideEffects{
			BusinessState: &biz.WorkflowBusinessStateUpsert{
				SourceType:        "project-orders",
				SourceID:          2001,
				BusinessStatusKey: "blocked",
				BlockedReason:     &blockedReason,
				Payload:           map[string]any{"blocked_reason": blockedReason},
			},
		},
	}), 8, biz.BossRoleKey)
	if err != nil {
		t.Fatalf("block task failed: %v", err)
	}
	if blocked.BlockedReason == nil || *blocked.BlockedReason != blockedReason {
		t.Fatalf("expected blocked reason persisted, got %#v", blocked.BlockedReason)
	}

	resumeReason := "客户已补齐包装确认"
	_, err = repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, blocked.Version, "status-reason-resume-business-status", &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		ExpectedVersion:   blocked.Version,
		TaskStatusKey:     "ready",
		BusinessStatusKey: "project_approved",
		Reason:            resumeReason,
		Payload:           map[string]any{"mobile_action": "resume"},
	}), 8, biz.BossRoleKey)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("resume must reject a client or usecase supplied business phase, got %v", err)
	}
	_, err = repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, blocked.Version, "status-reason-resume-side-effects", &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: blocked.Version,
		TaskStatusKey:   "ready",
		Reason:          resumeReason,
		Payload:         map[string]any{"mobile_action": "resume"},
		SideEffects: &biz.WorkflowTaskStatusSideEffects{
			BusinessState: &biz.WorkflowBusinessStateUpsert{
				SourceType:        "project-orders",
				SourceID:          2001,
				BusinessStatusKey: "project_approved",
			},
		},
	}), 8, biz.BossRoleKey)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("resume must reject business projection side effects, got %v", err)
	}

	resumed, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, blocked.Version, "status-reason-resume", &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: blocked.Version,
		TaskStatusKey:   "ready",
		Reason:          resumeReason,
		Payload: map[string]any{
			"mobile_action": "resume",
			"evidence_refs": []any{"note://packaging-confirmed"},
		},
	}), 8, biz.BossRoleKey)
	if err != nil {
		t.Fatalf("resume task failed: %v", err)
	}
	if resumed.BlockedReason != nil {
		t.Fatalf("resumed task must clear blocked reason, got %#v", resumed.BlockedReason)
	}
	if _, exists := resumed.Payload["blocked_reason"]; exists {
		t.Fatalf("resumed task payload must clear blocked reason, got %#v", resumed.Payload)
	}
	if resumed.BusinessStatusKey == nil || *resumed.BusinessStatusKey != "blocked" {
		t.Fatalf("resume must preserve the blocked business projection, got %#v", resumed.BusinessStatusKey)
	}
	projectedState, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("project-orders"), workflowbusinessstate.SourceID(2001)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query resumed business projection failed: %v", err)
	}
	if projectedState.BusinessStatusKey != "blocked" {
		t.Fatalf("resume must not infer a previous business phase, got %q", projectedState.BusinessStatusKey)
	}

	replayedResume, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, blocked.Version, "status-reason-resume", &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: blocked.Version,
		TaskStatusKey:   "ready",
		Reason:          resumeReason,
		Payload: map[string]any{
			"mobile_action": "resume",
			"evidence_refs": []any{"note://packaging-confirmed"},
		},
	}), 8, biz.BossRoleKey)
	if err != nil {
		t.Fatalf("same receipt resume replay failed: %v", err)
	}
	if replayedResume.Version != resumed.Version || replayedResume.TaskStatusKey != "ready" {
		t.Fatalf("same receipt must replay the resumed task, got %#v", replayedResume)
	}

	_, err = repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, blocked.Version, "status-reason-resume", &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: blocked.Version,
		TaskStatusKey:   "ready",
		Reason:          "另一个解除阻塞原因",
		IntentHash:      strings.Repeat("b", 64),
		Payload:         map[string]any{"mobile_action": "resume"},
	}), 8, biz.BossRoleKey)
	if !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("same receipt with a different intent must conflict, got %v", err)
	}

	_, err = repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, resumed.Version, "status-reason-resume-new-receipt", &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: resumed.Version,
		TaskStatusKey:   "ready",
		Reason:          resumeReason,
		Payload:         map[string]any{"mobile_action": "resume"},
	}), 8, biz.BossRoleKey)
	if !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("a new receipt must not resume an already ready task, got %v", err)
	}

	rejectedReason := "客户单价和交期未确认"
	rejected, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, resumed.Version, "status-reason-rejected", &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		ExpectedVersion:   resumed.Version,
		TaskStatusKey:     "rejected",
		BusinessStatusKey: "project_pending",
		Reason:            rejectedReason,
		Payload: map[string]any{
			"mobile_action": "rejected",
			"evidence_refs": []any{"note://price"},
		},
	}), 8, biz.BossRoleKey)
	if err != nil {
		t.Fatalf("reject resumed task failed: %v", err)
	}
	if rejected.BlockedReason == nil || *rejected.BlockedReason != rejectedReason {
		t.Fatalf("expected rejected reason persisted, got %#v", rejected.BlockedReason)
	}
	if rejected.CompletedAt == nil {
		t.Fatalf("terminal rejected task must set completed_at")
	}

	_, err = repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, rejected.Version, "status-reason-after-rejected", &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Payload: map[string]any{
			"mobile_action": "done",
			"evidence_refs": []any{"note://approved"},
		},
	}), 8, biz.BossRoleKey)
	if !errors.Is(err, biz.ErrWorkflowTaskSettled) {
		t.Fatalf("terminal rejected task must reject later completion, got %v", err)
	}

	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID)).
		Order(ent.Asc(workflowtaskevent.FieldID)).
		All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 4 {
		t.Fatalf("expected created + blocked + resumed + rejected events only, got %d", len(events))
	}

	assertEvent := func(index int, from string, to string, reason *string, mobileAction string) {
		t.Helper()
		event := events[index]
		if event.EventType != "status_changed" {
			t.Fatalf("event %d expected status_changed, got %q", index, event.EventType)
		}
		if event.FromStatusKey == nil || *event.FromStatusKey != from ||
			event.ToStatusKey == nil || *event.ToStatusKey != to {
			t.Fatalf("event %d expected %s -> %s, got %#v -> %#v", index, from, to, event.FromStatusKey, event.ToStatusKey)
		}
		if event.ActorID == nil || *event.ActorID != 8 {
			t.Fatalf("event %d expected actor id 8, got %#v", index, event.ActorID)
		}
		if event.ActorRoleKey == nil || *event.ActorRoleKey != biz.BossRoleKey {
			t.Fatalf("event %d expected actor role boss, got %#v", index, event.ActorRoleKey)
		}
		if reason == nil {
			if event.Reason != nil {
				t.Fatalf("event %d expected no reason, got %#v", index, event.Reason)
			}
		} else if event.Reason == nil || *event.Reason != *reason {
			t.Fatalf("event %d expected reason %q, got %#v", index, *reason, event.Reason)
		}
		if event.Payload["mobile_action"] != mobileAction {
			t.Fatalf("event %d expected mobile_action %q, got %#v", index, mobileAction, event.Payload["mobile_action"])
		}
	}

	assertEvent(1, "ready", "blocked", &blockedReason, "blocked")
	assertEvent(2, "blocked", "ready", &resumeReason, "resume")
	assertEvent(3, "ready", "rejected", &rejectedReason, "rejected")
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

func TestWorkflowRepo_ListWorkflowTasksFiltersByTaskGroup(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_list_task_group?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	for _, task := range []biz.WorkflowTaskCreate{
		{
			TaskCode:      "TASK-SHIPMENT-RELEASE",
			TaskGroup:     "shipment_release",
			TaskName:      "出货放行",
			SourceType:    "shipping-release",
			SourceID:      1001,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{},
		},
		{
			TaskCode:      "TASK-SAME-SOURCE-OTHER",
			TaskGroup:     "customer_followup",
			TaskName:      "同来源客户跟进",
			SourceType:    "shipping-release",
			SourceID:      1002,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.SalesRoleKey,
			Payload:       map[string]any{},
		},
	} {
		if _, err := repo.CreateWorkflowTask(ctx, &task, 7); err != nil {
			t.Fatalf("create task %s failed: %v", task.TaskCode, err)
		}
	}

	tasks, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{
		Limit:      50,
		SourceType: "shipping-release",
		TaskGroup:  "shipment_release",
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	if total != 1 || len(tasks) != 1 {
		t.Fatalf("expected one shipment_release task, total=%d len=%d", total, len(tasks))
	}
	if tasks[0].TaskGroup != "shipment_release" || tasks[0].SourceType != "shipping-release" {
		t.Fatalf("unexpected task %#v", tasks[0])
	}
}

func TestWorkflowRepo_ListWorkflowTasksUsesServerFiltersAndPaginationBeyondTwoHundred(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_server_pagination?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	dueAt := time.Date(2026, time.July, 18, 12, 0, 0, 0, time.UTC)
	for index := 1; index <= 205; index++ {
		if _, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
			TaskCode:      fmt.Sprintf("SCHEDULE-%03d", index),
			TaskGroup:     "production_scheduling",
			TaskName:      "生产排程任务",
			SourceType:    "production-order",
			SourceID:      index,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.PMCRoleKey,
			DueAt:         &dueAt,
			Payload:       map[string]any{},
		}, 7); err != nil {
			t.Fatalf("create matching task %d failed: %v", index, err)
		}
	}
	outsideDueAt := dueAt.Add(48 * time.Hour)
	if _, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "SCHEDULE-OUTSIDE-DUE",
		TaskGroup:     "production_scheduling",
		TaskName:      "不在日期范围内",
		SourceType:    "production-order",
		SourceID:      999,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.PMCRoleKey,
		DueAt:         &outsideDueAt,
		Payload:       map[string]any{},
	}, 7); err != nil {
		t.Fatalf("create out-of-range task failed: %v", err)
	}

	filter := biz.WorkflowTaskFilter{
		Keyword:       "schedule-",
		TaskGroup:     "production_scheduling",
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.PMCRoleKey,
		DueFrom:       timePointer(dueAt.Add(-time.Hour)),
		DueTo:         timePointer(dueAt.Add(time.Hour)),
		Limit:         10,
		Offset:        10,
	}
	secondPage, total, err := repo.ListWorkflowTasks(ctx, filter)
	if err != nil {
		t.Fatalf("list second page failed: %v", err)
	}
	if total != 205 || len(secondPage) != 10 {
		t.Fatalf("second page total=%d len=%d, want total=205 len=10", total, len(secondPage))
	}

	filter.Offset = 200
	tailPage, total, err := repo.ListWorkflowTasks(ctx, filter)
	if err != nil {
		t.Fatalf("list tail page failed: %v", err)
	}
	if total != 205 || len(tailPage) != 5 {
		t.Fatalf("tail page total=%d len=%d, want total=205 len=5", total, len(tailPage))
	}
}

func timePointer(value time.Time) *time.Time {
	return &value
}

func TestWorkflowRepo_ListWorkflowTasksAppliesVisibilityScope(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_visibility?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)

	assigneeID := 42
	for _, task := range []biz.WorkflowTaskCreate{
		{
			TaskCode:      "TASK-VISIBLE-OWNER",
			TaskGroup:     "generic",
			TaskName:      "品质任务",
			SourceType:    "source",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
		{
			TaskCode:      "TASK-VISIBLE-ASSIGNEE",
			TaskGroup:     "generic",
			TaskName:      "指派任务",
			SourceType:    "source",
			SourceID:      2,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			AssigneeID:    &assigneeID,
			Payload:       map[string]any{},
		},
		{
			TaskCode:      "TASK-HIDDEN",
			TaskGroup:     "generic",
			TaskName:      "其他任务",
			SourceType:    "source",
			SourceID:      3,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.FinanceRoleKey,
			Payload:       map[string]any{},
		},
	} {
		if _, err := repo.CreateWorkflowTask(ctx, &task, 7); err != nil {
			t.Fatalf("create task %s failed: %v", task.TaskCode, err)
		}
	}

	listed, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{
		Limit:                50,
		VisibleOwnerRoleKeys: []string{biz.QualityRoleKey},
		VisibleAssigneeID:    &assigneeID,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	if total != 2 || len(listed) != 2 {
		t.Fatalf("expected two visible tasks, total=%d len=%d", total, len(listed))
	}
	gotCodes := map[string]struct{}{}
	for _, task := range listed {
		gotCodes[task.TaskCode] = struct{}{}
	}
	for _, code := range []string{"TASK-VISIBLE-OWNER", "TASK-VISIBLE-ASSIGNEE"} {
		if _, ok := gotCodes[code]; !ok {
			t.Fatalf("expected visible task %s in %#v", code, gotCodes)
		}
	}
	if _, ok := gotCodes["TASK-HIDDEN"]; ok {
		t.Fatalf("hidden task must not be visible")
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

	if _, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(approvalTask.ID, approvalTask.Version, "side-effects-done", &biz.WorkflowTaskStatusUpdate{
		ID:                approvalTask.ID,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Payload:           map[string]any{"approval_result": "approved"},
		SideEffects:       sideEffects,
	}), 8, "boss"); err != nil {
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
	if _, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(approvalTask.ID, approvalTask.Version+1, "side-effects-after-terminal", &biz.WorkflowTaskStatusUpdate{
		ID:                approvalTask.ID,
		TaskStatusKey:     "done",
		BusinessStatusKey: "project_approved",
		Payload:           map[string]any{"approval_result": "approved"},
		SideEffects:       sideEffects,
	}), 8, "boss"); !errors.Is(err, biz.ErrWorkflowTaskSettled) {
		t.Fatalf("repeat terminal update must be rejected before replaying side effects, got %v", err)
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
			uc := biz.NewWorkflowUsecase(repo)

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

			firstUpdated, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(approvalTask.ID, approvalTask.Version, "order-revision-"+tc.status+"-first", &biz.WorkflowTaskStatusUpdate{
				ID:                approvalTask.ID,
				TaskStatusKey:     tc.status,
				BusinessStatusKey: tc.businessStatusKey,
				Reason:            reason,
				Payload:           map[string]any{tc.reasonKey: reason},
				SideEffects:       sideEffects,
			}), 8, "boss")
			if err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			repeatKey := "order-revision-" + tc.status + "-repeat"
			repeatVersion := firstUpdated.Version
			if tc.status == "blocked" {
				repeatKey = "order-revision-" + tc.status + "-first"
				repeatVersion = approvalTask.Version
			}
			_, repeatErr := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(approvalTask.ID, repeatVersion, repeatKey, &biz.WorkflowTaskStatusUpdate{
				ID:                approvalTask.ID,
				TaskStatusKey:     tc.status,
				BusinessStatusKey: tc.businessStatusKey,
				Reason:            reason,
				Payload:           map[string]any{tc.reasonKey: reason},
				SideEffects:       sideEffects,
			}), 8, "boss")
			if tc.status == "rejected" {
				if !errors.Is(repeatErr, biz.ErrWorkflowTaskSettled) {
					t.Fatalf("repeat rejected update must be terminal, got %v", repeatErr)
				}
			} else if repeatErr != nil {
				t.Fatalf("repeat %s update failed: %v", tc.status, repeatErr)
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

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(revisionTasks[0].ID, revisionTasks[0].Version, "order-revision-"+tc.status+"-complete-derived", &biz.WorkflowTaskStatusUpdate{
				ID:            revisionTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": biz.SalesRoleKey},
			}), 9, biz.SalesRoleKey); err != nil {
				t.Fatalf("complete revision task failed: %v", err)
			}

			sideEffects.DerivedTask.TaskCode = "ORDER-REVISION-" + tc.status + "-002"
			nextRoundVersion := firstUpdated.Version
			if tc.status == "blocked" {
				resumed := resumeWorkflowTaskForNextRound(
					t, ctx, uc, approvalTask.ID, firstUpdated.Version,
					"order-revision-blocked-resume-next-round", 8, "boss",
				)
				nextRoundVersion = resumed.Version
			}
			_, nextRoundErr := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(approvalTask.ID, nextRoundVersion, "order-revision-"+tc.status+"-next-round", &biz.WorkflowTaskStatusUpdate{
				ID:                approvalTask.ID,
				TaskStatusKey:     tc.status,
				BusinessStatusKey: tc.businessStatusKey,
				Reason:            reason,
				Payload:           map[string]any{tc.reasonKey: reason},
				SideEffects:       sideEffects,
			}), 8, "boss")
			if tc.status == "rejected" {
				if !errors.Is(nextRoundErr, biz.ErrWorkflowTaskSettled) {
					t.Fatalf("terminal rejected approval requires a new approval attempt, got %v", nextRoundErr)
				}
			} else if nextRoundErr != nil {
				t.Fatalf("next-round %s update failed: %v", tc.status, nextRoundErr)
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
			wantCount := 2
			if tc.status == "rejected" {
				wantCount = 1
			}
			if count != wantCount {
				t.Fatalf("revision task count = %d, want %d for %s", count, wantCount, tc.status)
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
		Payload:       map[string]any{"urge_count": float64(999)},
	}, 7)
	if err != nil {
		t.Fatalf("create task failed: %v", err)
	}
	seeded, err := client.WorkflowTask.UpdateOneID(task.ID).SetUrgeCount(1).Save(ctx)
	if err != nil {
		t.Fatalf("seed formal urge count failed: %v", err)
	}
	task = entWorkflowTaskToBiz(seeded)

	updated, err := repo.UrgeWorkflowTask(ctx, workflowRepoTestUrgeMutation(task.ID, task.Version, "urge-event-and-payload", &biz.WorkflowTaskUrge{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		Action:          "escalate_to_boss",
		Reason:          "客户交期风险，请确认出货",
		Payload: map[string]any{
			"surface_key": "workflow_business_module",
			"urge_count":  float64(999),
		},
	}), 8, "pmc")
	if err != nil {
		t.Fatalf("urge task failed: %v", err)
	}
	if updated.TaskStatusKey != "ready" {
		t.Fatalf("urge should not change task status, got %q", updated.TaskStatusKey)
	}
	if updated.Version != task.Version+1 {
		t.Fatalf("urge must increment task version once, got %d", updated.Version)
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
	if updated.UrgeCount != 2 {
		t.Fatalf("formal urge_count must increment from the persisted column, got %d", updated.UrgeCount)
	}
	if updated.LastUrgedAt == nil || updated.LastUrgedBy == nil || *updated.LastUrgedBy != 8 ||
		updated.LastUrgedByRoleKey == nil || *updated.LastUrgedByRoleKey != biz.PMCRoleKey {
		t.Fatalf("expected formal last urge fields, got %#v", updated)
	}
	if updated.EscalatedAt == nil || updated.EscalateTargetRoleKey == nil || *updated.EscalateTargetRoleKey != biz.BossRoleKey {
		t.Fatalf("expected formal escalation fields, got %#v", updated)
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

	replayed, err := repo.UrgeWorkflowTask(ctx, workflowRepoTestUrgeMutation(task.ID, task.Version, "urge-event-and-payload", &biz.WorkflowTaskUrge{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		Action:          "escalate_to_boss",
		Reason:          "客户交期风险，请确认出货",
		Payload: map[string]any{
			"surface_key": "workflow_business_module",
			"urge_count":  float64(999),
		},
	}), 8, "pmc")
	if err != nil {
		t.Fatalf("same receipt urge replay failed: %v", err)
	}
	if replayed.UrgeCount != 2 || workflowPayloadInt(replayed.Payload, "urge_count") != 2 {
		t.Fatalf("same receipt must not increment urge_count twice, got %#v", replayed)
	}
	persisted, err := client.WorkflowTask.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("reload urged task failed: %v", err)
	}
	if persisted.UrgeCount != 2 {
		t.Fatalf("persisted formal urge_count must remain 2 after replay, got %d", persisted.UrgeCount)
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
	if urgeEvent.TaskVersion == nil || *urgeEvent.TaskVersion != updated.Version {
		t.Fatalf("urge event must record version %d, got %#v", updated.Version, urgeEvent.TaskVersion)
	}
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
