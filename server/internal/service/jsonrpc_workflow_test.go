package service

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

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
	if in.Reason != "" {
		reason := in.Reason
		task.BlockedReason = &reason
	}
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

func (s *stubProcessRuntimeJSONRPCRepo) ClaimProcessNodeDomainCommand(_ context.Context, in *biz.ProcessNodeDomainCommandClaim) (*biz.ProcessNodeInstance, error) {
	if s.node == nil || s.node.ID != in.ProcessNodeInstanceID {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	if s.node.ProcessInstanceID != in.ProcessInstanceID || s.node.Status != biz.ProcessNodeStatusActive || s.node.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if s.node.NodeType != biz.ProcessNodeTypeDomainCommand {
		return nil, biz.ErrBadParam
	}
	if s.node.DomainCommandFingerprint != nil && *s.node.DomainCommandFingerprint != in.DomainCommandFingerprint {
		return nil, biz.ErrIdempotencyConflict
	}
	out := *s.node
	fingerprint := in.DomainCommandFingerprint
	out.DomainCommandFingerprint = &fingerprint
	s.node = &out
	return &out, nil
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
	out.DomainCommandFingerprint = in.DomainCommandFingerprint
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
	out.DomainCommandFingerprint = in.DomainCommandFingerprint
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
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey, biz.QualityRoleKey}, biz.PermissionWorkflowTaskCreate, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete, biz.PermissionWorkflowTaskUpdate)},
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
	_, explainReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "explain_action_access", "read-only-explain-action", completeParams)
	if err != nil {
		t.Fatalf("expected nil err for read_only explain action, got %v", err)
	}
	if explainReadOnlyRes == nil || explainReadOnlyRes.Code != errcode.OK.Code {
		t.Fatalf("expected read_only explain_action_access allowed, got %#v", explainReadOnlyRes)
	}
	if repo.updateInput != nil {
		t.Fatalf("read_only explain_action_access must not call update usecase, got %#v", repo.updateInput)
	}
	_, assignmentReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "explain_task_assignment", "read-only-explain-assignment", completeParams)
	if err != nil {
		t.Fatalf("expected nil err for read_only explain assignment, got %v", err)
	}
	if assignmentReadOnlyRes == nil || assignmentReadOnlyRes.Code != errcode.OK.Code {
		t.Fatalf("expected read_only explain_task_assignment allowed, got %#v", assignmentReadOnlyRes)
	}
	if repo.updateInput != nil {
		t.Fatalf("read_only explain_task_assignment must not call update usecase, got %#v", repo.updateInput)
	}
	upsertParams := mustJSONRPCStruct(t, map[string]any{
		"source_type":         "generic-source",
		"source_id":           float64(1),
		"business_status_key": "project_approved",
		"payload":             map[string]any{},
	})
	_, upsertReadOnlyRes, err := dispatcher.handleWorkflow(ctx, "upsert_business_state", "removed-upsert", upsertParams)
	if err != nil {
		t.Fatalf("expected nil err for removed upsert method, got %v", err)
	}
	if upsertReadOnlyRes == nil || upsertReadOnlyRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("public upsert_business_state must stay removed, got %#v", upsertReadOnlyRes)
	}
	if repo.upsertStateInput != nil {
		t.Fatalf("removed public method must not call business state usecase, got %#v", repo.upsertStateInput)
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

func TestJsonrpcDispatcher_WorkflowCreateTaskRejectsProcessRuntimeAnchors(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskCreate)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	ctx := workflowJSONRPCAdminContext()
	baseParams := map[string]any{
		"task_code":       "WF-PUBLIC-CREATE-001",
		"task_group":      "generic",
		"task_name":       "普通协同任务",
		"source_type":     "generic-source",
		"source_id":       float64(1),
		"task_status_key": "ready",
		"owner_role_key":  biz.SalesRoleKey,
		"priority":        float64(1),
		"payload":         map[string]any{},
	}

	tests := []struct {
		name  string
		key   string
		value any
	}{
		{name: "config revision", key: "config_revision", value: "customer-rev-1"},
		{name: "process instance", key: "process_instance_id", value: float64(10)},
		{name: "process node instance", key: "process_node_instance_id", value: float64(20)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := make(map[string]any, len(baseParams)+1)
			for key, value := range baseParams {
				params[key] = value
			}
			params[tt.key] = tt.value
			repo.createInput = nil

			_, res, err := dispatcher.handleWorkflow(ctx, "create_task", tt.name, mustJSONRPCStruct(t, params))
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code {
				t.Fatalf("expected %s rejected, got %#v", tt.key, res)
			}
			if !strings.Contains(res.Message, tt.key) || !strings.Contains(res.Message, "服务端") {
				t.Fatalf("expected system-owned anchor message for %s, got %q", tt.key, res.Message)
			}
			if repo.createInput != nil {
				t.Fatalf("rejected %s must not call create usecase, got %#v", tt.key, repo.createInput)
			}
		})
	}

	_, res, err := dispatcher.handleWorkflow(ctx, "create_task", "manual-task", mustJSONRPCStruct(t, baseParams))
	if err != nil {
		t.Fatalf("expected nil err for manual task, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected manual task create OK, got %#v", res)
	}
	if repo.createInput == nil || repo.createInput.ProcessInstanceID != nil || repo.createInput.ProcessNodeInstanceID != nil || repo.createInput.ConfigRevision != nil {
		t.Fatalf("expected manual task without process runtime anchors, got %#v", repo.createInput)
	}
}

