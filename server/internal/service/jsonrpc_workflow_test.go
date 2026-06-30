package service

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/errcode"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubWorkflowJSONRPCRepo struct {
	createInput        *biz.WorkflowTaskCreate
	createActorID      int
	urgeInput          *biz.WorkflowTaskUrge
	urgeActorID        int
	urgeActorRoleKey   string
	updateInput        *biz.WorkflowTaskStatusUpdate
	updateActorID      int
	updateActorRoleKey string
	upsertStateInput   *biz.WorkflowBusinessStateUpsert
	upsertStateActorID int
	currentTask        *biz.WorkflowTask
	listTaskFilter     biz.WorkflowTaskFilter
}

type stubProcessRuntimeJSONRPCRepo struct {
	node             *biz.ProcessNodeInstance
	completedNode    *biz.ProcessNodeInstanceComplete
	completedProcess *biz.ProcessInstanceComplete
	blockedNode      *biz.ProcessNodeInstanceBlock
	blockedProcess   *biz.ProcessInstanceBlock
	createdAttempt   *biz.ProcessNodeInstanceAttemptCreate
}

func workflowJSONRPCAdmin(roleKeys []string, permissionKeys ...string) *biz.AdminUser {
	roles := make([]biz.AdminRole, 0, len(roleKeys))
	for _, roleKey := range roleKeys {
		roles = append(roles, biz.AdminRole{Key: biz.NormalizeRoleKey(roleKey)})
	}
	return &biz.AdminUser{
		ID:          7,
		Username:    "admin",
		Roles:       roles,
		Permissions: biz.NormalizePermissionKeys(permissionKeys),
	}
}

func workflowJSONRPCAdminContext() context.Context {
	return biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
}

func workflowCustomerConfigUCWithWorkflowTasksState(t *testing.T, state string) *biz.CustomerConfigUsecase {
	t.Helper()
	uc := biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	in, ok := customerConfigPublishInputFromParams(
		customerConfigPublishParamsWithRevisionAndModuleState(
			t,
			customerConfigPublishParamsForRevision(t, "2026.06.30.workflow-tasks-"+state),
			"2026.06.30.workflow-tasks-"+state,
			workflowModuleKeyTasks,
			state,
		).AsMap(),
	)
	if !ok {
		t.Fatalf("invalid workflow customer config params")
	}
	if _, err := uc.PublishCustomerConfig(context.Background(), in, 1); err != nil {
		t.Fatalf("publish workflow customer config %s err = %v", in.Revision, err)
	}
	if _, err := uc.ActivateCustomerConfig(context.Background(), in.CustomerKey, in.Revision, 1); err != nil {
		t.Fatalf("activate workflow customer config %s err = %v", in.Revision, err)
	}
	return uc
}

func (s *stubWorkflowJSONRPCRepo) GetWorkflowTask(_ context.Context, id int) (*biz.WorkflowTask, error) {
	if s.currentTask != nil {
		return s.currentTask, nil
	}
	return &biz.WorkflowTask{
		ID:            id,
		TaskGroup:     "generic",
		SourceType:    "generic-source",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.SalesRoleKey,
		Payload:       map[string]any{},
	}, nil
}

func (s *stubWorkflowJSONRPCRepo) GetWorkflowTaskByTaskCode(_ context.Context, taskCode string) (*biz.WorkflowTask, error) {
	if s.currentTask != nil && strings.TrimSpace(s.currentTask.TaskCode) == strings.TrimSpace(taskCode) {
		return s.currentTask, nil
	}
	return nil, biz.ErrWorkflowTaskNotFound
}

func (s *stubWorkflowJSONRPCRepo) ListWorkflowTasks(_ context.Context, filter biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	s.listTaskFilter = filter
	return nil, 0, nil
}

func (s *stubWorkflowJSONRPCRepo) CreateWorkflowTask(_ context.Context, in *biz.WorkflowTaskCreate, actorID int) (*biz.WorkflowTask, error) {
	s.createInput = in
	s.createActorID = actorID
	return &biz.WorkflowTask{ID: 1, TaskStatusKey: in.TaskStatusKey, Payload: in.Payload}, nil
}

func (s *stubWorkflowJSONRPCRepo) UpdateWorkflowTaskStatus(_ context.Context, in *biz.WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	s.updateInput = in
	s.updateActorID = actorID
	s.updateActorRoleKey = actorRoleKey
	task := &biz.WorkflowTask{ID: in.ID, TaskStatusKey: in.TaskStatusKey, Payload: in.Payload}
	if s.currentTask != nil {
		task.TaskGroup = s.currentTask.TaskGroup
		task.SourceType = s.currentTask.SourceType
		task.SourceID = s.currentTask.SourceID
		task.SourceNo = s.currentTask.SourceNo
		task.OwnerRoleKey = s.currentTask.OwnerRoleKey
		task.OwnerPoolKey = s.currentTask.OwnerPoolKey
		task.RequiredCapabilityKey = s.currentTask.RequiredCapabilityKey
		task.ConfigRevision = s.currentTask.ConfigRevision
		task.ProcessInstanceID = s.currentTask.ProcessInstanceID
		task.ProcessNodeInstanceID = s.currentTask.ProcessNodeInstanceID
	}
	s.currentTask = task
	return task, nil
}

func (s *stubWorkflowJSONRPCRepo) UrgeWorkflowTask(_ context.Context, in *biz.WorkflowTaskUrge, actorID int, actorRoleKey string) (*biz.WorkflowTask, error) {
	s.urgeInput = in
	s.urgeActorID = actorID
	s.urgeActorRoleKey = actorRoleKey
	return &biz.WorkflowTask{
		ID:            in.ID,
		TaskCode:      "TASK-001",
		TaskGroup:     "shipment_release",
		TaskName:      "出货放行",
		SourceType:    "shipping-release",
		SourceID:      1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  "warehouse",
		Payload: map[string]any{
			"urged":            true,
			"urge_count":       1,
			"last_urge_reason": in.Reason,
		},
	}, nil
}

func (s *stubWorkflowJSONRPCRepo) ListWorkflowBusinessStates(context.Context, biz.WorkflowBusinessStateFilter) ([]*biz.WorkflowBusinessState, int, error) {
	return nil, 0, nil
}

func (s *stubWorkflowJSONRPCRepo) UpsertWorkflowBusinessState(_ context.Context, in *biz.WorkflowBusinessStateUpsert, actorID int) (*biz.WorkflowBusinessState, error) {
	s.upsertStateInput = in
	s.upsertStateActorID = actorID
	return &biz.WorkflowBusinessState{ID: 1, BusinessStatusKey: in.BusinessStatusKey, Payload: in.Payload}, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) CreateProcessInstance(context.Context, *biz.ProcessInstanceCreate, int) (*biz.ProcessInstance, []*biz.ProcessNodeInstance, error) {
	return nil, nil, biz.ErrBadParam
}

func (s *stubProcessRuntimeJSONRPCRepo) GetProcessInstance(context.Context, int) (*biz.ProcessInstance, error) {
	return nil, biz.ErrProcessInstanceNotFound
}

func (s *stubProcessRuntimeJSONRPCRepo) GetProcessNodeInstance(_ context.Context, id int) (*biz.ProcessNodeInstance, error) {
	if s.node != nil && s.node.ID == id {
		return s.node, nil
	}
	return nil, biz.ErrProcessNodeInstanceNotFound
}

