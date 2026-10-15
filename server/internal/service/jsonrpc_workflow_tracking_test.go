package service

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

type trackingJSONRPCRepo struct {
	stubWorkflowJSONRPCRepo
	query biz.WorkflowTrackingQuery
	calls int
	entry *biz.WorkflowTrackingEntry
}

func TestWorkflowTrackingTaskExposesApprovalTypeWithoutMutationData(t *testing.T) {
	capability := biz.PermissionWorkflowTaskApprove
	task := &biz.WorkflowTask{ID: 1, RequiredCapabilityKey: &capability, Payload: map[string]any{"private": true}}
	value := workflowTrackingTask(task, &biz.WorkflowTrackingEntry{})
	if value["required_capability_key"] != capability || value["payload"] != nil {
		t.Fatalf("invalid tracking approval projection: %#v", value)
	}
	task.RequiredCapabilityKey = nil
	if value = workflowTrackingTask(task, &biz.WorkflowTrackingEntry{}); value["required_capability_key"] != nil {
		t.Fatalf("untyped task must not imply an approval: %#v", value)
	}
}

func (r *trackingJSONRPCRepo) ListWorkflowTracking(_ context.Context, q biz.WorkflowTrackingQuery) (*biz.WorkflowTrackingPage, error) {
	r.query, r.calls = q, r.calls+1
	return &biz.WorkflowTrackingPage{Items: []*biz.WorkflowTrackingEntry{r.entry}, Total: 1}, nil
}

func (r *trackingJSONRPCRepo) GetWorkflowTracking(_ context.Context, q biz.WorkflowTrackingQuery, _ biz.WorkflowTrackingRef, _ int) (*biz.WorkflowTrackingEntry, error) {
	r.query, r.calls = q, r.calls+1
	return r.entry, nil
}

func TestWorkflowTrackingRPCRejectsInvalidAndForgedQueries(t *testing.T) {
	repo := &trackingJSONRPCRepo{}
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), workflowUC: biz.NewWorkflowUsecase(repo), customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")}
	d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)}
	for _, test := range []struct {
		method string
		params map[string]any
	}{
		{"list_tracking", map[string]any{"actor_id": 8}},
		{"list_tracking", map[string]any{"scope": "anyone"}},
		{"list_tracking", map[string]any{"limit": 51}},
		{"list_tracking", map[string]any{"source_id": 1}},
		{"list_tracking", map[string]any{"cursor": "obsolete"}},
		{"list_tracking", map[string]any{"offset": -1}},
		{"list_tracking", map[string]any{"offset": 1.2}},
		{"list_tracking", map[string]any{"offset": "20"}},
		{"list_tracking", map[string]any{"offset": true}},
		{"list_tracking", map[string]any{"offset": nil}},
		{"list_tracking", map[string]any{"offset": 9007199254740992}},
		{"list_tracking", map[string]any{"limit": 0}},
		{"list_tracking", map[string]any{"limit": 1.2}},
		{"list_tracking", map[string]any{"limit": "20"}},
		{"list_tracking", map[string]any{"limit": true}},
		{"get_tracking", map[string]any{"kind": "process", "id": 1.2}},
		{"get_tracking", map[string]any{"kind": "process", "id": "1"}},
		{"get_tracking", map[string]any{"kind": "process", "id": 1, "before_event_id": -1}},
		{"get_tracking", map[string]any{"kind": "unknown", "id": 1}},
		{"get_tracking", map[string]any{"kind": "process", "id": 1, "actor_id": 8}},
	} {
		params, _ := structpb.NewStruct(test.params)
		_, result, err := d.handleWorkflow(workflowJSONRPCAdminContext(), test.method, "tracking", params)
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("params=%v result=%v err=%v", test.params, result, err)
		}
	}
	if repo.calls != 0 {
		t.Fatalf("invalid requests reached reader: %d", repo.calls)
	}
}