func TestJsonrpcDispatcher_WorkflowUpdateTaskStatusRemoved(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskComplete)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"id":              float64(42),
		"task_status_key": "done",
		"payload":         map[string]any{},
	})

	_, res, err := dispatcher.handleWorkflow(workflowJSONRPCAdminContext(), "update_task_status", "removed", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.UnknownMethod.Code {
		t.Fatalf("expected update_task_status removed as unknown method, got %#v", res)
	}
	if repo.updateInput != nil {
		t.Fatalf("removed update_task_status must not call workflow usecase, got %#v", repo.updateInput)
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
		"task_id": float64(1),
		"action":  "urge_task",
		"reason":  "请今天确认",
		"payload": map[string]any{
			"entry": "mobile_role_task",
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

func TestJsonrpcDispatcher_WorkflowUrgeTaskRejectsClientControlledSystemFields(t *testing.T) {
	tests := []struct {
		name   string
		params map[string]any
	}{
		{
			name: "rejects raw task status",
			params: map[string]any{
				"task_id":         float64(1),
				"action":          "urge_task",
				"reason":          "请今天确认",
				"task_status_key": "done",
				"payload":         map[string]any{},
			},
		},
		{
			name: "rejects client business status",
			params: map[string]any{
				"task_id":             float64(1),
				"action":              "urge_task",
				"reason":              "请今天确认",
				"business_status_key": "project_approved",
				"payload":             map[string]any{},
			},
		},
		{
			name: "rejects client actor role",
			params: map[string]any{
				"task_id":        float64(1),
				"action":         "urge_task",
				"reason":         "请今天确认",
				"actor_role_key": biz.FinanceRoleKey,
				"payload":        map[string]any{},
			},
		},
		{
			name: "rejects payload source fields",
			params: map[string]any{
				"task_id": float64(1),
				"action":  "urge_task",
				"reason":  "请今天确认",
				"payload": map[string]any{
					"source_type": "shipment",
				},
			},
		},
		{
			name: "rejects payload domain command fields",
			params: map[string]any{
				"task_id": float64(1),
				"action":  "urge_task",
				"reason":  "请今天确认",
				"payload": map[string]any{
					"domain_command_key": "shipment.ship",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
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
			params, err := structpb.NewStruct(tt.params)
			if err != nil {
				t.Fatalf("build params failed: %v", err)
			}

			_, res, err := j.handleWorkflow(ctx, "urge_task", "1", params)
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code {
				t.Fatalf("expected invalid param, got %#v", res)
			}
			if repo.urgeInput != nil {
				t.Fatalf("invalid urge request must not call usecase, got %#v", repo.urgeInput)
			}
		})
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
				ScopeValue:    biz.DefaultCustomerKey,
				Enabled:       true,
			})
		}
	}
	return workflowCustomerConfigUCWithMembershipsAndEntitlements(memberships, entitlements)
}

func workflowCustomerConfigUCWithMembershipsAndEntitlements(memberships []biz.WorkPoolMembershipInput, entitlements []biz.AccessEntitlementInput) *biz.CustomerConfigUsecase {
	return workflowCustomerConfigUCWithMembershipsEntitlementsAndProfiles(memberships, entitlements, nil)
}

func workflowCustomerConfigUCWithMembershipsEntitlementsAndProfiles(
	memberships []biz.WorkPoolMembershipInput,
	entitlements []biz.AccessEntitlementInput,
	profiles []biz.RoleProfileInput,
) *biz.CustomerConfigUsecase {
	repo := newServiceCustomerConfigRepo()
	key := serviceCustomerConfigKey(biz.DefaultCustomerKey, "workflow-visible-rev")
	roleKeys := map[string]struct{}{}
	roleKeys[biz.SalesRoleKey] = struct{}{}
	for _, capabilityKey := range []string{
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskCreate,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	} {
		entitlements = append(entitlements, biz.AccessEntitlementInput{
			RoleKey:       biz.SalesRoleKey,
			CapabilityKey: capabilityKey,
			ScopeType:     "customer",
			ScopeValue:    biz.DefaultCustomerKey,
			Enabled:       true,
		})
	}
	for _, membership := range memberships {
		if roleKey := biz.NormalizeRoleKey(membership.RoleKey); roleKey != "" {
			roleKeys[roleKey] = struct{}{}
		}
	}
	for _, entitlement := range entitlements {
		if roleKey := biz.NormalizeRoleKey(entitlement.RoleKey); roleKey != "" {
			roleKeys[roleKey] = struct{}{}
		}
	}
	profileByRole := map[string]biz.RoleProfileInput{}
	for _, profile := range profiles {
		if roleKey := biz.NormalizeRoleKey(profile.RoleKey); roleKey != "" {
			profileByRole[roleKey] = profile
		}
	}
	for roleKey := range roleKeys {
		profile, ok := profileByRole[roleKey]
		if !ok {
			profile = biz.RoleProfileInput{RoleKey: roleKey, DisplayName: roleKey}
		}
		repo.profiles[key] = append(repo.profiles[key], profile)
	}
	repo.revisions[key] = &biz.CustomerConfigRevision{
		CustomerKey:      biz.DefaultCustomerKey,
		Revision:         "workflow-visible-rev",
		ProductVersion:   "test",
		ConfigHash:       "workflow-visible-hash",
		Status:           biz.CustomerConfigStatusActive,
		CompiledSnapshot: map[string]any{"customer": map[string]any{"key": biz.DefaultCustomerKey}},
	}
	repo.memberships[key] = append([]biz.WorkPoolMembershipInput(nil), memberships...)
	repo.entitlements[key] = append([]biz.AccessEntitlementInput(nil), entitlements...)
	repo.modules[key] = []biz.DeploymentModuleStateInput{{ModuleKey: workflowModuleKeyTasks, State: "enabled"}}
	return biz.NewCustomerConfigUsecase(repo)
}

func TestJsonrpcDispatcherWorkflowVisibleOwnerRoleKeysFixedCustomerFailsClosed(t *testing.T) {
	admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskRead)

	t.Run("fixed customer missing active revision", func(t *testing.T) {
		t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
		j := &jsonrpcDispatcher{
			log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
			customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
		}
		if roleKeys := j.workflowVisibleOwnerRoleKeys(context.Background(), admin, biz.PermissionWorkflowTaskRead); len(roleKeys) != 0 {
			t.Fatalf("fixed customer without active revision must fail closed, got %#v", roleKeys)
		}
	})

	t.Run("fixed customer repository error", func(t *testing.T) {
		t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
		repo := newServiceCustomerConfigRepo()
		repo.activeErr = errors.New("customer config repository unavailable")
		j := &jsonrpcDispatcher{
			log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
			customerConfigUC: biz.NewCustomerConfigUsecase(repo),
		}
		if roleKeys := j.workflowVisibleOwnerRoleKeys(context.Background(), admin, biz.PermissionWorkflowTaskRead); len(roleKeys) != 0 {
			t.Fatalf("fixed customer repository error must fail closed, got %#v", roleKeys)
		}
	})

	t.Run("demo runtime keeps explicit builtin fallback", func(t *testing.T) {
		t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
		j := &jsonrpcDispatcher{
			log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
			customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
		}
		roleKeys := j.workflowVisibleOwnerRoleKeys(context.Background(), admin, biz.PermissionWorkflowTaskRead)
		if len(roleKeys) != 1 || roleKeys[0] != biz.WarehouseRoleKey {
			t.Fatalf("demo fallback roles = %#v", roleKeys)
		}
	})
}

