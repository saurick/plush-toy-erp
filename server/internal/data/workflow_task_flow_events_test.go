package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestWorkflowTaskFlowEventsRespectRelationVisibilityAndPaging(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "task_flow_records")
	repo := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard))
	createTask := func(code, role, group string, sourceID int) *ent.WorkflowTask {
		return f.client.WorkflowTask.Create().SetTaskCode(code).SetTaskName(code).SetTaskGroup(group).
			SetSourceType("engineering_material_request").SetSourceID(sourceID).SetOwnerRoleKey(role).SetTaskStatusKey("ready").SaveX(ctx)
	}
	anchor := createTask("flow-finance", "finance", "engineering_material_finance_review", 90001)
	prior := createTask("flow-boss", "boss", "engineering_material_boss_review", 90001)
	hidden := createTask("flow-hidden", "engineering", "engineering_material_revision", 90001)
	other := createTask("flow-other-submission", "finance", "engineering_material_finance_review", 90002)
	independent := createTask("flow-independent", "finance", biz.WorkflowFollowupTaskGroup, 90001)
	scope := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"finance", "boss"}}
	for _, task := range []*ent.WorkflowTask{prior, anchor, hidden, other, independent} {
		f.client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("status_changed").SetToStatusKey("done").
			SetActorID(f.actorID).SetReason("已核对").SetPayload(map[string]any{"token": "must-not-leak", "task_snapshot": map[string]any{"private": true}, "feedback": "已记录办理结果"}).SaveX(ctx)
	}
	rows, err := repo.ListWorkflowTaskFlowEvents(ctx, anchor.ID, 100, 0, scope)
	if err != nil || len(rows) != 2 || rows[0].Task.ID != anchor.ID || rows[1].Task.ID != prior.ID {
		t.Fatalf("flow must contain only visible tasks from the same submission: count=%d err=%v", len(rows), err)
	}
	for _, row := range rows {
		if row.Task.ID != row.Event.TaskID || row.Task.TaskName == "" || row.Event.ActorUsername == "" {
			t.Fatal("task identity and actor presentation must remain attached to each event")
		}
		if len(row.Event.Payload) != 1 || row.Event.Payload["feedback"] != "已记录办理结果" || row.Event.ActorID != nil {
			t.Fatal("cross-role events must exclude snapshots, private payloads and internal actor IDs")
		}
	}
	if _, err := repo.ListWorkflowTaskFlowEvents(ctx, hidden.ID, 10, 0, scope); !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		t.Fatalf("hidden anchor must fail closed: %v", err)
	}
	self, err := repo.ListWorkflowTaskFlowEvents(ctx, independent.ID, 10, 0, scope)
	if err != nil || len(self) != 1 || self[0].Task.ID != independent.ID {
		t.Fatalf("independent followup must remain confined to itself: %v", err)
	}
	// Global event pagination must not first truncate the task relation at 100 tasks.
	for i := 0; i < 105; i++ {
		task := createTask(fmt.Sprintf("flow-history-%03d", i), "finance", "engineering_material_finance_review", 90001)
		f.client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetEventType("created").SaveX(ctx)
	}
	first, err := repo.ListWorkflowTaskFlowEvents(ctx, anchor.ID, 2, 0, scope)
	if err != nil || len(first) != 2 || first[0].Task.TaskName != "flow-history-104" || first[1].Task.TaskName != "flow-history-103" {
		t.Fatalf("recent events from all related tasks must be reachable: %v", err)
	}
	newEvent := f.client.WorkflowTaskEvent.Create().SetTaskID(anchor.ID).SetEventType("payload_refreshed").SaveX(ctx)
	older, err := repo.ListWorkflowTaskFlowEvents(ctx, anchor.ID, 2, first[1].Event.ID, scope)
	if err != nil || len(older) != 2 || older[0].Event.ID >= first[1].Event.ID || older[0].Event.ID == newEvent.ID {
		t.Fatalf("new events must not shift the older-page boundary: %v", err)
	}
	restricted := &biz.WorkflowTaskVisibilityScope{StandaloneVisibleOwnerRoleKeys: []string{"boss"}}
	if _, err := repo.ListWorkflowTaskFlowEvents(ctx, anchor.ID, 2, first[1].Event.ID, restricted); !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		t.Fatalf("older pages must recheck anchor visibility: %v", err)
	}
	empty, err := repo.ListWorkflowTaskFlowEvents(ctx, anchor.ID, 2, 1, scope)
	if err != nil || len(empty) != 0 {
		t.Fatalf("exhausted history is an empty page: %v", err)
	}
	for _, limit := range []int{0, 102} {
		if _, err := repo.ListWorkflowTaskFlowEvents(ctx, anchor.ID, limit, 0, scope); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("unbounded limit %d accepted: %v", limit, err)
		}
	}
}
