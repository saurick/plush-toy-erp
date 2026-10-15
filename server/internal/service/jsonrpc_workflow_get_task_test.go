package service

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
	"server/internal/biz"
	"server/internal/errcode"
)

func TestWorkflowGetTaskExactIdentityAndVisibility(t *testing.T) {
	processID, nodeID := 10, 20
	revision := "2026.06.30.workflow-tasks-enabled"
	repo := &stubWorkflowJSONRPCRepo{currentTask: &biz.WorkflowTask{ID: 42, Version: 3, TaskCode: "TASK-EXACT", TaskGroup: "order_approval", TaskStatusKey: "ready", OwnerRoleKey: biz.BossRoleKey, ConfigRevision: &revision, ProcessInstanceID: &processID, ProcessNodeInstanceID: &nodeID, SourceType: "sales_order", SourceID: 1001}}
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), workflowUC: biz.NewWorkflowUsecase(repo), customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")}
	for _, test := range []struct {
		name        string
		role        string
		permissions []string
		params      map[string]any
		code        int32
		disabled    bool
	}{
		{name: "exact task", role: biz.BossRoleKey, permissions: []string{biz.PermissionWorkflowTaskRead}, params: map[string]any{"task_id": 42.0}, code: errcode.OK.Code},
		{name: "outside visible role", role: biz.SalesRoleKey, permissions: []string{biz.PermissionWorkflowTaskRead}, params: map[string]any{"task_id": 42.0}, code: errcode.PermissionDenied.Code},
		{name: "no read permission", role: biz.BossRoleKey, params: map[string]any{"task_id": 42.0}, code: errcode.PermissionDenied.Code},
		{name: "disabled account", role: biz.BossRoleKey, disabled: true, permissions: []string{biz.PermissionWorkflowTaskRead}, params: map[string]any{"task_id": 42.0}, code: errcode.AdminDisabled.Code},
		{name: "invalid identity", role: biz.BossRoleKey, permissions: []string{biz.PermissionWorkflowTaskRead}, params: map[string]any{"task_id": 0.0}, code: errcode.InvalidParam.Code},
		{name: "unsupported scope override", role: biz.BossRoleKey, permissions: []string{biz.PermissionWorkflowTaskRead}, params: map[string]any{"task_id": 42.0, "owner_role_key": "sales"}, code: errcode.InvalidParam.Code},
	} {
		t.Run(test.name, func(t *testing.T) {
			admin := workflowJSONRPCAdmin([]string{test.role}, test.permissions...)
			admin.Disabled = test.disabled
			d.adminReader = stubAdminAccountReader{admin: admin}
			params, _ := structpb.NewStruct(test.params)
			_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task", "1", params)
			if err != nil || result == nil || result.Code != test.code {
				t.Fatalf("result=%#v err=%v", result, err)
			}
			if test.code == errcode.OK.Code {
				task := result.Data.AsMap()["task"].(map[string]any)
				if task["id"] != float64(42) || task["version"] != float64(3) {
					t.Fatalf("wrong task: %#v", task)
				}
			}
			if repo.updateCalls != 0 {
				t.Fatal("read must not mutate tasks")
			}
		})
	}
	params, _ := structpb.NewStruct(map[string]any{"task_id": 42.0})
	_, result, err := d.handleWorkflow(context.Background(), "get_task", "1", params)
	if err != nil || result == nil || result.Code == errcode.OK.Code {
		t.Fatalf("anonymous read allowed: %#v %v", result, err)
	}
}
