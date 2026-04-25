package biz

import (
	"context"
	"errors"
	"testing"
)

type stubWorkflowRepo struct {
	createTaskInput  *WorkflowTaskCreate
	updateTaskInput  *WorkflowTaskStatusUpdate
	upsertStateInput *WorkflowBusinessStateUpsert
	listTaskCalled   bool
}

func (s *stubWorkflowRepo) ListWorkflowTasks(context.Context, WorkflowTaskFilter) ([]*WorkflowTask, int, error) {
	s.listTaskCalled = true
	return nil, 0, nil
}

func (s *stubWorkflowRepo) CreateWorkflowTask(_ context.Context, in *WorkflowTaskCreate, _ int) (*WorkflowTask, error) {
	s.createTaskInput = in
	return &WorkflowTask{
		TaskCode:      in.TaskCode,
		TaskStatusKey: in.TaskStatusKey,
		Payload:       in.Payload,
	}, nil
}

func (s *stubWorkflowRepo) UpdateWorkflowTaskStatus(_ context.Context, in *WorkflowTaskStatusUpdate, _ int, _ string) (*WorkflowTask, error) {
	s.updateTaskInput = in
	return &WorkflowTask{
		ID:                in.ID,
		TaskStatusKey:     in.TaskStatusKey,
		BusinessStatusKey: &in.BusinessStatusKey,
		Payload:           in.Payload,
	}, nil
}

func (s *stubWorkflowRepo) ListWorkflowBusinessStates(context.Context, WorkflowBusinessStateFilter) ([]*WorkflowBusinessState, int, error) {
	return nil, 0, nil
}

func (s *stubWorkflowRepo) UpsertWorkflowBusinessState(_ context.Context, in *WorkflowBusinessStateUpsert, _ int) (*WorkflowBusinessState, error) {
	s.upsertStateInput = in
	return &WorkflowBusinessState{
		SourceType:        in.SourceType,
		SourceID:          in.SourceID,
		BusinessStatusKey: in.BusinessStatusKey,
		Payload:           in.Payload,
	}, nil
}

func TestWorkflowUsecase_CreateTaskDefaultsPending(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	task, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:     "T-001",
		TaskGroup:    "order",
		TaskName:     "确认资料",
		SourceType:   "project_order",
		SourceID:     1,
		OwnerRoleKey: "merchandiser",
	}, 7)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if task.TaskStatusKey != "pending" {
		t.Fatalf("expected pending, got %q", task.TaskStatusKey)
	}
	if repo.createTaskInput == nil {
		t.Fatalf("expected repo input")
	}
	if repo.createTaskInput.Payload == nil {
		t.Fatalf("expected payload default to empty map")
	}
}

func TestWorkflowUsecase_CreateTaskRejectsInvalidBusinessStatus(t *testing.T) {
	invalid := "unknown"
	uc := NewWorkflowUsecase(&stubWorkflowRepo{})

	_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:          "T-001",
		TaskGroup:         "order",
		TaskName:          "确认资料",
		SourceType:        "project_order",
		SourceID:          1,
		OwnerRoleKey:      "merchandiser",
		BusinessStatusKey: &invalid,
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
}

func TestWorkflowBusinessStatesAcceptPurchaseInboundStatuses(t *testing.T) {
	expectedStatuses := map[string]struct{}{
		"iqc_pending":               {},
		"qc_failed":                 {},
		"warehouse_inbound_pending": {},
		"inbound_done":              {},
	}

	states := WorkflowBusinessStates()
	stateKeys := make(map[string]struct{}, len(states))
	for _, state := range states {
		stateKeys[state.Key] = struct{}{}
	}

	for statusKey := range expectedStatuses {
		if !IsValidWorkflowBusinessState(statusKey) {
			t.Fatalf("expected %q to be valid", statusKey)
		}
		if _, ok := stateKeys[statusKey]; !ok {
			t.Fatalf("expected WorkflowBusinessStates to include %q", statusKey)
		}
	}
}

func TestWorkflowBusinessStatesAcceptShipmentPendingStatus(t *testing.T) {
	const statusKey = "shipment_pending"

	if !IsValidWorkflowBusinessState(statusKey) {
		t.Fatalf("expected %q to be valid", statusKey)
	}

	states := WorkflowBusinessStates()
	for _, state := range states {
		if state.Key == statusKey {
			return
		}
	}
	t.Fatalf("expected WorkflowBusinessStates to include %q", statusKey)
}