func TestWorkflowTaskAccessRequiresEligibleOwnerRoleOrExactAssignee(t *testing.T) {
	admin := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	)
	task := &biz.WorkflowTask{
		ID:            701,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.WarehouseRoleKey,
	}

	if workflowAdminCanViewTask(admin, task, nil) ||
		workflowAdminCanHandleTask(admin, task, "done", nil) ||
		workflowAdminCanUrgeTask(admin, task, nil) {
		t.Fatal("raw owner role must not bypass an empty customer-eligible role set")
	}

	processID, nodeID := 11, 12
	terminalTask := *task
	terminalTask.TaskStatusKey = "done"
	terminalTask.ProcessInstanceID = &processID
	terminalTask.ProcessNodeInstanceID = &nodeID
	if workflowAdminCanReconcileLinkedTask(admin, &terminalTask, nil) {
		t.Fatal("raw owner role must not bypass customer eligibility during linked-task reconciliation")
	}
	pmcAdmin := workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate)
	if workflowAdminCanViewTask(pmcAdmin, task, nil) {
		t.Fatal("PMC oversight view must still require an eligible customer role")
	}
	if !workflowAdminCanViewTask(pmcAdmin, task, []string{biz.PMCRoleKey}) {
		t.Fatal("eligible PMC role must keep oversight view access")
	}

	if !workflowAdminCanViewTask(admin, task, []string{biz.WarehouseRoleKey}) ||
		!workflowAdminCanHandleTask(admin, task, "done", []string{biz.WarehouseRoleKey}) ||
		!workflowAdminCanUrgeTask(admin, task, []string{biz.WarehouseRoleKey}) {
		t.Fatal("matching customer-eligible warehouse role must keep ordinary workflow access")
	}

	assigneeID := admin.ID
	assignedTask := *task
	assignedTask.AssigneeID = &assigneeID
	if !workflowAdminCanViewTask(admin, &assignedTask, nil) ||
		!workflowAdminCanHandleTask(admin, &assignedTask, "done", nil) ||
		!workflowAdminCanUrgeTask(admin, &assignedTask, nil) {
		t.Fatal("exact assignee must remain allowed without owner-role eligibility")
	}
	assignedTerminalTask := terminalTask
	assignedTerminalTask.AssigneeID = &assigneeID
	if !workflowAdminCanReconcileLinkedTask(admin, &assignedTerminalTask, nil) {
		t.Fatal("exact assignee must remain allowed to reconcile its linked terminal task")
	}
}