func TestWorkflowTrackingRPCPermissionAndSummaryBoundary(t *testing.T) {
	actor, nodeID, processID := 7, 2, 1
	now := time.Date(2026, 10, 7, 10, 0, 0, 0, time.UTC)
	task := &biz.WorkflowTask{ID: 3, TaskName: "销售审批", TaskStatusKey: "ready", OwnerRoleKey: "boss", AssigneeID: &actor, ProcessNodeInstanceID: &nodeID, Payload: map[string]any{"bank_account": "secret"}}
	repo := &trackingJSONRPCRepo{entry: &biz.WorkflowTrackingEntry{
		Ref:      biz.WorkflowTrackingRef{Kind: "process", ID: processID},
		Instance: &biz.ProcessInstance{ID: processID, ProcessKey: biz.ProcessKeySalesOrderAcceptance, Status: "active", StartedAt: now, CreatedBy: &actor},
		Nodes:    []*biz.ProcessNodeInstance{{ID: nodeID, ProcessInstanceID: processID, Status: "active", PolicySnapshot: map[string]any{"secret": true}}},
		Tasks:    []*biz.WorkflowTask{task}, People: map[int]string{7: "销售小李"},
		InitiatorRoleKey: biz.SalesRoleKey,
		DisplayContext:   &biz.WorkflowTaskDisplayContext{Available: true, SourceNo: "SO-TRACK", Items: []biz.WorkflowTaskDisplayItem{{Kind: "product", ProductID: 12, ImageAttachmentID: 18, Name: "小熊", Code: "BEAR", StyleNo: "STYLE"}}},
		Events:           []*biz.WorkflowTaskEvent{{ID: 1, TaskID: 3, EventType: "created", ActorDisplayName: "销售小李", Payload: map[string]any{"receipt": "secret"}, CreatedAt: now}},
	}}
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), workflowUC: biz.NewWorkflowUsecase(repo), customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")}
	for _, test := range []struct {
		name  string
		admin *biz.AdminUser
		ctx   context.Context
		code  int32
	}{
		{"reader", workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead), workflowJSONRPCAdminContext(), errcode.OK.Code},
		{"super admin", &biz.AdminUser{ID: 7, IsSuperAdmin: true}, workflowJSONRPCAdminContext(), errcode.OK.Code},
		{"no permission", workflowJSONRPCAdmin([]string{biz.SalesRoleKey}), workflowJSONRPCAdminContext(), errcode.PermissionDenied.Code},
		{"disabled", &biz.AdminUser{ID: 7, Disabled: true, Permissions: []string{biz.PermissionWorkflowTaskRead}}, workflowJSONRPCAdminContext(), errcode.AdminDisabled.Code},
	} {
		t.Run(test.name, func(t *testing.T) {
			d.adminReader = stubAdminAccountReader{admin: test.admin}
			for _, method := range []string{"get_tracking", "list_tracking"} {
				input := map[string]any{"scope": "started"}
				if method == "get_tracking" {
					input = map[string]any{"kind": "process", "id": 1}
				}
				params, _ := structpb.NewStruct(input)
				_, result, err := d.handleWorkflow(test.ctx, method, "tracking", params)
				if err != nil || result == nil || result.Code != test.code {
					t.Fatalf("result=%v err=%v", result, err)
				}
				if result.Code != errcode.OK.Code {
					continue
				}
				if repo.query.ActorID != 7 || repo.query.VisibilityScope == nil {
					t.Fatalf("missing authenticated scope: %#v", repo.query)
				}
				if method == "list_tracking" {
					page := result.Data.AsMap()
					if page["total"] != float64(1) || page["limit"] != float64(20) || page["offset"] != float64(0) || page["has_more"] != nil || page["next_cursor"] != nil {
						t.Fatalf("invalid pagination contract: %#v", page)
					}
				}
				raw, _ := json.Marshal(result.Data.AsMap())
				if strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "payload") || !strings.Contains(string(raw), "销售小李") {
					t.Fatalf("unsafe or incomplete projection: %s", raw)
				}
				if !strings.Contains(string(raw), `"display_context"`) || !strings.Contains(string(raw), `"image_attachment_id":18`) || !strings.Contains(string(raw), `"name":"小熊"`) {
					t.Fatalf("missing source identity: %s", raw)
				}
				if !strings.Contains(string(raw), `"initiator_role_key":"sales"`) {
					t.Fatalf("missing initiation identity: %s", raw)
				}
			}
		})
	}
	params, _ := structpb.NewStruct(map[string]any{"kind": "process", "id": 1})
	_, result, err := d.handleWorkflow(context.Background(), "get_tracking", "tracking", params)
	if err != nil || result == nil || result.Code == errcode.OK.Code {
		t.Fatalf("anonymous read result=%v err=%v", result, err)
	}
}

