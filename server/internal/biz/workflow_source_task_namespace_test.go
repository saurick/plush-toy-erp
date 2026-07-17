package biz

import (
	"context"
	"errors"
	"testing"
)

func TestValidateWorkflowSourceTaskReservedNamespace(t *testing.T) {
	for _, taskGroup := range workflowSourceTaskGroups {
		t.Run("group "+taskGroup, func(t *testing.T) {
			if err := ValidateWorkflowSourceTaskReservedNamespace(" "+taskGroup+" ", "MANUAL"); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
				t.Fatalf("error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
			}
		})

		t.Run("code "+taskGroup, func(t *testing.T) {
			code := WorkflowSourceTaskCode(taskGroup, 23)
			if err := ValidateWorkflowSourceTaskReservedNamespace("trial_task", " "+code+" "); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
				t.Fatalf("error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
			}
		})
	}

	if err := ValidateWorkflowSourceTaskReservedNamespace("trial_task", "TRIAL-23"); err != nil {
		t.Fatalf("ordinary task namespace error = %v", err)
	}
}

func TestWorkflowUsecaseCreateTaskRejectsReservedSourceTaskCodePrefix(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:     WorkflowSourceTaskCode(WorkflowSourceTaskShipmentReleaseGroup, 23),
		TaskGroup:    "trial_task",
		TaskName:     "不应占用来源任务编号",
		SourceType:   "trial-source",
		SourceID:     23,
		OwnerRoleKey: WarehouseRoleKey,
	}, 7)
	if !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
		t.Fatalf("CreateTask error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
	}
	if repo.createTaskInput != nil {
		t.Fatal("reserved task-code prefix must not reach the workflow repo")
	}
}