func (s *stubProcessRuntimeJSONRPCRepo) ListProcessNodeInstances(context.Context, int) ([]*biz.ProcessNodeInstance, error) {
	if s.node != nil {
		return []*biz.ProcessNodeInstance{s.node}, nil
	}
	return []*biz.ProcessNodeInstance{}, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) CompleteProcessNodeInstance(_ context.Context, in *biz.ProcessNodeInstanceComplete, actorID int) (*biz.ProcessNodeInstance, error) {
	s.completedNode = in
	if s.node == nil || s.node.ID != in.ID {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	if s.node.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	out := *s.node
	out.Status = biz.ProcessNodeStatusCompleted
	out.Version = in.ExpectedVersion + 1
	out.Outcome = &in.Outcome
	s.node = &out
	return &out, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) CompleteProcessInstance(_ context.Context, in *biz.ProcessInstanceComplete, actorID int) (*biz.ProcessInstance, error) {
	s.completedProcess = in
	if in == nil || in.ID <= 0 {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	return &biz.ProcessInstance{ID: in.ID, Status: biz.ProcessStatusCompleted, CompletedAt: &now}, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) RecordProcessInstanceLinkedBusinessRef(_ context.Context, in *biz.ProcessInstanceLinkedBusinessRefRecord, actorID int) (*biz.ProcessInstance, error) {
	if in == nil || in.ProcessInstanceID <= 0 {
		return nil, biz.ErrBadParam
	}
	return &biz.ProcessInstance{ID: in.ProcessInstanceID}, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) BlockProcessNodeInstance(_ context.Context, in *biz.ProcessNodeInstanceBlock, actorID int) (*biz.ProcessNodeInstance, error) {
	s.blockedNode = in
	if s.node == nil || s.node.ID != in.ProcessNodeInstanceID {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	if s.node.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	out := *s.node
	out.Status = biz.ProcessNodeStatusBlocked
	out.Outcome = &in.Outcome
	s.node = &out
	return &out, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) BlockProcessInstance(_ context.Context, in *biz.ProcessInstanceBlock, actorID int) (*biz.ProcessInstance, error) {
	s.blockedProcess = in
	if in == nil || in.ID <= 0 {
		return nil, biz.ErrBadParam
	}
	return &biz.ProcessInstance{ID: in.ID, Status: biz.ProcessStatusBlocked}, nil
}

func (s *stubProcessRuntimeJSONRPCRepo) CreateProcessNodeInstanceAttempt(_ context.Context, in *biz.ProcessNodeInstanceAttemptCreate, actorID int) (*biz.ProcessNodeInstance, error) {
	s.createdAttempt = in
	return nil, biz.ErrBadParam
}

func (s *stubProcessRuntimeJSONRPCRepo) ActivateProcessNodeInstance(context.Context, *biz.ProcessNodeInstanceActivate, int) (*biz.ProcessNodeInstance, error) {
	return nil, biz.ErrBadParam
}

func TestJsonrpcDispatcher_WorkflowWriteAPIRequiresEnabledModule(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            42,
			TaskGroup:     "generic",
			SourceType:    "generic-source",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
	}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskCreate, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete, biz.PermissionWorkflowTaskUpdate)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(
			t,
			"read_only",
		),
	}
	ctx := workflowJSONRPCAdminContext()
	createParams := mustJSONRPCStruct(t, map[string]any{
		"task_code":       "WF-MODULE-001",
		"task_group":      "generic",
		"task_name":       "模块门禁测试任务",
		"source_type":     "generic-source",
		"source_id":       float64(1),
		"task_status_key": "ready",
		"owner_role_key":  biz.QualityRoleKey,
		"priority":        float64(1),
		"payload":         map[string]any{},
	})
	_, createReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "create_task", "read-only-create", createParams)
	if err != nil {
		t.Fatalf("expected nil err for read_only create gate, got %v", err)
	}
	if createReadOnlyRes == nil || createReadOnlyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only create rejected, got %#v", createReadOnlyRes)
	}
	if repo.createInput != nil {
		t.Fatalf("read_only workflow_tasks must not call create usecase, got %#v", repo.createInput)
	}
	completeParams := mustJSONRPCStruct(t, map[string]any{
		"task_id":    float64(42),
		"action_key": "complete",
		"payload":    map[string]any{},
	})
	_, completeReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "complete_task_action", "read-only-complete", completeParams)
	if err != nil {
		t.Fatalf("expected nil err for read_only complete gate, got %v", err)
	}
	if completeReadOnlyRes == nil || completeReadOnlyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only complete rejected, got %#v", completeReadOnlyRes)
	}
	if repo.updateInput != nil {
		t.Fatalf("read_only workflow_tasks must not call update usecase, got %#v", repo.updateInput)
	}
	upsertParams := mustJSONRPCStruct(t, map[string]any{
		"source_type":         "generic-source",
		"source_id":           float64(1),
		"business_status_key": "project_approved",
		"payload":             map[string]any{},
	})
	_, upsertReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "upsert_business_state", "read-only-upsert", upsertParams)
	if err != nil {
		t.Fatalf("expected nil err for read_only upsert gate, got %v", err)
	}
	if upsertReadOnlyRes == nil || upsertReadOnlyRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only upsert rejected, got %#v", upsertReadOnlyRes)
	}
	if repo.upsertStateInput != nil {
		t.Fatalf("read_only workflow_tasks must not call business state usecase, got %#v", repo.upsertStateInput)
	}
	_, listReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "list_tasks", "read-only-list", mustJSONRPCStruct(t, map[string]any{"limit": float64(10)}))
	if err != nil {
		t.Fatalf("expected nil err for read_only list, got %v", err)
	}
	if listReadOnlyRes == nil || listReadOnlyRes.Code != errcode.OK.Code {
		t.Fatalf("expected read_only list to stay readable, got %#v", listReadOnlyRes)
	}

	dispatcher.customerConfigUC = workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled")
	_, createEnabledRes, err := dispatcher.handleWorkflow(ctx, "create_task", "enabled-create", createParams)
	if err != nil {
		t.Fatalf("expected nil err for enabled create, got %v", err)
	}
	if createEnabledRes == nil || createEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled create OK, got %#v", createEnabledRes)
	}
	if repo.createInput == nil || repo.createInput.TaskCode != "WF-MODULE-001" {
		t.Fatalf("enabled workflow_tasks must call create usecase, got %#v", repo.createInput)
	}
	_, upsertEnabledRes, err := dispatcher.handleWorkflow(ctx, "upsert_business_state", "enabled-upsert", upsertParams)
	if err != nil {
		t.Fatalf("expected nil err for enabled upsert, got %v", err)
	}
	if upsertEnabledRes == nil || upsertEnabledRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled upsert OK, got %#v", upsertEnabledRes)
	}
	if repo.upsertStateInput == nil || repo.upsertStateInput.BusinessStatusKey != "project_approved" {
		t.Fatalf("enabled workflow_tasks must call business state usecase, got %#v", repo.upsertStateInput)
	}

	repo.urgeInput = nil
	dispatcher.customerConfigUC = workflowCustomerConfigUCWithWorkflowTasksState(t, "disabled")
	urgeParams := mustJSONRPCStruct(t, map[string]any{
		"task_id": float64(42),
		"action":  "urge_task",
		"reason":  "请复核",
		"payload": map[string]any{},
	})
	_, urgeDisabledRes, err := dispatcher.handleWorkflow(ctx, "urge_task", "disabled-urge", urgeParams)
	if err != nil {
		t.Fatalf("expected nil err for disabled urge gate, got %v", err)
	}
	if urgeDisabledRes == nil || urgeDisabledRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled urge rejected, got %#v", urgeDisabledRes)
	}
	if repo.urgeInput != nil {
		t.Fatalf("disabled workflow_tasks must not call urge usecase, got %#v", repo.urgeInput)
	}
}