func TestWorkflowTaskUrgeAndBreakGlassSpecialRolesRemainAvailable(t *testing.T) {
	task := &biz.WorkflowTask{ID: 702, TaskStatusKey: "ready", OwnerRoleKey: biz.WarehouseRoleKey}
	for _, roleKey := range []string{biz.PMCRoleKey, biz.BossRoleKey} {
		admin := workflowJSONRPCAdmin([]string{roleKey}, biz.PermissionWorkflowTaskUpdate)
		if !workflowAdminCanUrgeTask(admin, task, nil) {
			t.Fatalf("%s must keep oversight urge access", roleKey)
		}
	}
	superAdmin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey}, biz.PermissionWorkflowTaskUpdate, biz.PermissionWorkflowTaskComplete)
	superAdmin.IsSuperAdmin = true
	if !workflowAdminCanUrgeTask(superAdmin, task, nil) {
		t.Fatal("super admin must keep urge access")
	}
	if !workflowAdminCanUseBreakGlass(superAdmin, task, "done") {
		t.Fatal("super admin must keep explicit break-glass access")
	}
	if workflowAdminCanUseBreakGlass(workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete), task, "done") {
		t.Fatal("ordinary workflow owner must not gain break-glass access")
	}
}

func TestJsonrpcDispatcherWorkflowExplainUsesCustomerEligibleOwnerDecision(t *testing.T) {
	tests := []struct {
		name         string
		profile      biz.RoleProfileInput
		wantAllowed  bool
		wantActorKey string
	}{
		{
			name:         "matching warehouse profile remains effective",
			profile:      biz.RoleProfileInput{RoleKey: biz.WarehouseRoleKey, DisplayName: "仓库"},
			wantAllowed:  true,
			wantActorKey: biz.WarehouseRoleKey,
		},
		{
			name:    "revoked warehouse profile is not reported as effective owner",
			profile: biz.RoleProfileInput{RoleKey: biz.WarehouseRoleKey, DisplayName: "仓库", Revokes: []string{biz.PermissionWorkflowTaskComplete}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
			task := &biz.WorkflowTask{
				ID:            703,
				TaskGroup:     "warehouse_inbound",
				SourceType:    "inbound",
				SourceID:      1,
				TaskStatusKey: "ready",
				OwnerRoleKey:  biz.WarehouseRoleKey,
				Payload:       map[string]any{},
			}
			admin := workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWorkflowTaskComplete)
			j := &jsonrpcDispatcher{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
				adminReader: stubAdminAccountReader{admin: admin},
				customerConfigUC: workflowCustomerConfigUCWithMembershipsEntitlementsAndProfiles(
					[]biz.WorkPoolMembershipInput{{PoolKey: biz.WarehouseRoleKey, RoleKey: biz.WarehouseRoleKey, Enabled: true}},
					[]biz.AccessEntitlementInput{{
						RoleKey:       biz.WarehouseRoleKey,
						CapabilityKey: biz.PermissionWorkflowTaskComplete,
						ScopeType:     "customer",
						ScopeValue:    biz.DefaultCustomerKey,
						Enabled:       true,
					}},
					[]biz.RoleProfileInput{tt.profile},
				),
			}
			action := j.workflowTaskActionAccessToMap(workflowJSONRPCAdminContext(), admin, task, workflowTaskActionExplainContract{
				ActionKey:          "complete",
				StatusKey:          "done",
				RequiredPermission: biz.PermissionWorkflowTaskComplete,
			})
			if action["allowed"] != tt.wantAllowed {
				t.Fatalf("allowed = %#v, want %v; action=%#v", action["allowed"], tt.wantAllowed, action)
			}
			if action["owner_role_matched"] != tt.wantAllowed {
				t.Fatalf("owner_role_matched = %#v, want %v; action=%#v", action["owner_role_matched"], tt.wantAllowed, action)
			}
			if action["actor_role_key"] != tt.wantActorKey {
				t.Fatalf("actor_role_key = %#v, want %q; action=%#v", action["actor_role_key"], tt.wantActorKey, action)
			}
			visibleRoleKeys, ok := action["visible_owner_role_keys"].([]any)
			if !ok || anyStringSliceContains(visibleRoleKeys, biz.WarehouseRoleKey) != tt.wantAllowed {
				t.Fatalf("visible owner roles must reuse effective decision, got %#v", action["visible_owner_role_keys"])
			}
			configuredRoleKeys, ok := action["configured_candidate_owner_role_keys"].([]any)
			if !ok || anyStringSliceContains(configuredRoleKeys, biz.WarehouseRoleKey) != tt.wantAllowed {
				t.Fatalf("configured candidates must honor the same profile decision, got %#v", action["configured_candidate_owner_role_keys"])
			}
		})
	}
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
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
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
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
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

