package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type taskLinkTestRepo struct {
	stubWorkflowJSONRPCRepo
	view   biz.WorkflowHandlingChainView
	calls  int
	offset int
	scope  *biz.WorkflowTaskVisibilityScope
}

func (r *taskLinkTestRepo) GetWorkflowHandlingChainPage(ctx context.Context, id int, view biz.WorkflowHandlingChainView, scope *biz.WorkflowTaskVisibilityScope, offset int) (*biz.WorkflowHandlingChain, error) {
	r.offset = offset
	return r.GetWorkflowHandlingChain(ctx, id, view, scope)
}

func TestWorkflowTaskLinkContinuesCurrentVisibilityPage(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead)
	d, _ := workflowWorkbenchTestDispatcher(admin, nil)
	repo := &taskLinkTestRepo{stubWorkflowJSONRPCRepo: stubWorkflowJSONRPCRepo{currentTask: &biz.WorkflowTask{ID: 142, TaskName: "已处理任务", OwnerRoleKey: biz.EngineeringRoleKey, TaskStatusKey: "done"}}}
	d.workflowUC = biz.NewWorkflowUsecase(repo)
	_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_link", "link-page", mustJSONRPCStruct(t, map[string]any{"task_id": 41, "offset": 100}))
	if err != nil || result.Code != errcode.OK.Code || repo.offset != 100 || repo.view != biz.WorkflowHandlingChainLinkView {
		t.Fatalf("result=%v err=%v offset=%d view=%v", result, err, repo.offset, repo.view)
	}
}

func (r *taskLinkTestRepo) GetWorkflowHandlingChain(_ context.Context, _ int, view biz.WorkflowHandlingChainView, scope *biz.WorkflowTaskVisibilityScope) (*biz.WorkflowHandlingChain, error) {
	r.view, r.calls = view, r.calls+1
	r.scope = scope
	task := r.currentTask
	return &biz.WorkflowHandlingChain{Items: []biz.WorkflowHandlingChainItem{{ID: task.ID, Name: task.TaskName, Status: task.TaskStatusKey, OwnerRoleKey: task.OwnerRoleKey}}}, nil
}

func TestWorkflowTaskLinkRecipientRoleMatrix(t *testing.T) {
	roles := []string{biz.SalesRoleKey, biz.EngineeringRoleKey, biz.PurchaseRoleKey, biz.ProductionRoleKey, biz.WarehouseRoleKey, biz.QualityRoleKey, biz.FinanceRoleKey, biz.PMCRoleKey, biz.BossRoleKey}
	config := workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")
	for _, recipient := range roles {
		for _, owner := range roles {
			t.Run(recipient+"_opens_"+owner, func(t *testing.T) {
				admin := workflowJSONRPCAdmin([]string{recipient}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete, biz.PermissionWorkflowTaskApprove)
				d, _ := workflowWorkbenchTestDispatcher(admin, config)
				task := &biz.WorkflowTask{ID: 42, TaskName: "待办任务", OwnerRoleKey: owner, TaskStatusKey: "ready", SourceType: "sales_order", SourceID: 1}
				if owner == biz.BossRoleKey {
					task.TaskGroup = "order_approval"
					capability := biz.PermissionWorkflowTaskApprove
					task.RequiredCapabilityKey = &capability
				}

				repo := &taskLinkTestRepo{stubWorkflowJSONRPCRepo: stubWorkflowJSONRPCRepo{currentTask: task}}
				d.workflowUC = biz.NewWorkflowUsecase(repo)
				_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_link", "recipient", mustJSONRPCStruct(t, map[string]any{"task_id": 41}))
				if err != nil || result.Code != errcode.OK.Code {
					t.Fatalf("result=%v err=%v", result, err)
				}
				if repo.scope == nil || repo.scope.StandaloneAllowAllOwnerRoles || len(repo.scope.StandaloneVisibleOwnerRoleKeys) != 1 || repo.scope.StandaloneVisibleOwnerRoleKeys[0] != recipient || repo.scope.VisibleAssigneeID == nil || *repo.scope.VisibleAssigneeID != admin.ID {
					t.Fatalf("link must use recipient scope, not sharing task owner: %+v", repo.scope)
				}
				item := result.Data.AsMap()["items"].([]any)[0].(map[string]any)
				if item["can_handle"] != (recipient == owner) || repo.updateCalls != 0 {
					t.Fatalf("unexpected recipient action access=%v writes=%d complete=%v", item, repo.updateCalls, d.workflowTaskActionAccessToMap(workflowJSONRPCAdminContext(), admin, task, workflowTaskActionExplainContracts(task)[0]))
				}
			})
		}
	}
}