func TestWorkflowTrackingCurrentTaskAccessMatchesTaskEndpoints(t *testing.T) {
	other, self := 9, 7
	configUC := workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")
	for _, tc := range []struct {
		name       string
		admin      *biz.AdminUser
		changeTask func(*biz.WorkflowTask)
		canRead    bool
		canHandle  bool
	}{
		{name: "tracking participant only", admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)},
		{name: "supervision does not grant task detail", admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskSupervise)},
		{name: "read only owner", admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead), canRead: true},
		{name: "handling owner", admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), canRead: true, canHandle: true},
		{name: "assigned to someone else", admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), changeTask: func(task *biz.WorkflowTask) { task.AssigneeID = &other }, canRead: true},
		{name: "assigned to viewer", admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), changeTask: func(task *biz.WorkflowTask) { task.AssigneeID = &self }, canRead: true, canHandle: true},
		{name: "super admin without handling role", admin: &biz.AdminUser{ID: 7, IsSuperAdmin: true}, canRead: true},
		{name: "super admin respects assignee", admin: &biz.AdminUser{ID: 7, IsSuperAdmin: true}, changeTask: func(task *biz.WorkflowTask) { task.AssigneeID = &other }, canRead: true},
		{name: "blocked cannot complete", admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), changeTask: func(task *biz.WorkflowTask) { task.TaskStatusKey = "blocked" }, canRead: true},
		{name: "blocked can resume", admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate), changeTask: func(task *biz.WorkflowTask) { task.TaskStatusKey = "blocked" }, canRead: true, canHandle: true},
		{name: "source read required", admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete), changeTask: func(task *biz.WorkflowTask) { task.TaskGroup = biz.WorkflowFollowupTaskGroup }, canRead: true},
		{name: "incomplete frozen anchor", admin: &biz.AdminUser{ID: 7, IsSuperAdmin: true}, changeTask: func(task *biz.WorkflowTask) { task.ProcessInstanceID = &other }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task := &biz.WorkflowTask{ID: 11, TaskName: "工程资料", OwnerRoleKey: biz.EngineeringRoleKey, TaskStatusKey: "ready", SourceType: "sales_order", SourceID: 1}
			if tc.changeTask != nil {
				tc.changeTask(task)
			}
			repo := &trackingJSONRPCRepo{stubWorkflowJSONRPCRepo: stubWorkflowJSONRPCRepo{currentTask: task}, entry: &biz.WorkflowTrackingEntry{Ref: biz.WorkflowTrackingRef{Kind: "task", ID: task.ID}, Task: task, Tasks: []*biz.WorkflowTask{task}}}
			d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), adminReader: stubAdminAccountReader{admin: tc.admin}, workflowUC: biz.NewWorkflowUsecase(repo), customerConfigUC: configUC}
			ctx := workflowJSONRPCAdminContext()
			_, tracking, err := d.handleWorkflow(ctx, "get_tracking", "access", mustJSONRPCStruct(t, map[string]any{"kind": "task", "id": task.ID}))
			if err != nil || tracking.Code != errcode.OK.Code {
				t.Fatalf("tracking=%v err=%v", tracking, err)
			}
			access := tracking.Data.AsMap()["tracking"].(map[string]any)["current_task_access"].([]any)
			if len(access) != 1 {
				t.Fatalf("access=%v", access)
			}
			projected := access[0].(map[string]any)
			if projected["task_id"] != float64(task.ID) || projected["can_read"] != tc.canRead || projected["can_handle"] != tc.canHandle || len(projected) != 3 {
				t.Fatalf("unexpected permission projection: %v", projected)
			}
			params := mustJSONRPCStruct(t, map[string]any{"task_id": task.ID})
			_, read, err := d.handleWorkflow(ctx, "get_task", "read", params)
			if err != nil || (read.Code == errcode.OK.Code) != tc.canRead {
				t.Fatalf("task read differs from tracking: %v err=%v", read, err)
			}
			if tc.canRead {
				_, explain, err := d.handleWorkflow(ctx, "explain_action_access", "explain", params)
				if err != nil || explain.Code != errcode.OK.Code {
					t.Fatalf("action access=%v err=%v", explain, err)
				}
				canHandle := false
				for _, raw := range explain.Data.AsMap()["actions"].([]any) {
					action := raw.(map[string]any)
					canHandle = canHandle || action["action_key"] != "urge" && action["allowed"] == true
				}
				if canHandle != tc.canHandle {
					t.Fatalf("handling projection differs from action access: %v", explain)
				}
			}
		})
	}
}

