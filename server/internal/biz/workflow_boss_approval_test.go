package biz

import (
	"context"
	"testing"
)

func TestWorkflowApprovalCapabilityDoesNotDeriveSalesSpecificSideEffects(t *testing.T) {
	capability := PermissionWorkflowTaskApprove
	task := bossApprovalWorkflowTask()
	task.RequiredCapabilityKey = &capability
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Reason:        "同意按当前交期执行",
		Payload:       map[string]any{"feedback": "同意按当前交期执行"},
	}, 7, BossRoleKey)
	if err != nil {
		t.Fatalf("complete generic approval: %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatal("expected workflow update")
	}
	if repo.updateTaskInput.SideEffects != nil || repo.updateTaskInput.BusinessStatusKey != "" {
		t.Fatalf("approval capability must not invoke sales-specific workflow side effects: %#v", repo.updateTaskInput)
	}
}

func TestWorkflowApprovalClassificationIgnoresSalesRoleAndNames(t *testing.T) {
	legacy := bossApprovalWorkflowTask()
	legacy.RequiredCapabilityKey = nil
	if IsWorkflowApprovalTask(legacy) {
		t.Fatal("sales source, order_approval group and boss role must not classify approval")
	}
	capability := PermissionWorkflowTaskApprove
	generic := &WorkflowTask{RequiredCapabilityKey: &capability}
	if !IsWorkflowApprovalTask(generic) {
		t.Fatal("workflow.task.approve capability must classify approval")
	}
}
