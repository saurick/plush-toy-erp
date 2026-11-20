package service

import (
	"context"
	"server/internal/biz"
	"server/internal/errcode"
	"testing"
)

type handlingChainJSONRPCRepo struct {
	stubWorkflowJSONRPCRepo
	calls  int
	taskID int
	scope  *biz.WorkflowTaskVisibilityScope
	view   biz.WorkflowHandlingChainView
}

func (r *handlingChainJSONRPCRepo) GetWorkflowHandlingChain(_ context.Context, taskID int, view biz.WorkflowHandlingChainView, scope *biz.WorkflowTaskVisibilityScope) (*biz.WorkflowHandlingChain, error) {
	r.calls++
	r.taskID = taskID
	r.scope = scope
	r.view = view
	return &biz.WorkflowHandlingChain{Items: []biz.WorkflowHandlingChainItem{{ID: taskID, Name: "检查裁片", Status: "ready", OwnerRoleKey: biz.SalesRoleKey, ExceptionID: 9, ExceptionNo: "EX-9", ExceptionOperationCode: biz.ProductionWIPOperationFabricProcessing}}}, nil
}

func TestWorkflowHandlingChainEnforcesReadPermissionAndStrictIdentity(t *testing.T) {
	for _, hasRead := range []bool{false, true} {
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey})
		if hasRead {
			admin = workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)
		}
		d, _ := workflowWorkbenchTestDispatcher(admin, nil)
		repo := &handlingChainJSONRPCRepo{}
		d.workflowUC = biz.NewWorkflowUsecase(repo)
		for _, params := range []map[string]any{{}, {"task_id": 0}, {"task_id": 1.5}, {"task_id": "1"}, {"task_id": true}, {"task_id": 1, "owner_role_key": "boss"}, {"task_id": 1, "view": "all"}, {"task_id": 1, "view": ""}, {"task_id": 1, "view": true}, {"task_id": 1, "view": nil}} {
			_, res, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_handling_chain", "chain", mustJSONRPCStruct(t, params))
			want := errcode.PermissionDenied.Code
			if hasRead {
				want = errcode.InvalidParam.Code
			}
			if err != nil || res == nil || res.Code != want {
				t.Fatalf("read=%v params=%v result=%v err=%v", hasRead, params, res, err)
			}
		}
		if repo.calls != 0 {
			t.Fatal("invalid request reached chain reader")
		}
		_, res, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_handling_chain", "chain", mustJSONRPCStruct(t, map[string]any{"task_id": 41}))
		if !hasRead {
			if err != nil || res.Code != errcode.PermissionDenied.Code || repo.calls != 0 {
				t.Fatalf("missing permission=%v %v", res, err)
			}
			continue
		}
		if err != nil || res.Code != errcode.OK.Code || repo.calls != 1 || repo.taskID != 41 || repo.scope == nil || repo.scope.StandaloneAllowAllOwnerRoles || repo.view != biz.WorkflowHandlingChainTaskView {
			t.Fatalf("success=%v err=%v repo=%+v", res, err, repo)
		}
		items := res.Data.AsMap()["items"].([]any)
		if items[0].(map[string]any)["exception_no"] != "EX-9" {
			t.Fatal("exception branch identity lost")
		}
		_, res, err = d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_handling_chain", "chain", mustJSONRPCStruct(t, map[string]any{"task_id": 41, "view": "order"}))
		if err != nil || res.Code != errcode.OK.Code || repo.view != biz.WorkflowHandlingChainOrderView || repo.scope.StandaloneAllowAllOwnerRoles {
			t.Fatalf("order overview must retain task visibility: %v %v", res, err)
		}
	}
}