func TestJsonrpcDispatcher_WorkflowUrgeTaskRejectsEmptyReason(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionWorkflowTaskUpdate)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
	}
	params, err := structpb.NewStruct(map[string]any{
		"task_id": float64(1),
		"action":  "urge_task",
		"reason":  " \t ",
		"payload": map[string]any{
			"source_no": "SHIP-001",
		},
	})
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "urge_task", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for empty urge reason, got %#v", res)
	}
	if repo.urgeInput != nil {
		t.Fatalf("empty urge reason must not record urge input, got %#v", repo.urgeInput)
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
	if repo.updateInput.Payload["entry"] != "mobile_role_task" {
		t.Fatalf("expected mobile payload to pass through, got %#v", repo.updateInput.Payload)
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

func TestJsonrpcDispatcher_WorkflowRejectTaskActionSettlesLinkedProcessNode(t *testing.T) {
	processID := 10
	nodeID := 20
	repo := &stubWorkflowJSONRPCRepo{currentTask: &biz.WorkflowTask{
		ID:                    42,
		TaskGroup:             "order_approval",
		SourceType:            "sales_order",
		SourceID:              1001,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          biz.BossRoleKey,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
		Payload:               map[string]any{},
	}}
	processRepo := &stubProcessRuntimeJSONRPCRepo{node: &biz.ProcessNodeInstance{
		ID:                nodeID,
		ProcessInstanceID: processID,
		NodeType:          biz.ProcessNodeTypeApproval,
		Status:            biz.ProcessNodeStatusActive,
		Version:           4,
	}}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionWorkflowTaskReject)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
		processRuntimeUC: biz.NewProcessRuntimeUsecase(processRepo, repo),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"task_id":    float64(42),
		"action_key": "reject",
		"reason":     "客户交期尚未确认",
		"payload":    map[string]any{},
	})

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "reject_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK response, got %#v", res)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != "rejected" {
		t.Fatalf("expected rejected process node settlement, got %#v", processRepo.completedNode)
	}
	if processRepo.blockedProcess == nil || processRepo.blockedProcess.ID != processID {
		t.Fatalf("linked rejection without route must block process, got %#v", processRepo.blockedProcess)
	}
}

