package biz

import (
	"context"
	"errors"
	"testing"
)

func TestEngineeringMaterialWorkflowRejectsGenericTaskMutations(t *testing.T) {
	for _, group := range []string{WorkflowMaterialBossReviewGroup, WorkflowMaterialFinanceReviewGroup, WorkflowMaterialRevisionGroup} {
		for _, status := range []string{"done", "rejected", "blocked"} {
			reason := "需要核对材料"
			repo := &stubWorkflowRepo{currentTask: &WorkflowTask{ID: 1, Version: 1, TaskGroup: group, TaskStatusKey: "ready", OwnerRoleKey: BossRoleKey}}
			_, err := updateWorkflowTaskStatusForTest(t, NewWorkflowUsecase(repo), context.Background(), &WorkflowTaskStatusUpdate{ID: 1, TaskStatusKey: status, Reason: reason}, 22, BossRoleKey)
			if !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) || repo.updateTaskInput != nil {
				t.Fatalf("generic action bypassed %s source: %s %v", group, status, err)
			}
		}
		if err := ValidatePublicWorkflowTaskNamespace(group, "manual"); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
			t.Fatal(err)
		}
		if err := ValidatePublicWorkflowTaskNamespace("manual", WorkflowSourceTaskCode(group, 1)); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
			t.Fatal(err)
		}
	}
}