func TestJsonrpcDispatcher_WorkflowUrgeTaskRecordsEventIntent(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionWorkflowTaskUpdate)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"task_id":        float64(1),
		"action":         "urge_task",
		"reason":         "请今天确认",
		"actor_role_key": "finance",
		"payload": map[string]any{
			"source_no": "SHIP-001",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(ctx, "urge_task", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.urgeInput == nil {
		t.Fatalf("expected urge input")
	}
	if repo.urgeInput.ID != 1 || repo.urgeInput.Action != "urge_task" {
		t.Fatalf("unexpected urge input %#v", repo.urgeInput)
	}
	if repo.urgeInput.Reason != "请今天确认" {
		t.Fatalf("expected reason, got %q", repo.urgeInput.Reason)
	}
	if repo.urgeActorID != 7 || repo.urgeActorRoleKey != "pmc" {
		t.Fatalf("expected actor 7/pmc, got %d/%q", repo.urgeActorID, repo.urgeActorRoleKey)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "ready" {
		t.Fatalf("expected returned ready task, got %#v", data["task"])
	}
}

func TestJsonrpcDispatcher_WorkflowListTasksPassesTaskGroupFilter(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"source_type": "shipping-release",
		"task_group":  "shipment_release",
		"limit":       float64(25),
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "list_tasks", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.listTaskFilter.SourceType != "shipping-release" {
		t.Fatalf("expected source_type filter, got %q", repo.listTaskFilter.SourceType)
	}
	if repo.listTaskFilter.TaskGroup != "shipment_release" {
		t.Fatalf("expected task_group filter, got %q", repo.listTaskFilter.TaskGroup)
	}
	if repo.listTaskFilter.Limit != 25 {
		t.Fatalf("expected limit 25, got %d", repo.listTaskFilter.Limit)
	}
	if len(repo.listTaskFilter.VisibleOwnerRoleKeys) != 1 || repo.listTaskFilter.VisibleOwnerRoleKeys[0] != biz.WarehouseRoleKey {
		t.Fatalf("expected warehouse visibility scope, got %#v", repo.listTaskFilter.VisibleOwnerRoleKeys)
	}
	if repo.listTaskFilter.VisibleAssigneeID == nil || *repo.listTaskFilter.VisibleAssigneeID != 7 {
		t.Fatalf("expected assignee visibility scope for admin 7, got %#v", repo.listTaskFilter.VisibleAssigneeID)
	}
}

func workflowCustomerConfigUCWithMemberships(memberships []biz.WorkPoolMembershipInput) *biz.CustomerConfigUsecase {
	entitlements := []biz.AccessEntitlementInput{}
	seen := map[string]bool{}
	for _, membership := range memberships {
		roleKey := biz.NormalizeRoleKey(membership.RoleKey)
		if roleKey == "" || seen[roleKey] {
			continue
		}
		seen[roleKey] = true
		for _, capabilityKey := range []string{
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskUpdate,
			biz.PermissionWorkflowTaskComplete,
			biz.PermissionWorkflowTaskReject,
		} {
			entitlements = append(entitlements, biz.AccessEntitlementInput{
				RoleKey:       roleKey,
				CapabilityKey: capabilityKey,
				ScopeType:     "customer",
				ScopeValue:    "yoyoosun",
				Enabled:       true,
			})
		}
	}
	return workflowCustomerConfigUCWithMembershipsAndEntitlements(memberships, entitlements)
}

func workflowCustomerConfigUCWithMembershipsAndEntitlements(memberships []biz.WorkPoolMembershipInput, entitlements []biz.AccessEntitlementInput) *biz.CustomerConfigUsecase {
	repo := newServiceCustomerConfigRepo()
	key := serviceCustomerConfigKey("yoyoosun", "workflow-visible-rev")
	repo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey:      "yoyoosun",
		Revision:         "workflow-visible-rev",
		ProductVersion:   "test",
		ConfigHash:       "workflow-visible-hash",
		Status:           biz.CustomerConfigStatusActive,
		CompiledSnapshot: map[string]any{"customer": map[string]any{"key": "yoyoosun"}},
	}
	repo.memberships[key] = append([]biz.WorkPoolMembershipInput(nil), memberships...)
	repo.entitlements[key] = append([]biz.AccessEntitlementInput(nil), entitlements...)
	repo.modules[key] = []biz.DeploymentModuleStateInput{{ModuleKey: workflowModuleKeyTasks, State: "enabled"}}
	return biz.NewCustomerConfigUsecase(repo)
}

func TestJsonrpcDispatcher_WorkflowListTasksIncludesCustomerWorkPoolScope(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithMemberships([]biz.WorkPoolMembershipInput{
			{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
		}),
	}
	params, err := structpb.NewStruct(map[string]any{"limit": float64(25)})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "list_tasks", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	got := map[string]bool{}
	for _, roleKey := range repo.listTaskFilter.VisibleOwnerRoleKeys {
		got[roleKey] = true
	}
	if !got[biz.SalesRoleKey] || !got[biz.WarehouseRoleKey] {
		t.Fatalf("expected sales and warehouse visibility, got %#v", repo.listTaskFilter.VisibleOwnerRoleKeys)
	}
	if got[biz.FinanceRoleKey] {
		t.Fatalf("finance visibility must not be added without matching responsibility pool")
	}
}

func TestJsonrpcDispatcher_WorkflowListTasksRequiresCustomerWorkPoolReadEntitlement(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithMembershipsAndEntitlements(
			[]biz.WorkPoolMembershipInput{
				{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
			},
			[]biz.AccessEntitlementInput{
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
			},
		),
	}
	params, err := structpb.NewStruct(map[string]any{"limit": float64(25)})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "list_tasks", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	got := map[string]bool{}
	for _, roleKey := range repo.listTaskFilter.VisibleOwnerRoleKeys {
		got[roleKey] = true
	}
	if got[biz.WarehouseRoleKey] {
		t.Fatalf("warehouse visibility must require same-role same-scope workflow.task.read entitlement, got %#v", repo.listTaskFilter.VisibleOwnerRoleKeys)
	}
}

func TestJsonrpcDispatcher_WorkflowActionAllowsCustomerWorkPoolScope(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "warehouse_inbound",
			SourceType:    "inbound",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithMemberships([]biz.WorkPoolMembershipInput{
			{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
		}),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id": float64(1),
		"payload": map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.updateInput == nil || repo.updateInput.TaskStatusKey != "done" {
		t.Fatalf("expected workflow status update, got %#v", repo.updateInput)
	}
	if repo.updateActorRoleKey != biz.WarehouseRoleKey {
		t.Fatalf("expected actor role from work pool owner, got %q", repo.updateActorRoleKey)
	}
}

func TestJsonrpcDispatcher_WorkflowActionRequiresCustomerWorkPoolActionEntitlement(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "warehouse_inbound",
			SourceType:    "inbound",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithMembershipsAndEntitlements(
			[]biz.WorkPoolMembershipInput{
				{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
			},
			[]biz.AccessEntitlementInput{
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
			},
		),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id": float64(1),
		"payload": map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", res)
	}
	if repo.updateInput != nil {
		t.Fatalf("task completion must not use another role or scope permission with work pool membership: %#v", repo.updateInput)
	}
}

func TestJsonrpcDispatcher_WorkflowUrgeTaskRejectsUnrelatedOrdinaryRole(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "warehouse_inbound",
			SourceType:    "accessories-purchase",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskUpdate)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id": float64(1),
		"action":  "urge_task",
		"reason":  "请今天确认",
		"payload": map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "urge_task", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", res)
	}
	if repo.urgeInput != nil {
		t.Fatalf("unrelated ordinary role must not record urge input")
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRequiresActionPermission(t *testing.T) {
	tests := []struct {
		name        string
		admin       *biz.AdminUser
		currentTask *biz.WorkflowTask
		nextStatus  string
		wantCode    int32
	}{
		{
			name:        "done requires complete",
			admin:       workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskUpdate),
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
			wantCode:    errcode.PermissionDenied.Code,
		},
		{
			name:        "rejected requires reject",
			admin:       workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskUpdate),
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "rejected",
			wantCode:    errcode.PermissionDenied.Code,
		},
		{
			name:        "boss approval done requires approve",
			admin:       workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionWorkflowTaskComplete),
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "order_approval", SourceType: "project-orders", TaskStatusKey: "ready", OwnerRoleKey: biz.BossRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
			wantCode:    errcode.PermissionDenied.Code,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{currentTask: tt.currentTask}
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: tt.admin},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
			}
			params, err := structpb.NewStruct(map[string]any{
				"id":              float64(1),
				"task_status_key": tt.nextStatus,
				"payload":         map[string]any{},
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != tt.wantCode {
				t.Fatalf("expected code %d, got %#v", tt.wantCode, res)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusEnforcesOwnerRoleBoundary(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "purchase_iqc",
			SourceType:    "accessories-purchase",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for mismatched owner role, got %#v", res)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusAllowsOwnerRoles(t *testing.T) {
	tests := []struct {
		name        string
		roleKey     string
		permissions []string
		currentTask *biz.WorkflowTask
		nextStatus  string
	}{
		{
			name:        "quality completes purchase IQC",
			roleKey:     biz.QualityRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "quality completes outsource return QC",
			roleKey:     biz.QualityRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 2, TaskGroup: "outsource_return_qc", SourceType: "processing-contracts", SourceID: 2, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "quality completes finished goods QC",
			roleKey:     biz.QualityRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 3, TaskGroup: "finished_goods_qc", SourceType: "production-progress", SourceID: 3, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "warehouse completes warehouse inbound",
			roleKey:     biz.WarehouseRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 4, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 4, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "warehouse completes finished goods inbound",
			roleKey:     biz.WarehouseRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 7, TaskGroup: "finished_goods_inbound", SourceType: "production-progress", SourceID: 7, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{"finished_goods": true}},
			nextStatus:  "done",
		},
		{
			name:        "warehouse completes shipment release",
			roleKey:     biz.WarehouseRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 9, TaskGroup: "shipment_release", SourceType: "shipping-release", SourceID: 9, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{"shipment_release": true}},
			nextStatus:  "done",
		},
		{
			name:        "boss approves order approval",
			roleKey:     biz.BossRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskApprove},
			currentTask: &biz.WorkflowTask{ID: 5, TaskGroup: "order_approval", SourceType: "project-orders", SourceID: 5, TaskStatusKey: "ready", OwnerRoleKey: biz.BossRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
		{
			name:        "production completes outsource rework",
			roleKey:     biz.ProductionRoleKey,
			permissions: []string{biz.PermissionWorkflowTaskComplete},
			currentTask: &biz.WorkflowTask{ID: 6, TaskGroup: "outsource_rework", SourceType: "processing-contracts", SourceID: 6, TaskStatusKey: "ready", OwnerRoleKey: biz.ProductionRoleKey, Payload: map[string]any{}},
			nextStatus:  "done",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{currentTask: tt.currentTask}
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{tt.roleKey}, tt.permissions...)},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
			}
			params, err := structpb.NewStruct(map[string]any{
				"id":              float64(tt.currentTask.ID),
				"task_status_key": tt.nextStatus,
				"payload":         map[string]any{},
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code {
				t.Fatalf("expected OK response, got %#v", res)
			}
			if repo.updateActorRoleKey != tt.roleKey {
				t.Fatalf("expected server-derived actor role %q, got %q", tt.roleKey, repo.updateActorRoleKey)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowCompleteTaskActionUsesDoneAndServerActorRole(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            42,
			TaskGroup:     "generic",
			SourceType:    "generic-source",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id":    float64(42),
		"action_key": "complete",
		"payload": map[string]any{
			"entry": "mobile_role_task",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.updateInput == nil || repo.updateInput.TaskStatusKey != "done" {
		t.Fatalf("expected complete_task_action to write done status, got %#v", repo.updateInput)
	}
	if repo.updateInput.BusinessStatusKey != "" {
		t.Fatalf("expected empty business status by default, got %q", repo.updateInput.BusinessStatusKey)
	}
	if repo.updateActorRoleKey != biz.QualityRoleKey {
		t.Fatalf("expected server-derived actor role %q, got %q", biz.QualityRoleKey, repo.updateActorRoleKey)
	}
}

func TestJsonrpcDispatcher_WorkflowCompleteTaskActionCompletesLinkedProcessNode(t *testing.T) {
	processID := 10
	nodeID := 20
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:                    42,
			TaskGroup:             "engineering_data",
			SourceType:            "project-orders",
			SourceID:              1001,
			TaskStatusKey:         "ready",
			OwnerRoleKey:          biz.EngineeringRoleKey,
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload:               map[string]any{},
		},
	}
	processRepo := &stubProcessRuntimeJSONRPCRepo{
		node: &biz.ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          biz.ProcessNodeTypeHumanTask,
			Status:            biz.ProcessNodeStatusActive,
			Version:           4,
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
		processRuntimeUC: biz.NewProcessRuntimeUsecase(processRepo, repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id":    float64(42),
		"action_key": "complete",
		"payload": map[string]any{
			"outcome": "ENGINEERING_DATA_READY",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if processRepo.completedNode == nil {
		t.Fatalf("expected linked process node completion")
	}
	if processRepo.completedNode.ID != nodeID || processRepo.completedNode.ProcessInstanceID != processID {
		t.Fatalf("unexpected process node completion input %#v", processRepo.completedNode)
	}
	if processRepo.completedNode.ExpectedVersion != 4 {
		t.Fatalf("expected version 4, got %#v", processRepo.completedNode)
	}
	if processRepo.completedNode.Outcome != "ENGINEERING_DATA_READY" {
		t.Fatalf("expected payload outcome copied, got %q", processRepo.completedNode.Outcome)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusDoesNotAutoCompleteLinkedProcessNode(t *testing.T) {
	processID := 10
	nodeID := 20
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:                    42,
			TaskGroup:             "engineering_data",
			SourceType:            "project-orders",
			SourceID:              1001,
			TaskStatusKey:         "ready",
			OwnerRoleKey:          biz.EngineeringRoleKey,
			ProcessInstanceID:     &processID,
			ProcessNodeInstanceID: &nodeID,
			Payload:               map[string]any{},
		},
	}
	processRepo := &stubProcessRuntimeJSONRPCRepo{
		node: &biz.ProcessNodeInstance{
			ID:                nodeID,
			ProcessInstanceID: processID,
			NodeType:          biz.ProcessNodeTypeHumanTask,
			Status:            biz.ProcessNodeStatusActive,
			Version:           4,
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
		processRuntimeUC: biz.NewProcessRuntimeUsecase(processRepo, repo),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(42),
		"task_status_key": "done",
		"payload": map[string]any{
			"outcome": "ENGINEERING_DATA_READY",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if processRepo.completedNode != nil {
		t.Fatalf("legacy update_task_status must not auto-complete linked process node: %#v", processRepo.completedNode)
	}
}

func TestJsonrpcDispatcher_WorkflowControlledTaskActionsUseServerStatusAndActorRole(t *testing.T) {
	tests := []struct {
		name           string
		method         string
		actionKey      string
		permission     string
		wantStatus     string
		wantBusiness   string
		reason         string
		successMessage string
	}{
		{
			name:           "block action writes blocked with reason",
			method:         "block_task_action",
			actionKey:      "block",
			permission:     biz.PermissionWorkflowTaskUpdate,
			wantStatus:     "blocked",
			wantBusiness:   "blocked",
			reason:         " 等待资料确认 ",
			successMessage: "任务阻塞已记录",
		},
		{
			name:           "reject action writes rejected with reason",
			method:         "reject_task_action",
			actionKey:      "reject",
			permission:     biz.PermissionWorkflowTaskReject,
			wantStatus:     "rejected",
			reason:         " 信息不完整 ",
			successMessage: "任务退回已记录",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{
				currentTask: &biz.WorkflowTask{
					ID:            43,
					TaskGroup:     "generic",
					SourceType:    "generic-source",
					SourceID:      1,
					TaskStatusKey: "ready",
					OwnerRoleKey:  biz.QualityRoleKey,
					Payload:       map[string]any{},
				},
			}
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, tt.permission)},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
			}
			params, err := structpb.NewStruct(map[string]any{
				"task_id":    float64(43),
				"action_key": tt.actionKey,
				"reason":     tt.reason,
				"payload": map[string]any{
					"entry": "mobile_role_task",
				},
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), tt.method, "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code || res.Message != tt.successMessage {
				t.Fatalf("expected OK response %q, got %#v", tt.successMessage, res)
			}
			if repo.updateInput == nil || repo.updateInput.TaskStatusKey != tt.wantStatus {
				t.Fatalf("expected %s to write status %q, got %#v", tt.method, tt.wantStatus, repo.updateInput)
			}
			if repo.updateInput.BusinessStatusKey != tt.wantBusiness {
				t.Fatalf("expected business status %q, got %q", tt.wantBusiness, repo.updateInput.BusinessStatusKey)
			}
			if repo.updateInput.Reason != strings.TrimSpace(tt.reason) {
				t.Fatalf("expected trimmed reason, got %q", repo.updateInput.Reason)
			}
			if repo.updateActorRoleKey != biz.QualityRoleKey {
				t.Fatalf("expected server-derived actor role %q, got %q", biz.QualityRoleKey, repo.updateActorRoleKey)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowControlledTaskActionsRejectRawStatusActorRoleAndInvalidAction(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		permission string
		params     map[string]any
	}{
		{
			name:       "complete rejects raw task status",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"task_id":         float64(1),
				"task_status_key": "done",
				"payload":         map[string]any{},
			},
		},
		{
			name:       "complete rejects client actor role",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"task_id":        float64(1),
				"action_key":     "complete",
				"actor_role_key": biz.FinanceRoleKey,
				"payload":        map[string]any{},
			},
		},
		{
			name:       "complete rejects unsupported action",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"task_id":    float64(1),
				"action_key": "block",
				"payload":    map[string]any{},
			},
		},
		{
			name:       "block requires reason",
			method:     "block_task_action",
			permission: biz.PermissionWorkflowTaskUpdate,
			params: map[string]any{
				"task_id":    float64(1),
				"action_key": "block",
				"reason":     " \t ",
				"payload":    map[string]any{},
			},
		},
		{
			name:       "reject rejects raw done status",
			method:     "reject_task_action",
			permission: biz.PermissionWorkflowTaskReject,
			params: map[string]any{
				"task_id":         float64(1),
				"task_status_key": "done",
				"action_key":      "reject",
				"reason":          "资料不全",
				"payload":         map[string]any{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{
				currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			}
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, tt.permission)},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
			}
			params, err := structpb.NewStruct(tt.params)
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), tt.method, "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code {
				t.Fatalf("expected invalid param, got %#v", res)
			}
			if repo.updateInput != nil {
				t.Fatalf("expected no status update, got %#v", repo.updateInput)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowExplainActionAccess(t *testing.T) {
	assigneeID := 7
	tests := []struct {
		name             string
		admin            *biz.AdminUser
		currentTask      *biz.WorkflowTask
		actionKey        string
		wantAllowed      bool
		wantReasonCode   string
		wantPermission   string
		wantActorRoleKey string
	}{
		{
			name:             "owner can complete with complete permission",
			admin:            workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete),
			currentTask:      &biz.WorkflowTask{ID: 71, TaskGroup: "purchase_iqc", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			actionKey:        "complete",
			wantAllowed:      true,
			wantReasonCode:   "allowed",
			wantPermission:   biz.PermissionWorkflowTaskComplete,
			wantActorRoleKey: biz.QualityRoleKey,
		},
		{
			name:             "reject explains missing reject permission",
			admin:            workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate),
			currentTask:      &biz.WorkflowTask{ID: 72, TaskGroup: "purchase_iqc", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			actionKey:        "reject",
			wantAllowed:      false,
			wantReasonCode:   "missing_permission",
			wantPermission:   biz.PermissionWorkflowTaskReject,
			wantActorRoleKey: biz.QualityRoleKey,
		},
		{
			name:             "assigned admin can complete without owner role",
			admin:            workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete),
			currentTask:      &biz.WorkflowTask{ID: 73, TaskGroup: "purchase_iqc", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, AssigneeID: &assigneeID, Payload: map[string]any{}},
			actionKey:        "complete",
			wantAllowed:      true,
			wantReasonCode:   "allowed",
			wantPermission:   biz.PermissionWorkflowTaskComplete,
			wantActorRoleKey: biz.FinanceRoleKey,
		},
		{
			name:             "terminal task explains readonly",
			admin:            workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete),
			currentTask:      &biz.WorkflowTask{ID: 74, TaskGroup: "purchase_iqc", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "done", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
			actionKey:        "complete",
			wantAllowed:      false,
			wantReasonCode:   "terminal_task",
			wantPermission:   biz.PermissionWorkflowTaskComplete,
			wantActorRoleKey: biz.QualityRoleKey,
		},
		{
			name:             "pmc can urge but cannot complete owner task",
			admin:            workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate),
			currentTask:      &biz.WorkflowTask{ID: 75, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{}},
			actionKey:        "urge",
			wantAllowed:      true,
			wantReasonCode:   "allowed",
			wantPermission:   biz.PermissionWorkflowTaskUpdate,
			wantActorRoleKey: biz.PMCRoleKey,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{currentTask: tt.currentTask}
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: tt.admin},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
			}
			params, err := structpb.NewStruct(map[string]any{
				"task_id":    float64(tt.currentTask.ID),
				"action_key": tt.actionKey,
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "explain_action_access", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code {
				t.Fatalf("expected OK response, got %#v", res)
			}
			action, ok := res.Data.AsMap()["action"].(map[string]any)
			if !ok {
				t.Fatalf("expected action explain map, got %#v", res.Data.AsMap())
			}
			if action["allowed"] != tt.wantAllowed {
				t.Fatalf("expected allowed=%v, got %#v", tt.wantAllowed, action["allowed"])
			}
			if action["reason_code"] != tt.wantReasonCode {
				t.Fatalf("expected reason_code %q, got %#v", tt.wantReasonCode, action["reason_code"])
			}
			if action["required_permission"] != tt.wantPermission {
				t.Fatalf("expected permission %q, got %#v", tt.wantPermission, action["required_permission"])
			}
			if action["actor_role_key"] != tt.wantActorRoleKey {
				t.Fatalf("expected actor_role_key %q, got %#v", tt.wantActorRoleKey, action["actor_role_key"])
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowExplainActionAccessReturnsAllActions(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            81,
			TaskGroup:     "purchase_iqc",
			SourceType:    "accessories-purchase",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete, biz.PermissionWorkflowTaskUpdate, biz.PermissionWorkflowTaskReject)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{"task_id": float64(81)})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "explain_action_access", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	actions, ok := res.Data.AsMap()["actions"].([]any)
	if !ok || len(actions) != 4 {
		t.Fatalf("expected four action explanations, got %#v", res.Data.AsMap()["actions"])
	}
}

func TestJsonrpcDispatcher_WorkflowExplainActionAccessExplainsWorkPoolEntitlement(t *testing.T) {
	tests := []struct {
		name                string
		entitlements        []biz.AccessEntitlementInput
		wantAllowed         bool
		wantActorRoleKey    string
		wantWorkPoolMatched bool
		wantVisibleOwner    bool
		wantScopeMatched    bool
	}{
		{
			name: "membership without same-scope action entitlement is visible for read but cannot complete",
			entitlements: []biz.AccessEntitlementInput{
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
			},
			wantAllowed:         false,
			wantActorRoleKey:    biz.SalesRoleKey,
			wantWorkPoolMatched: false,
			wantVisibleOwner:    false,
			wantScopeMatched:    false,
		},
		{
			name: "same-role action entitlement explains work pool match",
			entitlements: []biz.AccessEntitlementInput{
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
			},
			wantAllowed:         true,
			wantActorRoleKey:    biz.WarehouseRoleKey,
			wantWorkPoolMatched: true,
			wantVisibleOwner:    true,
			wantScopeMatched:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{
				currentTask: &biz.WorkflowTask{
					ID:            82,
					TaskGroup:     "warehouse_inbound",
					SourceType:    "inbound",
					SourceID:      1,
					TaskStatusKey: "ready",
					OwnerRoleKey:  biz.WarehouseRoleKey,
					Payload:       map[string]any{},
				},
			}
			j := &jsonrpcDispatcher{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)},
				workflowUC:  biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithMembershipsAndEntitlements(
					[]biz.WorkPoolMembershipInput{
						{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
					},
					tt.entitlements,
				),
			}
			params, err := structpb.NewStruct(map[string]any{
				"task_id":    float64(82),
				"action_key": "complete",
			})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "explain_action_access", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code {
				t.Fatalf("expected OK response, got %#v", res)
			}
			action, ok := res.Data.AsMap()["action"].(map[string]any)
			if !ok {
				t.Fatalf("expected action explain map, got %#v", res.Data.AsMap())
			}
			if action["owner_role_key"] != biz.WarehouseRoleKey {
				t.Fatalf("expected owner_role_key warehouse, got %#v", action["owner_role_key"])
			}
			if action["required_permission"] != biz.PermissionWorkflowTaskComplete {
				t.Fatalf("expected complete permission, got %#v", action["required_permission"])
			}
			if action["allowed"] != tt.wantAllowed {
				t.Fatalf("expected allowed=%v, got %#v", tt.wantAllowed, action["allowed"])
			}
			if action["actor_role_key"] != tt.wantActorRoleKey {
				t.Fatalf("expected actor_role_key %q, got %#v", tt.wantActorRoleKey, action["actor_role_key"])
			}
			if action["work_pool_role_matched"] != tt.wantWorkPoolMatched {
				t.Fatalf("expected work_pool_role_matched=%v, got %#v", tt.wantWorkPoolMatched, action["work_pool_role_matched"])
			}
			if action["work_pool_entitlement_matched"] != tt.wantWorkPoolMatched {
				t.Fatalf("expected work_pool_entitlement_matched=%v, got %#v", tt.wantWorkPoolMatched, action["work_pool_entitlement_matched"])
			}
			if action["work_pool_entitlement_scope_matched"] != tt.wantScopeMatched {
				t.Fatalf("expected work_pool_entitlement_scope_matched=%v, got %#v", tt.wantScopeMatched, action["work_pool_entitlement_scope_matched"])
			}
			visibleOwnerRoleKeys, ok := action["visible_owner_role_keys"].([]any)
			if !ok {
				t.Fatalf("expected visible_owner_role_keys, got %#v", action["visible_owner_role_keys"])
			}
			candidateOwnerRoleKeys, ok := action["candidate_owner_role_keys"].([]any)
			if !ok {
				t.Fatalf("expected candidate_owner_role_keys, got %#v", action["candidate_owner_role_keys"])
			}
			gotVisibleOwner := false
			for _, roleKey := range visibleOwnerRoleKeys {
				if roleKey == biz.WarehouseRoleKey {
					gotVisibleOwner = true
				}
			}
			if gotVisibleOwner != tt.wantVisibleOwner {
				t.Fatalf("expected warehouse visible owner=%v, got %#v", tt.wantVisibleOwner, visibleOwnerRoleKeys)
			}
			gotCandidateOwner := false
			for _, roleKey := range candidateOwnerRoleKeys {
				if roleKey == biz.WarehouseRoleKey {
					gotCandidateOwner = true
				}
			}
			if gotCandidateOwner != tt.wantVisibleOwner {
				t.Fatalf("expected warehouse candidate owner=%v, got %#v", tt.wantVisibleOwner, candidateOwnerRoleKeys)
			}
			if action["configured_candidate_owner_pool_key"] != biz.WarehouseRoleKey {
				t.Fatalf("expected configured_candidate_owner_pool_key warehouse, got %#v", action["configured_candidate_owner_pool_key"])
			}
			if action["configured_required_capability_key"] != biz.PermissionWorkflowTaskComplete {
				t.Fatalf("expected configured_required_capability_key complete, got %#v", action["configured_required_capability_key"])
			}
			if action["configured_candidate_source"] != "active_customer_config" {
				t.Fatalf("expected active customer config source, got %#v", action["configured_candidate_source"])
			}
			configuredCandidateRoleKeys, ok := action["configured_candidate_owner_role_keys"].([]any)
			if !ok {
				t.Fatalf("expected configured_candidate_owner_role_keys, got %#v", action["configured_candidate_owner_role_keys"])
			}
			gotConfiguredCandidate := anyStringSliceContains(configuredCandidateRoleKeys, biz.WarehouseRoleKey)
			if gotConfiguredCandidate != tt.wantVisibleOwner {
				t.Fatalf("expected configured warehouse candidate=%v, got %#v", tt.wantVisibleOwner, configuredCandidateRoleKeys)
			}
			domainCommandEntry, ok := action["domain_command_entry"].(map[string]any)
			if !ok {
				t.Fatalf("expected domain_command_entry map, got %#v", action["domain_command_entry"])
			}
			if domainCommandEntry["enabled"] != false || domainCommandEntry["will_write_fact"] != false {
				t.Fatalf("domain command entry must stay disabled and readonly, got %#v", domainCommandEntry)
			}
			if domainCommandEntry["source"] != "guarded_no_domain_command_contract" {
				t.Fatalf("expected guarded domain command source, got %#v", domainCommandEntry["source"])
			}
			blockedReasons, ok := domainCommandEntry["blocked_reasons"].([]any)
			if !ok || !anyStringSliceContains(blockedReasons, "domain_command_contract_not_configured") {
				t.Fatalf("expected domain command blocked reason, got %#v", domainCommandEntry["blocked_reasons"])
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowExplainTaskAssignment(t *testing.T) {
	assigneeID := 7
	tests := []struct {
		name           string
		admin          *biz.AdminUser
		currentTask    *biz.WorkflowTask
		wantCanHandle  bool
		wantCanUrge    bool
		wantReasonCode string
	}{
		{
			name:           "owner role can handle",
			admin:          workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete),
			currentTask:    &biz.WorkflowTask{ID: 91, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{}},
			wantCanHandle:  true,
			wantCanUrge:    true,
			wantReasonCode: "owner_role_matched",
		},
		{
			name:           "assigned admin can handle without owner role",
			admin:          workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete),
			currentTask:    &biz.WorkflowTask{ID: 92, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, AssigneeID: &assigneeID, Payload: map[string]any{}},
			wantCanHandle:  true,
			wantCanUrge:    true,
			wantReasonCode: "assigned_to_current_admin",
		},
		{
			name:           "pmc can urge only",
			admin:          workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate),
			currentTask:    &biz.WorkflowTask{ID: 93, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{}},
			wantCanHandle:  false,
			wantCanUrge:    true,
			wantReasonCode: "can_urge_only",
		},
		{
			name: "super admin can urge but cannot handle business task without owner role",
			admin: func() *biz.AdminUser {
				admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate, biz.PermissionWorkflowTaskComplete)
				admin.IsSuperAdmin = true
				return admin
			}(),
			currentTask:    &biz.WorkflowTask{ID: 95, TaskGroup: "shipment_release", SourceType: "shipping-release", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{"shipment_release": true}},
			wantCanHandle:  false,
			wantCanUrge:    true,
			wantReasonCode: "can_urge_only",
		},
		{
			name:           "terminal task stays readonly",
			admin:          workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete),
			currentTask:    &biz.WorkflowTask{ID: 94, TaskGroup: "warehouse_inbound", SourceType: "accessories-purchase", SourceID: 1, TaskStatusKey: "done", OwnerRoleKey: biz.WarehouseRoleKey, Payload: map[string]any{}},
			wantCanHandle:  false,
			wantCanUrge:    false,
			wantReasonCode: "terminal_task",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{currentTask: tt.currentTask}
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: tt.admin},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
			}
			params, err := structpb.NewStruct(map[string]any{"task_id": float64(tt.currentTask.ID)})
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "explain_task_assignment", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code {
				t.Fatalf("expected OK response, got %#v", res)
			}
			assignment, ok := res.Data.AsMap()["assignment"].(map[string]any)
			if !ok {
				t.Fatalf("expected assignment map, got %#v", res.Data.AsMap())
			}
			if assignment["visible"] != true {
				t.Fatalf("expected visible=true, got %#v", assignment["visible"])
			}
			if assignment["can_handle"] != tt.wantCanHandle {
				t.Fatalf("expected can_handle=%v, got %#v", tt.wantCanHandle, assignment["can_handle"])
			}
			if assignment["can_urge"] != tt.wantCanUrge {
				t.Fatalf("expected can_urge=%v, got %#v", tt.wantCanUrge, assignment["can_urge"])
			}
			if assignment["reason_code"] != tt.wantReasonCode {
				t.Fatalf("expected reason_code %q, got %#v", tt.wantReasonCode, assignment["reason_code"])
			}
			requiredPermissions, ok := assignment["action_required_permissions"].(map[string]any)
			if !ok {
				t.Fatalf("expected action_required_permissions map, got %#v", assignment["action_required_permissions"])
			}
			if requiredPermissions["complete"] != biz.WorkflowStatusActionPermission("done", tt.currentTask) ||
				requiredPermissions["block"] != biz.WorkflowStatusActionPermission("blocked", tt.currentTask) ||
				requiredPermissions["reject"] != biz.WorkflowStatusActionPermission("rejected", tt.currentTask) ||
				requiredPermissions["urge"] != biz.PermissionWorkflowTaskUpdate {
				t.Fatalf("unexpected action_required_permissions %#v", requiredPermissions)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowExplainTaskAssignmentReportsActionScopeMatches(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            95,
			TaskGroup:     "warehouse_inbound",
			SourceType:    "inbound",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithMembershipsAndEntitlements(
			[]biz.WorkPoolMembershipInput{
				{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
			},
			[]biz.AccessEntitlementInput{
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
			},
		),
	}
	params, err := structpb.NewStruct(map[string]any{"task_id": float64(95)})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "explain_task_assignment", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	assignment, ok := res.Data.AsMap()["assignment"].(map[string]any)
	if !ok {
		t.Fatalf("expected assignment map, got %#v", res.Data.AsMap())
	}
	if assignment["work_pool_role_matched"] != true ||
		assignment["work_pool_entitlement_scope_matched"] != true {
		t.Fatalf("expected read-scope work pool match in assignment, got %#v", assignment)
	}
	readCandidateRoleKeys, ok := assignment["read_candidate_owner_role_keys"].([]any)
	if !ok {
		t.Fatalf("expected read_candidate_owner_role_keys, got %#v", assignment["read_candidate_owner_role_keys"])
	}
	if !anyStringSliceContains(readCandidateRoleKeys, biz.WarehouseRoleKey) {
		t.Fatalf("read candidate roles should include same-scope warehouse, got %#v", readCandidateRoleKeys)
	}
	configuredReadCandidateRoleKeys, ok := assignment["configured_read_candidate_owner_role_keys"].([]any)
	if !ok {
		t.Fatalf("expected configured_read_candidate_owner_role_keys, got %#v", assignment["configured_read_candidate_owner_role_keys"])
	}
	if !anyStringSliceContains(configuredReadCandidateRoleKeys, biz.WarehouseRoleKey) {
		t.Fatalf("configured read candidates should include same-scope warehouse, got %#v", configuredReadCandidateRoleKeys)
	}
	if assignment["configured_candidate_owner_pool_key"] != biz.WarehouseRoleKey {
		t.Fatalf("expected configured_candidate_owner_pool_key warehouse, got %#v", assignment["configured_candidate_owner_pool_key"])
	}
	actionCandidateRoleKeys, ok := assignment["action_candidate_owner_role_keys"].(map[string]any)
	if !ok {
		t.Fatalf("expected action_candidate_owner_role_keys map, got %#v", assignment["action_candidate_owner_role_keys"])
	}
	configuredActionCandidateRoleKeys, ok := assignment["action_configured_candidate_owner_role_keys"].(map[string]any)
	if !ok {
		t.Fatalf("expected action_configured_candidate_owner_role_keys map, got %#v", assignment["action_configured_candidate_owner_role_keys"])
	}
	completeCandidates, ok := actionCandidateRoleKeys["complete"].([]any)
	if !ok {
		t.Fatalf("expected complete candidate role list, got %#v", actionCandidateRoleKeys["complete"])
	}
	urgeCandidates, ok := actionCandidateRoleKeys["urge"].([]any)
	if !ok {
		t.Fatalf("expected urge candidate role list, got %#v", actionCandidateRoleKeys["urge"])
	}
	configuredCompleteCandidates, ok := configuredActionCandidateRoleKeys["complete"].([]any)
	if !ok {
		t.Fatalf("expected configured complete candidate role list, got %#v", configuredActionCandidateRoleKeys["complete"])
	}
	configuredUrgeCandidates, ok := configuredActionCandidateRoleKeys["urge"].([]any)
	if !ok {
		t.Fatalf("expected configured urge candidate role list, got %#v", configuredActionCandidateRoleKeys["urge"])
	}
	if anyStringSliceContains(completeCandidates, biz.WarehouseRoleKey) {
		t.Fatalf("complete candidates must not include another customer scope, got %#v", completeCandidates)
	}
	if !anyStringSliceContains(urgeCandidates, biz.WarehouseRoleKey) {
		t.Fatalf("urge candidates should include same-scope workflow.task.update entitlement, got %#v", urgeCandidates)
	}
	if anyStringSliceContains(configuredCompleteCandidates, biz.WarehouseRoleKey) {
		t.Fatalf("configured complete candidates must not include another customer scope, got %#v", configuredCompleteCandidates)
	}
	if !anyStringSliceContains(configuredUrgeCandidates, biz.WarehouseRoleKey) {
		t.Fatalf("configured urge candidates should include same-scope workflow.task.update entitlement, got %#v", configuredUrgeCandidates)
	}
	configuredSources, ok := assignment["action_configured_candidate_sources"].(map[string]any)
	if !ok {
		t.Fatalf("expected action_configured_candidate_sources map, got %#v", assignment["action_configured_candidate_sources"])
	}
	if configuredSources["complete"] != "active_customer_config" || configuredSources["urge"] != "active_customer_config" {
		t.Fatalf("unexpected configured candidate sources %#v", configuredSources)
	}
	domainCommandEntries, ok := assignment["action_domain_command_entries"].(map[string]any)
	if !ok {
		t.Fatalf("expected action_domain_command_entries map, got %#v", assignment["action_domain_command_entries"])
	}
	completeDomainEntry, ok := domainCommandEntries["complete"].(map[string]any)
	if !ok {
		t.Fatalf("expected complete domain command entry, got %#v", domainCommandEntries["complete"])
	}
	if completeDomainEntry["enabled"] != false || completeDomainEntry["will_write_fact"] != false {
		t.Fatalf("complete domain command entry must stay disabled, got %#v", completeDomainEntry)
	}
	if completeDomainEntry["source"] != "guarded_no_domain_command_contract" {
		t.Fatalf("expected guarded complete domain command source, got %#v", completeDomainEntry["source"])
	}
	urgeDomainEntry, ok := domainCommandEntries["urge"].(map[string]any)
	if !ok {
		t.Fatalf("expected urge domain command entry, got %#v", domainCommandEntries["urge"])
	}
	urgeBlockedReasons, ok := urgeDomainEntry["blocked_reasons"].([]any)
	if !ok || !anyStringSliceContains(urgeBlockedReasons, "urge_action_never_posts_domain_fact") {
		t.Fatalf("expected urge action never posts fact, got %#v", urgeDomainEntry)
	}
	scopeMatches, ok := assignment["action_work_pool_scope_matches"].(map[string]any)
	if !ok {
		t.Fatalf("expected action_work_pool_scope_matches map, got %#v", assignment["action_work_pool_scope_matches"])
	}
	if scopeMatches["complete"] != false {
		t.Fatalf("complete must not match another customer scope, got %#v", scopeMatches)
	}
	if scopeMatches["urge"] != true {
		t.Fatalf("urge should match same-scope workflow.task.update entitlement, got %#v", scopeMatches)
	}
}

func TestJsonrpcDispatcher_WorkflowExplainActionAccessIgnoresPayloadDomainCommandKey(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            96,
			TaskGroup:     "warehouse_inbound",
			SourceType:    "inbound",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"command_key": "post_purchase_receipt"},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id":    float64(96),
		"action_key": "complete",
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "explain_action_access", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	action, ok := res.Data.AsMap()["action"].(map[string]any)
	if !ok {
		t.Fatalf("expected action explain map, got %#v", res.Data.AsMap())
	}
	domainCommandEntry, ok := action["domain_command_entry"].(map[string]any)
	if !ok {
		t.Fatalf("expected domain_command_entry map, got %#v", action["domain_command_entry"])
	}
	if domainCommandEntry["enabled"] != false || domainCommandEntry["will_write_fact"] != false || domainCommandEntry["command_key"] != nil {
		t.Fatalf("payload command key must not enable domain command entry, got %#v", domainCommandEntry)
	}
	blockedReasons, ok := domainCommandEntry["blocked_reasons"].([]any)
	if !ok || !anyStringSliceContains(blockedReasons, "workflow_payload_command_key_ignored") {
		t.Fatalf("expected payload command key ignored reason, got %#v", domainCommandEntry["blocked_reasons"])
	}
}

func anyStringSliceContains(values []any, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusIgnoresClientActorRole(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            1,
			TaskGroup:     "purchase_iqc",
			SourceType:    "accessories-purchase",
			SourceID:      1,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"actor_role_key":  biz.FinanceRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.updateActorID != 7 || repo.updateActorRoleKey != biz.QualityRoleKey {
		t.Fatalf("expected server-derived actor 7/quality, got %d/%q", repo.updateActorID, repo.updateActorRoleKey)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRejectsNonWarehouseShipmentRelease(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            10,
			TaskGroup:     "shipment_release",
			SourceType:    "shipping-release",
			SourceID:      10,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"shipment_release": true},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(10),
		"task_status_key": "done",
		"actor_role_key":  biz.FinanceRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for non-warehouse shipment release, got %#v", res)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRejectsSuperAdminShipmentReleaseWithoutBusinessRole(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            11,
			TaskGroup:     "shipment_release",
			SourceType:    "shipping-release",
			SourceID:      11,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"shipment_release": true},
		},
	}
	admin := workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)
	admin.IsSuperAdmin = true
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(11),
		"task_status_key": "done",
		"actor_role_key":  biz.FinanceRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for super admin shipment release without business role, got %#v", res)
	}
}

func TestJsonrpcDispatcher_WorkflowCompleteTaskActionRejectsSuperAdminWithoutBreakGlass(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            12,
			TaskCode:      "SHIP-REL-12",
			TaskGroup:     "shipment_release",
			SourceType:    "shipping-release",
			SourceID:      12,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"shipment_release": true},
		},
	}
	admin := workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)
	admin.IsSuperAdmin = true
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id":    float64(12),
		"action_key": "complete",
		"payload":    map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", res)
	}
	if repo.updateInput != nil {
		t.Fatalf("super admin without break-glass must not update task, got %#v", repo.updateInput)
	}
}