func TestWorkflowTaskLinkFormalTaskRequiresSourceAccess(t *testing.T) {
	config := workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")
	for _, mode := range []string{"allowed", "no source permission", "no runtime", "broken anchor", "different role"} {
		t.Run(mode, func(t *testing.T) {
			permissions := []string{biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete}
			if mode != "no source permission" {
				permissions = append(permissions, biz.PermissionSalesOrderRead)
			}
			role := biz.EngineeringRoleKey
			if mode == "different role" {
				role = biz.SalesRoleKey
			}
			d, _ := workflowWorkbenchTestDispatcher(workflowJSONRPCAdmin([]string{role}, permissions...), config)
			revision, processID, nodeID := "2026.06.30.workflow-tasks-enabled", 10, 20
			task := &biz.WorkflowTask{ID: 42, OwnerRoleKey: biz.EngineeringRoleKey, TaskStatusKey: "ready", SourceType: "sales_order", SourceID: 1, ConfigRevision: &revision, ProcessInstanceID: &processID, ProcessNodeInstanceID: &nodeID}
			if mode == "broken anchor" {
				task.ProcessNodeInstanceID = nil
			}
			repo := &taskLinkTestRepo{stubWorkflowJSONRPCRepo: stubWorkflowJSONRPCRepo{currentTask: task}}
			d.workflowUC = biz.NewWorkflowUsecase(repo)
			if mode != "no runtime" {
				processRepo := &stubProcessRuntimeJSONRPCRepo{
					process: &biz.ProcessInstance{ID: processID, BusinessRefType: "sales_order", BusinessRefID: 1, Status: biz.ProcessStatusActive},
					node:    &biz.ProcessNodeInstance{ID: nodeID, ProcessInstanceID: processID, NodeType: biz.ProcessNodeTypeHumanTask, Status: biz.ProcessNodeStatusActive},
				}
				d.processRuntimeUC = biz.NewProcessRuntimeUsecase(processRepo, repo)
			}
			_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_link", "source", mustJSONRPCStruct(t, map[string]any{"task_id": 41}))
			if err != nil || result.Code != errcode.OK.Code {
				t.Fatalf("result=%v err=%v", result, err)
			}
			item := result.Data.AsMap()["items"].([]any)[0].(map[string]any)
			if item["can_handle"] != (mode == "allowed") || repo.updateCalls != 0 {
				t.Fatalf("source access=%v result=%v writes=%d", d.workflowTaskSourceAccess(workflowJSONRPCAdminContext(), task), item, repo.updateCalls)
			}
		})
	}
}

func TestWorkflowTaskLinkUsesCurrentTaskPermissions(t *testing.T) {
	self, other := 7, 9
	config := workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")
	for _, tc := range []struct {
		name     string
		admin    *biz.AdminUser
		assignee *int
		status   string
		want     bool
	}{
		{"role pool", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), nil, "ready", true},
		{"multiple roles", workflowJSONRPCAdmin([]string{biz.FinanceRoleKey, biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), nil, "ready", true},
		{"blocked owner", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate), nil, "blocked", true},
		{"assigned self", workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), &self, "ready", true},
		{"assigned other", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), &other, "ready", false},
		{"read only", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead), nil, "ready", false},
		{"supervision", workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskSupervise), nil, "ready", false},
		{"super admin", &biz.AdminUser{ID: self, IsSuperAdmin: true}, &other, "ready", false},
		{"completed", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), &self, "done", false},
		{"rejected", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), &self, "rejected", false},
		{"withdrawn", workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), &self, "withdrawn", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task := &biz.WorkflowTask{ID: 42, TaskName: "工程资料", OwnerRoleKey: biz.EngineeringRoleKey, AssigneeID: tc.assignee, TaskStatusKey: tc.status, SourceType: "sales_order", SourceID: 1}
			repo := &taskLinkTestRepo{stubWorkflowJSONRPCRepo: stubWorkflowJSONRPCRepo{currentTask: task}}
			d, _ := workflowWorkbenchTestDispatcher(tc.admin, config)
			d.workflowUC = biz.NewWorkflowUsecase(repo)
			_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_link", "link", mustJSONRPCStruct(t, map[string]any{"task_id": 41}))
			if err != nil || result.Code != errcode.OK.Code || repo.view != biz.WorkflowHandlingChainLinkView {
				t.Fatalf("result=%v err=%v view=%v", result, err, repo.view)
			}
			item := result.Data.AsMap()["items"].([]any)[0].(map[string]any)
			if item["id"] != float64(42) || item["can_handle"] != tc.want || item["payload"] != nil {
				t.Fatalf("unexpected projection=%v", item)
			}
		})
	}
}

func TestWorkflowTaskLinkRejectsUnauthorizedAndForgedInput(t *testing.T) {
	for _, tc := range []struct {
		name   string
		admin  *biz.AdminUser
		ctx    context.Context
		params map[string]any
		code   int32
	}{
		{"unauthenticated", workflowJSONRPCAdmin(nil, biz.PermissionWorkflowTaskRead), context.Background(), map[string]any{"task_id": 1}, errcode.AuthRequired.Code},
		{"disabled", &biz.AdminUser{ID: 7, Disabled: true, Permissions: []string{biz.PermissionWorkflowTaskRead}}, workflowJSONRPCAdminContext(), map[string]any{"task_id": 1}, errcode.AdminDisabled.Code},
		{"no permission", workflowJSONRPCAdmin(nil), workflowJSONRPCAdminContext(), map[string]any{"task_id": 1}, errcode.PermissionDenied.Code},
		{"forged role", workflowJSONRPCAdmin(nil, biz.PermissionWorkflowTaskRead), workflowJSONRPCAdminContext(), map[string]any{"task_id": 1, "owner_role_key": "boss"}, errcode.InvalidParam.Code},
		{"invalid identity", workflowJSONRPCAdmin(nil, biz.PermissionWorkflowTaskRead), workflowJSONRPCAdminContext(), map[string]any{"task_id": "1"}, errcode.InvalidParam.Code},
		{"invalid page", workflowJSONRPCAdmin(nil, biz.PermissionWorkflowTaskRead), workflowJSONRPCAdminContext(), map[string]any{"task_id": 1, "offset": -1}, errcode.InvalidParam.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d, _ := workflowWorkbenchTestDispatcher(tc.admin, nil)
			repo := &taskLinkTestRepo{}
			d.workflowUC = biz.NewWorkflowUsecase(repo)
			_, result, err := d.handleWorkflow(tc.ctx, "get_task_link", "link", mustJSONRPCStruct(t, tc.params))
			if err != nil || result.Code != tc.code || repo.calls != 0 {
				t.Fatalf("result=%v err=%v calls=%d", result, err, repo.calls)
			}
		})
	}
}
