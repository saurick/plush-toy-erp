package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_PurchaseIQCDoneDerivesWarehouseInboundTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected business status %q, got %q", workflowWarehouseInboundPendingKey, repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "pass" {
		t.Fatalf("expected qc_result pass in update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected IQC done side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "purchase_iqc_done_to_warehouse_inbound" {
		t.Fatalf("expected IQC done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowWarehouseInboundPendingKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected IQC done business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowWarehouseInboundTaskGroup ||
		task.TaskName != "确认入库" ||
		task.OwnerRoleKey != "warehouse" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected warehouse inbound task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected warehouse_inbound_pending, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowAccessoriesPurchaseModuleKey || task.SourceID != 66 {
		t.Fatalf("expected purchase arrival source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["qc_result"] != "pass" ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "inbound_pending" {
		t.Fatalf("expected warehouse inbound payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_PurchaseIQCRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            501,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "quality")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived warehouse inbound task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_PurchaseIQCBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_PurchaseIQCBlockedDerivesQualityExceptionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 来料破包 "},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "来料破包" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "来料破包" {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected IQC blocked side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "purchase_iqc_blocked_to_quality_exception" {
		t.Fatalf("expected IQC blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != PurchaseRoleKey ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "来料破包" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	assertPurchaseQualityExceptionTask(t, effects.DerivedTask, "blocked", "来料破包")
}

func TestWorkflowUsecase_PurchaseIQCRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_PurchaseIQCRejectedDerivesQualityExceptionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "rejected",
		Reason:        " 来料尺寸不符 ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "来料尺寸不符" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "来料尺寸不符" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != PurchaseRoleKey {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "purchase_iqc_rejected_to_quality_exception" {
		t.Fatalf("expected IQC rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	assertPurchaseQualityExceptionTask(t, effects.DerivedTask, "rejected", "来料尺寸不符")
}

func TestWorkflowUsecase_PurchaseIQCNonDerivedStatusKeepsOriginalBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseIQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            501,
		TaskStatusKey: "processing",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("processing should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("processing should not derive side effects")
	}
}
