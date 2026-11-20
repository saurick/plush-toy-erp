package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

type taskFlowEventJSONRPCRepo struct {
	stubWorkflowJSONRPCRepo
	calls, limit, before int
	scope                *biz.WorkflowTaskVisibilityScope
}

func (r *taskFlowEventJSONRPCRepo) ListWorkflowTaskFlowEvents(_ context.Context, taskID, limit, before int, scope *biz.WorkflowTaskVisibilityScope) ([]*biz.WorkflowTaskFlowEvent, error) {
	r.calls++
	r.limit, r.before, r.scope = limit, before, scope
	result := []*biz.WorkflowTaskFlowEvent{}
	for _, id := range []int{9, 8, 7} {
		if before != 0 && id >= before {
			continue
		}
		origin := taskID
		if id == 8 {
			origin++
		}
		result = append(result, &biz.WorkflowTaskFlowEvent{Event: &biz.WorkflowTaskEvent{ID: id, TaskID: origin, EventType: "created", CreatedAt: time.Unix(1793490000, 0)}, Task: &biz.WorkflowTask{ID: origin, TaskName: "可见岗位任务", TaskGroup: "generic", OwnerRoleKey: biz.SalesRoleKey}})
		if len(result) == limit {
			break
		}
	}
	return result, nil
}

func TestWorkflowTaskFlowEventsRequirePermissionAndBoundedScope(t *testing.T) {
	for _, permitted := range []bool{false, true} {
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey})
		if permitted {
			admin = workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)
		}
		d, _ := workflowWorkbenchTestDispatcher(admin, nil)
		repo := &taskFlowEventJSONRPCRepo{}
		d.workflowUC = biz.NewWorkflowUsecase(repo)
		_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "list_task_events", "flow", mustJSONRPCStruct(t, map[string]any{"task_id": 41, "scope": "flow", "limit": 2}))
		if !permitted {
			if err != nil || result.Code != errcode.PermissionDenied.Code || repo.calls != 0 {
				t.Fatalf("missing permission must not read flow events: %v %v", result, err)
			}
			continue
		}
		if err != nil || result.Code != errcode.OK.Code || repo.calls != 1 || repo.limit != 3 || repo.scope == nil || repo.scope.StandaloneAllowAllOwnerRoles {
			t.Fatalf("flow read lost its bounded visibility: %v %v", result, err)
		}
		data := result.Data.AsMap()
		items := data["items"].([]any)
		if data["truncated"] != true || len(items) != 2 || items[1].(map[string]any)["task"].(map[string]any)["id"] != float64(42) {
			t.Fatal("flow must retain the originating task and explicit truncation")
		}
		_, result, err = d.handleWorkflow(workflowJSONRPCAdminContext(), "list_task_events", "older", mustJSONRPCStruct(t, map[string]any{"task_id": 41, "scope": "flow", "limit": 2, "before_event_id": 8}))
		if err != nil || result.Code != errcode.OK.Code || repo.before != 8 || result.Data.AsMap()["truncated"] != false {
			t.Fatalf("older page failed: %v %v", result, err)
		}
		beforeCalls := repo.calls
		for _, value := range []any{"", "order", "all", nil, true} {
			_, result, err = d.handleWorkflow(workflowJSONRPCAdminContext(), "list_task_events", "invalid", mustJSONRPCStruct(t, map[string]any{"task_id": 41, "scope": value}))
			if err != nil || result.Code != errcode.InvalidParam.Code || repo.calls != beforeCalls {
				t.Fatalf("invalid scope %v reached reader: %v %v", value, result, err)
			}
		}
		repo.currentTask = &biz.WorkflowTask{ID: 41, TaskGroup: "generic", OwnerRoleKey: biz.BossRoleKey, Version: 1}
		_, result, err = d.handleWorkflow(workflowJSONRPCAdminContext(), "list_task_events", "denied", mustJSONRPCStruct(t, map[string]any{"task_id": 41, "scope": "flow"}))
		if err != nil || result.Code != errcode.PermissionDenied.Code || repo.calls != beforeCalls {
			t.Fatalf("invisible anchor reached flow reader: %v %v", result, err)
		}
	}
}