func TestWorkflowTrackingAccessIncludesOnlyCurrentTasks(t *testing.T) {
	active, completed, waiting := 1, 2, 3
	entry := &biz.WorkflowTrackingEntry{
		Ref: biz.WorkflowTrackingRef{Kind: "process", ID: 10}, Instance: &biz.ProcessInstance{ID: 10},
		Nodes: []*biz.ProcessNodeInstance{{ID: active, Status: "active"}, {ID: completed, Status: "completed"}, {ID: waiting, Status: "waiting"}},
		Tasks: []*biz.WorkflowTask{
			{ID: 11, TaskStatusKey: "ready", ProcessNodeInstanceID: &active},
			{ID: 12, TaskStatusKey: "blocked", ProcessNodeInstanceID: &active},
			{ID: 13, TaskStatusKey: "done", ProcessNodeInstanceID: &completed},
			{ID: 14, TaskStatusKey: "ready", ProcessNodeInstanceID: &waiting},
		},
	}
	d := &jsonrpcDispatcher{}
	detail := d.workflowTrackingDetail(context.Background(), &biz.AdminUser{ID: 7}, entry)
	access := detail["current_task_access"].([]any)
	if len(access) != 2 || access[0].(map[string]any)["task_id"] != 11 || access[1].(map[string]any)["task_id"] != 12 {
		t.Fatalf("unexpected current task access: %v", access)
	}
	entry.Tasks = nil
	if access = d.workflowTrackingDetail(context.Background(), &biz.AdminUser{ID: 7}, entry)["current_task_access"].([]any); len(access) != 0 {
		t.Fatalf("completed flow exposes a task entry: %v", access)
	}
}

func TestWorkflowTrackingAccessUsesFrozenRevisionAndFailsClosed(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), customerConfigUC: workflowTaskRevisionCustomerConfigUC(), adminReader: stubAdminAccountReader{admin: admin}}
	process, node, assignee := 11, 12, admin.ID
	for _, tc := range []struct {
		revision string
		canRead  bool
	}{{"rev-a", true}, {"rev-b", false}, {"published-only", false}, {"unknown", false}} {
		t.Run(tc.revision, func(t *testing.T) {
			task := &biz.WorkflowTask{ID: 701, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, AssigneeID: &assignee, ConfigRevision: &tc.revision, ProcessInstanceID: &process, ProcessNodeInstanceID: &node}
			access := d.workflowTrackingTaskAccess(workflowJSONRPCAdminContext(), admin, task)
			// Even a visible frozen task cannot be handled when its source cannot be resolved.
			if access["can_read"] != tc.canRead || access["can_handle"] != false {
				t.Fatalf("invalid revision/source access: %v", access)
			}
		})
	}
}
