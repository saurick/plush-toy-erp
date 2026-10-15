package service

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/errcode"
)

type followupServiceRepo struct {
	stubWorkflowJSONRPCRepo
	source *biz.WorkflowFollowupSource
	replay *biz.WorkflowTask
}

func (r *followupServiceRepo) GetWorkflowFollowupSource(_ context.Context, sourceType string, sourceID int) (*biz.WorkflowFollowupSource, error) {
	if r.source == nil || sourceType != r.source.Type || sourceID != r.source.ID {
		return nil, biz.ErrWorkflowTaskNotFound
	}
	return r.source, nil
}
func (r *followupServiceRepo) ResolveWorkflowFollowupCreate(_ context.Context, _ int, _, _ string) (*biz.WorkflowTask, bool, error) {
	return r.replay, r.replay != nil, nil
}

type followupDirectory struct {
	biz.AdminManageRepo
	admins []*biz.AdminUser
}

func (r *followupDirectory) ListAdmins(context.Context) ([]*biz.AdminUser, error) {
	return r.admins, nil
}
func (r *followupDirectory) GetAdminByID(_ context.Context, id int) (*biz.AdminUser, error) {
	for _, admin := range r.admins {
		if admin.ID == id {
			return admin, nil
		}
	}
	return nil, biz.ErrAdminNotFound
}

func TestWorkflowFollowupPublicCreateAuthorizationAndReplay(t *testing.T) {
	actor := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskCreate, biz.PermissionSalesOrderRead)
	target := workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate, biz.PermissionWorkflowTaskComplete, biz.PermissionSalesOrderRead)
	target.ID = 8
	disabled := *target
	disabled.ID = 9
	disabled.Disabled = true
	directory := &followupDirectory{admins: []*biz.AdminUser{actor, target, &disabled}}
	repo := &followupServiceRepo{source: &biz.WorkflowFollowupSource{ID: 10, Type: "sales_order", No: "SO-FOLLOWUP", Status: "active"}}
	logger := log.NewStdLogger(io.Discard)
	d := &jsonrpcDispatcher{log: log.NewHelper(logger), workflowUC: biz.NewWorkflowUsecase(repo), adminManageUC: biz.NewAdminManageUsecase(directory, logger, nil), adminReader: directory, customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")}
	ctx := workflowJSONRPCAdminContext()
	_, options, err := d.handleWorkflow(ctx, "get_task_create_options", "options", mustJSONRPCStruct(t, map[string]any{"source_type": "sales_order", "source_id": 10}))
	if err != nil || options.Code != errcode.OK.Code {
		t.Fatalf("options=%v err=%v", options, err)
	}
	data := options.Data.AsMap()
	roles := data["roles"].([]any)
	if data["can_create"] != true || len(roles) != 1 || len(roles[0].(map[string]any)["assignees"].([]any)) != 1 {
		t.Fatalf("ineligible recipients leaked: %#v", data)
	}
	valid := func() map[string]any {
		return map[string]any{"source_type": "sales_order", "source_id": 10, "task_name": "确认包装尺寸", "description": "请反馈最终尺寸", "owner_role_key": biz.QualityRoleKey, "assignee_id": 8, "due_at": time.Now().Add(time.Hour).Unix(), "priority": 0, "idempotency_key": "service-followup"}
	}
	_, created, err := d.handleWorkflow(ctx, "create_followup_task", "create", mustJSONRPCStruct(t, valid()))
	if err != nil || created.Code != errcode.OK.Code || repo.createInput == nil || repo.createInput.TaskGroup != biz.WorkflowFollowupTaskGroup {
		t.Fatalf("create=%v err=%v", created, err)
	}
	for _, tc := range []struct {
		key   string
		value any
	}{{"source_id", 10.5}, {"assignee_id", 8.5}, {"assignee_id", 9}, {"priority", 0.5}, {"source_no", "FORGED"}, {"process_instance_id", 1}, {"idempotency_key", ""}, {"owner_role_key", biz.FinanceRoleKey}} {
		params := valid()
		params[tc.key] = tc.value
		repo.createInput = nil
		_, result, err := d.handleWorkflow(ctx, "create_followup_task", "invalid", mustJSONRPCStruct(t, params))
		if err != nil || result.Code == errcode.OK.Code || repo.createInput != nil {
			t.Fatalf("accepted %s=%v result=%v err=%v", tc.key, tc.value, result, err)
		}
	}
	repo.source.Status = "closed"
	_, closed, _ := d.handleWorkflow(ctx, "create_followup_task", "closed", mustJSONRPCStruct(t, valid()))
	if closed.Code == errcode.OK.Code {
		t.Fatal("closed source accepted")
	}
	repo.replay = &biz.WorkflowTask{ID: 99, TaskStatusKey: "ready"}
	_, replay, err := d.handleWorkflow(ctx, "create_followup_task", "replay", mustJSONRPCStruct(t, valid()))
	if err != nil || replay.Code != errcode.OK.Code || replay.Data.AsMap()["task"].(map[string]any)["id"] != float64(99) {
		t.Fatalf("lost response cannot replay after source closure: %v %v", replay, err)
	}
	actor.Permissions = []string{biz.PermissionWorkflowTaskRead, biz.PermissionSalesOrderRead}
	_, denied, _ := d.handleWorkflow(ctx, "create_followup_task", "denied", mustJSONRPCStruct(t, valid()))
	if denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("missing create permission: %v", denied)
	}
	actor.Permissions = []string{biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskCreate}
	_, denied, _ = d.handleWorkflow(ctx, "get_task_create_options", "denied-source", mustJSONRPCStruct(t, map[string]any{"source_type": "sales_order", "source_id": 10}))
	if denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("missing source permission: %v", denied)
	}
}

func TestWorkflowFollowupCreatorCanTrackButCannotCompleteOtherRole(t *testing.T) {
	creator := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate, biz.PermissionWorkflowTaskComplete)
	id := creator.ID
	task := &biz.WorkflowTask{ID: 1, TaskGroup: biz.WorkflowFollowupTaskGroup, CreatedBy: &id, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey}
	roles := []string{biz.SalesRoleKey}
	if !workflowAdminCanViewTask(creator, task, roles) || !workflowAdminCanUrgeTask(creator, task, roles) || workflowAdminCanHandleTask(creator, task, "done", roles) {
		t.Fatal("creator rights do not preserve receiver boundary")
	}
	task.TaskStatusKey = "done"
	if !workflowAdminCanViewTask(creator, task, roles) || workflowAdminCanUrgeTask(creator, task, roles) {
		t.Fatal("ended task cannot be tracked correctly")
	}
	task.TaskGroup = "other_task"
	if workflowAdminCanViewTask(creator, task, roles) {
		t.Fatal("creator privilege leaked to other task group")
	}
}