func TestWorkflowUsecase_AcceptsPurchaseInboundBusinessStatuses(t *testing.T) {
	validStatuses := []string{
		"iqc_pending",
		"qc_failed",
		"warehouse_inbound_pending",
		"inbound_done",
	}

	for _, statusKey := range validStatuses {
		t.Run(statusKey, func(t *testing.T) {
			repo := &stubWorkflowRepo{}
			uc := NewWorkflowUsecase(repo)

			createStatusKey := statusKey
			_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
				TaskCode:          "T-" + statusKey,
				TaskGroup:         "purchase",
				TaskName:          "采购入库闭环任务",
				SourceType:        "inbound",
				SourceID:          1,
				OwnerRoleKey:      "quality",
				BusinessStatusKey: &createStatusKey,
			}, 7)
			if err != nil {
				t.Fatalf("CreateTask should accept %q, got %v", statusKey, err)
			}
			if repo.createTaskInput == nil || repo.createTaskInput.BusinessStatusKey == nil || *repo.createTaskInput.BusinessStatusKey != statusKey {
				t.Fatalf("expected CreateTask repo input to keep %q", statusKey)
			}

			_, err = uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:                1,
				TaskStatusKey:     "ready",
				BusinessStatusKey: statusKey,
			}, 7, "quality")
			if err != nil {
				t.Fatalf("UpdateTaskStatus should accept %q, got %v", statusKey, err)
			}
			if repo.updateTaskInput == nil || repo.updateTaskInput.BusinessStatusKey != statusKey {
				t.Fatalf("expected UpdateTaskStatus repo input to keep %q", statusKey)
			}

			_, err = uc.UpsertBusinessState(context.Background(), &WorkflowBusinessStateUpsert{
				SourceType:        "inbound",
				SourceID:          1,
				BusinessStatusKey: statusKey,
			}, 7)
			if err != nil {
				t.Fatalf("UpsertBusinessState should accept %q, got %v", statusKey, err)
			}
			if repo.upsertStateInput == nil || repo.upsertStateInput.BusinessStatusKey != statusKey {
				t.Fatalf("expected UpsertBusinessState repo input to keep %q", statusKey)
			}
		})
	}
}

func TestWorkflowUsecase_AcceptsShipmentPendingBusinessStatus(t *testing.T) {
	const statusKey = "shipment_pending"

	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	createStatusKey := statusKey
	_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:          "T-shipment-pending",
		TaskGroup:         "shipment_release",
		TaskName:          "出货放行 / 出货准备",
		SourceType:        "production-progress",
		SourceID:          1,
		OwnerRoleKey:      "warehouse",
		BusinessStatusKey: &createStatusKey,
	}, 7)
	if err != nil {
		t.Fatalf("CreateTask should accept %q, got %v", statusKey, err)
	}
	if repo.createTaskInput == nil || repo.createTaskInput.BusinessStatusKey == nil || *repo.createTaskInput.BusinessStatusKey != statusKey {
		t.Fatalf("expected CreateTask repo input to keep %q", statusKey)
	}

	_, err = uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:                1,
		TaskStatusKey:     "ready",
		BusinessStatusKey: statusKey,
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("UpdateTaskStatus should accept %q, got %v", statusKey, err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.BusinessStatusKey != statusKey {
		t.Fatalf("expected UpdateTaskStatus repo input to keep %q", statusKey)
	}

	_, err = uc.UpsertBusinessState(context.Background(), &WorkflowBusinessStateUpsert{
		SourceType:        "production-progress",
		SourceID:          1,
		BusinessStatusKey: statusKey,
	}, 7)
	if err != nil {
		t.Fatalf("UpsertBusinessState should accept %q, got %v", statusKey, err)
	}
	if repo.upsertStateInput == nil || repo.upsertStateInput.BusinessStatusKey != statusKey {
		t.Fatalf("expected UpsertBusinessState repo input to keep %q", statusKey)
	}
}

func TestWorkflowUsecase_ListTasksRejectsInvalidStatus(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	_, _, err := uc.ListTasks(context.Background(), WorkflowTaskFilter{TaskStatusKey: "unknown"})
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.listTaskCalled {
		t.Fatalf("repo should not be called for invalid status")
	}
}

func TestWorkflowUsecase_UpsertBusinessStateRejectsInvalidStatus(t *testing.T) {
	uc := NewWorkflowUsecase(&stubWorkflowRepo{})

	_, err := uc.UpsertBusinessState(context.Background(), &WorkflowBusinessStateUpsert{
		SourceType:        "project_order",
		SourceID:          1,
		BusinessStatusKey: "unknown",
	}, 7)
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
}
