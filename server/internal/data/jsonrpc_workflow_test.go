package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubWorkflowJSONRPCRepo struct {
	urgeInput        *biz.WorkflowTaskUrge
	urgeActorID      int
	urgeActorRoleKey string
}

func (s *stubWorkflowJSONRPCRepo) ListWorkflowTasks(context.Context, biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	return nil, 0, nil
}

func (s *stubWorkflowJSONRPCRepo) CreateWorkflowTask(_ context.Context, in *biz.WorkflowTaskCreate, _ int) (*biz.WorkflowTask, error) {
	return &biz.WorkflowTask{ID: 1, TaskStatusKey: in.TaskStatusKey, Payload: in.Payload}, nil
}

func (s *stubWorkflowJSONRPCRepo) UpdateWorkflowTaskStatus(_ context.Context, in *biz.WorkflowTaskStatusUpdate, _ int, _ string) (*biz.WorkflowTask, error) {
	return &biz.WorkflowTask{ID: in.ID, TaskStatusKey: in.TaskStatusKey, Payload: in.Payload}, nil
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

func (s *stubWorkflowJSONRPCRepo) UpsertWorkflowBusinessState(_ context.Context, in *biz.WorkflowBusinessStateUpsert, _ int) (*biz.WorkflowBusinessState, error) {
	return &biz.WorkflowBusinessState{ID: 1, BusinessStatusKey: in.BusinessStatusKey, Payload: in.Payload}, nil
}

func TestJsonrpcData_WorkflowUrgeTaskRecordsEventIntent(t *testing.T) {
	repo := &stubWorkflowJSONRPCRepo{}
	j := &JsonrpcData{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.test")),
		adminReader: stubAdminAccountReader{admin: &biz.AdminUser{ID: 7, Username: "admin"}},
		workflowUC:  biz.NewWorkflowUsecase(repo),
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
		"actor_role_key": "pmc",
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