func TestJsonrpcDispatcher_WorkflowCompleteTaskActionAllowsAuditedSuperAdminBreakGlass(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            13,
			TaskCode:      "SHIP-REL-13",
			TaskGroup:     "shipment_release",
			SourceType:    "shipping-release",
			SourceID:      13,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"shipment_release": true},
		},
	}
	admin := workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete)
	admin.IsSuperAdmin = true
	auditRepo := newMemAdminManageRepoForData()
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
		adminManageUC:    biz.NewAdminManageUsecase(auditRepo, log.NewStdLogger(io.Discard), nil),
	}
	expiresAt := time.Now().Add(time.Hour).Unix()
	params, err := structpb.NewStruct(map[string]any{
		"task_id":                float64(13),
		"action_key":             "complete",
		"break_glass":            true,
		"break_glass_reason":     "客户现场紧急放行排障",
		"break_glass_expires_at": float64(expiresAt),
		"payload":                map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if repo.updateInput == nil || repo.updateInput.TaskStatusKey != "done" {
		t.Fatalf("expected audited break-glass to update done, got %#v", repo.updateInput)
	}
	if repo.updateActorRoleKey != biz.AdminRoleKey {
		t.Fatalf("break-glass actor role must stay admin, got %q", repo.updateActorRoleKey)
	}
	if len(auditRepo.auditLogs) != 1 {
		t.Fatalf("expected one runtime audit event, got %#v", auditRepo.auditLogs)
	}
	event := biz.EnrichRuntimeAuditEvent(auditRepo.auditLogs[0])
	if event.EventType != "workflow_break_glass" || event.EventKey != "workflow_task.break_glass" || event.Source != "workflow" {
		t.Fatalf("unexpected audit event %#v", event)
	}
	if event.RiskLevel != "high" {
		t.Fatalf("break-glass audit must be high risk, got %q", event.RiskLevel)
	}
	breakGlass, ok := event.Payload["break_glass"].(map[string]any)
	if !ok {
		t.Fatalf("expected break_glass payload, got %#v", event.Payload)
	}
	if breakGlass["reason"] != "客户现场紧急放行排障" || breakGlass["requested_next_status_key"] != "done" {
		t.Fatalf("unexpected break_glass payload %#v", breakGlass)
	}
	if strings.Contains(event.Summary, "执行了") {
		t.Fatalf("break-glass audit summary must describe a request, got %q", event.Summary)
	}
	target, ok := event.Payload["target"].(map[string]any)
	if !ok || target["type"] != "workflow_task" || target["key"] != "SHIP-REL-13" {
		t.Fatalf("unexpected audit target %#v", event.Payload["target"])
	}
}

func TestJsonrpcDispatcher_WorkflowBreakGlassRejectsMissingOrInvalidScope(t *testing.T) {
	tests := []struct {
		name   string
		admin  *biz.AdminUser
		params map[string]any
	}{
		{
			name: "missing reason",
			admin: func() *biz.AdminUser {
				admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey}, biz.PermissionWorkflowTaskComplete)
				admin.IsSuperAdmin = true
				return admin
			}(),
			params: map[string]any{
				"task_id":                float64(14),
				"break_glass":            true,
				"break_glass_expires_at": float64(time.Now().Add(time.Hour).Unix()),
				"payload":                map[string]any{},
			},
		},
		{
			name: "expired",
			admin: func() *biz.AdminUser {
				admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey}, biz.PermissionWorkflowTaskComplete)
				admin.IsSuperAdmin = true
				return admin
			}(),
			params: map[string]any{
				"task_id":                float64(14),
				"break_glass":            true,
				"break_glass_reason":     "过期验证",
				"break_glass_expires_at": float64(time.Now().Add(-time.Minute).Unix()),
				"payload":                map[string]any{},
			},
		},
		{
			name:  "ordinary admin cannot use break glass",
			admin: workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, biz.PermissionWorkflowTaskComplete),
			params: map[string]any{
				"task_id":                float64(14),
				"break_glass":            true,
				"break_glass_reason":     "普通账号不能使用",
				"break_glass_expires_at": float64(time.Now().Add(time.Hour).Unix()),
				"payload":                map[string]any{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &stubWorkflowJSONRPCRepo{
				currentTask: &biz.WorkflowTask{
					ID:            14,
					TaskCode:      "SHIP-REL-14",
					TaskGroup:     "shipment_release",
					SourceType:    "shipping-release",
					SourceID:      14,
					TaskStatusKey: "ready",
					OwnerRoleKey:  biz.WarehouseRoleKey,
					Payload:       map[string]any{"shipment_release": true},
				},
			}
			auditRepo := newMemAdminManageRepoForData()
			j := &jsonrpcDispatcher{
				log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader:      stubAdminAccountReader{admin: tt.admin},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
				adminManageUC:    biz.NewAdminManageUsecase(auditRepo, log.NewStdLogger(io.Discard), nil),
			}
			params, err := structpb.NewStruct(tt.params)
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "complete_task_action", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code == errcode.OK.Code {
				t.Fatalf("expected rejected break-glass response, got %#v", res)
			}
			if repo.updateInput != nil {
				t.Fatalf("rejected break-glass must not update task, got %#v", repo.updateInput)
			}
			if len(auditRepo.auditLogs) != 0 {
				t.Fatalf("rejected break-glass must not write audit, got %#v", auditRepo.auditLogs)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRejectsNonWarehouseFinishedGoodsInbound(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            8,
			TaskGroup:     "finished_goods_inbound",
			SourceType:    "production-progress",
			SourceID:      8,
			TaskStatusKey: "ready",
			OwnerRoleKey:  biz.WarehouseRoleKey,
			Payload:       map[string]any{"finished_goods": true},
		},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(8),
		"task_status_key": "done",
		"actor_role_key":  biz.QualityRoleKey,
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied for non-warehouse finished goods inbound, got %#v", res)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusDisabledAdminRejected(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)
	admin.Disabled = true
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{ID: 1, TaskGroup: "purchase_iqc", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, Payload: map[string]any{}},
	}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.AdminDisabled.Code {
		t.Fatalf("expected disabled admin rejection, got %#v", res)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersBossApprovalDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_derivation?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionWorkflowTaskApprove)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}

	sourceNo := "PO-20260425-001"
	statusKey := "project_pending"
	approvalTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "ORDER-APPROVAL-RPC-001",
		TaskGroup:         "order_approval",
		TaskName:          "老板审批订单",
		SourceType:        "project-orders",
		SourceID:          88,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "boss",
		Payload: map[string]any{
			"record_title":  "企鹅抱枕",
			"customer_name": "成慧怡",
			"style_no":      "ST-001",
			"product_no":    "PRD-001",
			"product_name":  "企鹅抱枕",
			"due_date":      "2026-05-01",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create approval task failed: %v", err)
	}

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(approvalTask.ID),
		"task_status_key":     "done",
		"business_status_key": "project_approved",
		"actor_role_key":      "boss",
		"payload": map[string]any{
			"approval_result": "approved",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(88),
			workflowtask.TaskGroup("engineering_data"),
			workflowtask.OwnerRoleKey("engineering"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count downstream tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one engineering task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("project-orders"), workflowbusinessstate.SourceID(88)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "project_approved" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "engineering" {
		t.Fatalf("unexpected business state %#v", state)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "project-orders",
		SourceID:   88,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	foundEngineering := false
	for _, task := range tasks {
		if task.TaskGroup == "engineering_data" && task.OwnerRoleKey == "engineering" {
			foundEngineering = true
			break
		}
	}
	if !foundEngineering {
		t.Fatalf("expected list_tasks refresh path to include derived engineering task")
	}

	engineeringTask, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(88),
			workflowtask.TaskGroup("engineering_data"),
			workflowtask.OwnerRoleKey("engineering"),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("query engineering task failed: %v", err)
	}

	engineeringDispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module",
			"service.jsonrpc.test",
		)),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin(
			[]string{biz.EngineeringRoleKey},
			biz.PermissionWorkflowTaskRead,
			biz.PermissionWorkflowTaskComplete,
		)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	listParams, err := structpb.NewStruct(map[string]any{
		"source_type": "project-orders",
		"source_id":   float64(88),
		"task_group":  "engineering_data",
		"limit":       float64(20),
	})
	if err != nil {
		t.Fatalf("build engineering list params failed: %v", err)
	}
	_, listRes, err := engineeringDispatcher.handleWorkflow(adminCtx, "list_tasks", "engineering-list", listParams)
	if err != nil {
		t.Fatalf("expected nil list err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected engineering list OK response, got %#v", listRes)
	}
	listData := listRes.Data.AsMap()
	listTasks, ok := listData["tasks"].([]any)
	if !ok {
		t.Fatalf("expected engineering list tasks, got %#v", listData["tasks"])
	}
	foundViaJSONRPC := false
	for _, item := range listTasks {
		task, ok := item.(map[string]any)
		if ok &&
			task["task_group"] == "engineering_data" &&
			task["owner_role_key"] == "engineering" {
			foundViaJSONRPC = true
			break
		}
	}
	if !foundViaJSONRPC {
		t.Fatalf("expected engineering JSON-RPC list_tasks to include derived task, got %#v", listTasks)
	}

	completeParams, err := structpb.NewStruct(map[string]any{
		"task_id":    float64(engineeringTask.ID),
		"action_key": "complete",
		"payload": map[string]any{
			"entry":           "mobile_role_task",
			"mobile_role_key": "engineering",
		},
	})
	if err != nil {
		t.Fatalf("build engineering complete params failed: %v", err)
	}
	_, completeRes, err := engineeringDispatcher.handleWorkflow(adminCtx, "complete_task_action", "engineering-complete", completeParams)
	if err != nil {
		t.Fatalf("expected nil complete err, got %v", err)
	}
	if completeRes == nil || completeRes.Code != errcode.OK.Code {
		t.Fatalf("expected engineering complete OK response, got %#v", completeRes)
	}
	completedTask, err := client.WorkflowTask.Get(ctx, engineeringTask.ID)
	if err != nil {
		t.Fatalf("reload engineering task failed: %v", err)
	}
	if completedTask.TaskStatusKey != "done" {
		t.Fatalf("expected engineering task done, got %q", completedTask.TaskStatusKey)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersPurchaseIQCDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_purchase_iqc?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}

	sourceNo := "PUR-ARR-RPC-001"
	statusKey := "iqc_pending"
	iqcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "PURCHASE-IQC-RPC-001",
		TaskGroup:         "purchase_iqc",
		TaskName:          "IQC 来料检验",
		SourceType:        "accessories-purchase",
		SourceID:          166,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":  "PP 棉到货",
			"supplier_name": "联调供应商",
			"material_name": "PP 棉",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create IQC task failed: %v", err)
	}

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(iqcTask.ID),
		"task_status_key":     "done",
		"business_status_key": "warehouse_inbound_pending",
		"actor_role_key":      "quality",
		"payload": map[string]any{
			"qc_result": "pass",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("accessories-purchase"),
			workflowtask.SourceID(166),
			workflowtask.TaskGroup("warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count warehouse inbound tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one warehouse inbound task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(166)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected IQC business state %#v", state)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersWarehouseInboundBusinessState(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_warehouse_inbound?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}

	sourceNo := "PUR-IN-RPC-001"
	statusKey := "warehouse_inbound_pending"
	warehouseTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "WAREHOUSE-INBOUND-RPC-001",
		TaskGroup:         "warehouse_inbound",
		TaskName:          "确认入库",
		SourceType:        "accessories-purchase",
		SourceID:          266,
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

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(warehouseTask.ID),
		"task_status_key":     "done",
		"business_status_key": "inbound_done",
		"actor_role_key":      "warehouse",
		"payload": map[string]any{
			"mobile_role_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("accessories-purchase"), workflowbusinessstate.SourceID(266)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected warehouse inbound business state %#v", state)
	}
	if state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["inbound_result"] != "done" {
		t.Fatalf("expected deferred inventory inbound payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("accessories-purchase"), workflowtask.SourceID(266)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("warehouse inbound JSON-RPC update must not create downstream tasks, got %d tasks", taskCount)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersOutsourceReturnQCDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_outsource_return_qc?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}

	sourceNo := "OUT-RET-RPC-001"
	statusKey := "qc_pending"
	qcTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "OUTSOURCE-RETURN-QC-RPC-001",
		TaskGroup:         "outsource_return_qc",
		TaskName:          "委外回货检验",
		SourceType:        "processing-contracts",
		SourceID:          366,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &statusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          2,
		Payload: map[string]any{
			"record_title":         "兔子挂件委外车缝",
			"supplier_name":        "联调加工厂",
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

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(qcTask.ID),
		"task_status_key":     "done",
		"business_status_key": "warehouse_inbound_pending",
		"actor_role_key":      "quality",
		"payload": map[string]any{
			"qc_result": "pass",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("processing-contracts"),
			workflowtask.SourceID(366),
			workflowtask.TaskGroup("outsource_warehouse_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count outsource warehouse inbound tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one outsource warehouse inbound task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("processing-contracts"), workflowbusinessstate.SourceID(366)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected outsource QC business state %#v", state)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "processing-contracts",
		SourceID:   366,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	foundWarehouseInbound := false
	for _, task := range tasks {
		if task.TaskGroup == "outsource_warehouse_inbound" && task.OwnerRoleKey == "warehouse" {
			foundWarehouseInbound = true
			break
		}
	}
	if !foundWarehouseInbound {
		t.Fatalf("expected list_tasks refresh path to include derived outsource warehouse inbound task")
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersFinishedGoodsQCDerivation(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_finished_goods_qc?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	qcTask := createFinishedGoodsQCTask(t, ctx, repo, 466)

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":                  float64(qcTask.ID),
		"task_status_key":     "done",
		"business_status_key": "warehouse_inbound_pending",
		"actor_role_key":      "quality",
		"payload": map[string]any{
			"qc_result": "pass",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	downstreamCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(466),
			workflowtask.TaskGroup("finished_goods_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count finished goods inbound tasks failed: %v", err)
	}
	if downstreamCount != 1 {
		t.Fatalf("expected one finished goods inbound task after JSON-RPC update, got %d", downstreamCount)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(466)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods QC business state %#v", state)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "production-progress",
		SourceID:   466,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	foundFinishedGoodsInbound := false
	for _, task := range tasks {
		if task.TaskGroup == "finished_goods_inbound" && task.OwnerRoleKey == "warehouse" {
			foundFinishedGoodsInbound = true
			break
		}
	}
	if !foundFinishedGoodsInbound {
		t.Fatalf("expected list_tasks refresh path to include derived finished goods inbound task")
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersFinishedGoodsInboundBusinessState(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_finished_goods_inbound?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	inboundTask := createFinishedGoodsInboundTask(t, ctx, repo, 566, map[string]any{})

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(inboundTask.ID),
		"task_status_key": "done",
		"actor_role_key":  "warehouse",
		"payload": map[string]any{
			"mobile_role_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(566)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query finished goods inbound business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods inbound business state %#v", state)
	}
	if state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["shipment_release_deferred"] != true ||
		state.Payload["decision"] != "done" {
		t.Fatalf("expected deferred inbound_done payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(566)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("finished goods inbound JSON-RPC update must not create downstream tasks, got %d tasks", taskCount)
	}
	shipmentCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(566),
			workflowtask.TaskGroup("shipment_release"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count shipment release tasks failed: %v", err)
	}
	if shipmentCount != 0 {
		t.Fatalf("finished goods inbound JSON-RPC update must not derive shipment release, got %d", shipmentCount)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "production-progress",
		SourceID:   566,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	for _, task := range tasks {
		if task.TaskGroup == "shipment_release" {
			t.Fatalf("list_tasks refresh path must not include shipment release after finished goods inbound done")
		}
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:jsonrpc_workflow_shipment_release?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := datarepo.NewWorkflowRepo(datarepo.NewDataForTesting(client, nil), log.NewStdLogger(io.Discard))
	workflowUC := biz.NewWorkflowUsecase(repo)
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       workflowUC,
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	shipmentTask := createShipmentReleaseTask(t, ctx, repo, 666, map[string]any{})

	adminCtx := biz.NewContextWithClaims(ctx, &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(shipmentTask.ID),
		"task_status_key": "done",
		"actor_role_key":  "warehouse",
		"payload": map[string]any{
			"mobile_role_key": "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(adminCtx, "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	data := res.Data.AsMap()
	resultTask, ok := data["task"].(map[string]any)
	if !ok || resultTask["task_status_key"] != "done" {
		t.Fatalf("expected returned done task, got %#v", data["task"])
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("shipping-release"), workflowbusinessstate.SourceID(666)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query shipment release business state failed: %v", err)
	}
	if state.BusinessStatusKey != "shipping_released" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected shipment release business state %#v", state)
	}
	if state.Payload["inventory_out_deferred"] != true ||
		state.Payload["receivable_deferred"] != true ||
		state.Payload["invoice_deferred"] != true ||
		state.Payload["decision"] != "done" {
		t.Fatalf("expected deferred shipping_released payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("shipping-release"), workflowtask.SourceID(666)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("shipment release JSON-RPC update must not create downstream tasks, got %d tasks", taskCount)
	}
	receivableCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("shipping-release"),
			workflowtask.SourceID(666),
			workflowtask.TaskGroup("receivable_registration"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count receivable tasks failed: %v", err)
	}
	if receivableCount != 0 {
		t.Fatalf("shipment release JSON-RPC update must not derive receivable task, got %d", receivableCount)
	}

	tasks, _, err := workflowUC.ListTasks(ctx, biz.WorkflowTaskFilter{
		SourceType: "shipping-release",
		SourceID:   666,
		Limit:      200,
	})
	if err != nil {
		t.Fatalf("list tasks failed: %v", err)
	}
	for _, task := range tasks {
		if task.TaskGroup == "receivable_registration" || task.TaskGroup == "invoice_registration" {
			t.Fatalf("list_tasks refresh path must not include finance task after shipment release done")
		}
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusKeepsAdminBoundary(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"id":              float64(1),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, unauthRes, err := j.handleWorkflow(context.Background(), "update_task_status", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if unauthRes == nil || unauthRes.Code != errcode.AuthRequired.Code {
		t.Fatalf("expected auth required, got %#v", unauthRes)
	}

	userCtx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   8,
		Username: "user",
		Role:     biz.RoleUser,
	})
	_, userRes, err := j.handleWorkflow(userCtx, "update_task_status", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if userRes == nil || userRes.Code != errcode.AdminRequired.Code {
		t.Fatalf("expected admin required for non-admin role, got %#v", userRes)
	}
}