func TestJsonrpcDispatcher_WorkflowRejectTaskActionRetryReconcilesWithoutTaskRewrite(t *testing.T) {
	processID := 10
	nodeID := 20
	reason := "客户交期尚未确认"
	repo := &stubWorkflowJSONRPCRepo{currentTask: &biz.WorkflowTask{
		ID:                    42,
		TaskGroup:             "order_approval",
		SourceType:            "sales_order",
		SourceID:              1001,
		TaskStatusKey:         "rejected",
		OwnerRoleKey:          biz.BossRoleKey,
		BlockedReason:         &reason,
		ProcessInstanceID:     &processID,
		ProcessNodeInstanceID: &nodeID,
		Payload:               map[string]any{"rejected_reason": reason},
	}}
	processRepo := &stubProcessRuntimeJSONRPCRepo{node: &biz.ProcessNodeInstance{
		ID:                nodeID,
		ProcessInstanceID: processID,
		NodeType:          biz.ProcessNodeTypeApproval,
		Status:            biz.ProcessNodeStatusActive,
		Version:           4,
	}}
	j := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.test")),
		adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionWorkflowTaskReject)},
		workflowUC:       biz.NewWorkflowUsecase(repo),
		customerConfigUC: workflowCustomerConfigUCWithWorkflowTasksState(t, "enabled"),
		processRuntimeUC: biz.NewProcessRuntimeUsecase(processRepo, repo),
	}
	params := mustJSONRPCStruct(t, map[string]any{
		"task_id":    float64(42),
		"action_key": "reject",
		"reason":     reason,
		"payload":    map[string]any{},
	})

	_, res, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "reject_task_action", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected retry reconciliation OK, got %#v", res)
	}
	if repo.updateInput != nil {
		t.Fatalf("same terminal retry must not rewrite task or duplicate side effects, got %#v", repo.updateInput)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != "rejected" {
		t.Fatalf("expected retry to settle still-active linked node, got %#v", processRepo.completedNode)
	}

	processRepo.completedNode = nil
	mismatchParams := mustJSONRPCStruct(t, map[string]any{
		"task_id":    float64(42),
		"action_key": "reject",
		"reason":     "另一个退回原因",
		"payload":    map[string]any{},
	})
	_, mismatchRes, err := j.handleWorkflow(workflowJSONRPCAdminContext(), "reject_task_action", "2", mismatchParams)
	if err != nil {
		t.Fatalf("expected nil err for mismatched retry, got %v", err)
	}
	if mismatchRes == nil || mismatchRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected mismatched terminal retry rejected, got %#v", mismatchRes)
	}
	if processRepo.completedNode != nil || repo.updateInput != nil {
		t.Fatalf("mismatched terminal retry must not mutate task or process")
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
			if repo.updateInput.Payload["entry"] != "mobile_role_task" {
				t.Fatalf("expected mobile payload to pass through, got %#v", repo.updateInput.Payload)
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
			name:       "complete rejects legacy id fallback",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"id":         float64(1),
				"action_key": "complete",
				"payload":    map[string]any{},
			},
		},
		{
			name:       "complete requires formal task id",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"action_key": "complete",
				"payload":    map[string]any{},
			},
		},
		{
			name:       "complete rejects client business status",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"task_id":             float64(1),
				"action_key":          "complete",
				"business_status_key": "project_approved",
				"payload":             map[string]any{},
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
			name:       "complete rejects payload source fields",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"task_id":    float64(1),
				"action_key": "complete",
				"payload": map[string]any{
					"source_type": "purchase_receipt",
				},
			},
		},
		{
			name:       "complete rejects payload domain command fields",
			method:     "complete_task_action",
			permission: biz.PermissionWorkflowTaskComplete,
			params: map[string]any{
				"task_id":    float64(1),
				"action_key": "complete",
				"payload": map[string]any{
					"command_key": "inventory.post_inbound",
				},
			},
		},
		{
			name:       "reject rejects payload owner role",
			method:     "reject_task_action",
			permission: biz.PermissionWorkflowTaskReject,
			params: map[string]any{
				"task_id":    float64(1),
				"action_key": "reject",
				"reason":     "资料不全",
				"payload": map[string]any{
					"owner_role_key": biz.FinanceRoleKey,
				},
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

func TestJsonrpcDispatcher_WorkflowReadOnlyTaskExplainRejectsLegacyIDParam(t *testing.T) {
	tests := []struct {
		name   string
		method string
		params map[string]any
	}{
		{
			name:   "explain action rejects legacy id fallback",
			method: "explain_action_access",
			params: map[string]any{
				"id":         float64(1),
				"action_key": "complete",
			},
		},
		{
			name:   "explain assignment rejects legacy id fallback",
			method: "explain_task_assignment",
			params: map[string]any{
				"id": float64(1),
			},
		},
		{
			name:   "explain action requires formal task id",
			method: "explain_action_access",
			params: map[string]any{
				"action_key": "complete",
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
				adminReader:      stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, biz.PermissionWorkflowTaskRead)},
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
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
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
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
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
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
				{RoleKey: biz.WarehouseRoleKey, CapabilityKey: biz.PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: biz.DefaultCustomerKey, Enabled: true},
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
